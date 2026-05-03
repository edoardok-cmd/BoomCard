import type { SystemSettingMeta } from '../services/adminSettings.service';

// Pick the most-recently-updated meta entry for the given keys. Used by
// settings cards that group several keys under one save button so the audit
// stamp reflects the freshest write across the group.
export function latestMeta(
  keys: string[],
  meta: Record<string, SystemSettingMeta>,
): SystemSettingMeta | null {
  let latest: SystemSettingMeta | null = null;
  for (const k of keys) {
    const m = meta[k];
    if (!m) continue;
    if (!latest || m.updatedAt > latest.updatedAt) latest = m;
  }
  return latest;
}

export function formatAuditStamp(m: SystemSettingMeta | null): string {
  if (!m) return '';
  const d = new Date(m.updatedAt);
  const date = d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
  const by = m.updatedByName ? ` от ${m.updatedByName}` : '';
  return `Последно обновено: ${date} ${time}${by}`;
}

// Localized, user-friendly description of an Axios/apiService error. Prefers
// status-based messages (429, 403, 5xx, 401, network) over backend `error`
// tokens so machine strings like "rate_limited" never reach the UI; falls back
// to backend text for status codes we don't have a tailored message for.
//
// Heuristics:
//  - status undefined OR 0  → treat as network/offline error (axios sets
//    status undefined when there is no response).
//  - 401 → session expired (separate from 403 to encourage re-auth UI).
//  - 403 → forbidden.
//  - 404 → not found (backend tokens for this are usually safe but we
//    localize for consistency).
//  - 429 → rate-limited.
//  - >= 500 → generic server error.
//  - Any other status WITH a backend `error`/`message` field → pass it through.
//  - Last-resort fallback: `e.message` (avoids the empty-toast case but may
//    leak raw error text — acceptable since this only fires on truly
//    unexpected non-Axios errors).
export function describeApiError(err: unknown): { status?: number; message: string } {
  const e = err as {
    response?: { status?: number; data?: { error?: string; message?: string } };
    message?: string;
    code?: string;
  };
  const status = e?.response?.status;
  // No HTTP response at all → network/offline. Axios uses code='ERR_NETWORK'
  // and leaves response undefined; status===0 also lands here on some clients.
  if (!status) {
    return { status, message: 'Няма връзка със сървъра. Проверете интернет връзката си.' };
  }
  if (status === 401) return { status, message: 'Сесията е изтекла. Моля, влезте отново.' };
  if (status === 403) return { status, message: 'Нямате право на достъп до този ресурс.' };
  if (status === 404) return { status, message: 'Ресурсът не е намерен.' };
  if (status === 429) return { status, message: 'Сървърът временно ограничава заявките. Опитайте отново след малко.' };
  if (status >= 500) return { status, message: 'Сървърна грешка. Моля, опитайте отново.' };
  const backend = e?.response?.data?.error || e?.response?.data?.message;
  if (backend) return { status, message: backend };
  if (e?.message) return { status, message: e.message };
  return { status, message: 'Неуспешно зареждане.' };
}
