const app = require('./app');
const config = require('./config');
const { sequelize } = require('./models');

async function start() {
  try {
    await sequelize.authenticate();
    // Fail here with something useful rather than on the first request.
    await sequelize.getQueryInterface().describeTable('users');
  } catch (error) {
    console.error('Database is not set up. Run `npm run db:reset` first.');
    console.error(error.message);
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`Splitwise API listening on http://localhost:${config.port}/api/v1`);
  });
}

start();
