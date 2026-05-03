import { describe, it, expect } from 'vitest';
import type { SystemSettingMeta } from '../services/adminSettings.service';
import { describeApiError, latestMeta, formatAuditStamp } from './systemSettingsAudit';

const meta = (updatedAt: string, updatedByName: string | null = null): SystemSettingMeta => ({
  updatedAt,
  updatedByName,
});

describe('describeApiError', () => {
  it('treats missing response as a network error', () => {
    expect(describeApiError({ message: 'Network Error', code: 'ERR_NETWORK' })).toEqual({
      status: undefined,
      message: 'Няма връзка със сървъра. Проверете интернет връзката си.',
    });
  });

  it('treats status === 0 as a network error', () => {
    expect(describeApiError({ response: { status: 0 } })).toEqual({
      status: 0,
      message: 'Няма връзка със сървъра. Проверете интернет връзката си.',
    });
  });

  it('maps 401 to session-expired (status-based, before backend message)', () => {
    expect(
      describeApiError({ response: { status: 401, data: { error: 'unauthorized' } } }),
    ).toEqual({
      status: 401,
      message: 'Сесията е изтекла. Моля, влезте отново.',
    });
  });

  it('maps 403 to forbidden', () => {
    expect(describeApiError({ response: { status: 403 } })).toEqual({
      status: 403,
      message: 'Нямате право на достъп до този ресурс.',
    });
  });

  it('maps 404 to not-found', () => {
    expect(describeApiError({ response: { status: 404 } })).toEqual({
      status: 404,
      message: 'Ресурсът не е намерен.',
    });
  });

  it('maps 429 to rate-limited (overrides any backend `error` token)', () => {
    expect(
      describeApiError({ response: { status: 429, data: { error: 'rate_limited' } } }),
    ).toEqual({
      status: 429,
      message: 'Сървърът временно ограничава заявките. Опитайте отново след малко.',
    });
  });

  it('maps any 5xx to generic server error', () => {
    expect(describeApiError({ response: { status: 500 } }).message)
      .toBe('Сървърна грешка. Моля, опитайте отново.');
    expect(describeApiError({ response: { status: 503 } }).message)
      .toBe('Сървърна грешка. Моля, опитайте отново.');
  });

  it('passes through backend `error` for un-mapped status (e.g. 400)', () => {
    expect(
      describeApiError({ response: { status: 400, data: { error: 'invalid_payload' } } }),
    ).toEqual({ status: 400, message: 'invalid_payload' });
  });

  it('prefers backend `error` over backend `message`', () => {
    expect(
      describeApiError({
        response: { status: 422, data: { error: 'first', message: 'second' } },
      }).message,
    ).toBe('first');
  });

  it('falls back to backend `message` when `error` is missing', () => {
    expect(
      describeApiError({ response: { status: 422, data: { message: 'fallback' } } }).message,
    ).toBe('fallback');
  });

  it('falls back to e.message when no backend payload', () => {
    expect(describeApiError({ response: { status: 418 }, message: 'I am a teapot' }).message)
      .toBe('I am a teapot');
  });

  it('falls back to a generic string when nothing else is available', () => {
    expect(describeApiError({ response: { status: 418 } }).message).toBe('Неуспешно зареждане.');
  });

  it('does not throw on null/undefined input', () => {
    expect(describeApiError(null).message).toBe('Няма връзка със сървъра. Проверете интернет връзката си.');
    expect(describeApiError(undefined).message).toBe('Няма връзка със сървъра. Проверете интернет връзката си.');
  });
});

describe('latestMeta', () => {
  it('returns null when no keys are present in meta', () => {
    expect(latestMeta(['a', 'b'], {})).toBeNull();
  });

  it('returns null when keys array is empty', () => {
    expect(latestMeta([], { a: meta('2024-01-01T00:00:00Z') })).toBeNull();
  });

  it('returns the only matching meta when one key is present', () => {
    const m = meta('2024-01-01T00:00:00Z');
    expect(latestMeta(['a'], { a: m })).toBe(m);
  });

  it('picks the most recent across multiple keys regardless of input order', () => {
    const older = meta('2024-01-01T00:00:00Z');
    const newer = meta('2024-06-01T00:00:00Z');
    expect(latestMeta(['a', 'b'], { a: older, b: newer })).toBe(newer);
    expect(latestMeta(['b', 'a'], { a: older, b: newer })).toBe(newer);
  });

  it('skips keys missing from meta and returns latest of those present', () => {
    const m = meta('2024-03-01T00:00:00Z');
    expect(latestMeta(['missing', 'a'], { a: m })).toBe(m);
  });

  it('ignores meta entries for keys not in the keys list', () => {
    const inGroup    = meta('2024-01-01T00:00:00Z');
    const outOfGroup = meta('2099-01-01T00:00:00Z');
    expect(latestMeta(['a'], { a: inGroup, b: outOfGroup })).toBe(inGroup);
  });
});

describe('formatAuditStamp', () => {
  it('returns empty string for null', () => {
    expect(formatAuditStamp(null)).toBe('');
  });

  it('formats date and time and omits author when updatedByName is null', () => {
    const result = formatAuditStamp(meta('2024-06-15T14:30:00Z'));
    // Locale output: "Последно обновено: 15.06.2024 г. 17:30" — assert structure
    // (prefix + dd.mm.yyyy + hh:mm) without pinning the optional " г." suffix
    // that Node ICU emits in bg-BG; allow author suffix to be absent.
    expect(result.startsWith('Последно обновено: ')).toBe(true);
    expect(result).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(result).toMatch(/\d{2}:\d{2}/);
    expect(result).not.toContain(' от ');
  });

  it('appends " от {name}" when updatedByName is present', () => {
    const result = formatAuditStamp(meta('2024-06-15T14:30:00Z', 'Иван Петров'));
    expect(result).toMatch(/ от Иван Петров$/);
  });

  it('treats empty-string updatedByName as missing (no " от " segment)', () => {
    // Backend can in theory return ''; the formatter's truthy check should
    // suppress the author suffix to avoid a dangling " от ".
    const result = formatAuditStamp(meta('2024-06-15T14:30:00Z', ''));
    expect(result).not.toContain(' от ');
  });
});
