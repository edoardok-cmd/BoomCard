export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const phoneRegex = /^(\+359|0)\d{9}$/;

export const validateEmail = (email: string): boolean => {
  return emailRegex.test(email);
};

export const validatePhone = (phone: string): boolean => {
  return phoneRegex.test(phone);
};

/**
 * Strip spaces and dashes from phone number for API submission.
 * Returns empty string if input is empty.
 */
export const normalizePhone = (phone: string): string => {
  return phone.replace(/[\s-]/g, '');
};

/**
 * Display-format a Bulgarian phone number consistently.
 * Accepts +359..., 359..., 0..., or already-normalized strings and returns
 * a canonical "+359 XXX XXX XXX" form. Returns the original input verbatim
 * when the digits don't match a recognised BG layout (foreign numbers,
 * partials, malformed strings) so admins see exactly what's stored.
 */
export const formatPhoneBG = (phone: string | null | undefined): string => {
  if (phone == null) return '';
  // Empty / whitespace-only input: nothing to format.
  if (!phone.trim()) return phone;
  // Strip every non-digit BUT preserve the leading '+' so we can detect a BG
  // country-code prefix. Parens, dashes, dots, "ext", and any other formatting
  // noise gets removed up front (was: only spaces+dashes, which left "(888)"
  // intact and produced "+359(888)000001" in the output).
  const hasPlus = /^\+/.test(phone.trim());
  const onlyDigits = phone.replace(/\D/g, '');
  // Peel off any +359 / 359 prefix (exactly once), then any leading 0. Reject
  // the "double-prefix" case (+3590…) where both are present — return the
  // original verbatim rather than silently mangling it.
  let national = onlyDigits;
  let hadCountryCode = false;
  if (hasPlus && national.startsWith('359')) {
    national = national.slice(3);
    hadCountryCode = true;
  } else if (national.startsWith('359') && national.length > 9) {
    // Bare "359…" without +: treat as country-code prefix when the remainder
    // looks like a BG national number.
    national = national.slice(3);
    hadCountryCode = true;
  }
  if (national.startsWith('0')) {
    if (hadCountryCode) {
      // +3590888… is malformed — refuse to "fix" it; show the input verbatim.
      return phone;
    }
    national = national.slice(1);
  }
  if (!/^\d{8,9}$/.test(national)) return phone;
  // BG mobile = 9 national digits: AAA BBB CCC
  if (national.length === 9) {
    return `+359 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }
  // 8-digit fallback (older landlines): AA BBB CCC
  return `+359 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
};

export const validatePassword = (password: string): string | null => {
  if (password.length < 8) {
    return 'Паролата трябва да е поне 8 символа';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Паролата трябва да съдържа поне една главна буква';
  }
  if (!/[a-z]/.test(password)) {
    return 'Паролата трябва да съдържа поне една малка буква';
  }
  if (!/[0-9]/.test(password)) {
    return 'Паролата трябва да съдържа поне една цифра';
  }
  return null;
};

export const validateBulgarianEGN = (egn: string): boolean => {
  if (!/^\d{10}$/.test(egn)) return false;
  
  const weights = [2, 4, 8, 5, 10, 9, 7, 3, 6];
  let sum = 0;
  
  for (let i = 0; i < 9; i++) {
    sum += parseInt(egn[i]) * weights[i];
  }
  
  const checksum = sum % 11;
  const lastDigit = checksum < 10 ? checksum : 0;
  
  return parseInt(egn[9]) === lastDigit;
};

export interface FieldRule {
  required?: boolean;
  email?: boolean;
  minLength?: number;
}

export const validateForm = (
  values: Record<string, unknown>,
  rules: Record<string, FieldRule>
): Record<string, string> => {
  const errors: Record<string, string> = {};

  Object.keys(rules).forEach(field => {
    const value = values[field];
    const fieldRules = rules[field];

    if (fieldRules.required && !value) {
      errors[field] = `${field} е задължително поле`;
    }

    if (fieldRules.email && typeof value === 'string' && !validateEmail(value)) {
      errors[field] = 'Невалиден email адрес';
    }

    if (fieldRules.minLength && typeof value === 'string' && value.length < fieldRules.minLength) {
      errors[field] = `Минимална дължина ${fieldRules.minLength} символа`;
    }
  });

  return errors;
};