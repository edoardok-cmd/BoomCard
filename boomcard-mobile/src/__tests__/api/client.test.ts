/**
 * Unit Tests: API Client
 *
 * Tests the Axios API client singleton using the real implementation.
 * No mocks — configuration is inspected via the public getAxiosInstance() method.
 *
 * Tests that require a running backend (actual HTTP responses) belong in
 * integration tests, not here.
 */

import { ApiClient } from '../../api/client';
import { API_CONFIG } from '../../constants/config';

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    // Reset singleton between tests so each test gets a fresh instance
    ApiClient.resetForTesting();
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
    it('should use the base URL from API_CONFIG', () => {
      const axiosInstance = client.getAxiosInstance();
      expect(axiosInstance.defaults.baseURL).toBe(API_CONFIG.BASE_URL);
    });

    it('should use the timeout from API_CONFIG', () => {
      const axiosInstance = client.getAxiosInstance();
      expect(axiosInstance.defaults.timeout).toBe(API_CONFIG.TIMEOUT);
    });

    it('should set Content-Type to application/json', () => {
      const axiosInstance = client.getAxiosInstance();
      const headers = axiosInstance.defaults.headers as Record<string, any>;
      // axios v1.x stores per-method headers under the method key and request defaults
      // under the top-level object; either location is acceptable
      const contentType =
        headers['Content-Type'] ??
        headers['content-type'] ??
        headers.common?.['Content-Type'];
      expect(contentType).toBe('application/json');
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
});
