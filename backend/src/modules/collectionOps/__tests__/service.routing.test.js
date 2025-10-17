const { estimateKg, optimize } = require('../service.routing');

describe('collectionOps service.routing', () => {
  describe('estimateKg', () => {
    it('returns 0 for null/invalid bins', () => {
      expect(estimateKg(null)).toBe(0);
      expect(estimateKg({})).toBe(0);
      expect(estimateKg({ capacityKg: 0 })).toBe(0);
    });

    it('uses defaults and caps at capacity', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const bin = { capacityKg: 50, estRateKgPerDay: 40, lastPickupAt: twoDaysAgo };
      // estimated = 80 -> capped to 50
      expect(estimateKg(bin)).toBe(50);
    });

    it('falls back to default daily rate when missing', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const bin = { capacityKg: 10, lastPickupAt: yesterday };
      // default daily rate ~3, at least 1 day => 3, below capacity
      expect(estimateKg(bin)).toBeGreaterThan(0);
      expect(estimateKg(bin)).toBeLessThanOrEqual(10);
    });
  });

  describe('optimize', () => {
    const depot = { lat: 0, lon: 0 };
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const mkBin = (id, lat, lon, capacity = 100, rate = 60) => ({
      binId: id,
      location: { lat, lon },
      capacityKg: capacity,
      estRateKgPerDay: rate,
      lastPickupAt: yesterday,
    });

    it('returns empty plan when no candidates above threshold', () => {
      const bins = [mkBin('B1', 0, 0.1, 100, 1)];
      const plans = optimize({
        bins,
        params: { depot, threshold: 0.9, truckCapacityKg: 100, trucks: 1 },
      });
      expect(Array.isArray(plans)).toBe(true);
      expect(plans[0]).toEqual(expect.objectContaining({ stops: [] }));
    });

    it('honors truck capacity and creates stops within limits', () => {
      const bins = [mkBin('B1', 0, 0.1), mkBin('B2', 0, 0.2)];
      const plans = optimize({
        bins,
        params: { depot, threshold: 0.2, truckCapacityKg: 80, trucks: 1 },
      });
      expect(plans[0].stops.length).toBe(1); // capacity prevents taking both
      expect(plans[0].loadKg).toBeGreaterThan(0);
    });

    it('applies maxTimeHrs (distance budget) and may cut route', () => {
      // Use small deltas so the first stop fits within ~2.5km round trip, second does not.
      // ~1 deg lon at equator ~111km, so 0.01 ~1.11km (round trip ~2.22km) < 2.5km
      const bins = [mkBin('B1', 0, 0.01), mkBin('B2', 0, 0.02)];
      // avgSpeedKph default 25 -> 0.1h allows ~2.5km, so only first should fit with return
      const plans = optimize({
        bins,
        params: { depot, threshold: 0.2, truckCapacityKg: 1000, trucks: 1, maxTimeHrs: 0.1 },
      });
      expect(plans[0].stops.length).toBe(1);
    });

    it('tie-breaks equal distances by binId lexicographically', () => {
      const bins = [mkBin('A-001', 0, 1), mkBin('B-001', 0, 1)];
      const plans = optimize({
        bins,
        params: { depot, threshold: 0.2, truckCapacityKg: 1000, trucks: 1 },
      });
      expect(plans[0].stops[0].binId).toBe('A-001');
    });

    it('supports legacy signature returning a single plan', () => {
      const bins = [mkBin('L-1', 0, 0.1)];
      const plan = optimize({
        bins,
        depot,
        capacityKg: 1000,
        threshold: 0.2,
      });
      expect(plan).toEqual(expect.objectContaining({ stops: expect.any(Array) }));
    });
  });
});
