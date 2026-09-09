// Express 4 doesn't forward rejected promises to the error middleware.
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
