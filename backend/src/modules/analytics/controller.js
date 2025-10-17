const { z } = require('zod');
const WasteCollectionRecord = require('../../models/WasteCollectionRecord');
const User = require('../../models/User');

// Validates the dashboard-driven filters before running heavy aggregations.
const criteriaSchema = z.object({
  userId: z.string({ required_error: 'User id is required' }).min(1, 'User id is required'),
  criteria: z.object({
    dateRange: z.object({
      from: z.coerce.date({ required_error: 'Start date is required' }),
      to: z.coerce.date({ required_error: 'End date is required' }),
    }).refine(({ from, to }) => from <= to, {
      message: 'End date must be on or after the start date',
      path: ['to'],
    }),
    regions: z.array(z.string().min(1)).optional(),
    wasteTypes: z.array(z.string().min(1)).optional(),
    billingModels: z.array(z.string().min(1)).optional(),
  }),
}).strict();

// Lightweight grouping helper so we can build summaries without additional deps.
function groupBy(array, keyGetter) {
  return array.reduce((acc, item) => {
    const key = keyGetter(item)
    if (!acc.has(key)) {
      acc.set(key, []);
    }
      acc.get(key).push(item);
      return acc;
    }, new Map());
}

// Surfaces filter metadata so the frontend can pre-populate selectors.
async function getConfig(_req, res, next) {
  try {
    const [regions, wasteTypes, billingModels, firstRecord, lastRecord] = await Promise.all([
      WasteCollectionRecord.distinct('region').lean(),
      WasteCollectionRecord.distinct('wasteType').lean(),
      WasteCollectionRecord.distinct('billingModel').lean(),
      WasteCollectionRecord.findOne().sort({ collectionDate: 1 }).lean(),
      WasteCollectionRecord.findOne().sort({ collectionDate: -1 }).lean(),
    ]);

    return res.json({
      ok: true,
      filters: {
        regions,
        wasteTypes,
        billingModels,
        defaultDateRange: {
          from: firstRecord?.collectionDate ?? null,
          to: lastRecord?.collectionDate ?? null,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
}

// Converts the validated criteria into a MongoDB selector.
function buildMatch({ criteria }) {
  const { dateRange, regions = [], wasteTypes = [], billingModels = [] } = criteria
  const match = {
    collectionDate: {
      $gte: new Date(dateRange.from),
      $lte: new Date(dateRange.to),
    },
  };
  if (regions.length) {
    match.region = { $in: regions };
  }
  if (wasteTypes.length) {
    match.wasteType = { $in: wasteTypes };
  }
  if (billingModels.length) {
    match.billingModel = { $in: billingModels };
  }
  return match;
}

// Builds all charts and tables for the analytics view from the raw records.
function makeReportPayload(records, { criteria }) {
  const normalizedCriteria = {
    ...criteria,
    dateRange: {
      from: criteria.dateRange.from,
      to: criteria.dateRange.to,
    },
    regions: criteria.regions ?? [],
    wasteTypes: criteria.wasteTypes ?? [],
    billingModels: criteria.billingModels ?? [],
  };

  const totalWeight = records.reduce((sum, record) => sum + (record.weightKg || 0), 0);
  const recyclableWeight = records.reduce((sum, record) => sum + (record.recyclableKg || 0), 0);
  const nonRecyclableWeight = records.reduce((sum, record) => sum + (record.nonRecyclableKg || 0), 0);

  const householdGroups = groupBy(records, record => record.householdId);
  const households = Array.from(householdGroups.entries()).map(([householdId, items]) => {
    const householdTotal = items.reduce((sum, item) => sum + (item.weightKg || 0), 0);
    return {
      householdId,
      totalKg: Number(householdTotal.toFixed(2)),
      averagePickupKg: Number((householdTotal / items.length).toFixed(2)),
      pickups: items.length,
      region: items[0]?.region ?? '—',
      billingModel: items[0]?.billingModel ?? '—',
    };
  });

  households.sort((a, b) => b.totalKg - a.totalKg);

  const regionGroups = groupBy(records, record => record.region || 'Unknown');
  const regionSummary = Array.from(regionGroups.entries()).map(([region, items]) => {
    const sum = items.reduce((acc, item) => acc + (item.weightKg || 0), 0);
    return {
      region,
      totalKg: Number(sum.toFixed(2)),
      collectionCount: items.length,
      averageKg: Number((sum / Math.max(items.length, 1)).toFixed(2)),
    };
  }).sort((a, b) => b.totalKg - a.totalKg);

  const wasteTypeGroups = groupBy(records, record => record.wasteType || 'Unknown');
  const wasteSummary = Array.from(wasteTypeGroups.entries()).map(([wasteType, items]) => {
    const recyclable = items.reduce((acc, item) => acc + (item.recyclableKg || 0), 0);
    const nonRecyclable = items.reduce((acc, item) => acc + (item.nonRecyclableKg || 0), 0);
    return {
      wasteType,
      totalKg: Number((recyclable + nonRecyclable).toFixed(2)),
      recyclableKg: Number(recyclable.toFixed(2)),
      nonRecyclableKg: Number(nonRecyclable.toFixed(2)),
    };
  });

  const timeSeriesGroups = groupBy(records, record => new Date(record.collectionDate).toISOString().slice(0, 10));
  const timeSeries = Array.from(timeSeriesGroups.entries())
    .map(([day, items]) => {
      const dayWeight = items.reduce((acc, item) => acc + (item.weightKg || 0), 0);
      return {
        day,
        totalKg: Number(dayWeight.toFixed(2)),
        pickups: items.length,
      };
    })
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  return {
  criteria: normalizedCriteria,
    totals: {
      records: records.length,
      totalWeightKg: Number(totalWeight.toFixed(2)),
      recyclableWeightKg: Number(recyclableWeight.toFixed(2)),
      nonRecyclableWeightKg: Number(nonRecyclableWeight.toFixed(2)),
    },
    charts: {
      regionSummary,
      wasteSummary,
      recyclingSplit: {
        recyclableWeightKg: Number(recyclableWeight.toFixed(2)),
        nonRecyclableWeightKg: Number(nonRecyclableWeight.toFixed(2)),
      },
      timeSeries,
    },
    tables: {
      households,
      regions: regionSummary,
      wasteTypes: wasteSummary,
    },
  };
}

// Generates the report payload if the caller is an authorised admin.
async function generateReport(req, res, next) {
  try {
    const payload = criteriaSchema.parse(req.body);
    const user = await User.findById(payload.userId).lean();
    if (!user) {
      return res.status(401).json({ ok: false, message: 'User is not authenticated' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ ok: false, message: 'You are not authorised to access analytics' });
    }

    const match = buildMatch(payload);
    const records = await WasteCollectionRecord.find(match).lean();

    if (!records.length) {
      return res.json({ ok: true, data: null, message: 'No Records Available' });
    }

    const data = makeReportPayload(records, payload);
    return res.json({ ok: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: error.issues?.[0]?.message || 'Invalid criteria', issues: error.issues });
    }
    return next(error);
  }
}

module.exports = {
  getConfig,
  generateReport,
};
