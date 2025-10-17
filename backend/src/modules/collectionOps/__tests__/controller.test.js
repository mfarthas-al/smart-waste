jest.mock('../../../models/City', () => ({
	find: jest.fn(),
	findOne: jest.fn(),
}))

jest.mock('../../../models/WasteBin', () => ({
	find: jest.fn(),
	countDocuments: jest.fn(),
	updateOne: jest.fn(),
}))

jest.mock('../../../models/RoutePlan', () => ({
	findOne: jest.fn(),
	findOneAndUpdate: jest.fn(),
	find: jest.fn(),
	updateOne: jest.fn(),
}))

jest.mock('../../../models/CollectionEvent', () => ({
	create: jest.fn(),
}))

jest.mock('../service.routing', () => ({
	estimateKg: jest.fn(),
	optimize: jest.fn(),
}))

const City = require('../../../models/City')
const WasteBin = require('../../../models/WasteBin')
const RoutePlan = require('../../../models/RoutePlan')
const CollectionEvent = require('../../../models/CollectionEvent')
const { estimateKg, optimize } = require('../service.routing')
const controller = require('../controller')

const createRes = () => {
	const res = {}
	res.status = jest.fn().mockReturnValue(res)
	res.json = jest.fn().mockReturnValue(res)
	res.send = jest.fn().mockReturnValue(res)
	return res
}

const mockLean = data => jest.fn().mockResolvedValue(data)

const mockLeanExec = data => ({
	lean: jest.fn().mockReturnValue({
		exec: jest.fn().mockResolvedValue(data),
	}),
})

describe('collectionOps controller', () => {
	let req
	let res
	let next
	let consoleErrorSpy

	beforeEach(() => {
		req = { body: {}, query: {}, params: {} }
		res = createRes()
		next = jest.fn()
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

		City.find.mockReset()
		City.findOne.mockReset()
		WasteBin.find.mockReset()
		WasteBin.countDocuments.mockReset()
		WasteBin.updateOne.mockReset()
		RoutePlan.findOne.mockReset()
		RoutePlan.findOneAndUpdate.mockReset()
		RoutePlan.find.mockReset()
		RoutePlan.updateOne.mockReset()
		CollectionEvent.create.mockReset()
		estimateKg.mockReset()
		optimize.mockReset()
	})

	afterEach(() => {
		consoleErrorSpy.mockRestore()
	})

	describe('listCities', () => {
		it('returns the available cities with selected fields', async () => {
			const payload = [{ name: 'Colombo' }, { name: 'Kandy' }]
			City.find.mockReturnValue({
				select: jest.fn().mockReturnValue({
					lean: mockLean(payload),
				}),
			})

			await controller.listCities(req, res, next)

			expect(City.find).toHaveBeenCalled()
			expect(res.json).toHaveBeenCalledWith(payload)
		})
	})

	describe('listBinsByCity', () => {
		it('filters bins by city when provided', async () => {
			const bins = [{ binId: 'A' }]
			req.query.city = 'Colombo'
			WasteBin.find.mockReturnValue({
				select: jest.fn().mockReturnValue({
					lean: mockLean(bins),
				}),
			})

			await controller.listBinsByCity(req, res, next)

			expect(WasteBin.find).toHaveBeenCalledWith({ city: 'Colombo' })
			expect(res.json).toHaveBeenCalledWith(bins)
		})

		it('returns all bins when no city filter is present', async () => {
			const bins = [{ binId: 'X' }]
			WasteBin.find.mockReturnValue({
				select: jest.fn().mockReturnValue({
					lean: mockLean(bins),
				}),
			})

			await controller.listBinsByCity(req, res, next)

			expect(WasteBin.find).toHaveBeenCalledWith({})
			expect(res.json).toHaveBeenCalledWith(bins)
		})
	})

	describe('optimizeRoute', () => {
		const baseBins = [
			{ binId: 'BIN-1', capacityKg: 240, location: { lat: 6.9, lon: 79.8 } },
			{ binId: 'BIN-2', capacityKg: 240, location: { lat: 6.91, lon: 79.81 } },
		]

		beforeEach(() => {
			City.findOne.mockReturnValue({
				lean: mockLean({ depot: { lat: 6.9, lon: 79.8 } }),
			})
			WasteBin.find.mockReturnValue(mockLeanExec(baseBins))
			estimateKg.mockImplementation(() => 120)
			optimize.mockReturnValue([
				{
					stops: [
						{ binId: 'BIN-1', lat: 6.9, lon: 79.8, estKg: 120, visited: false },
						{ binId: 'BIN-2', lat: 6.91, lon: 79.81, estKg: 100, visited: true },
					],
					loadKg: 220,
					distanceKm: 8.5,
				},
			])
		})

		it('returns a draft plan with summary when confirm flag is false', async () => {
			req.body = { city: 'Colombo', constraints: { trucks: 1 }, adjustments: {}, timeWindow: '06:00-10:00' }

			await controller.optimizeRoute(req, res, next)

			expect(optimize).toHaveBeenCalled()
			const response = res.json.mock.calls[0][0]
			expect(response).toMatchObject({
				city: 'Colombo',
				status: 'draft',
				truckId: 'TRUCK-01',
				summary: expect.objectContaining({ consideredBins: expect.any(Number), highPriorityBins: expect.any(Number) }),
			})
			expect(RoutePlan.findOneAndUpdate).not.toHaveBeenCalled()
		})

		it('persists and returns the confirmed plan when confirm flag is true', async () => {
			req.body = {
				city: 'Colombo',
				timeWindow: '10:00-14:00',
				truckId: 'TRUCK-99',
				confirm: true,
			}

			const persistedDoc = {
				toObject: () => ({
					city: 'Colombo',
					truckId: 'TRUCK-99',
					status: 'confirmed',
					summary: { totalBins: 2, consideredBins: 2, highPriorityBins: 2, truckCapacityKg: 3000, trucks: 1, threshold: 0.25 },
					timeWindow: '10:00-14:00',
					updatedAt: new Date('2025-01-02T06:00:00Z'),
				}),
			}

			RoutePlan.findOneAndUpdate.mockResolvedValue(persistedDoc)

			await controller.optimizeRoute(req, res, next)

			expect(RoutePlan.findOneAndUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					city: 'Colombo',
					truckId: 'TRUCK-99',
					timeWindow: '10:00-14:00',
				}),
				expect.any(Object),
				expect.objectContaining({ upsert: true })
			)

			const response = res.json.mock.calls[0][0]
			expect(response.status).toBe('confirmed')
			expect(response.truckId).toBe('TRUCK-99')
			expect(response.timeWindow).toBe('10:00-14:00')
		})

		it('returns a fallback plan when optimizer yields no routes', async () => {
			optimize.mockReturnValueOnce([])
			req.body = { city: 'Colombo' }

			await controller.optimizeRoute(req, res, next)

			const response = res.json.mock.calls[0][0]
			expect(response.stops).toEqual([])
			expect(response.status).toBe('draft')
			expect(response.truckId).toBe('TRUCK-01')
		})

		it('validates presence of city or ward', async () => {
			req.body = {}

			await controller.optimizeRoute(req, res, next)

			expect(res.status).toHaveBeenCalledWith(400)
			expect(res.json).toHaveBeenCalledWith({ error: 'city (or ward) is required' })
		})

		it('returns 500 when optimisation fails unexpectedly', async () => {
			WasteBin.find.mockImplementation(() => {
				throw new Error('database down')
			})
			req.body = { city: 'Colombo' }

			await controller.optimizeRoute(req, res, next)

			expect(res.status).toHaveBeenCalledWith(500)
			expect(res.json).toHaveBeenCalledWith({ error: 'Unable to optimize route' })
		})
	})

	describe('getPlanByCity', () => {
		beforeEach(() => {
			estimateKg.mockImplementation(() => 120)
			WasteBin.find.mockReturnValue({
				select: jest.fn().mockReturnValue({
					lean: mockLean([
						{ binId: 'BIN-1', capacityKg: 240, estRateKgPerDay: 10, lastPickupAt: new Date('2025-01-01') },
						{ binId: 'BIN-2', capacityKg: 240, estRateKgPerDay: 8, lastPickupAt: new Date('2025-01-02') },
					]),
				}),
			})
		})

		it('returns the latest plan with derived summary metrics', async () => {
			req.query.city = 'Colombo'
			RoutePlan.findOne.mockReturnValue({
				sort: jest.fn().mockReturnValue({
					lean: mockLean({
						city: 'Colombo',
						ward: 'Colombo',
						stops: [{ binId: 'BIN-1' }],
						summary: { totalBins: 50, truckCapacityKg: 3000, trucks: 2, threshold: 0.3 },
					}),
				}),
			})

			await controller.getPlanByCity(req, res, next)

			const response = res.json.mock.calls[0][0]
			expect(response.city).toBe('Colombo')
			expect(response.summary).toMatchObject({
				totalBins: 50,
				consideredBins: expect.any(Number),
				highPriorityBins: expect.any(Number),
				threshold: 0.3,
			})
		})

		it('returns 404 when no plan exists', async () => {
			req.query.city = 'Colombo'
			RoutePlan.findOne.mockReturnValue({
				sort: jest.fn().mockReturnValue({
					lean: mockLean(null),
				}),
			})

			await controller.getPlanByCity(req, res, next)

			expect(res.status).toHaveBeenCalledWith(404)
		})

		it('validates required city parameter', async () => {
			await controller.getPlanByCity(req, res, next)

			expect(res.status).toHaveBeenCalledWith(400)
			expect(res.json).toHaveBeenCalledWith({ error: 'city is required' })
		})

		it('returns 500 when underlying lookup fails', async () => {
			req.query.city = 'Colombo'
			RoutePlan.findOne.mockImplementation(() => {
				throw new Error('query failed')
			})

			await controller.getPlanByCity(req, res, next)

			expect(res.status).toHaveBeenCalledWith(500)
			expect(res.json).toHaveBeenCalledWith({ error: 'Unable to load plan for city' })
		})
	})

	describe('getOpsSummary', () => {
				it('summarises fleet and zone activity', async () => {
					const now = Date.now()

					City.find.mockReturnValue({
						select: jest.fn().mockReturnValue({
							lean: mockLean([
								{ name: 'Colombo', lastCollectionAt: new Date(now - 2 * 86_400_000) },
								{ name: 'Kandy', lastCollectionAt: new Date(now - 10 * 86_400_000) },
							]),
						}),
					})
					WasteBin.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1200) })
					RoutePlan.find.mockReturnValue({
						select: jest.fn().mockReturnValue({
							lean: mockLean([
								{ truckId: 'TRUCK-01' },
								{ truckId: 'TRUCK-02' },
							]),
						}),
					})

					await controller.getOpsSummary(req, res, next)

					expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
						totalBins: 1200,
						activeZones: 1,
						availableTrucks: expect.any(Number),
					}))
			})

		it('returns 500 if aggregation fails', async () => {
			City.find.mockImplementation(() => {
				throw new Error('unavailable')
			})

			await controller.getOpsSummary(req, res, next)

			expect(res.status).toHaveBeenCalledWith(500)
			expect(res.json).toHaveBeenCalledWith({ error: 'Unable to load operations summary' })
		})
	})

	describe('getTodayRoute', () => {
		it('returns todays plan for the truck, applying depot fallback when missing', async () => {
			req.params.truckId = 'TRUCK-01'
			RoutePlan.findOne.mockReturnValue({
				sort: jest.fn().mockReturnValue({
					lean: mockLean({ truckId: 'TRUCK-01', ward: 'Colombo', stops: [{ binId: 'BIN-1' }] }),
				}),
			})

			await controller.getTodayRoute(req, res, next)

			const response = res.json.mock.calls[0][0]
			expect(response.truckId).toBe('TRUCK-01')
			expect(response.depot).toBeDefined()
		})

		it('returns empty list when no plan exists', async () => {
			req.params.truckId = 'TRUCK-01'
			RoutePlan.findOne.mockReturnValue({
				sort: jest.fn().mockReturnValue({
					lean: mockLean(null),
				}),
			})

			await controller.getTodayRoute(req, res, next)

			expect(res.json).toHaveBeenCalledWith({ stops: [] })
		})

		it('validates required truckId parameter', async () => {
			await controller.getTodayRoute(req, res, next)

			expect(res.status).toHaveBeenCalledWith(400)
			expect(res.json).toHaveBeenCalledWith({ error: 'truckId is required' })
		})

		it('returns 500 when route lookup throws', async () => {
			req.params.truckId = 'TRUCK-01'
			RoutePlan.findOne.mockImplementation(() => {
				throw new Error('lookup failed')
			})

			await controller.getTodayRoute(req, res, next)

			expect(res.status).toHaveBeenCalledWith(500)
			expect(res.json).toHaveBeenCalledWith({ error: 'Unable to load route' })
		})
	})

	describe('recordCollection', () => {
		beforeEach(() => {
			RoutePlan.updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
			WasteBin.updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) })
			CollectionEvent.create.mockResolvedValue({})
		})

		it('records collection events and marks stops as visited', async () => {
			req.body = { binId: 'BIN-1', truckId: 'TRUCK-02', notes: 'All clear' }

			await controller.recordCollection(req, res, next)

			expect(CollectionEvent.create).toHaveBeenCalledWith(expect.objectContaining({ binId: 'BIN-1', truckId: 'TRUCK-02' }))
			expect(RoutePlan.updateOne).toHaveBeenCalled()
			expect(WasteBin.updateOne).toHaveBeenCalledWith({ binId: 'BIN-1' }, expect.any(Object))
			expect(res.status).toHaveBeenCalledWith(201)
			expect(res.json).toHaveBeenCalledWith({ ok: true })
		})

		it('validates presence of binId', async () => {
			req.body = { truckId: 'TRUCK-02' }

			await controller.recordCollection(req, res, next)

			expect(res.status).toHaveBeenCalledWith(400)
			expect(res.json).toHaveBeenCalledWith({ error: 'binId is required' })
		})

		it('returns 500 when persistence fails', async () => {
			req.body = { binId: 'BIN-1' }
			CollectionEvent.create.mockRejectedValue(new Error('write failed'))

			await controller.recordCollection(req, res, next)

			expect(res.status).toHaveBeenCalledWith(500)
			expect(res.json).toHaveBeenCalledWith({ error: 'Unable to record collection' })
		})
	})
})