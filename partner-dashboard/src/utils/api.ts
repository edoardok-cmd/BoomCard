export const handleApiError = (error: any): string => {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  
  if (error.response?.status === 404) {
    return 'Ресурсът не е намерен';
  }
  
  if (error.response?.status === 401) {
    return 'Нямате право на достъп';
  }
  
  if (error.response?.status === 500) {
    return 'Сървърна грешка. Моля, опитайте отново';
  }
  
  return 'Възникна неочаквана грешка';
};

export const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const buildApiUrl = (endpoint: string, params?: Record<string, any>): string => {
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

export const parseApiResponse = <T>(response: any): T => {
  if (response.data) {
    return response.data;
  }
  return response;
};