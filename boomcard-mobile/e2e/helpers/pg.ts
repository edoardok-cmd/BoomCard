/**
 * Direct Postgres helpers — used by tests that need to mutate DB state outside
 * the normal API flow (deactivate stickers, flip venue configs, clear scans, etc.)
 */
import { Client } from 'pg';

const PG_URL = process.env.E2E_DATABASE_URL
  || 'postgresql://boomtest:boomtest@localhost:55432/boomcard_test?sslmode=disable';

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: PG_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export async function setStickerStatus(stickerId: string, status: 'ACTIVE' | 'INACTIVE' | 'RETIRED' | 'DAMAGED' | 'PENDING') {
  return withPg(async (c) => {
    await c.query(`UPDATE "Sticker" SET status = $1::"StickerStatus" WHERE "stickerId" = $2`, [status, stickerId]);
  });
}

export async function setVenueConfig(venueId: string, patch: Partial<{
  gpsRadiusMeters: number;
  gpsVerificationEnabled: boolean;
  minBillAmount: number;
  maxCashbackPerScan: number | null;
  isActive: boolean;
  cashbackPercent: number;
}>) {
  return withPg(async (c) => {
    const entries = Object.entries(patch);
    const sets = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(', ');
    const values: any[] = entries.map(([, v]) => v);
    values.push(venueId);
    await c.query(`UPDATE "VenueStickerConfig" SET ${sets}, "updatedAt" = NOW() WHERE "venueId" = $${values.length}`, values);
  });
}

/**
 * Cashback-cap + rate-limit logic lives in VenueFraudConfig, NOT VenueStickerConfig.
 * Sets the fraud-config row (creates if missing). Use this for §7 cap tests.
 */
export async function setVenueFraudConfig(venueId: string, patch: Partial<{
  maxCashbackPerScan: number | null;
  maxScansPerDay: number;
  maxScansPerMonth: number;
  minBillAmount: number;
  gpsVerificationEnabled: boolean;
  gpsRadiusMeters: number;
}>) {
  return withPg(async (c) => {
    const existing = await c.query(`SELECT id FROM "VenueFraudConfig" WHERE "venueId" = $1`, [venueId]);
    if (existing.rows.length === 0) {
      await c.query(`INSERT INTO "VenueFraudConfig" (id, "venueId", "updatedAt", "createdAt") VALUES (gen_random_uuid(), $1, NOW(), NOW())`, [venueId]);
    }
    const entries = Object.entries(patch);
    if (entries.length === 0) return;
    const sets = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(', ');
    const values: any[] = entries.map(([, v]) => v);
    values.push(venueId);
    await c.query(`UPDATE "VenueFraudConfig" SET ${sets}, "updatedAt" = NOW() WHERE "venueId" = $${values.length}`, values);
  });
}

export async function clearScansForUser(userEmail: string) {
  return withPg(async (c) => {
    await c.query(`DELETE FROM "StickerScan" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [userEmail]);
    await c.query(`DELETE FROM "wallet_transactions" WHERE "walletId" IN (SELECT id FROM "wallets" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1))`, [userEmail]);
    await c.query(`UPDATE "wallets" SET balance = 0, "availableBalance" = 0, "pendingBalance" = 0 WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [userEmail]);
  });
}

export async function getLatestScan(userEmail: string) {
  return withPg(async (c) => {
    const r = await c.query(`SELECT * FROM "StickerScan" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1) ORDER BY "createdAt" DESC LIMIT 1`, [userEmail]);
    return r.rows[0];
  });
}

export async function setScanStatus(scanId: string, status: string) {
  return withPg(async (c) => {
    await c.query(`UPDATE "StickerScan" SET status = $1::"ScanStatus", "processedAt" = NOW() WHERE id = $2`, [status, scanId]);
  });
}

/**
 * Backdate a session's sessionStartedAt so the server's "submission must be before 6 AM
 * the morning after scan" deadline kicks in without having to wait a day.
 */
export async function backdateSession(scanId: string, hoursAgo: number) {
  return withPg(async (c) => {
    await c.query(
      `UPDATE "StickerScan" SET "sessionStartedAt" = NOW() - ($1 || ' hours')::interval, "createdAt" = NOW() - ($1 || ' hours')::interval WHERE id = $2`,
      [hoursAgo, scanId]
    );
  });
}

/**
 * Fetch a scan by id. Used when a test needs to assert on server-side mutation (e.g.
 * fraudReasons / fraudScore) that isn't returned in the upload response.
 */
export async function getScanById(scanId: string) {
  return withPg(async (c) => {
    const r = await c.query(`SELECT * FROM "StickerScan" WHERE id = $1`, [scanId]);
    return r.rows[0];
  });
}

export async function getWalletBalance(userEmail: string): Promise<number> {
  return withPg(async (c) => {
    const r = await c.query(`SELECT balance FROM "wallets" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [userEmail]);
    return Number(r.rows[0]?.balance ?? 0);
  });
}
