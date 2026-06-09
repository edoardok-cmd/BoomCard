/**
 * Upload Receipt Screen
 *
 * Step 2 of 2 in the venue cashback flow.
 * Receives stickerId + GPS coords from StickerScannerScreen.
 * User photographs their receipt → OCR extracts the total →
 * app registers the sticker scan and uploads the receipt in one go.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import StickersApi from '../../api/stickers.api';
import { getDeviceFingerprint } from '../../services/deviceFingerprint.service';
import { OCRService } from '../../services/ocr.service';
import { crossPlatformAlert } from '../../utils/alert';
import notificationService from '../../services/notification.service';
import { APP_CONFIG, GPS_CONFIG } from '../../constants/config';
import { validateLocationProximity, formatDistance } from '../../utils/distance';
import apiClient from '../../api/client';

type Stage = 'photo' | 'ocr' | 'confirm' | 'submitting' | 'success';

export default function UploadReceiptScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { theme, isDarkMode } = useTheme();

  const { stickerId, sessionId, latitude, longitude, reminderNotificationId, sessionCreatedAt } = route.params as {
    stickerId: string;
    /** Session ID from POST /api/stickers/session — registered at QR scan time */
    sessionId?: string;
    latitude: number;
    longitude: number;
    reminderNotificationId?: string | null;
    /** ISO timestamp of when the QR sticker was scanned — used to enforce the 6am deadline */
    sessionCreatedAt?: string;
  };

  const [stage, setStage] = useState<Stage>('photo');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string>('');
  const [cashbackPercent, setCashbackPercent] = useState<number>(0);
  const [billAmount, setBillAmount] = useState<number>(0);
  const [ocrConfidence, setOcrConfidence] = useState<number>(0);
  const [cashbackEarned, setCashbackEarned] = useState<number>(0);
  // R4 — outcome of the scan/upload so the success screen can distinguish
  // auto-approved (credited) from manual-review ("In Review", high-risk only).
  const [scanStatus, setScanStatus] = useState<string>('');
  const [scanMessage, setScanMessage] = useState<string>('');
  // User's plan code (BASIC / LIGHT / PREMIUM) — used to compute accurate cashback estimate
  // per the master cashback matrix (§2). Fetched once on mount; null = not yet known.
  const [userPlanCode, setUserPlanCode] = useState<string | null>(null);
  // True when validateSticker failed (network error or venue lookup returned no data).
  // Used to render a non-blocking warning banner — submission still works since the
  // server re-validates sticker + venue when the scan is posted.
  const [stickerValidationFailed, setStickerValidationFailed] = useState(false);
  // R6 §8.5 — set true only when the server explicitly reports valid:false
  // (inactive / in-processing / not-found). A network error leaves this false so
  // the user isn't hard-blocked by a transient failure (server re-validates anyway).
  const [stickerInvalid, setStickerInvalid] = useState(false);
  const [stickerInvalidReason, setStickerInvalidReason] = useState<string>('');

  const ocrService = OCRService.getInstance();
  const s = getStyles(theme, isDarkMode);

  // __DEV__-gated Playwright hook: tests inject image URIs without invoking the native picker.
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== 'web') return;
    const w = globalThis as any;
    w.__BOOM_TEST_UPLOAD_IMAGE__ = (dataUri: string) => { void handleImage(dataUri); };
    w.__BOOM_TEST_SET_AMOUNT__ = (amt: number) => setBillAmount(amt);
    w.__BOOM_TEST_SUBMIT__ = () => { void handleSubmit(); };
    w.__BOOM_TEST_GET_STATE__ = () => ({ stage, billAmount, venueName, cashbackPercent, ocrConfidence, cashbackEarned, imageUri });
    return () => {
      delete w.__BOOM_TEST_UPLOAD_IMAGE__;
      delete w.__BOOM_TEST_SET_AMOUNT__;
      delete w.__BOOM_TEST_SUBMIT__;
      delete w.__BOOM_TEST_GET_STATE__;
    };
  });

  // Load venue info from sticker ID
  useEffect(() => {
    StickersApi.validateSticker(stickerId).then((res) => {
      // R6 — distinguish an explicit valid:false (abort) from a network failure.
      const body: any = res.success ? ((res.data as any)?.data ?? res.data) : null;
      if (body && body.valid === false) {
        setStickerInvalid(true);
        setStickerInvalidReason(body.message || '');
      } else if (res.success && body) {
        setVenueName(body.venueName || '');
        setCashbackPercent(Math.max(0, Math.min(100, body.cashbackPercent || 0)));
      } else {
        setStickerValidationFailed(true);
      }
    }).catch((err) => {
      if (__DEV__) console.warn('Failed to validate sticker:', err);
      setStickerValidationFailed(true);
    });
  }, [stickerId]);

  // Fetch user's plan code so we can show an accurate cashback estimate
  // per the cashback matrix (§2): Basic cap = 10%, Premium ≈ D×0.80
  useEffect(() => {
    apiClient.get('/api/subscriptions/current').then((res) => {
      // Backend may return plan as a string ('BASIC') or as an object ({ code: 'BASIC', ... })
      const rawPlan = (res as any)?.data?.plan;
      const code = typeof rawPlan === 'object' ? rawPlan?.code : rawPlan;
      if (code) setUserPlanCode(String(code).toUpperCase());
    }).catch((err) => {
      // Falls back to BASIC rate (conservative) — log for debugging
      if (__DEV__) console.warn('Failed to fetch subscription:', err);
    });
  }, []);

  /**
   * Estimated user cashback using the document's cashback matrix formulas (§2/§3):
   *   - venueDiscount ≤ 5%  → full pass-through (BOOM margin = 0 at entry level)
   *   - Basic               → min(D × 0.525, 10%)  [midpoint of doc's 0.50–0.55 range]
   *   - LIGHT / PREMIUM     → D × 0.80
   * Returns BGN amount.  Actual amount is server-computed after submission.
   */
  const getEstimatedCashback = (billAmt: number, venueDiscount: number, planCode: string | null): number => {
    if (venueDiscount <= 0 || billAmt <= 0) return 0;
    let rate: number;
    if (venueDiscount <= 5) {
      rate = venueDiscount / 100;
    } else if (planCode === 'BASIC') {
      // 0.525 is the midpoint of the doc's range (0.50–0.55), aligns with the lookup table
      // (e.g. 15% venue → 15×0.525=7.875≈8% per table vs 7.5% with flat 0.50)
      rate = Math.min(venueDiscount * 0.525, 10) / 100;
    } else {
      // LIGHT (Premium Weekly) and PREMIUM (Premium Monthly) both use Premium cashback
      rate = (venueDiscount * 0.80) / 100;
    }
    return billAmt * rate;
  };

  const pickFromCamera = async () => {
    // Product rule: receipt uploads must be LIVE photos taken with the camera. Gallery
    // picking is disabled to prevent users from submitting saved images (or screenshots
    // of receipts belonging to someone else).
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled) handleImage(result.assets[0].uri);
  };

  const handleImage = async (uri: string) => {
    setImageUri(uri);
    setStage('ocr');

    // Playwright bypass: skip OCR so tests don't wait on Tesseract.
    if (__DEV__ && Platform.OS === 'web' && (globalThis as any).__BOOM_TEST_SKIP_OCR__) {
      setStage('confirm');
      return;
    }

    try {
      const ocr = await ocrService.processReceiptImage(uri, () => {});
      setBillAmount(ocr.totalAmount || 0);
      setOcrConfidence(ocr.confidence || 0);
      if (ocr.merchantName && !venueName) setVenueName(ocr.merchantName);
      setStage('confirm');
    } catch {
      // OCR failed — let user enter amount manually
      setBillAmount(0);
      setStage('confirm');
    }
  };

  /**
   * Returns 6:00 AM Sofia time on the calendar day after the QR scan.
   * All BoomCard venues are in Bulgaria; the deadline must be consistent
   * regardless of the user's device timezone. We format the scan timestamp
   * into Sofia's calendar day, add one day, then build a UTC date using
   * the conservative max offset (UTC+3 = EEST) so the client is never
   * more generous than the server.
   */
  const getSessionDeadline = (createdAt: string): Date => {
    const scanDate = new Date(createdAt);
    // Get the Sofia calendar day as YYYY-MM-DD
    const sofiaDayStr = scanDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });
    const [y, m, d] = sofiaDayStr.split('-').map(Number);
    // 06:00 Sofia ≈ 03:00 UTC (conservative; exact in summer, 1h strict in winter)
    return new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
  };

  const handleSubmit = async () => {
    // R6 §8.5 — abort when the sticker is explicitly invalid (inactive / in-processing
    // / not-found), surfacing the server's per-reason message.
    if (stickerInvalid) {
      crossPlatformAlert(
        t('common.error'),
        stickerInvalidReason || t('stickers.stickerInvalid', 'Този QR код не е активен или не може да се използва в момента.')
      );
      return;
    }

    if (!billAmount || billAmount <= 0) {
      crossPlatformAlert(t('common.error'), t('stickers.enterValidAmount', 'Please enter a valid bill amount'));
      return;
    }

    // Hard block: past 6am the following morning from QR scan time
    if (sessionCreatedAt && Date.now() > getSessionDeadline(sessionCreatedAt).getTime()) {
      crossPlatformAlert(t('common.error'), t('stickers.receiptDeadlineExpired'));
      return;
    }

    // Hard block: user is too far from the venue (GPS_CONFIG.MAX_RADIUS_METERS = 60m)
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const proximity = validateLocationProximity(
        { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
        { latitude, longitude },
        GPS_CONFIG.MAX_RADIUS_METERS
      );
      if (!proximity.isValid) {
        crossPlatformAlert(
          t('common.error'),
          t('stickers.locationTooFar', {
            distance: formatDistance(proximity.distance),
            limit: GPS_CONFIG.MAX_RADIUS_METERS,
          })
        );
        return;
      }
    } catch {
      // GPS unavailable — warn but don't block (server will re-validate)
      if (__DEV__) console.warn('UploadReceiptScreen: GPS check failed, proceeding without distance guard');
    }

    setStage('submitting');

    try {
      // Complete the session with the bill amount.
      // If a sessionId exists (two-step flow), the server updates the existing session record.
      // Otherwise falls back to the legacy single-call flow for backward compatibility.
      const fp = await getDeviceFingerprint();
      const scanRes = await StickersApi.scanSticker({
        ...(sessionId ? { sessionId } : { stickerId }),
        billAmount,
        latitude,
        longitude,
        deviceFingerprint: fp,
      });

      if (!scanRes.success || !scanRes.data) {
        throw new Error(scanRes.error || t('stickers.scanFailed', 'Scan failed'));
      }

      const scanId = scanRes.data.id;
      // Prefer the server's pre-computed absolute amount; fall back to rate-based derivation.
      // Never use cashbackPercent (venue discount state) as a fallback — it is the partner's
      // full rate, not the user's plan-adjusted cashback rate.
      const earned = scanRes.data.cashbackAmount > 0
        ? scanRes.data.cashbackAmount
        : (billAmount * Math.max(0, scanRes.data.cashbackPercent ?? 0)) / 100;
      setCashbackEarned(earned);

      // R4 — record the scan outcome; prefer the upload response (post-OCR) for
      // the authoritative status, falling back to the initial scan response.
      let finalStatus: string = (scanRes.data as any).status || '';
      const initialMessage: string = (scanRes.data as any).message || '';

      // Upload the receipt photo linked to this scan
      if (imageUri) {
        const upRes = await StickersApi.uploadReceiptForScan(scanId, imageUri);
        const upBody: any = upRes?.success ? ((upRes.data as any)?.data ?? upRes.data) : null;
        if (upBody?.status) finalStatus = upBody.status;
        if (upBody?.message) setScanMessage(upBody.message);
      }
      setScanStatus(finalStatus);
      if (!scanMessage && initialMessage) setScanMessage(initialMessage);

      // Cancel the 30-minute reminder now that the receipt has been submitted
      if (reminderNotificationId) {
        notificationService.cancelNotification(reminderNotificationId);
      }

      setStage('success');
    } catch (error: any) {
      const rawErr: string = error?.message || '';
      // Spec §4.2 v1.1 — surface renewal CTA on SUBSCRIPTION_* markers.
      if (rawErr.includes('SUBSCRIPTION_FAILED_PAYMENT') || rawErr.includes('SUBSCRIPTION_PAST_DUE') || rawErr.includes('SUBSCRIPTION_INACTIVE')) {
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
        crossPlatformAlert(t('common.error'), rawErr || t('stickers.processFailed', 'Submission failed. Please try again.'));
      }
      setStage('confirm');
    }
  };

  // ── Success ─────────────────────────────────────────────
  if (stage === 'success') {
    // R4 §9.4/§9.5 — "In Review" applies to high-risk (MANUAL_REVIEW/PENDING) only;
    // Low/Medium risk auto-approve and are credited immediately.
    const isReview = scanStatus === 'MANUAL_REVIEW' || scanStatus === 'PENDING' || scanStatus === 'VALIDATING';
    const isApproved = scanStatus === 'APPROVED';
    const title = isReview
      ? t('stickers.successReviewTitle', 'Изпратено за преглед')
      : t('stickers.successTitle', 'Cashback Submitted!');
    const subtitle = scanMessage
      || (isReview
        ? t('stickers.successReviewDesc', 'Бележката Ви е изпратена за преглед (In Review).')
        : isApproved
          ? t('stickers.successApprovedDesc', 'Кешбекът Ви беше одобрен и начислен.')
          : t('stickers.successDesc', 'Your receipt has been submitted for review.'));
    const note = isReview
      ? t('stickers.successReviewNote', 'Ще получите кешбека след одобрение.')
      : isApproved
        ? t('stickers.successApprovedNote', 'Кешбекът е добавен към портфейла Ви.')
        : t('stickers.successNote', 'Cashback will be credited to your wallet once approved.');

    return (
      <View style={[s.container, s.centered]}>
        <LinearGradient
          colors={isReview
            ? (isDarkMode ? ['#422006', '#713f12'] : ['#fef9c3', '#fef08a'])
            : (isDarkMode ? ['#052e16', '#14532d'] : ['#dcfce7', '#bbf7d0'])}
          style={s.successCard}
        >
          <View style={s.successIconCircle}>
            <Ionicons
              name={isReview ? 'time' : 'checkmark-circle'}
              size={56}
              color={isReview ? '#D97706' : '#22c55e'}
            />
          </View>
          <Text style={s.successTitle}>{title}</Text>
          <Text style={s.successSubtitle}>{subtitle}</Text>
          <View style={s.successAmountRow}>
            <Ionicons name="trending-up" size={20} color="#16a34a" />
            <Text style={s.successAmount}>
              +{cashbackEarned.toFixed(2)} BGN {t('stickers.cashbackLabel', 'cashback')}
            </Text>
          </View>
          <Text style={s.successNote}>{note}</Text>
        </LinearGradient>

        <TouchableOpacity style={s.doneButton} onPress={() => (navigation as any).navigate('Dashboard')}>
          <Text style={s.doneButtonText}>{t('common.done', 'Done')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── OCR Processing ───────────────────────────────────────
  if (stage === 'ocr') {
    return (
      <View style={[s.container, s.centered]}>
        {imageUri && <Image source={{ uri: imageUri }} style={s.thumbnailOcr} />}
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 24 }} />
        <Text style={s.ocrText}>{t('stickers.readingReceipt', 'Reading your receipt...')}</Text>
      </View>
    );
  }

  // ── Submitting ───────────────────────────────────────────
  if (stage === 'submitting') {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={s.ocrText}>{t('stickers.submitting', 'Registering cashback...')}</Text>
      </View>
    );
  }

  // ── Photo capture ────────────────────────────────────────
  if (stage === 'photo') {
    return (
      <ScrollView style={s.container} contentContainerStyle={s.scrollContent}>
        <View style={s.stepHeader}>
          <View style={s.stepBadge}>
            <Text style={s.stepBadgeText}>{t('stickers.step2of2', 'STEP 2 OF 2')}</Text>
          </View>
          <Text style={s.stepTitle}>{t('stickers.uploadReceiptTitle', 'Photograph Your Receipt')}</Text>
          {venueName ? (
            <View style={s.venueRow}>
              <Ionicons name="location" size={14} color={theme.colors.primary} />
              <Text style={s.venueName}>{venueName}</Text>
              {cashbackPercent > 0 && (
                <View style={s.cashbackBadge}>
                  <Text style={s.cashbackBadgeText}>{t('stickers.maxCashbackBadge', { rate: cashbackPercent })}</Text>
                </View>
              )}
            </View>
          ) : null}
        </View>

        {stickerValidationFailed && !venueName ? (
          <View style={s.warningBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#b45309" />
            <Text style={s.warningBannerText}>
              {t('stickers.venueLookupFailedWarning', "Couldn't load venue details — your submission will still be reviewed by the server.")}
            </Text>
          </View>
        ) : null}

        <View style={s.instructionCard}>
          <Ionicons name="receipt-outline" size={40} color={theme.colors.primary} style={{ marginBottom: 12 }} />
          <Text style={s.instructionTitle}>{t('stickers.photoInstructionTitle', 'Take a clear photo of your receipt')}</Text>
          <Text style={s.instructionText}>{t('stickers.photoInstruction', 'Make sure the total amount is visible. We\'ll read it automatically.')}</Text>
          <View style={s.timeWindowRow}>
            <Ionicons name="time-outline" size={14} color={theme.colors.onSurfaceVariant} />
            <Text style={s.timeWindowText}>{t('stickers.receiptTimeWindow', 'Take a photo before leaving. Submissions after 1 hour are flagged for review; deadline is 6am the following morning.')}</Text>
          </View>
        </View>

        <TouchableOpacity style={s.primaryButton} activeOpacity={0.85} onPress={pickFromCamera}>
          <Ionicons name="camera" size={22} color="#fff" />
          <Text style={s.primaryButtonText}>{t('stickers.takePhoto', 'Take Photo')}</Text>
        </TouchableOpacity>

        <Text style={s.cameraOnlyHint}>
          {t('stickers.cameraOnlyHint', 'Receipts must be photographed live with your camera. Gallery upload is not accepted.')}
        </Text>
      </ScrollView>
    );
  }

  // ── Confirm (OCR done) ───────────────────────────────────
  return (
    <ScrollView style={s.container} contentContainerStyle={s.scrollContent}>
      <View style={s.stepHeader}>
        <View style={s.stepBadge}>
          <Text style={s.stepBadgeText}>{t('stickers.step2of2', 'STEP 2 OF 2')}</Text>
        </View>
        <Text style={s.stepTitle}>{t('stickers.confirmTitle', 'Confirm & Submit')}</Text>
      </View>

      {stickerValidationFailed && !venueName ? (
        <View style={s.warningBanner}>
          <Ionicons name="alert-circle-outline" size={18} color="#b45309" />
          <Text style={s.warningBannerText}>
            {t('stickers.venueLookupFailedWarning', "Couldn't load venue details — your submission will still be reviewed by the server.")}
          </Text>
        </View>
      ) : null}

      {/* Receipt preview */}
      {imageUri && (
        <View style={s.previewContainer}>
          <Image source={{ uri: imageUri }} style={s.previewImage} resizeMode="cover" />
          <TouchableOpacity style={s.retakeButton} onPress={() => { setImageUri(null); setStage('photo'); }}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={s.retakeText}>{t('stickers.retake', 'Retake')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Summary card */}
      <View style={s.summaryCard}>
        {venueName ? (
          <View style={s.summaryRow}>
            <View style={s.summaryIcon}><Ionicons name="storefront-outline" size={18} color={theme.colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.summaryLabel}>{t('stickers.venue', 'Venue')}</Text>
              <Text style={s.summaryValue}>{venueName}</Text>
            </View>
          </View>
        ) : null}

        <View style={[s.summaryRow, { borderBottomWidth: 0 }]}>
          <View style={s.summaryIcon}><Ionicons name="cash-outline" size={18} color="#22c55e" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.summaryLabel}>{t('stickers.billAmountLabel', 'Bill Amount')}</Text>
            {/* Editable amount */}
            <View style={s.amountRow}>
              <TouchableOpacity
                onPress={() => setBillAmount(Math.max(0, billAmount - 1))}
                style={s.amountBtn}
              >
                <Ionicons name="remove" size={18} color={theme.colors.onSurface} />
              </TouchableOpacity>
              <Text style={s.amountText}>{billAmount.toFixed(2)} BGN</Text>
              <TouchableOpacity
                onPress={() => setBillAmount(Math.min(10000, billAmount + 1))}
                style={s.amountBtn}
              >
                <Ionicons name="add" size={18} color={theme.colors.onSurface} />
              </TouchableOpacity>
            </View>
            {ocrConfidence > 0 && (
              <Text style={s.ocrConfidence}>
                {ocrConfidence >= APP_CONFIG.OCR.CONFIDENCE_THRESHOLD / 100
                  ? `✓ ${t('stickers.ocrDetected', 'Detected automatically')}`
                  : `⚠ ${t('stickers.ocrLowConfidence', 'Low confidence — please verify')}`}
              </Text>
            )}
          </View>
        </View>

        {billAmount > 0 && cashbackPercent > 0 && (
          <LinearGradient
            colors={isDarkMode ? ['#14532d', '#052e16'] : ['#dcfce7', '#bbf7d0']}
            style={s.cashbackPreview}
          >
            <Ionicons name="trending-up" size={18} color="#16a34a" />
            <Text style={s.cashbackPreviewText}>
              {/* When plan is unknown fall back to the Basic formula (conservative lower bound)
                  rather than showing the raw venue discount which would inflate the estimate. */}
              {`${t('stickers.userEstimatedCashback')}: ${getEstimatedCashback(billAmount, cashbackPercent, userPlanCode ?? 'BASIC').toFixed(2)} BGN`}
            </Text>
          </LinearGradient>
        )}
        <Text style={s.cashbackInfoNote}>{t('stickers.cashbackInfo')}</Text>
      </View>

      <TouchableOpacity style={s.primaryButton} activeOpacity={0.85} onPress={handleSubmit}>
        <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
        <Text style={s.primaryButtonText}>{t('stickers.submitCashback', 'Submit for Cashback')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.secondaryButton} activeOpacity={0.85} onPress={() => { setImageUri(null); setStage('photo'); }}>
        <Ionicons name="camera-outline" size={22} color={theme.colors.onSurface} />
        <Text style={s.secondaryButtonText}>{t('stickers.retakeReceipt', 'Retake Receipt Photo')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  // Step header
  stepHeader: { alignItems: 'center', marginBottom: 20 },
  stepBadge: {
    backgroundColor: 'rgba(255,152,0,0.9)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 8,
  },
  stepBadgeText: { color: 'white', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  stepTitle: { fontSize: 22, fontWeight: '700', color: theme.colors.onSurface, textAlign: 'center' },
  venueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 },
  venueName: { fontSize: 13, color: theme.colors.onSurfaceVariant, marginRight: 6 },
  cashbackBadge: {
    backgroundColor: isDarkMode ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  cashbackBadgeText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },

  // Non-blocking warning banner shown when sticker lookup fails but submission is still allowed
  warningBanner: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 8,
    backgroundColor: isDarkMode ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.25)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  warningBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: isDarkMode ? '#fcd34d' : '#92400e',
  },

  // Instruction card (photo stage)
  instructionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.outline : 'rgba(0,0,0,0.05)',
  },
  instructionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.onSurface,
    textAlign: 'center',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
  },
  timeWindowRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
  },
  timeWindowText: {
    flex: 1,
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    lineHeight: 16,
  },
  cashbackInfoNote: {
    fontSize: 11,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 15,
    opacity: 0.75,
    paddingHorizontal: 4,
  },

  // Receipt preview (confirm stage)
  previewContainer: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    height: 220,
  },
  previewImage: { width: '100%', height: '100%' },
  retakeButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  retakeText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Summary card
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: isDarkMode ? theme.colors.outline : 'rgba(0,0,0,0.05)',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    gap: 12,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: isDarkMode ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 11, color: theme.colors.onSurfaceVariant, marginBottom: 4 },
  summaryValue: { fontSize: 15, fontWeight: '600', color: theme.colors.onSurface },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  amountBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  amountText: { fontSize: 20, fontWeight: '700', color: theme.colors.onSurface },
  ocrConfidence: { fontSize: 11, color: theme.colors.onSurfaceVariant, marginTop: 4 },
  cashbackPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  cashbackPreviewText: { fontSize: 14, fontWeight: '600', color: '#16a34a' },

  // Buttons
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
    marginBottom: 8,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '600', color: theme.colors.onSurface },
  cameraOnlyHint: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
    lineHeight: 16,
  },

  // OCR loading
  thumbnailOcr: { width: '100%', height: 200, borderRadius: 16 },
  ocrText: { fontSize: 16, color: theme.colors.onSurfaceVariant, marginTop: 16, textAlign: 'center' },

  // Success
  successCard: {
    width: '100%',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  successIconCircle: { marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#16a34a', marginBottom: 8 },
  successSubtitle: { fontSize: 14, color: isDarkMode ? '#86efac' : '#15803d', textAlign: 'center', marginBottom: 16 },
  successAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  successAmount: { fontSize: 20, fontWeight: '700', color: '#16a34a' },
  successNote: { fontSize: 12, color: isDarkMode ? '#86efac' : '#15803d', textAlign: 'center' },
  doneButton: {
    width: '100%',
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  doneButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
