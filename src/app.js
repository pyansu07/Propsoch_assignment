const express = require('express');
const morgan = require('morgan');
const config = require('./config');
const identify = require('./middlewares/identify');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.use(express.json());
if (!config.isTest) app.use(morgan('tiny'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/v1', identify);
app.use('/api/v1/users', require('./modules/users/user.routes'));
app.use('/api/v1/expenses', require('./modules/expenses/expense.routes'));
app.use('/api/v1/balances', require('./modules/balances/balance.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
