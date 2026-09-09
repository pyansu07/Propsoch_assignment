class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || DEFAULT_CODES[status] || 'INTERNAL_ERROR';
  }

  static badRequest(message, code) {
    return new ApiError(400, message, code);
  }

  static unauthorized(message) {
    return new ApiError(401, message);
  }

  static forbidden(message) {
    return new ApiError(403, message);
  }

  static notFound(message) {
    return new ApiError(404, message);
  }

  static conflict(message, code) {
    return new ApiError(409, message, code);
  }
}

const DEFAULT_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
};

module.exports = ApiError;
