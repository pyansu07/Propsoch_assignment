# Design notes

Why things are the way they are, and what I left out on purpose.

## Scope

The brief marks five capabilities in bold and says the rest should influence the schema rather than get built. I took that literally, because 72 hours is not a lot and building the unmarked things would have meant less care on the marked ones.

Built: profile read/update, account deletion, expense create/read/update/delete, balances.

Not built, but the schema accounts for them: login, the activity log grouped by month, and the monthly balance email.

All three split types — EQUAL, EXACT and PERCENT — are implemented. They're small once the rounding is settled, and leaving two of the three out would have made `split_type` a column with nothing behind it.

## Schema

```
users            id, name, email (unique), password_hash, default_currency, deleted_at
expenses         id, name, amount_minor, currency, date, paid_by_id,
                 created_by_id, split_type, version, deleted_at
expense_shares   id, expense_id, user_id, share_minor     unique(expense_id, user_id)
balances         id, user_a_id, user_b_id, currency, amount_minor
                 unique(user_a_id, user_b_id, currency)
```

Four columns are there because of the parts of the spec I didn't build:

- `expenses.created_by_id` — the activity log has to show expenses "added by them or other users", so who entered an expense has to be separate from who paid for it. Nothing reads it yet.
- `expenses.date` as its own column, separate from `created_at` — the activity log groups by when the expense happened, not when someone typed it in. Entering last month's dinner today should land in last month.
- `users.password_hash` — login is in the spec. There's no endpoint that reads it.
- `balances.currency` — the monthly report has to state a figure per currency. A single netted number across INR and USD wouldn't mean anything.

`users.deleted_at` and `expenses.deleted_at` are soft deletes. Hard-deleting a user would orphan everyone else's expense history, and a deleted expense still needs to be auditable.

`date` is a `DATE`, not a timestamp. An expense happens on a day; storing a timestamp means the day it belongs to shifts depending on the reader's timezone, and "group by month" starts depending on who's looking.

`split_type` is a `VARCHAR` with the check in the application rather than a database `ENUM`. Adding a value to a MySQL enum is a table alter; adding one here is a deploy.

## Money

Stored as whole minor units — paise. Amounts are parsed off the string, so binary floating point never gets into the conversion, and they come back out as strings so nothing rounds on the way through. A `DECIMAL` column would be fine in the database, but it arrives in Node as a string or a lossy float, and the splitting arithmetic happens in Node. Integers are exact in both places.

Every currency is assumed to have two decimal places. JPY and KRW don't. That's one lookup table in `utils/money.js` when it matters.

EQUAL splits round with the leftover minor units going one each to the first few members, ordered by user id. The id ordering is the part that matters — without it, ₹100 across three people gives the extra paisa to whoever the client happened to list first, and re-ordering the array in an update silently moves a paisa between two people.

PERCENT needs more than that, and it's the one bit of arithmetic here I'd want to explain out loud. Percentages are held as basis points (100% = 10000) so 33.33 stays exact. But converting each share independently and flooring loses up to a minor unit per member: 33.33 / 33.33 / 33.34 of ₹10 gives ₹3.33 three times, which is ₹9.99 against a ₹10 expense, and `computeShares` would reject it. So it uses the largest-remainder method — floor everyone, then hand the leftover units back to whoever was cut hardest, ties broken by user id for the same determinism reason as EQUAL. EXACT does no rounding at all; the caller's amounts either add up or the request is rejected with `SPLIT_MISMATCH`.

## Balances

The invariant is that `balances` always equals the sum of the live expense shares. The way I keep that true is by giving it exactly one owner: `balance.service.js` is the only file that writes the table, and every write goes through `applyDeltas` with the caller's transaction.

Create applies the deltas. Delete applies them reversed. Update applies the old ones reversed and then the new ones, in a single transaction — using the *old* payer and *old* currency for the reversal, which is the bit that's easy to get wrong when someone corrects who actually paid.

Computing balances on demand with a `SUM` over `expense_shares` would be simpler and could never drift. I didn't, because the brief explicitly asks for a balances model and because this is the query behind the app's home screen. The cost is a consistency risk, which is why there's one writer and a unique index. In production I'd add a nightly job that recomputes from `expense_shares` and shouts if the two disagree — that query is three lines and it's cheap insurance.

The pair is stored with the ids sorted, so `(A, B)` and `(B, A)` are the same row. Two directional rows would be two things that can disagree, and every read would have to reconcile them.

## Concurrency

Two expenses can land on the same pair at the same time, so the balance write is `amount_minor = amount_minor + :delta` issued by the database rather than a read-modify-write in JS. That's the whole trick — a JS round trip would drop one of the two.

Two people can edit the same expense, so `expenses` has a `version` column. Send the version you read; if it's moved on you get a 409 instead of overwriting someone. Sequelize's own optimistic locking covers the gap between reading and writing inside a single request.

Balance rows are touched in a sorted order so two transactions take locks in the same sequence, which is what stops them deadlocking on a row-locking engine.

`SELECT ... FOR UPDATE` would also work, but it's dialect-specific (SQLite ignores it) and it holds the pair for the whole transaction. The atomic increment holds a lock for one statement and works everywhere.

**The SQLite problem.** Sequelize's SQLite driver caches one `sqlite3` handle and hands it to every pooled connection, so two overlapping `BEGIN`s hit the same handle and fail with `SQLITE_BUSY` no matter how the pool is sized. This is a driver limitation, not something in the application, and I only found it because I wrote the concurrency test. Write transactions queue behind each other in `utils/db.js`. That costs nothing here because a single-file database serialises writes anyway, and it's fifteen lines in one file, so moving to MySQL means deleting it.

Worth saying out loud: because writes are queued, the concurrency test doesn't *prove* the atomic increment is doing the work. The increment is what makes the code correct on a real database; the queue is a workaround for the driver. I'd rather have both and be able to explain the difference.

## Rules I picked, that could go the other way

- **Deleting an account is blocked while balances are outstanding.** The alternative is letting the debt vanish from the other person's side. But it does mean someone can be held hostage by a counterparty who won't settle up. Real Splitwise lets you leave and keeps the debt visible.
- **Any participant can edit or delete an expense**, not just whoever created it. Matches Splitwise, but it means someone can change a number you both agreed on. An edit history would resolve that better than a permission rule.
- **Deleting an account rewrites the email** to `deleted+<id>@deleted.invalid`, freeing it for reuse while keeping the row so old expenses still resolve a member.
- **Currencies are never converted.** Balances are per currency. If a single netted figure is wanted, we'd need to agree when the FX rate gets captured — at expense time is auditable, at read time means yesterday's debt changes overnight.

## Where the next thing plugs in

- **Another split type** (by shares, itemised) — one more entry in `split.strategies.js`.
- **Settle up** — a settlement is an expense with one member and no split, feeding the same `applyDeltas`. The ledger doesn't change.
- **Groups** — `groups` and `group_members` tables, `expenses.group_id` nullable. Balances stay per-pair; a group view is a filter over the same rows.
- **Several people paying for one expense** — an `expense_payments(expense_id, user_id, paid_minor)` table. `deltasFromExpense` goes from one creditor to creditors in proportion to what they paid. That's one function; the balances table and the API don't move.
- **Activity log** — `GET /expenses` already filters by date over an indexed column, and `created_by_id` is there. The month grouping is presentation on top of the existing query.
- **Monthly email** — a scheduled job calling `listForUser`, which doesn't know anything about HTTP.

## What I'd do before this went near production

Rate limiting. A real token check in `identify.js`. The nightly reconciliation job. Pagination on `GET /expenses` — it returns everything right now, which is fine for a demo and not fine for a real account. A settle-up endpoint, because without one balances only ever grow.

## Questions I'd want to ask

1. Should an expense be editable by anyone in it, or only whoever added it? I went with anyone, matching Splitwise, but I'm not sure that's right without an edit history.
2. What should actually happen when someone with an outstanding balance wants to leave? Blocking is the safe answer and also the annoying one.
3. Per-pair balances or per-group? Per-pair matches "balances with all different users" literally, but groups change what "settled" means.
4. If multi-currency balances should net into one figure, when is the rate captured?
