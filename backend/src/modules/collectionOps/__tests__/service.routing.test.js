const { estimateKg, optimize } = require('../service.routing')

const fixedNow = new Date('2025-01-10T00:00:00.000Z')

describe('service.routing', () => {
	beforeAll(() => {
		jest.useFakeTimers()
		jest.setSystemTime(fixedNow)
	})

	afterAll(() => {
		jest.useRealTimers()
	})

	describe('estimateKg', () => {
		it('returns zero when bin is missing or capacity invalid', () => {
			expect(estimateKg(null)).toBe(0)
			expect(estimateKg({ capacityKg: 0 })).toBe(0)
		})

		it('caps estimated load at the bin capacity', () => {
			const bin = {
				capacityKg: 240,
				estRateKgPerDay: 200,
				lastPickupAt: new Date('2025-01-08T00:00:00.000Z'),
			}

			expect(estimateKg(bin)).toBe(240)
		})

		it('estimates load based on elapsed days since last pickup', () => {
			const bin = {
				capacityKg: 500,
				estRateKgPerDay: 40,
				lastPickupAt: new Date('2025-01-07T00:00:00.000Z'),
			}

			// Three days have elapsed -> 40 * 3 = 120kg
			expect(Math.round(estimateKg(bin))).toBe(120)
		})
	})

	describe('optimize', () => {
		const depot = { lat: 6.927, lon: 79.861 }

		const baseBins = [
			{
				binId: 'BIN-01',
				capacityKg: 240,
				estRateKgPerDay: 60,
				lastPickupAt: new Date('2025-01-05T00:00:00.000Z'),
				location: { lat: 6.93, lon: 79.86 },
			},
			{
				binId: 'BIN-02',
				capacityKg: 240,
				estRateKgPerDay: 55,
				lastPickupAt: new Date('2025-01-06T00:00:00.000Z'),
				location: { lat: 6.94, lon: 79.87 },
			},
			{
				binId: 'BIN-03',
				capacityKg: 240,
				estRateKgPerDay: 30,
				lastPickupAt: new Date('2025-01-03T00:00:00.000Z'),
				location: { lat: 6.931, lon: 79.862 },
			},
		]

		it('returns draft plans respecting capacity and distance constraints', () => {
			const plans = optimize({
				bins: baseBins,
				params: {
					bins: baseBins,
					depot,
					truckCapacityKg: 800,
					threshold: 0.1,
					trucks: 2,
					avgSpeedKph: 25,
					maxTimeHrs: 2,
				},
			})

			expect(Array.isArray(plans)).toBe(true)
			expect(plans.length).toBeGreaterThan(0)
			const firstPlan = plans[0]
			expect(firstPlan.stops.length).toBeGreaterThan(0)
			expect(firstPlan.loadKg).toBeGreaterThan(0)
			expect(firstPlan.distanceKm).toBeGreaterThan(0)

			const totalStops = plans.reduce((sum, plan) => sum + plan.stops.length, 0)
			expect(totalStops).toBe(baseBins.length)
		})

		it('falls back to an empty route when no candidates pass the threshold', () => {
			const depletedBins = baseBins.map(bin => ({ ...bin, capacityKg: 100, estRateKgPerDay: 1 }))
			const plans = optimize({
				bins: depletedBins,
				params: {
					bins: depletedBins,
					depot,
					truckCapacityKg: 500,
					threshold: 0.9,
				},
			})

			expect(plans).toEqual([
				{ stops: [], loadKg: 0, distanceKm: 0 },
			])
		})

		it('supports the legacy signature returning a single plan', () => {
			const plan = optimize({
				bins: baseBins,
				depot,
				capacityKg: 500,
				threshold: 0.1,
			})

			expect(plan).toHaveProperty('stops')
			expect(plan.stops.length).toBeGreaterThan(0)
			expect(plan.loadKg).toBeGreaterThan(0)
		})
	})
})
