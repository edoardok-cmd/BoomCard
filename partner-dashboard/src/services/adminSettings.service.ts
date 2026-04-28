import { apiService } from './api.service';

export interface CashbackRate {
  id: string;
  discountStep: number;
  basic: number;
  premium: number;
  effectiveFrom: string;
  createdBy: string | null;
  notes: string | null;
  createdAt: string;
}

export type SystemSettings = Record<string, string>;

export const adminSettingsService = {
  getCashbackRates(): Promise<{ data: (CashbackRate | null)[] }> {
    return apiService.get('/admin/settings/cashback-rates');
  },

  getCashbackRateHistory(): Promise<{ data: CashbackRate[] }> {
    return apiService.get('/admin/settings/cashback-rates/history');
  },

  saveCashbackRates(
    rates: Array<{ discountStep: number; basic: number; premium: number }>,
    notes?: string
  ): Promise<void> {
    return apiService.post('/admin/settings/cashback-rates', { rates, notes });
  },

  getSystemSettings(): Promise<{ data: SystemSettings }> {
    return apiService.get('/admin/settings/system');
  },

  saveSystemSettings(settings: SystemSettings): Promise<void> {
    return apiService.put('/admin/settings/system', { settings });
  },
};
