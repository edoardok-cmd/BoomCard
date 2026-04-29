import { apiService } from './api.service';

export interface AdminDashboardStats {
  subscribers: { active: number; newLast30Days: number; expired: number };
  transactions: { todayCount: number; todayVolume: number; todayAvg: number };
  cashback: { totalCredited: number; pending: number; expiringSoon: number };
  partners: { active: number; requests: number; locations: number };
  finance: { payoutsDue: number; partnerReceivables: number; margin: number };
}

interface AdminDashboardResponse {
  success: boolean;
  data: AdminDashboardStats;
  generatedAt: string;
}

export const adminDashboardService = {
  getStats(): Promise<AdminDashboardStats> {
    return apiService
      .get<AdminDashboardResponse>('/admin/dashboard')
      .then(res => res.data);
  },
};
