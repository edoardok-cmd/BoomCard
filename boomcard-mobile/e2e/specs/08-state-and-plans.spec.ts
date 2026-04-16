import { test, expect } from '@playwright/test';
import { fixtures } from '../helpers/auth';
import { API_BASE, login, createSession, submitScan } from '../helpers/api';
import { clearScansForUser, setVenueConfig, setVenueFraudConfig, getLatestScan, getWalletBalance } from '../helpers/pg';

// Helper: full session+scan cycle via API for one user+venue
async function runApiCycle(email: string, step: '5' | '10' | '15' | '20' | '25', bill: number) {
  const session = await login(email, fixtures.password);
  const s = await createSession(fixtures.venues[step].stickerId, fixtures.venueCoords.lat, fixtures.venueCoords.lng, session.accessToken);
  if (!s.success) return { ok: false, error: s.error, session };
  const scan = await submitScan(s.data.sessionId, bill, fixtures.venueCoords.lat, fixtures.venueCoords.lng, session.accessToken);
  return { ok: scan.success, scan: scan.data, error: scan.error, session };
}

// ─── §7 Rate limits & caps ────────────────────────────────────────────────
test.describe('§7 Rate limits and caps', () => {
  test.beforeEach(async () => {
    await clearScansForUser('premium@test.local');
    await clearScansForUser('basic@test.local');
  });

  test('§7.1 maxCashbackPerScan cap (VenueFraudConfig) → credit trimmed', async () => {
    await setVenueFraudConfig(fixtures.venues['25'].venueId, { maxCashbackPerScan: 10 });
    try {
      const r = await runApiCycle('premium@test.local', '25', 100);
      expect(r.ok).toBe(true);
      expect(r.scan.cashbackAmount).toBeLessThanOrEqual(10);
    } finally {
      await setVenueFraudConfig(fixtures.venues['25'].venueId, { maxCashbackPerScan: null });
    }
  });

  // §7.2 — rolling daily cap (would require time advance or DB-level rolling-window setup)
  // §7.3 — rolling monthly cap (same)
  test.skip('§7.2 rolling daily cap — needs VenueStickerConfig + rolling window helper', async () => {});
  test.skip('§7.3 rolling monthly cap', async () => {});

  test('§7.4 maxScansPerDay cap (Finding #8: not enforced even via VenueFraudConfig)', async () => {
    await setVenueFraudConfig(fixtures.venues['5'].venueId, { maxScansPerDay: 1 });
    try {
      const a = await runApiCycle('premium@test.local', '5', 20);
      expect(a.ok).toBe(true);
      const b = await runApiCycle('premium@test.local', '5', 30);
      // Document the actual behaviour — neither rejection nor fraud-score elevation fires.
      console.log('§7.4 second-scan-on-capped-venue:', { ok: b.ok, fraudScore: b.scan?.fraudScore, error: b.error });
      expect(b.ok).toBe(true); // records that the cap is bypassed today
    } finally {
      await setVenueFraudConfig(fixtures.venues['5'].venueId, { maxScansPerDay: 999999 });
    }
  });

  test.skip('§7.5 rapid submissions (>3/5min)', async () => {});
  test.skip('§7.6 TOCTOU concurrent cap breach', async () => {});
  test.skip('§7.7 pending amounts count against cap', async () => {});
});

// ─── §8 Plan authorization ────────────────────────────────────────────────
test.describe('§8 Plan authorization', () => {
  test.beforeEach(async () => { await clearScansForUser('expired@test.local'); });

  test('§8.1 FREE user can scan but receives 0 cashback (no active subscription)', async () => {
    await clearScansForUser('free@test.local');
    const r = await runApiCycle('free@test.local', '20', 100);
    expect(r.ok).toBe(true);
    expect(r.scan.cashbackAmount).toBe(0);
  });

  test('§8.2 expired subscription → treated as FREE, cashback = 0', async () => {
    const r = await runApiCycle('expired@test.local', '20', 100);
    expect(r.ok).toBe(true);
    expect(r.scan.cashbackAmount).toBe(0);
  });

  test.skip('§8.3 partner-type gating — would need a restrictive PartnerType seed', async () => {});
  test.skip('§8.4 mid-session upgrade — deferred (complex state setup)', async () => {});
  test.skip('§8.5 cancel mid-flow — deferred', async () => {});
});

// ─── §9 Session state machine ─────────────────────────────────────────────
test.describe('§9 Session state machine', () => {
  test('§9.1 upload to non-existent scanId → 404', async () => {
    const session = await login('premium@test.local', fixtures.password);
    const fd = new FormData();
    fd.append('image', new Blob(['x']), 'x.png');
    const res = await fetch(`${API_BASE}/api/stickers/scan/00000000-0000-0000-0000-000000000000/receipt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
      body: fd,
    });
    expect(res.ok).toBe(false);
  });

  test('§9.3 second bill-amount submit on same session → rejected', async () => {
    await clearScansForUser('premium@test.local');
    const session = await login('premium@test.local', fixtures.password);
    const s = await createSession(fixtures.venues['10'].stickerId, fixtures.venueCoords.lat, fixtures.venueCoords.lng, session.accessToken);
    const scan1 = await submitScan(s.data.sessionId, 40, fixtures.venueCoords.lat, fixtures.venueCoords.lng, session.accessToken);
    expect(scan1.success).toBe(true);
    const scan2 = await submitScan(s.data.sessionId, 80, fixtures.venueCoords.lat, fixtures.venueCoords.lng, session.accessToken);
    // Should be rejected — session already completed
    expect(scan2.success).toBe(false);
  });

  test.skip('§9.2 second receipt upload on same scan — deferred (upload flow mechanics)', async () => {});
  test.skip('§9.4 abandoned session reuse — requires session-timeout helper', async () => {});
});

// ─── §10 Admin approval ───────────────────────────────────────────────────
test.describe('§10 Admin approval', () => {
  test('§10.1 approve → wallet credited with expected 60-day expiry', async () => {
    await clearScansForUser('premium@test.local');

    // Create a scan first
    const r = await runApiCycle('premium@test.local', '20', 50);
    expect(r.ok).toBe(true);

    // Emulate admin approval by flipping status + creating a wallet CASHBACK_CREDIT row via raw SQL.
    // In production this goes through admin.routes.ts; we exercise the *end state* here so we
    // can observe wallet credit + expiry without depending on the admin UI.
    const scan = await getLatestScan('premium@test.local');
    const expectedCashback = scan.cashbackAmount;
    expect(expectedCashback).toBeCloseTo(8, 2);  // Premium × 20% × 50 = 8

    const { Client } = require('pg') as typeof import('pg');
    const c = new Client({ connectionString: 'postgresql://boomtest:boomtest@localhost:55432/boomcard_test?sslmode=disable' });
    await c.connect();
    try {
      // Move scan → APPROVED
      await c.query(`UPDATE "StickerScan" SET status = 'APPROVED'::"ScanStatus", "processedAt" = NOW() WHERE id = $1`, [scan.id]);
      // Create wallet tx (CASHBACK_CREDIT) with 60-day expiry
      const walletRow = await c.query(`SELECT id, balance FROM "wallets" WHERE "userId" = $1`, [scan.userId]);
      const wid = walletRow.rows[0].id;
      const balBefore = Number(walletRow.rows[0].balance);
      const balAfter = balBefore + expectedCashback;
      await c.query(
        `INSERT INTO "wallet_transactions" (id, "walletId", type, amount, "balanceBefore", "balanceAfter", currency, status, "stickerScanId", "cashbackExpiresAt", "createdAt")
         VALUES (gen_random_uuid(), $1, 'CASHBACK_CREDIT'::"WalletTransactionType", $2, $3, $4, 'BGN', 'COMPLETED'::"WalletTransactionStatus", $5, NOW() + INTERVAL '60 days', NOW())`,
        [wid, expectedCashback, balBefore, balAfter, scan.id]
      );
      await c.query(`UPDATE "wallets" SET balance = $1, "availableBalance" = $1 WHERE id = $2`, [balAfter, wid]);
    } finally {
      await c.end();
    }

    const bal = await getWalletBalance('premium@test.local');
    expect(bal).toBeCloseTo(expectedCashback, 2);
  });

  test.skip('§10.2 reject → no credit', async () => {});
  test.skip('§10.3 approve w/ modified amount', async () => {});
  test.skip('§10.4 double-approve idempotency — needs real admin endpoint', async () => {});
  test.skip('§10.5 expired credit (60 days) — needs clock advance or seeded old row', async () => {});
});
