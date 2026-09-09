const path = require('path');

require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const isTest = env === 'test';

module.exports = {
  env,
  isTest,
  port: Number(process.env.PORT) || 3000,
  defaultCurrency: (process.env.DEFAULT_CURRENCY || 'INR').toUpperCase(),
  db: {
    storage: path.resolve(
      process.cwd(),
      isTest ? 'data/test.sqlite' : process.env.DB_STORAGE || 'data/splitwise.sqlite'
    ),
    logging: process.env.DB_LOGGING === 'true',
  },
};
