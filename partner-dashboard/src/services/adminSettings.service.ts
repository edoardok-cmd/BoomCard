import { apiService } from './api.service';

// ── Fraud Rules (spec §7.4 Лимити и правила) ──────────────────────────────────

export type FraudRuleTier = 'SYSTEM' | 'PARTNER_TYPE' | 'PARTNER' | 'USER';

export interface FraudRule {
  id: string;
  tier: FraudRuleTier;
  targetId: string | null;
  dailyScanLimit: number | null;
  minTransactionValue: number | null;
  maxTransactionValue: number | null;
  autoApproveThreshold: number | null;
  isActive: boolean;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  _count: { overrides: number };
}

export interface FraudRuleOverride {
  id: string;
  ruleId: string;
  targetType: 'user' | 'partner';
  targetId: string;
  override: Record<string, unknown>;
  reason: string | null;
  createdBy: string;
  expiresAt: string | null;
  createdAt: string;
}

export type SubscriptionPlan = 'BASIC' | 'LIGHT' | 'PREMIUM';

export interface PayoutThresholdEntry {
  minAmount: number;
  notes: string | null;
  updatedAt: string | null;
}

export interface PayoutThresholdHistoryRow {
  id: string;
  plan: SubscriptionPlan;
  minAmount: number;
  notes: string | null;
  createdBy: string | null;
  createdByEmail: string | null;
  createdByName: string | null;
  createdAt: string;
}

export type SystemSettings = Record<string, string>;

export interface SystemSettingMeta {
  updatedAt: string;
  updatedByName: string | null;
}

export interface SystemSettingHistoryRow {
  id: string;
  key: string;
  oldValue: string | null;
  newValue: string;
  changedBy: string | null;
  changedByName: string | null;
  notes: string | null;
  createdAt: string;
}

export interface MobileAppSettings {
  'mobile_app.min_ios_version': string | null;
  'mobile_app.min_android_version': string | null;
  'mobile_app.ios_status': string | null;
  'mobile_app.android_status': string | null;
  'mobile_app.feature_receipt_scan': string | null;
  'mobile_app.feature_sticker_scan': string | null;
  'mobile_app.feature_partner_map': string | null;
  'mobile_app.push_notifications_enabled': string | null;
  'mobile_app.push_vapid_topic': string | null;
  'mobile_app.error_log_url': string | null;
}

export interface MobileErrorLogEntry {
  id: string;
  platform: string;
  appVersion: string | null;
  errorType: string;
  message: string;
  stack: string | null;
  createdAt: string;
}

export const adminSettingsService = {
  getSystemSettings(): Promise<{ success: boolean; data: SystemSettings; meta: Record<string, SystemSettingMeta> }> {
    return apiService.get('/admin/settings/system');
  },

  saveSystemSettings(settings: SystemSettings, notes?: string): Promise<void> {
    return apiService.put('/admin/settings/system', { settings, notes: notes?.trim() || undefined });
  },

  getSystemSettingsHistory(keys?: string[]): Promise<{ success: boolean; data: SystemSettingHistoryRow[] }> {
    return apiService.get('/admin/settings/system/history', keys?.length ? { keys: keys.join(',') } : undefined);
  },

  getMobileAppSettings(): Promise<{ success: boolean; data: MobileAppSettings }> {
    return apiService.get('/admin/settings/mobile-app');
  },

  saveMobileAppSettings(settings: Partial<Record<keyof MobileAppSettings, string>>, notes?: string): Promise<void> {
    return apiService.put('/admin/settings/mobile-app', { settings, notes: notes?.trim() || undefined });
  },

  getMobileAppSettingsHistory(): Promise<{ success: boolean; data: SystemSettingHistoryRow[] }> {
    return apiService.get('/admin/settings/mobile-app/history');
  },

  getMobileErrorLogs(): Promise<{ success: boolean; data: MobileErrorLogEntry[] }> {
    return apiService.get('/admin/settings/mobile-errors');
  },

  clearMobileErrorLogs(): Promise<{ success: boolean; message: string }> {
    return apiService.delete('/admin/settings/mobile-errors');
  },

  // ── Payout Thresholds ────────────────────────────────────────────────────────

  getPayoutThresholds(): Promise<{ success: boolean; data: Record<SubscriptionPlan, PayoutThresholdEntry> }> {
    return apiService.get('/admin/settings/payout-thresholds');
  },

  savePayoutThresholds(
    thresholds: Partial<Record<SubscriptionPlan, number>>,
    notes?: string,
  ): Promise<void> {
    return apiService.put('/admin/settings/payout-thresholds', { thresholds, notes });
  },

  getPayoutThresholdsHistory(): Promise<{ success: boolean; data: PayoutThresholdHistoryRow[] }> {
    return apiService.get('/admin/settings/payout-thresholds/history');
  },

  // ── Fraud Rules ──────────────────────────────────────────────────────────────

  getFraudRules(params?: { tier?: FraudRuleTier; active?: boolean }): Promise<{ success: boolean; data: FraudRule[] }> {
    const q: Record<string, unknown> = {};
    if (params?.tier)     q.tier   = params.tier;
    if (params?.active !== undefined) q.active = params.active;
    return apiService.get('/admin/settings/fraud-rules', q);
  },

  createFraudRule(body: {
    tier: FraudRuleTier;
    targetId?: string;
    dailyScanLimit?: number | null;
    minTransactionValue?: number | null;
    maxTransactionValue?: number | null;
    autoApproveThreshold?: number | null;
    notes?: string | null;
  }): Promise<{ success: boolean; data: FraudRule }> {
    return apiService.post('/admin/settings/fraud-rules', body);
  },

  patchFraudRule(
    id: string,
    patch: {
      dailyScanLimit?: number | null;
      minTransactionValue?: number | null;
      maxTransactionValue?: number | null;
      autoApproveThreshold?: number | null;
      notes?: string | null;
      isActive?: boolean;
    },
  ): Promise<{ success: boolean; data: FraudRule }> {
    return apiService.patch(`/admin/settings/fraud-rules/${id}`, patch);
  },

  deleteFraudRule(id: string): Promise<{ success: boolean }> {
    return apiService.delete(`/admin/settings/fraud-rules/${id}`);
  },

  getFraudRuleOverrides(ruleId: string): Promise<{ success: boolean; data: FraudRuleOverride[] }> {
    return apiService.get(`/admin/settings/fraud-rules/${ruleId}/overrides`);
  },

  createFraudRuleOverride(
    ruleId: string,
    body: { targetType: 'user' | 'partner'; targetId: string; override: Record<string, unknown>; reason?: string; expiresAt?: string },
  ): Promise<{ success: boolean; data: FraudRuleOverride }> {
    return apiService.post(`/admin/settings/fraud-rules/${ruleId}/overrides`, body);
  },

  deleteFraudRuleOverride(ruleId: string, overId: string): Promise<{ success: boolean }> {
    return apiService.delete(`/admin/settings/fraud-rules/${ruleId}/overrides/${overId}`);
  },
};
