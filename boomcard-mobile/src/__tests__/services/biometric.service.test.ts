/**
 * Unit Tests: BiometricService
 *
 * Uses the expo-local-authentication mock (__mocks__/expo-local-authentication.js).
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { BiometricService } from '../../services/biometric.service';

// Type helpers for mock functions
const mockHasHardware = LocalAuthentication.hasHardwareAsync as jest.Mock;
const mockIsEnrolled = LocalAuthentication.isEnrolledAsync as jest.Mock;
const mockSupportedTypes = LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock;
const mockAuthenticate = LocalAuthentication.authenticateAsync as jest.Mock;
const mockGetEnrolledLevel = LocalAuthentication.getEnrolledLevelAsync as jest.Mock;

describe('BiometricService', () => {
  let service: BiometricService;

  beforeEach(() => {
    BiometricService.resetForTesting();
    service = BiometricService.getInstance();
    jest.clearAllMocks();

    // Sensible defaults — hardware available, enrolled, fingerprint
    mockHasHardware.mockResolvedValue(true);
    mockIsEnrolled.mockResolvedValue(true);
    mockSupportedTypes.mockResolvedValue([LocalAuthentication.AuthenticationType.FINGERPRINT]);
    mockAuthenticate.mockResolvedValue({ success: true });
  });

  // ─── Capabilities ──────────────────────────────────────────────

  describe('checkCapabilities', () => {
    it('should return available and enrolled with fingerprint type', async () => {
      const caps = await service.checkCapabilities();

      expect(caps.isAvailable).toBe(true);
      expect(caps.isEnrolled).toBe(true);
      expect(caps.biometricType).toBe('fingerprint');
      expect(caps.supportedTypes).toContain(LocalAuthentication.AuthenticationType.FINGERPRINT);
    });

    it('should detect facial recognition type', async () => {
      mockSupportedTypes.mockResolvedValue([
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      ]);

      const caps = await service.checkCapabilities();
      expect(caps.biometricType).toBe('facial');
    });

    it('should return not available when hardware is missing', async () => {
      mockHasHardware.mockResolvedValue(false);

      const caps = await service.checkCapabilities();
      expect(caps.isAvailable).toBe(false);
      expect(caps.isEnrolled).toBe(false);
      expect(caps.supportedTypes).toEqual([]);
    });

    it('should return not enrolled when no biometrics are set up', async () => {
      mockIsEnrolled.mockResolvedValue(false);

      const caps = await service.checkCapabilities();
      expect(caps.isAvailable).toBe(true);
      expect(caps.isEnrolled).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockHasHardware.mockRejectedValue(new Error('Device error'));

      const caps = await service.checkCapabilities();
      expect(caps.isAvailable).toBe(false);
      expect(caps.isEnrolled).toBe(false);
    });
  });

  // ─── Authentication ────────────────────────────────────────────

  describe('authenticate', () => {
    it('should succeed on successful biometric auth', async () => {
      const result = await service.authenticate();
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return error when hardware not available', async () => {
      mockHasHardware.mockResolvedValue(false);

      const result = await service.authenticate();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not available/i);
    });

    it('should return error when not enrolled', async () => {
      mockIsEnrolled.mockResolvedValue(false);

      const result = await service.authenticate();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/no biometric credentials enrolled/i);
    });

    it('should handle user_cancel error', async () => {
      mockAuthenticate.mockResolvedValue({ success: false, error: 'user_cancel' });

      const result = await service.authenticate();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cancelled by user/i);
    });

    it('should handle system_cancel error', async () => {
      mockAuthenticate.mockResolvedValue({ success: false, error: 'system_cancel' });

      const result = await service.authenticate();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cancelled by system/i);
    });

    it('should handle lockout error', async () => {
      mockAuthenticate.mockResolvedValue({ success: false, error: 'lockout' });

      const result = await service.authenticate();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/too many failed attempts/i);
    });

    it('should handle not_enrolled error', async () => {
      mockAuthenticate.mockResolvedValue({ success: false, error: 'not_enrolled' });

      const result = await service.authenticate();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not enrolled/i);
    });

    it('should handle generic failure', async () => {
      mockAuthenticate.mockResolvedValue({ success: false, error: 'unknown_reason' });

      const result = await service.authenticate();
      expect(result.success).toBe(false);
      expect(result.error).toBe('unknown_reason');
    });

    it('should handle thrown exceptions', async () => {
      mockAuthenticate.mockRejectedValue(new Error('Crash'));

      const result = await service.authenticate();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Crash');
    });

    it('should pass custom prompt message', async () => {
      await service.authenticate('Confirm payment');

      expect(mockAuthenticate).toHaveBeenCalledWith(
        expect.objectContaining({ promptMessage: 'Confirm payment' })
      );
    });
  });

  // ─── Security Level ────────────────────────────────────────────

  describe('getSecurityLevel', () => {
    it('should return enrolled level on Android', async () => {
      (Platform as any).OS = 'android';
      mockGetEnrolledLevel.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC);

      const level = await service.getSecurityLevel();
      expect(level).toBe(LocalAuthentication.SecurityLevel.BIOMETRIC);
    });

    it('should return null on iOS', async () => {
      (Platform as any).OS = 'ios';

      const level = await service.getSecurityLevel();
      expect(level).toBeNull();
    });
  });
});
