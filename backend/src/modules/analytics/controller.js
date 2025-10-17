/**
 * Analytics Controller
 * 
 * Handles HTTP requests for analytics endpoints.
 * Follows the Controller pattern from MVC architecture.
 * Delegates business logic to the service layer (Single Responsibility Principle).
 */

const { z } = require('zod');
const { AnalyticsService } = require('./reportService');
const User = require('../../models/User');

// Validates the dashboard-driven filters before running heavy aggregations.
const criteriaSchema = z.object({
  userId: z.string({ required_error: 'User id is required' }).min(1, 'User id is required'),
  criteria: z.object({
    dateRange: z
      .object({
        from: z.coerce.date({ required_error: 'Start date is required' }),
        to: z.coerce.date({ required_error: 'End date is required' }),
      })
      .refine(
        ({ from, to }) => from <= to,
        {
          message: 'End date must be on or after the start date',
          path: ['to'],
        }
      ),
    regions: z.array(z.string().min(1)).optional().default([]),
    wasteTypes: z.array(z.string().min(1)).optional().default([]),
    billingModels: z.array(z.string().min(1)).optional().default([]),
  }),
}).strict();

// Lightweight grouping helper so we can build summaries without additional deps.
function groupBy(array, keyGetter) {
  return array.reduce((acc, item) => {
    const key = keyGetter(item)
    if (!acc.has(key)) {
      acc.set(key, []);
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

  /**
   * Sends an error response
   * 
   * @param {Object} res - Express response object
   * @param {Number} statusCode - HTTP status code
   * @param {String} message - Error message
   * @param {Object} additionalData - Additional error data (e.g., validation issues)
   */
  static error(res, statusCode, message, additionalData = null) {
    const response = { ok: false, message };
    if (additionalData) {
      Object.assign(response, additionalData);
    }
    return res.status(statusCode).json(response);
  }
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
    // Step 1: Validate and parse request payload
    const payload = reportCriteriaSchema.parse(req.body);

    // Step 2: Verify user authorization
    const authResult = await AuthorizationService.validateUserAccess(payload.userId);
    
    if (!authResult.authorized) {
      return ResponseHandler.error(
        res,
        authResult.statusCode,
        authResult.message
      );
    }

    // Step 3: Generate report using the service layer
    const reportData = await AnalyticsService.generateReport(payload.criteria);

    // Step 4: Handle empty result set
    if (!reportData) {
      return ResponseHandler.success(res, null, MESSAGES.NO_RECORDS);
    }

    // Step 5: Return successful report
    return ResponseHandler.success(res, reportData, MESSAGES.REPORT_GENERATED);

  } catch (error) {
    // Handle validation errors specifically
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues?.[0];
      return ResponseHandler.error(
        res,
        HTTP_STATUS.BAD_REQUEST,
        firstIssue?.message || MESSAGES.INVALID_CRITERIA,
        { issues: error.issues }
      );
    }

    // Pass other errors to the global error handler
    return next(error);
  }
}

/**
 * Export controller functions
 * These are used in the router to handle specific endpoints
 */
module.exports = {
  getConfig,
  generateReport,
  // Export for testing purposes
  AuthorizationService,
  ResponseHandler,
};
