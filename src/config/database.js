const fs = require('fs');
const path = require('path');
const config = require('./index');

fs.mkdirSync(path.dirname(config.db.storage), { recursive: true });

const settings = {
  dialect: 'sqlite',
  storage: config.db.storage,
  logging: config.db.logging ? console.log : false,
  pool: { max: 1, min: 0, acquire: 30000, idle: 10000 },
};

module.exports = {
  development: settings,
  test: settings,
  production: settings,
};
