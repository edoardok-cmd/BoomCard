/**
 * API Client
 *
 * Axios client with JWT authentication and automatic token refresh
 * Handles all HTTP requests to the BoomCard backend
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import { API_CONFIG } from '../constants/config';
import StorageService from '../services/storage.service';
import type { ApiResponse, ApiError } from '../types';
// Minimal browser-safe emitter (replaces Node's `events` module which is unavailable on web)
class SimpleEmitter {
  private listeners: Record<string, Array<(...args: any[]) => void>> = {};
  on(event: string, listener: (...args: any[]) => void) {
    (this.listeners[event] ??= []).push(listener);
    return this;
  }
  off(event: string, listener: (...args: any[]) => void) {
    this.listeners[event] = (this.listeners[event] ?? []).filter(l => l !== listener);
    return this;
  }
  emit(event: string, ...args: any[]) {
    (this.listeners[event] ?? []).forEach(l => l(...args));
    return true;
  }
}

// Emits 'logout' when a token refresh fails — AuthContext listens to auto-clear user state
export const authLogoutEmitter = new SimpleEmitter();

export class ApiClient {
  private static instance: ApiClient;
  private axiosInstance: AxiosInstance;
  private isRefreshing: boolean = false;
  private refreshSubscribers: Array<(token: string) => void> = [];
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  private readonly MAX_REFRESH_RETRIES = 3;

  private constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  /** @internal Reset singleton for testing */
  public static resetForTesting(): void {
    ApiClient.instance = undefined as unknown as ApiClient;
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor - add JWT token to headers
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const token = await StorageService.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - handle errors and token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & {
          _retry?: boolean;
        };

        // Skip token refresh for auth endpoints (401 = invalid credentials, not expired token)
        const requestUrl = originalRequest.url || '';
        const isAuthEndpoint = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

        // Handle 401 Unauthorized - token expired (but not on auth endpoints)
        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
          if (this.isRefreshing) {
            // If already refreshing, queue the request
            return new Promise((resolve) => {
              this.refreshSubscribers.push((token: string) => {
                if (originalRequest.headers) {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                }
                resolve(this.axiosInstance(originalRequest));
              });
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const newToken = await this.refreshAccessToken();
            this.isRefreshing = false;

            // Retry all queued requests with new token
            this.refreshSubscribers.forEach((callback) => callback(newToken));
            this.refreshSubscribers = [];

            // Retry original request
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            return this.axiosInstance(originalRequest);
          } catch (refreshError) {
            this.isRefreshing = false;
            this.refreshSubscribers = [];

            // Refresh failed - clear all stored data and notify AuthContext
            await StorageService.clearAll();
            authLogoutEmitter.emit('logout');
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }

  /**
   * Refresh access token using refresh token, with retry on transient network errors
   */
  private async refreshAccessToken(retryCount = 0): Promise<string> {
    const refreshToken = await StorageService.getRefreshToken();

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH.REFRESH}`,
        { refreshToken }
      );

      // Backend returns tokens in response.data.data
      const { accessToken, refreshToken: newRefreshToken } = response.data.data || response.data;

      // Store new tokens
      await StorageService.setTokens(accessToken, newRefreshToken);

      return accessToken;
    } catch (error: any) {
      // Only retry on network errors (no response), not on 401/403 (invalid token)
      const isNetworkError = !error.response;
      if (isNetworkError && retryCount < this.MAX_REFRESH_RETRIES) {
        const delay = this.RETRY_DELAY * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.refreshAccessToken(retryCount + 1);
      }
      console.error('Token refresh failed:', error);
      throw new Error('Session expired. Please login again.');
    }
  }

  /**
   * Handle API errors
   */
  private handleError(error: AxiosError): ApiError {
    if (error.response) {
      // Server responded with error
      const data = error.response.data as any;
      const statusCode = error.response.status;

      // Detect tier-access denial: backend returns 404 (not 403) to avoid
      // leaking existence of restricted resources. Surface a clear message.
      const rawMessage: string =
        typeof data?.message === 'string' ? data.message :
        typeof data?.error === 'string' ? data.error :
        typeof data?.error?.message === 'string' ? data.error.message :
        'Server error occurred';
      // Subscription-state prefixes must reach the screen-level handlers that
      // show the renewal CTA. Check these BEFORE the generic tier-block rewrite
      // so a future 403 on a subscription-blocked scan still fires the CTA
      // rather than collapsing to the generic "higher plan required" copy.
      const isSubscriptionStateError =
        rawMessage.startsWith('SUBSCRIPTION_FAILED_PAYMENT') ||
        rawMessage.startsWith('SUBSCRIPTION_PAST_DUE') ||
        rawMessage.startsWith('SUBSCRIPTION_INACTIVE');

      const isTierBlock =
        !isSubscriptionStateError &&
        (statusCode === 403 ||
        (statusCode === 404 && rawMessage.toLowerCase().includes('subscription')));
      const isUpgradeRequired =
        rawMessage.toLowerCase().includes('upgrade') ||
        rawMessage.toLowerCase().includes('subscription does not include');

      const message = isSubscriptionStateError
        ? rawMessage // preserve prefix so scanner/upload CTA handlers can match it
        : isUpgradeRequired
        ? rawMessage // pass the server's upgrade prompt through unchanged
        : isTierBlock
          ? 'This content requires a higher subscription plan.'
          : rawMessage;

      return {
        message,
        code: isUpgradeRequired || isTierBlock ? 'TIER_ACCESS_DENIED' : data?.code,
        statusCode,
        details: data?.details,
      };
    } else if (error.request) {
      // No response received - could be network error or server sleeping
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
      return {
        message: isTimeout
          ? 'Request timed out. The server may be waking up, please try again.'
          : 'Network error. Please check your connection and try again.',
        code: isTimeout ? 'TIMEOUT_ERROR' : 'NETWORK_ERROR',
      };
    } else {
      // Request setup error
      return {
        message: error.message || 'An unexpected error occurred',
        code: 'REQUEST_ERROR',
      };
    }
  }

  /**
   * Retry a request with exponential backoff
   */
  private async retryRequest<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    retries: number = 0
  ): Promise<AxiosResponse<T>> {
    try {
      return await requestFn();
    } catch (error) {
      // The response interceptor transforms AxiosError → ApiError before reaching here,
      // so we check the code it assigns rather than the absent .response property.
      const apiError = error as ApiError;
      const isRetryable = apiError.code === 'NETWORK_ERROR' || apiError.code === 'TIMEOUT_ERROR';
      const shouldRetry = isRetryable && retries < this.MAX_RETRIES;

      if (shouldRetry) {
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * Math.pow(2, retries)));
        return this.retryRequest(requestFn, retries + 1);
      }

      throw error;
    }
  }

  // ==================== HTTP Methods ====================

  /**
   * GET request
   */
  async get<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.retryRequest(() =>
        this.axiosInstance.get(url, config)
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      const apiError = error as ApiError;
      return {
        success: false,
        error: apiError.message,
      };
    }
  }

  /**
   * POST request
   */
  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.retryRequest(() =>
        this.axiosInstance.post(url, data, config)
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      const apiError = error as ApiError;
      return {
        success: false,
        error: apiError.message,
      };
    }
  }

  /**
   * PUT request
   */
  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.retryRequest(() =>
        this.axiosInstance.put(url, data, config)
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      const apiError = error as ApiError;
      return {
        success: false,
        error: apiError.message,
      };
    }
  }

  async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.retryRequest(() =>
        this.axiosInstance.patch(url, data, config)
      );
      return { success: true, data: response.data };
    } catch (error) {
      const apiError = error as ApiError;
      return { success: false, error: apiError.message };
    }
  }

  /**
   * DELETE request
   */
  async delete<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.retryRequest(() =>
        this.axiosInstance.delete(url, config)
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      const apiError = error as ApiError;
      return {
        success: false,
        error: apiError.message,
      };
    }
  }

  /**
   * Upload file with multipart/form-data.
   * No retry — uploads are not idempotent; retrying after a silent server-side success
   * would create duplicate records.
   */
  async upload<T = any>(
    url: string,
    formData: FormData,
    onUploadProgress?: (progressEvent: any) => void
  ): Promise<ApiResponse<T>> {
    try {
      const response: AxiosResponse<T> = await this.axiosInstance.post(url, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress,
      });
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      const apiError = error as ApiError;
      return {
        success: false,
        error: apiError.message,
      };
    }
  }

  /**
   * Get raw axios instance for custom requests
   */
  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

// Export singleton instance
export default ApiClient.getInstance();
