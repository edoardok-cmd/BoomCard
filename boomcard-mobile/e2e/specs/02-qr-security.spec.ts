import { test, expect, Page } from '@playwright/test';
import { loginAs, fixtures } from '../helpers/auth';
import { API_BASE } from '../helpers/api';
import { setStickerStatus } from '../helpers/pg';

async function gotoScanner(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const scanTab = page.getByText(/^scan$/i).first();
  await scanTab.waitFor({ timeout: 15_000 });
  await scanTab.click();
  await page.waitForFunction(() => !!(window as any).__BOOM_TEST_SCAN__, { timeout: 15_000 });
  await page.evaluate(() => (window as any).__BOOM_TEST_BYPASS_PERM__());
}

/**
 * Inject a QR payload and observe the outcome. Returns either:
 *   { ok: true, stage, venueName, ... }  if the flow proceeded to UploadReceipt
 *   { ok: false, reason }                if the scanner rejected the payload
 */
async function scanAndObserve(page: Page, payload: string): Promise<{ ok: boolean; state?: any }> {
  // Force-delete any leftover Upload hook so we only detect a FRESH mount after this scan.
  await page.evaluate(() => { delete (window as any).__BOOM_TEST_UPLOAD_IMAGE__; });

  await page.evaluate((qr) => (window as any).__BOOM_TEST_SCAN__(qr), payload);

  // Wait up to 5s. If Upload hook appears, scan succeeded. If not, scan was rejected.
  await page.waitForTimeout(5000);
  const result = await page.evaluate(() => ({
    upload: !!(window as any).__BOOM_TEST_UPLOAD_IMAGE__,
    state: (window as any).__BOOM_TEST_GET_STATE__?.(),
  }));
  return { ok: result.upload, state: result.state };
}

// Dismiss all dialogs (scanner uses window.alert on web for errors). Register per-test.
function autoDismissDialogs(page: Page) {
  page.on('dialog', (d) => { void d.dismiss(); });
}

test.describe('§2 QR payload security', () => {
  test.beforeEach(async ({ page }) => { autoDismissDialogs(page); });

  test('§2.1 malformed JSON → rejected, no session', async ({ context, page }) => {
    await loginAs(context, 'premium');
    await gotoScanner(page);
    const res = await scanAndObserve(page, 'not-a-valid-qr-payload');
    expect(res.ok).toBe(false);
  });

  test('§2.2 wrong `type` field → rejected', async ({ context, page }) => {
    await loginAs(context, 'premium');
    await gotoScanner(page);
    const bad = JSON.stringify({ type: 'PHISHING', stickerId: 'V20PCT-T1' });
    const res = await scanAndObserve(page, bad);
    expect(res.ok).toBe(false);
  });

  test('§2.3 unknown stickerId → 404 at session', async ({ context, page }) => {
    await loginAs(context, 'premium');
    await gotoScanner(page);
    const bogus = JSON.stringify({ type: 'BOOM_STICKER', stickerId: 'BOGUS-123', venueId: 'x', locationId: 'x', locationType: 'TABLE', version: '1.0' });
    const res = await scanAndObserve(page, bogus);
    expect(res.ok).toBe(false);
  });

  test('§2.4 deactivated sticker → rejected at validate', async ({ context, page }) => {
    await setStickerStatus('V5PCT-T1', 'INACTIVE');
    try {
      await loginAs(context, 'premium');
      await gotoScanner(page);
      const res = await scanAndObserve(page, fixtures.venues['5'].qrPayload);
      expect(res.ok).toBe(false);
    } finally {
      await setStickerStatus('V5PCT-T1', 'ACTIVE');
    }
  });

  test('§2.6 cross-venue replay: right payload, wrong GPS → GPS rejected', async ({ context, page }) => {
    await loginAs(context, 'premium');
    // Override geolocation to ~2 km away.
    await context.setGeolocation({ latitude: 42.72, longitude: 23.34 });
    await gotoScanner(page);
    const res = await scanAndObserve(page, fixtures.venues['20'].qrPayload);
    expect(res.ok).toBe(false);
  });

  test('§2.7 tampered venueId → server rejects (payload venueId ≠ DB sticker venue)', async ({ context, page }) => {
    await loginAs(context, 'premium');
    await gotoScanner(page);
    const tampered = JSON.stringify({
      type: 'BOOM_STICKER',
      stickerId: fixtures.venues['20'].stickerId,
      venueId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      locationId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      locationType: 'TABLE',
      version: '1.0',
    });
    const res = await scanAndObserve(page, tampered);
    expect(res.ok).toBe(false);
  });

  test('§2.8 old `version` (< 1.0) → rejected by client-side version check', async ({ context, page }) => {
    await loginAs(context, 'premium');
    await gotoScanner(page);
    const oldVersion = JSON.stringify({ ...JSON.parse(fixtures.venues['20'].qrPayload), version: '0.9' });
    const res = await scanAndObserve(page, oldVersion);
    expect(res.ok).toBe(false);
  });
});
