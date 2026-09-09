const { request, app, API, createUser, as, addExpense } = require('./helpers');

describe('Expenses', () => {
  let alice;
  let bob;
  let carol;

  beforeEach(async () => {
    alice = await createUser('Alice');
    bob = await createUser('Bob');
    carol = await createUser('Carol');
  });

  it('splits an expense equally without losing a paisa', async () => {
    const res = await addExpense(alice, {
      name: 'Dinner at Toit',
      amount: 100,
      currency: 'INR',
      date: '2026-09-08',
      members: [{ userId: alice.id }, { userId: bob.id }, { userId: carol.id }],
    });

    expect(res.status).toBe(201);
    expect(res.body.amount).toBe('100.00');
    expect(res.body.paidBy.id).toBe(alice.id);

    // ₹100 across three people doesn't divide evenly.
    const shares = res.body.members.map((member) => member.share).sort();
    expect(shares).toEqual(['33.33', '33.33', '33.34']);
  });

  it('takes the amounts as given on an EXACT split', async () => {
    const res = await addExpense(alice, {
      name: 'Groceries',
      amount: 1000,
      splitType: 'EXACT',
      members: [
        { userId: alice.id, amount: 400 },
        { userId: bob.id, amount: '600.00' },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.members.map((member) => member.share).sort()).toEqual(['400.00', '600.00']);
  });

  it('rejects a split that does not come to the total', async () => {
    const exact = await addExpense(alice, {
      name: 'Groceries',
      amount: 1000,
      splitType: 'EXACT',
      members: [
        { userId: alice.id, amount: 400 },
        { userId: bob.id, amount: 500 },
      ],
    });

    expect(exact.status).toBe(400);
    expect(exact.body.error.code).toBe('SPLIT_MISMATCH');
    expect(exact.body.error.message).toMatch(/900\.00.*1000\.00/);

    const percent = await addExpense(alice, {
      name: 'Rent',
      amount: 1000,
      splitType: 'PERCENT',
      members: [
        { userId: alice.id, percent: 60 },
        { userId: bob.id, percent: 30 },
      ],
    });

    expect(percent.status).toBe(400);
    expect(percent.body.error.code).toBe('SPLIT_MISMATCH');
  });

  it('hands out the leftover paisa on a PERCENT split that will not divide', async () => {
    const res = await addExpense(alice, {
      name: 'Split three ways-ish',
      amount: 10,
      splitType: 'PERCENT',
      members: [
        { userId: alice.id, percent: 33.33 },
        { userId: bob.id, percent: 33.33 },
        { userId: carol.id, percent: 33.34 },
      ],
    });

    expect(res.status).toBe(201);

    // Flooring each share on its own would give 3.33 three times, i.e. ₹9.99.
    const shares = res.body.members.map((member) => member.share);
    expect(shares.slice().sort()).toEqual(['3.33', '3.33', '3.34']);

    const sum = shares.reduce((total, share) => total + Math.round(Number(share) * 100), 0);
    expect(sum).toBe(1000);
  });

  it('rejects input that would corrupt the ledger', async () => {
    const bad = [
      { name: 'Zero', amount: 0, members: [{ userId: alice.id }] },
      { name: 'Negative', amount: -50, members: [{ userId: alice.id }] },
      { name: 'Sub-paisa', amount: '10.005', members: [{ userId: alice.id }] },
      { name: 'Not a real date', amount: 10, date: '2026-02-30', members: [{ userId: alice.id }] },
      { name: 'No members', amount: 10, members: [] },
      { name: 'Same person twice', amount: 10, members: [{ userId: alice.id }, { userId: alice.id }] },
      {
        name: 'Unknown member',
        amount: 10,
        members: [{ userId: alice.id }, { userId: '99999999-9999-4999-8999-999999999999' }],
      },
    ];

    for (const body of bad) {
      const res = await addExpense(alice, body);
      expect([body.name, res.status]).toEqual([body.name, 400]);
    }
  });

  it('only lists expenses you are part of, and filters by date', async () => {
    const pair = [{ userId: alice.id }, { userId: bob.id }];

    await addExpense(alice, { name: 'August', amount: 10, date: '2026-08-15', members: pair });
    await addExpense(alice, { name: 'September', amount: 10, date: '2026-09-15', members: pair });
    await addExpense(bob, {
      name: 'Bob and Carol',
      amount: 20,
      members: [{ userId: bob.id }, { userId: carol.id }],
    });

    const mine = await request(app).get(`${API}/expenses`).set(as(alice));
    expect(mine.body.map((expense) => expense.name)).toEqual(['September', 'August']);

    const thisMonth = await request(app)
      .get(`${API}/expenses`)
      .query({ from: '2026-09-01', to: '2026-09-30' })
      .set(as(alice));
    expect(thisMonth.body.map((expense) => expense.name)).toEqual(['September']);
  });

  it('keeps an expense private to the people in it', async () => {
    const created = await addExpense(alice, {
      name: 'Dinner',
      amount: 100,
      members: [{ userId: alice.id }, { userId: bob.id }],
    });
    const url = `${API}/expenses/${created.body.id}`;

    expect((await request(app).get(url).set(as(bob))).status).toBe(200);
    expect((await request(app).get(url).set(as(carol))).status).toBe(403);
    expect((await request(app).patch(url).set(as(carol)).send({ amount: 1 })).status).toBe(403);
  });

  it('re-splits on update, and refuses a stale one', async () => {
    const created = await addExpense(alice, {
      name: 'Dinner',
      amount: 1200,
      members: [{ userId: alice.id }, { userId: bob.id }, { userId: carol.id }],
    });
    const { id, version } = created.body;

    const first = await request(app)
      .patch(`${API}/expenses/${id}`)
      .set(as(alice))
      .send({ amount: 900, name: 'Dinner (corrected)', version });

    expect(first.status).toBe(200);
    expect(first.body.name).toBe('Dinner (corrected)');
    expect(first.body.members.map((member) => member.share)).toEqual(['300.00', '300.00', '300.00']);

    // Bob is still holding the version he read before Alice's edit.
    const stale = await request(app)
      .patch(`${API}/expenses/${id}`)
      .set(as(bob))
      .send({ amount: 800, version });

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE');
  });

  it('deletes an expense', async () => {
    const created = await addExpense(alice, {
      name: 'Dinner',
      amount: 100,
      members: [{ userId: alice.id }, { userId: bob.id }],
    });
    const url = `${API}/expenses/${created.body.id}`;

    expect((await request(app).delete(url).set(as(alice))).status).toBe(204);
    expect((await request(app).get(url).set(as(alice))).status).toBe(404);
    expect((await request(app).get(`${API}/expenses`).set(as(alice))).body).toEqual([]);
  });

  it('needs a caller id', async () => {
    expect((await request(app).get(`${API}/expenses`)).status).toBe(401);
  });
});
