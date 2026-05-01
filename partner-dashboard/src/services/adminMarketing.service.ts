import { apiService } from './api.service';

export type MarketingChannel = 'EMAIL' | 'PUSH' | 'SMS';
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENT' | 'PAUSED';
export type AutomationStatus = 'ACTIVE' | 'PAUSED' | 'DRAFT';
export type MarketingListType = 'STATIC' | 'DYNAMIC' | 'SEGMENT';

export interface MarketingTemplate {
  id: string;
  name: string;
  type: MarketingChannel;
  category: string | null;
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
  scheduledAt: string | null;
  sentAt: string | null;
  openRate: number | null;
  clickRate: number | null;
  templateId: string | null;
  listId: string | null;
  template: { id: string; name: string } | null;
  list: { id: string; name: string; size: number } | null;
  createdAt: string;
}

export interface MarketingList {
  id: string;
  name: string;
  type: MarketingListType;
  description: string;
  size: number;
  syncKey: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface UserSearchResult {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface PartnerSearchResult {
  id: string;
  businessName: string;
  email: string | null;
  status: string;
}

export interface MarketingListMember {
  id: string;
  listId: string;
  memberType: string;
  partnerId: string | null;
  partner: { id: string; businessName: string; email: string | null } | null;
  userId: string | null;
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  addedAt: string;
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
    page?: number; limit?: number; search?: string; type?: MarketingChannel | ''; category?: string;
  }): Promise<PagedResult<MarketingTemplate>> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search)   clean.search   = params.search;
    if (params.type)     clean.type     = params.type;
    if (params.category) clean.category = params.category;
    return apiService.get('/admin/marketing/templates', clean);
  },

  getTemplate(id: string): Promise<MarketingTemplateDetail> {
    return apiService.get(`/admin/marketing/templates/${id}`);
  },

  createTemplate(data: {
    name: string; type: MarketingChannel; category?: string; subject?: string; body?: string;
  }): Promise<MarketingTemplateDetail> {
    return apiService.post('/admin/marketing/templates', data);
  },

  updateTemplate(id: string, data: {
    name: string; type: MarketingChannel; category?: string; subject?: string; body?: string;
  }): Promise<MarketingTemplateDetail> {
    return apiService.put(`/admin/marketing/templates/${id}`, data);
  },

  deleteTemplate(id: string): Promise<void> {
    return apiService.delete(`/admin/marketing/templates/${id}`);
  },

  // ─── Campaigns ──────────────────────────────────────────────────────────────

  listCampaigns(params: {
    page?: number; limit?: number; search?: string;
    status?: CampaignStatus | ''; type?: MarketingChannel | '';
    dateFrom?: string; dateTo?: string;
    sortBy?: string; sortDir?: 'asc' | 'desc';
  }): Promise<PagedResult<MarketingCampaign>> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search)   clean.search   = params.search;
    if (params.status)   clean.status   = params.status;
    if (params.type)     clean.type     = params.type;
    if (params.dateFrom) clean.dateFrom = params.dateFrom;
    if (params.dateTo)   clean.dateTo   = params.dateTo;
    if (params.sortBy)   clean.sortBy   = params.sortBy;
    if (params.sortDir)  clean.sortDir  = params.sortDir;
    return apiService.get('/admin/marketing/campaigns', clean);
  },

  getCampaign(id: string): Promise<MarketingCampaign> {
    return apiService.get(`/admin/marketing/campaigns/${id}`);
  },

  createCampaign(data: {
    name: string; type: MarketingChannel; status?: CampaignStatus;
    scheduledAt?: string; templateId?: string; listId?: string;
  }): Promise<MarketingCampaign> {
    return apiService.post('/admin/marketing/campaigns', data);
  },

  updateCampaign(id: string, data: {
    name: string; type: MarketingChannel; status: CampaignStatus;
    scheduledAt?: string; templateId?: string; listId?: string;
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
    if (params.type)   clean.type   = params.type;
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

  ensureDefaultLists(): Promise<{ results: { syncKey: string; action: string }[] }> {
    return apiService.post('/admin/marketing/lists/ensure-defaults', {});
  },

  searchUsers(q: string): Promise<UserSearchResult[]> {
    return apiService.get('/admin/marketing/users/search', { q });
  },

  searchPartners(q: string): Promise<PartnerSearchResult[]> {
    return apiService.get('/admin/marketing/partners/search', { q });
  },

  getListMembers(listId: string): Promise<MarketingListMember[]> {
    return apiService.get(`/admin/marketing/lists/${listId}/members`);
  },

  addListMember(listId: string, data: { partnerId?: string; userId?: string }): Promise<MarketingListMember> {
    return apiService.post(`/admin/marketing/lists/${listId}/members`, data);
  },

  removeListMember(listId: string, memberId: string): Promise<void> {
    return apiService.delete(`/admin/marketing/lists/${listId}/members/${memberId}`);
  },

  // ─── Automations ────────────────────────────────────────────────────────────

  listAutomations(params: {
    page?: number; limit?: number; status?: AutomationStatus | ''; search?: string; trigger?: string;
  }): Promise<PagedResult<MarketingAutomation>> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.status)  clean.status  = params.status;
    if (params.search)  clean.search  = params.search;
    if (params.trigger) clean.trigger = params.trigger;
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

  patchAutomationStatus(id: string, status: AutomationStatus): Promise<MarketingAutomation> {
    return apiService.patch(`/admin/marketing/automations/${id}/status`, { status });
  },

  deleteAutomation(id: string): Promise<void> {
    return apiService.delete(`/admin/marketing/automations/${id}`);
  },
};
