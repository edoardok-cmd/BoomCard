import React, { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
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

interface PartnerStatusRouteProps {
  children: React.ReactNode;
  /**
   * Which partner_account_status values are permitted for this route.
   * Spec §1.2, §5.1, §11.2:
   *   Active   → full access (read + write)
   *   Inactive → read-only (cannot initiate new transactions / create offers)
   *   Archived → zero portal access
   *
   * Pass ['Active'] for write-capable routes (CreateOffer, EditOffer, etc).
   * Pass ['Active', 'Inactive'] for read-only partner routes.
   * When isImpersonating is true the status gate is skipped entirely so admins
   * viewing the portal are never blocked by a partner's account status.
   */
  allowedStatuses: Array<'Active' | 'Inactive' | 'Archived'>;
}

/**
 * PartnerStatusRoute wraps write-capable or status-gated partner routes.
 *
 * Behaviour:
 *  - Renders spinner while auth is resolving.
 *  - Redirects unauthenticated users to /login.
 *  - Non-partner roles that are not 'admin' are redirected to /dashboard.
 *  - Admin users bypass the status check (so admins viewing the portal are
 *    not blocked by partner account status).
 *  - When an admin is actively impersonating a partner, the status gate is
 *    also skipped. isImpersonating is checked directly instead of relying on
 *    user.role (which is 'partner' during impersonation).
 *  - Archived partners are logged out and sent to /login with reason=archived.
 *    When impersonating, logout() is NOT called — the admin is redirected to
 *    /dashboard with a notice instead.
 *  - Inactive partners hitting an Active-only route are sent to
 *    /dashboard?status=inactive so they see a read-only notice.
 *  - Active partners (or any status inside allowedStatuses) pass through.
 *  - If partner_account_status is absent, a console.warn is emitted and the
 *    route passes through conservatively (backend is authoritative).
 */
const PartnerStatusRoute: React.FC<PartnerStatusRouteProps> = ({
  children,
  allowedStatuses,
}) => {
  const { user, isAuthenticated, isLoading, isImpersonating, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const status = user?.partner_account_status;
  const isArchivedPartner =
    !isImpersonating &&
    user?.role === 'partner' &&
    status === 'Archived';

  // Archived logout must run in an effect, not during render. React 18 concurrent
  // mode discards in-progress renders that call setState (which logout() does via
  // setUser(null)), causing the <Navigate> return to never be committed. The effect
  // fires after the first committed render and performs the navigation imperatively.
  useEffect(() => {
    if (isArchivedPartner) {
      logout();
      navigate('/login', { state: { reason: 'archived' }, replace: true });
    }
  }, [isArchivedPartner, logout, navigate]);

  if (isLoading) {
    return (
      <LoadingContainer>
        <LoadingSpinner
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </LoadingContainer>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Admin users bypass the partner-status gate so admin tooling is never blocked.
  if (user.role === 'admin') {
    return <>{children}</>;
  }

  // When an admin is impersonating a partner, user.role is 'partner' — the check
  // above does not fire. Use isImpersonating to detect this case and skip the gate
  // so admins can inspect any partner's portal view regardless of account status.
  if (isImpersonating) {
    return <>{children}</>;
  }

  // Only applies to genuine partner-role accounts.
  if (user.role !== 'partner') {
    return <Navigate to="/dashboard" replace />;
  }

  // `partner_account_status` is populated in all auth flows (login, loadUser,
  // switchAccount, impersonate, stopImpersonating, reloadUser). If the field is
  // absent emit a warning — a silent open-access degradation would otherwise go
  // undetected if the backend stops returning it.
  if (!status) {
    console.warn(
      '[PartnerStatusRoute] partner_account_status is missing for partner user',
      user.id,
      '— passing through conservatively. Backend is the authoritative enforcement layer.',
    );
  }

  // Archived → zero portal access (spec §1.2, §5.1, §11.2).
  // Render nothing while the useEffect above performs the logout + navigate.
  if (status === 'Archived') {
    return null;
  }

  // Inactive partner attempting a write-capable route → read-only notice.
  // Redirect to /dashboard?status=inactive (a registered route) rather than
  // /partner/inactive which is not in the router's route tree.
  if (status === 'Inactive' && !allowedStatuses.includes('Inactive')) {
    return (
      <Navigate
        to="/dashboard?status=inactive"
        state={{ reason: 'inactive', from: location }}
        replace
      />
    );
  }

  // Status is within the allowed set (or undefined/unknown — pass through
  // conservatively so a missing status does not permanently lock out a
  // partner whose status the backend has not yet returned).
  return <>{children}</>;
};

export default PartnerStatusRoute;
