/**
 * Secure Storage Service
 *
 * Handles secure storage of sensitive data (JWT tokens, user data)
 * Uses Expo SecureStore for encrypted storage
 */

import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants/config';
import type { User } from '../types';

export class StorageService {
  private static instance: StorageService;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  /**
   * Store value securely
   */
  private async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error(`Error storing ${key}:`, error);
      throw new Error(`Failed to store ${key}`);
    }
  }

  /**
   * Get stored value
   */
  private async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error(`Error retrieving ${key}:`, error);
      return null;
    }
  }

  /**
   * Delete stored value
   */
  private async deleteItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error(`Error deleting ${key}:`, error);
    }
  }

  // ==================== Token Management ====================

  /**
   * Store access token
   */
  async setAccessToken(token: string): Promise<void> {
    await this.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  }

  /**
   * Get access token
   */
  async getAccessToken(): Promise<string | null> {
    return await this.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  }

  /**
   * Store refresh token
   */
  async setRefreshToken(token: string): Promise<void> {
    await this.setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
  }

  /**
   * Get refresh token
   */
  async getRefreshToken(): Promise<string | null> {
    return await this.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  }

  /**
   * Store both access and refresh tokens
   */
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      this.setAccessToken(accessToken),
      this.setRefreshToken(refreshToken),
    ]);
  }

  /**
   * Clear all tokens
   */
  async clearTokens(): Promise<void> {
    await Promise.all([
      this.deleteItem(STORAGE_KEYS.ACCESS_TOKEN),
      this.deleteItem(STORAGE_KEYS.REFRESH_TOKEN),
    ]);
  }

  // ==================== User Data Management ====================

  /**
   * Store user data
   */
  async setUserData(user: User): Promise<void> {
    await this.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
  }

  /**
   * Get user data
   */
  async getUserData(): Promise<User | null> {
    const data = await this.getItem(STORAGE_KEYS.USER_DATA);
    if (data) {
      try {
        return JSON.parse(data) as User;
      } catch (error) {
        console.error('Error parsing user data:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * Clear user data
   */
  async clearUserData(): Promise<void> {
    await this.deleteItem(STORAGE_KEYS.USER_DATA);
  }

  // ==================== App Preferences ====================

  /**
   * Set language preference
   */
  async setLanguage(language: string): Promise<void> {
    await this.setItem(STORAGE_KEYS.LANGUAGE, language);
  }

  /**
   * Get language preference
   */
  async getLanguage(): Promise<string | null> {
    return await this.getItem(STORAGE_KEYS.LANGUAGE);
  }

  /**
   * Set theme preference
   */
  async setTheme(theme: string): Promise<void> {
    await this.setItem(STORAGE_KEYS.THEME, theme);
  }

  /**
   * Get theme preference
   */
  async getTheme(): Promise<string | null> {
    return await this.getItem(STORAGE_KEYS.THEME);
  }

  /**
   * Set biometric authentication preference
   */
  async setBiometricEnabled(enabled: boolean): Promise<void> {
    await this.setItem(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled.toString());
  }

  /**
   * Get biometric authentication preference
   */
  async getBiometricEnabled(): Promise<boolean> {
    const value = await this.getItem(STORAGE_KEYS.BIOMETRIC_ENABLED);
    return value === 'true';
  }

  // ==================== Session Management ====================

  /**
   * Check if user is authenticated (has valid tokens)
   */
  async isAuthenticated(): Promise<boolean> {
    const accessToken = await this.getAccessToken();
    return accessToken !== null;
  }

  /**
   * Clear all stored data (logout)
   */
  async clearAll(): Promise<void> {
    await Promise.all([
      this.clearTokens(),
      this.clearUserData(),
      // Keep language and theme preferences
    ]);
  }
}

// Export singleton instance
export default StorageService.getInstance();
