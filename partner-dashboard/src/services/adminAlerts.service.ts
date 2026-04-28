import { apiService } from './api.service';

export type AlertSeverity = 'danger' | 'warning' | 'info';
export type AlertType =
  | 'PARTNER_REQUESTS'
  | 'RECEIPT_REVIEW'
  | 'CASHBACK_OVERDUE'
  | 'MENU_APPROVALS';

export interface AdminAlert {
  type: AlertType;
  severity: AlertSeverity;
  count: number;
  link: string;
}

export interface AdminAlertsResult {
  alerts: AdminAlert[];
  total: number;
  generatedAt: string;
}

export const adminAlertsService = {
  getAlerts(): Promise<AdminAlertsResult> {
    return apiService.get<AdminAlertsResult>('/admin/alerts');
  },
};
