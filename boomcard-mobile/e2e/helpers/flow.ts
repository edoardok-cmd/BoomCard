import { Page } from '@playwright/test';

/**
 * Runs the canonical scan → upload → submit flow using the __DEV__ hooks.
 * Returns the final cashback-earned value visible to the user.
 */
export async function runScanFlow(
  page: Page,
  opts: {
    qrPayload: string;
    billAmount: number;
    imageDataUri?: string;   // optional; if provided, will be set as the receipt image
  }
): Promise<{ cashbackEarned: number; venueName: string; cashbackPercent: number }> {
  // Bypass camera permission + inject QR payload → session is created, nav moves to UploadReceipt.
  await page.evaluate(() => {
    (window as any).__BOOM_TEST_BYPASS_PERM__?.();
    (window as any).__BOOM_TEST_SKIP_OCR__ = true;
  });
  await page.evaluate((qr) => (window as any).__BOOM_TEST_SCAN__(qr), opts.qrPayload);

  // Wait for the upload screen to mount and expose its hooks.
  await page.waitForFunction(() => !!(window as any).__BOOM_TEST_UPLOAD_IMAGE__, { timeout: 15_000 });

  const imageUri = opts.imageDataUri ?? makeTinyPngDataUri();
  await page.evaluate((uri) => (window as any).__BOOM_TEST_UPLOAD_IMAGE__(uri), imageUri);

  // Wait for the confirm stage (OCR skipped → goes straight to confirm).
  await page.waitForFunction(
    () => (window as any).__BOOM_TEST_GET_STATE__?.()?.stage === 'confirm',
    { timeout: 10_000 }
  );

  // Set bill amount + submit.
  await page.evaluate((amt) => (window as any).__BOOM_TEST_SET_AMOUNT__(amt), opts.billAmount);
  await page.evaluate(() => (window as any).__BOOM_TEST_SUBMIT__());

  // Wait until stage === 'success' OR 'confirm' (error) or an alert fires.
  await page.waitForFunction(
    () => {
      const s = (window as any).__BOOM_TEST_GET_STATE__?.();
      return s && (s.stage === 'success' || s.stage === 'confirm');
    },
    { timeout: 20_000 }
  );

  const state = await page.evaluate(() => (window as any).__BOOM_TEST_GET_STATE__());
  return {
    cashbackEarned: state.cashbackEarned,
    venueName: state.venueName,
    cashbackPercent: state.cashbackPercent,
  };
}

/** 1×1 transparent PNG data URI — enough to satisfy the image-picker contract. */
export function makeTinyPngDataUri(): string {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
}
