import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, clearSession } from '../lib/auth/session';

interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

class ApiService {
  private api: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value?: any) => void;
    reject: (reason?: any) => void;
  }> = [];

  constructor() {
    const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
    const timeout = import.meta.env.VITE_API_TIMEOUT || 30000;

    this.api = axios.create({
      baseURL,
      timeout: Number(timeout),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - Add auth token
    this.api.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = getAccessToken();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - Handle token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // If error is 401 and we haven't tried to refresh yet
        // Skip token-refresh / logout for mock tokens — they always 401 against the real backend
        const currentToken = localStorage.getItem('token');
        if (error.response?.status === 401 && !originalRequest._retry && !currentToken?.startsWith('mock-')) {
          if (this.isRefreshing) {
            // If already refreshing, queue this request
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then((token) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return this.api(originalRequest);
              })
              .catch((err) => {
                return Promise.reject(err);
              });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const { getCookie } = await import('../lib/auth/session').then(m => ({
              getCookie: () => {
                const value = `; ${document.cookie}`;
                const parts = value.split('; boomcard_refresh=');
                if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
                return null;
              }
            }));
            const refreshToken = getCookie();

            if (!refreshToken) {
              throw new Error('No refresh token');
            }

            // Attempt to refresh token
            const response = await axios.post<RefreshTokenResponse>(
              `${this.api.defaults.baseURL}/auth/refresh`,
              { refreshToken }
            );

            const { accessToken, refreshToken: newRefreshToken } = response.data;

            // Store new tokens in cookies
            const secure = location.protocol === 'https:' ? '; Secure' : '';
            document.cookie = `boomcard_session=${accessToken}; path=/; max-age=${15 * 60}; SameSite=Strict${secure}`;
            document.cookie = `boomcard_refresh=${newRefreshToken}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Strict${secure}`;

            // Update authorization header
            this.api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;

            // Process queued requests
            this.processQueue(null, accessToken);

            // Retry original request
            return this.api(originalRequest);
          } catch (refreshError) {
            // Refresh failed - log out user ONLY if they were authenticated
            this.processQueue(refreshError, null);
            const hadToken = !!getAccessToken();
            if (hadToken) {
              this.logout();
            }
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        // Handle other error status codes
        if (error.response?.status === 403) {
          console.error('Access forbidden:', error.response.data);
        } else if (error.response?.status === 404) {
          console.error('Resource not found:', error.config.url);
        } else if (error.response?.status >= 500) {
          console.error('Server error:', error.response.data);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Process queued requests after token refresh
   */
  private processQueue(error: any, token: string | null = null) {
    this.failedQueue.forEach((prom) => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });

    this.failedQueue = [];
  }

  /**
   * Logout user and redirect to login
   */
  private logout() {
    clearSession();
    window.location.href = '/login';
  }

  /**
   * GET request
   */
  async get<T>(url: string, params?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.get<T>(url, { params, ...config });
    return response.data;
  }

  /**
   * POST request
   */
  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.post<T>(url, data, config);
    return response.data;
  }

  /**
   * PUT request
   */
  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.put<T>(url, data, config);
    return response.data;
  }

  /**
   * PATCH request
   */
  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.patch<T>(url, data, config);
    return response.data;
  }

  /**
   * DELETE request
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.delete<T>(url, config);
    return response.data;
  }

  /**
   * Set auth token
   */
  setAuthToken(token: string) {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `boomcard_session=${token}; path=/; max-age=${15 * 60}; SameSite=Strict${secure}`;
    this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Clear auth token
   */
  clearAuthToken() {
    clearSession();
    delete this.api.defaults.headers.common['Authorization'];
  }

  /**
   * Get current auth token
   */
  getAuthToken(): string | null {
    return getAccessToken();
  }
}

export const apiService = new ApiService();