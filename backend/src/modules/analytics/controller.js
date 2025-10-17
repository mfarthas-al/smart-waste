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

/**
 * HTTP Status Codes Constants
 * Following the DRY principle and improving code readability
 */
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL_SERVER_ERROR: 500,
};

/**
 * Response Messages Constants
 * Centralized error messages for consistency
 */
const MESSAGES = {
  USER_NOT_AUTHENTICATED: 'User is not authenticated',
  UNAUTHORIZED_ACCESS: 'You are not authorised to access analytics',
  INVALID_CRITERIA: 'Invalid criteria',
  NO_RECORDS: 'No Records Available',
  CONFIG_LOADED: 'Configuration loaded successfully',
  REPORT_GENERATED: 'Report generated successfully',
};

/**
 * Validation schema for report generation request
 * Using Zod for runtime type validation
 * Follows the Fail-Fast principle by validating input early
 */
const reportCriteriaSchema = z.object({
  userId: z
    .string({ required_error: 'User id is required' })
    .min(1, 'User id is required'),
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

/**
 * Authorization Service
 * Encapsulates authorization logic following Single Responsibility Principle
 */
class AuthorizationService {
  /**
   * Validates if a user is authenticated and authorized for analytics
   * 
   * @param {String} userId - User ID to validate
   * @returns {Promise<Object>} Object containing authorization status and user
   * @throws {Error} If user is not found or not authorized
   */
  static async validateUserAccess(userId) {
    const user = await User.findById(userId).lean();
    
    if (!user) {
      return {
        authorized: false,
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: MESSAGES.USER_NOT_AUTHENTICATED,
      };
    }

    if (user.role !== 'admin') {
      return {
        authorized: false,
        statusCode: HTTP_STATUS.FORBIDDEN,
        message: MESSAGES.UNAUTHORIZED_ACCESS,
      };
    }

    return { authorized: true, user };
  }
}

/**
 * Response Handler
 * Centralizes response formatting following DRY principle
 */
class ResponseHandler {
  /**
   * Sends a success response
   * 
   * @param {Object} res - Express response object
   * @param {Object} data - Data to send in response
   * @param {String} message - Optional success message
   */
  static success(res, data, message = null) {
    const response = { ok: true, data };
    if (message) {
      response.message = message;
    }
    return res.status(HTTP_STATUS.OK).json(response);
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

/**
 * Retrieves analytics configuration
 * 
 * This endpoint provides filter options and default date ranges
 * for the analytics report generation interface.
 * 
 * @param {Object} _req - Express request object (unused)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<Object>} JSON response with configuration data
 */
async function getConfig(_req, res, next) {
  try {
    const filters = await AnalyticsService.getConfiguration();
    
    return ResponseHandler.success(res, { filters }, MESSAGES.CONFIG_LOADED);
  } catch (error) {
    // Pass errors to the error handling middleware
    return next(error);
  }
}

/**
 * Generates a waste analytics report
 * 
 * This endpoint validates the request, checks user authorization,
 * and generates a comprehensive analytics report based on the provided criteria.
 * 
 * Flow:
 * 1. Validate request body schema
 * 2. Verify user authentication and authorization
 * 3. Generate report using the service layer
 * 4. Return formatted response
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<Object>} JSON response with report data or error
 */
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
