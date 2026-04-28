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
  adminRoles: UserAdminRoleEntry[];
}

export interface PendingAdmin {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: UserStatus;
  createdAt: string;
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
  }): Promise<{ ok: boolean; user: Pick<AdminUser, 'id' | 'email'> }> {
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

  listAudit(params: {
    page?: number;
    limit?: number;
    search?: string;
    objectType?: string;
  }): Promise<AuditResult> {
    const clean: Record<string, unknown> = { page: params.page, limit: params.limit };
    if (params.search) clean.search = params.search;
    if (params.objectType) clean.objectType = params.objectType;
    return apiService.get('/admin/admins/audit', clean);
  },
};
