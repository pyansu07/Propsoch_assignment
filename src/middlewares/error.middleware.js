const { ValidationError, UniqueConstraintError, OptimisticLockError } = require('sequelize');
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

function toApiError(error) {
  if (error instanceof ApiError) return error;

  if (error instanceof UniqueConstraintError) {
    const onEmail = Object.keys(error.fields || {}).includes('email');
    return ApiError.conflict(
      onEmail ? 'That email is already taken' : 'That record already exists',
      'DUPLICATE'
    );
  }

  // Sequelize's own optimistic lock check, for the gap between reading an
  // expense and writing it back inside the same request.
  if (error instanceof OptimisticLockError) {
    return ApiError.conflict('Someone else changed this. Reload and try again.', 'STALE');
  }

  if (error instanceof ValidationError) {
    return ApiError.badRequest(error.errors.map((e) => e.message).join(', '), 'VALIDATION_ERROR');
  }

  return null;
}

// Four arguments, otherwise Express doesn't treat it as an error handler.
function errorHandler(error, req, res, next) {
  const known = toApiError(error);

  if (!known) {
    console.error(error);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something broke' } });
  }

  res.status(known.status).json({
    error: {
      code: known.code,
      message: known.message,
      ...(known.details ? { details: known.details } : {}),
    },
  });
}

module.exports = { notFound, errorHandler };
