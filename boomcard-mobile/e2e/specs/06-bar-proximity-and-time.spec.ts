/**
 * §6 — Real-bar proximity and time limits
 *
 * Exercises the "Bar" venue seeded at ул. 6-ти септември 10А, Sofia (42.6934, 23.3262)
 * with a deliberately tight 100 m GPS radius. Uses six real receipt photos shot from
 * the same bar on 2026-04-15 evening (€2.80 – €10.80 totals) as upload fixtures.
 *
 * Covers:
 *  - §6.1 proximity: inside radius → accepted
 *  - §6.2 proximity: warning band (80 m) inside radius → accepted
 *  - §6.3 proximity: just outside (150 m) → rejected with GPS error
 *  - §6.4 proximity: far (2 km) → rejected
 *  - §6.5 proximity: gpsVerificationEnabled=false on venue → any location accepted
 *  - §6.6 time: session created today, submit before 6 AM next day → accepted
 *  - §6.7 time: session backdated ≥30 h (past 6 AM deadline) → rejected EXPIRED
 *  - §6.8 duplicate receipts across the six real photos (same hash ≠ same content)
 */

import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { fixtures } from '../helpers/auth';
import { API_BASE, login, createSession, submitScan } from '../helpers/api';
import { backdateSession, clearScansForUser, getScanById, setVenueConfig } from '../helpers/pg';
import sharp from 'sharp';

const BAR = (fixtures as any).bar as {
  venueId: string;
  stickerId: string;
  qrPayload: string;
  lat: number;
  lng: number;
  gpsRadiusMeters: number;
};

const RECEIPT_DIR = path.join(__dirname, '..', 'fixtures', 'receipts', 'bar');
const RECEIPTS = {
  eur3_00:  '20260415_201930.jpg', // 3.00 EUR
  eur10_80: '20260415_201940.jpg', // 10.80 EUR / 21.12 BGN
  eur2_80a: '20260415_201956.jpg', // 2.80 EUR / 5.48 BGN
  eur9_00:  '20260415_202002.jpg', // 9.00 EUR / 17.60 BGN
  eur4_00:  '20260415_202016.jpg', // 4.00 EUR / 7.82 BGN
  eur2_80b: '20260415_202034.jpg', // 2.80 EUR / 5.48 BGN — byte-distinct from eur2_80a
};

function readReceipt(name: string): Buffer {
  return fs.readFileSync(path.join(RECEIPT_DIR, name));
}

/** Create a fresh session at a given (lat,lng). Returns API response. */
async function sessionAt(token: string, lat: number, lng: number) {
  return createSession(BAR.stickerId, lat, lng, token);
}

async function uploadReceipt(scanId: string, token: string, buf: Buffer, name: string) {
  const fd = new FormData();
  fd.append('image', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), name);
  const res = await fetch(`${API_BASE}/api/stickers/scan/${scanId}/receipt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test.describe('§6 Bar proximity + time limits (real receipts)', () => {
  test.beforeEach(async () => {
    await clearScansForUser('premium@test.local');
    await clearScansForUser('basic@test.local');
    // Restore Bar's canonical config in case a prior test flipped GPS off
    await setVenueConfig(BAR.venueId, {
      gpsVerificationEnabled: true,
      gpsRadiusMeters: BAR.gpsRadiusMeters,
      minBillAmount: 0,
    });
  });

  // ── Proximity ─────────────────────────────────────────────────────────

  test('§6.1 inside radius (0 m from venue) → session accepted', async () => {
    const s = await login('premium@test.local', fixtures.password);
    const res = await sessionAt(s.accessToken, BAR.lat, BAR.lng);
    expect(res.success).toBe(true);
    expect(res.data.sessionId).toBeDefined();
  });

  test('§6.2 warning band — 80 m inside 100 m radius → accepted', async () => {
    const s = await login('premium@test.local', fixtures.password);
    // 80 m north at Sofia latitude: 80 / 111320 ≈ 0.00072°
    const res = await sessionAt(s.accessToken, BAR.lat + 0.00072, BAR.lng);
    expect(res.success).toBe(true);
  });

  test('§6.3 just outside — 150 m from venue (>100 m radius) → rejected', async () => {
    const s = await login('premium@test.local', fixtures.password);
    // 150 m north: 150 / 111320 ≈ 0.001348°
    const res = await sessionAt(s.accessToken, BAR.lat + 0.001348, BAR.lng);
    expect(res.success).toBe(false);
    expect(String(res.error ?? '')).toMatch(/location|gps|distance|radius|within|away from the venue|m of the venue/i);
  });

  test('§6.4 far away — 2 km from venue → rejected', async () => {
    const s = await login('premium@test.local', fixtures.password);
    // 2 km north: 2000 / 111320 ≈ 0.01796°
    const res = await sessionAt(s.accessToken, BAR.lat + 0.01796, BAR.lng);
    expect(res.success).toBe(false);
  });

  test('§6.5 gpsVerificationEnabled=false cannot override proximity — Plovdiv still rejected', async () => {
    // Product rule: no venue may opt out of GPS. Even with the legacy flag flipped off,
    // the server must reject a scan from another city (145 km in Plovdiv).
    await setVenueConfig(BAR.venueId, { gpsVerificationEnabled: false });
    try {
      const s = await login('premium@test.local', fixtures.password);
      const res = await sessionAt(s.accessToken, 42.1354, 24.7453); // Plovdiv
      expect(res.success).toBe(false);
      expect(String(res.error ?? '')).toMatch(/within|m of the venue|location|gps/i);
    } finally {
      await setVenueConfig(BAR.venueId, { gpsVerificationEnabled: true });
    }
  });

  test('§6.5b no latitude/longitude in request → rejected (GPS is mandatory)', async () => {
    const s = await login('premium@test.local', fixtures.password);
    // Hit the session endpoint directly with no coords — helper always sends them, so bypass.
    const res = await fetch(`${API_BASE}/api/stickers/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.accessToken}` },
      body: JSON.stringify({
        stickerId: BAR.stickerId,
        payloadVenueId: BAR.venueId,
        payloadVersion: '1.0',
      }),
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(String(body.error ?? '')).toMatch(/location|gps/i);
  });

  // ── Time / deadline ────────────────────────────────────────────────────

  test('§6.6 session created now, bill submitted immediately → accepted', async () => {
    const s = await login('premium@test.local', fixtures.password);
    const sess = await sessionAt(s.accessToken, BAR.lat, BAR.lng);
    expect(sess.success).toBe(true);

    const scan = await submitScan(sess.data.sessionId, 3.00, BAR.lat, BAR.lng, s.accessToken);
    expect(scan.success).toBe(true);
  });

  test('§6.7 session backdated past 6 AM deadline → bill submit rejected and session EXPIRED', async () => {
    const s = await login('premium@test.local', fixtures.password);
    const sess = await sessionAt(s.accessToken, BAR.lat, BAR.lng);
    expect(sess.success).toBe(true);

    // Back up 36 h: "yesterday early morning" — well past 6 AM the morning after.
    await backdateSession(sess.data.sessionId, 36);

    const scan = await submitScan(sess.data.sessionId, 9.00, BAR.lat, BAR.lng, s.accessToken);
    expect(scan.success).toBe(false);
    expect(String(scan.error ?? '')).toMatch(/deadline|expired|6[:\s]*0?0\s*am/i);
  });

  // ── Real-receipt upload ────────────────────────────────────────────────

  test('§6.8 upload real receipt (3.00 EUR) → cashback computed on BGN-equivalent', async () => {
    const s = await login('premium@test.local', fixtures.password);
    const sess = await sessionAt(s.accessToken, BAR.lat, BAR.lng);
    expect(sess.success).toBe(true);
    // Bill amount is the BGN the user entered; app converts BGN↔EUR for display only.
    // Receipt printed 3.00 EUR = 5.87 BGN. We submit 5.87.
    const scan = await submitScan(sess.data.sessionId, 5.87, BAR.lat, BAR.lng, s.accessToken);
    expect(scan.success).toBe(true);

    const up = await uploadReceipt(scan.data.id, s.accessToken, readReceipt(RECEIPTS.eur3_00), 'r1.jpg');
    expect(up.status).toBe(200);
    // PREMIUM × 15 % → 12 % matrix, but only on billAmount. 5.87 × 0.12 = 0.7044 BGN.
    expect(up.body.data.cashbackAmount).toBeCloseTo(0.7, 1);
  });

  test('§6.9 six real receipts from same bar in rapid succession → all accepted, dedupe inactive (byte-distinct)', async () => {
    const s = await login('premium@test.local', fixtures.password);
    const names = [RECEIPTS.eur3_00, RECEIPTS.eur10_80, RECEIPTS.eur2_80a, RECEIPTS.eur9_00, RECEIPTS.eur4_00, RECEIPTS.eur2_80b];
    const amounts = [5.87, 21.12, 5.48, 17.60, 7.82, 5.48];
    for (let i = 0; i < names.length; i++) {
      const sess = await sessionAt(s.accessToken, BAR.lat, BAR.lng);
      expect(sess.success).toBe(true);
      const scan = await submitScan(sess.data.sessionId, amounts[i], BAR.lat, BAR.lng, s.accessToken);
      expect(scan.success).toBe(true);
      const up = await uploadReceipt(scan.data.id, s.accessToken, readReceipt(names[i]), names[i]);
      // Each real photo has unique bytes → each upload should succeed (200 OK).
      expect(up.status).toBe(200);
    }
  });

  // Waits for server-side OCR merchant enrichment to finish (detached in the
  // uploadReceipt flow). Polls getScanById until either a MERCHANT_MISMATCH reason
  // appears OR the timeout elapses. Returns the final reasons array.
  async function waitForOcrEnrichment(scanId: string, timeoutMs = 90_000): Promise<string[]> {
    const deadline = Date.now() + timeoutMs;
    let reasons: string[] = [];
    while (Date.now() < deadline) {
      const row = await getScanById(scanId);
      reasons = row?.fraudReasons ?? [];
      if (reasons.some((r: string) => r.startsWith('MERCHANT_MISMATCH'))) return reasons;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return reasons;
  }

  test('§6.11 real Kristal thermal receipt uploaded on Bar → MANUAL_REVIEW (OCR conf too low to auto-flag merchant)', async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    // Thermal receipt photos OCR at ~35% confidence — Tesseract returns garbage for
    // the merchant line. The server-side merchant verifier gates on confidence ≥ 60,
    // so this photo does NOT produce a MERCHANT_MISMATCH fraudReason; the scan only
    // reaches MANUAL_REVIEW via the default "all scans need admin approval" path.
    // §6.12 uses a synthetic high-contrast image to exercise the auto-flag path.
    const s = await login('premium@test.local', fixtures.password);
    const sess = await sessionAt(s.accessToken, BAR.lat, BAR.lng);
    expect(sess.success).toBe(true);
    const scan = await submitScan(sess.data.sessionId, 6.02, BAR.lat, BAR.lng, s.accessToken);
    expect(scan.success).toBe(true);

    const kristal = fs.readFileSync(path.join(RECEIPT_DIR, 'kristal-other-venue.jpg'));
    const up = await uploadReceipt(scan.data.id, s.accessToken, kristal, 'kristal.jpg');
    expect(up.status).toBe(200);
    expect(up.body.data.status).toBe('MANUAL_REVIEW');

    // Give the detached OCR job time to complete, then confirm no false flag.
    await new Promise((r) => setTimeout(r, 45_000));
    const row = await getScanById(scan.data.id);
    const reasons: string[] = row.fraudReasons ?? [];
    expect(reasons.some((r) => r.startsWith('MERCHANT_MISMATCH'))).toBe(false);
  });

  test('§6.12 high-confidence OCR of a non-Bar merchant name → MERCHANT_MISMATCH auto-flagged', async ({}, testInfo) => {
    testInfo.setTimeout(180_000);
    // Renders a crisp JPEG with "KRISTAL STORE" text that Tesseract reads at >90%
    // confidence. The server-side verifier runs async after the upload response, so
    // we poll the DB until the MERCHANT_MISMATCH fraudReason lands.
    const s = await login('premium@test.local', fixtures.password);
    const sess = await sessionAt(s.accessToken, BAR.lat, BAR.lng);
    expect(sess.success).toBe(true);
    const scan = await submitScan(sess.data.sessionId, 10.50, BAR.lat, BAR.lng, s.accessToken);
    expect(scan.success).toBe(true);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">
      <rect width="600" height="400" fill="white"/>
      <text x="30" y="70" font-size="56" font-family="Helvetica" fill="black">KRISTAL STORE</text>
      <text x="30" y="160" font-size="32" font-family="Helvetica" fill="black">ul. Vitosha 15</text>
      <text x="30" y="230" font-size="40" font-family="Helvetica" fill="black">Total: 10.50 EUR</text>
      <text x="30" y="300" font-size="30" font-family="Helvetica" fill="black">2026-04-15 14:30</text>
    </svg>`;
    const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();

    const up = await uploadReceipt(scan.data.id, s.accessToken, jpeg, 'kristal-synthetic.jpg');
    expect(up.status).toBe(200);
    expect(up.body.data.status).toBe('MANUAL_REVIEW');

    const reasons = await waitForOcrEnrichment(scan.data.id, 60_000);
    expect(reasons.some((r) => r.includes('MERCHANT_MISMATCH'))).toBe(true);
    const row = await getScanById(scan.data.id);
    expect(Number(row.fraudScore)).toBeGreaterThanOrEqual(40);
  });

  test('§6.10 same user re-uploads same real receipt → second attempt rejected (SHA-256 dedupe)', async () => {
    const s = await login('premium@test.local', fixtures.password);
    const buf = readReceipt(RECEIPTS.eur10_80);

    const sess1 = await sessionAt(s.accessToken, BAR.lat, BAR.lng);
    const scan1 = await submitScan(sess1.data.sessionId, 21.12, BAR.lat, BAR.lng, s.accessToken);
    const up1 = await uploadReceipt(scan1.data.id, s.accessToken, buf, 'r.jpg');
    expect(up1.status).toBe(200);

    const sess2 = await sessionAt(s.accessToken, BAR.lat, BAR.lng);
    const scan2 = await submitScan(sess2.data.sessionId, 21.12, BAR.lat, BAR.lng, s.accessToken);
    const up2 = await uploadReceipt(scan2.data.id, s.accessToken, buf, 'r.jpg');
    expect(up2.status).toBe(400);
    expect(String(up2.body.error ?? '')).toMatch(/duplicate|already been submitted/i);
  });
});
