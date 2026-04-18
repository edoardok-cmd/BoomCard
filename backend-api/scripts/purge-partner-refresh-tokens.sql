-- One-time purge: revoke any refresh tokens belonging to non-customer accounts.
--
-- Context: before the mobile clientType guard was added to /auth/login and
-- /auth/refresh, a PARTNER/ADMIN/SUPER_ADMIN user could log into the mobile
-- app and receive a refresh token. Those tokens predate the new
-- RefreshToken.clientType column (so clientType IS NULL on them) and would
-- otherwise keep minting fresh access tokens until natural expiry (up to 7d).
--
-- Deleting them forces every non-USER session (mobile OR web) to re-login
-- exactly once. Partner-dashboard users will re-login on next page load; the
-- authoritative mobile block at /auth/login will then reject them.
--
-- Run AFTER the backend deploy that adds RefreshToken.clientType, not before.
--   psql "$DATABASE_URL" -f scripts/purge-partner-refresh-tokens.sql

BEGIN;

SELECT COUNT(*) AS tokens_to_delete
FROM "RefreshToken"
WHERE "userId" IN (SELECT id FROM "User" WHERE role <> 'USER');

DELETE FROM "RefreshToken"
WHERE "userId" IN (SELECT id FROM "User" WHERE role <> 'USER');

COMMIT;
