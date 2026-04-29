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
}

export interface AdminAlertsResult {
  critical: AdminAlert[];
  operational: AdminAlert[];
  informational: AdminAlert[];
  totalCount: number;
  generatedAt: string;
}

export const adminAlertsService = {
  getAlerts(): Promise<AdminAlertsResult> {
    return apiService.get<AdminAlertsResult>('/admin/alerts').then(data => ({
      critical: data.critical ?? [],
      operational: data.operational ?? [],
      informational: data.informational ?? [],
      totalCount: data.totalCount ?? 0,
      generatedAt: data.generatedAt ?? '',
    }));
  },
};
