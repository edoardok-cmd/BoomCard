import { apiService } from './api.service';

export interface AdminProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  avatar: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  twoFactorEnabled: boolean;
  adminRoles: Array<{
    role: { key: string; label: string };
    grantedAt: string;
  }>;
}

export interface AdminSession {
  id: string;
  clientType: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface AdminLoginEvent {
  id: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  failReason: string | null;
  createdAt: string;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export const adminProfileService = {
  getMe(): Promise<AdminProfile> {
    return apiService.get<AdminProfile>('/admin/me');
  },

  updateMe(data: { firstName?: string; lastName?: string; phone?: string }) {
    return apiService.patch<{ id: string; firstName: string; lastName: string; phone: string | null; email: string }>(
      '/admin/me',
      data
    );
  },

  changePassword(currentPassword: string, newPassword: string) {
    return apiService.post<{ ok: true }>('/admin/me/password', { currentPassword, newPassword });
  },

  setupTwoFactor(): Promise<TwoFactorSetup> {
    return apiService.get<TwoFactorSetup>('/admin/me/2fa/setup');
  },

  enableTwoFactor(token: string) {
    return apiService.post<{ ok: true }>('/admin/me/2fa/enable', { token });
  },

  disableTwoFactor(currentPassword: string) {
    return apiService.delete<{ ok: true }>('/admin/me/2fa', { data: { currentPassword } });
  },

  listSessions(): Promise<{ sessions: AdminSession[] }> {
    return apiService.get<{ sessions: AdminSession[] }>('/admin/me/sessions');
  },

  revokeSession(tokenId: string) {
    return apiService.delete<{ ok: true }>(`/admin/me/sessions/${tokenId}`);
  },

  revokeAllSessions() {
    return apiService.delete<{ ok: true; revokedCount: number }>('/admin/me/sessions');
  },

  loginHistory(): Promise<{ history: AdminLoginEvent[] }> {
    return apiService.get<{ history: AdminLoginEvent[] }>('/admin/me/login-history');
  },
};
