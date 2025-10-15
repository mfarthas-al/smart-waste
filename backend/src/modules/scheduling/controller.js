const { z } = require('zod');
const User = require('../../models/User');
const SpecialCollectionRequest = require('../../models/SpecialCollectionRequest');
const SpecialCollectionPayment = require('../../models/SpecialCollectionPayment');
const {
  sendSpecialCollectionConfirmation,
  notifyAuthorityOfSpecialPickup,
} = require('../../services/mailer');

const allowedItems = [
  {
    id: 'furniture',
    label: 'Furniture & bulky items',
    description: 'Wardrobes, sofas, tables, mattresses and similar bulky household items.',
    allow: true,
    policy: { includedQuantity: 2, feePerExtraItem: 500 },
  },
  {
    id: 'e-waste',
    label: 'Electronic waste',
    description: 'Televisions, refrigerators, computers, microwaves and other electrical items.',
    allow: true,
    policy: { baseFee: 1500, feePerAdditionalItem: 750 },
  },
  {
    id: 'yard',
    label: 'Garden trimmings',
    description: 'Branches, palm fronds, and bundled yard waste (max 25kg per bundle).',
    allow: true,
    policy: { includedQuantity: 5, feePerExtraItem: 200 },
  },
  {
    id: 'construction',
    label: 'Construction rubble',
    description: 'Bricks, concrete, tiles and other construction debris must be handled via licensed private haulers (hotline: 1919).',
    allow: false,
  },
];

const SLOT_CONFIG = {
  startHour: 8,
  endHour: 17,
  durationMinutes: 120,
  maxRequestsPerSlot: 3,
  lookAheadDays: 5,
  timezone: 'Asia/Colombo',
};

const availabilitySchema = z.object({
  userId: z.string().min(1, 'User id is required'),
  itemType: z.string().min(1, 'Item type is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  preferredDateTime: z.string().datetime().or(z.date()),
});

const bookingSchema = availabilitySchema.extend({
  slotId: z.string().min(1, 'Slot id is required'),
  paymentReference: z.string().optional(),
  paymentStatus: z.enum(['success', 'failed']).optional(),
});

const listSchema = z.object({
  userId: z.string().min(1, 'User id is required'),
});

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

function calculatePayment(itemPolicy, quantity) {
  if (!itemPolicy?.policy) {
    return { required: false, amount: 0 };
  }
  const { baseFee = 0, includedQuantity = 0, feePerExtraItem = 0, feePerAdditionalItem = 0 } = itemPolicy.policy;
  let amount = baseFee;
  if (includedQuantity && quantity > includedQuantity) {
    amount += (quantity - includedQuantity) * (feePerExtraItem || feePerAdditionalItem || 0);
  }
  if (!includedQuantity && feePerAdditionalItem && quantity > 1) {
    amount += (quantity - 1) * feePerAdditionalItem;
  }
  return { required: amount > 0 || Boolean(baseFee), amount };
}

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

async function getConfig(_req, res) {
  return res.json({
    ok: true,
    items: allowedItems,
    slotConfig: SLOT_CONFIG,
  });
}

async function checkAvailability(req, res, next) {
  try {
    const payload = availabilitySchema.parse(req.body);
    const user = await resolveUser(payload.userId);

    const policy = findItemPolicy(payload.itemType);
    if (!policy) {
      return res.status(400).json({ ok: false, message: 'Unknown item type requested.' });
    }
    if (!policy.allow) {
      return res.status(400).json(buildDisallowedResponse(policy));
    }

    const preferred = toDate(payload.preferredDateTime);
    if (Number.isNaN(preferred.getTime())) {
      return res.status(400).json({ ok: false, message: 'Preferred date/time is invalid.' });
    }

    const candidates = generateCandidateSlots(preferred, SLOT_CONFIG);
    const availableSlots = await attachAvailability(candidates);
    const payment = calculatePayment(policy, payload.quantity);

    return res.json({
      ok: true,
      user: { id: user._id, name: user.name, email: user.email },
      policy,
      payment,
      slots: availableSlots,
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
    return next(error);
  }
}

async function confirmBooking(req, res, next) {
  try {
    const payload = bookingSchema.parse(req.body);
    const user = await resolveUser(payload.userId);
    const policy = findItemPolicy(payload.itemType);

    if (!policy) {
      return res.status(400).json({ ok: false, message: 'Unknown item type requested.' });
    }
    if (!policy.allow) {
      return res.status(400).json(buildDisallowedResponse(policy));
    }

    const preferred = toDate(payload.preferredDateTime);
    if (Number.isNaN(preferred.getTime())) {
      return res.status(400).json({ ok: false, message: 'Preferred date/time is invalid.' });
    }

    const payment = calculatePayment(policy, payload.quantity);

    if (payment.required && payload.paymentStatus !== 'success') {
      return res.status(402).json({ ok: false, message: 'Payment failed. The pickup was not scheduled.' });
    }

    const slotCandidates = generateCandidateSlots(preferred, SLOT_CONFIG);
    const slot = slotCandidates.find(candidate => candidate.slotId === payload.slotId);
    if (!slot) {
      return res.status(400).json({ ok: false, message: 'Selected slot is no longer available.' });
    }

    const existing = await SpecialCollectionRequest.countDocuments({
      'slot.slotId': slot.slotId,
      status: { $in: ['scheduled', 'pending-payment'] },
    });
    if (existing >= SLOT_CONFIG.maxRequestsPerSlot) {
      return res.status(409).json({ ok: false, message: 'This slot has just been booked. Please choose another slot.' });
    }

    const requestDoc = await SpecialCollectionRequest.create({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      itemType: payload.itemType,
      quantity: payload.quantity,
      preferredDateTime: preferred,
      slot,
      status: 'scheduled',
      paymentRequired: payment.required,
      paymentStatus: payment.required ? 'success' : 'not-required',
      paymentAmount: payment.amount,
      paymentReference: payment.required ? payload.paymentReference : undefined,
      notifications: {},
    });

    if (payment.required) {
      await SpecialCollectionPayment.create({
        requestId: requestDoc._id,
        userId: user._id,
        amount: payment.amount,
        status: 'success',
        reference: payload.paymentReference || `PAY-${Date.now()}`,
        provider: 'internal-simulator',
        metadata: { itemType: payload.itemType, quantity: payload.quantity },
      });
    }

    try {
      const [residentNotice, authorityNotice] = await Promise.all([
        sendSpecialCollectionConfirmation({
          resident: { email: user.email, name: user.name },
          slot,
          request: requestDoc,
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
        if (!requestDoc.notifications) {
          requestDoc.notifications = {};
        }
        Object.assign(requestDoc.notifications, notificationUpdates);
      }
    } catch (notificationError) {
      console.warn('⚠️ Special collection notifications error', notificationError);
    }

    return res.status(201).json({
      ok: true,
      message: 'Special collection scheduled successfully. You will receive a confirmation email shortly.',
      request: requestDoc,
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
    return next(error);
  }
}

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

module.exports = {
  getConfig,
  checkAvailability,
  confirmBooking,
  listUserRequests,
};
