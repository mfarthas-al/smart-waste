const path = require('path');

function createRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

function setupControllerMocks() {
  jest.resetModules();

  const City = { find: jest.fn(), findOne: jest.fn() };
  const WasteBin = { find: jest.fn(), updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({ acknowledged: true }) })) };
  const RoutePlan = { findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) })) };
  const CollectionEvent = { create: jest.fn() };

  const routing = { estimateKg: jest.fn(), optimize: jest.fn() };

  jest.doMock(path.resolve(__dirname, '../../../models/City'), () => City);
  jest.doMock(path.resolve(__dirname, '../../../models/WasteBin'), () => WasteBin);
  jest.doMock(path.resolve(__dirname, '../../../models/RoutePlan'), () => RoutePlan);
  jest.doMock(path.resolve(__dirname, '../../../models/CollectionEvent'), () => CollectionEvent);
  jest.doMock(path.resolve(__dirname, '../service.routing'), () => routing);

  // eslint-disable-next-line global-require
  const controller = require('../controller');
  return { controller, City, WasteBin, RoutePlan, CollectionEvent, routing };
}

describe('collectionOps controller - listCities', () => {
  test('returns city list with selected fields', async () => {
    const { controller, City } = setupControllerMocks();
    City.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ name: 'Colombo' }]) }) });
    const res = createRes();
    await controller.listCities({}, res);
    expect(res.json).toHaveBeenCalledWith([{ name: 'Colombo' }]);
  });
});

describe('collectionOps controller - listBinsByCity', () => {
  test('returns bins for a given city', async () => {
    const { controller, WasteBin } = setupControllerMocks();
    const bins = [{ binId: 'B1' }, { binId: 'B2' }];
    WasteBin.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(bins) }) });
    const res = createRes();
    await controller.listBinsByCity({ query: { city: 'Colombo' } }, res);
    expect(WasteBin.find).toHaveBeenCalledWith({ city: 'Colombo' });
    expect(res.json).toHaveBeenCalledWith(bins);
  });

  test('returns all bins when city omitted', async () => {
    const { controller, WasteBin } = setupControllerMocks();
    const bins = [{ binId: 'B1' }];
    WasteBin.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(bins) }) });
    const res = createRes();
    await controller.listBinsByCity({ query: {} }, res);
    expect(WasteBin.find).toHaveBeenCalledWith({});
    expect(res.json).toHaveBeenCalledWith(bins);
  });

  test('validates bad input and returns 400', async () => {
    const { controller } = setupControllerMocks();
    const res = createRes();
    await controller.listBinsByCity({ query: { city: '' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('collectionOps controller - optimizeRoute', () => {
  test('400 when city/ward missing', async () => {
    const { controller } = setupControllerMocks();
    const res = createRes();
    await controller.optimizeRoute({ body: { date: '2025-01-01' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('happy path persists plan and returns summary', async () => {
    const { controller, City, WasteBin, routing, RoutePlan } = setupControllerMocks();
    City.findOne.mockReturnValue({ lean: () => Promise.resolve({ depot: { lat: 6.9, lon: 79.86 } }) });
    const binDocs = [
      { binId: 'A', capacityKg: 200, estRateKgPerDay: 5, location: { lat: 6.92, lon: 79.87 } },
      { binId: 'B', capacityKg: 120, estRateKgPerDay: 2, location: { lat: 6.93, lon: 79.88 } },
    ];
    WasteBin.find.mockReturnValue({ lean: () => Promise.resolve(binDocs) });
    routing.estimateKg.mockImplementation(bin => (bin.estRateKgPerDay || 0) * 1.0);
    routing.optimize.mockReturnValue({ stops: [{ binId: 'A', lat: 6.92, lon: 79.87 }], loadKg: 200, distanceKm: 12 });
    RoutePlan.findOneAndUpdate.mockResolvedValue({ toObject: () => ({ city: 'Colombo', truckId: 'TRUCK-01', stops: [] }) });

    const res = createRes();
    await controller.optimizeRoute({ body: { city: 'Colombo', constraints: { truckCapacityKg: 3000 }, adjustments: { skipBelow30: true } } }, res);
    expect(RoutePlan.findOneAndUpdate).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.summary).toEqual(expect.objectContaining({ trucks: 1, truckCapacityKg: 3000 }));
    expect(payload.truckId).toBeDefined();
  });

  test('handles exception and returns 500', async () => {
    const { controller, WasteBin } = setupControllerMocks();
    WasteBin.find.mockImplementation(() => { throw new Error('db down'); });
    const res = createRes();
    await controller.optimizeRoute({ body: { city: 'Colombo' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('collectionOps controller - getTodayRoute', () => {
  test('validates truckId and returns 400', async () => {
    const { controller } = setupControllerMocks();
    const res = createRes();
    await controller.getTodayRoute({ params: { truckId: '' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns empty stops when no plan', async () => {
    const { controller, RoutePlan } = setupControllerMocks();
    RoutePlan.findOne.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(null) }) });
    const res = createRes();
    await controller.getTodayRoute({ params: { truckId: 'TRUCK-01' } }, res);
    expect(res.json).toHaveBeenCalledWith({ stops: [] });
  });

  test('fills missing depot with fallback depot', async () => {
    const { controller, RoutePlan } = setupControllerMocks();
    RoutePlan.findOne.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve({ ward: 'Colombo', stops: [{ binId: 'A' }] }) }) });
    const res = createRes();
    await controller.getTodayRoute({ params: { truckId: 'TRUCK-01' } }, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.depot).toBeDefined();
  });

  test('handles exception with 500', async () => {
    const { controller, RoutePlan } = setupControllerMocks();
    RoutePlan.findOne.mockImplementation(() => { throw new Error('db error'); });
    const res = createRes();
    await controller.getTodayRoute({ params: { truckId: 'T1' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('collectionOps controller - recordCollection', () => {
  test('returns 400 on missing binId', async () => {
    const { controller } = setupControllerMocks();
    const res = createRes();
    await controller.recordCollection({ body: { truckId: 'T1' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('persists event and updates plan/bin', async () => {
    const { controller, CollectionEvent, RoutePlan, WasteBin } = setupControllerMocks();
    const res = createRes();
    await controller.recordCollection({ body: { binId: 'B1', truckId: 'T1', notes: 'ok' } }, res);
    expect(CollectionEvent.create).toHaveBeenCalled();
    expect(RoutePlan.updateOne).toHaveBeenCalled();
    expect(WasteBin.updateOne).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('handles errors and returns 500', async () => {
    const { controller, CollectionEvent } = setupControllerMocks();
    CollectionEvent.create.mockRejectedValue(new Error('fail'));
    const res = createRes();
    await controller.recordCollection({ body: { binId: 'B1' } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
