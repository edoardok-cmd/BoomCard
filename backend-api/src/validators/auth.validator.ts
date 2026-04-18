import { body } from 'express-validator';

const PHONE_REGEX = /^(\+359|0)\d{9}$/;

/**
 * Sanitizer: converts empty/whitespace-only phone strings to null
 */
const phoneSanitizer = body('phone').customSanitizer(
  (value: string | null | undefined) => {
    if (!value || value.trim() === '') return null;
    // Strip spaces and dashes before storing
    return value.replace(/[\s-]/g, '');
  }
);

export const registerValidation = [
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password must contain at least one special character'),

  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be 2-50 characters'),

  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be 2-50 characters'),

  body('phone')
    .notEmpty()
    .withMessage('Phone number is required')
    .trim()
    .matches(PHONE_REGEX)
    .withMessage('Invalid phone number format. Use +359XXXXXXXXX or 0XXXXXXXXX'),

  phoneSanitizer,

  body('accountType')
    .optional()
    .isIn(['user', 'partner'])
    .withMessage('accountType must be "user" or "partner"'),

  body('businessInfo')
    .if(body('accountType').equals('partner'))
    .exists({ checkNull: true })
    .withMessage('businessInfo is required for partner accounts')
    .bail()
    .isObject()
    .withMessage('businessInfo must be an object'),

  body('businessInfo.businessName')
    .if(body('accountType').equals('partner'))
    .isString()
    .withMessage('businessInfo.businessName is required')
    .bail()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('businessInfo.businessName must be 2-120 characters'),

  body('businessInfo.businessNameBg')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage('businessInfo.businessNameBg must be 2-120 characters'),

  body('businessInfo.businessCategory')
    .if(body('accountType').equals('partner'))
    .isString()
    .withMessage('businessInfo.businessCategory is required')
    .bail()
    .trim()
    .isLength({ min: 1, max: 60 })
    .withMessage('businessInfo.businessCategory must be 1-60 characters'),

  body('businessInfo.businessSubcategory')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 80 })
    .withMessage('businessInfo.businessSubcategory must be at most 80 characters'),

  body('businessInfo.taxId')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 40 })
    .withMessage('businessInfo.taxId must be at most 40 characters'),

  body('businessInfo.website')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage('businessInfo.website must be at most 255 characters'),
];

export const loginValidation = [
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format'),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),

  body('clientType')
    .notEmpty()
    .withMessage('clientType is required')
    .bail()
    .isIn(['mobile', 'web'])
    .withMessage('clientType must be "mobile" or "web"'),
];

export const updateProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be 2-50 characters'),

  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be 2-50 characters'),

  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(PHONE_REGEX)
    .withMessage('Invalid phone number format. Use +359XXXXXXXXX or 0XXXXXXXXX'),

  phoneSanitizer,
];

export const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),

  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('New password must contain at least one uppercase letter')
    .matches(/[a-z]/)
    .withMessage('New password must contain at least one lowercase letter')
    .matches(/[0-9]/)
    .withMessage('New password must contain at least one number')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('New password must contain at least one special character'),
];
