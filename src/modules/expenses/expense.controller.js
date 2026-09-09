const catchAsync = require('../../utils/catchAsync');
const expenses = require('./expense.service');

exports.create = catchAsync(async (req, res) => {
  res.status(201).json(await expenses.create(req.user, req.body));
});

exports.list = catchAsync(async (req, res) => {
  res.json(await expenses.list(req.user, req.query));
});

exports.getOne = catchAsync(async (req, res) => {
  res.json(await expenses.getOne(req.user, req.params.id));
});

exports.update = catchAsync(async (req, res) => {
  res.json(await expenses.update(req.user, req.params.id, req.body));
});

exports.remove = catchAsync(async (req, res) => {
  await expenses.remove(req.user, req.params.id);
  res.status(204).end();
});
