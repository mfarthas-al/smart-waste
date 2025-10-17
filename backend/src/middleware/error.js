const { ApiError } = require('../utils/apiError');

// 404 handler for unknown routes
function notFound(_req, _res, next) {
  next(ApiError.notFound('Route not found'));
}

// Central error handler
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  const status = err instanceof ApiError && err.status ? err.status : 500;
  const payload = {
    ok: false,
    message: err.message || 'Internal Server Error',
  };
  if (process.env.NODE_ENV !== 'production') {
    if (err.details) payload.details = err.details;
  }
  return res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };
