const { body, validationResult } = require('express-validator');
const logger = require('../config/logger');

// ─── Reusable validation handler ──────────────────────
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn(
      `Validation failed: ${req.method} ${req.originalUrl} from ${req.ip} -> ${JSON.stringify(
        errors.array().map((e) => ({ field: e.path, message: e.msg }))
      )}`
    );
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ─── Login validation rules ───────────────────────────
const loginRules = [
  body('accountNumber')
    .trim()
    .notEmpty().withMessage('Account number is required')
    .matches(/^\d{3}-\d{3}-\d{4}$/).withMessage('Invalid account number format'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 4 }).withMessage('Password too short'),
];

// ─── Register validation rules ────────────────────────
const registerRules = [
  body('role')
    .notEmpty().withMessage('Role selection is required')
    .isIn(['customer', 'admin']).withMessage('Role must be customer or admin'),
  body('fullName')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .matches(/^[\p{L}\s.'-]+$/u).withMessage('Name contains invalid characters'),
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('phone')
    .trim()
    .matches(/^[+\d\s()-]{7,20}$/).withMessage('Valid phone number is required'),
  body('dateOfBirth')
    .isISO8601().withMessage('Valid date of birth is required'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 160 }).withMessage('Address cannot exceed 160 characters')
    .escape(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number')
    .matches(/[^A-Za-z0-9]/).withMessage('Password must contain a special character'),
  body('pin')
    .matches(/^\d{4}$/).withMessage('PIN must be exactly 4 digits'),
  body('adminSetupKey')
    .optional()
    .trim()
    .isLength({ max: 120 }).withMessage('Admin setup key is too long')
    .custom((value, { req }) => {
      if (req.body.role === 'admin' && !value) {
        throw new Error('Admin setup key is required for admin registration');
      }
      return true;
    }),
];

// ─── Transfer validation rules ────────────────────────
const transferRules = [
  body('toAccountNumber')
    .trim()
    .notEmpty().withMessage('Recipient account number is required')
    .matches(/^\d{3}-\d{3}-\d{4}$/).withMessage('Invalid recipient account format'),
  body('amount')
    .isFloat({ min: 1, max: 500000 }).withMessage('Amount must be between 1 and 500,000 EGP'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Description too long')
    .escape(), // XSS protection
];

// ─── Deposit/Withdrawal validation rules ──────────────
const amountRules = [
  body('amount')
    .isFloat({ min: 1, max: 1000000 }).withMessage('Invalid amount'),
  body('accountType')
    .isIn(['checking', 'savings']).withMessage('Invalid account type'),
];

// ─── Password change validation ───────────────────────
const passwordRules = [
  body('currentPassword').notEmpty().withMessage('Current password required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain uppercase')
    .matches(/[0-9]/).withMessage('Must contain a number'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
];

module.exports = {
  validate,
  loginRules,
  registerRules,
  transferRules,
  amountRules,
  passwordRules,
};
