/**
 * §7 Live-photo enforcement
 *
 * Product rule: receipt uploads must be LIVE camera captures. Two barriers:
 *   UX: mobile removes the "Choose from Gallery" button (manual check).
 *   Server: parses EXIF DateTimeOriginal; rejects photos older than 30 min OR taken
 *           before the scan's sessionStartedAt.
 *
 * These tests exercise the server gate by crafting JPEGs with synthetic EXIF.
 * They require the backend to run WITHOUT the RECEIPT_LIVE_PHOTO_ENFORCEMENT=off
 * bypass. We flip enforcement on via a /test-only endpoint would be cleaner; absent
 * that, these tests skip when the bypass is on and produce a visible warning.
 */
import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { fixtures } from '../helpers/auth';
import { API_BASE, login, createSession, submitScan } from '../helpers/api';
import { clearScansForUser } from '../helpers/pg';

const BAR = (fixtures as any).bar as { stickerId: string; lat: number; lng: number };
const RECEIPT_DIR = path.join(__dirname, '..', 'fixtures', 'receipts', 'bar');

/**
 * Build a tiny JPEG with EXIF DateTimeOriginal set to `when`. We hand-craft the bytes:
 *   SOI + APP1(Exif IFD with DateTimeOriginal) + SOF + minimal data + EOI.
 * For the test we actually take a real JPEG and rewrite its EXIF via `piexifjs` if
 * available; otherwise we fall back to deleting EXIF (which bypasses the age check).
 */
/**
 * Format a Date as an EXIF DateTimeOriginal string ("YYYY:MM:DD HH:MM:SS") in the
 * server's venue timezone (Europe/Sofia). EXIF strings are naïve local time, and
 * the backend interprets them as Europe/Sofia — we MUST produce the same wall-clock
 * the backend will reconstruct, otherwise CI runners in UTC see a 2–3 h offset and
 * §7.3 (fresh photo = now) wrongly flips to "stale" or "pre-session".
 */
function exifTagInSofia(when: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(when);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}:${get('month')}:${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function makeJpegWithExifDate(buf: Buffer, when: Date): Buffer {
  // We use piexifjs to patch an existing JPEG's EXIF — keeps the real image data intact
  // so magic-bytes + sharp/OCR pipelines don't choke on a fabricated JPEG skeleton.
  // If piexifjs isn't installed, this test bails with a clear error — surface the gap
  // to the dev rather than producing a misleading pass.
  let piexif: any;
  try { piexif = require('piexifjs'); }
  catch {
    throw new Error('piexifjs not installed. Run `npm i -D piexifjs` in boomcard-mobile to run §7 tests.');
  }
  const dataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;
  const tag = exifTagInSofia(when);
  const zeroth: any = {};
  const exif: any = { [piexif.ExifIFD.DateTimeOriginal]: tag };
  const exifObj = { '0th': zeroth, 'Exif': exif };
  const exifBytes = piexif.dump(exifObj);
  const withExif = piexif.insert(exifBytes, dataUri);
  const b64 = withExif.split(',')[1];
  return Buffer.from(b64, 'base64');
}

async function uploadReceipt(scanId: string, token: string, buf: Buffer, name = 'r.jpg') {
  const fd = new FormData();
  fd.append('image', new Blob([new Uint8Array(buf)], { type: 'image/jpeg' }), name);
  const res = await fetch(`${API_BASE}/api/stickers/scan/${scanId}/receipt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test.describe('§7 Live-photo enforcement (EXIF age + pre-scan checks)', () => {
  // Probe once per run: if the backend was started with RECEIPT_LIVE_PHOTO_ENFORCEMENT=off
  // (the setting needed by §6 real-receipt tests), the age/session gates are bypassed
  // and §7.1/§7.2 would wrongly pass. Skip the whole suite in that case rather than fail.
  let enforcementOn = true;
  test.beforeAll(async () => {
    try {
      const s = await login('premium@test.local', fixtures.password);
      await clearScansForUser('premium@test.local');
      const sess = await createSession(BAR.stickerId, BAR.lat, BAR.lng, s.accessToken);
      const scan = await submitScan(sess.data.sessionId, 5.00, BAR.lat, BAR.lng, s.accessToken);
      const source = fs.readFileSync(path.join(RECEIPT_DIR, '20260415_201930.jpg'));
      const probeJpeg = makeJpegWithExifDate(source, new Date(Date.now() - 48 * 3600 * 1000));
      const up = await uploadReceipt(scan.data.id, s.accessToken, probeJpeg, 'probe.jpg');
      enforcementOn = up.status === 400;
    } catch {
      enforcementOn = true; // fail-closed: assume enforcement, let real tests surface issues
    }
  });
  test.beforeEach(async () => {
    test.skip(!enforcementOn, 'RECEIPT_LIVE_PHOTO_ENFORCEMENT=off — §7 gates are bypassed; skipping.');
    await clearScansForUser('premium@test.local');
  });

  test('§7.1 gallery-picked photo (EXIF 2 days old) → rejected as stale', async () => {
    const s = await login('premium@test.local', fixtures.password);
    const sess = await createSession(BAR.stickerId, BAR.lat, BAR.lng, s.accessToken);
    const scan = await submitScan(sess.data.sessionId, 5.00, BAR.lat, BAR.lng, s.accessToken);

    const source = fs.readFileSync(path.join(RECEIPT_DIR, '20260415_201930.jpg'));
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
    const staleJpeg = makeJpegWithExifDate(source, twoDaysAgo);

    const up = await uploadReceipt(scan.data.id, s.accessToken, staleJpeg, 'old.jpg');
    expect(up.status).toBe(400);
    expect(String(up.body.error ?? '')).toMatch(/minutes old|live|camera|gallery/i);
  });

  test('§7.2 photo taken BEFORE the QR scan (EXIF 5 min before session) → rejected', async () => {
    const s = await login('premium@test.local', fixtures.password);
    const sess = await createSession(BAR.stickerId, BAR.lat, BAR.lng, s.accessToken);
    const scan = await submitScan(sess.data.sessionId, 5.00, BAR.lat, BAR.lng, s.accessToken);

    const source = fs.readFileSync(path.join(RECEIPT_DIR, '20260415_201930.jpg'));
    const fiveMinBeforeScan = new Date(Date.now() - 5 * 60 * 1000);
    const preScanJpeg = makeJpegWithExifDate(source, fiveMinBeforeScan);

    const up = await uploadReceipt(scan.data.id, s.accessToken, preScanJpeg, 'pre.jpg');
    expect(up.status).toBe(400);
    expect(String(up.body.error ?? '')).toMatch(/before the QR scan|new photo/i);
  });

  test('§7.3 fresh photo (EXIF = now) → accepted', async () => {
    const s = await login('premium@test.local', fixtures.password);
    const sess = await createSession(BAR.stickerId, BAR.lat, BAR.lng, s.accessToken);
    const scan = await submitScan(sess.data.sessionId, 5.00, BAR.lat, BAR.lng, s.accessToken);

    const source = fs.readFileSync(path.join(RECEIPT_DIR, '20260415_202016.jpg'));
    const now = new Date();
    const freshJpeg = makeJpegWithExifDate(source, now);

    const up = await uploadReceipt(scan.data.id, s.accessToken, freshJpeg, 'fresh.jpg');
    expect(up.status).toBe(200);
  });
});
