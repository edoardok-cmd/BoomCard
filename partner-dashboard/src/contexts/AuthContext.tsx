import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../services/api.service';
import { useLanguage } from './LanguageContext';
import * as authStorage from '../lib/auth/authStorage';

// Shape of errors surfaced from axios/apiService — every field is optional
// because error.response is only populated for HTTP failures (network drops
// and thrown Error instances only set message/code).
type ApiError = {
  response?: {
    status?: number;
    data?: {
      message?: string;
      error?: string | { message?: string };
      details?: { code?: string };
    };
  };
  message?: string;
  code?: string;
};

/**
 * Thrown by login() when the backend reports that an account has 2FA enabled
 * and the request omitted the TOTP/recovery code (HTTP 403 with
 * details.code === 'TWO_FACTOR_REQUIRED'). This is an EXPECTED control-flow
 * signal — not a genuine failure — so it is NOT toasted. LoginPage catches it
 * to reveal the second-factor input. Carries a `code` property so callers that
 * prefer duck-typing over instanceof can detect it too.
 */
export class TwoFactorRequiredError extends Error {
  code = 'TWO_FACTOR_REQUIRED' as const;
  constructor(message = 'Two-factor authentication required') {
    super(message);
    this.name = 'TwoFactorRequiredError';
    // Restore prototype chain for instanceof after TS down-compilation.
    Object.setPrototypeOf(this, TwoFactorRequiredError.prototype);
  }
}

// Backend responses arrive in two shapes across this codebase: the flat
// payload itself, and an envelope { data: payload }. Callers have to probe
// both, so typed responses carry an optional `data` wrapper of the same type.
type Envelope<T> = T & { data?: T };

interface MePayload {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  city?: string;
  country?: string;
  role?: string;
  permissions?: string[];
  createdAt?: string | number;
  emailVerified?: boolean;
  avatar?: string;
  impersonation?: { adminId: string; adminRole: string } | null;
  partner_account_status?: 'Active' | 'Inactive' | 'Archived';
}

interface AuthSuccessPayload {
  user?: MePayload;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  switchableAccounts?: SwitchableAccount[];
  impersonation?: ImpersonationMeta;
  pendingVerification?: boolean;
  // Backend (auth.service.ts) only ever emits 'SUSPENDED'; the previous
  // 'PAUSED' member was never produced server-side. Narrowed to match.
  partnerRestriction?: 'SUSPENDED';
  partner_account_status?: 'Active' | 'Inactive' | 'Archived';
}

type SwitchableAccountsResponse = Envelope<SwitchableAccount[]>;

const humanizeError = (
  error: unknown,
  t: (key: string) => string,
  fallbackKey: string
): string => {
  const err = error as ApiError;
  const nestedError = err?.response?.data?.error;
  const backendMessage: string =
    (typeof nestedError === 'object' ? nestedError?.message : nestedError) ||
    err?.response?.data?.message ||
    err?.message ||
    '';
  const status: number | undefined = err?.response?.status;
  const msg = backendMessage.toLowerCase();

  if (msg.includes('email already exists') || msg.includes('email is already')) {
    return t('errors.emailAlreadyRegistered');
  }
  if (msg.includes('phone number already exists') || msg.includes('phone is already')) {
    return t('errors.phoneAlreadyRegistered');
  }
  if (status === 401 && msg.includes('invalid')) {
    return t('errors.invalidCredentials');
  }
  if (!err?.response && (msg.includes('network') || err?.code === 'ERR_NETWORK')) {
    return t('errors.networkError');
  }
  if (status && status >= 500) {
    return t('errors.serverError');
  }
  return t(fallbackKey);
};

// Pull a human-readable message off an axios/apiService error, preferring the
// structured backend envelope ({ error: { message } } or { message }) before
// falling back to whatever the Error instance carries.
const extractErrorMessage = (error: unknown, fallback: string): string => {
  const err = error as ApiError;
  const nested = err?.response?.data?.error;
  return (
    (typeof nested === 'object' ? nested?.message : nested) ||
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
};

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  city?: string;
  country?: string;
  avatar?: string;
  role: 'user' | 'partner' | 'admin';
  // Raw backend role (USER/PARTNER/ADMIN/SUPER_ADMIN). Used by RequirePermission
  // and CategoryShell to bypass permission checks for SUPER_ADMIN without
  // conflating it with ADMIN in the rest of the UI.
  rawRole?: string;
  // Effective permission keys resolved server-side from the user's AdminRole(s).
  // Absent for non-admin users; SUPER_ADMIN bypasses checks without needing this set.
  permissions?: string[];
  createdAt: number;
  emailVerified: boolean;
  // Admin-only: set on accounts created by another admin; cleared on first password change.
  mustChangePassword?: boolean;
  // Admin-only: whether TOTP 2FA has been configured.
  twoFactorEnabled?: boolean;
  // Spec §1.1, §5.1, §11.2 — partner lifecycle status.
  // Active = full access, Inactive = read-only, Archived = no access.
  // Only present for partner accounts. Used by PartnerStatusRoute and partner pages.
  partner_account_status?: 'Active' | 'Inactive' | 'Archived';
}

// Backend emits roles in uppercase (USER|PARTNER|ADMIN|SUPER_ADMIN); this
// context exposes them lowercased. Keep all login/loadUser/register/switch
// paths going through this helper so a new role (or casing drift) is a
// one-line change. Pre-fix, loadUser/login only checked SUPER_ADMIN and
// lowercase variants, silently dropping PARTNER/ADMIN to 'user' and
// breaking admin menus + the switcher's role-to-route map.
function normalizeRole(role: unknown): User['role'] {
  const r = typeof role === 'string' ? role.toLowerCase() : '';
  if (r === 'admin' || r === 'super_admin') return 'admin';
  if (r === 'partner') return 'partner';
  return 'user';
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
  /**
   * Optional second factor for accounts with 2FA enabled. Accepts EITHER a
   * 6-digit TOTP code from an authenticator app OR a one-time backup recovery
   * code (format `XXXXX-XXXXX`). Spread verbatim into the /auth/login body, so
   * the backend receives whichever the user typed.
   */
  totpCode?: string;
}

export interface RegisterData {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  acceptTerms: boolean;
  /** Spec §2.3 — required Privacy Policy consent for partner registrations.
   * Boolean when provided; undefined for regular user registrations that
   * do not present a separate Privacy Policy checkbox. */
  acceptPrivacy?: boolean;
  accountType?: 'user' | 'partner';
  businessInfo?: {
    businessName: string;
    businessNameBg?: string;
    businessCategory: string;
    businessSubcategory?: string;
    businessSubcategories?: string[];
    taxId?: string;
    website?: string;
    city?: string;
    address?: string;
    /** BC-PARTNER-FU1 — venue geolocation. Required by the backend onboard so the
     * created venue is redeemable (offer redemption fails closed without these). */
    latitude?: number;
    longitude?: number;
    /** Spec §5.1 v1.1 — venue count bucket */
    requestObjectCount?: string;
    /** Spec §2.3 — required participation tier (basic | active | growth) */
    participationLevel?: string;
    /** Spec §2.3 — optional free-text additional info */
    additionalInfo?: string;
    /** Spec §2.3 — optional marketing consent */
    marketingConsent?: boolean;
  };
}

export interface OAuthData {
  provider: 'google' | 'facebook';
  token: string;
  email?: string;
  name?: string;
  picture?: string;
  id?: string;
}

export interface SwitchableAccount {
  id: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  businessName: string | null;
}

export interface ImpersonationMeta {
  adminId: string;
  adminRole: string;
  startedAt: string;
}

export interface AuthContextType extends AuthState {
  token: string | null;
  switchableAccounts: SwitchableAccount[];
  isImpersonating: boolean;
  impersonation: ImpersonationMeta | null;
  partnerRestriction: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  loginWithOAuth: (oauthData: OAuthData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestEmailChange: (newEmail: string) => Promise<void>;
  confirmEmailChange: (code: string, password: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
  switchAccount: (targetAccountId: string) => Promise<void>;
  impersonate: (targetPartnerUserId: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
  // Re-fetch /auth/me and refresh user state in-place (used after 2FA setup, password change, etc.)
  reloadUser: () => Promise<void>;
  // 2FA second-factor step gate. login() sets this true when the backend reports
  // an account has 2FA enabled but no code was supplied (alongside throwing
  // TwoFactorRequiredError). It MUST live on the provider — not in LoginPage's
  // local state — because App.tsx unmounts LoginPage while isLoading is true,
  // wiping any local state set during the in-flight login. LoginPage derives the
  // code field's visibility from this so it survives the remount.
  twoFactorRequired: boolean;
  // Email captured at the password step, surfaced so LoginPage can show
  // "Signing in as <email>" during the 2FA step. The credentials themselves
  // live in a ref (out of React state / devtools), but the email is non-secret
  // and useful for UX, so it is mirrored into state here. Null when no 2FA step
  // is in flight.
  twoFactorEmail: string | null;
  // Submit the second factor against the credentials captured at the password
  // step. LoginPage's local formData is wiped by the isLoading-driven remount,
  // so the code step MUST go through this method (which reads the provider-held
  // pending credentials) rather than re-submitting formData. Resolves on a
  // successful login (user is now authenticated); rejects (and toasts) on a
  // wrong code, leaving the 2FA step active for a retry.
  submitTwoFactor: (code: string) => Promise<void>;
  // Reset the 2FA step (e.g. when the user edits email/password to switch accounts).
  clearTwoFactorRequired: () => void;
}

interface AuthResponse {
  user: User;
  token: string;
  refreshToken?: string;
  accessToken?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'boomcard_auth';
const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';
const SWITCHABLE_ACCOUNTS_KEY = 'boomcard_switchable_accounts';
const IMPERSONATION_KEY = 'boomcard_impersonation';
const PARTNER_RESTRICTION_KEY = 'boomcard_partner_restriction';

// Mirror the refresh token into the `boomcard_refresh` cookie that the axios
// 401-interceptor in api.service.ts reads from. If we only write to
// storage, the very first 401 after login/register/OAuth/switch fails
// to refresh because the interceptor finds no cookie. Every auth flow that
// returns a refresh token must go through this.
//
// `persistent` mirrors the rememberMe choice from login: when false the
// refresh token goes to sessionStorage and the cookie omits max-age (session
// cookie) so both evaporate when the browser closes. When undefined, we
// inherit whichever storage currently holds the refresh token so token
// rotations (switchAccount, refresh interceptor, impersonate) don't quietly
// upgrade an ephemeral session into a remembered one.
function persistRefreshToken(refreshToken: string, persistent?: boolean): void {
  const shouldPersist = persistent === undefined
    ? authStorage.isPersistent(REFRESH_TOKEN_KEY)
    : persistent;
  authStorage.setItem(REFRESH_TOKEN_KEY, refreshToken, shouldPersist);
  if (typeof document === 'undefined') return;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const lifetime = shouldPersist ? `; max-age=${7 * 24 * 60 * 60}` : '';
  document.cookie = `boomcard_refresh=${refreshToken}; path=/${lifetime}; SameSite=Strict${secure}`;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = authStorage.getItem(STORAGE_KEY);
      const storedToken = authStorage.getItem(TOKEN_KEY);
      if (stored && storedToken) return JSON.parse(stored);
    } catch { /* ignore parse errors */ }
    return null;
  });
  const [token, setToken] = useState<string | null>(() => authStorage.getItem(TOKEN_KEY));
  const [switchableAccounts, setSwitchableAccounts] = useState<SwitchableAccount[]>(() => {
    try {
      const raw = authStorage.getItem(SWITCHABLE_ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [impersonation, setImpersonation] = useState<ImpersonationMeta | null>(() => {
    try {
      const raw = authStorage.getItem(IMPERSONATION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [partnerRestriction, setPartnerRestriction] = useState<string | null>(
    () => authStorage.getItem(PARTNER_RESTRICTION_KEY),
  );
  const [isLoading, setIsLoading] = useState(true);
  // 2FA step gate — see AuthContextType.twoFactorRequired for why this must live
  // on the provider (which stays mounted across the isLoading-driven LoginPage
  // unmount/remount) rather than in LoginPage's local state.
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  // Non-secret email mirror for the "Signing in as <email>" UX during 2FA.
  const [twoFactorEmail, setTwoFactorEmail] = useState<string | null>(null);
  // In-memory holder for the credentials captured at the password step. A ref
  // (not state) so the password never lands in React state / devtools and so
  // updates don't trigger re-renders. It lives on AuthProvider, which never
  // unmounts, so it survives the LoginPage remount that App.tsx triggers while
  // isLoading is true — that remount is exactly what wipes LoginPage's local
  // formData, which is why the code step cannot rely on formData.
  const pendingLoginRef = useRef<{ email: string; password: string; rememberMe?: boolean } | null>(null);
  const clearTwoFactorRequired = () => {
    setTwoFactorRequired(false);
    setTwoFactorEmail(null);
    pendingLoginRef.current = null;
  };

  // Keep the switchable-accounts list in sync with storage so hard reloads
  // preserve the switcher UI. Anchor persistence on TOKEN_KEY (always
  // written first during login) so these satellite keys follow the same
  // lifetime — otherwise the isPersistent default would write to
  // localStorage on first login, leaking an ephemeral session's switcher
  // list across browser restarts.
  useEffect(() => {
    if (switchableAccounts.length > 0) {
      authStorage.setItem(
        SWITCHABLE_ACCOUNTS_KEY,
        JSON.stringify(switchableAccounts),
        authStorage.isPersistent(TOKEN_KEY),
      );
    } else {
      authStorage.removeItem(SWITCHABLE_ACCOUNTS_KEY);
    }
  }, [switchableAccounts]);

  // Mirror impersonation metadata into storage so a hard reload while
  // impersonating keeps the banner visible before the context re-hydrates.
  useEffect(() => {
    if (impersonation) {
      authStorage.setItem(
        IMPERSONATION_KEY,
        JSON.stringify(impersonation),
        authStorage.isPersistent(TOKEN_KEY),
      );
    } else {
      authStorage.removeItem(IMPERSONATION_KEY);
    }
  }, [impersonation]);

  // Cross-tab sync: the `storage` event fires in every OTHER tab when a key
  // changes. Mirror auth-related keys into this tab's React state so
  // impersonation start/stop, logout, and account-switch in one tab instantly
  // update the banner + session everywhere. Each branch short-circuits when
  // the parsed value already matches current state, which prevents the
  // state→storage effects above from ping-ponging writes between tabs.
  //
  // Reads go through authStorage so an ephemeral (sessionStorage) session in
  // THIS tab isn't overwritten by a remembered session's logout event firing
  // from another tab — sessionStorage is tab-scoped and still holds the
  // token, so we correctly short-circuit.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.storageArea && e.storageArea !== localStorage) return;

      const applyToken = () => {
        const raw = authStorage.getItem(TOKEN_KEY);
        if (raw === token) return;
        if (raw) apiService.setAuthToken(raw);
        else apiService.clearAuthToken();
        setToken(raw);
      };

      const applyUser = () => {
        const raw = authStorage.getItem(STORAGE_KEY);
        let next: User | null = null;
        if (raw) {
          try { next = JSON.parse(raw) as User; } catch { next = null; }
        }
        if (JSON.stringify(next) === JSON.stringify(user)) return;
        setUser(next);
      };

      const applyImpersonation = () => {
        const raw = authStorage.getItem(IMPERSONATION_KEY);
        let next: ImpersonationMeta | null = null;
        if (raw) {
          try { next = JSON.parse(raw) as ImpersonationMeta; } catch { next = null; }
        }
        if (JSON.stringify(next) === JSON.stringify(impersonation)) return;
        setImpersonation(next);
      };

      const applySwitchable = () => {
        const raw = authStorage.getItem(SWITCHABLE_ACCOUNTS_KEY);
        let next: SwitchableAccount[] = [];
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            next = Array.isArray(parsed) ? parsed : [];
          } catch { next = []; }
        }
        if (JSON.stringify(next) === JSON.stringify(switchableAccounts)) return;
        setSwitchableAccounts(next);
      };

      // `e.key === null` means another tab called localStorage.clear().
      if (e.key === null) {
        applyToken();
        applyUser();
        applyImpersonation();
        applySwitchable();
        return;
      }
      if (e.key === TOKEN_KEY) applyToken();
      else if (e.key === STORAGE_KEY) applyUser();
      else if (e.key === IMPERSONATION_KEY) applyImpersonation();
      else if (e.key === SWITCHABLE_ACCOUNTS_KEY) applySwitchable();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [token, user, impersonation, switchableAccounts]);

  // Load user from localStorage and verify token on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedAuth = authStorage.getItem(STORAGE_KEY);
        const storedToken = authStorage.getItem(TOKEN_KEY);

        if (storedAuth && storedToken) {
          // Verify token with backend
          try {
            apiService.setAuthToken(storedToken);
            const meResponse = await apiService.get<Envelope<MePayload>>('/auth/me');
            const meData: MePayload = meResponse?.data || meResponse;
            const verifiedUser: User = {
              id: meData.id,
              email: meData.email,
              firstName: meData.firstName || '',
              lastName: meData.lastName || '',
              phone: meData.phone,
              city: meData.city,
              country: meData.country,
              role: normalizeRole(meData.role),
              rawRole: typeof meData.role === 'string' ? meData.role.toUpperCase() : undefined,
              permissions: meData.permissions,
              createdAt: meData.createdAt ? new Date(meData.createdAt).getTime() : Date.now(),
              emailVerified: meData.emailVerified ?? true,
              avatar: meData.avatar,
              mustChangePassword: (meData as any).mustChangePassword ?? false,
              twoFactorEnabled: (meData as any).twoFactorEnabled ?? false,
              // Spec §1.2/§11.2: partner_account_status must survive page reloads
              partner_account_status: meData.partner_account_status,
            };
            setUser(verifiedUser);

            // Reconcile impersonation state against the token's imp claim so
            // a cleared/stale localStorage entry can't mask (or fabricate)
            // impersonation. `/auth/me` echoes the server-side truth; treat
            // it as authoritative. When echoing, preserve the original
            // startedAt from local metadata so the banner doesn't reset the
            // session clock on every reload.
            if (meData.impersonation) {
              const prevStarted = (() => {
                try {
                  const raw = authStorage.getItem(IMPERSONATION_KEY);
                  return raw ? (JSON.parse(raw) as ImpersonationMeta).startedAt : undefined;
                } catch {
                  return undefined;
                }
              })();
              setImpersonation({
                adminId: meData.impersonation.adminId,
                adminRole: meData.impersonation.adminRole,
                startedAt: prevStarted || new Date().toISOString(),
              });
            } else {
              setImpersonation(null);
            }

            // Refresh partnerRestriction from /auth/me so a mid-session
            // suspension or reinstatement is applied on the next page load
            // without requiring a full logout/login cycle. (B4 fix)
            const freshRestriction = (meData as any).partnerRestriction ?? null;
            setPartnerRestriction(freshRestriction);
            if (freshRestriction) {
              authStorage.setItem(PARTNER_RESTRICTION_KEY, freshRestriction, authStorage.isPersistent(TOKEN_KEY));
            } else {
              authStorage.removeItem(PARTNER_RESTRICTION_KEY);
            }

            // Refresh the switchable-accounts list so the UI reflects any
            // changes since login (businesses renamed, accounts deleted, etc).
            // Non-fatal — an auth surface that can't enumerate siblings is
            // fine to fall back to whatever was persisted.
            try {
              const switchResp = await apiService.get<SwitchableAccountsResponse>('/auth/switchable-accounts');
              const accounts = switchResp?.data ?? switchResp;
              if (Array.isArray(accounts)) setSwitchableAccounts(accounts);
            } catch (err) {
              console.warn('Could not refresh switchable accounts:', err);
            }
          } catch (error) {
            // Only clear the session for genuine auth failures. Transient
            // failures (429 rate limit, 5xx, network drops) must not log the
            // user out — the cached user/token in storage is still valid and
            // a retry on the next render will succeed.
            const status = (error as ApiError)?.response?.status;
            const isAuthFailure = status === 401 || status === 403;
            if (isAuthFailure) {
              console.error('Token verification failed:', error);
              authStorage.removeItem(STORAGE_KEY);
              authStorage.removeItem(TOKEN_KEY);
              authStorage.removeItem(REFRESH_TOKEN_KEY);
              authStorage.removeItem(SWITCHABLE_ACCOUNTS_KEY);
              authStorage.removeItem(IMPERSONATION_KEY);
              setUser(null);
              setSwitchableAccounts([]);
              setImpersonation(null);
            } else {
              console.warn('Token verification deferred (transient error):', error);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load user from storage:', error);
        authStorage.removeItem(STORAGE_KEY);
        authStorage.removeItem(TOKEN_KEY);
        authStorage.removeItem(REFRESH_TOKEN_KEY);
        authStorage.removeItem(SWITCHABLE_ACCOUNTS_KEY);
        authStorage.removeItem(IMPERSONATION_KEY);
        setImpersonation(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  // Save user to storage when it changes (skip during initial load to
  // avoid clearing boomcard_auth before loadUser can read it — race with
  // StrictMode). authStorage writes back to whichever storage the key
  // already lives in, preserving the rememberMe choice from login.
  useEffect(() => {
    if (isLoading) return;
    if (user) {
      authStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      authStorage.removeItem(STORAGE_KEY);
    }
  }, [user, isLoading]);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    setIsLoading(true);

    // rememberMe drives storage persistence. true → localStorage (survives
    // browser restart); false → sessionStorage (evaporates on tab close).
    // Default to true when omitted so programmatic logins (tests, scripts)
    // behave like they did before this toggle existed.
    const persistent = credentials.rememberMe !== false;

    try {
      // Try real API endpoint first
      try {
        const rawResponse = await apiService.post<Envelope<AuthSuccessPayload>>('/auth/login', { ...credentials, clientType: 'web' });

        // Extract token — handle both flat { token, accessToken } and nested { data: { accessToken } } shapes
        const responseData: AuthSuccessPayload = rawResponse?.data || rawResponse;
        const token = responseData?.token || responseData?.accessToken || rawResponse?.token || rawResponse?.accessToken;
        const refreshToken = responseData?.refreshToken || rawResponse?.refreshToken;
        const userPayload = responseData?.user || rawResponse?.user;
        const switchable = responseData?.switchableAccounts || rawResponse?.switchableAccounts;

        if (!token || !userPayload) {
          throw new Error('No authentication token received');
        }

        // Spec §1.2 / §12 Rule 1 — defense-in-depth: block Archived partner login
        // at the frontend entry point before any tokens are written. PartnerStatusRoute
        // provides the runtime gate, but if the backend ever returns a valid JWT for
        // an Archived partner (regression or misconfiguration), this early-exit prevents
        // a full session from being established.
        const incomingStatus =
          (userPayload as any).partner_account_status ??
          (responseData as any).partner_account_status ??
          (rawResponse as any).partner_account_status;
        if (normalizeRole(userPayload.role) === 'partner' && incomingStatus === 'Archived') {
          throw new Error('This account has been archived. Contact office@boomcard.bg for assistance.');
        }

        // Store tokens — `persistent` routes every auth key to the matching
        // storage (local vs session) and wipes any stale copy in the other,
        // so toggling rememberMe across successive logins always honors the
        // latest choice.
        authStorage.setItem(TOKEN_KEY, token, persistent);
        setToken(token);
        if (refreshToken) {
          persistRefreshToken(refreshToken, persistent);
        }

        // Set auth token in API service
        apiService.setAuthToken(token);

        // Set user state
        const user: User = {
          id: userPayload.id,
          email: userPayload.email,
          firstName: userPayload.firstName || '',
          lastName: userPayload.lastName || '',
          role: normalizeRole(userPayload.role),
          rawRole: typeof userPayload.role === 'string' ? userPayload.role.toUpperCase() : undefined,
          permissions: (userPayload as any).permissions,
          createdAt: userPayload.createdAt ? new Date(userPayload.createdAt).getTime() : Date.now(),
          emailVerified: userPayload.emailVerified ?? true,
          avatar: userPayload.avatar,
          mustChangePassword: (userPayload as any).mustChangePassword ?? false,
          twoFactorEnabled: (userPayload as any).twoFactorEnabled ?? false,
          // Spec §1.2/§11.2: persist partner lifecycle status from login response.
          // Probe both the nested user object and the top-level response envelope because
          // some backend shapes return this field alongside the token rather than inside
          // the user sub-object (mirrors the pattern used in loadUser()).
          partner_account_status: incomingStatus,
        };
        setUser(user);
        authStorage.setItem(STORAGE_KEY, JSON.stringify(user), persistent);
        setSwitchableAccounts(Array.isArray(switchable) ? switchable : []);
        // A fresh login is never an impersonation session — clear any stale
        // metadata left over from a prior tab (e.g. user closed the tab
        // mid-impersonation and later logged in again).
        setImpersonation(null);

        // Persist partner restriction flag (SUSPENDED/PAUSED partners get this
        // from the backend at login time; absent for non-restricted partners).
        const restriction = responseData?.partnerRestriction ?? (rawResponse as any)?.partnerRestriction ?? null;
        if (restriction) {
          authStorage.setItem(PARTNER_RESTRICTION_KEY, restriction, persistent);
        } else {
          authStorage.removeItem(PARTNER_RESTRICTION_KEY);
        }
        setPartnerRestriction(restriction);

        // Successful login completes the 2FA flow — reset the step gate so a
        // subsequent logout/login on the same provider instance starts clean.
        // Also drop the captured credentials and the email mirror.
        setTwoFactorRequired(false);
        setTwoFactorEmail(null);
        pendingLoginRef.current = null;

        toast.success(`Welcome back, ${user.firstName}!`);
        return;
      } catch (apiError) {
        const err = apiError as ApiError;
        const nested = err?.response?.data?.error;
        const apiMessage = (typeof nested === 'object' ? nested?.message : nested)
          || err?.response?.data?.message;
        const errMessageStr = typeof nested === 'string' ? nested : (apiMessage || '');
        const detailCode = err?.response?.data?.details?.code;
        const status = err?.response?.status;

        // 2FA-required signal: an account has 2FA on but no code was supplied.
        // Primary detection is the explicit details.code; fallback is a 403
        // carrying a "Two-factor" message. This is a control-flow signal, not a
        // failure — re-throw a distinguishable error WITHOUT toasting so
        // LoginPage can reveal the code field. Guard against confusing it with a
        // WRONG code (401 / TWO_FACTOR_INVALID), which must surface normally.
        const isTwoFactorRequired =
          detailCode === 'TWO_FACTOR_REQUIRED' ||
          (status === 403 &&
            detailCode !== 'TWO_FACTOR_INVALID' &&
            /two[-\s]?factor/i.test(errMessageStr));
        if (isTwoFactorRequired) {
          // Flip the provider-level gate BEFORE throwing so the code field stays
          // visible across the LoginPage unmount/remount that App.tsx triggers
          // when isLoading goes true→false. The throw still happens so LoginPage
          // knows not to navigate; the outer catch deliberately does not toast
          // TwoFactorRequiredError. The wrong-code path (401 / TWO_FACTOR_INVALID)
          // is NOT handled here, so it leaves this flag TRUE and the field shown.
          // Capture the credentials so submitTwoFactor() can re-issue the login
          // with a totpCode after LoginPage's local formData has been wiped by
          // the remount. Stored in a ref (out of React state) — only the
          // non-secret email is mirrored into state for the UX line. Skip the
          // capture if a totpCode was already supplied (would mean the backend
          // re-asked for 2FA despite a code, which is not the password step).
          if (!credentials.totpCode) {
            pendingLoginRef.current = {
              email: credentials.email,
              password: credentials.password,
              rememberMe: credentials.rememberMe,
            };
            setTwoFactorEmail(credentials.email);
          }
          setTwoFactorRequired(true);
          // Bubble straight to the outer caller.
          throw new TwoFactorRequiredError(apiMessage || undefined);
        }

        if (apiMessage) throw new Error(apiMessage);
        if (err?.response) throw new Error('Login failed. Please try again.');
        console.error('API unavailable:', err?.message || apiError);
        throw new Error('Server is currently unavailable. Please try again later.');
      }
    } catch (error) {
      // The 2FA-required signal is an expected step, not a failure — let
      // LoginPage handle it silently (reveal the code field). Toast everything
      // else, including a WRONG code which arrives as a plain Error here.
      if (error instanceof TwoFactorRequiredError) {
        throw error;
      }
      const message = (error as Error)?.message || 'Login failed';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Submit the second factor (TOTP or XXXXX-XXXXX recovery code) against the
  // credentials captured at the password step. Reuses login() so all the
  // success/token/user handling — and the success-path 2FA reset — run
  // unchanged. On a wrong code login() throws a normal Error (already toasted)
  // and leaves twoFactorRequired/pendingLoginRef intact so the user can retry.
  const submitTwoFactor = async (code: string): Promise<void> => {
    const pending = pendingLoginRef.current;
    if (!pending) {
      // Defensive: the pending credentials are gone (e.g. provider re-mounted
      // from a hard reload, or the step was cancelled). Reset the gate so the
      // user is returned to the normal email/password form rather than stuck on
      // a code field that can never succeed.
      setTwoFactorRequired(false);
      setTwoFactorEmail(null);
      throw new Error('Your sign-in session expired. Please enter your email and password again.');
    }
    // totpCode is present, so login()'s 2FA-required detection (which only fires
    // when no code is supplied) is bypassed: a valid code logs in (success path
    // clears the ref + gate); a wrong code yields a 401 that login() toasts and
    // re-throws as a plain Error, leaving the ref + gate intact for a retry.
    await login({ ...pending, totpCode: code });
    // login()'s success path already cleared the ref + gate; nothing else to do.
  };

  const register = async (data: RegisterData): Promise<void> => {
    setIsLoading(true);

    try {
      // Validate terms acceptance
      if (!data.acceptTerms) {
        throw new Error('You must accept the terms and conditions');
      }
      // Spec §2.3 — Privacy Policy consent is required for partner registrations.
      // Regular user registration does not present a separate Privacy Policy checkbox
      // so acceptPrivacy is only enforced when accountType is 'partner'.
      if (data.accountType === 'partner' && !data.acceptPrivacy) {
        throw new Error('You must accept the Privacy Policy');
      }

      // Call real API endpoint
      const rawResponse = await apiService.post<Envelope<AuthSuccessPayload>>('/auth/register', data);

      // Extract token — handle both flat { token, accessToken } and nested { data: { accessToken } } shapes
      const responseData: AuthSuccessPayload = rawResponse?.data || rawResponse;
      const token = responseData?.token || responseData?.accessToken || rawResponse?.token || rawResponse?.accessToken;
      const refreshToken = responseData?.refreshToken || rawResponse?.refreshToken;
      const userPayload = responseData?.user || rawResponse?.user;
      const pendingVerification = responseData?.pendingVerification === true;

      // Partner registrations are intentionally not auto-logged-in: the backend
      // returns the user record without tokens because the Partner row is
      // PENDING and the dashboard has no useful state for them yet. Show the
      // pending toast and let the caller navigate to /login.
      if (pendingVerification || data.accountType === 'partner') {
        // Spec §5.1 v1.1 — external promise to applicant is "до 2 работни дни"
        // (also delivered via the application-ack email — see auth.service).
        toast.success(
          `Thanks ${userPayload?.firstName || ''}! Your partner application has been received. Our team will contact you within 2 business days.`,
          { duration: 8000 },
        );
        return;
      }

      if (!token || !userPayload) {
        throw new Error('No authentication token received');
      }

      // Store tokens — registration auto-login has no rememberMe toggle, so
      // default to persistent (matches historical behavior).
      authStorage.setItem(TOKEN_KEY, token, true);
      setToken(token);
      if (refreshToken) {
        persistRefreshToken(refreshToken, true);
      }

      // Set auth token in API service
      apiService.setAuthToken(token);

      // Set user state
      const normalizedUser: User = {
        id: userPayload.id,
        email: userPayload.email,
        firstName: userPayload.firstName || '',
        lastName: userPayload.lastName || '',
        role: normalizeRole(userPayload.role),
        rawRole: typeof userPayload.role === 'string' ? userPayload.role.toUpperCase() : undefined,
        permissions: (userPayload as any).permissions,
        createdAt: userPayload.createdAt ? new Date(userPayload.createdAt).getTime() : Date.now(),
        emailVerified: userPayload.emailVerified ?? false,
        avatar: userPayload.avatar,
      };
      setUser(normalizedUser);

      toast.success(t('auth.accountCreated'));
    } catch (error) {
      const message = humanizeError(error, t, 'errors.registrationFailed');
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    // Grab the refresh AND access tokens BEFORE we clear storage so we can
    // tell the server to revoke the row. Fire-and-forget — the UX shouldn't
    // block on a logout API call, and even if it fails the local clear below
    // still signs the user out of this tab.
    const getCookie = (name: string): string | null => {
      if (typeof document === 'undefined') return null;
      const parts = `; ${document.cookie}`.split(`; ${name}=`);
      return parts.length === 2 ? parts.pop()?.split(';').shift() || null : null;
    };
    const refreshTokenForRevoke =
      getCookie('boomcard_refresh') || authStorage.getItem(REFRESH_TOKEN_KEY);
    // Snapshot the access token too. The axios request interceptor reads the
    // access token lazily (inside a microtask) via getAccessToken(), so by
    // the time it runs the localStorage clear below has already happened and
    // the /auth/logout POST fires with no Authorization header. Passing the
    // header explicitly via config bypasses the interceptor's lookup and
    // closes the race regardless of whether /auth/logout ever starts
    // requiring auth.
    const accessTokenForRevoke = getCookie('boomcard_session') || authStorage.getItem(TOKEN_KEY);
    if (refreshTokenForRevoke) {
      const config = accessTokenForRevoke
        ? { headers: { Authorization: `Bearer ${accessTokenForRevoke}` } }
        : undefined;
      apiService.post('/auth/logout', { refreshToken: refreshTokenForRevoke }, config)
        .catch((err) => {
          // Non-fatal: DB row will expire on its own (7d TTL). Logging so
          // repeated failures surface in monitoring.
          console.warn('Server-side logout failed:', err);
        });
    }

    // Clear user state
    setUser(null);
    setToken(null);
    setSwitchableAccounts([]);
    setImpersonation(null);
    setPartnerRestriction(null);
    // Reset the 2FA step gate so the next login on this provider starts clean,
    // and drop any captured pending credentials.
    setTwoFactorRequired(false);
    setTwoFactorEmail(null);
    pendingLoginRef.current = null;

    // Clear persistent AND ephemeral storage. authStorage.removeItem wipes
    // both local and session, so an ephemeral (remember-me=off) session is
    // logged out cleanly too.
    authStorage.removeItem(STORAGE_KEY);
    authStorage.removeItem(TOKEN_KEY);
    authStorage.removeItem(REFRESH_TOKEN_KEY);
    authStorage.removeItem(SWITCHABLE_ACCOUNTS_KEY);
    authStorage.removeItem(IMPERSONATION_KEY);
    authStorage.removeItem(PARTNER_RESTRICTION_KEY);

    // Clear cookies — the axios interceptor reads `boomcard_refresh` first
    // when handling 401s, so leaving it behind would let a post-logout 401
    // silently refresh the session back into existence.
    if (typeof document !== 'undefined') {
      document.cookie = 'boomcard_session=; path=/; max-age=0; SameSite=Strict';
      document.cookie = 'boomcard_refresh=; path=/; max-age=0; SameSite=Strict';
    }

    // Clear API service token
    apiService.clearAuthToken();

    toast.success(t('auth.loggedOut'));
  };

  const switchAccount = async (targetAccountId: string): Promise<void> => {
    // The axios interceptor rotates the refresh token into the
    // `boomcard_refresh` cookie on 401-driven refresh, but login() writes
    // it to localStorage. Read the cookie first so we delete the *current*
    // token on the server rather than a stale one.
    const cookieRefresh = (() => {
      if (typeof document === 'undefined') return null;
      const parts = `; ${document.cookie}`.split('; boomcard_refresh=');
      return parts.length === 2 ? parts.pop()?.split(';').shift() || null : null;
    })();
    const existingRefreshToken = cookieRefresh || authStorage.getItem(REFRESH_TOKEN_KEY);

    // Account switches inherit the lifetime of the current session — a user
    // who logged in without remember-me shouldn't get upgraded to persistent
    // storage just because they switched to a sibling account.
    const inheritPersistent = authStorage.isPersistent(TOKEN_KEY);

    try {
      const rawResponse = await apiService.post<Envelope<AuthSuccessPayload>>('/auth/switch-account', {
        targetAccountId,
        refreshToken: existingRefreshToken,
      });

      const responseData: AuthSuccessPayload = rawResponse?.data || rawResponse;
      const newToken = responseData?.accessToken || responseData?.token;
      const newRefreshToken = responseData?.refreshToken;
      const userPayload = responseData?.user;
      const switchable = responseData?.switchableAccounts;

      if (!newToken || !userPayload) {
        throw new Error('Invalid switch response');
      }

      // Spec §1.2 / §12 Rule 1 — defense-in-depth: block switching to an Archived partner
      // account BEFORE writing any tokens to storage or setting them on apiService.
      // login() and loginWithOAuth() already follow this pattern. Previously this check
      // was placed AFTER the four storage/header writes; if the guard threw, the catch
      // block re-threw without rolling back, leaving the Archived partner's token as the
      // active API credential despite user React state still pointing to the previous account.
      // Probe both the nested user object and the top-level response envelope for
      // partner_account_status — mirrors login()'s more robust extraction so the
      // Archived guard fires regardless of which backend response shape is returned.
      const switchIncomingStatus =
        (userPayload as any).partner_account_status ??
        (responseData as any).partner_account_status ??
        (rawResponse as any).partner_account_status;
      if (normalizeRole(userPayload.role) === 'partner' && switchIncomingStatus === 'Archived') {
        throw new Error('This account has been archived. Contact office@boomcard.bg for assistance.');
      }

      authStorage.setItem(TOKEN_KEY, newToken, inheritPersistent);
      setToken(newToken);
      if (newRefreshToken) {
        persistRefreshToken(newRefreshToken, inheritPersistent);
      }
      apiService.setAuthToken(newToken);

      const nextUser: User = {
        id: userPayload.id,
        email: userPayload.email,
        firstName: userPayload.firstName || '',
        lastName: userPayload.lastName || '',
        role: normalizeRole(userPayload.role),
        rawRole: typeof userPayload.role === 'string' ? userPayload.role.toUpperCase() : undefined,
        permissions: (userPayload as any).permissions,
        createdAt: userPayload.createdAt ? new Date(userPayload.createdAt).getTime() : Date.now(),
        emailVerified: userPayload.emailVerified ?? true,
        avatar: userPayload.avatar,
        mustChangePassword: (userPayload as any).mustChangePassword ?? false,
        twoFactorEnabled: (userPayload as any).twoFactorEnabled ?? false,
        // Spec §1.2/§11.2: preserve partner lifecycle status across account switches.
        // Use the same multi-shape probe as the Archived guard above.
        partner_account_status: switchIncomingStatus,
      };
      setUser(nextUser);
      authStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser), inheritPersistent);
      if (Array.isArray(switchable)) setSwitchableAccounts(switchable);

      // LOW-2 fix (review r2ab): update partnerRestriction for the switched-to account
      // so PartnerStatusBanner accurately reflects the new session's restriction state.
      // All other auth flows (login, loadUser, reloadUser) already do this — account
      // switch was the only path that carried the stale restriction forward.
      const switchRestriction = responseData?.partnerRestriction ?? null;
      if (switchRestriction) {
        authStorage.setItem(PARTNER_RESTRICTION_KEY, switchRestriction, inheritPersistent);
      } else {
        authStorage.removeItem(PARTNER_RESTRICTION_KEY);
      }
      setPartnerRestriction(switchRestriction);

      const label = nextUser.role === 'admin'
        ? 'admin account'
        : switchable?.find(s => s.id === nextUser.id)?.businessName || `${nextUser.firstName} ${nextUser.lastName}`.trim() || nextUser.email;
      toast.success(`Switched to ${label}`);
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to switch account');
      toast.error(message);
      throw error;
    }
  };

  // Admin-only: assume a PARTNER session. Swaps tokens and user state in
  // place (same mechanism as switchAccount), and records impersonation
  // metadata so the banner + stop button render across reloads.
  const impersonate = async (targetPartnerUserId: string): Promise<void> => {
    // Read the admin's current refresh token from its authoritative location
    // (cookie first, because the 401-interceptor writes here on rotation;
    // localStorage only holds whatever login() originally persisted). Sent
    // so the backend can revoke the pre-impersonation admin session — closes
    // the window where a leaked admin refresh token could silently resurrect
    // the admin session in parallel with the impersonation one.
    const cookieRefresh = (() => {
      if (typeof document === 'undefined') return null;
      const parts = `; ${document.cookie}`.split('; boomcard_refresh=');
      return parts.length === 2 ? parts.pop()?.split(';').shift() || null : null;
    })();
    const adminRefreshToken = cookieRefresh || authStorage.getItem(REFRESH_TOKEN_KEY);
    const inheritPersistent = authStorage.isPersistent(TOKEN_KEY);

    try {
      const rawResponse = await apiService.post<Envelope<AuthSuccessPayload>>('/auth/impersonate', {
        targetPartnerUserId,
        refreshToken: adminRefreshToken,
      });
      const responseData: AuthSuccessPayload = rawResponse?.data || rawResponse;
      const newToken = responseData?.accessToken || responseData?.token;
      const newRefreshToken = responseData?.refreshToken;
      const userPayload = responseData?.user;
      const impersonationMeta = responseData?.impersonation;

      if (!newToken || !userPayload || !impersonationMeta) {
        throw new Error('Invalid impersonation response');
      }

      authStorage.setItem(TOKEN_KEY, newToken, inheritPersistent);
      setToken(newToken);
      if (newRefreshToken) persistRefreshToken(newRefreshToken, inheritPersistent);
      apiService.setAuthToken(newToken);

      const nextUser: User = {
        id: userPayload.id,
        email: userPayload.email,
        firstName: userPayload.firstName || '',
        lastName: userPayload.lastName || '',
        role: normalizeRole(userPayload.role),
        rawRole: typeof userPayload.role === 'string' ? userPayload.role.toUpperCase() : undefined,
        permissions: (userPayload as any).permissions,
        createdAt: userPayload.createdAt ? new Date(userPayload.createdAt).getTime() : Date.now(),
        emailVerified: userPayload.emailVerified ?? true,
        avatar: userPayload.avatar,
        // Spec §1.2/§11.2: carry partner lifecycle status into impersonation session
        partner_account_status: userPayload.partner_account_status,
      };
      setUser(nextUser);
      authStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser), inheritPersistent);
      // Impersonation tokens intentionally carry no `ag`; clear any stale
      // sibling list from the admin session so the switcher hides.
      setSwitchableAccounts([]);
      setImpersonation(impersonationMeta);

      // LOW-2 fix (review r2ab): update partnerRestriction from the impersonated
      // partner's response so PartnerStatusBanner shows the correct restriction state.
      // Admins bypass the status gate (isImpersonating check in PartnerStatusRoute),
      // but the banner still reads partnerRestriction to show the restriction notice.
      const impersonateRestriction = responseData?.partnerRestriction ?? null;
      if (impersonateRestriction) {
        authStorage.setItem(PARTNER_RESTRICTION_KEY, impersonateRestriction, inheritPersistent);
      } else {
        authStorage.removeItem(PARTNER_RESTRICTION_KEY);
      }
      setPartnerRestriction(impersonateRestriction);

      toast.success(`Impersonating ${nextUser.firstName} ${nextUser.lastName}`.trim() || `Impersonating ${nextUser.email}`);
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to start impersonation');
      toast.error(message);
      throw error;
    }
  };

  const stopImpersonating = async (): Promise<void> => {
    // Pull the refresh token from where it was last written — cookie takes
    // priority because the 401-interceptor rotates it there.
    const cookieRefresh = (() => {
      if (typeof document === 'undefined') return null;
      const parts = `; ${document.cookie}`.split('; boomcard_refresh=');
      return parts.length === 2 ? parts.pop()?.split(';').shift() || null : null;
    })();
    const currentRefreshToken = cookieRefresh || authStorage.getItem(REFRESH_TOKEN_KEY);
    const inheritPersistent = authStorage.isPersistent(TOKEN_KEY);

    try {
      const rawResponse = await apiService.post<Envelope<AuthSuccessPayload>>('/auth/stop-impersonate', {
        refreshToken: currentRefreshToken,
      });
      const responseData: AuthSuccessPayload = rawResponse?.data || rawResponse;
      const newToken = responseData?.accessToken || responseData?.token;
      const newRefreshToken = responseData?.refreshToken;
      const userPayload = responseData?.user;
      const switchable = responseData?.switchableAccounts;

      if (!newToken || !userPayload) {
        throw new Error('Invalid stop-impersonate response');
      }

      authStorage.setItem(TOKEN_KEY, newToken, inheritPersistent);
      setToken(newToken);
      if (newRefreshToken) persistRefreshToken(newRefreshToken, inheritPersistent);
      apiService.setAuthToken(newToken);

      const adminUser: User = {
        id: userPayload.id,
        email: userPayload.email,
        firstName: userPayload.firstName || '',
        lastName: userPayload.lastName || '',
        role: normalizeRole(userPayload.role),
        rawRole: typeof userPayload.role === 'string' ? userPayload.role.toUpperCase() : undefined,
        permissions: (userPayload as any).permissions,
        createdAt: userPayload.createdAt ? new Date(userPayload.createdAt).getTime() : Date.now(),
        emailVerified: userPayload.emailVerified ?? true,
        avatar: userPayload.avatar,
        mustChangePassword: (userPayload as any).mustChangePassword ?? false,
        twoFactorEnabled: (userPayload as any).twoFactorEnabled ?? false,
        // Admin accounts do not have partner_account_status; restored session is admin-role
        partner_account_status: userPayload.partner_account_status,
      };
      setUser(adminUser);
      authStorage.setItem(STORAGE_KEY, JSON.stringify(adminUser), inheritPersistent);
      setSwitchableAccounts(Array.isArray(switchable) ? switchable : []);
      setImpersonation(null);

      // MEDIUM-1 fix (review r2ab): clear partnerRestriction when stopping impersonation.
      // impersonate() writes the partner's restriction to state and storage; without
      // this clear the restored admin session carries the impersonated partner's
      // restriction value until the next page reload, potentially showing a stale
      // partner-suspended banner to an admin. Mirrors what logout() already does.
      setPartnerRestriction(null);
      authStorage.removeItem(PARTNER_RESTRICTION_KEY);

      toast.success(t('auth.stoppedImpersonating'));
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to stop impersonation');
      toast.error(message);
      throw error;
    }
  };

  const updateProfile = async (data: Partial<User>): Promise<void> => {
    if (!user) {
      throw new Error('No user logged in');
    }

    setIsLoading(true);

    try {
      const rawResponse = await apiService.put<any>('/auth/profile', data);
      const payload = rawResponse?.data || rawResponse;

      // SUGGESTION-2 fix (review r2aa): allowlist which fields the /auth/profile response
      // can update instead of spreading the entire raw payload. Security-sensitive fields
      // (rawRole, permissions, mustChangePassword, twoFactorEnabled, partner_account_status)
      // are preserved from the in-memory user object so a compromised or misconfigured
      // profile endpoint cannot silently overwrite admin security gate fields.
      setUser({
        ...user,
        // Allowed profile fields from the API response:
        firstName: payload.firstName ?? user.firstName,
        lastName: payload.lastName ?? user.lastName,
        phone: payload.phone !== undefined ? payload.phone : user.phone,
        city: payload.city !== undefined ? payload.city : user.city,
        country: payload.country !== undefined ? payload.country : user.country,
        avatar: payload.avatar !== undefined ? payload.avatar : user.avatar,
        email: payload.email ?? user.email,
        emailVerified: payload.emailVerified !== undefined ? payload.emailVerified : user.emailVerified,
        createdAt: payload.createdAt ? new Date(payload.createdAt).getTime() : user.createdAt,
        // Security-sensitive fields: always preserved from in-memory state.
        role: user.role,
        rawRole: user.rawRole,
        permissions: user.permissions,
        mustChangePassword: user.mustChangePassword,
        twoFactorEnabled: user.twoFactorEnabled,
        // Explicitly guard partner_account_status: if the /auth/profile response omits
        // or nulls this field (expected for profile updates), preserve the in-memory value.
        // Prevents a backend regression from silently erasing the partner's access tier.
        partner_account_status: user.partner_account_status,
      });

      toast.success(t('profile.savedSuccessfully'));
    } catch (error) {
      const message = extractErrorMessage(error, 'Update failed');
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    if (!user) {
      throw new Error('No user logged in');
    }

    setIsLoading(true);

    try {
      // Validate new password against the change-password endpoint's real contract.
      // changePasswordValidation (backend auth.validator.ts) enforces min 8 + uppercase
      // + lowercase + digit + special char. The /reset-password flow now shares the
      // SAME canonical policy (validatePasswordPolicy, min 8 + complexity) — there is
      // no longer a separate min-10 rule anywhere. Keeping this in lockstep with the
      // backend and with SettingsPage's inline validator (also min 8) avoids values
      // that pass one gate and are rejected by another.
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      if (!/[A-Z]/.test(newPassword)) {
        throw new Error('Password must contain at least one uppercase letter');
      }
      if (!/[a-z]/.test(newPassword)) {
        throw new Error('Password must contain at least one lowercase letter');
      }
      if (!/[0-9]/.test(newPassword)) {
        throw new Error('Password must contain at least one number');
      }
      if (!/[^A-Za-z0-9]/.test(newPassword)) {
        throw new Error('Password must contain at least one special character');
      }

      // Call real API endpoint
      await apiService.post('/auth/change-password', {
        currentPassword,
        newPassword
      });

      // Clear the mustChangePassword gate in local state so admin panel
      // routes unlock immediately without requiring a page reload.
      setUser(prev => prev ? { ...prev, mustChangePassword: false } : prev);

      toast.success(t('profile.passwordChangedSuccess'));
    } catch (error) {
      const message = extractErrorMessage(error, 'Password change failed');
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const requestEmailChange = async (newEmail: string): Promise<void> => {
    if (!user) throw new Error('No user logged in');
    try {
      await apiService.post('/auth/change-email/request', { newEmail });
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to send verification code');
      toast.error(message);
      throw error;
    }
  };

  const confirmEmailChange = async (code: string, password: string): Promise<void> => {
    if (!user) throw new Error('No user logged in');
    try {
      const response = await apiService.post<Envelope<{ user?: MePayload } & MePayload>>('/auth/change-email/verify', { code, password });
      const data = response?.data || response;
      const updated = (data as any).user || data;
      setUser(prev => prev ? {
        ...prev,
        email: updated.email || prev.email,
        city: updated.city ?? prev.city,
        country: updated.country ?? prev.country,
      } : prev);
      toast.success(t('auth.emailUpdated'));
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to verify email change');
      toast.error(message);
      throw error;
    }
  };

  const deleteAccount = async (password: string): Promise<void> => {
    if (!user) throw new Error('No user logged in');
    try {
      await apiService.delete('/auth/account', { data: { password } });
      setUser(null);
      setToken(null);
      setSwitchableAccounts([]);
      setImpersonation(null);
      setPartnerRestriction(null);
      authStorage.removeItem(STORAGE_KEY);
      authStorage.removeItem(TOKEN_KEY);
      authStorage.removeItem(REFRESH_TOKEN_KEY);
      authStorage.removeItem(SWITCHABLE_ACCOUNTS_KEY);
      authStorage.removeItem(IMPERSONATION_KEY);
      authStorage.removeItem(PARTNER_RESTRICTION_KEY);
      if (typeof document !== 'undefined') {
        document.cookie = 'boomcard_session=; path=/; max-age=0; SameSite=Strict';
        document.cookie = 'boomcard_refresh=; path=/; max-age=0; SameSite=Strict';
      }
      apiService.clearAuthToken();
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to delete account');
      toast.error(message);
      throw error;
    }
  };

  const loginWithOAuth = async (oauthData: OAuthData): Promise<void> => {
    setIsLoading(true);

    try {
      // Try real API endpoint first
      try {
        const response = await apiService.post<AuthResponse & { switchableAccounts?: SwitchableAccount[] }>('/auth/oauth/login', oauthData);

        // Extract token
        const token = response.token || response.accessToken;
        const refreshToken = response.refreshToken;

        if (!token) {
          throw new Error('No authentication token received');
        }

        // Spec §1.2 / §12 Rule 1 — defense-in-depth: block Archived partner OAuth login
        // before any tokens are written to storage.
        const oauthIncomingStatus = (response.user as any).partner_account_status as 'Active' | 'Inactive' | 'Archived' | undefined;
        if (normalizeRole((response.user as any).role) === 'partner' && oauthIncomingStatus === 'Archived') {
          throw new Error('This account has been archived. Contact office@boomcard.bg for assistance.');
        }

        // Store tokens — OAuth has no rememberMe toggle, default persistent.
        authStorage.setItem(TOKEN_KEY, token, true);
        setToken(token);
        if (refreshToken) {
          persistRefreshToken(refreshToken, true);
        }

        // Set auth token in API service
        apiService.setAuthToken(token);

        // Set user state — enrich with rawRole/permissions if the OAuth endpoint returns them
        const oauthUser: User = {
          ...response.user,
          rawRole: typeof (response.user as any).rawRole === 'string'
            ? (response.user as any).rawRole
            : typeof (response.user as any).role === 'string'
              ? (response.user as any).role.toUpperCase()
              : undefined,
          permissions: (response.user as any).permissions,
          // Spec §1.2/§11.2: persist partner lifecycle status from OAuth login response
          partner_account_status: oauthIncomingStatus,
        };
        setUser(oauthUser);

        // Store auth data
        authStorage.setItem(STORAGE_KEY, JSON.stringify(oauthUser), true);

        // Capture sibling accounts if the OAuth response included them. For
        // providers that don't yet return the list, fall back to a fetch so
        // the switcher is populated on first render instead of waiting for
        // the next loadUser pass.
        if (Array.isArray(response.switchableAccounts)) {
          setSwitchableAccounts(response.switchableAccounts);
        } else {
          try {
            const switchResp = await apiService.get<SwitchableAccountsResponse>('/auth/switchable-accounts');
            const accounts = switchResp?.data ?? switchResp;
            if (Array.isArray(accounts)) setSwitchableAccounts(accounts);
          } catch {
            // Non-fatal: session still usable without the switcher.
          }
        }

        toast.success(`Welcome, ${response.user.firstName}!`);
        return;
      } catch (apiError) {
        const err = apiError as ApiError;
        const nested = err?.response?.data?.error;
        const apiMessage = err?.response?.data?.message
          || (typeof nested === 'object' ? nested?.message : nested);
        if (apiMessage) throw new Error(apiMessage);
        console.error('OAuth API unavailable:', err?.message || apiError);
        throw new Error('Server is currently unavailable. Please try again later.');
      }
    } catch (error) {
      const message = (error as Error)?.message || `${oauthData.provider} login failed`;
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const uploadAvatar = async (file: File): Promise<void> => {
    if (!user) throw new Error('No user logged in');

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await apiService.post<Envelope<{ avatar?: string }>>('/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const updatedUser = response?.data || response;
      setUser(prev => prev ? { ...prev, avatar: updatedUser.avatar } : prev);

      toast.success(t('profile.avatarUpdated'));
    } catch (error) {
      const message = extractErrorMessage(error, 'Upload failed');
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const reloadUser = async (): Promise<void> => {
    try {
      const meResponse = await apiService.get<Envelope<MePayload>>('/auth/me');
      const meData: MePayload = meResponse?.data || meResponse;
      setUser(prev => prev ? {
        ...prev,
        firstName: meData.firstName || prev.firstName,
        lastName: meData.lastName || prev.lastName,
        phone: meData.phone ?? prev.phone,
        city: meData.city ?? prev.city,
        country: meData.country ?? prev.country,
        permissions: meData.permissions ?? prev.permissions,
        mustChangePassword: (meData as any).mustChangePassword ?? prev.mustChangePassword,
        twoFactorEnabled: (meData as any).twoFactorEnabled ?? prev.twoFactorEnabled,
        // Spec §1.2/§11.2: refresh partner lifecycle status so mid-session changes are reflected
        partner_account_status: meData.partner_account_status ?? prev.partner_account_status,
      } : prev);
      // Refresh partnerRestriction from /auth/me so a suspension or reinstatement
      // that happens mid-session is picked up the next time reloadUser() is called.
      const restriction = (meData as any).partnerRestriction ?? null;
      setPartnerRestriction(restriction);
      if (restriction) {
        authStorage.setItem(PARTNER_RESTRICTION_KEY, restriction, authStorage.isPersistent(TOKEN_KEY));
      } else {
        authStorage.removeItem(PARTNER_RESTRICTION_KEY);
      }
    } catch {
      // Non-fatal — stale state is fine if the reload fails
    }
  };

  const removeAvatar = async (): Promise<void> => {
    if (!user) throw new Error('No user logged in');

    setIsLoading(true);
    try {
      await apiService.delete('/auth/avatar');
      setUser(prev => prev ? { ...prev, avatar: undefined } : prev);
      toast.success(t('profile.avatarRemoved'));
    } catch (error) {
      const message = extractErrorMessage(error, 'Remove failed');
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user,
    isLoading,
    switchableAccounts,
    isImpersonating: impersonation !== null,
    impersonation,
    partnerRestriction,
    login,
    loginWithOAuth,
    register,
    logout,
    updateProfile,
    changePassword,
    requestEmailChange,
    confirmEmailChange,
    deleteAccount,
    uploadAvatar,
    removeAvatar,
    switchAccount,
    impersonate,
    stopImpersonating,
    reloadUser,
    twoFactorRequired,
    twoFactorEmail,
    submitTwoFactor,
    clearTwoFactorRequired,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
