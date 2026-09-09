const ApiError = require('../../utils/ApiError');
const { runInTransaction } = require('../../utils/db');
const balances = require('../balances/balance.service');

function profile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    defaultCurrency: user.defaultCurrency,
  };
}

// The spec only asks for email and currency to be editable. Name is in here
// because leaving it out of a profile endpoint would be odd.
//
// Changing the default currency doesn't touch existing expenses or balances —
// they keep the currency they were recorded in. Re-denominating history would
// rewrite what people owe each other.
async function updateProfile(user, changes) {
  await user.update(changes);
  return profile(user);
}

// Soft delete, and only once everything is settled. Letting someone delete
// while they're owed money (or owe it) would just make the debt disappear from
// the other person's side.
function deleteAccount(user) {
  return runInTransaction(async (transaction) => {
    if (await balances.hasOutstandingBalances(user.id, { transaction })) {
      throw ApiError.conflict('Settle up before deleting your account', 'OUTSTANDING_BALANCES');
    }

    // Free the email for reuse but keep the row, so old expenses still resolve
    // a member.
    await user.update({ email: `deleted+${user.id}@deleted.invalid` }, { transaction });
    await user.destroy({ transaction });
  });
}

module.exports = { profile, updateProfile, deleteAccount };
