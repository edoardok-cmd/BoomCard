import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../services/api.service';
import { useLanguage } from './LanguageContext';

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

export interface AuthContextType extends AuthState {
  token: string | null;
  switchableAccounts: SwitchableAccount[];
  login: (credentials: LoginCredentials) => Promise<void>;
  loginWithOAuth: (oauthData: OAuthData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;
  switchAccount: (targetAccountId: string) => Promise<void>;
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

// Mirror the refresh token into the `boomcard_refresh` cookie that the axios
// 401-interceptor in api.service.ts reads from. If we only write to
// localStorage, the very first 401 after login/register/OAuth/switch fails
// to refresh because the interceptor finds no cookie. Every auth flow that
// returns a refresh token must go through this.
function persistRefreshToken(refreshToken: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (typeof document === 'undefined') return;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `boomcard_refresh=${refreshToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Strict${secure}`;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (stored && storedToken) return JSON.parse(stored);
    } catch { /* ignore parse errors */ }
    return null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [switchableAccounts, setSwitchableAccounts] = useState<SwitchableAccount[]>(() => {
    try {
      const raw = localStorage.getItem(SWITCHABLE_ACCOUNTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  // Keep the switchable-accounts list in sync with localStorage so hard
  // reloads preserve the switcher UI.
  useEffect(() => {
    if (switchableAccounts.length > 0) {
      localStorage.setItem(SWITCHABLE_ACCOUNTS_KEY, JSON.stringify(switchableAccounts));
    } else {
      localStorage.removeItem(SWITCHABLE_ACCOUNTS_KEY);
    }
  }, [switchableAccounts]);

  // Load user from localStorage and verify token on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedAuth = localStorage.getItem(STORAGE_KEY);
        const storedToken = localStorage.getItem(TOKEN_KEY);

        if (storedAuth && storedToken) {
          const userData = JSON.parse(storedAuth);

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
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            localStorage.removeItem(SWITCHABLE_ACCOUNTS_KEY);
            setUser(null);
            setSwitchableAccounts([]);
          }
        }
      } catch (error) {
        console.error('Failed to load user from storage:', error);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(SWITCHABLE_ACCOUNTS_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  // Save user to localStorage when it changes (skip during initial load to
  // avoid clearing boomcard_auth before loadUser can read it — race with StrictMode)
  useEffect(() => {
    if (isLoading) return;
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user, isLoading]);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    setIsLoading(true);

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

        // Store tokens
        localStorage.setItem(TOKEN_KEY, token);
        setToken(token);
        if (refreshToken) {
          persistRefreshToken(refreshToken);
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        setSwitchableAccounts(Array.isArray(switchable) ? switchable : []);

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

      // Store tokens
      localStorage.setItem(TOKEN_KEY, token);
      setToken(token);
      if (refreshToken) {
        persistRefreshToken(refreshToken);
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
      getCookie('boomcard_refresh') || localStorage.getItem(REFRESH_TOKEN_KEY);
    // Snapshot the access token too. The axios request interceptor reads the
    // access token lazily (inside a microtask) via getAccessToken(), so by
    // the time it runs the localStorage clear below has already happened and
    // the /auth/logout POST fires with no Authorization header. Passing the
    // header explicitly via config bypasses the interceptor's lookup and
    // closes the race regardless of whether /auth/logout ever starts
    // requiring auth.
    const accessTokenForRevoke = getCookie('boomcard_session') || localStorage.getItem(TOKEN_KEY);
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

    // Clear localStorage
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(SWITCHABLE_ACCOUNTS_KEY);

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
    const existingRefreshToken = cookieRefresh || localStorage.getItem(REFRESH_TOKEN_KEY);

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

      localStorage.setItem(TOKEN_KEY, newToken);
      setToken(newToken);
      if (newRefreshToken) {
        persistRefreshToken(newRefreshToken);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
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

        // Store tokens
        localStorage.setItem(TOKEN_KEY, token);
        setToken(token);
        if (refreshToken) {
          persistRefreshToken(refreshToken);
        }

        // Set auth token in API service
        apiService.setAuthToken(token);

        // Set user state
        setUser(response.user);

        // Store auth data
        localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));

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
    login,
    loginWithOAuth,
    register,
    logout,
    updateProfile,
    changePassword,
    uploadAvatar,
    removeAvatar,
    switchAccount,
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
