const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = catchAsync(async (req, res, next) => {
  const userId = req.headers['x-user-id'];

  if (!userId || !UUID.test(userId)) {
    throw ApiError.unauthorized('Send the caller id in an X-User-Id header');
  }

  // paranoid is on, so a deleted account can't call anything.
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.unauthorized('No user with that id');

  req.user = user;
  next();
});
