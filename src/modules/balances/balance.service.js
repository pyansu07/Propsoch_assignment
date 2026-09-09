const { Balance, User, Op } = require('../../models');
const { toMajor } = require('../../utils/money');

// This file is the only thing that writes to the balances table. Keeping one
// owner is what makes "balances always equal the sum of the live expense
// shares" something you can actually reason about.

// Order the pair the way the table stores it, and express the debt in the row's
// convention (positive = B owes A).
function canonicalise(debtorId, creditorId, amountMinor) {
  return debtorId < creditorId
    ? { userAId: debtorId, userBId: creditorId, delta: -amountMinor }
    : { userAId: creditorId, userBId: debtorId, delta: amountMinor };
}

// Turn an expense into a list of debts. Pass reverse when undoing one.
function deltasFromExpense({ paidById, currency, shares }, { reverse = false } = {}) {
  return shares
    .filter((share) => share.userId !== paidById && Number(share.shareMinor) !== 0)
    .map((share) => ({
      debtorId: share.userId,
      creditorId: paidById,
      currency,
      amountMinor: reverse ? -Number(share.shareMinor) : Number(share.shareMinor),
    }));
}

// Apply debts to the ledger, inside the caller's transaction.
//
// The write is `amount_minor = amount_minor + :delta` issued by the database,
// not a read-modify-write in JS. That's the bit that matters: two expenses
// landing on the same pair at the same time can't lose one another's update.
async function applyDeltas(deltas, { transaction }) {
  const merged = new Map();

  for (const { debtorId, creditorId, currency, amountMinor } of deltas) {
    if (!amountMinor) continue;

    const { userAId, userBId, delta } = canonicalise(debtorId, creditorId, amountMinor);
    const key = `${userAId}|${userBId}|${currency}`;
    const running = merged.get(key);

    merged.set(key, { userAId, userBId, currency, delta: (running ? running.delta : 0) + delta });
  }

  // Stable order, so two transactions take locks in the same sequence and
  // can't deadlock against each other on a row-locking engine.
  const rows = [...merged.values()].sort((a, b) =>
    `${a.userAId}${a.userBId}${a.currency}`.localeCompare(`${b.userAId}${b.userBId}${b.currency}`)
  );

  for (const { userAId, userBId, currency, delta } of rows) {
    if (delta === 0) continue;

    const [balance] = await Balance.findOrCreate({
      where: { userAId, userBId, currency },
      defaults: { userAId, userBId, currency, amountMinor: 0 },
      transaction,
    });

    await Balance.increment({ amountMinor: delta }, { where: { id: balance.id }, transaction });
  }
}

async function hasOutstandingBalances(userId, { transaction } = {}) {
  const count = await Balance.count({
    where: {
      [Op.or]: [{ userAId: userId }, { userBId: userId }],
      amountMinor: { [Op.ne]: 0 },
    },
    transaction,
  });

  return count > 0;
}

// Everything owed to or by one user, grouped by the other person and then by
// currency. Currencies are never converted into each other — applying today's
// FX rate would make yesterday's debt change overnight.
async function listForUser(userId) {
  const rows = await Balance.findAll({
    where: {
      [Op.or]: [{ userAId: userId }, { userBId: userId }],
      amountMinor: { [Op.ne]: 0 },
    },
    include: [
      { model: User, as: 'userA', attributes: ['id', 'name'], paranoid: false },
      { model: User, as: 'userB', attributes: ['id', 'name'], paranoid: false },
    ],
    order: [['currency', 'ASC']],
  });

  const people = new Map();
  const totals = new Map();

  for (const row of rows) {
    const isUserA = row.userAId === userId;
    // Flip the sign so positive always means "they owe me".
    const amountMinor = isUserA ? row.amountMinor : -row.amountMinor;
    const other = isUserA ? row.userB : row.userA;

    if (!people.has(other.id)) {
      people.set(other.id, { user: { id: other.id, name: other.name }, balances: [] });
    }

    people.get(other.id).balances.push(describe(amountMinor, row.currency));
    totals.set(row.currency, (totals.get(row.currency) || 0) + amountMinor);
  }

  return {
    totals: [...totals.entries()]
      .map(([currency, amountMinor]) => describe(amountMinor, currency))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    users: [...people.values()].sort((a, b) => a.user.name.localeCompare(b.user.name)),
  };
}

function describe(amountMinor, currency) {
  return {
    currency,
    amount: toMajor(Math.abs(amountMinor)),
    direction: amountMinor > 0 ? 'OWED_TO_YOU' : 'YOU_OWE',
  };
}

module.exports = { applyDeltas, deltasFromExpense, hasOutstandingBalances, listForUser };
