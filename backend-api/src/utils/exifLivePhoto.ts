import exifr from 'exifr';

/**
 * Shared live-photo EXIF gate used by any route that accepts receipt images.
 *
 * EXIF DateTimeOriginal is a naïve local-time string with no timezone. Production
 * servers run UTC, so letting exifr revive it as a Date silently treats the string
 * as UTC — for Bulgaria phones that shifts the timestamp 2–3 h into the future and
 * disables the age gate entirely. We pull raw strings (and OffsetTimeOriginal when
 * the phone provides it) and resolve against VENUE_TIMEZONE.
 *
 * Cancel guarantee: exifr.parse itself cannot be aborted, but we race it against a
 * 5 s timer so the caller is unblocked even when a malformed JPEG hangs the parser.
 */

export const LIVE_PHOTO_MAX_AGE_MIN = 30;
const EXIF_PARSE_TIMEOUT_MS = 5000;
// All BoomCard venues currently operate in Bulgaria. If multi-timezone support is
// needed, accept timezone as a parameter instead of using this constant.
const VENUE_TIMEZONE = 'Europe/Sofia';

function resolveExifLocalToUtc(rawDateTime: string, rawOffset?: string): Date | null {
  const m = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(rawDateTime);
  if (!m) return null;
  const [, ys, mos, ds, hs, mis, ss] = m;
  const y = +ys, mo = +mos, d = +ds, h = +hs, mi = +mis, s = +ss;
  const asUtcMs = Date.UTC(y, mo - 1, d, h, mi, s);

  let offsetMin: number;
  const off = rawOffset && /^[+-]\d{2}:\d{2}$/.test(rawOffset) ? rawOffset : null;
  if (off) {
    const sign = off[0] === '+' ? 1 : -1;
    offsetMin = sign * (parseInt(off.slice(1, 3), 10) * 60 + parseInt(off.slice(4, 6), 10));
  } else {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: VENUE_TIMEZONE, timeZoneName: 'longOffset',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const tzPart = fmt.formatToParts(new Date(asUtcMs)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+02:00';
    const om = /GMT([+-])(\d{2}):?(\d{2})?/.exec(tzPart);
    offsetMin = om ? (om[1] === '+' ? 1 : -1) * (parseInt(om[2], 10) * 60 + parseInt(om[3] ?? '0', 10)) : 120;
  }

  const utcMs = asUtcMs - offsetMin * 60_000;
  return Number.isFinite(utcMs) ? new Date(utcMs) : null;
}

/**
 * Extract a normalized UTC Date from the image's EXIF DateTimeOriginal (or CreateDate),
 * or null when EXIF is absent / unparsable / the parse times out.
 */
export async function readExifOriginalDate(buf: Buffer): Promise<Date | null> {
  try {
    const parsePromise = exifr.parse(buf, {
      pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'OffsetTimeDigitized'] as any,
      reviveValues: false,
    });
    const data: any = await Promise.race([
      parsePromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), EXIF_PARSE_TIMEOUT_MS)),
    ]);
    if (!data) return null;
    const raw = data.DateTimeOriginal ?? data.CreateDate;
    if (!raw || typeof raw !== 'string') return null;
    const offset = data.OffsetTimeOriginal ?? data.OffsetTimeDigitized;
    return resolveExifLocalToUtc(raw, typeof offset === 'string' ? offset : undefined);
  } catch {
    return null;
  }
}

export type LivePhotoCheckResult =
  | { ok: true }
  | { ok: false; reason: 'STALE'; ageMin: number; message: string }
  | { ok: false; reason: 'PRE_SESSION'; message: string };

/**
 * Run the standard live-photo gate on a buffer:
 *   - If EXIF is absent → accept (many cameras strip EXIF on compression).
 *   - If EXIF age > LIVE_PHOTO_MAX_AGE_MIN → STALE.
 *   - If sessionStartedAt is given AND EXIF predates it (>60s slack) → PRE_SESSION.
 * Returns { ok: true } otherwise.
 *
 * Callers can bypass the whole thing via RECEIPT_LIVE_PHOTO_ENFORCEMENT=off; this
 * helper checks the flag itself so every caller behaves consistently.
 */
export async function checkLivePhoto(
  buf: Buffer,
  sessionStartedAt?: Date | null,
): Promise<LivePhotoCheckResult> {
  if (process.env.RECEIPT_LIVE_PHOTO_ENFORCEMENT === 'off') return { ok: true };
  const exifDate = await readExifOriginalDate(buf);
  if (!exifDate) return { ok: true };
  const ageMin = (Date.now() - exifDate.getTime()) / 60_000;
  if (ageMin > LIVE_PHOTO_MAX_AGE_MIN) {
    return {
      ok: false,
      reason: 'STALE',
      ageMin,
      message:
        `Receipt photo is ${Math.round(ageMin)} minutes old. Receipts must be captured ` +
        `live with your camera at the venue; gallery uploads are not accepted.`,
    };
  }
  if (sessionStartedAt && exifDate.getTime() < sessionStartedAt.getTime() - 60_000) {
    return {
      ok: false,
      reason: 'PRE_SESSION',
      message: 'Receipt photo was taken before the QR scan. Please take a new photo at the venue.',
    };
  }
  return { ok: true };
}
