/**
 * Public Settings Routes
 *
 * GET    /api/settings/currency-display-mode                   — public currency display mode
 */

import { Router, Response } from 'express';
import { isCurrencyTransitionWindowOpen } from '../utils/currencyDisplay';
import { asyncHandler } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/settings/currency-display-mode
 * Public endpoint — no authentication required.
 *
 * FIX-QA-020: Expose the resolved currency display mode to all frontend clients,
 * including non-admin partner-dashboard users.
 *
 * Spec §3.7 + §8.1 rule 4: During the BGN→EUR transition window, amounts must
 * display in BOTH currencies (dual mode). After the window closes, BGN is hidden
 * and EUR is shown alone (EUR-only mode).
 *
 * The mode is derived from the `currency_transition_window_open` SystemSetting:
 *   - window open  (true)  → mode: 'dual'      (show both BGN and EUR)
 *   - window close (false) → mode: 'eur_only'  (EUR only, BGN hidden)
 *
 * Returns: { success: true, data: { currencyDisplayMode: 'dual' | 'eur_only', windowOpen: boolean } }
 */
router.get(
  '/currency-display-mode',
  asyncHandler(async (_req: AuthRequest | any, res: Response) => {
    const windowOpen = await isCurrencyTransitionWindowOpen();
    const currencyDisplayMode = windowOpen ? 'dual' : 'eur_only';
    res.json({
      success: true,
      data: {
        currencyDisplayMode,
        windowOpen,
      },
    });
  })
);

export default router;
