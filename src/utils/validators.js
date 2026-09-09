const Joi = require('joi');

// Shared Joi pieces, so the rules for money and dates can't drift between
// endpoints.

const uuid = Joi.string().guid({ version: ['uuidv1', 'uuidv4'] });

const currency = Joi.string()
  .trim()
  .uppercase()
  .pattern(/^[A-Z]{3}$/)
  .messages({ 'string.pattern.base': 'must be a 3 letter currency code, e.g. INR' });

// Joi only bounds the range; utils/money.js does the exact decimal parsing.
const amount = Joi.number().greater(0).max(99999999999);

const date = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    // Catches 2026-02-30, which the regex is happy with.
    const parsed = new Date(`${value}T00:00:00.000Z`);
    const real = !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;

    return real ? value : helpers.error('any.invalid');
  })
  .messages({
    'string.pattern.base': 'must be a date like 2026-09-08',
    'any.invalid': 'must be a real date',
  });

module.exports = { Joi, uuid, currency, amount, date };
