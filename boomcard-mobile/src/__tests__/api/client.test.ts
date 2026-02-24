/**
 * Unit Tests: API Client
 *
 * Tests the Axios API client singleton with JWT auto-refresh.
 */

import axios from 'axios';
import { ApiClient } from '../../api/client';

// Mock axios
jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };

  return {
    create: jest.fn(() => mockAxiosInstance),
    post: jest.fn(),
    __mockInstance: mockAxiosInstance,
  };
});

// Mock StorageService
jest.mock('../../services/storage.service', () => ({
  __esModule: true,
  default: {
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
    setTokens: jest.fn(),
    clearAll: jest.fn(),
  },
}));

// Mock config
jest.mock('../../constants/config', () => ({
  API_CONFIG: {
    BASE_URL: 'http://localhost:3001/api',
    TIMEOUT: 30000,
    ENDPOINTS: {
      AUTH: {
        REFRESH: '/auth/refresh',
      },
    },
  },
}));

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton for tests
    (ApiClient as any).instance = undefined;
    client = ApiClient.getInstance();
  });

  describe('Singleton Pattern', () => {
    it('should create only one instance', () => {
      const instance1 = ApiClient.getInstance();
      const instance2 = ApiClient.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Configuration', () => {
    it('should create axios instance with correct base URL', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:3001/api',
          timeout: 30000,
        })
      );
    });

    it('should set Content-Type to application/json', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('Interceptors', () => {
    it('should set up request interceptor', () => {
      const mockInstance = (axios as any).__mockInstance;
      expect(mockInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('should set up response interceptor', () => {
      const mockInstance = (axios as any).__mockInstance;
      expect(mockInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('HTTP Methods', () => {
    it('should expose get method', () => {
      expect(typeof client.get).toBe('function');
    });

    it('should expose post method', () => {
      expect(typeof client.post).toBe('function');
    });

    it('should expose put method', () => {
      expect(typeof client.put).toBe('function');
    });

    it('should expose delete method', () => {
      expect(typeof client.delete).toBe('function');
    });

    it('should expose upload method', () => {
      expect(typeof client.upload).toBe('function');
    });
  });

  describe('GET Request', () => {
    it('should call axios get and return success response', async () => {
      const mockInstance = (axios as any).__mockInstance;
      mockInstance.get.mockResolvedValueOnce({
        data: { test: 'data' },
      });

      const result = await client.get('/test');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: 'data' });
    });

    it('should return error response on failure', async () => {
      const mockInstance = (axios as any).__mockInstance;
      mockInstance.get.mockRejectedValueOnce({
        message: 'Network error',
      });

      const result = await client.get('/test');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('POST Request', () => {
    it('should call axios post with data', async () => {
      const mockInstance = (axios as any).__mockInstance;
      mockInstance.post.mockResolvedValueOnce({
        data: { id: '123' },
      });

      const result = await client.post('/test', { name: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: '123' });
    });
  });
});
