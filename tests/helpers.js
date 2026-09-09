const request = require('supertest');
const app = require('../src/app');
const { User } = require('../src/models');

const API = '/api/v1';

// There's no registration endpoint (no auth layer in the brief), so tests make
// users straight through the model.
function createUser(name) {
  return User.create({
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    passwordHash: 'not-a-real-hash',
    defaultCurrency: 'INR',
  });
}

const as = (user) => ({ 'X-User-Id': user.id });

const addExpense = (actor, body) => request(app).post(`${API}/expenses`).set(as(actor)).send(body);

const getBalances = (actor) => request(app).get(`${API}/balances`).set(as(actor));

// What `other` owes the caller (or the caller owes them), in the given currency.
function balanceWith(body, otherId, currency = 'INR') {
  const entry = body.users.find((item) => item.user.id === otherId);
  if (!entry) return null;

  return entry.balances.find((item) => item.currency === currency) || null;
}

module.exports = { app, request, API, createUser, as, addExpense, getBalances, balanceWith };
