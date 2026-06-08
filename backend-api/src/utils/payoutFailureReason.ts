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
// Matches both Latin and Cyrillic spellings of IBAN / bank account.
export function reasonIndicatesIbanProblem(reason?: string | null): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  return (
    r.includes('iban') ||
    r.includes('ибан') ||
    r.includes('банков') ||
    r.includes('сметк') ||
    r.includes('bank account') ||
    r.includes('account number') ||
    r.includes('beneficiary')
  );
}
