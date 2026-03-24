import { apiService } from './api.service';

export type SubscriptionPlan = 'LIGHT' | 'BASIC' | 'PREMIUM';

export interface PartnerType {
  id: string;
  name: string;
  nameBg?: string;
  description?: string;
  descriptionBg?: string;
  maxDiscountRate: number;
  color: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: { partners: number };
  planAccess?: PlanAccessRule[];
}

export interface PlanAccessRule {
  id?: string;
  plan: SubscriptionPlan;
  partnerTypeId: string;
  canView: boolean;
  canRedeem: boolean;
}

export interface CreatePartnerTypePayload {
  name: string;
  nameBg?: string;
  description?: string;
  descriptionBg?: string;
  maxDiscountRate: number;
  color?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdatePartnerTypePayload extends Partial<CreatePartnerTypePayload> {}

class PartnerTypesService {
  private readonly baseUrl = '/admin/partner-types';

  async getPartnerTypes(): Promise<PartnerType[]> {
    const res = await apiService.get<{ success: boolean; data: PartnerType[] }>(this.baseUrl);
    return res.data;
  }

  async getPartnerTypeById(id: string): Promise<PartnerType> {
    const res = await apiService.get<{ success: boolean; data: PartnerType }>(`${this.baseUrl}/${id}`);
    return res.data;
  }

  async createPartnerType(payload: CreatePartnerTypePayload): Promise<PartnerType> {
    const res = await apiService.post<{ success: boolean; data: PartnerType }>(this.baseUrl, payload);
    return res.data;
  }

  async updatePartnerType(id: string, payload: UpdatePartnerTypePayload): Promise<PartnerType> {
    const res = await apiService.put<{ success: boolean; data: PartnerType }>(`${this.baseUrl}/${id}`, payload);
    return res.data;
  }

  async deletePartnerType(id: string): Promise<void> {
    await apiService.delete(`${this.baseUrl}/${id}`);
  }

  async getPlanAccess(partnerTypeId: string): Promise<PlanAccessRule[]> {
    const res = await apiService.get<{ success: boolean; data: PlanAccessRule[] }>(
      `${this.baseUrl}/${partnerTypeId}/plan-access`,
    );
    return res.data;
  }

  async setPlanAccess(
    partnerTypeId: string,
    rules: Omit<PlanAccessRule, 'id' | 'partnerTypeId'>[],
  ): Promise<PlanAccessRule[]> {
    const res = await apiService.put<{ success: boolean; data: PlanAccessRule[] }>(
      `${this.baseUrl}/${partnerTypeId}/plan-access`,
      { rules },
    );
    return res.data;
  }
}

export const partnerTypesService = new PartnerTypesService();
