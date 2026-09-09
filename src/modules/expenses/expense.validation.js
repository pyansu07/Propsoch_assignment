const { Joi, uuid, currency, amount, date } = require('../../utils/validators');
const { SPLIT_TYPES } = require('./split.strategies');

// amount and percent belong to one split type each, so they're only required
// when that type is in play. The '/' makes the ref point at the root of the
// body rather than at a sibling key inside the member.
const member = Joi.object({
  userId: uuid.required(),
  amount: Joi.number()
    .min(0)
    .when(Joi.ref('/splitType'), { is: 'EXACT', then: Joi.required() }),
  percent: Joi.number()
    .greater(0)
    .max(100)
    .when(Joi.ref('/splitType'), { is: 'PERCENT', then: Joi.required() }),
});

const members = Joi.array().items(member).min(1).max(50).unique('userId');

const create = {
  body: Joi.object({
    name: Joi.string().trim().min(1).max(255).required(),
    amount: amount.required(),
    currency,
    date,
    paidBy: uuid,
    splitType: Joi.string()
      .uppercase()
      .valid(...SPLIT_TYPES)
      .default('EQUAL'),
    members: members.required(),
  }),
};

const update = {
  params: Joi.object({ id: uuid.required() }),
  body: Joi.object({
    name: Joi.string().trim().min(1).max(255),
    amount,
    currency,
    date,
    paidBy: uuid,
    splitType: Joi.string()
      .uppercase()
      .valid(...SPLIT_TYPES),
    members,
    // Optional: send the version you last read and a concurrent edit fails
    // with 409 instead of overwriting.
    version: Joi.number().integer().min(0),
  })
    .min(1)
    .messages({ 'object.min': 'Send at least one field to change' }),
};

const byId = { params: Joi.object({ id: uuid.required() }) };

const list = { query: Joi.object({ from: date, to: date }) };

module.exports = { create, update, byId, list };
