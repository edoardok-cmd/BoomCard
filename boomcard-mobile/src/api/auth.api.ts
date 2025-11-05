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
    const response = await apiClient.post<AuthResponse>(
      API_CONFIG.ENDPOINTS.AUTH.LOGIN,
      credentials
    );

    if (response.success && response.data) {
      // Store tokens and user data
      await StorageService.setTokens(
        response.data.accessToken,
        response.data.refreshToken
      );
      await StorageService.setUserData(response.data.user);
    }

    return response;
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
      // Store tokens and user data
      await StorageService.setTokens(
        response.data.accessToken,
        response.data.refreshToken
      );
      await StorageService.setUserData(response.data.user);
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
}

export default AuthApi;
