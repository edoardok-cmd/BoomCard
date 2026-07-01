import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getAdminGateReason, isGateBypassPath } from './adminGate';
import styled from 'styled-components';
import { motion } from 'framer-motion';

const LoadingContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f9fafb;
`;

const LoadingSpinner = styled(motion.div)`
  width: 3rem;
  height: 3rem;
  border: 3px solid #e5e7eb;
  border-top-color: #111827;
  border-radius: 50%;
`;

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requiredRole?: 'user' | 'partner' | 'admin';
  redirectTo?: string;
}

/**
 * ProtectedRoute component that guards routes requiring authentication
 *
 * @param children - The component to render if authorized
 * @param requireAuth - Whether authentication is required (default: true)
 * @param requiredRole - The required role to access this route
 * @param redirectTo - Where to redirect if not authorized (default: /login)
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  requiredRole,
  redirectTo = '/login',
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Auth-required routes show a spinner while isLoading so we never flash
  // protected content before the auth check completes.
  //
  // Public routes (requireAuth=false) must NOT unmount their children during
  // loading. Doing so wipes the form's local state mid-request (e.g. the
  // partner registration form is unmounted when register() sets isLoading=true,
  // so any 409 error caught after the API call sets state on an unmounted
  // component and is silently discarded; the form then remounts empty).
  // For public routes we render children immediately and defer the
  // authenticated-user redirect until the auth check is done.
  if (isLoading && requireAuth) {
    return (
      <LoadingContainer>
        <LoadingSpinner
          animate={{ rotate: 360 }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      </LoadingContainer>
    );
  }

  // If route requires auth and user is not authenticated, redirect to login
  if (!isLoading && requireAuth && !isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // If route requires NO auth (e.g., login page) and user IS authenticated, redirect to the
  // role-appropriate home. Only redirect after auth check completes (isLoading=false) so we
  // don't kick the user away from a public form mid-request when isLoading briefly flips to true.
  if (!isLoading && !requireAuth && isAuthenticated) {
    // Send authenticated users to their role-appropriate home, not always "/"
    if (user?.role === 'partner') return <Navigate to="/partners/offers" replace />;
    if (user?.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  // Role-based access control
  if (requiredRole && user) {
    // SUGGESTION-1 fix (review r2aa): when the required role is 'user', admins must
    // NOT bypass the gate. The subscription route uses requiredRole="user" with an
    // explicit comment that admins must be blocked from user-facing billing flows
    // (retry-payment, cancel, reactivate mutations). The previous blanket admin bypass
    // (user.role !== 'admin') made that enforcement aspirational — admins could reach
    // the subscription page and trigger billing mutations.
    if (requiredRole === 'user' && user.role !== 'user') {
      return <Navigate to="/" replace />;
    }
    if (user.role !== requiredRole && user.role !== 'admin') {
      return <Navigate to="/dashboard" replace />;
    }

    // For admin users: enforce password change and 2FA setup before allowing
    // access to any page other than the security settings page. The gating
    // decision is derived from the SAME helper the sidebar nav uses
    // (adminGate.ts) so the redirect and the nav lock styling can never
    // disagree. The security/logout routes are always reachable so the admin
    // can complete the required step.
    if (user.role === 'admin' && !isGateBypassPath(location.pathname)) {
      const reason = getAdminGateReason(user);
      if (reason) {
        return <Navigate to="/admin/profile/security" state={{ reason }} replace />;
      }
    }
  }

  // User is authorized, render the protected component
  return <>{children}</>;
};

export default ProtectedRoute;
