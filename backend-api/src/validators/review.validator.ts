import { body, param, query } from 'express-validator';

export const createReviewValidation = [
  body('partnerId')
    .notEmpty()
    .withMessage('Partner ID is required')
    .isUUID()
    .withMessage('Invalid partner ID format'),

  body('rating')
    .notEmpty()
    .withMessage('Rating is required')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),

  body('title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Title must not exceed 100 characters'),

  body('comment')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Comment must not exceed 1000 characters'),

  body('images')
    .optional()
    .isArray({ max: 5 })
    .withMessage('Maximum 5 images allowed'),

  body('images.*')
    .optional()
    .isURL()
    .withMessage('Each image must be a valid URL')
];

export const updateReviewValidation = [
  param('id')
    .notEmpty()
    .withMessage('Review ID is required')
    .isUUID()
    .withMessage('Invalid review ID format'),

  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),

  body('title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Title must not exceed 100 characters'),

  body('comment')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Comment must not exceed 1000 characters'),

  body('images')
    .optional()
    .isArray({ max: 5 })
    .withMessage('Maximum 5 images allowed'),

  body('images.*')
    .optional()
    .isURL()
    .withMessage('Each image must be a valid URL')
];

export const getReviewByIdValidation = [
  param('id')
    .notEmpty()
    .withMessage('Review ID is required')
    .isUUID()
    .withMessage('Invalid review ID format')
];

export const getPartnerReviewsValidation = [
  param('partnerId')
    .notEmpty()
    .withMessage('Partner ID is required')
    .isUUID()
    .withMessage('Invalid partner ID format'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

export const getReviewsValidation = [
  query('partnerId')
    .optional()
    .isUUID()
    .withMessage('Invalid partner ID format'),

  query('userId')
    .optional()
    .isUUID()
    .withMessage('Invalid user ID format'),

  query('status')
    .optional()
    .isIn(['PENDING', 'APPROVED', 'REJECTED', 'FLAGGED'])
    .withMessage('Invalid status value'),

  query('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('sortBy')
    .optional()
    .isIn(['createdAt', 'rating', 'helpful'])
    .withMessage('Invalid sortBy value'),

  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Invalid sortOrder value')
];

export const markHelpfulValidation = [
  param('id')
    .notEmpty()
    .withMessage('Review ID is required')
    .isUUID()
    .withMessage('Invalid review ID format'),

  body('helpful')
    .notEmpty()
    .withMessage('helpful field is required')
    .isBoolean()
    .withMessage('helpful must be a boolean value')
];

export const flagReviewValidation = [
  param('id')
    .notEmpty()
    .withMessage('Review ID is required')
    .isUUID()
    .withMessage('Invalid review ID format'),

  body('reason')
    .notEmpty()
    .withMessage('Reason is required')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Reason must be between 10 and 500 characters')
];

export const adminResponseValidation = [
  param('id')
    .notEmpty()
    .withMessage('Review ID is required')
    .isUUID()
    .withMessage('Invalid review ID format'),

  body('response')
    .notEmpty()
    .withMessage('Response is required')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Response must be between 10 and 1000 characters')
];
