import { apiService } from './api.service';

export type TicketStatus = 'NEW' | 'OPEN' | 'WAITING' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketCategory = 'CASHBACK' | 'ACCOUNT' | 'PAYMENT' | 'TECHNICAL' | 'OTHER';

export interface TicketUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export interface HelpTicket {
  id: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  user: TicketUser;
  assignee: TicketUser | null;
}

export interface HelpTicketFull extends HelpTicket {
  body: string;
}

export interface TicketListResult<T> {
  tickets: T[];
  total: number;
  page: number;
  limit: number;
}

export interface TicketReply {
  id: string;
  body: string;
  isAdmin: boolean;
  createdAt: string;
  author: TicketUser;
}

export const adminHelpService = {
  /** Returns count of NEW tickets — own for regular admins, all for SUPER_ADMIN. */
  getNewCount(): Promise<{ count: number }> {
    return apiService.get('/admin/help/count');
  },

  create(data: {
    subject: string;
    body: string;
    category: TicketCategory;
    priority?: TicketPriority;
  }): Promise<{ ticket: { id: string; subject: string; category: TicketCategory; priority: TicketPriority; status: TicketStatus; createdAt: string } }> {
    return apiService.post('/admin/help', data);
  },

  listAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: TicketStatus | '';
    priority?: TicketPriority | '';
    category?: TicketCategory | '';
  }): Promise<TicketListResult<HelpTicket>> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.status) clean.status = params.status;
    if (params.priority) clean.priority = params.priority;
    if (params.category) clean.category = params.category;
    return apiService.get('/admin/help', clean);
  },

  listMine(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: TicketStatus | '';
    priority?: TicketPriority | '';
    category?: TicketCategory | '';
  }): Promise<TicketListResult<HelpTicket>> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.status) clean.status = params.status;
    if (params.priority) clean.priority = params.priority;
    if (params.category) clean.category = params.category;
    return apiService.get('/admin/help/mine', clean);
  },

  getOne(id: string): Promise<{ ticket: HelpTicketFull }> {
    return apiService.get(`/admin/help/${id}`);
  },

  getReplies(id: string): Promise<{ replies: TicketReply[] }> {
    return apiService.get(`/admin/help/${id}/replies`);
  },

  sendReply(id: string, body: string): Promise<{ reply: TicketReply }> {
    return apiService.post(`/admin/help/${id}/reply`, { body });
  },

  assign(id: string, opts?: { assigneeId: string | null }): Promise<{ ok: boolean }> {
    return apiService.post(`/admin/help/${id}/assign`, opts ?? {});
  },

  update(id: string, data: { status?: TicketStatus; priority?: TicketPriority }): Promise<{ ok: boolean }> {
    return apiService.patch(`/admin/help/${id}`, data);
  },
};
