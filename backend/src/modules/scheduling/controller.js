const { z } = require('zod');
const Stripe = require('stripe');
const User = require('../../models/User');
const SpecialCollectionRequest = require('../../models/SpecialCollectionRequest');
const SpecialCollectionPayment = require('../../models/SpecialCollectionPayment');
const Bill = require('../../models/Bill');
const {
  sendSpecialCollectionConfirmation,
  notifyAuthorityOfSpecialPickup,
  sanitizeMetadata,
} = require('../../services/mailer');
const { generateSpecialCollectionReceipt } = require('./receipt');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// Ensures every error response shares a predictable envelope for the frontend.
const respondWithError = (res, status, message, extra = {}) => (
  res.status(status).json({ ok: false, message, ...extra })
);

// Zod parser helper that narrows validation error handling to one place.
const handleZodError = (res, error) => respondWithError(res, 400, error.errors[0].message);

// Catalogue of supported item types with rate card details.
const allowedItems = [
  {
    id: 'furniture',
    label: 'Furniture & bulky items',
    description: 'Wardrobes, sofas, tables, mattresses and similar bulky household items.',
    allow: true,
    policy: {
      includedQuantity: 2,
      feePerExtraItem: 500,
      includedWeightKgPerItem: 25,
      ratePerKg: 45,
    },
  },
  {
    id: 'e-waste',
    label: 'Electronic waste',
    description: 'Televisions, refrigerators, computers, microwaves and other electrical items.',
    allow: true,
    policy: {
      baseFee: 1500,
      feePerAdditionalItem: 750,
      includedWeightKgPerItem: 10,
      ratePerKg: 95,
    },
  },
  {
    id: 'yard',
    label: 'Garden trimmings',
    description: 'Branches, palm fronds, and bundled yard waste (max 25kg per bundle).',
    allow: true,
    policy: {
      includedQuantity: 5,
      feePerExtraItem: 200,
      includedWeightKgPerItem: 15,
      ratePerKg: 30,
    },
  },
  {
    id: 'construction',
    label: 'Construction rubble',
    description: 'Bricks, concrete, tiles and other construction debris must be handled via licensed private haulers (hotline: 1919).',
    allow: false,
  },
];

// Slot generation parameters centralised for consistency across flows.
const SLOT_CONFIG = {
  startHour: 8,
  endHour: 17,
  durationMinutes: 120,
  maxRequestsPerSlot: 3,
  lookAheadDays: 5,
  timezone: 'Asia/Colombo',
};

const TAX_RATE = 0.03; // 3% municipal service levy

// Freeze configuration objects to avoid accidental mutation at runtime.
allowedItems.forEach(item => {
  if (item.policy) {
    Object.freeze(item.policy);
  }
  Object.freeze(item);
});
Object.freeze(allowedItems);
Object.freeze(SLOT_CONFIG);

const approxWeightSchema = z.union([
  z.number().positive('Approximate weight must be greater than zero'),
  z.null(),
  z.undefined(),
]);

const residentDetailsSchema = {
  residentName: z.string().min(1, 'Resident name is required'),
  ownerName: z.string().min(1, "Owner's name is required"),
  address: z.string().min(1, 'Address is required'),
  district: z.string().min(1, 'District is required'),
  email: z.string().email('A valid email is required'),
  phone: z.string().min(7, 'A valid phone number is required'),
  approxWeight: approxWeightSchema,
  specialNotes: z.string().max(1000).optional(),
};

const availabilitySchema = z.object({
  userId: z.string().min(1, 'User id is required'),
  itemType: z.string().min(1, 'Item type is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  preferredDateTime: z.string().datetime().or(z.date()),
}).extend(residentDetailsSchema);

const bookingSchema = availabilitySchema.extend({
  slotId: z.string().min(1, 'Slot id is required'),
  paymentReference: z.string().optional(),
  paymentStatus: z.enum(['success', 'failed', 'pending']).optional(),
  deferPayment: z.boolean().optional(),
});

const listSchema = z.object({
  userId: z.string().min(1, 'User id is required'),
});

const checkoutInitSchema = availabilitySchema.extend({
  slotId: z.string().min(1, 'Slot id is required'),
  successUrl: z.string().url('Success URL must be a valid URL'),
  cancelUrl: z.string().url('Cancel URL must be a valid URL'),
});

// Looks up the pricing policy for a given special collection category.
function findItemPolicy(itemType) {
  return allowedItems.find(item => item.id === itemType);
}

function buildDisallowedResponse(policy) {
  return {
    ok: false,
    code: 'ITEM_NOT_ALLOWED',
    message: `${policy.label} cannot be collected via the municipal special pickup programme. ${policy.description}`,
    disposalInfo: policy.description,
  };
}

function toDate(value) {
  if (value instanceof Date) return value;
  return new Date(value);
}

function normaliseDate(date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

function slotIdFor(date) {
  return normaliseDate(date).toISOString();
}

// Builds the rolling window of slots a resident can choose from based on config.
function generateCandidateSlots(preferred, { lookAheadDays, startHour, endHour, durationMinutes }) {
  const slots = [];
  const startDay = new Date(preferred);
  startDay.setHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < lookAheadDays; dayOffset += 1) {
    const day = new Date(startDay);
    day.setDate(startDay.getDate() + dayOffset);

    for (let minutes = startHour * 60; minutes < endHour * 60; minutes += durationMinutes) {
      const slotStart = new Date(day);
      slotStart.setMinutes(minutes, 0, 0);

      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotStart.getMinutes() + durationMinutes);

      slots.push({
        slotId: slotIdFor(slotStart),
        start: slotStart,
        end: slotEnd,
      });
    }
  }
  return slots;
}

function getPreferredDayBounds(preferred) {
  const preferredDayStart = new Date(preferred);
  preferredDayStart.setHours(0, 0, 0, 0);
  const preferredDayEnd = new Date(preferredDayStart);
  preferredDayEnd.setDate(preferredDayEnd.getDate() + 1);
  return { preferredDayStart, preferredDayEnd };
}

// Restricts slots to the resident's chosen day while ignoring past windows.
function filterCandidatesForPreferredDay(candidates, preferred, now = new Date()) {
  const { preferredDayStart, preferredDayEnd } = getPreferredDayBounds(preferred);
  return candidates.filter(candidate => (
    candidate.start >= preferredDayStart
    && candidate.start < preferredDayEnd
    && candidate.end > now
  ));
}

// Annotates slot candidates with remaining capacity and drops full entries.
async function attachAvailability(slots) {
  const results = [];
  for (const slot of slots) {
    const count = await SpecialCollectionRequest.countDocuments({
      'slot.slotId': slot.slotId,
      status: { $in: ['scheduled', 'pending-payment'] },
    });
    const capacityLeft = Math.max(SLOT_CONFIG.maxRequestsPerSlot - count, 0);
    results.push({
      ...slot,
      capacityLeft,
      isAvailable: capacityLeft > 0,
    });
  }
  return results.filter(slot => slot.isAvailable);
}

function toPositiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

// Computes the payable amount, breaking out weight-based and base charges.
function calculatePayment(itemPolicy, quantity, approxWeightPerItemKg) {
  if (!itemPolicy?.policy) {
    return { required: false, amount: 0, totalWeightKg: 0, weightCharge: 0, baseCharge: 0 };
  }

  const {
    baseFee = 0,
    includedQuantity = 0,
    feePerExtraItem = 0,
    feePerAdditionalItem = 0,
    ratePerKg = 0,
    includedWeightKgPerItem = 0,
  } = itemPolicy.policy;

  const normalisedQuantity = Math.max(Number(quantity) || 0, 0);
  const weightPerItem = toPositiveNumber(approxWeightPerItemKg);
  const totalWeightKg = weightPerItem * normalisedQuantity;

  let amount = baseFee;

  if (includedQuantity && normalisedQuantity > includedQuantity) {
    amount += (normalisedQuantity - includedQuantity) * (feePerExtraItem || feePerAdditionalItem || 0);
  }
  if (!includedQuantity && feePerAdditionalItem && normalisedQuantity > 1) {
    amount += (normalisedQuantity - 1) * feePerAdditionalItem;
  }

  let weightCharge = 0;
  if (ratePerKg > 0 && totalWeightKg > 0) {
    const includedWeightTotal = toPositiveNumber(includedWeightKgPerItem) * normalisedQuantity;
    const billableWeight = Math.max(totalWeightKg - includedWeightTotal, 0);
    weightCharge = billableWeight * ratePerKg;
    amount += weightCharge;
  }

  const roundedWeightCharge = Math.round(weightCharge * 100) / 100;
  const baseChargeRaw = Math.max(amount - weightCharge, 0);
  const roundedBaseCharge = Math.round(baseChargeRaw * 100) / 100;

  const taxableBase = Math.max(roundedBaseCharge + roundedWeightCharge, 0);
  const taxChargeRaw = taxableBase * TAX_RATE;
  const roundedTaxCharge = Math.round(taxChargeRaw * 100) / 100;

  const roundedTotalWeight = Math.round(totalWeightKg * 10) / 10;
  const grossTotal = taxableBase + roundedTaxCharge;
  const roundedTotal = Math.round(grossTotal * 100) / 100;

  return {
    required: roundedTotal > 0,
    amount: roundedTotal,
    totalWeightKg: roundedTotalWeight,
    weightCharge: roundedWeightCharge,
    baseCharge: roundedBaseCharge,
    taxCharge: roundedTaxCharge,
  };
}

// Periodically cancels bookings that never completed payment before their slot.
async function expireOverduePendingRequests() {
  const now = new Date();
  const overdue = await SpecialCollectionRequest.find({
    status: 'pending-payment',
    'slot.start': { $lte: now },
  }).select({ _id: 1 });

  if (!overdue.length) {
    return;
  }

  const ids = overdue.map(doc => doc._id);
  await SpecialCollectionRequest.updateMany({ _id: { $in: ids } }, {
    $set: {
      status: 'cancelled',
      paymentStatus: 'failed',
      cancellationReason: 'Payment was not received before the scheduled time.',
    },
  });

  await Bill.updateMany({
    specialCollectionRequestId: { $in: ids },
    status: 'unpaid',
  }, {
    $set: { status: 'cancelled' },
  });
}

// Generates a human-readable invoice code tied to the request identifier.
function generateSpecialCollectionInvoiceNumber(requestId) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = requestId.toString().slice(-6).toUpperCase();
  return `SC-${datePart}-${suffix}`;
}

// Records a booking that still requires payment and issues an internal invoice.
async function createDeferredBooking({ user, payload, slot, payment, itemPolicy }) {
  const requestDoc = await SpecialCollectionRequest.create({
    userId: user._id,
    userEmail: user.email,
    userName: user.name,
    residentName: payload.residentName?.trim() || user.name,
    ownerName: payload.ownerName?.trim() || payload.residentName?.trim() || user.name,
    address: payload.address?.trim(),
    district: payload.district?.trim(),
    contactEmail: payload.email?.trim() || user.email,
    contactPhone: payload.phone?.trim(),
    approxWeightKg: typeof payload.approxWeight === 'number' && Number.isFinite(payload.approxWeight)
      ? payload.approxWeight
      : undefined,
    totalWeightKg: typeof payment.totalWeightKg === 'number' && Number.isFinite(payment.totalWeightKg)
      ? payment.totalWeightKg
      : undefined,
    specialNotes: payload.specialNotes?.trim(),
    itemType: payload.itemType,
    itemLabel: itemPolicy?.label,
    quantity: payload.quantity,
    preferredDateTime: toDate(payload.preferredDateTime),
    slot,
    status: 'pending-payment',
    paymentRequired: true,
    paymentStatus: 'pending',
    paymentAmount: payment.amount,
    paymentSubtotal: payment.baseCharge,
    paymentWeightCharge: payment.weightCharge,
    paymentTaxCharge: payment.taxCharge,
    paymentDueAt: slot.start,
    notifications: {},
  });

  const invoiceNumber = generateSpecialCollectionInvoiceNumber(requestDoc._id);
  const dueDate = slot.start ? new Date(slot.start) : new Date(payload.preferredDateTime);

  const bill = await Bill.create({
    userId: user._id,
    invoiceNumber,
    description: `Special collection pickup – ${itemPolicy?.label || payload.itemType}`,
    amount: payment.amount,
    currency: 'LKR',
    billingPeriodStart: slot.start,
    billingPeriodEnd: slot.end,
    generatedAt: new Date(),
    dueDate,
    category: 'special-collection',
    specialCollectionRequestId: requestDoc._id,
  });

  requestDoc.paymentReference = invoiceNumber;
  requestDoc.billingId = bill._id;
  await requestDoc.save();

  return { requestDoc, bill };
}

// Sends resident and authority notifications, capturing timestamps when successful.
async function dispatchBookingEmails({ user, requestDoc, slot, receiptBuffer, issuedAt }) {
  try {
    const [residentNotice, authorityNotice] = await Promise.all([
      sendSpecialCollectionConfirmation({
        resident: { email: user.email, name: user.name },
        slot,
        request: requestDoc,
        receipt: receiptBuffer
          ? {
              buffer: receiptBuffer,
              filename: `special-collection-receipt-${requestDoc._id}.pdf`,
              issuedAt,
            }
          : undefined,
      }).catch(error => {
        console.warn('⚠️ Failed to email resident about special collection', error);
        return { sent: false };
      }),
      notifyAuthorityOfSpecialPickup({ request: requestDoc, slot }).catch(error => {
        console.warn('⚠️ Failed to email authority about special collection', error);
        return { sent: false };
      }),
    ]);

    const notificationUpdates = {};
    if (residentNotice.sent) {
      notificationUpdates['notifications.residentSentAt'] = residentNotice.sentAt || new Date();
    }
    if (authorityNotice.sent) {
      notificationUpdates['notifications.authoritySentAt'] = authorityNotice.sentAt || new Date();
    }

    if (Object.keys(notificationUpdates).length) {
      await SpecialCollectionRequest.updateOne({ _id: requestDoc._id }, { $set: notificationUpdates });
      Object.assign(requestDoc.notifications, notificationUpdates);
    }
  } catch (notificationError) {
    console.warn('⚠️ Special collection notifications error', notificationError);
  }
}

const PENDING_PAYMENT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
// Background sweep keeps slot utilisation accurate when residents abandon checkout.
if (process.env.SCHEDULING_SWEEP_DISABLED !== 'true') {
  const sweepTimer = setInterval(() => {
    expireOverduePendingRequests().catch(error => {
      console.warn('⚠️ Failed to expire overdue pending-payment requests', error);
    });
  }, PENDING_PAYMENT_SWEEP_INTERVAL_MS);
  if (typeof sweepTimer.unref === 'function') {
    sweepTimer.unref();
  }
}

// Centralised scheduler that either confirms or defers a booking and triggers emails.
async function finaliseBooking({
  user,
  payload,
  slot,
  payment,
  paymentReference,
  paymentDoc,
  provider = 'internal',
  itemPolicy,
  deferPayment = false,
}) {
  await expireOverduePendingRequests();

  const existing = await SpecialCollectionRequest.countDocuments({
    'slot.slotId': slot.slotId,
    status: { $in: ['scheduled', 'pending-payment'] },
  });
  if (existing >= SLOT_CONFIG.maxRequestsPerSlot) {
    const error = new Error('This slot has just been booked. Please choose another slot.');
    error.code = 'SLOT_FULL';
    throw error;
  }

  if (deferPayment && payment.required) {
    const { requestDoc } = await createDeferredBooking({ user, payload, slot, payment, itemPolicy });
    await dispatchBookingEmails({ user, requestDoc, slot, receiptBuffer: null, issuedAt: new Date() });
    return requestDoc;
  }

  const requestDoc = await SpecialCollectionRequest.create({
    userId: user._id,
    userEmail: user.email,
    userName: user.name,
    residentName: payload.residentName?.trim() || user.name,
    ownerName: payload.ownerName?.trim() || payload.residentName?.trim() || user.name,
    address: payload.address?.trim(),
    district: payload.district?.trim(),
    contactEmail: payload.email?.trim() || user.email,
    contactPhone: payload.phone?.trim(),
    approxWeightKg: typeof payload.approxWeight === 'number' && Number.isFinite(payload.approxWeight)
      ? payload.approxWeight
      : undefined,
    totalWeightKg: typeof payment.totalWeightKg === 'number' && Number.isFinite(payment.totalWeightKg)
      ? payment.totalWeightKg
      : undefined,
    specialNotes: payload.specialNotes?.trim(),
    itemType: payload.itemType,
    itemLabel: itemPolicy?.label,
    quantity: payload.quantity,
    preferredDateTime: toDate(payload.preferredDateTime),
    slot,
    status: 'scheduled',
    paymentRequired: payment.required,
    paymentStatus: payment.required ? 'success' : 'not-required',
    paymentAmount: payment.amount,
    paymentSubtotal: payment.baseCharge,
    paymentWeightCharge: payment.weightCharge,
    paymentTaxCharge: payment.taxCharge,
    paymentReference,
    notifications: {},
  });

  const issuedAt = new Date();
  let receiptBuffer = null;

  if (payment.required) {
    try {
      receiptBuffer = await generateSpecialCollectionReceipt({
        request: requestDoc.toObject(),
        slot,
        issuedAt,
      });
    } catch (receiptError) {
      console.warn('⚠️ Failed to generate special collection receipt PDF', receiptError);
    }

    const paymentPayload = {
      requestId: requestDoc._id,
      userId: user._id,
      amount: payment.amount,
      currency: 'LKR',
      status: 'success',
      provider,
      reference: paymentReference,
      stripeSessionId: paymentDoc?.stripeSessionId,
      slotId: slot.slotId,
      metadata: {
        ...(paymentDoc?.metadata || {}),
        itemType: payload.itemType,
        itemLabel: itemPolicy?.label,
        quantity: payload.quantity,
        preferredDateTime: payload.preferredDateTime,
        residentName: payload.residentName,
        ownerName: payload.ownerName,
        address: payload.address,
        district: payload.district,
        email: payload.email,
        phone: payload.phone,
        approxWeight: payload.approxWeight,
        specialNotes: payload.specialNotes,
        totalWeightKg: payment.totalWeightKg,
        weightCharge: payment.weightCharge,
        baseCharge: payment.baseCharge,
        taxCharge: payment.taxCharge,
      },
    };

    if (paymentDoc) {
      await SpecialCollectionPayment.updateOne(
        { _id: paymentDoc._id },
        { $set: paymentPayload },
      );
    } else {
      await SpecialCollectionPayment.create(paymentPayload);
    }
  }

  await dispatchBookingEmails({ user, requestDoc, slot, receiptBuffer, issuedAt });

  return requestDoc;
}

// Fetches the resident profile while enforcing activation checks.
async function resolveUser(userId) {
  const user = await User.findById(userId).lean();
  if (!user) {
    const error = new Error('Resident account not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  if (!user.isActive) {
    const error = new Error('Resident account is inactive. Please contact support.');
    error.code = 'ACCOUNT_INACTIVE';
    throw error;
  }
  return user;
}

// Supplies the FE with static config such as allowed items and slot window.
async function getConfig(_req, res) {
  return res.json({
    ok: true,
    items: allowedItems,
    slotConfig: SLOT_CONFIG,
  });
}

// Validates a resident's request and returns viable slots plus pricing.
async function checkAvailability(req, res, next) {
  try {
    const payload = availabilitySchema.parse(req.body);
    const user = await resolveUser(payload.userId);

    const policy = findItemPolicy(payload.itemType);
    if (!policy) {
      return respondWithError(res, 400, 'Unknown item type requested.');
    }
    if (!policy.allow) {
      return res.status(400).json(buildDisallowedResponse(policy));
    }

    const preferred = toDate(payload.preferredDateTime);
    if (Number.isNaN(preferred.getTime())) {
      return respondWithError(res, 400, 'Preferred date/time is invalid.');
    }

    const candidates = generateCandidateSlots(preferred, SLOT_CONFIG);
    const availableSlots = await attachAvailability(
      filterCandidatesForPreferredDay(candidates, preferred),
    );
    const payment = calculatePayment(policy, payload.quantity, payload.approxWeight);

    return res.json({
      ok: true,
      user: { id: user._id, name: user.name, email: user.email },
      policy,
      payment,
      slots: availableSlots,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleZodError(res, error);
    }
    if (error.code === 'USER_NOT_FOUND') {
      return respondWithError(res, 404, error.message);
    }
    if (error.code === 'ACCOUNT_INACTIVE') {
      return respondWithError(res, 403, error.message);
    }
    return next(error);
  }
}

// Finalises a booking coming from the resident portal (with or without payment).
async function confirmBooking(req, res, next) {
  try {
    const payload = bookingSchema.parse(req.body);
    const user = await resolveUser(payload.userId);
    const policy = findItemPolicy(payload.itemType);

    if (!policy) {
      return respondWithError(res, 400, 'Unknown item type requested.');
    }
    if (!policy.allow) {
      return res.status(400).json(buildDisallowedResponse(policy));
    }

    const preferred = toDate(payload.preferredDateTime);
    if (Number.isNaN(preferred.getTime())) {
      return respondWithError(res, 400, 'Preferred date/time is invalid.');
    }

    const payment = calculatePayment(policy, payload.quantity, payload.approxWeight);
    const deferPayment = Boolean(payload.deferPayment) && payment.required;

    if (payment.required && !deferPayment && payload.paymentStatus !== 'success') {
      return respondWithError(res, 402, 'Payment failed. The pickup was not scheduled.');
    }

    const slotCandidates = generateCandidateSlots(preferred, SLOT_CONFIG);
    const sameDayCandidates = filterCandidatesForPreferredDay(slotCandidates, preferred);
    const slot = sameDayCandidates.find(candidate => candidate.slotId === payload.slotId);
    if (!slot) {
      return respondWithError(res, 400, 'Selected slot is no longer available.');
    }

    const bookingDetails = {
      itemType: payload.itemType,
      quantity: payload.quantity,
      preferredDateTime: payload.preferredDateTime,
      residentName: payload.residentName,
      ownerName: payload.ownerName,
      address: payload.address,
      district: payload.district,
      email: payload.email,
      phone: payload.phone,
      approxWeight: payload.approxWeight ?? undefined,
      specialNotes: payload.specialNotes,
    };

    const requestDoc = await finaliseBooking({
      user,
      payload: bookingDetails,
      slot,
      payment,
      paymentReference: payment.required && !deferPayment
        ? (payload.paymentReference || `PAY-${Date.now()}`)
        : undefined,
      paymentDoc: null,
      provider: 'internal-simulator',
      itemPolicy: policy,
      deferPayment,
    });

    return res.status(201).json({
      ok: true,
      message: deferPayment
        ? 'Special collection booking reserved. Payment is due before the scheduled time or the slot will be cancelled.'
        : 'Special collection scheduled successfully. You will receive a confirmation email shortly.',
      request: requestDoc,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleZodError(res, error);
    }
    if (error.code === 'USER_NOT_FOUND') {
      return respondWithError(res, 404, error.message);
    }
    if (error.code === 'ACCOUNT_INACTIVE') {
      return respondWithError(res, 403, error.message);
    }
    if (error.code === 'SLOT_FULL') {
      await SpecialCollectionPayment.updateOne({ stripeSessionId: req.params.sessionId }, {
        $set: { status: 'failed', reference: req.params.sessionId },
      });
      return respondWithError(res, 409, error.message);
    }
    return next(error);
  }
}

// Initiates Stripe checkout for bookings that require upfront payment.
async function startCheckout(req, res, next) {
  try {
    if (!stripe) {
      return respondWithError(res, 503, 'Online payments are currently unavailable.');
    }

    const payload = checkoutInitSchema.parse(req.body);
    const user = await resolveUser(payload.userId);

    const policy = findItemPolicy(payload.itemType);
    if (!policy) {
      return respondWithError(res, 400, 'Unknown item type requested.');
    }
    if (!policy.allow) {
      return res.status(400).json(buildDisallowedResponse(policy));
    }

    const preferred = toDate(payload.preferredDateTime);
    if (Number.isNaN(preferred.getTime())) {
      return respondWithError(res, 400, 'Preferred date/time is invalid.');
    }

    const payment = calculatePayment(policy, payload.quantity, payload.approxWeight);
    if (!payment.required) {
      return res.json({ ok: true, paymentRequired: false });
    }

    const slotCandidates = generateCandidateSlots(preferred, SLOT_CONFIG);
    const sameDayCandidates = filterCandidatesForPreferredDay(slotCandidates, preferred);
    const slot = sameDayCandidates.find(candidate => candidate.slotId === payload.slotId);
    if (!slot) {
      return respondWithError(res, 400, 'Selected slot is no longer available.');
    }

    const existing = await SpecialCollectionRequest.countDocuments({
      'slot.slotId': slot.slotId,
      status: { $in: ['scheduled', 'pending-payment'] },
    });
    const pendingPayments = await SpecialCollectionPayment.countDocuments({ slotId: slot.slotId, status: 'pending' });
    if (existing + pendingPayments >= SLOT_CONFIG.maxRequestsPerSlot) {
      return respondWithError(res, 409, 'This slot has just been booked. Please choose another slot.');
    }

    const metadata = sanitizeMetadata({
      userId: user._id.toString(),
      itemType: payload.itemType,
      itemLabel: policy.label,
      quantity: String(payload.quantity),
      preferredDateTime: preferred.toISOString(),
      slotId: slot.slotId,
      residentName: payload.residentName,
      ownerName: payload.ownerName,
      address: payload.address,
      district: payload.district,
      email: payload.email,
      phone: payload.phone,
      approxWeight: payload.approxWeight != null ? String(payload.approxWeight) : undefined,
      totalWeightKg: payment.totalWeightKg != null ? String(payment.totalWeightKg) : undefined,
      weightCharge: payment.weightCharge != null ? String(payment.weightCharge) : undefined,
      baseCharge: payment.baseCharge != null ? String(payment.baseCharge) : undefined,
      taxCharge: payment.taxCharge != null ? String(payment.taxCharge) : undefined,
      specialNotes: payload.specialNotes,
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      success_url: payload.successUrl,
      cancel_url: payload.cancelUrl,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'lkr',
            product_data: {
              name: `Special waste collection – ${policy.label}`,
            },
            unit_amount: Math.round(payment.amount * 100),
          },
          quantity: 1,
        },
      ],
      metadata,
    });

    const paymentDoc = await SpecialCollectionPayment.create({
      userId: user._id,
      amount: payment.amount,
      currency: 'LKR',
      status: 'pending',
      provider: 'stripe',
      reference: undefined,
      stripeSessionId: session.id,
      slotId: slot.slotId,
      metadata,
    });

    return res.json({
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.id,
      paymentId: paymentDoc._id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: error.errors[0].message });
    }
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ ok: false, message: error.message });
    }
    if (error.code === 'ACCOUNT_INACTIVE') {
      return res.status(403).json({ ok: false, message: error.message });
    }
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ ok: false, message: error.message });
    }
    return next(error);
  }
}

// Reconciles the Stripe session outcome and, when successful, finalises the booking.
async function syncCheckout(req, res, next) {
  try {
    if (!stripe) {
      return res.status(503).json({ ok: false, message: 'Online payments are currently unavailable.' });
    }

    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(req.params);
    const { status: redirectStatus } = z.object({ status: z.enum(['success', 'cancelled']).optional() }).parse(req.query);

    const paymentDoc = await SpecialCollectionPayment.findOne({ stripeSessionId: sessionId });
    if (!paymentDoc) {
      return res.status(404).json({ ok: false, message: 'Checkout session not found. Please retry your booking.' });
    }

    if (paymentDoc.status === 'success' && paymentDoc.requestId) {
      const existingRequest = await SpecialCollectionRequest.findById(paymentDoc.requestId).lean();
      return res.json({ ok: true, status: 'success', request: existingRequest });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'payment_intent.charges.data'],
    });

    const paymentIntent = typeof session.payment_intent === 'string'
      ? await stripe.paymentIntents.retrieve(session.payment_intent)
      : session.payment_intent;

    const intentStatus = paymentIntent?.status;
    const paymentSucceeded = session.payment_status === 'paid' || intentStatus === 'succeeded';
    const paymentFailed = redirectStatus === 'cancelled'
      || intentStatus === 'canceled'
      || intentStatus === 'requires_payment_method'
      || session.status === 'expired';

    const metadata = {
      ...(paymentDoc.metadata || {}),
      ...(session.metadata || {}),
    };

    const quantityValue = Number(metadata.quantity || metadata.qty || 0);
    const payload = {
      itemType: metadata.itemType,
      quantity: quantityValue,
      preferredDateTime: metadata.preferredDateTime,
      residentName: metadata.residentName,
      ownerName: metadata.ownerName,
      address: metadata.address,
      district: metadata.district,
      email: metadata.email,
      phone: metadata.phone,
      approxWeight: metadata.approxWeight ? Number(metadata.approxWeight) : undefined,
      specialNotes: metadata.specialNotes,
    };

    if (
      !payload.itemType
      || Number.isNaN(payload.quantity)
      || payload.quantity < 1
      || !payload.preferredDateTime
      || !metadata.slotId
  || !payload.residentName
  || !payload.ownerName
      || !payload.address
      || !payload.district
      || !payload.email
      || !payload.phone
      || (payload.approxWeight !== undefined && (Number.isNaN(payload.approxWeight) || payload.approxWeight <= 0))
    ) {
      await SpecialCollectionPayment.updateOne({ _id: paymentDoc._id }, {
        $set: { status: 'failed', reference: paymentIntent?.id || sessionId },
      });
      return res.status(400).json({ ok: false, message: 'Incomplete payment metadata. Please start a new booking.' });
    }

    const preferred = toDate(payload.preferredDateTime);
    const policy = findItemPolicy(payload.itemType);
    if (!policy || !policy.allow) {
      await SpecialCollectionPayment.updateOne({ _id: paymentDoc._id }, {
        $set: { status: 'failed', reference: paymentIntent?.id || sessionId },
      });
      return res.status(400).json({ ok: false, message: 'The requested item type is not eligible for special collection.' });
    }

    const slotCandidates = generateCandidateSlots(preferred, SLOT_CONFIG);
    const slot = slotCandidates.find(candidate => candidate.slotId === metadata.slotId);
    if (!slot || slot.end <= new Date()) {
      await SpecialCollectionPayment.updateOne({ _id: paymentDoc._id }, {
        $set: { status: 'failed', reference: paymentIntent?.id || sessionId },
      });
      return res.status(409).json({ ok: false, message: 'The chosen slot is no longer available. Please select a new time.' });
    }

  const payment = calculatePayment(policy, payload.quantity, payload.approxWeight);

    if (!paymentSucceeded) {
      if (paymentFailed) {
        await SpecialCollectionPayment.updateOne({ _id: paymentDoc._id }, {
          $set: {
            status: 'failed',
            reference: paymentIntent?.id || sessionId,
          },
        });
        return res.status(402).json({ ok: false, message: 'Payment was not completed. Your pickup was not scheduled.' });
      }

      return res.json({ ok: true, status: 'pending', message: 'Payment is still pending confirmation. Please refresh in a moment.' });
    }

    const user = await resolveUser(paymentDoc.userId.toString());
    if (!payment.required) {
      await SpecialCollectionPayment.updateOne({ _id: paymentDoc._id }, {
        $set: {
          status: 'failed',
          reference: paymentIntent?.id || sessionId,
        },
      });
      return res.status(400).json({ ok: false, message: 'Payment metadata indicates zero amount. Please contact support.' });
    }
    const requestDoc = await finaliseBooking({
      user,
      payload,
      slot,
      payment,
      paymentReference: paymentIntent?.id || sessionId,
      paymentDoc,
      provider: 'stripe',
      itemPolicy: policy,
    });

    return res.json({
      ok: true,
      status: 'success',
      request: requestDoc,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleZodError(res, error);
    }
    if (error.code === 'USER_NOT_FOUND') {
      return respondWithError(res, 404, error.message);
    }
    if (error.code === 'ACCOUNT_INACTIVE') {
      return respondWithError(res, 403, error.message);
    }
    if (error.code === 'SLOT_FULL') {
      return respondWithError(res, 409, error.message);
    }
    if (error.type === 'StripeInvalidRequestError') {
      return respondWithError(res, 400, error.message);
    }
    return next(error);
  }
}

// Lists a resident's historical special collection requests in reverse chronology.
async function listUserRequests(req, res, next) {
  try {
    const { userId } = listSchema.parse(req.query);
    await resolveUser(userId);

    const requests = await SpecialCollectionRequest.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ ok: true, requests });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: error.errors[0].message });
    }
    if (error.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ ok: false, message: error.message });
    }
    if (error.code === 'ACCOUNT_INACTIVE') {
      return res.status(403).json({ ok: false, message: error.message });
    }
    return next(error);
  }
}

// Streams a PDF receipt for the requesting resident if they own the booking.
async function downloadReceipt(req, res, next) {
  try {
    const { requestId } = z.object({ requestId: z.string().min(1) }).parse(req.params);
    const { userId } = z.object({ userId: z.string().min(1) }).parse(req.query);

    await resolveUser(userId);

    const requestDoc = await SpecialCollectionRequest.findById(requestId).lean();
    if (!requestDoc) {
      return res.status(404).json({ ok: false, message: 'Receipt not found. Please refresh your bookings.' });
    }

    if (requestDoc.userId?.toString?.() !== userId) {
      return res.status(403).json({ ok: false, message: 'You are not authorised to download this receipt.' });
    }

    const buffer = await generateSpecialCollectionReceipt({
      request: requestDoc,
      slot: requestDoc.slot,
      issuedAt: new Date(),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="special-collection-receipt-${requestId}.pdf"`);
    return res.send(buffer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: error.errors[0]?.message || 'Invalid request' });
    }
    return next(error);
  }
}

module.exports = {
  getConfig,
  checkAvailability,
  confirmBooking,
  startCheckout,
  syncCheckout,
  listUserRequests,
  downloadReceipt,
};
