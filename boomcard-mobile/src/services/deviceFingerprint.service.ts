import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import type { DeviceFingerprint } from '../types';

let cached: DeviceFingerprint | null = null;

/**
 * Collect a stable device fingerprint for fraud detection.
 * The result is cached in memory — device properties don't change mid-session.
 * The server SHA-256 hashes the canonical JSON; we only send raw components.
 */
export async function getDeviceFingerprint(): Promise<DeviceFingerprint> {
  if (cached) return cached;

  let installationId: string;
  if (Platform.OS === 'ios') {
    installationId = (await Application.getIosIdForVendorAsync()) || 'unknown-ios';
  } else if (Platform.OS === 'android') {
    installationId = Application.getAndroidId() || 'unknown-android';
  } else {
    // Web fallback — no stable device ID available
    installationId = 'web';
  }

  cached = {
    installationId,
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    appVersion:
      Application.nativeApplicationVersion ||
      Constants.expoConfig?.version ||
      '0.0.0',
  };

  return cached;
}
