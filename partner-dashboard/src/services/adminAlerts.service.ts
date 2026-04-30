import { apiService } from './api.service';

export type AlertSeverity = 'danger' | 'warning' | 'info';
export type AlertTier = 'critical' | 'operational' | 'informational';

export interface AdminAlert {
  id: string;
  type: string;
  tier: AlertTier;
  title: string;
  count: number;
  link: string;
  // Server-computed drill-down values (e.g. { threshold: 50 } or
  // { dateFrom: '2026-04-29T...' }). The page renders these into titles and
  // forwards them to focus-banner deep links so badge ↔ landing-page counts agree.
  meta?: Record<string, string | number>;
}

export interface AdminAlertsResult {
  critical: AdminAlert[];
  operational: AdminAlert[];
  informational: AdminAlert[];
  totalCount: number;
  generatedAt: string;
}

function normalizeTier(raw: unknown): AlertTier {
  const lower = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (lower === 'critical' || lower === 'operational' || lower === 'informational') {
    return lower;
  }
  return 'informational';
}

function normalizeAlert(a: AdminAlert): AdminAlert {
  return { ...a, tier: normalizeTier(a.tier) };
}

export const adminAlertsService = {
  getAlerts(): Promise<AdminAlertsResult> {
    return apiService.get<AdminAlertsResult>('/admin/alerts').then(data => ({
      critical: (data.critical ?? []).map(normalizeAlert),
      operational: (data.operational ?? []).map(normalizeAlert),
      informational: (data.informational ?? []).map(normalizeAlert),
      totalCount: data.totalCount ?? 0,
      generatedAt: data.generatedAt ?? '',
    }));
  },
};
