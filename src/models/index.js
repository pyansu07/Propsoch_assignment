const { Sequelize, DataTypes, Op } = require('sequelize');
const config = require('../config');
const databaseConfig = require('../config/database');

const sequelize = new Sequelize(databaseConfig[config.env] || databaseConfig.development);

const models = {
  User: require('./user.model')(sequelize, DataTypes),
  Expense: require('./expense.model')(sequelize, DataTypes),
  ExpenseShare: require('./expenseShare.model')(sequelize, DataTypes),
  Balance: require('./balance.model')(sequelize, DataTypes),
};

Object.values(models).forEach((model) => model.associate && model.associate(models));

module.exports = { sequelize, Op, ...models };
