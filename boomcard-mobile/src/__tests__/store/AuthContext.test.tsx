/**
 * Unit Tests: AuthContext
 *
 * Tests authentication state management: init from storage, login/register/logout
 * mutations, forced logout via authLogoutEmitter, and the useAuth hook boundary.
 *
 * Mocks AuthApi, StorageService (default export), and SyncService.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../../store/AuthContext';
import AuthApi from '../../api/auth.api';
import { authLogoutEmitter } from '../../api/client';
import type { User } from '../../types';

// Mock the API and services
jest.mock('../../api/auth.api');
// Simple emitter defined inside factory (jest.mock is hoisted, so external vars are undefined)
jest.mock('../../api/client', () => {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {};
  return {
    authLogoutEmitter: {
      on(event: string, fn: (...args: any[]) => void) { (listeners[event] ??= []).push(fn); return this; },
      off(event: string, fn: (...args: any[]) => void) { listeners[event] = (listeners[event] ?? []).filter(l => l !== fn); return this; },
      emit(event: string, ...args: any[]) { (listeners[event] ?? []).forEach(l => l(...args)); return true; },
    },
  };
});
jest.mock('../../services/sync.service', () => ({
  __esModule: true,
  default: { clear: jest.fn() },
}));

const mockUser: User = {
  id: 'u-1',
  email: 'test@boomcard.bg',
  firstName: 'Test',
  lastName: 'User',
} as User;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no stored session
    (AuthApi.isAuthenticated as jest.Mock).mockResolvedValue(false);
    (AuthApi.getStoredUser as jest.Mock).mockResolvedValue(null);
  });

  // ─── Initialization ──────────────────────────────────────────

  describe('Initialization', () => {
    it('should start with isLoading=true then resolve', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should restore user from storage when authenticated', async () => {
      (AuthApi.isAuthenticated as jest.Mock).mockResolvedValue(true);
      (AuthApi.getStoredUser as jest.Mock).mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  // ─── Login ────────────────────────────────────────────────────

  describe('login', () => {
    it('should set user on successful login', async () => {
      (AuthApi.login as jest.Mock).mockResolvedValue({
        success: true,
        data: { user: mockUser, accessToken: 'tok', refreshToken: 'ref' },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.login({ email: 'test@boomcard.bg', password: 'pass' });
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should throw on failed login', async () => {
      (AuthApi.login as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expect(
        act(() => result.current.login({ email: 'x', password: 'y' }))
      ).rejects.toThrow('Invalid credentials');
    });
  });

  // ─── Register ─────────────────────────────────────────────────

  describe('register', () => {
    it('should set user on successful registration', async () => {
      (AuthApi.register as jest.Mock).mockResolvedValue({
        success: true,
        data: { user: mockUser, accessToken: 'tok', refreshToken: 'ref' },
      });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.register({
          email: 'test@boomcard.bg',
          password: 'pass',
          firstName: 'Test',
          lastName: 'User',
          acceptTerms: true,
        });
      });

      expect(result.current.user).toEqual(mockUser);
    });
  });

  // ─── Logout ──────────────────────────────────────────────────

  describe('logout', () => {
    it('should clear user on logout', async () => {
      // Start logged in
      (AuthApi.isAuthenticated as jest.Mock).mockResolvedValue(true);
      (AuthApi.getStoredUser as jest.Mock).mockResolvedValue(mockUser);
      (AuthApi.logout as jest.Mock).mockResolvedValue({ success: true });

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  // ─── Forced Logout (authLogoutEmitter) ────────────────────────

  describe('forced logout', () => {
    it('should clear user when authLogoutEmitter fires', async () => {
      (AuthApi.isAuthenticated as jest.Mock).mockResolvedValue(true);
      (AuthApi.getStoredUser as jest.Mock).mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

      act(() => {
        authLogoutEmitter.emit('logout');
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.isAuthenticated).toBe(false);
      });
    });
  });

  // ─── useAuth boundary ──────────────────────────────────────────

  describe('useAuth outside provider', () => {
    it('should throw when used outside AuthProvider', () => {
      // Render without the AuthProvider wrapper
      const queryClient = new QueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      expect(() => {
        renderHook(() => useAuth(), { wrapper });
      }).toThrow('useAuth must be used within an AuthProvider');
    });
  });
});
