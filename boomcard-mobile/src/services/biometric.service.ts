/**
 * Biometric Authentication Service
 *
 * Handles fingerprint and Face ID authentication using Expo Local Authentication
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export interface BiometricCapabilities {
  isAvailable: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  biometricType?: 'fingerprint' | 'facial' | 'iris' | 'unknown';
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  warning?: string;
}

export class BiometricService {
  private static instance: BiometricService;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): BiometricService {
    if (!BiometricService.instance) {
      BiometricService.instance = new BiometricService();
    }
    return BiometricService.instance;
  }

  /**
   * Check if biometric authentication is available and enrolled on device
   */
  async checkCapabilities(): Promise<BiometricCapabilities> {
    try {
      // Check if hardware supports biometric authentication
      const isAvailable = await LocalAuthentication.hasHardwareAsync();

      if (!isAvailable) {
        return {
          isAvailable: false,
          isEnrolled: false,
          supportedTypes: [],
        };
      }

      // Check if user has enrolled biometric credentials
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      // Get supported authentication types
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      // Determine biometric type
      let biometricType: BiometricCapabilities['biometricType'] = 'unknown';
      if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        biometricType = 'facial';
      } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        biometricType = 'fingerprint';
      } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        biometricType = 'iris';
      }

      return {
        isAvailable,
        isEnrolled,
        supportedTypes,
        biometricType,
      };
    } catch (error) {
      console.error('Error checking biometric capabilities:', error);
      return {
        isAvailable: false,
        isEnrolled: false,
        supportedTypes: [],
      };
    }
  }

  /**
   * Authenticate user with biometrics
   *
   * @param promptMessage - Custom message to show in the authentication prompt
   * @param cancelLabel - Label for cancel button (Android only)
   * @returns Authentication result
   */
  async authenticate(
    promptMessage?: string,
    cancelLabel?: string
  ): Promise<BiometricAuthResult> {
    try {
      // Check capabilities first
      const capabilities = await this.checkCapabilities();

      if (!capabilities.isAvailable) {
        return {
          success: false,
          error: 'Biometric authentication is not available on this device',
        };
      }

      if (!capabilities.isEnrolled) {
        return {
          success: false,
          error: 'No biometric credentials enrolled. Please add a fingerprint or face in your device settings.',
        };
      }

      // Get biometric type name for prompt
      const biometricTypeName = this.getBiometricTypeName(capabilities.biometricType);
      const defaultPrompt = `Authenticate with ${biometricTypeName} to login`;

      // Authenticate
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: promptMessage || defaultPrompt,
        cancelLabel: cancelLabel || 'Cancel',
        disableDeviceFallback: false, // Allow device PIN/password as fallback
        fallbackLabel: 'Use Password',
      });

      if (result.success) {
        return {
          success: true,
        };
      } else {
        // Handle different error types
        if (result.error === 'user_cancel') {
          return {
            success: false,
            error: 'Authentication cancelled by user',
          };
        } else if (result.error === 'system_cancel') {
          return {
            success: false,
            error: 'Authentication cancelled by system',
          };
        } else if (result.error === 'lockout') {
          return {
            success: false,
            error: 'Too many failed attempts. Please try again later.',
          };
        } else if (result.error === 'lockout_permanent') {
          return {
            success: false,
            error: 'Biometric authentication is locked. Please use your device password.',
          };
        } else if (result.error === 'not_enrolled') {
          return {
            success: false,
            error: 'No biometric credentials enrolled',
          };
        } else {
          return {
            success: false,
            error: result.error || 'Authentication failed',
          };
        }
      }
    } catch (error: any) {
      console.error('Biometric authentication error:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred during authentication',
      };
    }
  }

  /**
   * Get human-readable name for biometric type
   */
  private getBiometricTypeName(type?: BiometricCapabilities['biometricType']): string {
    switch (type) {
      case 'facial':
        return Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition';
      case 'fingerprint':
        return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
      case 'iris':
        return 'Iris Recognition';
      default:
        return 'Biometric';
    }
  }

  /**
   * Get security level of enrolled biometrics
   * Returns the security level: BIOMETRIC_STRONG, BIOMETRIC_WEAK, etc.
   */
  async getSecurityLevel(): Promise<LocalAuthentication.SecurityLevel | null> {
    try {
      if (Platform.OS === 'android') {
        return await LocalAuthentication.getEnrolledLevelAsync();
      }
      return null; // iOS doesn't provide this information
    } catch (error) {
      console.error('Error getting security level:', error);
      return null;
    }
  }

  /**
   * Cancel any ongoing authentication
   * Note: This is not supported on iOS
   */
  cancelAuthentication(): void {
    if (Platform.OS === 'android') {
      // Authentication auto-cancels on Android when component unmounts
    }
  }
}

// Export singleton instance
export default BiometricService.getInstance();
