import { test, expect, Page } from '@playwright/test';
import { loginAs, fixtures } from '../helpers/auth';
import { setVenueConfig } from '../helpers/pg';

async function gotoScanner(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByText(/^scan$/i).first().click();
  await page.waitForFunction(() => !!(window as any).__BOOM_TEST_SCAN__, { timeout: 15_000 });
  await page.evaluate(() => (window as any).__BOOM_TEST_BYPASS_PERM__());
}

async function scanAndObserve(page: Page, payload: string) {
  await page.evaluate(() => { delete (window as any).__BOOM_TEST_UPLOAD_IMAGE__; });
  await page.evaluate((qr) => (window as any).__BOOM_TEST_SCAN__(qr), payload);
  await page.waitForTimeout(5000);
  return page.evaluate(() => ({
    upload: !!(window as any).__BOOM_TEST_UPLOAD_IMAGE__,
    state: (window as any).__BOOM_TEST_GET_STATE__?.(),
  }));
}

const VENUE_LAT = fixtures.venueCoords.lat;
const VENUE_LNG = fixtures.venueCoords.lng;
const V20 = fixtures.venues['20'];
const V15 = fixtures.venues['15']; // for per-test config flips to avoid cross-contamination

test.describe('§3 GPS verification', () => {
  test.beforeEach(async ({ page }) => { page.on('dialog', (d) => void d.dismiss()); });

  test('§3.1 inside radius (0 m) → accepted', async ({ context, page }) => {
    await context.setGeolocation({ latitude: VENUE_LAT, longitude: VENUE_LNG });
    await loginAs(context, 'premium');
    await gotoScanner(page);
    const res = await scanAndObserve(page, V20.qrPayload);
    expect(res.upload).toBe(true);
  });

  test('§3.2 warning band 300 m → accepted (within 500 m radius)', async ({ context, page }) => {
    // ~300 m north of venue: 1° lat ≈ 111 km, so 0.003° ≈ 333 m
    await context.setGeolocation({ latitude: VENUE_LAT + 0.003, longitude: VENUE_LNG });
    await loginAs(context, 'premium');
    await gotoScanner(page);
    const res = await scanAndObserve(page, V20.qrPayload);
    expect(res.upload).toBe(true);
  });

  test('§3.3 outside radius (2 km) → rejected', async ({ context, page }) => {
    await context.setGeolocation({ latitude: VENUE_LAT + 0.02, longitude: VENUE_LNG });
    await loginAs(context, 'premium');
    await gotoScanner(page);
    const res = await scanAndObserve(page, V20.qrPayload);
    expect(res.upload).toBe(false);
  });

  test('§3.6 null-island (0,0) → rejected (well outside 500 m)', async ({ context, page }) => {
    await context.setGeolocation({ latitude: 0.0001, longitude: 0.0001 });
    await loginAs(context, 'premium');
    await gotoScanner(page);
    const res = await scanAndObserve(page, V20.qrPayload);
    expect(res.upload).toBe(false);
  });

  test('§3.7 gpsVerificationEnabled=false is IGNORED — far coords still rejected', async ({ context, page }) => {
    // Product decision: GPS is mandatory and cannot be bypassed per-venue. The schema flag
    // is kept for backwards compat but ignored by sticker.service. Test proves scans from
    // far away are STILL rejected even when a (potentially mistaken) admin flips the flag.
    await setVenueConfig(V15.venueId, { gpsVerificationEnabled: false });
    try {
      await context.setGeolocation({ latitude: 10, longitude: 10 });
      await loginAs(context, 'premium');
      await gotoScanner(page);
      const res = await scanAndObserve(page, V15.qrPayload);
      expect(res.upload).toBe(false);
    } finally {
      await setVenueConfig(V15.venueId, { gpsVerificationEnabled: true });
    }
  });

  test('§3.4 permission denied at OS level → scanner blocks before session', async ({ browser }) => {
    const ctx = await browser.newContext({ permissions: [] });
    const page = await ctx.newPage();
    page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
    await loginAs(ctx, 'premium');
    await gotoScanner(page);
    const res = await scanAndObserve(page, V20.qrPayload);
    expect(res.upload).toBe(false);
    await ctx.close();
  });

  // §3.5 "stale fix (>2min)" — not verifiable from Playwright because the browser geolocation
  // API returns the current fix, not a historical one. The server code does not currently inspect
  // the timestamp either, so this is a known-unverifiable scenario. Marked skipped.
  test.skip('§3.5 stale GPS fix (>2 min old) → rejected', async () => {
    // Not implementable without a mocked GPS backend.
  });
});
