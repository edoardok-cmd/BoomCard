import { apiService } from './api.service';

export type AdminRoleKey = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'RISK_REVIEW' | 'PARTNER_MANAGER';
export type UserRole = 'ADMIN' | 'SUPER_ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION' | 'PENDING_PAYMENT';

export interface AdminRoleEntry {
  id: string;
  key: AdminRoleKey;
  label: string;
}

export interface UserAdminRoleEntry {
  id: string;
  grantedAt: string;
  role: AdminRoleEntry;
  grantedBy: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  twoFactorEnabled: boolean;
  adminRoles: UserAdminRoleEntry[];
}

export interface AdminUserDetail {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  twoFactorEnabled: boolean;
  adminRoles: UserAdminRoleEntry[];
}

export interface PendingAdmin {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export interface PendingSuperAdminRequest {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  createdAt: string;
  requestedBy: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
}

export interface PendingSuperResult {
  requests: PendingSuperAdminRequest[];
  total: number;
  page: number;
  limit: number;
}

export type CreateAdminResponse =
  | { ok: boolean; pending?: false; user: Pick<AdminUser, 'id' | 'email'> }
  | { ok: boolean; pending: true; request: Pick<PendingSuperAdminRequest, 'id' | 'email' | 'firstName' | 'lastName' | 'createdAt'> };

export type CriticalActionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface CriticalActionActor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export interface CriticalActionRequest {
  id: string;
  actionType: string;
  payload: unknown;
  note: string | null;
  status: CriticalActionStatus;
  createdAt: string;
  requestedBy: CriticalActionActor;
  resolvedBy: CriticalActionActor | null;
  resolvedNote: string | null;
  resolvedAt: string | null;
}

export interface CriticalActionsResult {
  items: CriticalActionRequest[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface AuditActor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  objectType: string;
  objectId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: AuditActor | null;
}

export interface AdminsResult {
  admins: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface PendingResult {
  users: PendingAdmin[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditResult {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export const adminAdminsService = {
  listRoles(): Promise<{ roles: AdminRoleEntry[] }> {
    return apiService.get('/admin/admins/roles');
  },

  list(params: { page?: number; limit?: number; search?: string; roleKey?: AdminRoleKey | '' }): Promise<AdminsResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.roleKey) clean.roleKey = params.roleKey;
    return apiService.get('/admin/admins', clean);
  },

  create(data: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    password: string;
    roleKey: AdminRoleKey;
  }): Promise<CreateAdminResponse> {
    return apiService.post('/admin/admins', data);
  },

  listPending(params: { page?: number; limit?: number; search?: string }): Promise<PendingResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    return apiService.get('/admin/admins/pending', clean);
  },

  approve(id: string, roleKey: AdminRoleKey): Promise<{ ok: boolean }> {
    return apiService.post(`/admin/admins/${id}/approve`, { roleKey });
  },

  removeRole(id: string, roleKey: AdminRoleKey): Promise<{ ok: boolean }> {
    return apiService.delete(`/admin/admins/${id}/roles/${roleKey}`);
  },

  getById(id: string): Promise<AdminUserDetail> {
    return apiService.get(`/admin/admins/${id}`);
  },

  setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<{ ok: boolean }> {
    return apiService.patch(`/admin/admins/${id}/status`, { status });
  },

  listPendingSuper(params?: { page?: number; limit?: number }): Promise<PendingSuperResult> {
    return apiService.get('/admin/admins/pending-super', { page: params?.page, limit: params?.limit });
  },

  approvePendingSuper(id: string): Promise<{ ok: boolean; user: Pick<AdminUser, 'id' | 'email'> }> {
    return apiService.post(`/admin/admins/pending-super/${id}/approve`, {});
  },

  rejectPendingSuper(id: string): Promise<{ ok: boolean }> {
    return apiService.delete(`/admin/admins/pending-super/${id}`);
  },

  listCriticalActions(params?: {
    page?: number;
    limit?: number;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
  }): Promise<CriticalActionsResult> {
    const clean: Record<string, unknown> = { page: params?.page, limit: params?.limit };
    if (params?.status) clean.status = params.status;
    return apiService.get('/admin/admins/critical-actions', clean);
  },

  approveCriticalAction(id: string, note?: string): Promise<{ item: CriticalActionRequest }> {
    return apiService.post(`/admin/admins/critical-actions/${id}/approve`, { note });
  },

  rejectCriticalAction(id: string, note: string): Promise<{ item: CriticalActionRequest }> {
    return apiService.post(`/admin/admins/critical-actions/${id}/reject`, { note });
  },

  listAudit(params: {
    page?: number;
    limit?: number;
    search?: string;
    objectType?: string;
    action?: string;
    actorId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<AuditResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search)     clean.search     = params.search;
    if (params.objectType) clean.objectType = params.objectType;
    if (params.action)     clean.action     = params.action;
    if (params.actorId)    clean.actorId    = params.actorId;
    if (params.dateFrom)   clean.dateFrom   = params.dateFrom;
    if (params.dateTo)     clean.dateTo     = params.dateTo;
    return apiService.get('/admin/admins/audit', clean);
  },
};
