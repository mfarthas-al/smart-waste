const { z } = require('zod');
const City = require('../../models/City');
const WasteBin = require('../../models/WasteBin');
const RoutePlan = require('../../models/RoutePlan');
const CollectionEvent = require('../../models/CollectionEvent');
const lk = require('../../config/region.lk.json');
const { estimateKg, optimize } = require('./service.routing');

const DEFAULT_TRUCK_ID = 'TRUCK-01';

// Normalises operational error responses for the operations dashboard.
const respondWithError = (res, status, message, extra = {}) => (
  res.status(status).json({ error: message, ...extra })
);

// Light-weight validation wrapper that bails early on invalid requests.
const parseOrRespond = (schema, payload, res) => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    respondWithError(res, 400, result.error.errors[0].message);
    return null;
  }
  return result.data;
};

// Helpers keep date arithmetic consistent across queries.
const startOfDay = date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = date => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * Derive the bin fill threshold used for route optimisation, applying operator adjustments.
 * @param {{ skipBelow30?: boolean, emergencyOnly?: boolean, prioritizeCommercial?: boolean }} [adjustments]
 * @returns {number} A ratio between 0 and 0.9 representing the minimum fill level.
 */
const computeThreshold = adjustments => {
  // Applies configuration-aware adjustments without exceeding operational guardrails.
  const base = Number(lk.operations.route_threshold ?? 0.2);
  let threshold = base;
  if (adjustments?.skipBelow30) {
    threshold = Math.max(threshold, 0.3);
  }
  if (adjustments?.emergencyOnly) {
    threshold = Math.max(threshold, 0.6);
  }
  if (adjustments?.prioritizeCommercial) {
    threshold = Math.max(0.1, threshold - 0.05);
  }
  return Math.min(0.9, threshold);
};

const listBinsQuerySchema = z.object({ city: z.string().min(1).optional() });
const optimizeRouteSchema = z.object({
  city: z.string().min(1).optional(),
  ward: z.string().min(1).optional(),
  area: z.string().min(1).optional(),
  date: z.union([z.string(), z.date()]).optional(),
  truckId: z.string().min(1).optional(),
  constraints: z.object({
    truckCapacityKg: z.union([z.number(), z.string()]).optional(),
    trucks: z.union([z.number(), z.string()]).optional(),
    maxTimeHrs: z.union([z.number(), z.string()]).optional(),
    maxTime: z.union([z.number(), z.string()]).optional(),
  }).optional(),
  adjustments: z.object({
    skipBelow30: z.boolean().optional(),
    emergencyOnly: z.boolean().optional(),
    prioritizeCommercial: z.boolean().optional(),
    avoidPeak: z.boolean().optional(),
  }).optional(),
}).passthrough();

const todayRouteParamsSchema = z.object({ truckId: z.string().min(1) });
const recordCollectionSchema = z.object({
  binId: z.string().min(1),
  truckId: z.string().min(1).optional(),
  notes: z.string().max(500).optional(),
});

// Provides metadata for the operations UI to render city selectors.
exports.listCities = async (_req, res) => {
  const cities = await City.find()
    .select('name code depot bbox areaSqKm population lastCollectionAt -_id')
    .lean();
  return res.json(cities);
};

// Returns bins in a city so planners can inspect fill rates.
exports.listBinsByCity = async (req, res) => {
  const parsedQuery = parseOrRespond(listBinsQuerySchema, req.query || {}, res);
  if (!parsedQuery) {
    return undefined;
  }

  const query = parsedQuery.city ? { city: parsedQuery.city } : {};
  const bins = await WasteBin.find(query)
    .select('binId city area location capacityKg lastPickupAt estRateKgPerDay -_id')
    .lean();
  return res.json(bins);
};

// Runs the optimisation routine and persists the resulting plan for the day.
exports.optimizeRoute = async (req, res) => {
  const payload = parseOrRespond(optimizeRouteSchema, req.body || {}, res);
  if (!payload) {
    return undefined;
  }

  try {
    const { city, ward, area, date, truckId, constraints = {}, adjustments = {} } = payload;
    const serviceArea = city || ward;
    if (!serviceArea) {
      return respondWithError(res, 400, 'city (or ward) is required');
    }

    const cityDoc = await City.findOne({ name: serviceArea }).lean();
    const depot = cityDoc?.depot
      || (lk.operations.city_depots && lk.operations.city_depots[serviceArea])
      || lk.operations.default_depot;

    const bins = await WasteBin.find(area ? { city: serviceArea, area } : { city: serviceArea }).lean();
    const threshold = computeThreshold(adjustments);
    const truckCapacityKg = Number(constraints.truckCapacityKg || lk.operations.truck_capacity_kg || 3000);
    const trucks = Math.max(1, Number(constraints.trucks || 1));
    const maxTimeHrs = Number(constraints.maxTimeHrs || constraints.maxTime || 0);
    const avgSpeedKph = adjustments?.avoidPeak ? 18 : 25;

    const totalBins = bins.length;
    const enriched = bins.map(bin => {
      const capacity = Number(bin.capacityKg) || 240;
      const estKg = estimateKg(bin);
      const ratio = capacity > 0 ? estKg / capacity : 0;
      return { ...bin, estKg, ratio };
    });
    const consideredBins = enriched.filter(b => b.ratio >= threshold);
    const highPriorityBins = enriched.filter(b => b.ratio >= 0.6);

    const plans = optimize({
      bins,
      params: {
        depot,
        threshold,
        truckCapacityKg,
        trucks,
        maxTimeHrs,
        avgSpeedKph,
      },
    });
    const planList = Array.isArray(plans) ? plans : [plans];

    const planDate = date ? new Date(date) : new Date();
    const planDayStart = startOfDay(planDate);
    const planDayEnd = endOfDay(planDate);

    const savedPlans = [];
    planList.forEach((plan, index) => {
      const assignedTruck = index === 0 && truckId
        ? truckId
        : `TRUCK-${String(index + 1).padStart(2, '0')}`;
      savedPlans.push({ assignedTruck, plan });
    });

    const persisted = [];
    for (const entry of savedPlans) {
      const payloadDoc = {
        ward: serviceArea,
        city: serviceArea,
        area: area || null,
        truckId: entry.assignedTruck,
        date: planDayStart,
        depot,
        stops: (entry.plan.stops || []).map(stop => ({ ...stop, visited: Boolean(stop.visited) })),
        loadKg: entry.plan.loadKg || 0,
        distanceKm: entry.plan.distanceKm || 0,
      };

      const doc = await RoutePlan.findOneAndUpdate(
        {
          city: serviceArea,
          area: area || null,
          truckId: entry.assignedTruck,
          date: { $gte: planDayStart, $lte: planDayEnd },
        },
        { $set: payloadDoc },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      persisted.push(doc ? doc.toObject() : payloadDoc);
    }

    const primaryPlan = persisted[0] || {
      city: serviceArea,
      area: area || null,
      truckId: truckId || DEFAULT_TRUCK_ID,
      stops: [],
      loadKg: 0,
      distanceKm: 0,
      depot,
    };

    const response = {
      ...primaryPlan,
      summary: {
        totalBins,
        consideredBins: consideredBins.length,
        highPriorityBins: highPriorityBins.length,
        truckCapacityKg,
        trucks,
        threshold,
      },
    };

    return res.json(response);
  } catch (error) {
    console.error('optimizeRoute error', error);
    return respondWithError(res, 500, 'Unable to optimize route');
  }
};

// Fetches today's plan for a truck, filling missing depot info if needed.
exports.getTodayRoute = async (req, res) => {
  const params = parseOrRespond(todayRouteParamsSchema, req.params || {}, res);
  if (!params) {
    return undefined;
  }

  try {
    const today = new Date();
    const plan = await RoutePlan.findOne({
      truckId: params.truckId,
      date: { $gte: startOfDay(today), $lte: endOfDay(today) },
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (!plan) {
      return res.json({ stops: [] });
    }

    if (!plan.depot) {
      const fallbackDepot = (lk.operations.city_depots && lk.operations.city_depots[plan.ward])
        || lk.operations.default_depot;
      plan.depot = fallbackDepot;
    }

    return res.json(plan);
  } catch (error) {
    console.error('getTodayRoute error', error);
    return respondWithError(res, 500, 'Unable to load route');
  }
};

// Records a completed pickup and updates both the route plan and bin metadata.
exports.recordCollection = async (req, res) => {
  const payload = parseOrRespond(recordCollectionSchema, req.body || {}, res);
  if (!payload) {
    return undefined;
  }

  try {
    const assignedTruck = payload.truckId || DEFAULT_TRUCK_ID;
    const now = new Date();

    await CollectionEvent.create({ binId: payload.binId, truckId: assignedTruck, notes: payload.notes, ts: now });

    const filter = {
      truckId: assignedTruck,
      date: { $gte: startOfDay(now), $lte: endOfDay(now) },
      'stops.binId': payload.binId,
    };

    await Promise.all([
      RoutePlan.updateOne(filter, { $set: { 'stops.$.visited': true } }).exec(),
      WasteBin.updateOne({ binId: payload.binId }, { $set: { lastPickupAt: now } }).exec(),
    ]);

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('recordCollection error', error);
    return respondWithError(res, 500, 'Unable to record collection');
  }
};
