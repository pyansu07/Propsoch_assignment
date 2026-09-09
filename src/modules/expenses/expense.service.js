const { Expense, ExpenseShare, User, Op } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { toMinor, toMajor } = require('../../utils/money');
const { runInTransaction } = require('../../utils/db');
const { computeShares } = require('./split.strategies');
const balances = require('../balances/balance.service');

// paranoid: false on the user includes, so someone who deleted their account
// still shows up in the expenses they were part of.
const withMembers = [
  {
    model: ExpenseShare,
    as: 'shares',
    include: [{ model: User, as: 'user', attributes: ['id', 'name'], paranoid: false }],
  },
  { model: User, as: 'paidBy', attributes: ['id', 'name'], paranoid: false },
];

function serialize(expense) {
  return {
    id: expense.id,
    name: expense.name,
    amount: toMajor(expense.amountMinor),
    currency: expense.currency,
    date: expense.date,
    splitType: expense.splitType,
    version: expense.version,
    paidBy: { id: expense.paidBy.id, name: expense.paidBy.name },
    members: expense.shares
      .map((share) => ({
        user: { id: share.user.id, name: share.user.name },
        share: toMajor(share.shareMinor),
      }))
      .sort((a, b) => a.user.id.localeCompare(b.user.id)),
  };
}

async function load(expenseId) {
  const expense = await Expense.findByPk(expenseId, { include: withMembers });
  if (!expense) throw ApiError.notFound('No expense with that id');

  return expense;
}

function assertPartOf(expense, userId, shares = expense.shares) {
  const involved = expense.paidById === userId || shares.some((share) => share.userId === userId);
  if (!involved) throw ApiError.forbidden('You are not part of this expense');
}

// Members must be distinct and must actually exist. Soft-deleted users don't
// come back from findAll, so they can't be added to anything new.
async function resolveMembers(members, paidById, { transaction } = {}) {
  const ids = members.map((member) => member.userId);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);

  if (duplicates.length) {
    throw ApiError.badRequest('A user can only appear once in members');
  }

  const wanted = [...new Set([...ids, paidById])];
  const found = await User.findAll({
    where: { id: { [Op.in]: wanted } },
    attributes: ['id'],
    transaction,
  });

  if (found.length !== wanted.length) {
    throw ApiError.badRequest('One or more of those users do not exist', 'UNKNOWN_USER');
  }
}

async function create(actor, input) {
  const currency = input.currency || actor.defaultCurrency;
  const totalMinor = toMinor(input.amount);
  const paidById = input.paidBy || actor.id;
  const splitType = input.splitType || 'EQUAL';

  // You can record an expense someone else paid for, but you have to be in it.
  const isMember = input.members.some((member) => member.userId === actor.id);
  if (paidById !== actor.id && !isMember) {
    throw ApiError.forbidden('You can only record expenses you are part of');
  }

  await resolveMembers(input.members, paidById);
  const shares = computeShares({ splitType, totalMinor, members: input.members });

  const expenseId = await runInTransaction(async (transaction) => {
    const expense = await Expense.create(
      {
        name: input.name,
        amountMinor: totalMinor,
        currency,
        date: input.date || new Date().toISOString().slice(0, 10),
        paidById,
        createdById: actor.id,
        splitType,
      },
      { transaction }
    );

    await ExpenseShare.bulkCreate(
      shares.map((share) => ({ expenseId: expense.id, ...share })),
      { transaction }
    );

    await balances.applyDeltas(balances.deltasFromExpense({ paidById, currency, shares }), {
      transaction,
    });

    return expense.id;
  });

  return getOne(actor, expenseId);
}

async function update(actor, expenseId, input) {
  await runInTransaction(async (transaction) => {
    const expense = await Expense.findByPk(expenseId, { transaction });
    if (!expense) throw ApiError.notFound('No expense with that id');

    const oldShares = await ExpenseShare.findAll({ where: { expenseId }, transaction });
    assertPartOf(expense, actor.id, oldShares);

    // Optimistic locking. Send back the version you read; if it moved on, you
    // get a 409 instead of quietly clobbering someone else's edit.
    if (input.version !== undefined && input.version !== expense.version) {
      throw ApiError.conflict('Someone else changed this expense. Reload and try again.', 'STALE');
    }

    const currency = input.currency || expense.currency;
    const totalMinor = input.amount !== undefined ? toMinor(input.amount) : expense.amountMinor;
    const paidById = input.paidBy || expense.paidById;
    const splitType = input.splitType || expense.splitType;
    const membersGiven = input.members !== undefined;
    const members = input.members || oldShares.map((share) => ({ userId: share.userId }));

    await resolveMembers(members, paidById, { transaction });

    // Changing the name or the payer leaves the split alone, so don't re-derive
    // it. This matters for EXACT and PERCENT: the amounts and percentages only
    // ever exist in the request that set them, so the stored shares aren't
    // enough to rebuild the split from.
    const splitAffected =
      membersGiven || totalMinor !== expense.amountMinor || splitType !== expense.splitType;

    if (splitAffected && !membersGiven && splitType !== 'EQUAL') {
      throw ApiError.badRequest(
        `${splitType} splits need "members" sent as well when the amount changes`,
        'SPLIT_MISMATCH'
      );
    }

    const newShares = splitAffected
      ? computeShares({ splitType, totalMinor, members })
      : oldShares.map((share) => ({ userId: share.userId, shareMinor: share.shareMinor }));

    if (paidById !== actor.id && !newShares.some((share) => share.userId === actor.id)) {
      throw ApiError.forbidden('You cannot take yourself out of an expense you are editing');
    }

    // Undo the old effect on the ledger using the old payer and old currency,
    // then apply the new one. Both in this transaction, so a failure anywhere
    // leaves the balances untouched.
    await balances.applyDeltas(
      balances.deltasFromExpense(
        { paidById: expense.paidById, currency: expense.currency, shares: oldShares },
        { reverse: true }
      ),
      { transaction }
    );

    expense.set({
      name: input.name ?? expense.name,
      amountMinor: totalMinor,
      currency,
      date: input.date ?? expense.date,
      paidById,
      splitType,
    });
    await expense.save({ transaction });

    await ExpenseShare.destroy({ where: { expenseId }, transaction });
    await ExpenseShare.bulkCreate(
      newShares.map((share) => ({ expenseId, ...share })),
      { transaction }
    );

    await balances.applyDeltas(balances.deltasFromExpense({ paidById, currency, shares: newShares }), {
      transaction,
    });
  });

  return getOne(actor, expenseId);
}

function remove(actor, expenseId) {
  return runInTransaction(async (transaction) => {
    const expense = await Expense.findByPk(expenseId, { transaction });
    if (!expense) throw ApiError.notFound('No expense with that id');

    const shares = await ExpenseShare.findAll({ where: { expenseId }, transaction });
    assertPartOf(expense, actor.id, shares);

    await balances.applyDeltas(
      balances.deltasFromExpense(
        { paidById: expense.paidById, currency: expense.currency, shares },
        { reverse: true }
      ),
      { transaction }
    );

    // Soft delete — the row stays for audit, the balance goes back immediately.
    await expense.destroy({ transaction });
  });
}

async function getOne(actor, expenseId) {
  const expense = await load(expenseId);
  assertPartOf(expense, actor.id);

  return serialize(expense);
}

// Expenses the caller is part of: ones they paid for, plus ones they hold a
// share in. Two queries rather than a join with an OR across both tables.
async function list(actor, { from, to } = {}) {
  const shares = await ExpenseShare.findAll({
    where: { userId: actor.id },
    attributes: ['expenseId'],
    raw: true,
  });

  const where = {
    [Op.or]: [{ paidById: actor.id }, { id: shares.map((share) => share.expenseId) }],
  };

  if (from || to) {
    where.date = {
      ...(from ? { [Op.gte]: from } : {}),
      ...(to ? { [Op.lte]: to } : {}),
    };
  }

  const expenses = await Expense.findAll({
    where,
    include: withMembers,
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });

  return expenses.map(serialize);
}

module.exports = { create, update, remove, getOne, list };
