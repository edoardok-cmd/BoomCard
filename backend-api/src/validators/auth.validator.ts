import { body } from 'express-validator';

const PHONE_REGEX = /^(\+359|0)\d{9}$/;

/**
 * Canonical password policy (single source of truth for ALL password-setting
 * endpoints): minimum 8 characters AND at least one uppercase, one lowercase,
 * one digit, and one special character. registerValidation /
 * changePasswordValidation already enforce this inline; the helpers below let
 * the non-express-validator endpoints (partner activate, complete-profile,
 * reset-password) enforce the exact same rule instead of a length-only check.
 */
export const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_UPPER = /[A-Z]/;
const PASSWORD_LOWER = /[a-z]/;
const PASSWORD_DIGIT = /[0-9]/;
const PASSWORD_SPECIAL = /[^A-Za-z0-9]/;

/**
 * Validate a candidate password against the canonical policy. Returns null when
 * the password is acceptable, or a human-readable error message otherwise.
 * Use from inline / non-express-validator paths so every endpoint shares one
 * rule. Mirrors the messages used by registerValidation.
 *
 * BC-QA-029 note (superseded by BC-QA-033): this return type (`string | null`)
 * is a plain message string, not a coded error — every call site is
 * responsible for attaching its own `code: 'AUTH_PASSWORD_POLICY'` to the
 * response it builds from a non-null return (see routes/auth.routes.ts's
 * `/partner/activate` and `/reset-password` handlers, and
 * services/activationLink.service.ts's `ActivationLinkError` throws, all of
 * which now do this — BC-QA-033). Same constraint still applies to the
 * inline express-validator password rules in registerValidation/
 * changePasswordValidation below — their `.withMessage()` strings feed
 * validation.middleware.ts's `{ [field]: msg }` error shape, which has no
 * precedent for carrying a sibling `code`.
 */
export function validatePasswordPolicy(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password must be a string';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!PASSWORD_UPPER.test(password)) return 'Password must contain at least one uppercase letter';
  if (!PASSWORD_LOWER.test(password)) return 'Password must contain at least one lowercase letter';
  if (!PASSWORD_DIGIT.test(password)) return 'Password must contain at least one number';
  if (!PASSWORD_SPECIAL.test(password)) return 'Password must contain at least one special character';
  return null;
}

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

  // Partner applications do not submit a password — it is set later via the
  // activation link. Only validate/require password for user (non-partner) registrations.
  body('password')
    .if(body('accountType').not().equals('partner'))
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

  // Registration requires a name — leaving these .optional() let a missing
  // firstName/lastName reach Prisma and surface as a 500. Required + 2-50 length
  // (same rule as updateProfileValidation) so a missing name returns a clean 400.
  body('firstName')
    .notEmpty()
    .withMessage('First name is required')
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be 2-50 characters'),

  body('lastName')
    .notEmpty()
    .withMessage('Last name is required')
    .bail()
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

  body('businessInfo.businessSubcategories')
    .optional()
    .isArray({ max: 20 })
    .withMessage('businessInfo.businessSubcategories must be an array of up to 20 ids'),

  body('businessInfo.businessSubcategories.*')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage('each businessSubcategories entry must be 1-80 characters'),

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

  // Spec §5.1 v1.1 — venue-count dropdown bucket, optional on submit so the
  // form can roll out without a legacy data migration.
  body('businessInfo.city')
    .optional({ values: 'falsy' })
    .isString().trim().isLength({ max: 80 })
    .withMessage('businessInfo.city must be at most 80 characters'),

  body('businessInfo.address')
    .optional({ values: 'falsy' })
    .isString().trim().isLength({ max: 200 })
    .withMessage('businessInfo.address must be at most 200 characters'),

  body('businessInfo.requestObjectCount')
    .optional({ values: 'falsy' })
    .isIn(['1', '2-5', '6-10', '11+'])
    .withMessage('businessInfo.requestObjectCount must be one of: 1, 2-5, 6-10, 11+'),

  // Spec §2.3 — Ниво на участие (required for partner applications). Whitelisted
  // against the three canonical values the public form renders so a tampered
  // submission cannot persist an arbitrary string onto the Partner row.
  body('businessInfo.participationLevel')
    .if(body('accountType').equals('partner'))
    .notEmpty()
    .withMessage('businessInfo.participationLevel is required')
    .bail()
    .isIn(['basic', 'active', 'growth'])
    .withMessage('businessInfo.participationLevel must be one of: basic, active, growth'),

  // Spec §2.3 — free-text additional notes (optional).
  body('businessInfo.additionalInfo')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('businessInfo.additionalInfo must be at most 2000 characters'),

  // Spec §2.3 — Privacy Policy consent is a SEPARATE required consent from Terms
  // for partner applications. Must be exactly true; reject the registration
  // otherwise (acceptPrivacy is sent at the top level, alongside acceptTerms).
  body('acceptPrivacy')
    .if(body('accountType').equals('partner'))
    .custom((value) => value === true)
    .withMessage('You must accept the Privacy Policy to register as a partner'),

  // Spec §2.2 — Terms of Service consent is required alongside Privacy Policy
  // for partner applications. Must be exactly true; reject the registration
  // otherwise.
  body('acceptTerms')
    .if(body('accountType').equals('partner'))
    .custom((value) => value === true)
    .withMessage('You must accept the Terms of Service to register as a partner'),
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
    .isIn(['mobile', 'web'])
    .withMessage('clientType must be "mobile" or "web"'),

  body('totpCode')
    .optional()
    .isString()
    // Accept EITHER a 6-digit TOTP code OR a backup recovery code.
    // Recovery codes are emitted as XXXXX-XXXXX over the unambiguous alphabet
    // A-Z (minus O/I/L) + digits 2-9, e.g. "C763J-HNPDR". AuthService.login
    // normalises via .toUpperCase().replace(/[^A-Z0-9]/g, '') before comparing,
    // so we tolerate any case and an optional dash separator while staying
    // bounded in length (rejects junk like "abc" or a 200-char string).
    .matches(/^(?:\d{6}|[A-Za-z0-9]{5}-?[A-Za-z0-9]{5})$/)
    .withMessage('totpCode must be a 6-digit TOTP code or a backup recovery code'),
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

  body('city')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 })
    .withMessage('City must be under 100 characters'),

  body('country')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Country must be under 100 characters'),
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
