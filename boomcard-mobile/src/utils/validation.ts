/**
 * Input validation utilities
 *
 * Canonical validation rules matching the backend (express-validator in auth.validator.ts).
 * Frontend validation is for UX — the backend is the authoritative layer.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(\+359|0)\d{9}$/;
const PASSWORD_MIN_LENGTH = 8;
const NAME_MIN_LENGTH = 2;

export const validateEmail = (email: string): string | null => {
  if (!email || email.trim() === '') return 'required';
  if (!EMAIL_REGEX.test(email.trim())) return 'invalid';
  return null;
};

/**
 * Validate Bulgarian phone number. Phone is optional — returns null if empty.
 * Strips spaces/dashes before checking against strict regex.
 */
export const validatePhone = (phone: string): string | null => {
  if (!phone || phone.trim() === '') return null;
  const cleaned = phone.replace(/[\s-]/g, '');
  if (!PHONE_REGEX.test(cleaned)) return 'invalid';
  return null;
};

export const validatePassword = (password: string): string | null => {
  if (!password) return 'required';
  if (password.length < PASSWORD_MIN_LENGTH) return 'tooShort';
  return null;
};

export const validateName = (name: string): string | null => {
  if (!name || name.trim() === '') return 'required';
  if (name.trim().length < NAME_MIN_LENGTH) return 'tooShort';
  return null;
};

/**
 * Normalize phone for API submission:
 * - Strips spaces and dashes
 * - Converts empty/whitespace-only to undefined (so it becomes null on backend)
 */
export const normalizePhone = (phone: string | undefined): string | undefined => {
  if (!phone || phone.trim() === '') return undefined;
  return phone.replace(/[\s-]/g, '');
};

/**
 * Filter phone input to only allow valid characters while typing
 */
export const filterPhoneInput = (text: string): string => {
  return text.replace(/[^0-9+\s-]/g, '');
};
