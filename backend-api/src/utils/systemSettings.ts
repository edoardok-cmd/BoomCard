import prisma from '../lib/prisma';

/**
 * Read a SystemSetting as an integer with a fallback default.
 * Returns the fallback when the key is missing or the stored value is not a
 * valid positive integer.
 */
export async function getSystemSettingInt(key: string, fallback: number): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  const parsed = parseInt(row.value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
