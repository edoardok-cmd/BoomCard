import { apiService } from './api.service';

export type MarketingChannel = 'EMAIL' | 'PUSH' | 'SMS';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENT' | 'PAUSED';
export type AutomationStatus = 'ACTIVE' | 'PAUSED' | 'DRAFT';
export type MarketingListType = 'STATIC' | 'DYNAMIC' | 'SEGMENT';

export interface MarketingTemplate {
  id: string;
  name: string;
  type: MarketingChannel;
  subject: string | null;
  usageCount: number;
  lastUsed: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingTemplateDetail extends MarketingTemplate {
  body: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  type: MarketingChannel;
  status: CampaignStatus;
  audience: number;
  sentAt: string | null;
  openRate: number | null;
  clickRate: number | null;
  templateId: string | null;
  listId: string | null;
  list: { id: string; name: string } | null;
  createdAt: string;
}

export interface MarketingList {
  id: string;
  name: string;
  type: MarketingListType;
  description: string;
  size: number;
  updatedAt: string;
  createdAt: string;
}

export interface MarketingAutomation {
  id: string;
  name: string;
  trigger: string;
  status: AutomationStatus;
  totalRuns: number;
  lastRunAt: string | null;
  templateId: string | null;
  createdAt: string;
  template: { id: string; name: string } | null;
}

interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export const adminMarketingService = {
  // ─── Templates ──────────────────────────────────────────────────────────────

  listTemplates(params: {
    page?: number; limit?: number; search?: string; type?: MarketingChannel | '';
  }): Promise<PagedResult<MarketingTemplate>> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.type) clean.type = params.type;
    return apiService.get('/admin/marketing/templates', clean);
  },

  getTemplate(id: string): Promise<MarketingTemplateDetail> {
    return apiService.get(`/admin/marketing/templates/${id}`);
  },

  createTemplate(data: {
    name: string; type: MarketingChannel; subject?: string; body?: string;
  }): Promise<MarketingTemplateDetail> {
    return apiService.post('/admin/marketing/templates', data);
  },

  updateTemplate(id: string, data: {
    name: string; type: MarketingChannel; subject?: string; body?: string;
  }): Promise<MarketingTemplateDetail> {
    return apiService.put(`/admin/marketing/templates/${id}`, data);
  },

  deleteTemplate(id: string): Promise<void> {
    return apiService.delete(`/admin/marketing/templates/${id}`);
  },

  // ─── Campaigns ──────────────────────────────────────────────────────────────

  listCampaigns(params: {
    page?: number; limit?: number; search?: string; status?: CampaignStatus | '';
  }): Promise<PagedResult<MarketingCampaign>> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.status) clean.status = params.status;
    return apiService.get('/admin/marketing/campaigns', clean);
  },

  createCampaign(data: {
    name: string; type: MarketingChannel; status?: CampaignStatus;
    audience?: number; templateId?: string; listId?: string;
  }): Promise<MarketingCampaign> {
    return apiService.post('/admin/marketing/campaigns', data);
  },

  updateCampaign(id: string, data: {
    name: string; type: MarketingChannel; status: CampaignStatus;
    audience?: number; templateId?: string; listId?: string;
  }): Promise<MarketingCampaign> {
    return apiService.put(`/admin/marketing/campaigns/${id}`, data);
  },

  patchCampaignStatus(id: string, status: CampaignStatus): Promise<MarketingCampaign> {
    return apiService.patch(`/admin/marketing/campaigns/${id}/status`, { status });
  },

  deleteCampaign(id: string): Promise<void> {
    return apiService.delete(`/admin/marketing/campaigns/${id}`);
  },

  // ─── Lists ──────────────────────────────────────────────────────────────────

  listLists(params: {
    page?: number; limit?: number; search?: string; type?: MarketingListType | '';
  }): Promise<PagedResult<MarketingList>> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.type) clean.type = params.type;
    return apiService.get('/admin/marketing/lists', clean);
  },

  createList(data: {
    name: string; type: MarketingListType; description?: string; size?: number;
  }): Promise<MarketingList> {
    return apiService.post('/admin/marketing/lists', data);
  },

  updateList(id: string, data: {
    name: string; type: MarketingListType; description?: string; size?: number;
  }): Promise<MarketingList> {
    return apiService.put(`/admin/marketing/lists/${id}`, data);
  },

  deleteList(id: string): Promise<void> {
    return apiService.delete(`/admin/marketing/lists/${id}`);
  },

  // ─── Automations ────────────────────────────────────────────────────────────

  listAutomations(params: {
    page?: number; limit?: number; status?: AutomationStatus | '';
  }): Promise<PagedResult<MarketingAutomation>> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.status) clean.status = params.status;
    return apiService.get('/admin/marketing/automations', clean);
  },

  createAutomation(data: {
    name: string; trigger: string; status?: AutomationStatus; templateId?: string;
  }): Promise<MarketingAutomation> {
    return apiService.post('/admin/marketing/automations', data);
  },

  updateAutomation(id: string, data: {
    name: string; trigger: string; status: AutomationStatus; templateId?: string;
  }): Promise<MarketingAutomation> {
    return apiService.put(`/admin/marketing/automations/${id}`, data);
  },

  deleteAutomation(id: string): Promise<void> {
    return apiService.delete(`/admin/marketing/automations/${id}`);
  },
};
