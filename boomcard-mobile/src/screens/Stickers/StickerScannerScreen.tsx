/**
 * Sticker Scanner Screen
 *
 * Step 1 of 2: Scan venue QR sticker with GPS validation.
 * After a valid scan, navigates directly to the receipt scanner (Step 2).
 */

import React, { useState, useEffect, useRef } from 'react';
import { Platform, View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { HelperText } from 'react-native-paper';
import { CameraView, Camera } from 'expo-camera';
import * as Location from 'expo-location';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { crossPlatformAlert } from '../../utils/alert';
import { useTranslation } from 'react-i18next';
import notificationService from '../../services/notification.service';
import { getDeviceFingerprint } from '../../services/deviceFingerprint.service';
import StickersApi from '../../api/stickers.api';
import { useFeatureFlags } from '../../store/MobileConfigContext';
import { useAuth } from '../../store/AuthContext';
import { isAccountPaused, isAccountBlocked } from '../../components/AccountStatusBanner';

export default function StickerScannerScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { stickerScan: stickerScanEnabled } = useFeatureFlags();
  const isFocused = useIsFocused();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraPermanentlyDenied, setCameraPermanentlyDenied] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [locating, setLocating] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraReadyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const permissionRequestInProgress = useRef(false);
  const permissionChecked = useRef(false);

  useEffect(() => {
    requestPermissions();
  }, []);

  // __DEV__-gated Playwright hook: tests drive the scanner without a real camera.
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== 'web') return;
    const w = globalThis as any;
    w.__BOOM_TEST_BYPASS_PERM__ = () => setHasPermission(true);
    w.__BOOM_TEST_SCAN__ = (qrData: string) => { void handleBarCodeScanned({ data: qrData }); };
    return () => { delete w.__BOOM_TEST_SCAN__; delete w.__BOOM_TEST_BYPASS_PERM__; };
  }, []);

  useEffect(() => {
    if (isFocused) {
      setScanned(false);
      cameraReadyTimeout.current = setTimeout(() => {
        setCameraReady(true);
      }, 2000);
    } else {
      setCameraReady(false);
      if (cameraReadyTimeout.current) {
        clearTimeout(cameraReadyTimeout.current);
        cameraReadyTimeout.current = null;
      }
    }
    return () => {
      if (cameraReadyTimeout.current) clearTimeout(cameraReadyTimeout.current);
    };
  }, [isFocused]);

  const requestPermissions = async () => {
    if (permissionRequestInProgress.current) return;
    if (permissionChecked.current && cameraPermanentlyDenied) return;
    permissionRequestInProgress.current = true;
    try {
      let cameraGranted: boolean;
      if (Platform.OS === 'web') {
        const existing = await Camera.getCameraPermissionsAsync();
        if (existing.status === 'granted') {
          cameraGranted = true;
        } else if (!permissionChecked.current || existing.canAskAgain) {
          const result = await Camera.requestCameraPermissionsAsync();
          cameraGranted = result.status === 'granted';
          if (!result.canAskAgain) setCameraPermanentlyDenied(true);
        } else {
          cameraGranted = false;
          setCameraPermanentlyDenied(true);
        }
      } else {
        const result = await Camera.requestCameraPermissionsAsync();
        cameraGranted = result.status === 'granted';
      }

      const locationResult = await Location.requestForegroundPermissionsAsync();
      permissionChecked.current = true;
      setHasPermission(cameraGranted && locationResult.status === 'granted');
    } catch {
      permissionChecked.current = true;
      setHasPermission(false);
    } finally {
      permissionRequestInProgress.current = false;
    }
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || locating) return;
    setScanned(true);

    // R3 — pre-scan account-status guard (spec §1.2/§13.1). A paused (Inactive/
    // Suspended) or archived account cannot scan, even with an active subscription.
    if (isAccountBlocked(user?.status)) {
      crossPlatformAlert(
        t('common.info', 'Информация'),
        t('account.archivedSub', 'Достъпът до този профил е прекратен. Свържете се с поддръжката за съдействие.')
      );
      setScanned(false);
      return;
    }
    if (isAccountPaused(user?.status)) {
      crossPlatformAlert(
        t('common.info', 'Информация'),
        t('stickers.accountPaused', 'Профилът Ви е спрян. Сканирането е недостъпно, докато не бъде възстановен. Свържете се с поддръжката.'),
        [
          { text: t('common.cancel', 'Откажи'), style: 'cancel' },
          { text: t('account.contactSupport', 'Поддръжка'), onPress: () => (navigation as any).navigate('HelpScreen') },
        ]
      );
      setScanned(false);
      return;
    }

    // Validate BOOM sticker QR format
    let stickerId: string;
    let payloadVenueId: string | undefined;
    let payloadVersion: string;
    try {
      const qrPayload = JSON.parse(data);
      if (qrPayload.type !== 'BOOM_STICKER' || !qrPayload.stickerId) {
        crossPlatformAlert(t('common.error'), t('stickers.invalidQRCode', 'Not a valid BOOM sticker QR code'));
        setScanned(false);
        return;
      }
      // Finding #5: reject QR payloads with version < 1.0. Missing version is treated as 1.0
      // for backward-compat with stickers printed before the field was added. Server performs
      // the same check as defence-in-depth.
      const ver = typeof qrPayload.version === 'string' ? qrPayload.version : '1.0';
      const [major] = ver.split('.').map((n: string) => parseInt(n, 10));
      if (!(major >= 1)) {
        crossPlatformAlert(t('common.error'), t('stickers.outdatedQr', 'This BOOM sticker is outdated. Please ask the venue for a new one.'));
        setScanned(false);
        return;
      }
      stickerId = qrPayload.stickerId;
      payloadVenueId = typeof qrPayload.venueId === 'string' ? qrPayload.venueId : undefined;
      payloadVersion = ver;
    } catch {
      crossPlatformAlert(t('common.error'), t('stickers.invalidQRCode', 'Not a valid BOOM sticker QR code'));
      setScanned(false);
      return;
    }

    // Get GPS location immediately — used for session registration and passed to Step 2
    setLocating(true);
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Register the BOOM session with the server at scan time (spec §6 Step 3).
      // This records the exact time, venue, device, and GPS coordinates immediately.
      // The session is completed with the bill amount when the receipt is submitted.
      const fp = await getDeviceFingerprint();
      const sessionRes = await StickersApi.createSession({
        stickerId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        // Forward payload venueId + version so server can reject tampered/outdated QRs (Finding #4 + #5).
        payloadVenueId,
        payloadVersion,
        deviceFingerprint: fp,
      } as any);

      if (!sessionRes.success || !sessionRes.data?.sessionId) {
        // Spec §5.3: when the partner is in Inactive/Suspended/Archived state,
        // the server raises a PARTNER_NOT_ACCEPTING marker so we can surface the
        // exact Bulgarian copy the spec mandates instead of the generic error.
        // Spec §4.2 v1.1: SUBSCRIPTION_FAILED_PAYMENT / SUBSCRIPTION_PAST_DUE
        // markers surface the renewal CTA so the user knows scanning is blocked
        // until they restore the subscription.
        const rawErr = sessionRes.error || '';
        if (rawErr.includes('ACCOUNT_ARCHIVED')) {
          // R3 — server-side account-status rejection (archived). Mirrors the
          // pre-scan guard above for the case where status changed mid-session.
          crossPlatformAlert(
            t('common.info', 'Информация'),
            t('account.archivedSub', 'Достъпът до този профил е прекратен. Свържете се с поддръжката за съдействие.')
          );
        } else if (rawErr.includes('ACCOUNT_INACTIVE') || rawErr.includes('ACCOUNT_PAUSED') || rawErr.includes('ACCOUNT_SUSPENDED')) {
          crossPlatformAlert(
            t('common.info', 'Информация'),
            t('stickers.accountPaused', 'Профилът Ви е спрян. Сканирането е недостъпно, докато не бъде възстановен. Свържете се с поддръжката.'),
            [
              { text: t('common.cancel', 'Откажи'), style: 'cancel' },
              { text: t('account.contactSupport', 'Поддръжка'), onPress: () => (navigation as any).navigate('HelpScreen') },
            ]
          );
        } else if (rawErr.includes('PARTNER_NOT_ACCEPTING')) {
          crossPlatformAlert(
            t('common.info', 'Информация'),
            t(
              'stickers.partnerNotAccepting',
              'Този обект временно не приема BoomCard транзакции. Опитайте отново по-късно или вижте близки активни обекти.'
            )
          );
        } else if (rawErr.includes('SUBSCRIPTION_REQUIRED')) {
          // BC-USER-SPEC-FIX-005: requireActiveSubscription throws SUBSCRIPTION_REQUIRED
          // (HTTP 402) for users without an active/trialing/within-period subscription —
          // this also covers never-subscribed users, so the copy invites choosing a plan
          // rather than implying a failed payment. Routes to the same renewal CTA.
          crossPlatformAlert(
            t('common.info', 'Информация'),
            t(
              'stickers.subscriptionRequired',
              'За да използвате тази функция, изберете план и завършете плащането от менюто „Абонамент и плащания".'
            ),
            [
              { text: t('common.cancel', 'Откажи'), style: 'cancel' },
              {
                text: t('stickers.renewSubscription', 'Възобнови абонамент'),
                onPress: () => (navigation as any).navigate('SubscriptionManagement'),
              },
            ]
          );
        } else if (rawErr.includes('SUBSCRIPTION_FAILED_PAYMENT') || rawErr.includes('SUBSCRIPTION_PAST_DUE') || rawErr.includes('SUBSCRIPTION_INACTIVE')) {
          crossPlatformAlert(
            t('common.info', 'Информация'),
            t(
              'stickers.subscriptionFailedPayment',
              'Абонаментът Ви е в статус „неуспешно плащане". Възобновете го от менюто „Абонамент и плащания", за да продължите да сканирате бележки.'
            ),
            [
              { text: t('common.cancel', 'Откажи'), style: 'cancel' },
              {
                text: t('stickers.renewSubscription', 'Възобнови абонамент'),
                onPress: () => (navigation as any).navigate('SubscriptionManagement'),
              },
            ]
          );
        } else {
          crossPlatformAlert(t('common.error'), rawErr || t('stickers.scanFailed', 'Failed to scan sticker'));
        }
        setScanned(false);
        return;
      }

      const sessionId = sessionRes.data.sessionId;

      // Schedule a 30-minute local reminder per spec §6:
      // "30 minutes after activating the table, the app must send a push message
      //  reminding the subscriber not to forget to scan the receipt."
      const reminderTitle = t('stickers.scanReminderTitle');
      const reminderBody = t('stickers.scanReminderBody');
      const notificationId = await notificationService.scheduleLocalNotification(
        reminderTitle,
        reminderBody,
        { type: 'RECEIPT_REMINDER', stickerId, sessionId },
        30 * 60
      );

      (navigation as any).navigate('UploadReceipt', {
        stickerId,
        sessionId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        reminderNotificationId: notificationId,
        sessionCreatedAt: new Date().toISOString(),
      });
    } catch {
      crossPlatformAlert(t('common.error'), t('stickers.locationError'));
      setScanned(false);
    } finally {
      setLocating(false);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <Text>{t('stickers.requestingPermissions')}</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('stickers.permissionsRequired')}</Text>
        <HelperText type="info" style={styles.helperText}>
          {cameraPermanentlyDenied
            ? t('stickers.cameraBlockedHelp', 'Camera access is blocked. Please allow camera access in your browser settings and reload the page.')
            : t('stickers.permissionsHelp')}
        </HelperText>
        {!cameraPermanentlyDenied && (
          <Button mode="contained" onPress={requestPermissions} style={styles.permissionButton}>
            {t('stickers.grantPermissions')}
          </Button>
        )}
      </View>
    );
  }

  if (!stickerScanEnabled) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#605a50', textAlign: 'center' }}>
          {t('common.featureUnavailable', 'Тази функция временно не е налична.')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused ? (
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onCameraReady={() => {
            if (cameraReadyTimeout.current) {
              clearTimeout(cameraReadyTimeout.current);
              cameraReadyTimeout.current = null;
            }
            setCameraReady(true);
          }}
          onMountError={(error) => {
            crossPlatformAlert(t('common.error'), 'Camera failed to start: ' + error.message);
          }}
        >
          {(!cameraReady || locating) && (
            <View style={styles.cameraLoadingOverlay}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.loadingText}>
                {locating
                  ? t('stickers.gettingLocation', 'Getting your location...')
                  : t('stickers.startingCamera', 'Starting camera...')}
              </Text>
            </View>
          )}

          <View style={styles.overlay}>
            <View style={styles.darkTop} />
            <View style={styles.middleRow}>
              <View style={styles.darkSide} />
              <View style={styles.scanArea}>
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
              </View>
              <View style={styles.darkSide} />
            </View>
            <View style={styles.darkBottom}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{t('stickers.step1of2', 'STEP 1 OF 2')}</Text>
              </View>
              <Text style={styles.instructions}>{t('stickers.scanInstructions')}</Text>
              <Text style={styles.stepHint}>
                {t('stickers.step1Hint', "After scanning the QR, you'll photograph your receipt to earn cashback")}
              </Text>
            </View>
          </View>
        </CameraView>
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('stickers.camerapaused', 'Camera paused')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { textAlign: 'center', marginBottom: 16, fontSize: 16 },
  helperText: { textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
  permissionButton: { marginTop: 8 },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  darkTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  middleRow: { flexDirection: 'row' },
  darkSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  scanArea: { width: 250, height: 250 },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: 'white' },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  darkBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    paddingTop: 32,
  },
  stepBadge: {
    backgroundColor: 'rgba(255,152,0,0.9)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  stepBadgeText: { color: 'white', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  instructions: { color: 'white', textAlign: 'center', fontSize: 16 },
  stepHint: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
    paddingHorizontal: 32,
  },
  cameraLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: { color: 'white', fontSize: 16, marginTop: 12 },
});
