process.env.SCHEDULING_SWEEP_DISABLED = 'true'
process.env.STRIPE_SECRET_KEY = 'sk_test_key'

const mockStripeSessionsCreate = jest.fn()
const mockStripeSessionsRetrieve = jest.fn()
const mockStripePaymentIntentsRetrieve = jest.fn()

jest.mock('stripe', () => jest.fn(() => ({
  checkout: {
    sessions: {
      create: mockStripeSessionsCreate,
      retrieve: mockStripeSessionsRetrieve,
    },
  },
  paymentIntents: {
    retrieve: mockStripePaymentIntentsRetrieve,
  },
})))

jest.mock('../../../services/mailer', () => ({
  sendSpecialCollectionConfirmation: jest.fn(),
  notifyAuthorityOfSpecialPickup: jest.fn(),
}))

jest.mock('../receipt', () => ({
  generateSpecialCollectionReceipt: jest.fn(),
}))

jest.mock('../../../models/User', () => ({
  findById: jest.fn(),
}))

jest.mock('../../../models/SpecialCollectionRequest', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
  updateMany: jest.fn(),
  updateOne: jest.fn(),
}))

jest.mock('../../../models/SpecialCollectionPayment', () => ({
  create: jest.fn(),
  updateOne: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
}))

jest.mock('../../../models/Bill', () => ({
  create: jest.fn(),
  updateMany: jest.fn(),
}))

const Stripe = require('stripe')
const { sendSpecialCollectionConfirmation, notifyAuthorityOfSpecialPickup } = require('../../../services/mailer')
const { generateSpecialCollectionReceipt } = require('../receipt')
const User = require('../../../models/User')
const SpecialCollectionRequest = require('../../../models/SpecialCollectionRequest')
const SpecialCollectionPayment = require('../../../models/SpecialCollectionPayment')
const Bill = require('../../../models/Bill')
const controller = require('../controller')

const {
  getConfig,
  checkAvailability,
  confirmBooking,
  startCheckout,
  syncCheckout,
  listUserRequests,
  downloadReceipt,
} = controller

const SLOT_CONFIG = {
  startHour: 8,
  durationMinutes: 120,
  maxRequestsPerSlot: 3,
}

const buildSlotForPreferred = preferredIso => {
  const preferred = new Date(preferredIso)
  const startOfDay = new Date(preferred)
  startOfDay.setHours(0, 0, 0, 0)
  const slotStart = new Date(startOfDay)
  slotStart.setMinutes(SLOT_CONFIG.startHour * 60, 0, 0)
  const slotEnd = new Date(slotStart)
  slotEnd.setMinutes(slotStart.getMinutes() + SLOT_CONFIG.durationMinutes)
  return { slotId: slotStart.toISOString(), start: slotStart, end: slotEnd }
}

const defaultSlot = buildSlotForPreferred('2025-01-02T08:00:00.000Z')

const defaultUser = {
  _id: 'user-001',
  name: 'Resident One',
  email: 'resident@example.com',
  isActive: true,
}

const createRes = () => {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.send = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn()
  return res
}

const createFindQuery = ({ selectResult = [], sortResult = [], leanResult = [] } = {}) => ({
  select: jest.fn().mockResolvedValue(selectResult),
  sort: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(sortResult),
  }),
  lean: jest.fn().mockResolvedValue(leanResult),
})

const createRequestDoc = (overrides = {}) => {
  const plain = {
    _id: overrides._id || 'req-001',
    slot: overrides.slot || defaultSlot,
    userId: overrides.userId || defaultUser._id,
    itemType: overrides.itemType || 'furniture',
    itemLabel: overrides.itemLabel || 'Furniture & bulky items',
    quantity: overrides.quantity ?? 1,
    preferredDateTime: overrides.preferredDateTime || defaultSlot.start,
    paymentAmount: overrides.paymentAmount ?? 2500,
    paymentRequired: overrides.paymentRequired ?? true,
    paymentStatus: overrides.paymentStatus || 'success',
    notifications: overrides.notifications || {},
    address: overrides.address || '123 Sample Street',
    district: overrides.district || 'Colombo',
    residentName: overrides.residentName || 'Resident One',
    ownerName: overrides.ownerName || 'Owner One',
    contactEmail: overrides.contactEmail || defaultUser.email,
    contactPhone: overrides.contactPhone || '0771234567',
  }

  const doc = {
    ...plain,
    status: overrides.status || 'scheduled',
    paymentReference: overrides.paymentReference,
    billingId: overrides.billingId,
    toObject: jest.fn().mockReturnValue({ ...plain }),
    save: jest.fn().mockResolvedValue(undefined),
  }

  return doc
}

const resetMocks = () => {
  jest.clearAllMocks()

  mockStripeSessionsCreate.mockResolvedValue({ id: 'sess_123', url: 'https://checkout.example/123' })
  mockStripeSessionsRetrieve.mockResolvedValue({
    payment_status: 'unpaid',
    status: 'open',
    payment_intent: { id: 'pi_000', status: 'requires_payment_method' },
    metadata: {},
  })
  mockStripePaymentIntentsRetrieve.mockResolvedValue({ id: 'pi_000', status: 'requires_payment_method' })

  sendSpecialCollectionConfirmation.mockResolvedValue({ sent: true, sentAt: new Date() })
  notifyAuthorityOfSpecialPickup.mockResolvedValue({ sent: true, sentAt: new Date() })
  generateSpecialCollectionReceipt.mockResolvedValue(Buffer.from('PDF'))

  User.findById.mockImplementation(() => ({ lean: jest.fn().mockResolvedValue({ ...defaultUser }) }))

  SpecialCollectionRequest.find.mockImplementation(() => createFindQuery())
  SpecialCollectionRequest.findById.mockImplementation(id => ({
    lean: jest.fn().mockResolvedValue(createRequestDoc({ _id: id })),
  }))
  SpecialCollectionRequest.create.mockImplementation(() => createRequestDoc())
  SpecialCollectionRequest.countDocuments.mockResolvedValue(0)
  SpecialCollectionRequest.updateMany.mockResolvedValue({})
  SpecialCollectionRequest.updateOne.mockResolvedValue({})

  SpecialCollectionPayment.create.mockImplementation(() => ({ _id: 'pay-001', metadata: {} }))
  SpecialCollectionPayment.updateOne.mockResolvedValue({})
  SpecialCollectionPayment.findOne.mockResolvedValue(null)
  SpecialCollectionPayment.countDocuments.mockResolvedValue(0)

  Bill.create.mockResolvedValue({ _id: 'bill-001' })
  Bill.updateMany.mockResolvedValue({})
}

describe('scheduling controller', () => {
  let req
  let res
  let next
  let consoleErrorSpy
  let consoleWarnSpy

  beforeEach(() => {
    req = { body: {}, params: {}, query: {} }
    res = createRes()
    next = jest.fn()
    resetMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2025-01-01T04:00:00.000Z'))
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.useRealTimers()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('getConfig', () => {
    it('returns allowed items and slot config', async () => {
      await getConfig(req, res)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, items: expect.any(Array), slotConfig: expect.any(Object) }))
    })
  })

  describe('checkAvailability', () => {
    const basePayload = {
      userId: defaultUser._id,
      itemType: 'furniture',
      quantity: 2,
      preferredDateTime: defaultSlot.start.toISOString(),
      residentName: 'Resident One',
      ownerName: 'Owner One',
      address: '123 Sample Street',
      district: 'Colombo',
      email: 'resident@example.com',
      phone: '0771234567',
      approxWeight: 30,
    }

    it('returns available slots and payment breakdown', async () => {
      req.body = { ...basePayload }

      await checkAvailability(req, res, next)

      const response = res.json.mock.calls[0][0]
      expect(response.ok).toBe(true)
      expect(response.slots.length).toBeGreaterThan(0)
      expect(response.payment).toEqual(expect.objectContaining({ required: true, amount: expect.any(Number) }))
      expect(response.user).toMatchObject({ id: defaultUser._id })
    })

    it('rejects unknown item types', async () => {
      req.body = { ...basePayload, itemType: 'unknown' }

      await checkAvailability(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
    })

    it('rejects disallowed item categories', async () => {
      req.body = { ...basePayload, itemType: 'construction' }

      await checkAvailability(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ITEM_NOT_ALLOWED' }))
    })

    it('rejects invalid preferred date strings', async () => {
      req.body = { ...basePayload, preferredDateTime: 'not-a-date' }

      await checkAvailability(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid ISO datetime' }))
    })

    it('returns 404 when the resident account does not exist', async () => {
      User.findById.mockImplementationOnce(() => ({ lean: jest.fn().mockResolvedValue(null) }))
      req.body = { ...basePayload }

      await checkAvailability(req, res, next)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 403 when the resident account is inactive', async () => {
      User.findById.mockImplementationOnce(() => ({ lean: jest.fn().mockResolvedValue({ ...defaultUser, isActive: false }) }))
      req.body = { ...basePayload }

      await checkAvailability(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('surfaces validation issues from zod', async () => {
      req.body = { ...basePayload }
      delete req.body.userId

      await checkAvailability(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe('confirmBooking', () => {
    const bookingPayload = {
      userId: defaultUser._id,
      itemType: 'furniture',
      quantity: 2,
      preferredDateTime: defaultSlot.start.toISOString(),
      slotId: defaultSlot.slotId,
      residentName: 'Resident One',
      ownerName: 'Owner One',
      address: '123 Sample Street',
      district: 'Colombo',
      email: 'resident@example.com',
      phone: '0771234567',
      approxWeight: 30,
      paymentStatus: 'success',
    }

    it('schedules the booking when payment succeeded', async () => {
      req.body = { ...bookingPayload }

      const requestDoc = createRequestDoc()
      SpecialCollectionRequest.create.mockResolvedValueOnce(requestDoc)

      await confirmBooking(req, res, next)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, request: expect.objectContaining({ slot: expect.any(Object) }) }))
      expect(generateSpecialCollectionReceipt).toHaveBeenCalled()
    })

    it('reserves the slot when payment is deferred', async () => {
      req.body = { ...bookingPayload, paymentStatus: 'pending', deferPayment: true }

      const deferredDoc = createRequestDoc({ status: 'pending-payment', paymentStatus: 'pending' })
      SpecialCollectionRequest.create.mockResolvedValueOnce(deferredDoc)

      await confirmBooking(req, res, next)

      expect(res.status).toHaveBeenCalledWith(201)
      const payload = res.json.mock.calls[0][0]
      expect(payload.message).toContain('Payment is due before the scheduled time')
      expect(SpecialCollectionPayment.updateOne).not.toHaveBeenCalled()
    })

    it('rejects when payment failed and cannot be deferred', async () => {
      req.body = { ...bookingPayload, paymentStatus: 'failed' }

      await confirmBooking(req, res, next)

      expect(res.status).toHaveBeenCalledWith(402)
    })

    it('rejects when the slot no longer matches', async () => {
      req.body = { ...bookingPayload, slotId: 'invalid-slot' }

      await confirmBooking(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Selected slot is no longer available.' }))
    })

    it('rejects disallowed item categories', async () => {
      req.body = { ...bookingPayload, itemType: 'construction' }

      await confirmBooking(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe('startCheckout', () => {
    const checkoutPayload = {
      userId: defaultUser._id,
      itemType: 'furniture',
      quantity: 2,
      preferredDateTime: defaultSlot.start.toISOString(),
      slotId: defaultSlot.slotId,
      residentName: 'Resident One',
      ownerName: 'Owner One',
      address: '123 Sample Street',
      district: 'Colombo',
      email: 'resident@example.com',
      phone: '0771234567',
      approxWeight: 30,
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    }

    it('creates a Stripe checkout session when payment is required', async () => {
      req.body = { ...checkoutPayload }

      await startCheckout(req, res, next)

      expect(mockStripeSessionsCreate).toHaveBeenCalled()
      expect(SpecialCollectionPayment.create).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, checkoutUrl: expect.any(String), sessionId: expect.any(String) }))
    })

    it('short-circuits when no payment is required', async () => {
      req.body = { ...checkoutPayload, itemType: 'yard', approxWeight: null, quantity: 1 }

      await startCheckout(req, res, next)

      expect(res.json).toHaveBeenCalledWith({ ok: true, paymentRequired: false })
      expect(mockStripeSessionsCreate).not.toHaveBeenCalled()
    })

    it('handles a slot that has just reached capacity', async () => {
      SpecialCollectionRequest.countDocuments.mockResolvedValue(SLOT_CONFIG.maxRequestsPerSlot)
      req.body = { ...checkoutPayload }

      await startCheckout(req, res, next)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'This slot has just been booked. Please choose another slot.' }))
    })

    it('rejects unknown item types', async () => {
      req.body = { ...checkoutPayload, itemType: 'unknown' }

      await startCheckout(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 503 when Stripe integration is disabled', async () => {
      const originalKey = process.env.STRIPE_SECRET_KEY
      delete process.env.STRIPE_SECRET_KEY

      const payload = { ...checkoutPayload }
      const isolatedRes = createRes()
      const isolatedReq = { body: payload }

      await new Promise(resolve => {
        jest.isolateModules(() => {
          const isolatedController = require('../controller')
          isolatedController.startCheckout(isolatedReq, isolatedRes, next).then(resolve)
        })
      })

      expect(isolatedRes.status).toHaveBeenCalledWith(503)
      process.env.STRIPE_SECRET_KEY = originalKey
    })
  })

  describe('syncCheckout', () => {
    const metadata = {
      itemType: 'furniture',
      itemLabel: 'Furniture & bulky items',
      quantity: '2',
      preferredDateTime: defaultSlot.start.toISOString(),
      slotId: defaultSlot.slotId,
      residentName: 'Resident One',
      ownerName: 'Owner One',
      address: '123 Sample Street',
      district: 'Colombo',
      email: 'resident@example.com',
      phone: '0771234567',
      approxWeight: '30',
    }

    it('finalises the booking after a successful Stripe payment', async () => {
      req.params.sessionId = 'sess_123'
      req.query = { status: 'success' }

      SpecialCollectionPayment.findOne.mockResolvedValue({
        _id: 'pay-001',
        userId: defaultUser._id,
        status: 'pending',
        metadata,
        stripeSessionId: 'sess_123',
      })

      mockStripeSessionsRetrieve.mockResolvedValue({
        payment_status: 'paid',
        status: 'complete',
        payment_intent: { id: 'pi_123', status: 'succeeded' },
        metadata,
      })

      const requestDoc = createRequestDoc({ paymentReference: 'pi_123' })
      SpecialCollectionRequest.create.mockResolvedValueOnce(requestDoc)

      await syncCheckout(req, res, next)

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, status: 'success', request: expect.objectContaining({ paymentReference: 'pi_123' }) }))
      expect(SpecialCollectionPayment.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: 'pay-001' }), expect.any(Object))
    })

    it('returns pending when Stripe has not confirmed payment yet', async () => {
      req.params.sessionId = 'sess_123'
      SpecialCollectionPayment.findOne.mockResolvedValue({
        _id: 'pay-001',
        userId: defaultUser._id,
        status: 'pending',
        metadata,
        stripeSessionId: 'sess_123',
      })

        mockStripeSessionsRetrieve.mockResolvedValue({
        payment_status: 'unpaid',
        status: 'open',
        payment_intent: { id: 'pi_123', status: 'processing' },
        metadata,
      })
  mockStripePaymentIntentsRetrieve.mockResolvedValue({ id: 'pi_123', status: 'processing' })

      await syncCheckout(req, res, next)

      expect(res.json).toHaveBeenCalledWith({ ok: true, status: 'pending', message: expect.any(String) })
    })

    it('captures incomplete metadata and marks payment as failed', async () => {
      req.params.sessionId = 'sess_123'
      SpecialCollectionPayment.findOne.mockResolvedValue({
        _id: 'pay-001',
        userId: defaultUser._id,
        status: 'pending',
        metadata: {},
        stripeSessionId: 'sess_123',
      })

        mockStripeSessionsRetrieve.mockResolvedValue({
        payment_status: 'paid',
        status: 'complete',
        payment_intent: { id: 'pi_123', status: 'succeeded' },
        metadata: {},
      })

      await syncCheckout(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(SpecialCollectionPayment.updateOne).toHaveBeenCalledWith({ _id: 'pay-001' }, expect.objectContaining({ $set: expect.objectContaining({ status: 'failed' }) }))
    })

    it('reports slot contention during reconciliation', async () => {
      req.params.sessionId = 'sess_123'
      SpecialCollectionPayment.findOne.mockResolvedValue({
        _id: 'pay-001',
        userId: defaultUser._id,
        status: 'pending',
        metadata,
        stripeSessionId: 'sess_123',
      })

        mockStripeSessionsRetrieve.mockResolvedValue({
        payment_status: 'paid',
        status: 'complete',
        payment_intent: { id: 'pi_123', status: 'succeeded' },
        metadata,
      })

      SpecialCollectionRequest.countDocuments.mockResolvedValueOnce(SLOT_CONFIG.maxRequestsPerSlot)

      await syncCheckout(req, res, next)

      expect(res.status).toHaveBeenCalledWith(409)
    })

    it('returns previously confirmed request without duplicating work', async () => {
      req.params.sessionId = 'sess_123'
      SpecialCollectionPayment.findOne.mockResolvedValue({
        _id: 'pay-001',
        userId: defaultUser._id,
        status: 'success',
        metadata,
        requestId: 'req-001',
        stripeSessionId: 'sess_123',
      })

      const existing = createRequestDoc({ _id: 'req-001' })
      SpecialCollectionRequest.findById.mockImplementationOnce(() => ({ lean: jest.fn().mockResolvedValue(existing) }))

      await syncCheckout(req, res, next)

    expect(res.json).toHaveBeenCalledWith({ ok: true, status: 'success', request: existing })
    expect(mockStripeSessionsRetrieve).not.toHaveBeenCalled()
    })

    it('returns 503 when Stripe is disabled', async () => {
      const originalKey = process.env.STRIPE_SECRET_KEY
      delete process.env.STRIPE_SECRET_KEY

      const isolatedRes = createRes()
      const isolatedReq = { params: { sessionId: 'sess_123' }, query: {} }

      await new Promise(resolve => {
        jest.isolateModules(() => {
          const isolatedController = require('../controller')
          isolatedController.syncCheckout(isolatedReq, isolatedRes, next).then(resolve)
        })
      })

      expect(isolatedRes.status).toHaveBeenCalledWith(503)
      process.env.STRIPE_SECRET_KEY = originalKey
    })
  })

  describe('listUserRequests', () => {
    it('returns requests for the resident', async () => {
      const requests = [createRequestDoc({ _id: 'req-111' })]
      SpecialCollectionRequest.find.mockImplementationOnce(() => createFindQuery({ sortResult: requests }))
      req.query.userId = defaultUser._id

      await listUserRequests(req, res, next)

      expect(res.json).toHaveBeenCalledWith({ ok: true, requests })
    })

    it('returns 404 when user does not exist', async () => {
      User.findById.mockImplementationOnce(() => ({ lean: jest.fn().mockResolvedValue(null) }))
      req.query.userId = 'missing'

      await listUserRequests(req, res, next)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('validates the userId query parameter', async () => {
      await listUserRequests(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe('downloadReceipt', () => {
    it('streams a generated receipt when authorised', async () => {
      const requestDoc = createRequestDoc({ _id: 'req-777' })
      SpecialCollectionRequest.findById.mockImplementationOnce(() => ({ lean: jest.fn().mockResolvedValue(requestDoc) }))

      req.params.requestId = 'req-777'
      req.query.userId = defaultUser._id

      await downloadReceipt(req, res, next)

      expect(generateSpecialCollectionReceipt).toHaveBeenCalled()
      expect(res.setHeader).toHaveBeenNthCalledWith(1, 'Content-Type', 'application/pdf')
      expect(res.send).toHaveBeenCalledWith(expect.any(Buffer))
    })

    it('returns 404 when the request is missing', async () => {
      SpecialCollectionRequest.findById.mockImplementationOnce(() => ({ lean: jest.fn().mockResolvedValue(null) }))
      req.params.requestId = 'unknown'
      req.query.userId = defaultUser._id

      await downloadReceipt(req, res, next)

      expect(res.status).toHaveBeenCalledWith(404)
    })

    it('returns 403 when the resident does not own the request', async () => {
      const requestDoc = createRequestDoc({ userId: 'someone-else' })
      SpecialCollectionRequest.findById.mockImplementationOnce(() => ({ lean: jest.fn().mockResolvedValue(requestDoc) }))
      req.params.requestId = 'req-1'
      req.query.userId = defaultUser._id

      await downloadReceipt(req, res, next)

      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('validates the request id parameter', async () => {
      req.query.userId = defaultUser._id
      req.params.requestId = ''

      await downloadReceipt(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })
})
