const ApiError = require('../utils/ApiError');

const OPTIONS = { abortEarly: false, stripUnknown: true, convert: true };

// validate({ body, query, params }) — the checked and coerced value replaces the
// raw one, so services only ever see input that's already been validated.
module.exports = (schemas) => (req, res, next) => {
  const problems = {};

  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;

    const { value, error } = schemas[key].validate(req[key], OPTIONS);

    if (error) {
      error.details.forEach((detail) => {
        problems[detail.path.join('.') || key] = detail.message.replace(/"/g, '');
      });
    } else {
      req[key] = value;
    }
  }

  if (Object.keys(problems).length) {
    const failure = ApiError.badRequest('Validation failed', 'VALIDATION_ERROR');
    failure.details = problems;
    return next(failure);
  }

  next();
};
