/**
 * Input Validation Utilities
 * Provides reusable validation functions for API inputs
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates an amount field (for receipts, payouts, etc.)
 *
 * Requirements:
 * - Must be a number
 * - Must be greater than 0
 * - Cannot be null or undefined
 * - Cannot be negative
 *
 * @param amount - The amount to validate
 * @param fieldName - The name of the field being validated (for error messages)
 * @param options - Additional validation options
 * @throws {ValidationError} If validation fails
 */
export function validateAmount(
  amount: any,
  fieldName: string = 'amount',
  options: {
    min?: number;
    max?: number;
    allowZero?: boolean;
  } = {}
): number {
  const { min = 0.01, max = Number.MAX_SAFE_INTEGER, allowZero = false } = options;

  // Check if amount is null or undefined
  if (amount === null || amount === undefined) {
    throw new ValidationError(`${fieldName} is required`);
  }

  // Try to convert to number if it's a string
  let numAmount: number;
  if (typeof amount === 'string') {
    numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      throw new ValidationError(`${fieldName} must be a valid number, received: "${amount}"`);
    }
  } else if (typeof amount === 'number') {
    numAmount = amount;
  } else {
    throw new ValidationError(`${fieldName} must be a number, received: ${typeof amount}`);
  }

  // Check for NaN or Infinity
  if (!isFinite(numAmount)) {
    throw new ValidationError(`${fieldName} must be a finite number, received: ${amount}`);
  }

  // Check if zero is allowed
  if (numAmount === 0) {
    if (!allowZero) {
      throw new ValidationError(`${fieldName} must be greater than zero`);
    }
  } else if (numAmount < 0) {
    // Negative amounts are never allowed
    throw new ValidationError(`${fieldName} cannot be negative, received: ${amount}`);
  }

  // Check minimum
  if (numAmount < min && numAmount !== 0) {
    throw new ValidationError(`${fieldName} must be at least ${min}, received: ${amount}`);
  }

  // Check maximum
  if (numAmount > max) {
    throw new ValidationError(`${fieldName} cannot exceed ${max}, received: ${amount}`);
  }

  return numAmount;
}

/**
 * Validates a GPS coordinate
 *
 * @param latitude - Latitude value (-90 to 90)
 * @param longitude - Longitude value (-180 to 180)
 * @throws {ValidationError} If validation fails
 */
export function validateGPSCoordinates(
  latitude: any,
  longitude: any
): { latitude: number; longitude: number } {
  // Guard: function must not be called with both coordinates absent
  if ((latitude === undefined || latitude === null) && (longitude === undefined || longitude === null)) {
    throw new ValidationError('At least one GPS coordinate must be provided');
  }

  // Reject partial pairs: both coordinates must be provided together
  const latPresent = latitude !== undefined && latitude !== null;
  const lonPresent = longitude !== undefined && longitude !== null;
  if (latPresent !== lonPresent) {
    throw new ValidationError('Both latitude and longitude must be provided together');
  }

  // Validate latitude
  let lat: number;
  if (latitude !== undefined && latitude !== null) {
    if (typeof latitude === 'string') {
      lat = Number(latitude);
    } else if (typeof latitude === 'number') {
      lat = latitude;
    } else {
      throw new ValidationError('Latitude must be a number');
    }

    if (isNaN(lat) || !isFinite(lat)) {
      throw new ValidationError('Latitude must be a valid number');
    }

    if (lat < -90 || lat > 90) {
      throw new ValidationError(`Latitude must be between -90 and 90, received: ${latitude}`);
    }
  }

  // Validate longitude
  let lon: number;
  if (longitude !== undefined && longitude !== null) {
    if (typeof longitude === 'string') {
      lon = Number(longitude);
    } else if (typeof longitude === 'number') {
      lon = longitude;
    } else {
      throw new ValidationError('Longitude must be a number');
    }

    if (isNaN(lon) || !isFinite(lon)) {
      throw new ValidationError('Longitude must be a valid number');
    }

    if (lon < -180 || lon > 180) {
      throw new ValidationError(`Longitude must be between -180 and 180, received: ${longitude}`);
    }
  }

  return {
    latitude: lat!,
    longitude: lon!,
  };
}

/**
 * Validates IBAN format (basic check)
 *
 * IBAN format:
 * - 2 letter country code
 * - 2 digit check digits
 * - Up to 30 alphanumeric characters
 *
 * @param iban - The IBAN to validate
 * @throws {ValidationError} If validation fails
 */
export function validateIBAN(iban: any): string {
  if (!iban || typeof iban !== 'string') {
    throw new ValidationError('IBAN must be a non-empty string');
  }

  const cleanIBAN = iban.toUpperCase().replace(/\s/g, '');

  // IBAN format: 2 letters (country code) + 2 digits (check digits) + 11-30 alphanumerics (account)
  // Enforces total length of 15-34 characters per IBAN spec
  const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

  if (!ibanRegex.test(cleanIBAN)) {
    throw new ValidationError(
      `Invalid IBAN format. Expected format: 2 letters + 2 digits + 11-30 alphanumerics, received: ${iban}`
    );
  }

  return cleanIBAN;
}

/**
 * Validates a string field (e.g., merchant name)
 *
 * @param value - The value to validate
 * @param fieldName - The name of the field
 * @param options - Additional options
 * @throws {ValidationError} If validation fails
 */
export function validateString(
  value: any,
  fieldName: string = 'field',
  options: {
    minLength?: number;
    maxLength?: number;
    required?: boolean;
    pattern?: RegExp;
  } = {}
): string {
  const { minLength = 0, maxLength = 255, required = false, pattern } = options;

  // Check if required
  if (required && (!value || (typeof value === 'string' && value.trim() === ''))) {
    throw new ValidationError(`${fieldName} is required`);
  }

  // Allow empty for non-required fields
  if (!value) {
    return '';
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string, received: ${typeof value}`);
  }

  // Check length
  if (value.length < minLength) {
    throw new ValidationError(
      `${fieldName} must be at least ${minLength} characters, received: ${value.length}`
    );
  }

  if (value.length > maxLength) {
    throw new ValidationError(
      `${fieldName} cannot exceed ${maxLength} characters, received: ${value.length}`
    );
  }

  // Check pattern if provided
  if (pattern && !pattern.test(value)) {
    throw new ValidationError(`${fieldName} format is invalid`);
  }

  return value;
}

/**
 * Sanitizes a string to prevent XSS
 * Basic HTML entity encoding
 *
 * @param value - The value to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(value: string): string {
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return value.replace(/[&<>"']/g, (char) => htmlEscapeMap[char]);
}
