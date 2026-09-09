'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Fixed UUIDs so the Postman collection can reference the seeded users
 * directly via the `X-User-Id` header without a lookup step.
 */
const USERS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Aarav Sharma', email: 'aarav@example.com' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Diya Patel', email: 'diya@example.com' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Rohan Mehta', email: 'rohan@example.com' },
];

const EXPENSE_ID = '44444444-4444-4444-8444-444444444444';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const passwordHash = await bcrypt.hash('Password123', 10);

    await queryInterface.bulkInsert(
      'users',
      USERS.map((user) => ({
        ...user,
        password_hash: passwordHash,
        default_currency: 'INR',
        created_at: now,
        updated_at: now,
      }))
    );

    // Aarav paid ₹1200 for dinner, split equally three ways (400 each).
    await queryInterface.bulkInsert('expenses', [
      {
        id: EXPENSE_ID,
        name: 'Dinner at Toit',
        amount_minor: 120000,
        currency: 'INR',
        date: now.toISOString().slice(0, 10),
        paid_by_id: USERS[0].id,
        created_by_id: USERS[0].id,
        split_type: 'EQUAL',
        version: 0,
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert(
      'expense_shares',
      USERS.map((user) => ({
        id: crypto.randomUUID(),
        expense_id: EXPENSE_ID,
        user_id: user.id,
        share_minor: 40000,
        created_at: now,
        updated_at: now,
      }))
    );

    // Diya and Rohan each owe Aarav ₹400.
    await queryInterface.bulkInsert(
      'balances',
      [USERS[1], USERS[2]].map((debtor) => {
        const [userA, userB] =
          debtor.id < USERS[0].id ? [debtor.id, USERS[0].id] : [USERS[0].id, debtor.id];
        return {
          id: crypto.randomUUID(),
          user_a_id: userA,
          user_b_id: userB,
          currency: 'INR',
          // amount > 0 means userB owes userA.
          amount_minor: userA === USERS[0].id ? 40000 : -40000,
          created_at: now,
          updated_at: now,
        };
      })
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('balances', null, {});
    await queryInterface.bulkDelete('expense_shares', null, {});
    await queryInterface.bulkDelete('expenses', null, {});
    await queryInterface.bulkDelete('users', null, {});
  },
};
