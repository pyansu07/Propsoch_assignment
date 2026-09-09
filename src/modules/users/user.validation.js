const { Joi, currency } = require('../../utils/validators');

const updateProfile = {
  body: Joi.object({
    name: Joi.string().trim().min(1).max(100),
    email: Joi.string().trim().lowercase().email().max(255),
    defaultCurrency: currency,
  })
    .min(1)
    .messages({ 'object.min': 'Send at least one field to change' }),
};

module.exports = { updateProfile };
