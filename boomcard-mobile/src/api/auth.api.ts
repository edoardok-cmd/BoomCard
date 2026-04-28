/**
 * Authentication API
 *
 * Handles user authentication, registration, and profile management
 */

import apiClient from './client';
import StorageService from '../services/storage.service';
import { API_CONFIG } from '../constants/config';
import type {
  User,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  ApiResponse,
} from '../types';

export class AuthApi {
  /**
   * Login user
   */
  static async login(credentials: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await apiClient.post<AuthResponse>(
        API_CONFIG.ENDPOINTS.AUTH.LOGIN,
        { ...credentials, clientType: 'mobile' }
      );

      if (response.success && response.data) {
        // Backend returns tokens in response.data.data (nested structure)
        const authData = (response.data as any).data || response.data;

        // Validate tokens before storing
        if (!authData || typeof authData.accessToken !== 'string' || typeof authData.refreshToken !== 'string') {
          throw new Error('Invalid authentication response: missing or invalid tokens');
        }

        // Defense-in-depth: the server already blocks non-USER roles on mobile login,
        // but older servers may not. Refuse to persist tokens for partner/admin accounts.
        if (authData.user && authData.user.role && authData.user.role !== 'USER') {
          await StorageService.clearAll();
          throw new Error('This account is not a customer account. Please sign in at the partner dashboard.');
        }

        // Store tokens and user data
        await StorageService.setTokens(
          authData.accessToken,
          authData.refreshToken
        );

        if (authData.user) {
          await StorageService.setUserData(authData.user);
        }

        // Return unwrapped auth data for AuthContext
        return {
          success: true,
          data: authData,
        };
      }

      return response;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Register new user
   */
  static async register(data: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    const response = await apiClient.post<AuthResponse>(
      API_CONFIG.ENDPOINTS.AUTH.REGISTER,
      data
    );

    if (response.success && response.data) {
      // Backend returns tokens in response.data.data (nested structure)
      const authData = (response.data as any).data || response.data;

      // Validate tokens before storing
      if (!authData || typeof authData.accessToken !== 'string' || typeof authData.refreshToken !== 'string') {
        console.error('Invalid registration response structure:', JSON.stringify(response.data, null, 2));
        throw new Error('Invalid authentication response: missing or invalid tokens');
      }

      // Store tokens and user data
      await StorageService.setTokens(
        authData.accessToken,
        authData.refreshToken
      );

      if (authData.user) {
        await StorageService.setUserData(authData.user);
      }

      // Return unwrapped auth data for AuthContext
      return {
        success: true,
        data: authData,
      };
    }

    return response;
  }

  /**
   * Logout user
   */
  static async logout(): Promise<ApiResponse<void>> {
    const response = await apiClient.post<void>(
      API_CONFIG.ENDPOINTS.AUTH.LOGOUT
    );

    // Clear all stored data regardless of API response
    await StorageService.clearAll();

    return response;
  }

  /**
   * Get current user profile
   */
  static async getProfile(): Promise<ApiResponse<User>> {
    return await apiClient.get<User>(API_CONFIG.ENDPOINTS.AUTH.ME);
  }

  /**
   * Update user profile
   */
  static async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    const response = await apiClient.put<User>(
      API_CONFIG.ENDPOINTS.AUTH.PROFILE,
      data
    );

    if (response.success && response.data) {
      // Update stored user data
      await StorageService.setUserData(response.data);
    }

    return response;
  }

  /**
   * Change password
   */
  static async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<ApiResponse<void>> {
    return await apiClient.post<void>(
      API_CONFIG.ENDPOINTS.AUTH.CHANGE_PASSWORD,
      {
        currentPassword,
        newPassword,
      }
    );
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    return await StorageService.isAuthenticated();
  }

  /**
   * Get stored user data
   */
  static async getStoredUser(): Promise<User | null> {
    return await StorageService.getUserData();
  }

  /**
   * Permanently delete the authenticated user's account.
   * @param password - Current password required by the backend to confirm deletion.
   */
  static async deleteAccount(password: string): Promise<ApiResponse<void>> {
    const response = await apiClient.delete<void>(
      API_CONFIG.ENDPOINTS.AUTH.DELETE_ACCOUNT,
      { data: { password } }
    );
    if (response.success) {
      await StorageService.clearAll();
    }
    return response;
  }

  /**
   * Record a consent choice (GDPR audit trail).
   * type: 'email_marketing' | 'phone_marketing' | 'marketing' | 'terms' | 'privacy'
   */
  static async recordConsent(type: string, granted: boolean): Promise<ApiResponse<void>> {
    return apiClient.post<void>(API_CONFIG.ENDPOINTS.AUTH.CONSENT, { type, granted });
  }
}

export default AuthApi;
