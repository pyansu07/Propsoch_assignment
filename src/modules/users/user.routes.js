const express = require('express');
const validate = require('../../middlewares/validate.middleware');
const schema = require('./user.validation');
const controller = require('./user.controller');

const router = express.Router();

router.get('/me', controller.getMe);
router.patch('/me', validate(schema.updateProfile), controller.updateMe);
router.delete('/me', controller.deleteMe);

module.exports = router;
