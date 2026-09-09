const ApiError = require('../../utils/ApiError');
const { toMinor, toMajor, splitEqually } = require('../../utils/money');

// A strategy takes the total (minor units) and the members, and returns one
// share per member. The only rule is that the shares add back up to the total,
// which computeShares checks before anything reaches the ledger.
//
// Another way to split (by shares, itemised) is one more entry here and
// nothing else.

// Sort by id so the same expense always rounds the same way. Otherwise the odd
// paisa follows whatever order the client happened to send, and re-ordering the
// array in an update quietly moves money between two people.
const sortById = (members) => [...members].sort((a, b) => a.userId.localeCompare(b.userId));

const strategies = {
  EQUAL(totalMinor, members) {
    const sorted = sortById(members);
    const shares = splitEqually(totalMinor, sorted.length);

    return sorted.map((member, i) => ({ userId: member.userId, shareMinor: shares[i] }));
  },

  // Everyone's amount is stated outright, so there's nothing to round — but it
  // does have to add up. computeShares would catch a mismatch too, except its
  // message is for bugs in this file, not for a client that typed the wrong
  // number. Fail here with something the caller can act on.
  EXACT(totalMinor, members) {
    const shares = sortById(members).map((member) => ({
      userId: member.userId,
      shareMinor: toMinor(member.amount, 'members[].amount'),
    }));

    const sum = shares.reduce((total, share) => total + share.shareMinor, 0);
    if (sum !== totalMinor) {
      throw ApiError.badRequest(
        `Member amounts come to ${toMajor(sum)}, but the expense is ${toMajor(totalMinor)}`,
        'SPLIT_MISMATCH'
      );
    }

    return shares;
  },

  // Percentages are held as basis points (100% = 10000) for the same reason
  // money is held in paise — 33.33 has to stay 33.33 and not drift.
  PERCENT(totalMinor, members) {
    const sorted = sortById(members);
    const points = sorted.map((member) => toMinor(member.percent, 'members[].percent'));

    const stated = points.reduce((sum, bps) => sum + bps, 0);
    if (stated !== 10000) {
      throw ApiError.badRequest(
        `Member percentages come to ${toMajor(stated)}, but they have to make 100`,
        'SPLIT_MISMATCH'
      );
    }

    // Largest remainder. Rounding each share on its own loses up to a paisa per
    // member: 33.33 / 33.33 / 33.34 of ₹10 floors to 3.33 / 3.33 / 3.33, which
    // is ₹9.99 and leaves the ledger a paisa short of the expense. So floor
    // everyone, then hand the leftovers back to whoever was cut hardest.
    const shares = points.map((bps) => Math.trunc((totalMinor * bps) / 10000));
    const cutHardest = points
      .map((bps, i) => ({ i, remainder: (totalMinor * bps) % 10000 }))
      .sort((a, b) => b.remainder - a.remainder || a.i - b.i);

    // Flooring can never lose a whole unit per member, so there are always
    // fewer leftovers than members and this stays in range.
    let leftover = totalMinor - shares.reduce((sum, share) => sum + share, 0);
    for (let n = 0; leftover > 0; n += 1, leftover -= 1) {
      shares[cutHardest[n].i] += 1;
    }

    return sorted.map((member, i) => ({ userId: member.userId, shareMinor: shares[i] }));
  },
};

function computeShares({ splitType, totalMinor, members }) {
  const strategy = strategies[splitType];
  if (!strategy) throw ApiError.badRequest(`Unknown splitType "${splitType}"`);

  const shares = strategy(totalMinor, members);

  // A bug in a strategy would quietly create or destroy money, so check.
  const sum = shares.reduce((total, share) => total + share.shareMinor, 0);
  if (sum !== totalMinor) {
    throw new Error(`Split came to ${sum} but the expense is ${totalMinor}`);
  }

  return shares;
}

module.exports = { computeShares, SPLIT_TYPES: Object.keys(strategies) };
