/**
 * Cross-platform alert utility
 *
 * React Native's Alert.alert() doesn't support button callbacks on web.
 * This utility uses window.confirm/alert on web and Alert.alert on native.
 */

import { Alert, Platform } from 'react-native';

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

/**
 * Show a cross-platform alert dialog.
 * On web, uses window.confirm() for two-button dialogs, window.alert() for single-button.
 * On native, uses React Native's Alert.alert().
 */
export function crossPlatformAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  // Web fallback
  if (!buttons || buttons.length === 0 || buttons.length === 1) {
    // Simple alert with optional single button callback
    window.alert(message ? `${title}\n\n${message}` : title);
    const btn = buttons?.[0];
    if (btn?.onPress) btn.onPress();
    return;
  }

  // Two or more buttons: use confirm dialog
  // The cancel button is identified by style: 'cancel', otherwise the first button
  const cancelButton = buttons.find((b) => b.style === 'cancel') || buttons[0];
  const actionButton = buttons.find((b) => b !== cancelButton) || buttons[1];

  const confirmed = window.confirm(message ? `${title}\n\n${message}` : title);

  if (confirmed) {
    actionButton?.onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
}
