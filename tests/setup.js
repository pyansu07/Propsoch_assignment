const { sequelize, User, Expense, ExpenseShare, Balance } = require('../src/models');

beforeAll(() => sequelize.sync({ force: true }));

// Children first — foreign keys are on.
beforeEach(async () => {
  await Balance.destroy({ where: {}, force: true });
  await ExpenseShare.destroy({ where: {}, force: true });
  await Expense.destroy({ where: {}, force: true });
  await User.destroy({ where: {}, force: true });
});

afterAll(() => sequelize.close());
