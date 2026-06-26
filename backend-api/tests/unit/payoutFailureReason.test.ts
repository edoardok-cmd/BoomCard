/**
 * Unit tests for reasonIndicatesIbanProblem classifier.
 *
 * Verifies that the function correctly identifies IBAN/bank-account problems
 * across Paysera error codes and natural-language messages, in both English
 * and Cyrillic spellings.
 *
 * Acceptance Criteria (BC-REAUDIT-PAYOUT-FAIL-REASON-1):
 *   1. Audit and expand keyword/code set
 *   2. Case-insensitive matches for: INVALID_IBAN, IBAN, INVALID_BENEFICIARY,
 *      BENEFICIARY, ACCOUNT_NOT_FOUND, INVALID_ACCOUNT
 *   3. Match on message text and structured error codes
 *   4. First failure with bad IBAN routes to notifyPayoutFailedInvalidIban
 *   5. Non-IBAN failures route to generic notification
 */

import { reasonIndicatesIbanProblem } from '../../src/utils/payoutFailureReason';

describe('reasonIndicatesIbanProblem', () => {
  describe('Paysera structured error codes (case-insensitive)', () => {
    it('should identify INVALID_IBAN error code', () => {
      expect(reasonIndicatesIbanProblem('INVALID_IBAN')).toBe(true);
      expect(reasonIndicatesIbanProblem('invalid_iban')).toBe(true);
      expect(reasonIndicatesIbanProblem('Invalid_IBAN')).toBe(true);
      expect(reasonIndicatesIbanProblem('Error code: INVALID_IBAN')).toBe(true);
    });

    it('should identify INVALID_BENEFICIARY error code', () => {
      expect(reasonIndicatesIbanProblem('INVALID_BENEFICIARY')).toBe(true);
      expect(reasonIndicatesIbanProblem('invalid_beneficiary')).toBe(true);
      expect(reasonIndicatesIbanProblem('Invalid_Beneficiary')).toBe(true);
      expect(reasonIndicatesIbanProblem('Error: INVALID_BENEFICIARY name mismatch')).toBe(true);
    });

    it('should identify ACCOUNT_NOT_FOUND error code', () => {
      expect(reasonIndicatesIbanProblem('ACCOUNT_NOT_FOUND')).toBe(true);
      expect(reasonIndicatesIbanProblem('account_not_found')).toBe(true);
      expect(reasonIndicatesIbanProblem('Account_Not_Found in SEPA registry')).toBe(true);
    });

    it('should identify INVALID_ACCOUNT error code', () => {
      expect(reasonIndicatesIbanProblem('INVALID_ACCOUNT')).toBe(true);
      expect(reasonIndicatesIbanProblem('invalid_account')).toBe(true);
      expect(reasonIndicatesIbanProblem('Invalid_Account validation failed')).toBe(true);
    });
  });

  describe('Natural-language keywords (English)', () => {
    it('should identify messages containing "iban"', () => {
      expect(reasonIndicatesIbanProblem('invalid iban format')).toBe(true);
      expect(reasonIndicatesIbanProblem('IBAN check digit failed')).toBe(true);
      expect(reasonIndicatesIbanProblem('Your IBAN is incorrect')).toBe(true);
      expect(reasonIndicatesIbanProblem('iban rejected by bank')).toBe(true);
    });

    it('should identify messages containing "bank account"', () => {
      expect(reasonIndicatesIbanProblem('bank account does not exist')).toBe(true);
      expect(reasonIndicatesIbanProblem('The bank account is invalid')).toBe(true);
      expect(reasonIndicatesIbanProblem('Bank account number mismatch')).toBe(true);
    });

    it('should identify messages containing "beneficiary"', () => {
      expect(reasonIndicatesIbanProblem('beneficiary account rejected')).toBe(true);
      expect(reasonIndicatesIbanProblem('Beneficiary name does not match')).toBe(true);
      expect(reasonIndicatesIbanProblem('Invalid beneficiary details')).toBe(true);
      expect(reasonIndicatesIbanProblem('beneficiary rejected by bank')).toBe(true);
    });

    it('should identify messages containing "account number"', () => {
      expect(reasonIndicatesIbanProblem('account number is invalid')).toBe(true);
      expect(reasonIndicatesIbanProblem('Account number mismatch')).toBe(true);
      expect(reasonIndicatesIbanProblem('The account number does not exist')).toBe(true);
    });

    it('should identify messages containing "account invalid"', () => {
      expect(reasonIndicatesIbanProblem('account invalid')).toBe(true);
      expect(reasonIndicatesIbanProblem('Account invalid — please check details')).toBe(true);
    });

    it('should identify messages containing "invalid account"', () => {
      expect(reasonIndicatesIbanProblem('invalid account')).toBe(true);
      expect(reasonIndicatesIbanProblem('Invalid account specified')).toBe(true);
      expect(reasonIndicatesIbanProblem('Transfer rejected: invalid account')).toBe(true);
    });

    it('should identify messages containing "account not found"', () => {
      expect(reasonIndicatesIbanProblem('account not found')).toBe(true);
      expect(reasonIndicatesIbanProblem('Account not found in bank')).toBe(true);
    });

    it('should identify messages containing "account rejected"', () => {
      expect(reasonIndicatesIbanProblem('account rejected')).toBe(true);
      expect(reasonIndicatesIbanProblem('Account rejected by beneficiary bank')).toBe(true);
    });

    it('should identify messages containing "iban rejected"', () => {
      expect(reasonIndicatesIbanProblem('iban rejected')).toBe(true);
      expect(reasonIndicatesIbanProblem('IBAN rejected by banking system')).toBe(true);
    });
  });

  describe('Natural-language keywords (Cyrillic)', () => {
    it('should identify messages containing Cyrillic "ибан" (IBAN)', () => {
      expect(reasonIndicatesIbanProblem('неверный ибан')).toBe(true);
      expect(reasonIndicatesIbanProblem('Ибан формат неправильный')).toBe(true);
      expect(reasonIndicatesIbanProblem('ибан отклонен банком')).toBe(true);
    });

    it('should identify messages containing Cyrillic "банков" (bank-related)', () => {
      expect(reasonIndicatesIbanProblem('банковский счет неверный')).toBe(true);
      expect(reasonIndicatesIbanProblem('банков реквизит ошибка')).toBe(true);
    });

    it('should identify messages containing Cyrillic "сметк" (account)', () => {
      expect(reasonIndicatesIbanProblem('сметката не съществува')).toBe(true);
      expect(reasonIndicatesIbanProblem('неверна сметка')).toBe(true);
      expect(reasonIndicatesIbanProblem('сметка отклонена')).toBe(true);
    });
  });

  describe('Real-world Paysera error scenarios', () => {
    it('should identify the test case from walletPayoutFlow.test.ts', () => {
      expect(reasonIndicatesIbanProblem('Invalid IBAN — beneficiary account rejected')).toBe(true);
    });

    it('should handle Paysera Transfer API error responses with codes', () => {
      expect(reasonIndicatesIbanProblem('Paysera: INVALID_IBAN - Check digit mismatch')).toBe(true);
      expect(reasonIndicatesIbanProblem('Transfer API error: INVALID_BENEFICIARY')).toBe(true);
      expect(reasonIndicatesIbanProblem('Bank validation failed: ACCOUNT_NOT_FOUND')).toBe(true);
    });

    it('should handle verbose Paysera error messages', () => {
      expect(reasonIndicatesIbanProblem('Transfer rejected: The beneficiary IBAN format is invalid')).toBe(true);
      expect(reasonIndicatesIbanProblem('Paysera Transfer API: beneficiary account does not exist in SEPA registry')).toBe(true);
      expect(reasonIndicatesIbanProblem('Bank account validation failed. Please check your IBAN and try again.')).toBe(true);
    });
  });

  describe('Non-IBAN failures (should return false)', () => {
    it('should not identify generic service errors', () => {
      expect(reasonIndicatesIbanProblem('Paysera 503 — unavailable')).toBe(false);
      expect(reasonIndicatesIbanProblem('Service temporarily unavailable')).toBe(false);
      expect(reasonIndicatesIbanProblem('Connection timeout')).toBe(false);
    });

    it('should not identify insufficient funds errors', () => {
      expect(reasonIndicatesIbanProblem('Insufficient balance')).toBe(false);
      expect(reasonIndicatesIbanProblem('Not enough funds in account')).toBe(false);
      expect(reasonIndicatesIbanProblem('balance exceeded')).toBe(false);
    });

    it('should not identify currency-related errors', () => {
      expect(reasonIndicatesIbanProblem('Currency not supported')).toBe(false);
      expect(reasonIndicatesIbanProblem('EUR to BGN conversion failed')).toBe(false);
    });

    it('should not identify amount-related errors', () => {
      expect(reasonIndicatesIbanProblem('Amount too small')).toBe(false);
      expect(reasonIndicatesIbanProblem('Amount exceeds limit')).toBe(false);
      expect(reasonIndicatesIbanProblem('Transfer amount invalid')).toBe(false);
    });

    it('should not identify rate-limiting errors', () => {
      expect(reasonIndicatesIbanProblem('Rate limit exceeded')).toBe(false);
      expect(reasonIndicatesIbanProblem('Too many requests')).toBe(false);
    });

    it('should handle null and empty inputs', () => {
      expect(reasonIndicatesIbanProblem(null)).toBe(false);
      expect(reasonIndicatesIbanProblem(undefined)).toBe(false);
      expect(reasonIndicatesIbanProblem('')).toBe(false);
      expect(reasonIndicatesIbanProblem('   ')).toBe(false);
    });
  });

  describe('Edge cases and mixed content', () => {
    it('should handle messages with multiple error indicators', () => {
      expect(reasonIndicatesIbanProblem('Invalid IBAN and invalid beneficiary name')).toBe(true);
    });

    it('should be case-insensitive across mixed-case messages', () => {
      expect(reasonIndicatesIbanProblem('InVaLiD_IbAn')).toBe(true);
      expect(reasonIndicatesIbanProblem('Bank AccOunt validation failed')).toBe(true);
    });

    it('should handle messages with leading/trailing whitespace', () => {
      expect(reasonIndicatesIbanProblem('  Invalid IBAN  ')).toBe(true);
      expect(reasonIndicatesIbanProblem('\n\tinvalid_beneficiary\n\t')).toBe(true);
    });

    it('should match partial words containing the keywords', () => {
      expect(reasonIndicatesIbanProblem('beneficiary_account_error')).toBe(true);
      expect(reasonIndicatesIbanProblem('iban_format_check_failed')).toBe(true);
    });

    it('should handle numeric error codes mixed with text', () => {
      expect(reasonIndicatesIbanProblem('Error 4002: INVALID_IBAN')).toBe(true);
      expect(reasonIndicatesIbanProblem('Paysera code 4003, INVALID_BENEFICIARY')).toBe(true);
    });
  });

  describe('Integration scenario: first payout failure notification routing', () => {
    it('IBAN problem → notifyPayoutFailedInvalidIban', () => {
      const ibanErrors = [
        'Invalid IBAN — beneficiary account rejected',
        'INVALID_IBAN',
        'invalid_beneficiary',
        'bank account does not exist',
        'сметката не съществува',
      ];

      for (const error of ibanErrors) {
        expect(reasonIndicatesIbanProblem(error)).toBe(true);
        // In actual code: if (reasonIndicatesIbanProblem(error)) → notifyPayoutFailedInvalidIban
      }
    });

    it('Non-IBAN problem → notifyPayoutFailedGeneric', () => {
      const nonIbanErrors = [
        'Paysera 503 — unavailable',
        'Insufficient balance',
        'Rate limit exceeded',
        'Currency not supported',
      ];

      for (const error of nonIbanErrors) {
        expect(reasonIndicatesIbanProblem(error)).toBe(false);
        // In actual code: if (!reasonIndicatesIbanProblem(error)) → notifyPayoutFailedGeneric
      }
    });
  });
});
