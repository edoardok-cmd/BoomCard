import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface RequirePermissionProps {
  permissionKey: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// Renders children only when the current user has the specified permission.
// SUPER_ADMIN bypasses all checks (rawRole stored in AuthContext).
// Use fallback to show an alternative (e.g. a disabled button) instead of hiding.
export const RequirePermission: React.FC<RequirePermissionProps> = ({
  permissionKey,
  children,
  fallback = null,
}) => {
  const { user } = useAuth();

  if (!user) return <>{fallback}</>;

  const isSuperAdmin = (user as any).rawRole === 'SUPER_ADMIN';
  if (isSuperAdmin) return <>{children}</>;

  const permissions: string[] = (user as any).permissions ?? [];
  if (permissions.includes(permissionKey)) return <>{children}</>;

  return <>{fallback}</>;
};
