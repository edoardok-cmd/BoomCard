import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, clearSession } from '../lib/auth/session';
import * as authStorage from '../lib/auth/authStorage';

interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

class ApiService {
  private api: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value?: string | null) => void;
    reject: (reason?: unknown) => void;
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
        const currentToken = authStorage.getItem('token');
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
            const { getCookie } = await import('../lib/auth/session').then(() => ({
              getCookie: () => {
                const value = `; ${document.cookie}`;
                const parts = value.split('; boomcard_refresh=');
                if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
                return null;
              }
            }));
            const refreshToken = getCookie();

            if (!refreshToken) {
              this.isRefreshing = false;
              // Drain any concurrent 401s that piled into failedQueue while we
              // were checking for the refresh cookie — otherwise their callers
              // hang forever (the queue is only flushed on the success/catch
              // paths below, and we're returning early here).
              this.processQueue(error, null);
              // No refresh cookie. If the user has an access token (typical:
              // session expired and refresh cookie also gone), the session is
              // unrecoverable — logout so they see /login instead of a stuck
              // error toast. If there's no access token either, the call was
              // anonymous and a 401 just means the endpoint requires auth;
              // don't trigger a redirect for that.
              if (getAccessToken()) {
                this.logout();
              }
              return Promise.reject(error);
            }

            // Bare axios.post intentional: using this.api would go through this
            // same interceptor and deadlock (isRefreshing=true → queued forever).
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
  private processQueue(error: unknown, token: string | null = null) {
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
    localStorage.setItem('boomcard_logout_reason', 'session_expired');
    window.location.href = '/login';
  }

  /**
   * GET request
   */
  async get<T>(url: string, params?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.get<T>(url, { params, ...config });
    return response.data;
  }

  /**
   * POST request
   */
  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.post<T>(url, data, config);
    return response.data;
  }

  /**
   * PUT request
   */
  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.api.put<T>(url, data, config);
    return response.data;
  }

  /**
   * PATCH request
   */
  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
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
   * GET request returning a Blob (for file downloads). Includes auth header.
   */
  async getBlob(url: string, params?: unknown): Promise<{ data: Blob; filename: string }> {
    const response = await this.api.get<Blob>(url, { params, responseType: 'blob' });
    const disposition: string = response.headers['content-disposition'] ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : 'export';
    return { data: response.data, filename };
  }

  /**
   * Get current auth token
   */
  getAuthToken(): string | null {
    return getAccessToken();
  }
}

export const apiService = new ApiService();