const { z } = require('zod');
const Stripe = require('stripe');
const Bill = require('../../models/Bill');
const PaymentTransaction = require('../../models/PaymentTransaction');
const User = require('../../models/User');
const { sendPaymentReceipt } = require('../../services/mailer');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const configuredPaymentMethods = process.env.STRIPE_PAYMENT_METHODS
  ? process.env.STRIPE_PAYMENT_METHODS.split(',').map(method => method.trim()).filter(Boolean)
  : null;

const DEFAULT_PAYMENT_METHODS = ['card', 'link'];
const SUPPORTED_PAYMENT_METHODS = new Set((configuredPaymentMethods && configuredPaymentMethods.length
  ? configuredPaymentMethods
  : DEFAULT_PAYMENT_METHODS));

if (SUPPORTED_PAYMENT_METHODS.size === 0) {
  SUPPORTED_PAYMENT_METHODS.add('card');
}

const listBillsSchema = z.object({
  userId: z.string({ required_error: 'userId is required' }).min(1),
});

const checkoutSchema = z.object({
  userId: z.string({ required_error: 'userId is required' }).min(1),
  billId: z.string({ required_error: 'billId is required' }).min(1),
  successUrl: z.string({ required_error: 'successUrl is required' }).url('Invalid success URL'),
  cancelUrl: z.string({ required_error: 'cancelUrl is required' }).url('Invalid cancel URL'),
  paymentMethods: z.array(z.string()).optional(),
});

async function listBills(req, res, next) {
  try {
    const { userId } = listBillsSchema.parse(req.query);
    const bills = await Bill.find({ userId }).sort({ dueDate: 1 }).lean();
    const billIds = bills.map(bill => bill._id);

    const transactions = await PaymentTransaction.find({ billId: { $in: billIds } })
      .sort({ createdAt: -1 })
      .lean();

    const latestTransactionByBill = new Map();
    for (const tx of transactions) {
      const key = tx.billId.toString();
      if (!latestTransactionByBill.has(key)) {
        latestTransactionByBill.set(key, tx);
      }
    }

    const outstanding = [];
    const paid = [];

    let outstandingTotal = 0;
    let nextDueDate = null;

    for (const bill of bills) {
      const latestTransaction = latestTransactionByBill.get(bill._id.toString());
      if (latestTransaction) {
        bill.latestTransaction = latestTransaction;
      }

      if (bill.status === 'unpaid') {
        outstanding.push(bill);
        outstandingTotal += bill.amount || 0;
        if (!nextDueDate || (bill.dueDate && bill.dueDate < nextDueDate)) {
          nextDueDate = bill.dueDate;
        }
      } else if (bill.status === 'paid') {
        paid.push(bill);
      }
    }

    return res.json({
      ok: true,
      bills: {
        outstanding,
        paid,
      },
      summary: {
        outstandingTotal,
        nextDueDate,
        outstandingCount: outstanding.length,
        paidCount: paid.length,
      },
      supportedPaymentMethods: Array.from(SUPPORTED_PAYMENT_METHODS),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: error.issues?.[0]?.message || 'Invalid request', issues: error.issues });
    }
    return next(error);
  }
}

async function createCheckoutSession(req, res, next) {
  try {
    if (!stripe) {
      return res.status(500).json({ ok: false, message: 'Stripe is not configured' });
    }

    const payload = checkoutSchema.parse(req.body);
    const user = await User.findById(payload.userId).lean();
    if (!user) {
      return res.status(404).json({ ok: false, message: 'Resident not found' });
    }

    const bill = await Bill.findOne({ _id: payload.billId, userId: payload.userId });
    if (!bill) {
      return res.status(404).json({ ok: false, message: 'Bill not found' });
    }
    if (bill.status !== 'unpaid') {
      return res.status(400).json({ ok: false, message: 'This bill has already been processed' });
    }

    const lineItemDescription = bill.description || `Waste collection bill ${bill.invoiceNumber}`;

    const requestedMethods = Array.isArray(payload.paymentMethods) ? payload.paymentMethods : [];
    const unsupportedMethods = requestedMethods.filter(method => !SUPPORTED_PAYMENT_METHODS.has(method));
    if (unsupportedMethods.length) {
      return res.status(400).json({
        ok: false,
        message: `Unsupported payment method(s): ${unsupportedMethods.join(', ')}`,
        supportedMethods: Array.from(SUPPORTED_PAYMENT_METHODS),
      });
    }

    const paymentMethodTypes = requestedMethods.length
      ? requestedMethods
      : (SUPPORTED_PAYMENT_METHODS.has('card') ? ['card'] : Array.from(SUPPORTED_PAYMENT_METHODS));

    await PaymentTransaction.updateMany({ billId: bill._id, status: 'pending' }, {
      $set: {
        status: 'cancelled',
        failureReason: 'Superseded by a new checkout session',
      },
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      payment_method_types: paymentMethodTypes,
      success_url: payload.successUrl,
      cancel_url: payload.cancelUrl,
      line_items: [
        {
          price_data: {
            currency: (bill.currency || 'LKR').toLowerCase(),
            product_data: {
              name: lineItemDescription,
            },
            unit_amount: Math.round((bill.amount || 0) * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        billId: bill.id,
        userId: user._id.toString(),
      },
    });

    bill.stripeSessionId = session.id;
    await bill.save();

    await PaymentTransaction.create({
      billId: bill._id,
      userId: bill.userId,
      amount: bill.amount,
      currency: bill.currency || 'LKR',
      status: 'pending',
      stripeSessionId: session.id,
      paymentMethod: paymentMethodTypes[0],
      rawGatewayResponse: {
        requestedMethods: paymentMethodTypes,
      },
    });

    return res.json({
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: error.issues?.[0]?.message || 'Invalid request', issues: error.issues });
    }
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ ok: false, message: error.message });
    }
    return next(error);
  }
}

async function syncCheckoutSession(req, res, next) {
  try {
    if (!stripe) {
      return res.status(500).json({ ok: false, message: 'Stripe is not configured' });
    }

    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(req.params);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'payment_intent.payment_method', 'payment_intent.charges.data'],
    });

    const transaction = await PaymentTransaction.findOne({ stripeSessionId: sessionId });
    const bill = transaction ? await Bill.findById(transaction.billId) : await Bill.findOne({ stripeSessionId: sessionId });

    if (!session) {
      return res.status(404).json({ ok: false, message: 'Checkout session not found' });
    }

    if (!transaction || !bill) {
      return res.json({ ok: true, data: session, message: 'Session synced but no matching bill was found' });
    }

    const paymentIntent = session.payment_intent;
    const paymentIntentId = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id;
    const paymentMethodType = typeof paymentIntent === 'object'
      ? paymentIntent?.payment_method_types?.[0]
      : transaction.paymentMethod;

    const charges = typeof paymentIntent === 'object' ? paymentIntent?.charges?.data || [] : [];
    const primaryCharge = charges[0];
    const stripeReceiptUrl = primaryCharge?.receipt_url;
    const chargeStatus = primaryCharge?.status;

    let status = 'pending';
    if (session.status === 'canceled') {
      status = 'cancelled';
    } else if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
      status = 'success';
    } else if (session.payment_status === 'unpaid' && session.status === 'open') {
      status = 'pending';
    } else if (chargeStatus === 'failed') {
      status = 'failed';
    } else {
      status = 'failed';
    }

    transaction.status = status;
    transaction.stripePaymentIntentId = paymentIntentId;
    transaction.paymentMethod = paymentMethodType || transaction.paymentMethod;
    transaction.receiptUrl = stripeReceiptUrl || transaction.receiptUrl;
    transaction.rawGatewayResponse = {
      paymentStatus: session.payment_status,
      sessionStatus: session.status,
      lastChargeStatus: chargeStatus,
    };

    if (status === 'failed') {
      transaction.failureReason = primaryCharge?.failure_message || 'Payment unsuccessful';
    }
    if (status === 'cancelled') {
      transaction.failureReason = 'Checkout session cancelled by resident';
    }

    await transaction.save();

    if (status === 'success' && bill.status !== 'paid') {
      bill.status = 'paid';
      bill.paidAt = new Date();
      bill.paymentMethod = transaction.paymentMethod;
      bill.stripePaymentIntentId = transaction.stripePaymentIntentId;
      await bill.save();

      try {
        const resident = await User.findById(bill.userId).lean();
        if (resident) {
          await sendPaymentReceipt({ resident, bill, transaction });
        }
      } catch (emailError) {
        console.warn('⚠️ Failed to send payment receipt email', emailError);
      }
    }

    return res.json({
      ok: true,
      data: {
        paymentStatus: status,
        amountTotal: session.amount_total,
        currency: session.currency,
        billId: bill.id,
        transactionId: transaction.id,
        receiptUrl: transaction.receiptUrl,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: error.issues?.[0]?.message || 'Invalid request' });
    }
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ ok: false, message: error.message });
    }
    return next(error);
  }
}

async function getReceipt(req, res, next) {
  try {
    const params = z.object({ transactionId: z.string().min(1) }).parse(req.params);
    const query = z.object({ userId: z.string().min(1) }).parse(req.query);

    const transaction = await PaymentTransaction.findOne({
      _id: params.transactionId,
      userId: query.userId,
    }).populate('billId').lean();

    if (!transaction) {
      return res.status(404).json({ ok: false, message: 'Receipt not found' });
    }

    const bill = transaction.billId;

    const receipt = {
      transactionId: transaction._id.toString(),
      billId: bill?._id?.toString() || transaction.billId.toString(),
      invoiceNumber: bill?.invoiceNumber,
      amount: transaction.amount,
      currency: transaction.currency || bill?.currency || 'LKR',
      status: transaction.status,
      paidAt: transaction.updatedAt,
      paymentMethod: transaction.paymentMethod,
      receiptUrl: transaction.receiptUrl,
      reference: transaction.stripePaymentIntentId || transaction.stripeSessionId,
    };

    return res.json({ ok: true, receipt });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: error.issues?.[0]?.message || 'Invalid request' });
    }
    return next(error);
  }
}

module.exports = {
  listBills,
  createCheckoutSession,
  syncCheckoutSession,
  getReceipt,
};
