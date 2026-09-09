const ApiError = require('./ApiError');

// Money is stored and computed as whole minor units — paise, cents. Floats
// never touch it, because `0.1 + 0.2 !== 0.3` is not something you want in a
// ledger. Amounts come in as strings/numbers and go out as strings, so nothing
// gets rounded on the way through.
//
// Every currency here is assumed to have 2 decimal places. JPY and KRW don't,
// which would mean a per-currency lookup in EXPONENT — not worth it for the MVP.
const EXPONENT = 2;
const FACTOR = 10 ** EXPONENT;
const AMOUNT = /^\d{1,13}(\.\d{1,2})?$/;

// "1200.5" -> 120050. Parsed off the string so binary floating point never
// enters the conversion.
function toMinor(value, field = 'amount') {
  const raw = String(value).trim();

  if (!AMOUNT.test(raw)) {
    throw ApiError.badRequest(`"${field}" must be a positive number with at most 2 decimal places`);
  }

  const [whole, fraction = ''] = raw.split('.');
  const minor = Number(whole) * FACTOR + Number(fraction.padEnd(EXPONENT, '0') || 0);

  if (!Number.isSafeInteger(minor)) {
    throw ApiError.badRequest(`"${field}" is too large`);
  }

  return minor;
}

// 120050 -> "1200.50"
function toMajor(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.trunc(abs / FACTOR)}.${String(abs % FACTOR).padStart(EXPONENT, '0')}`;
}

// Splits a total into `count` parts that always add back up to the total. The
// leftover minor units go one each to the first few parts, so ₹100 across three
// people is 33.34 / 33.33 / 33.33 rather than three lots of 33.33 and a lost paisa.
function splitEqually(total, count) {
  const base = Math.trunc(total / count);
  const remainder = total - base * count;

  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

module.exports = { toMinor, toMajor, splitEqually };
