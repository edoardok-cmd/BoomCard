import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * ResetPasswordPage — redirect-only shim.
 *
 * The token-link reset flow this page previously implemented relied on two
 * backend endpoints that do not exist:
 *   - GET  /auth/validate-reset-token   (404)
 *   - POST /auth/reset-password-token   (404)
 *
 * The real, fully-implemented password-reset flow is OTP-based and lives in
 * ForgotPasswordPage (POST /auth/forgot-password → 6-digit OTP →
 * POST /auth/reset-password { email, otp, newPassword }).
 *
 * Anyone landing on /reset-password (e.g. from an old emailed link) is sent to
 * the working OTP flow. The OTP flow does not use a token query param, so we do
 * not preserve ?token.
 */
const ResetPasswordPage: React.FC = () => {
  return <Navigate to="/forgot-password" replace />;
};

export default ResetPasswordPage;
