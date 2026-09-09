const catchAsync = require('../../utils/catchAsync');
const users = require('./user.service');

exports.getMe = (req, res) => {
  res.json(users.profile(req.user));
};

exports.updateMe = catchAsync(async (req, res) => {
  res.json(await users.updateProfile(req.user, req.body));
});

exports.deleteMe = catchAsync(async (req, res) => {
  await users.deleteAccount(req.user);
  res.status(204).end();
});
