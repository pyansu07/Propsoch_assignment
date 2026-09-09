const catchAsync = require('../../utils/catchAsync');
const balances = require('./balance.service');

exports.list = catchAsync(async (req, res) => {
  res.json(await balances.listForUser(req.user.id));
});
