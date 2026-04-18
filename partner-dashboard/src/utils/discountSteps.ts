/**
 * Valid discount rates. Mirrors CASHBACK_MATRIX_STEPS in
 * backend-api/src/constants/receipt.constants.ts — partner rate, partner-type
 * max, offer discount %, and cashback % must all snap to one of these values.
 * 25% is the program-wide cap.
 */
export const DISCOUNT_STEPS = [5, 10, 15, 20, 25] as const;

/**
 * Snap to the highest step <= rate, clamped to max. Values above max snap
 * down to the cap so legacy over-cap records (e.g. 35%, 45%) display
 * without leaving the dropdown blank.
 */
export function snapToStepNumber(
  rate: number | null | undefined,
  steps: readonly number[] = DISCOUNT_STEPS,
): number | undefined {
  if (rate == null || !isFinite(Number(rate))) return undefined;
  const n = Number(rate);
  const max = steps[steps.length - 1];
  if (n >= max) return max;
  if (n < steps[0]) return undefined;
  let best: number | undefined;
  for (const s of steps) {
    if (n >= s) best = s;
  }
  return best;
}

/** String form for <select value={...}> — '' when below the first step. */
export function snapToStep(
  rate: number,
  steps: readonly number[] = DISCOUNT_STEPS,
): string {
  const n = snapToStepNumber(rate, steps);
  return n === undefined ? '' : String(n);
}
