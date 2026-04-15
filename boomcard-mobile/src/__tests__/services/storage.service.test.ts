/**
 * Unit Tests: StorageService
 *
 * Uses the expo-secure-store mock (__mocks__/expo-secure-store.js)
 * which provides an in-memory key-value store.
 */

import { StorageService } from '../../services/storage.service';
import type { User } from '../../types';

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    StorageService.resetForTesting();
    service = StorageService.getInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const a = StorageService.getInstance();
      const b = StorageService.getInstance();
      expect(a).toBe(b);
    });
  });

  // ─── Token Management ──────────────────────────────────────────

  describe('Token Management', () => {
    it('should store and retrieve access token', async () => {
      await service.setAccessToken('my-access-token');
      const token = await service.getAccessToken();
      expect(token).toBe('my-access-token');
    });

    it('should return null when no access token is stored', async () => {
      const token = await service.getAccessToken();
      expect(token).toBeNull();
    });

    it('should store and retrieve refresh token', async () => {
      await service.setRefreshToken('my-refresh-token');
      const token = await service.getRefreshToken();
      expect(token).toBe('my-refresh-token');
    });

    it('should store both tokens at once', async () => {
      await service.setTokens('access-123', 'refresh-456');
      expect(await service.getAccessToken()).toBe('access-123');
      expect(await service.getRefreshToken()).toBe('refresh-456');
    });

    it('should clear all tokens', async () => {
      await service.setTokens('a', 'r');
      await service.clearTokens();
      expect(await service.getAccessToken()).toBeNull();
      expect(await service.getRefreshToken()).toBeNull();
    });
  });

  // ─── User Data ────────────────────────────────────────────────

  describe('User Data', () => {
    const mockUser: User = {
      id: 'user-1',
      email: 'test@boomcard.bg',
      firstName: 'Test',
      lastName: 'User',
    } as User;

    it('should store and retrieve user data via JSON', async () => {
      await service.setUserData(mockUser);
      const user = await service.getUserData();
      expect(user).toEqual(mockUser);
    });

    it('should return null when no user data is stored', async () => {
      const user = await service.getUserData();
      expect(user).toBeNull();
    });

    it('should return null for corrupt JSON', async () => {
      // Manually write invalid JSON via the mock
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync('user_data', '{broken json');

      const user = await service.getUserData();
      expect(user).toBeNull();
    });

    it('should clear user data', async () => {
      await service.setUserData(mockUser);
      await service.clearUserData();
      expect(await service.getUserData()).toBeNull();
    });
  });

  // ─── Preferences ──────────────────────────────────────────────

  describe('Preferences', () => {
    it('should store and retrieve language', async () => {
      await service.setLanguage('bg');
      expect(await service.getLanguage()).toBe('bg');
    });

    it('should store and retrieve theme', async () => {
      await service.setTheme('dark');
      expect(await service.getTheme()).toBe('dark');
    });

    it('should default biometric to false', async () => {
      expect(await service.getBiometricEnabled()).toBe(false);
    });

    it('should store biometric preference', async () => {
      await service.setBiometricEnabled(true);
      expect(await service.getBiometricEnabled()).toBe(true);
    });

    it('should default push notifications to true', async () => {
      expect(await service.getPushNotifications()).toBe(true);
    });

    it('should store push notification preference', async () => {
      await service.setPushNotifications(false);
      expect(await service.getPushNotifications()).toBe(false);
    });

    it('should default email notifications to false', async () => {
      expect(await service.getEmailNotifications()).toBe(false);
    });

    it('should store email notification preference', async () => {
      await service.setEmailNotifications(true);
      expect(await service.getEmailNotifications()).toBe(true);
    });

    it('should default location services to true', async () => {
      expect(await service.getLocationServices()).toBe(true);
    });

    it('should store location services preference', async () => {
      await service.setLocationServices(false);
      expect(await service.getLocationServices()).toBe(false);
    });
  });

  // ─── Session Management ──────────────────────────────────────

  describe('Session Management', () => {
    it('should report authenticated when access token exists', async () => {
      await service.setAccessToken('token');
      expect(await service.isAuthenticated()).toBe(true);
    });

    it('should report not authenticated when no access token', async () => {
      expect(await service.isAuthenticated()).toBe(false);
    });

    it('should clear tokens and user data but preserve preferences', async () => {
      await service.setTokens('a', 'r');
      await service.setUserData({ id: '1', email: 'x', firstName: 'X', lastName: 'Y' } as User);
      await service.setLanguage('bg');
      await service.setTheme('dark');

      await service.clearAll();

      // Tokens and user data cleared
      expect(await service.getAccessToken()).toBeNull();
      expect(await service.getRefreshToken()).toBeNull();
      expect(await service.getUserData()).toBeNull();

      // Preferences preserved
      expect(await service.getLanguage()).toBe('bg');
      expect(await service.getTheme()).toBe('dark');
    });
  });
});
