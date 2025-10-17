jest.mock('../../../models/RoutePlan', () => ({
	findOne: jest.fn(),
}))

const RoutePlan = require('../../../models/RoutePlan')

const fetchMock = jest.fn()
const controller = require('../directions.controller')

const createRes = () => {
	const res = {}
	res.status = jest.fn().mockReturnValue(res)
	res.json = jest.fn().mockReturnValue(res)
	return res
}

const mockPlanQuery = plan => {
	RoutePlan.findOne.mockReturnValue({
		sort: jest.fn().mockReturnValue({
			lean: jest.fn().mockResolvedValue(plan),
		}),
	})
}

describe('collectionOps directions.controller', () => {
	let req
	let res

	beforeEach(() => {
		req = { params: {} }
		res = createRes()
		RoutePlan.findOne.mockReset()
		fetchMock.mockReset()
		global.__osrmFetch = fetchMock
	})

	afterEach(() => {
		delete global.__osrmFetch
	})

	it('validates presence of truckId parameter', async () => {
		req.params = {}

		await controller.getPlanDirections(req, res)

		expect(res.status).toHaveBeenCalledWith(400)
		expect(res.json).toHaveBeenCalledWith({ error: 'truckId is required' })
	})

	it('returns empty geometry when no plan or stops are available', async () => {
		req.params.truckId = 'TRUCK-01'
		mockPlanQuery({ stops: [] })

		await controller.getPlanDirections(req, res)

		expect(res.json).toHaveBeenCalledWith({ line: null, distanceKm: 0, durationMin: 0 })
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('returns routed geometry when OSRM responds successfully', async () => {
		req.params.truckId = 'TRUCK-02'
		const plan = {
			depot: { lat: 6.92, lon: 79.86 },
			stops: [
				{ lat: 6.93, lon: 79.861 },
				{ lat: 6.94, lon: 79.862 },
			],
		}
		mockPlanQuery(plan)

		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: jest.fn().mockResolvedValue({
				routes: [
					{
						distance: 4200,
						duration: 660,
						geometry: { type: 'LineString', coordinates: [[79.86, 6.92], [79.861, 6.93]] },
					},
				],
			}),
		})

		await controller.getPlanDirections(req, res)

		expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('router.project-osrm.org/route/v1/driving'), expect.any(Object))
		expect(res.json).toHaveBeenCalledWith({
			line: { type: 'LineString', coordinates: [[79.86, 6.92], [79.861, 6.93]] },
			distanceKm: 4.2,
			durationMin: 11,
		})
	})

	it('falls back to internally computed geometry when OSRM fails', async () => {
		req.params.truckId = 'TRUCK-03'
		const plan = {
			depot: { lat: 6.9, lon: 79.85 },
			stops: [
				{ lat: 6.9101, lon: 79.8602 },
				{ lat: 6.9203, lon: 79.8704 },
			],
			distanceKm: 7.5,
		}
		mockPlanQuery(plan)

		fetchMock.mockRejectedValueOnce(new Error('network down'))

		await controller.getPlanDirections(req, res)

		const payload = res.json.mock.calls[0][0]
		expect(payload.fallback).toBe(true)
		expect(payload.line).toEqual({
			type: 'LineString',
			coordinates: [
				[79.85, 6.9],
				[79.8602, 6.9101],
				[79.8704, 6.9203],
				[79.85, 6.9],
			],
		})
		expect(payload.distanceKm).toBeCloseTo(7.5, 1)
		expect(payload.durationMin).toBeGreaterThan(0)
	})
})
