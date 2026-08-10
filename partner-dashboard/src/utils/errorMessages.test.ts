import { describe, it, expect } from 'vitest';
import { getLocalizedErrorMessage, AUTH_ERROR_CODE_MAP } from './errorMessages';
import { getTranslation } from '../locales';

describe('getLocalizedErrorMessage', () => {
  it('prefers a mapped `code` over the raw message, in the requested language', () => {
    const err = {
      response: {
        status: 409,
        data: { code: 'EMAIL_ALREADY_HAS_ACTIVE_PLAN', message: 'raw english fallback' },
      },
    };
    expect(getLocalizedErrorMessage(err, 'bg')).toBe(
      getTranslation('bg', 'checkoutPage.emailConflictActivePlanPrefix'),
    );
    expect(getLocalizedErrorMessage(err, 'en')).toBe(
      getTranslation('en', 'checkoutPage.emailConflictActivePlanPrefix'),
    );
  });

  it('falls back to response.data.message when no code is present (today\'s behavior, unregressed)', () => {
    const err = { response: { status: 400, data: { message: 'Some raw backend message' } } };
    expect(getLocalizedErrorMessage(err, 'bg')).toBe('Some raw backend message');
  });

  it('falls back to an unmapped code\'s message rather than throwing', () => {
    const err = { response: { status: 400, data: { code: 'SOME_UNMAPPED_CODE', message: 'fallback message' } } };
    expect(getLocalizedErrorMessage(err, 'en')).toBe('fallback message');
  });

  it('falls back to error.message when there is no response.data at all (network error)', () => {
    const err = { message: 'Network Error' };
    expect(getLocalizedErrorMessage(err, 'en')).toBe('Network Error');
  });

  it('falls back to the generic translated message when nothing else is available', () => {
    expect(getLocalizedErrorMessage({}, 'bg')).toBe(getTranslation('bg', 'errors.somethingWentWrong'));
    expect(getLocalizedErrorMessage(null, 'en')).toBe(getTranslation('en', 'errors.somethingWentWrong'));
  });

  it('honors a caller-supplied fallbackKey', () => {
    expect(getLocalizedErrorMessage({}, 'en', 'errors.networkError')).toBe(
      getTranslation('en', 'errors.networkError'),
    );
  });

  it('every AUTH_ERROR_CODE_MAP value resolves to a real key in both locales (no key drifts silently to itself)', () => {
    for (const key of Object.values(AUTH_ERROR_CODE_MAP)) {
      expect(getTranslation('en', key), `en.ts missing key: ${key}`).not.toBe(key);
      expect(getTranslation('bg', key), `bg.ts missing key: ${key}`).not.toBe(key);
    }
  });
});
