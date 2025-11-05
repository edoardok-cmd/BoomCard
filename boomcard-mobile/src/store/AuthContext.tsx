/**
 * Authentication Context
 *
 * Manages user authentication state and provides auth methods throughout the app
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AuthApi from '../api/auth.api';
import StorageService from '../services/storage.service';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  refetchUser: () => Promise<void>;
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
        throw new Error(response.error || 'Login failed');
      }
      return response.data;
    },
    onSuccess: (data: AuthResponse) => {
      setUser(data.user);
      queryClient.invalidateQueries();
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: async (data: RegisterRequest) => {
      const response = await AuthApi.register(data);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Registration failed');
      }
      return response.data;
    },
    onSuccess: (data: AuthResponse) => {
      setUser(data.user);
      queryClient.invalidateQueries();
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
    },
  });

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
    // HARDCODED TEST ACCOUNT - Bypasses network completely
    if (credentials.email === 'test@boomcard.com' && credentials.password === 'Test123!') {
      const testUser: User = {
        id: '68c81c5c-4aeb-4746-b097-1f71be92a68a',
        email: 'test@boomcard.com',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Store mock tokens
      await StorageService.setAccessToken('mock-access-token-test-user');
      await StorageService.setRefreshToken('mock-refresh-token-test-user');
      await StorageService.setUserData(testUser);

      // Set user state
      setUser(testUser);
      return;
    }

    // Normal login flow for other users
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

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    updateProfile,
    refetchUser,
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
