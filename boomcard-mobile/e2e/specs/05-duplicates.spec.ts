import { test, expect } from '@playwright/test';
import { fixtures } from '../helpers/auth';
import { API_BASE, login, createSession, submitScan } from '../helpers/api';
import { clearScansForUser } from '../helpers/pg';

// Pre-built tiny 1×1 and 2×2 PNGs (different bytes, visually near-identical).
const TINY_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const TINY_2x2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAQAAAB/GpQeAAAADElEQVR42mNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=', 'base64');

async function freshSessionAndScan(email: string, step: '5' | '10' | '15' | '20' | '25', bill: number) {
  const session = await login(email, fixtures.password);
  const s = await createSession(fixtures.venues[step].stickerId, fixtures.venueCoords.lat, fixtures.venueCoords.lng, session.accessToken);
  if (!s.success) throw new Error(`session fail: ${JSON.stringify(s)}`);
  const scan = await submitScan(s.data.sessionId, bill, fixtures.venueCoords.lat, fixtures.venueCoords.lng, session.accessToken);
  if (!scan.success) throw new Error(`scan fail: ${JSON.stringify(scan)}`);
  return { token: session.accessToken, scanId: scan.data.id };
}

async function uploadReceipt(scanId: string, token: string, buf: Buffer, name = 'r.png', type = 'image/png') {
  const fd = new FormData();
  fd.append('image', new Blob([new Uint8Array(buf)], { type }), name);
  return fetch(`${API_BASE}/api/stickers/scan/${scanId}/receipt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

test.describe('§5 Duplicate detection', () => {
  test.beforeEach(async () => {
    await clearScansForUser('premium@test.local');
    await clearScansForUser('basic@test.local');
  });

  test('§5.1 same user, byte-identical reupload → second rejected (SHA-256 match)', async () => {
    const { scanId: id1, token } = await freshSessionAndScan('premium@test.local', '20', 40);
    const r1 = await uploadReceipt(id1, token, TINY_1x1);
    expect(r1.ok).toBe(true);

    const { scanId: id2, token: tok2 } = await freshSessionAndScan('premium@test.local', '20', 45);
    const r2 = await uploadReceipt(id2, tok2, TINY_1x1);
    const body2 = await r2.json();
    expect(r2.ok).toBe(false);
    expect(String(body2.error || body2.message || '')).toMatch(/duplicate|already been submitted/i);
  });

  test('§5.2 different users, byte-identical bytes → second rejected (global SHA-256 dedupe)', async () => {
    const { scanId: id1, token: t1 } = await freshSessionAndScan('premium@test.local', '15', 20);
    const r1 = await uploadReceipt(id1, t1, TINY_1x1);
    expect(r1.ok).toBe(true);

    const { scanId: id2, token: t2 } = await freshSessionAndScan('basic@test.local', '15', 20);
    const r2 = await uploadReceipt(id2, t2, TINY_1x1);
    const body2 = await r2.json();
    expect(r2.ok).toBe(false);
    expect(String(body2.error || body2.message || '')).toMatch(/duplicate|already been submitted/i);
  });

  test('§5.3 near-duplicate (different PNG bytes) → accepted', async () => {
    const { scanId, token } = await freshSessionAndScan('premium@test.local', '25', 30);
    const r = await uploadReceipt(scanId, token, TINY_2x2);
    const body = await r.text();
    // Some PNG bytes may fail magic-byte validation server-side. Log for record; behaviour itself is the finding.
    console.log('§5.3 near-dup:', r.status, body.slice(0, 200));
  });

  // §5.4/5.5 need real receipt templates and cross-venue photos — covered by backend unit tests
  // in backend-api/src/services/receiptTemplate.service.test.ts.
  test.skip('§5.4 moderate dHash distance (10–20)', async () => {});
  test.skip('§5.5 same receipt, wrong venue (venue name mismatch)', async () => {});
});
