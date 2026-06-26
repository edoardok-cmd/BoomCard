// L1 — shared payout-failure reason classifier.
//
// Decides whether a payout-failure reason indicates an IBAN / bank-account
// problem. Spec §3.7 qualifies the first failure as "(invalid IBAN)", so only
// then do we surface IBAN-correction wording to the user; any other reason gets
// neutral "action may be required" wording.
//
// Single source of truth shared by:
//   - adminPayouts.routes.ts  (admin /fail manual-failure path)
//   - wallet.service.ts        (Paysera auto-fail path in executePayoutTransfer)
// so both first-failure notification paths classify reasons identically.
//
// Detects both structured error codes and natural-language messages from Paysera.
// Covers Paysera Transfer API error codes and messages:
//   - INVALID_IBAN — beneficiary IBAN format/check digit validation failed
//   - INVALID_BENEFICIARY — beneficiary name or bank account mismatch
//   - ACCOUNT_NOT_FOUND — bank/IBAN does not exist in SEPA registry
//   - INVALID_ACCOUNT — bank account validation failure (catch-all)
//   - All natural-language keywords: iban, bank account, beneficiary, account, invalid
//
// Matches both Latin and Cyrillic spellings of IBAN / bank account.
export function reasonIndicatesIbanProblem(reason?: string | null): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();

  // Paysera structured error codes (case-insensitive match)
  const payseraErrorCodes = [
    'invalid_iban',
    'invalid_beneficiary',
    'account_not_found',
    'invalid_account',
  ];

  for (const code of payseraErrorCodes) {
    if (r.includes(code)) return true;
  }

  // Natural-language keywords covering IBAN / beneficiary / account problems
  const ibanKeywords = [
    'iban',
    'ибан',                    // Cyrillic: IBAN
    'банков',                  // Cyrillic: bank-related
    'сметк',                   // Cyrillic: account
    'bank account',
    'account number',
    'beneficiary',
    'account invalid',
    'invalid account',
    'invalid iban',
    'invalid beneficiary',
    'account not found',
    'account rejected',
    'beneficiary rejected',
    'iban rejected',
  ];

  for (const keyword of ibanKeywords) {
    if (r.includes(keyword)) return true;
  }

  return false;
}
