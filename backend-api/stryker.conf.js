// Stryker mutation-testing config — coverage DEPTH gate for the admin money/
// security surface. Mutation score answers the question line coverage cannot:
// "if a bug were introduced here, would a test catch it?"
//
// PREREQUISITES (not installed by default — this is the ready-to-run config):
//   1. A GREEN test suite. Stryker runs the suite per mutant; a red baseline
//      (e.g. the current phone-NOT-NULL test-rot) makes every result meaningless.
//      Fix test-rot first.
//   2. npm i -D @stryker-mutator/core @stryker-mutator/jest-runner
//   3. npx stryker run   (optionally add an npm script "test:mutation").
//
// Scope is deliberately narrow: the highest-risk admin modules where a silent
// fault is most costly. Widen `mutate` as the suite hardens. Empirical note
// (2026-06-28 manual run): flipping bgnToEur's `/`→`*` is KILLED by the suite
// (specConformFix009 asserts the conversion) but SURVIVES walletCurrencyTransition
// alone — which is exactly why mutation score is a whole-suite metric.
module.exports = {
  packageManager: 'npm',
  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    configFile: 'jest.config.js',
    enableFindRelatedTests: true,
  },
  reporters: ['progress', 'clear-text', 'html'],
  coverageAnalysis: 'perTest',
  // Start with the modules where a surviving mutant = a real money/security risk.
  mutate: [
    // BC-QA-031: was 'src/utils/currencyDisplay.ts' — the dual-currency display
    // module was deleted with the BGN→EUR transition feature. The surviving
    // money-risk primitive on that seam is the BGN→EUR conversion itself.
    'src/utils/currency.ts',
    'src/services/payoutEligibility.service.ts',
    'src/services/wallet.service.ts',
    'src/services/adminCashback.service.ts',
  ],
  // Gate: fail CI below this mutation score. Start where the suite actually is,
  // ratchet upward. Do NOT set high before test-rot is fixed.
  thresholds: { high: 80, low: 60, break: 50 },
  timeoutMS: 60000,
  concurrency: 2,
};
