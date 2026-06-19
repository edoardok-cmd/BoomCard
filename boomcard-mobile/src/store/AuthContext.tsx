/**
 * Authentication Context
 *
 * Manages user authentication state and provides auth methods throughout the app
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AuthApi from '../api/auth.api';
import StorageService from '../services/storage.service';
import { authLogoutEmitter } from '../api/client';
import SyncService from '../services/sync.service';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '../types';
import NotificationService from '../services/notification.service';
import { notificationsApi } from '../api/notifications.api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  refetchUser: () => Promise<void>;
  /** Activate a session directly from tokens + user data (e.g. complete-profile deeplink). */
  loginWithSession: (data: { user: User; accessToken: string; refreshToken: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // Load user from storage on mount
  useEffect(() => {
    loadUserFromStorage();
  }, []);

  // Listen for forced logout when token refresh fails
  useEffect(() => {
    const handleForceLogout = () => {
      setUser(null);
      queryClient.clear();
      SyncService.clear();
    };
    authLogoutEmitter.on('logout', handleForceLogout);
    return () => { authLogoutEmitter.off('logout', handleForceLogout); };
  }, [queryClient]);

  // Refresh user profile every 15 minutes to pick up subscription/plan changes
  useEffect(() => {
    if (!user) return;
    const intervalId = setInterval(async () => {
      try {
        const response = await AuthApi.getProfile();
        if (response.success && response.data) {
          setUser(response.data);
          await StorageService.setUserData(response.data);
        }
      } catch {
        // silent — network may be unavailable; will retry next interval
      }
    }, 15 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [!!user]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUserFromStorage = async () => {
    try {
      const isAuth = await AuthApi.isAuthenticated();
      if (isAuth) {
        const storedUser = await AuthApi.getStoredUser();
        setUser(storedUser);
      }
    } catch (error) {
      console.error('Error loading user from storage:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response = await AuthApi.login(credentials);
      if (!response.success || !response.data) {
        // Ensure error is a string, not an object
        const errorMessage = typeof response.error === 'string'
          ? response.error
          : (response.error ? JSON.stringify(response.error) : 'Login failed');
        throw new Error(errorMessage);
      }
      return response.data;
    },
    onSuccess: (data: AuthResponse) => {
      setUser(data.user);
      queryClient.clear(); // new session — remove all stale data from previous user
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: async (data: RegisterRequest) => {
      const response = await AuthApi.register(data);
      if (!response.success || !response.data) {
        // Ensure error is a string, not an object
        const errorMessage = typeof response.error === 'string'
          ? response.error
          : (response.error ? JSON.stringify(response.error) : 'Registration failed');
        throw new Error(errorMessage);
      }
      return response.data;
    },
    onSuccess: (data: AuthResponse) => {
      setUser(data.user);
      queryClient.clear(); // new session — remove all stale data
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await AuthApi.logout();
    },
    onSuccess: () => {
      setUser(null);
      queryClient.clear();
      SyncService.clear();
    },
  });

  // Silently refresh the Expo push token with the backend whenever a user
  // session becomes active (login, register, or restored from storage).
  // We only attempt once per session: if it fails we don't retry and the
  // user can always re-enable from Settings → Notifications.
  const pushRegisteredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    if (pushRegisteredForRef.current === user.id) return;
    if (Platform.OS === 'web') return;

    pushRegisteredForRef.current = user.id;

    (async () => {
      try {
        const perms = await NotificationService.checkPermissions();
        if (!perms.granted) return;

        const tokenResult = await NotificationService.registerForPushNotifications();
        if (!tokenResult) return;

        await notificationsApi.registerPushToken(tokenResult.token, Platform.OS);
      } catch {
        // Push registration is best-effort — never block auth flow
      }
    })();
  }, [user]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<User>) => {
      const response = await AuthApi.updateProfile(data);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Profile update failed');
      }
      return response.data;
    },
    onSuccess: (data: User) => {
      setUser(data);
    },
  });

  // Refetch user profile
  const refetchUser = async () => {
    const response = await AuthApi.getProfile();
    if (response.success && response.data) {
      setUser(response.data);
      await StorageService.setUserData(response.data);
    }
  };

  const login = async (credentials: LoginRequest) => {
    // All users go through normal login flow to get real JWT tokens
    await loginMutation.mutateAsync(credentials);
  };

  const register = async (data: RegisterRequest) => {
    await registerMutation.mutateAsync(data);
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const updateProfile = async (data: Partial<User>) => {
    await updateProfileMutation.mutateAsync(data);
  };

  /**
   * Establish an authenticated session directly from tokens + user data returned
   * by a public endpoint (e.g. POST /api/auth/complete-profile).
   * Mirrors the side-effects of a normal login: persist tokens, set user state,
   * and clear any stale query cache so the new session starts clean.
   */
  const loginWithSession = async (data: { user: User; accessToken: string; refreshToken: string }) => {
    await StorageService.setTokens(data.accessToken, data.refreshToken);
    await StorageService.setUserData(data.user);
    setUser(data.user);
    queryClient.clear();
    SyncService.clear();
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    updateProfile,
    refetchUser,
    loginWithSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
