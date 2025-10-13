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
  redirectTo?: string;
}

/**
 * ProtectedRoute component that guards routes requiring authentication
 *
 * @param children - The component to render if authorized
 * @param requireAuth - Whether authentication is required (default: true)
 * @param redirectTo - Where to redirect if not authorized (default: /login)
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  redirectTo = '/login',
}) => {
  const { isAuthenticated, isLoading } = useAuth();
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

  // User is authorized, render the protected component
  return <>{children}</>;
};

export default ProtectedRoute;
