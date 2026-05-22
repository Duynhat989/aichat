const { check } = require('express-validator');

const checkName = check('name')
  .notEmpty()
  .withMessage((value, { req }) => 'Name not found');

const checkEmail = check('email')
  .isEmail()
  .withMessage((value, { req }) => 'Email not found');

const checkPassword = check('password')
  .notEmpty()
  .withMessage((value, { req }) => 'Password empty')
  .isLength({ min: 6 })
  .withMessage((value, { req }) => 'Password too short');

module.exports = {
  checkName,
  checkEmail,
  checkPassword
};
