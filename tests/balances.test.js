const {
  request,
  app,
  API,
  createUser,
  as,
  addExpense,
  getBalances,
  balanceWith,
} = require('./helpers');

describe('Balances', () => {
  let alice;
  let bob;
  let carol;

  beforeEach(async () => {
    alice = await createUser('Alice');
    bob = await createUser('Bob');
    carol = await createUser('Carol');
  });

  it('records the same debt from both sides', async () => {
    await addExpense(alice, {
      name: 'Dinner',
      amount: 1200,
      members: [{ userId: alice.id }, { userId: bob.id }, { userId: carol.id }],
    });

    const mine = await getBalances(alice);
    expect(mine.body.totals).toEqual([
      { currency: 'INR', amount: '800.00', direction: 'OWED_TO_YOU' },
    ]);
    expect(balanceWith(mine.body, bob.id)).toEqual({
      currency: 'INR',
      amount: '400.00',
      direction: 'OWED_TO_YOU',
    });

    const bobs = await getBalances(bob);
    expect(balanceWith(bobs.body, alice.id)).toEqual({
      currency: 'INR',
      amount: '400.00',
      direction: 'YOU_OWE',
    });
    // Bob and Carol were in the same expense but neither paid the other.
    expect(balanceWith(bobs.body, carol.id)).toBeNull();
  });

  it('nets debts going both ways down to one number', async () => {
    const pair = [{ userId: alice.id }, { userId: bob.id }];

    await addExpense(alice, { name: 'Alice paid', amount: 300, members: pair }); // Bob owes 150
    await addExpense(bob, { name: 'Bob paid', amount: 100, members: pair }); //     Alice owes 50

    const mine = await getBalances(alice);
    expect(balanceWith(mine.body, bob.id)).toMatchObject({
      amount: '100.00',
      direction: 'OWED_TO_YOU',
    });
  });

  it('follows the expense when it changes or goes away', async () => {
    const members = [{ userId: alice.id }, { userId: bob.id }, { userId: carol.id }];
    const created = await addExpense(alice, { name: 'Dinner', amount: 1200, members });
    const url = `${API}/expenses/${created.body.id}`;

    await request(app).patch(url).set(as(alice)).send({ amount: 900 });
    expect(balanceWith((await getBalances(alice)).body, bob.id)).toMatchObject({
      amount: '300.00',
    });

    // Changing who paid has to reverse the old direction, not just adjust it.
    await request(app).patch(url).set(as(alice)).send({ paidBy: bob.id });
    expect(balanceWith((await getBalances(alice)).body, bob.id)).toMatchObject({
      amount: '300.00',
      direction: 'YOU_OWE',
    });

    await request(app).delete(url).set(as(alice));
    expect((await getBalances(alice)).body.users).toEqual([]);
    expect((await getBalances(bob)).body.users).toEqual([]);
  });

  it('keeps currencies apart instead of converting them', async () => {
    const pair = [{ userId: alice.id }, { userId: bob.id }];

    await addExpense(alice, { name: 'Rupees', amount: 1000, currency: 'INR', members: pair });
    await addExpense(bob, { name: 'Dollars', amount: 100, currency: 'USD', members: pair });

    const mine = await getBalances(alice);
    expect(mine.body.totals).toEqual([
      { currency: 'INR', amount: '500.00', direction: 'OWED_TO_YOU' },
      { currency: 'USD', amount: '50.00', direction: 'YOU_OWE' },
    ]);
  });

  it('will not let you delete an account that still owes money', async () => {
    await addExpense(alice, {
      name: 'Cab',
      amount: 500,
      members: [{ userId: alice.id }, { userId: bob.id }],
    });

    const blocked = await request(app).delete(`${API}/users/me`).set(as(bob));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('OUTSTANDING_BALANCES');

    // Carol is in nothing, so she can leave.
    expect((await request(app).delete(`${API}/users/me`).set(as(carol))).status).toBe(204);
  });

  it('does not lose updates when expenses land on the same pair at once', async () => {
    const members = [{ userId: alice.id }, { userId: bob.id }];

    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        addExpense(alice, { name: `Round ${i}`, amount: 10, members })
      )
    );

    expect(responses.every((res) => res.status === 201)).toBe(true);

    // 25 expenses of ₹10, split in half, so Bob owes 25 × ₹5.
    expect(balanceWith((await getBalances(alice)).body, bob.id)).toMatchObject({
      amount: '125.00',
      direction: 'OWED_TO_YOU',
    });
  });
});
