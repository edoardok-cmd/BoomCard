import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
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

  // Show loading spinner while checking auth state
  if (isLoading) {
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
  if (requireAuth && !isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // If route requires NO auth (e.g., login page) and user IS authenticated, redirect to home
  if (!requireAuth && isAuthenticated) {
    return <Navigate to="/" replace />;
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
    // access to any page other than the security settings page.
    if (user.role === 'admin') {
      const onSecurityPage = location.pathname.startsWith('/admin/profile/security');
      const onLogoutPage   = location.pathname.startsWith('/admin/profile/logout');
      const bypass = onSecurityPage || onLogoutPage;

      if (!bypass && user.mustChangePassword) {
        return <Navigate to="/admin/profile/security" state={{ reason: 'mustChangePassword' }} replace />;
      }
      if (!bypass && user.twoFactorEnabled === false && import.meta.env.PROD) {
        return <Navigate to="/admin/profile/security" state={{ reason: 'setup2FA' }} replace />;
      }
    }
  }

  // User is authorized, render the protected component
  return <>{children}</>;
};

export default ProtectedRoute;
