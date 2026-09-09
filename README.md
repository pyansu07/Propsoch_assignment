# Splitwise MVP

Expense sharing API for the Propsoch coding round. Node, Express, Sequelize, SQLite.

Design notes and the reasoning behind the schema are in [docs/DESIGN.md](docs/DESIGN.md). Postman collection is in [postman/](postman/Splitwise-MVP.postman_collection.json).

## Running it

```bash
npm install
npm run db:reset    # migrations + three demo users
npm start           # http://localhost:3000
npm test
```

No `.env` needed to get going — the defaults in [src/config/index.js](src/config/index.js) are enough. Copy `.env.example` if you want to change the port or the database file.

The seed gives you three users and one expense: Aarav paid ₹1200 for dinner split three ways, so Diya and Rohan each owe him ₹400.

| Name | Id |
|---|---|
| Aarav Sharma | `11111111-1111-4111-8111-111111111111` |
| Diya Patel | `22222222-2222-4222-8222-222222222222` |
| Rohan Mehta | `33333333-3333-4333-8333-333333333333` |

## What I built

The brief marks five things in bold and says to let the rest shape the schema. So those five are the API, and the rest shows up as columns nothing reads yet.

| Endpoint | |
|---|---|
| `GET /api/v1/users/me` | profile |
| `PATCH /api/v1/users/me` | change email and default currency |
| `DELETE /api/v1/users/me` | delete account |
| `POST /api/v1/expenses` | add an expense |
| `GET /api/v1/expenses?from=&to=` | expenses you're part of |
| `GET /api/v1/expenses/:id` | one expense |
| `PATCH /api/v1/expenses/:id` | update it, balances follow |
| `DELETE /api/v1/expenses/:id` | delete it, balances follow |
| `GET /api/v1/balances` | what you owe and are owed, per person |

**No auth layer.** The brief says not to build one and to assume the caller's id is on the request, so every call takes an `X-User-Id: <uuid>` header and that's it — [one file](src/middlewares/identify.js). There's no registration endpoint either; users come from the seed. The `password_hash` column exists because login is in the spec, but nothing reads it yet.

**All three split types work** — `EQUAL`, `EXACT` (every member's amount stated outright) and `PERCENT`. They're three entries in [split.strategies.js](src/modules/expenses/split.strategies.js) and adding a fourth doesn't touch anything else.

**Not built:** the activity log grouped by month, and the monthly balance email. `GET /expenses` already filters by date and `expenses.created_by_id` records who entered an expense, which is what the activity log would need.

## Adding an expense

```http
POST /api/v1/expenses
X-User-Id: 11111111-1111-4111-8111-111111111111

{
  "name": "Dinner at Toit",
  "amount": 100,
  "currency": "INR",
  "date": "2026-09-08",
  "members": [
    { "userId": "11111111-1111-4111-8111-111111111111" },
    { "userId": "22222222-2222-4222-8222-222222222222" },
    { "userId": "33333333-3333-4333-8333-333333333333" }
  ]
}
```

`currency` falls back to the payer's default, `date` to today, `paidBy` to the caller, `splitType` to `EQUAL`. The payer doesn't have to be one of the members — if you're paying for a gift you aren't sharing in, you're owed the whole thing.

That request comes back with shares of `33.34 / 33.33 / 33.33`. ₹100 doesn't divide by three, and the paisa has to land somewhere rather than disappear.

For `EXACT`, each member carries an `amount`; for `PERCENT`, a `percent`. Both are rejected with `SPLIT_MISMATCH` if they don't come to the total (or to 100).

Errors are `{ "error": { "code": "...", "message": "..." } }`. Everything else returns the resource.

## The three decisions I'd defend

**Money is stored as integer paise, never floats.** Amounts are parsed off the string (`"1200.50"` → `120050`) and formatted back to a string on the way out, so nothing gets rounded in transit. `0.1 + 0.2 !== 0.3` is not a thing you want anywhere near a ledger. Every split is checked against `sum(shares) === total` before it's allowed to touch a balance.

That check is why `PERCENT` uses the largest-remainder method rather than rounding each share on its own. Flooring per member loses up to a paisa each — 33.33 / 33.33 / 33.34 of ₹10 floors to ₹3.33 three times, which is ₹9.99 against a ₹10 expense. Instead everyone gets floored and the leftovers go back to whoever was cut hardest. That's the piece I'd most want to walk through if it comes up.

**Balances are their own table, not a query.** The brief asks for a balances model, and "what do I owe everyone" is the screen people open most — it shouldn't get slower as an account fills up with years of expenses. One row per pair per currency, stored with the ids sorted so a pair can't end up with two rows that disagree. It's derived data, so it's only written inside the same transaction as the expense that moved it, and only by [one file](src/modules/balances/balance.service.js).

**Updates to a balance are `amount = amount + delta` in SQL,** not read-modify-write in JS. That's the difference between two simultaneous expenses both landing and one of them silently vanishing. Expense edits use a `version` column on top of that, so two people editing the same expense get a 409 instead of last-write-wins.

There's one wrinkle: Sequelize's SQLite driver gives every pooled connection the same underlying handle, so overlapping transactions just fail with `SQLITE_BUSY`. I found that writing the concurrency test. Write transactions queue behind each other in [src/utils/db.js](src/utils/db.js) — free on a single-file database, and it's the only thing that would need deleting on MySQL.

## Tests

```
tests/expenses.test.js   CRUD, splitting, validation, permissions, stale updates
tests/balances.test.js   netting, currencies, reversal, account deletion, concurrency
```

14 tests, not exhaustive coverage — the ones where getting it wrong would actually cost someone money. The last one fires 25 expenses at the same pair at once and checks the balance lands on exactly ₹125.
