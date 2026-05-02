import { Request } from 'express';

/**
 * Returns the best-available client IP from an Express request.
 *
 * Priority:
 *   1. Fly-Client-IP  — set by Fly.io edge, cannot be spoofed by the client
 *   2. X-Forwarded-For (first entry) — set by proxies; trustworthy when trust proxy = 1
 *   3. req.ip          — Express normalised value (respects trust proxy setting)
 */
export function getClientIp(req: Request): string | undefined {
  const flyIp = req.headers['fly-client-ip'] as string | undefined;
  if (flyIp?.trim()) return flyIp.trim();

  const xff = req.headers['x-forwarded-for'] as string | undefined;
  const xffFirst = xff?.split(',')[0]?.trim();
  if (xffFirst) return xffFirst;

  return req.ip || undefined;
}
