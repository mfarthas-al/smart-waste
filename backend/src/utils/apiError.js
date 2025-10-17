/**
 * A standardized API error with HTTP status and optional details.
 */
class ApiError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message Human friendly message
   * @param {object} [details] Optional extra details for clients/logs
   */
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (details) this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
  static badRequest(message = 'Bad Request', details) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = 'Unauthorized', details) {
    return new ApiError(401, message, details);
  }
  static forbidden(message = 'Forbidden', details) {
    return new ApiError(403, message, details);
  }
  static notFound(message = 'Not Found', details) {
    return new ApiError(404, message, details);
  }
  static conflict(message = 'Conflict', details) {
    return new ApiError(409, message, details);
  }
  static tooMany(message = 'Too Many Requests', details) {
    return new ApiError(429, message, details);
  }
  static serverError(message = 'Internal Server Error', details) {
    return new ApiError(500, message, details);
  }
}

module.exports = { ApiError };
