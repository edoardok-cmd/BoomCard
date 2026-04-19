import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../services/api.service';
import { useLanguage } from './LanguageContext';
import * as authStorage from '../lib/auth/authStorage';

const humanizeError = (
  error: any,
  t: (key: string) => string,
  fallbackKey: string
): string => {
  const backendMessage: string =
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    '';
  const status: number | undefined = error?.response?.status;
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
  if (!error?.response && (msg.includes('network') || error?.code === 'ERR_NETWORK')) {
    return t('errors.networkError');
  }
  if (status && status >= 500) {
    return t('errors.serverError');
  }
  return t(fallbackKey);
};

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  role: 'user' | 'partner' | 'admin';
  createdAt: number;
  emailVerified: boolean;
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
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  acceptTerms: boolean;
  accountType?: 'user' | 'partner';
  businessInfo?: {
    businessName: string;
    businessNameBg?: string;
    businessCategory: string;
    businessSubcategory?: string;
    taxId?: string;
    website?: string;
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
  login: (credentials: LoginCredentials) => Promise<void>;
  loginWithOAuth: (oauthData: OAuthData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
  switchAccount: (targetAccountId: string) => Promise<void>;
  impersonate: (targetPartnerUserId: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);

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
            const meResponse = await apiService.get<any>('/auth/me');
            const meData = meResponse?.data || meResponse;
            const verifiedUser: User = {
              id: meData.id,
              email: meData.email,
              firstName: meData.firstName || '',
              lastName: meData.lastName || '',
              role: normalizeRole(meData.role),
              createdAt: meData.createdAt ? new Date(meData.createdAt).getTime() : Date.now(),
              emailVerified: meData.emailVerified ?? true,
              avatar: meData.avatar,
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

            // Refresh the switchable-accounts list so the UI reflects any
            // changes since login (businesses renamed, accounts deleted, etc).
            // Non-fatal — an auth surface that can't enumerate siblings is
            // fine to fall back to whatever was persisted.
            try {
              const switchResp = await apiService.get<any>('/auth/switchable-accounts');
              const accounts = (switchResp?.data ?? switchResp) as SwitchableAccount[];
              if (Array.isArray(accounts)) setSwitchableAccounts(accounts);
            } catch (err) {
              console.warn('Could not refresh switchable accounts:', err);
            }
          } catch (error) {
            // Token invalid or expired, clear storage
            console.error('Token verification failed:', error);
            authStorage.removeItem(STORAGE_KEY);
            authStorage.removeItem(TOKEN_KEY);
            authStorage.removeItem(REFRESH_TOKEN_KEY);
            authStorage.removeItem(SWITCHABLE_ACCOUNTS_KEY);
            authStorage.removeItem(IMPERSONATION_KEY);
            setUser(null);
            setSwitchableAccounts([]);
            setImpersonation(null);
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
        const rawResponse = await apiService.post<any>('/auth/login', { ...credentials, clientType: 'web' });

        // Extract token — handle both flat { token, accessToken } and nested { data: { accessToken } } shapes
        const responseData = rawResponse?.data || rawResponse;
        const token = responseData?.token || responseData?.accessToken || rawResponse?.token || rawResponse?.accessToken;
        const refreshToken = responseData?.refreshToken || rawResponse?.refreshToken;
        const userPayload = responseData?.user || rawResponse?.user;
        const switchable = (responseData?.switchableAccounts || rawResponse?.switchableAccounts) as
          | SwitchableAccount[]
          | undefined;

        if (!token) {
          throw new Error('No authentication token received');
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
          createdAt: userPayload.createdAt ? new Date(userPayload.createdAt).getTime() : Date.now(),
          emailVerified: userPayload.emailVerified ?? true,
          avatar: userPayload.avatar,
        };
        setUser(user);
        authStorage.setItem(STORAGE_KEY, JSON.stringify(user), persistent);
        setSwitchableAccounts(Array.isArray(switchable) ? switchable : []);
        // A fresh login is never an impersonation session — clear any stale
        // metadata left over from a prior tab (e.g. user closed the tab
        // mid-impersonation and later logged in again).
        setImpersonation(null);

        toast.success(`Welcome back, ${user.firstName}!`);
        return;
      } catch (apiError: any) {
        const apiMessage = apiError?.response?.data?.error?.message
          || apiError?.response?.data?.message
          || (typeof apiError?.response?.data?.error === 'string' ? apiError?.response?.data?.error : null);
        if (apiMessage) throw new Error(apiMessage);
        if (apiError?.response) throw new Error('Login failed. Please try again.');
        console.error('API unavailable:', apiError.message || apiError);
        throw new Error('Server is currently unavailable. Please try again later.');
      }
    } catch (error: any) {
      const message = error.message || 'Login failed';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData): Promise<void> => {
    setIsLoading(true);

    try {
      // Validate terms acceptance
      if (!data.acceptTerms) {
        throw new Error('You must accept the terms and conditions');
      }

      // Call real API endpoint
      const rawResponse = await apiService.post<any>('/auth/register', data);

      // Extract token — handle both flat { token, accessToken } and nested { data: { accessToken } } shapes
      const responseData = rawResponse?.data || rawResponse;
      const token = responseData?.token || responseData?.accessToken || rawResponse?.token || rawResponse?.accessToken;
      const refreshToken = responseData?.refreshToken || rawResponse?.refreshToken;
      const userPayload = responseData?.user || rawResponse?.user;
      const pendingVerification = responseData?.pendingVerification === true;

      // Partner registrations are intentionally not auto-logged-in: the backend
      // returns the user record without tokens because the Partner row is
      // PENDING and the dashboard has no useful state for them yet. Show the
      // pending toast and let the caller navigate to /login.
      if (pendingVerification || data.accountType === 'partner') {
        toast.success(`Thanks ${userPayload?.firstName || ''}! Your partner application is under review — you'll be able to sign in once approved.`);
        return;
      }

      if (!token) {
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
        createdAt: userPayload.createdAt ? new Date(userPayload.createdAt).getTime() : Date.now(),
        emailVerified: userPayload.emailVerified ?? false,
        avatar: userPayload.avatar,
      };
      setUser(normalizedUser);

      toast.success('Account created successfully! Welcome to BoomCard!');
    } catch (error: any) {
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

    // Clear persistent AND ephemeral storage. authStorage.removeItem wipes
    // both local and session, so an ephemeral (remember-me=off) session is
    // logged out cleanly too.
    authStorage.removeItem(STORAGE_KEY);
    authStorage.removeItem(TOKEN_KEY);
    authStorage.removeItem(REFRESH_TOKEN_KEY);
    authStorage.removeItem(SWITCHABLE_ACCOUNTS_KEY);
    authStorage.removeItem(IMPERSONATION_KEY);

    // Clear cookies — the axios interceptor reads `boomcard_refresh` first
    // when handling 401s, so leaving it behind would let a post-logout 401
    // silently refresh the session back into existence.
    if (typeof document !== 'undefined') {
      document.cookie = 'boomcard_session=; path=/; max-age=0; SameSite=Strict';
      document.cookie = 'boomcard_refresh=; path=/; max-age=0; SameSite=Strict';
    }

    // Clear API service token
    apiService.clearAuthToken();

    toast.success('Logged out successfully');
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
      const rawResponse = await apiService.post<any>('/auth/switch-account', {
        targetAccountId,
        refreshToken: existingRefreshToken,
      });

      const responseData = rawResponse?.data || rawResponse;
      const newToken = responseData?.accessToken || responseData?.token;
      const newRefreshToken = responseData?.refreshToken;
      const userPayload = responseData?.user;
      const switchable = responseData?.switchableAccounts as SwitchableAccount[] | undefined;

      if (!newToken || !userPayload) {
        throw new Error('Invalid switch response');
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
        createdAt: userPayload.createdAt ? new Date(userPayload.createdAt).getTime() : Date.now(),
        emailVerified: userPayload.emailVerified ?? true,
        avatar: userPayload.avatar,
      };
      setUser(nextUser);
      authStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser), inheritPersistent);
      if (Array.isArray(switchable)) setSwitchableAccounts(switchable);

      const label = nextUser.role === 'admin'
        ? 'admin account'
        : switchable?.find(s => s.id === nextUser.id)?.businessName || `${nextUser.firstName} ${nextUser.lastName}`.trim() || nextUser.email;
      toast.success(`Switched to ${label}`);
    } catch (error: any) {
      const message = error?.response?.data?.error?.message
        || error?.response?.data?.message
        || error?.message
        || 'Failed to switch account';
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
      const rawResponse = await apiService.post<any>('/auth/impersonate', {
        targetPartnerUserId,
        refreshToken: adminRefreshToken,
      });
      const responseData = rawResponse?.data || rawResponse;
      const newToken = responseData?.accessToken || responseData?.token;
      const newRefreshToken = responseData?.refreshToken;
      const userPayload = responseData?.user;
      const impersonationMeta = responseData?.impersonation as ImpersonationMeta | undefined;

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
        createdAt: userPayload.createdAt ? new Date(userPayload.createdAt).getTime() : Date.now(),
        emailVerified: userPayload.emailVerified ?? true,
        avatar: userPayload.avatar,
      };
      setUser(nextUser);
      authStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser), inheritPersistent);
      // Impersonation tokens intentionally carry no `ag`; clear any stale
      // sibling list from the admin session so the switcher hides.
      setSwitchableAccounts([]);
      setImpersonation(impersonationMeta);

      toast.success(`Impersonating ${nextUser.firstName} ${nextUser.lastName}`.trim() || `Impersonating ${nextUser.email}`);
    } catch (error: any) {
      const message = error?.response?.data?.error?.message
        || error?.response?.data?.message
        || error?.message
        || 'Failed to start impersonation';
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
      const rawResponse = await apiService.post<any>('/auth/stop-impersonate', {
        refreshToken: currentRefreshToken,
      });
      const responseData = rawResponse?.data || rawResponse;
      const newToken = responseData?.accessToken || responseData?.token;
      const newRefreshToken = responseData?.refreshToken;
      const userPayload = responseData?.user;
      const switchable = responseData?.switchableAccounts as SwitchableAccount[] | undefined;

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
        createdAt: userPayload.createdAt ? new Date(userPayload.createdAt).getTime() : Date.now(),
        emailVerified: userPayload.emailVerified ?? true,
        avatar: userPayload.avatar,
      };
      setUser(adminUser);
      authStorage.setItem(STORAGE_KEY, JSON.stringify(adminUser), inheritPersistent);
      setSwitchableAccounts(Array.isArray(switchable) ? switchable : []);
      setImpersonation(null);

      toast.success('Stopped impersonating');
    } catch (error: any) {
      const message = error?.response?.data?.error?.message
        || error?.response?.data?.message
        || error?.message
        || 'Failed to stop impersonation';
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
      // Call real API endpoint
      const updatedUser = await apiService.put<User>('/auth/profile', data);

      // Update user state
      setUser(updatedUser);

      toast.success('Profile updated successfully');
    } catch (error: any) {
      const message = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Update failed';
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
      // Validate new password
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

      toast.success('Password changed successfully');
    } catch (error: any) {
      const message = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Password change failed';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
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

        // Store tokens — OAuth has no rememberMe toggle, default persistent.
        authStorage.setItem(TOKEN_KEY, token, true);
        setToken(token);
        if (refreshToken) {
          persistRefreshToken(refreshToken, true);
        }

        // Set auth token in API service
        apiService.setAuthToken(token);

        // Set user state
        setUser(response.user);

        // Store auth data
        authStorage.setItem(STORAGE_KEY, JSON.stringify(response.user), true);

        // Capture sibling accounts if the OAuth response included them. For
        // providers that don't yet return the list, fall back to a fetch so
        // the switcher is populated on first render instead of waiting for
        // the next loadUser pass.
        if (Array.isArray(response.switchableAccounts)) {
          setSwitchableAccounts(response.switchableAccounts);
        } else {
          try {
            const switchResp = await apiService.get<any>('/auth/switchable-accounts');
            const accounts = (switchResp?.data ?? switchResp) as SwitchableAccount[];
            if (Array.isArray(accounts)) setSwitchableAccounts(accounts);
          } catch {
            // Non-fatal: session still usable without the switcher.
          }
        }

        toast.success(`Welcome, ${response.user.firstName}!`);
        return;
      } catch (apiError: any) {
        const apiMessage = apiError?.response?.data?.message || apiError?.response?.data?.error;
        if (apiMessage) throw new Error(apiMessage);
        console.error('OAuth API unavailable:', apiError.message || apiError);
        throw new Error('Server is currently unavailable. Please try again later.');
      }
    } catch (error: any) {
      const message = error.message || `${oauthData.provider} login failed`;
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

      const response = await apiService.post<any>('/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const updatedUser = response?.data || response;
      setUser(prev => prev ? { ...prev, avatar: updatedUser.avatar } : prev);

      toast.success('Profile photo updated');
    } catch (error: any) {
      const message = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Upload failed';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const removeAvatar = async (): Promise<void> => {
    if (!user) throw new Error('No user logged in');

    setIsLoading(true);
    try {
      await apiService.delete('/auth/avatar');
      setUser(prev => prev ? { ...prev, avatar: undefined } : prev);
      toast.success('Profile photo removed');
    } catch (error: any) {
      const message = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Remove failed';
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
    login,
    loginWithOAuth,
    register,
    logout,
    updateProfile,
    changePassword,
    uploadAvatar,
    removeAvatar,
    switchAccount,
    impersonate,
    stopImpersonating,
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
