/* eslint-disable global-require */

const stripeSessionsCreate = jest.fn();
const stripeSessionsRetrieve = jest.fn();
const stripePaymentIntentsRetrieve = jest.fn();

const stripeMockInstance = {
	checkout: {
		sessions: {
			create: stripeSessionsCreate,
			retrieve: stripeSessionsRetrieve,
		},
	},
	paymentIntents: {
		retrieve: stripePaymentIntentsRetrieve,
	},
};

const mockStripeConstructor = jest.fn(() => stripeMockInstance);

jest.mock('stripe', () => mockStripeConstructor);

const mockUserModel = {
	findById: jest.fn(),
};
jest.mock('../../../models/User', () => mockUserModel);

const mockRequestModel = {
	countDocuments: jest.fn(),
	create: jest.fn(),
	find: jest.fn(),
	updateMany: jest.fn(),
	updateOne: jest.fn(),
	findById: jest.fn(),
};
jest.mock('../../../models/SpecialCollectionRequest', () => mockRequestModel);

const mockPaymentModel = {
	countDocuments: jest.fn(),
	create: jest.fn(),
	updateOne: jest.fn(),
	findOne: jest.fn(),
};
jest.mock('../../../models/SpecialCollectionPayment', () => mockPaymentModel);

const mockBillModel = {
	create: jest.fn(),
	updateMany: jest.fn(),
};
jest.mock('../../../models/Bill', () => mockBillModel);

const mockMailer = {
	sendSpecialCollectionConfirmation: jest.fn(),
	notifyAuthorityOfSpecialPickup: jest.fn(),
	sanitizeMetadata: jest.fn(),
};
jest.mock('../../../services/mailer', () => mockMailer);

const mockReceipt = {
	generateSpecialCollectionReceipt: jest.fn(),
};
jest.mock('../receipt', () => mockReceipt);

const defaultUser = {
	_id: 'user-1',
	email: 'resident@example.com',
	name: 'Resident One',
	isActive: true,
};

const futureISO = () => {
	const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
	date.setHours(10, 0, 0, 0);
	return date.toISOString();
};

const createRequestDoc = overrides => ({
	_id: 'req-1',
	slot: {
		slotId: 'slot-1',
		start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
		end: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
	},
	status: 'scheduled',
	paymentStatus: 'not-required',
	paymentRequired: false,
	toObject: () => ({
		_id: 'req-1',
		slot: {
			slotId: 'slot-1',
			start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
			end: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
		},
	}),
	notifications: {},
	save: jest.fn().mockResolvedValue(),
	...overrides,
});

let controller;

const responseFactory = () => {
	const res = {
		statusCode: 200,
		body: undefined,
		headers: {},
		status: jest.fn().mockImplementation(function status(code) {
			res.statusCode = code;
			return res;
		}),
		json: jest.fn().mockImplementation(function json(payload) {
			res.body = payload;
			return res;
		}),
		send: jest.fn().mockImplementation(function send(payload) {
			res.body = payload;
			return res;
		}),
		setHeader: jest.fn().mockImplementation(function setHeader(key, value) {
			res.headers[key] = value;
		}),
	};
	return res;
};

const buildAvailabilityPayload = overrides => ({
	userId: defaultUser._id,
	itemType: 'furniture',
	quantity: 1,
	preferredDateTime: futureISO(),
	residentName: 'Resident',
	ownerName: 'Owner',
	address: '123 Street',
	district: 'Colombo',
	email: 'resident@example.com',
	phone: '0771234567',
	approxWeight: 15,
	specialNotes: 'Handle carefully',
	...overrides,
});

const acquireFirstAvailableSlot = async overrides => {
	const payload = buildAvailabilityPayload(overrides);
	const res = responseFactory();

	await controller.checkAvailability({ body: payload }, res, jest.fn());

	const [firstSlot] = res.body?.slots || [];
	if (!firstSlot) {
		const { statusCode, body } = res;
		throw new Error(`Test setup failed to acquire an available slot. status=${statusCode} body=${JSON.stringify(body)}`);
	}

	return { slotId: firstSlot.slotId, payload, slots: res.body.slots };
};

const resetMocks = () => {
	jest.clearAllMocks();

		mockUserModel.findById.mockImplementation(() => ({
		lean: jest.fn().mockResolvedValue({ ...defaultUser }),
	}));

		mockRequestModel.countDocuments.mockResolvedValue(0);
		mockRequestModel.create.mockImplementation(async data => createRequestDoc(data));
		mockRequestModel.find.mockImplementation(() => ({
		select: jest.fn().mockResolvedValue([]),
		sort: jest.fn().mockReturnThis(),
		lean: jest.fn().mockResolvedValue([]),
	}));
		mockRequestModel.updateMany.mockResolvedValue({ ok: 1 });
		mockRequestModel.updateOne.mockResolvedValue({ ok: 1 });
		mockRequestModel.findById.mockImplementation(() => ({
		lean: jest.fn().mockResolvedValue({
			_id: 'req-1',
			userId: defaultUser._id,
			slot: {
				slotId: 'slot-1',
				start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
				end: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
			},
			paymentAmount: 1500,
		}),
	}));

		mockPaymentModel.countDocuments.mockResolvedValue(0);
		mockPaymentModel.create.mockImplementation(async payload => ({
		_id: 'payment-1',
		...payload,
	}));
		mockPaymentModel.updateOne.mockResolvedValue({ ok: 1 });
		mockPaymentModel.findOne.mockResolvedValue(null);

		mockBillModel.create.mockImplementation(async payload => ({
		_id: 'bill-1',
		...payload,
	}));
		mockBillModel.updateMany.mockResolvedValue({ ok: 1 });

		mockMailer.sendSpecialCollectionConfirmation.mockResolvedValue({ sent: true, sentAt: new Date() });
		mockMailer.notifyAuthorityOfSpecialPickup.mockResolvedValue({ sent: true, sentAt: new Date() });
		mockMailer.sanitizeMetadata.mockImplementation(input => input);

		mockReceipt.generateSpecialCollectionReceipt.mockResolvedValue(Buffer.from('pdf-data'));

		mockStripeConstructor.mockImplementation(() => stripeMockInstance);
	stripeSessionsCreate.mockResolvedValue({ id: 'cs_test_123', url: 'https://stripe.test/session' });
	stripeSessionsRetrieve.mockResolvedValue({
		payment_status: 'paid',
		status: 'complete',
		payment_intent: {
			id: 'pi_test_123',
			status: 'succeeded',
		},
		metadata: {},
	});
	stripePaymentIntentsRetrieve.mockResolvedValue({ id: 'pi_test_123', status: 'succeeded' });
};

const loadController = async ({ stripeEnabled = true } = {}) => {
	jest.resetModules();
	resetMocks();

	if (stripeEnabled) {
		process.env.STRIPE_SECRET_KEY = 'sk_test_123';
	} else {
		delete process.env.STRIPE_SECRET_KEY;
	}
	process.env.SCHEDULING_SWEEP_DISABLED = 'true';

	controller = require('../controller');
	return controller;
};

beforeEach(async () => {
	await loadController();
});

describe('getConfig', () => {
	it('returns allowed items and slot config', async () => {
		const res = responseFactory();

		await controller.getConfig({}, res);

		expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
			ok: true,
			items: expect.any(Array),
			slotConfig: expect.any(Object),
		}));
	});
});

describe('checkAvailability', () => {
	it('returns slots and payment details for valid request', async () => {
		const res = responseFactory();
		const nowPlusDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

		const req = {
			body: {
				userId: 'user-1',
				itemType: 'furniture',
				quantity: 2,
				preferredDateTime: nowPlusDay,
				residentName: 'Resident',
				ownerName: 'Owner',
				address: '123 Street',
				district: 'Colombo',
				email: 'resident@example.com',
				phone: '0771234567',
				approxWeight: 30,
				specialNotes: 'Handle carefully',
			},
		};

		await controller.checkAvailability(req, res, jest.fn());

		expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
		const payload = res.body;
		expect(Array.isArray(payload.slots)).toBe(true);
		expect(payload.payment).toMatchObject({ required: true });
		expect(mockRequestModel.countDocuments).toHaveBeenCalled();
	});

	it('rejects disallowed items', async () => {
		const res = responseFactory();
		const req = {
			body: {
				userId: 'user-1',
				itemType: 'construction',
				quantity: 1,
				preferredDateTime: futureISO(),
				residentName: 'Resident',
				ownerName: 'Owner',
				address: '123 Street',
				district: 'Colombo',
				email: 'resident@example.com',
				phone: '0771234567',
				approxWeight: 25,
			},
		};

		await controller.checkAvailability(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.body).toMatchObject({ ok: false, code: 'ITEM_NOT_ALLOWED' });
	});

	it('returns 404 when user is missing', async () => {
		mockUserModel.findById.mockImplementation(() => ({
			lean: jest.fn().mockResolvedValue(null),
		}));
		const res = responseFactory();
		const req = {
			body: {
				userId: 'missing',
				itemType: 'furniture',
				quantity: 1,
				preferredDateTime: futureISO(),
				residentName: 'Resident',
				ownerName: 'Owner',
				address: '123 Street',
				district: 'Colombo',
				email: 'resident@example.com',
				phone: '0771234567',
				approxWeight: 20,
			},
		};

		await controller.checkAvailability(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(404);
		expect(res.body).toMatchObject({ ok: false });
	});
});

describe('confirmBooking', () => {
	it('enforces successful payment when required', async () => {
		const res = responseFactory();
		const req = {
			body: {
				userId: 'user-1',
				itemType: 'e-waste',
				quantity: 2,
				preferredDateTime: futureISO(),
				slotId: 'slot-1',
				residentName: 'Resident',
				ownerName: 'Owner',
				address: '123 Street',
				district: 'Colombo',
				email: 'resident@example.com',
				phone: '0771234567',
				approxWeight: 15,
				paymentStatus: 'failed',
			},
		};

		await controller.confirmBooking(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(402);
		expect(res.body).toMatchObject({ ok: false });
	});

	it('creates booking when payment not required', async () => {
		const { slotId, payload } = await acquireFirstAvailableSlot({
			itemType: 'yard',
			quantity: 1,
			approxWeight: null,
			specialNotes: 'Leave at gate',
		});
		const res = responseFactory();
		const req = { body: { ...payload, slotId } };

		await controller.confirmBooking(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(201);
		expect(res.body).toMatchObject({ ok: true, request: expect.objectContaining({ status: 'scheduled' }) });
		expect(mockMailer.sendSpecialCollectionConfirmation).toHaveBeenCalled();
	});

	it('rejects when selected slot is unavailable', async () => {
		const res = responseFactory();
		const req = {
			body: {
				userId: 'user-1',
				itemType: 'yard',
				quantity: 1,
				preferredDateTime: futureISO(),
				slotId: 'missing-slot',
				residentName: 'Resident',
				ownerName: 'Owner',
				address: '123 Street',
				district: 'Colombo',
				email: 'resident@example.com',
				phone: '0771234567',
				approxWeight: null,
			},
		};

		await controller.confirmBooking(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.body).toMatchObject({ ok: false, message: 'Selected slot is no longer available.' });
	});
});

describe('startCheckout', () => {
	it('short-circuits when payments disabled', async () => {
		await loadController({ stripeEnabled: false });
		const res = responseFactory();
		const req = {
			body: {
				userId: 'user-1',
				itemType: 'e-waste',
				quantity: 1,
				preferredDateTime: futureISO(),
				slotId: 'slot-1',
				residentName: 'Resident',
				ownerName: 'Owner',
				address: '123 Street',
				district: 'Colombo',
				email: 'resident@example.com',
				phone: '0771234567',
				approxWeight: 12,
				successUrl: 'https://app.test/success',
				cancelUrl: 'https://app.test/cancel',
			},
		};

		await controller.startCheckout(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(503);
		expect(res.body).toMatchObject({ ok: false });
	});

	it('returns checkout session data', async () => {
		await loadController({ stripeEnabled: true });
		const { slotId, payload } = await acquireFirstAvailableSlot({
			itemType: 'e-waste',
			quantity: 2,
			approxWeight: 15,
			specialNotes: 'Fragile',
		});
		const res = responseFactory();
		const req = {
			body: {
				...payload,
				slotId,
				successUrl: 'https://app.test/success',
				cancelUrl: 'https://app.test/cancel',
			},
		};

		await controller.startCheckout(req, res, jest.fn());

		expect(stripeSessionsCreate).toHaveBeenCalled();
		expect(mockPaymentModel.create).toHaveBeenCalled();
		expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
			ok: true,
			checkoutUrl: 'https://stripe.test/session',
			sessionId: 'cs_test_123',
		}));
	});

	it('detects when slot just became full', async () => {
		const { slotId, payload } = await acquireFirstAvailableSlot({
			itemType: 'e-waste',
			quantity: 1,
			approxWeight: 12,
		});
		mockRequestModel.countDocuments.mockResolvedValue(3);
		const res = responseFactory();
		const req = {
			body: {
				...payload,
				slotId,
				successUrl: 'https://app.test/success',
				cancelUrl: 'https://app.test/cancel',
			},
		};

		await controller.startCheckout(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(409);
		expect(res.body).toMatchObject({ ok: false });
	});

	it('notes when payment not required', async () => {
		const { slotId, payload } = await acquireFirstAvailableSlot({
			itemType: 'yard',
			quantity: 1,
			approxWeight: null,
		});
		const res = responseFactory();
		const req = {
			body: {
				...payload,
				slotId,
				successUrl: 'https://app.test/success',
				cancelUrl: 'https://app.test/cancel',
			},
		};

		await controller.startCheckout(req, res, jest.fn());

		expect(res.json).toHaveBeenCalledWith({ ok: true, paymentRequired: false });
		expect(stripeSessionsCreate).not.toHaveBeenCalled();
	});
});

describe('syncCheckout', () => {
	const buildPaymentDoc = metadata => ({
		_id: 'payment-1',
		userId: defaultUser._id,
		status: 'pending',
		stripeSessionId: 'cs_test_sync',
		amount: 2400,
		metadata,
	});

	it('completes booking on successful payment', async () => {
		const { slotId, payload } = await acquireFirstAvailableSlot({
			itemType: 'e-waste',
			quantity: 2,
			approxWeight: 12,
			specialNotes: 'Handle carefully',
		});
		const metadata = {
			slotId,
			itemType: payload.itemType,
			itemLabel: 'Electronic waste',
			quantity: String(payload.quantity),
			preferredDateTime: payload.preferredDateTime,
			residentName: payload.residentName,
			ownerName: payload.ownerName,
			address: payload.address,
			district: payload.district,
			email: payload.email,
			phone: payload.phone,
			approxWeight: payload.approxWeight != null ? String(payload.approxWeight) : undefined,
			specialNotes: payload.specialNotes,
		};

		mockPaymentModel.findOne.mockResolvedValue(buildPaymentDoc(metadata));

		stripeSessionsRetrieve.mockResolvedValue({
			payment_status: 'paid',
			status: 'complete',
			payment_intent: {
				id: 'pi_sync_1',
				status: 'succeeded',
			},
			metadata: {},
		});

		const res = responseFactory();
		const req = {
			params: { sessionId: 'cs_test_sync' },
			query: { status: 'success' },
		};

		await controller.syncCheckout(req, res, jest.fn());

		expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, status: 'success' }));
		expect(mockPaymentModel.updateOne).toHaveBeenCalledWith(
			{ _id: 'payment-1' },
			expect.objectContaining({ $set: expect.objectContaining({ status: 'success' }) }),
		);
		expect(mockReceipt.generateSpecialCollectionReceipt).toHaveBeenCalled();
	});

	it('reports pending payments gracefully', async () => {
		const { slotId, payload } = await acquireFirstAvailableSlot({
			itemType: 'furniture',
			quantity: 1,
			approxWeight: 20,
		});
		const metadata = {
			slotId,
			itemType: payload.itemType,
			quantity: String(payload.quantity),
			preferredDateTime: payload.preferredDateTime,
			residentName: payload.residentName,
			ownerName: payload.ownerName,
			address: payload.address,
			district: payload.district,
			email: payload.email,
			phone: payload.phone,
			approxWeight: payload.approxWeight != null ? String(payload.approxWeight) : undefined,
		};

		mockPaymentModel.findOne.mockResolvedValue(buildPaymentDoc(metadata));

		stripeSessionsRetrieve.mockResolvedValue({
			payment_status: 'unpaid',
			status: 'open',
			payment_intent: {
				id: 'pi_pending',
				status: 'processing',
			},
			metadata: {},
		});

		const res = responseFactory();
		const req = {
			params: { sessionId: 'cs_test_sync' },
			query: {},
		};

		await controller.syncCheckout(req, res, jest.fn());

		expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, status: 'pending' }));
	});

	it('flags malformed metadata', async () => {
		const metadata = {
			slotId: undefined,
			itemType: 'furniture',
			quantity: '0',
			preferredDateTime: futureISO(),
			residentName: 'Resident',
			ownerName: 'Owner',
			address: '123 Street',
			district: 'Colombo',
			email: 'resident@example.com',
			phone: '0771234567',
		};

		mockPaymentModel.findOne.mockResolvedValue(buildPaymentDoc(metadata));

		const res = responseFactory();
		const req = {
			params: { sessionId: 'cs_test_sync' },
			query: {},
		};

		await controller.syncCheckout(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.body).toMatchObject({ ok: false });
	});
});

describe('listUserRequests', () => {
	it('returns resident requests', async () => {
		mockRequestModel.find.mockImplementation(() => ({
			sort: jest.fn().mockReturnThis(),
			lean: jest.fn().mockResolvedValue([{ _id: 'req-1' }]),
		}));

		const res = responseFactory();
		const req = {
			query: { userId: 'user-1' },
		};

		await controller.listUserRequests(req, res, jest.fn());

		expect(res.json).toHaveBeenCalledWith({ ok: true, requests: [{ _id: 'req-1' }] });
	});
});

describe('downloadReceipt', () => {
	it('streams the receipt when authorised', async () => {
		mockReceipt.generateSpecialCollectionReceipt.mockResolvedValue(Buffer.from('pdf'));

		const res = responseFactory();
		const req = {
			params: { requestId: 'req-1' },
			query: { userId: 'user-1' },
		};

		await controller.downloadReceipt(req, res, jest.fn());

		expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
		expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
	});

	it('prevents access for other residents', async () => {
		mockRequestModel.findById.mockImplementation(() => ({
			lean: jest.fn().mockResolvedValue({
				_id: 'req-1',
				userId: 'other-user',
				slot: { start: futureISO(), end: futureISO() },
			}),
		}));

		const res = responseFactory();
		const req = {
			params: { requestId: 'req-1' },
			query: { userId: 'user-1' },
		};

		await controller.downloadReceipt(req, res, jest.fn());

		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.body).toMatchObject({ ok: false });
	});
});