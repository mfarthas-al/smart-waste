const path = require('path');

function createRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

function setupDirectionsMocks() {
  jest.resetModules();
  const RoutePlan = { findOne: jest.fn() };
  jest.doMock(path.resolve(__dirname, '../../../models/RoutePlan'), () => RoutePlan);

  // Mock fetch and inject via controller test hook
  let ok = true;
  let payload = { routes: [{ distance: 12345, duration: 1800, geometry: { type: 'LineString', coordinates: [] } }] };
  const fetchMock = jest.fn(async () => ({ ok, json: async () => payload }));

  // Require the module and inject the mock fetch
  const controller = require('../directions.controller');
  if (typeof controller.__setFetchForTest === 'function') {
    controller.__setFetchForTest(fetchMock);
  }

  return { controller, RoutePlan, fetchMock, setFetchOk: v => { ok = v; }, setFetchPayload: v => { payload = v; } };
}

describe('directions.getPlanDirections', () => {
  test('validates params truckId', async () => {
    const { controller } = setupDirectionsMocks();
    const res = createRes();
    await controller.getPlanDirections({ params: { truckId: '' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns zeros when no stops', async () => {
    const { controller, RoutePlan } = setupDirectionsMocks();
    RoutePlan.findOne.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve({ stops: [] }) }) });
    const res = createRes();
    await controller.getPlanDirections({ params: { truckId: 'T1' } }, res);
    expect(res.json).toHaveBeenCalledWith({ line: null, distanceKm: 0, durationMin: 0 });
  });

  test('calls OSRM and formats response', async () => {
    const { controller, RoutePlan } = setupDirectionsMocks();
    RoutePlan.findOne.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve({
      depot: { lat: 6.9, lon: 79.86 },
      stops: [{ lat: 6.91, lon: 79.87 }],
    }) }) });
    const res = createRes();
    await controller.getPlanDirections({ params: { truckId: 'T1' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ distanceKm: expect.any(Number), durationMin: expect.any(Number) }));
  });

  test('handles OSRM bad gateway with 502', async () => {
    const { controller, RoutePlan, setFetchOk } = setupDirectionsMocks();
    RoutePlan.findOne.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve({
      depot: { lat: 6.9, lon: 79.86 },
      stops: [{ lat: 6.91, lon: 79.87 }],
    }) }) });
    setFetchOk(false);
    const res = createRes();
    await controller.getPlanDirections({ params: { truckId: 'T1' } }, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  test('handles OSRM with no routes gracefully', async () => {
    const { controller, RoutePlan, setFetchPayload } = setupDirectionsMocks();
    RoutePlan.findOne.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve({
      depot: { lat: 6.9, lon: 79.86 },
      stops: [{ lat: 6.91, lon: 79.87 }],
    }) }) });
    setFetchPayload({ routes: [] });
    const res = createRes();
    await controller.getPlanDirections({ params: { truckId: 'T1' } }, res);
    expect(res.json).toHaveBeenCalledWith({ line: null, distanceKm: 0, durationMin: 0 });
  });

  test('handles exceptions with 500', async () => {
    const { controller, RoutePlan } = setupDirectionsMocks();
    RoutePlan.findOne.mockImplementation(() => { throw new Error('db crash'); });
    const res = createRes();
    await controller.getPlanDirections({ params: { truckId: 'T1' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
