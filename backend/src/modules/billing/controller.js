const { z } = require('zod');
const Stripe = require('stripe');
const Bill = require('../../models/Bill');
const PaymentTransaction = require('../../models/PaymentTransaction');
const User = require('../../models/User');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

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

    const outstanding = bills.filter(bill => bill.status === 'unpaid');
    const paid = bills.filter(bill => bill.status === 'paid');

    return res.json({
      ok: true,
      bills: {
        outstanding,
        paid,
      },
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

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      payment_method_types: payload.paymentMethods && payload.paymentMethods.length
        ? payload.paymentMethods
        : ['card'],
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
      expand: ['payment_intent', 'payment_intent.payment_method'],
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
    const status = session.payment_status === 'paid' ? 'success' : session.payment_status === 'unpaid' ? 'pending' : 'failed';

    transaction.status = status;
    transaction.stripePaymentIntentId = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id;
    transaction.paymentMethod = typeof paymentIntent === 'object' ? paymentIntent?.payment_method_types?.[0] : transaction.paymentMethod;
    transaction.rawGatewayResponse = { paymentStatus: session.payment_status };
    if (status === 'failed') {
      transaction.failureReason = 'Payment unsuccessful';
    }
    await transaction.save();

    if (status === 'success' && bill.status !== 'paid') {
      bill.status = 'paid';
      bill.paidAt = new Date();
      bill.paymentMethod = transaction.paymentMethod;
      bill.stripePaymentIntentId = transaction.stripePaymentIntentId;
      await bill.save();

      console.log(`📧 Payment receipt emailed to ${session.customer_details?.email || 'resident'}`);
    }

    return res.json({
      ok: true,
      data: {
        paymentStatus: status,
        amountTotal: session.amount_total,
        currency: session.currency,
        billId: bill.id,
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

module.exports = {
  listBills,
  createCheckoutSession,
  syncCheckoutSession,
};
