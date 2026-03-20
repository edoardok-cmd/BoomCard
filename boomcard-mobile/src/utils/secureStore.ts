/**
 * SecureStore wrapper - Cross-platform
 *
 * Uses localStorage on web, expo-secure-store on native.
 * This avoids the "getValueWithKeyAsync is not a function" error
 * that occurs when expo-secure-store runs in the browser.
 */

import { Platform } from 'react-native';

// On web, use sessionStorage (cleared when tab closes, not persisted across sessions)
// to reduce exposure compared to localStorage. Native uses expo-secure-store.
export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
  const SecureStore = require('expo-secure-store');
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Storage quota exceeded or unavailable
    }
    return;
  }
  const SecureStore = require('expo-secure-store');
  return SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore
    }
    return;
  }
  const SecureStore = require('expo-secure-store');
  return SecureStore.deleteItemAsync(key);
}
