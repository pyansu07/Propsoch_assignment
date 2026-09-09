const express = require('express');
const validate = require('../../middlewares/validate.middleware');
const schema = require('./expense.validation');
const controller = require('./expense.controller');

const router = express.Router();

router
  .route('/')
  .post(validate(schema.create), controller.create)
  .get(validate(schema.list), controller.list);

router
  .route('/:id')
  .get(validate(schema.byId), controller.getOne)
  .patch(validate(schema.update), controller.update)
  .delete(validate(schema.byId), controller.remove);

module.exports = router;
