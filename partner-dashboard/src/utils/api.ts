import * as authStorage from '../lib/auth/authStorage';

interface ApiErrorShape {
  response?: {
    status?: number;
    data?: { message?: string };
  };
}

export const handleApiError = (error: unknown): string => {
  const err = error as ApiErrorShape;
  if (err.response?.data?.message) {
    return err.response.data.message;
  }

  if (err.response?.status === 404) {
    return 'Ресурсът не е намерен';
  }

  if (err.response?.status === 401) {
    return 'Нямате право на достъп';
  }

  if (err.response?.status === 500) {
    return 'Сървърна грешка. Моля, опитайте отново';
  }

  return 'Възникна неочаквана грешка';
};

export const getAuthHeaders = (): Record<string, string> => {
  const token = authStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const buildApiUrl = (endpoint: string, params?: Record<string, unknown>): string => {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || '/api';
  const url = new URL(endpoint, baseUrl);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  
  return url.toString();
};

export const parseApiResponse = <T>(response: { data?: T } | T): T => {
  if (response && typeof response === 'object' && 'data' in response && response.data !== undefined) {
    return response.data as T;
  }
  return response as T;
};