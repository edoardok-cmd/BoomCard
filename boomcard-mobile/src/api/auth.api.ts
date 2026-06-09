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
   *
   * NOTE: this is an audit-only write — it does NOT update the user's preference
   * columns. Use getMarketingConsent()/updateMarketingConsent() to read and
   * persist the actual marketing-consent state (A1).
   */
  static async recordConsent(type: string, granted: boolean): Promise<ApiResponse<void>> {
    return apiClient.post<void>(API_CONFIG.ENDPOINTS.AUTH.CONSENT, { type, granted });
  }

  /**
   * A1 — read the caller's persisted marketing-consent state.
   */
  static async getMarketingConsent(): Promise<ApiResponse<{ marketingConsentEmail: boolean; marketingConsentPhone: boolean }>> {
    return apiClient.get(API_CONFIG.ENDPOINTS.AUTH.MARKETING_CONSENT);
  }

  /**
   * A1 — update the caller's marketing-consent columns (PUT). Pass either or both
   * channels; the backend stamps timestamps and mirrors the legacy aggregate flag.
   */
  static async updateMarketingConsent(
    payload: { marketingConsentEmail?: boolean; marketingConsentPhone?: boolean }
  ): Promise<ApiResponse<{ marketingConsentEmail: boolean; marketingConsentPhone: boolean }>> {
    return apiClient.put(API_CONFIG.ENDPOINTS.AUTH.MARKETING_CONSENT, payload);
  }

  /**
   * A4 — initiate an email change. Sends a verification code to the new address.
   */
  static async requestEmailChange(newEmail: string): Promise<ApiResponse<void>> {
    return apiClient.post<void>(API_CONFIG.ENDPOINTS.AUTH.CHANGE_EMAIL_REQUEST, { newEmail });
  }

  /**
   * A4 — confirm an email change with the code + current password.
   */
  static async confirmEmailChange(code: string, password: string): Promise<ApiResponse<User>> {
    const response = await apiClient.post<User>(API_CONFIG.ENDPOINTS.AUTH.CHANGE_EMAIL_VERIFY, { code, password });
    if (response.success && response.data) {
      const updated = (response.data as any).data ?? response.data;
      await StorageService.setUserData(updated);
    }
    return response;
  }

  /**
   * A9 — resend the email-verification link for the authenticated account.
   */
  static async resendEmailVerification(): Promise<ApiResponse<{ alreadyVerified: boolean }>> {
    return apiClient.post(API_CONFIG.ENDPOINTS.AUTH.RESEND_EMAIL_VERIFICATION);
  }

  /**
   * A9 — request a verification link by email when locked out of login (public).
   */
  static async requestEmailVerification(email: string): Promise<ApiResponse<void>> {
    return apiClient.post<void>(API_CONFIG.ENDPOINTS.AUTH.REQUEST_EMAIL_VERIFICATION, { email });
  }
}

export default AuthApi;
