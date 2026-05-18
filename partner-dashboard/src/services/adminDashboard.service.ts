import { apiService } from './api.service';

export interface AdminDashboardStats {
  subscribers: {
    active: number;
    newLast30Days: number;
    expired: number;
    paused: number;
    failedPayment: number;
  };
  transactions: {
    todayCount: number;
    todayVolume: number;
    todayAvg: number;
    totalVolume: number;
  };
  cashback: { accrued: number; approved: number; pending: number; expiringSoon: number };
  partners: { active: number; requests: number; locations: number };
  finance: {
    payoutsDue: number;
    payoutsDueCount: number;
    partnerReceivables: number;
    margin: number;
  };
}

interface AdminDashboardResponse {
  success: boolean;
  data: AdminDashboardStats;
  generatedAt: string;
}

export interface AdminDashboardStatsEnvelope {
  data: AdminDashboardStats;
  generatedAt: string;
}

export const adminDashboardService = {
  getStats(): Promise<AdminDashboardStats> {
    return apiService
      .get<AdminDashboardResponse>('/admin/dashboard')
      .then(res => res.data);
  },
  // Returns the stats envelope including `generatedAt` so the dashboard can
  // render a "last updated" indicator and detect refresh staleness.
  getStatsWithMeta(): Promise<AdminDashboardStatsEnvelope> {
    return apiService
      .get<AdminDashboardResponse>('/admin/dashboard')
      .then(res => ({ data: res.data, generatedAt: res.generatedAt }));
  },
};
