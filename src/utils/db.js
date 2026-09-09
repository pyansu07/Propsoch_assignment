const { sequelize } = require('../models');

// Quick heads-up: Sequelize's SQLite driver shares one connection handle across the whole pool.
// If two writes overlap, they hit the same handle and crash with SQLITE_BUSY.
//
// So, we're queuing write transactions one by one here. SQLite serializes writes anyway, 
// so this costs nothing. If we ever switch to MySQL, just delete this file and use 
// sequelize.transaction directly.
let queue = Promise.resolve();

function runInTransaction(work) {
  const run = () => sequelize.transaction(work);
  const result = queue.then(run, run);

  // Keep the chain alive whether the caller succeeded or blew up.
  queue = result.then(
    () => {},
    () => {}
  );

  return result;
}

module.exports = { runInTransaction };
