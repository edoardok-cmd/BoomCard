import prisma from '../lib/prisma';

const TTL_MS = 60_000;
const _numCache = new Map<string, { value: number; expiresAt: number }>();
const _strCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * Read a SystemSetting as an integer with a fallback default.
 * Results are cached in-process for 60 s to avoid per-request DB hits in
 * bulk loops (e.g. bulkApprove → walletService.credit → getSystemSettingInt).
 * Call invalidateSystemSettingCache(key) immediately after any admin write.
 *
 * Multi-instance note: this cache is per-process (per Fly.io dyno). A write
 * on dyno A invalidates only that dyno's cache; other dynos serve the old
 * value until their TTL expires. Acceptable for low-frequency admin settings
 * — staleness is bounded to 60 s across the fleet.
 */
export async function getSystemSettingInt(key: string, fallback: number): Promise<number> {
  const now = Date.now();
  const hit = _numCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const row = await prisma.systemSetting.findUnique({ where: { key } });
  const parsed = row ? parseInt(row.value, 10) : NaN;
  const result = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  _numCache.set(key, { value: result, expiresAt: now + TTL_MS });
  return result;
}

/**
 * Read a SystemSetting as a float with a fallback default.
 * Suitable for monetary amounts (e.g. max_cashback_per_month) and non-integer score thresholds.
 */
export async function getSystemSettingFloat(key: string, fallback: number): Promise<number> {
  const now = Date.now();
  const hit = _numCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const row = await prisma.systemSetting.findUnique({ where: { key } });
  const parsed = row ? parseFloat(row.value) : NaN;
  const result = Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  _numCache.set(key, { value: result, expiresAt: now + TTL_MS });
  return result;
}

/**
 * Read a SystemSetting as a string with a fallback default.
 * Suitable for email addresses, names, and other text settings.
 */
export async function getSystemSettingStr(key: string, fallback: string): Promise<string> {
  const now = Date.now();
  const hit = _strCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  const row = await prisma.systemSetting.findUnique({ where: { key } });
  const result = row?.value?.trim() || fallback;
  _strCache.set(key, { value: result, expiresAt: now + TTL_MS });
  return result;
}

/** Drop the cached entry for a key so the next read fetches from DB. */
export function invalidateSystemSettingCache(key: string): void {
  _numCache.delete(key);
  _strCache.delete(key);
}
