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
import { useRoute, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import StickersApi from '../../api/stickers.api';
import { OCRService } from '../../services/ocr.service';
import { crossPlatformAlert } from '../../utils/alert';
import notificationService from '../../services/notification.service';
import { APP_CONFIG } from '../../constants/config';

type Stage = 'photo' | 'ocr' | 'confirm' | 'submitting' | 'success';

export default function UploadReceiptScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { theme, isDarkMode } = useTheme();

  const { stickerId, sessionId, latitude, longitude, reminderNotificationId } = route.params as {
    stickerId: string;
    /** Session ID from POST /api/stickers/session — registered at QR scan time */
    sessionId?: string;
    latitude: number;
    longitude: number;
    reminderNotificationId?: string | null;
  };

  const [stage, setStage] = useState<Stage>('photo');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [venueName, setVenueName] = useState<string>('');
  const [cashbackPercent, setCashbackPercent] = useState<number>(0);
  const [billAmount, setBillAmount] = useState<number>(0);
  const [ocrConfidence, setOcrConfidence] = useState<number>(0);
  const [cashbackEarned, setCashbackEarned] = useState<number>(0);

  const ocrService = OCRService.getInstance();
  const s = getStyles(theme, isDarkMode);

  // Load venue info from sticker ID
  useEffect(() => {
    StickersApi.validateSticker(stickerId).then((res) => {
      if (res.success && res.data) {
        setVenueName(res.data.venueName || '');
        setCashbackPercent(res.data.cashbackPercent || 0);
      }
    }).catch(() => {});
  }, [stickerId]);

  const pickFromCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled) handleImage(result.assets[0].uri);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled) handleImage(result.assets[0].uri);
  };

  const handleImage = async (uri: string) => {
    setImageUri(uri);
    setStage('ocr');

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

  const handleSubmit = async () => {
    if (!billAmount || billAmount <= 0) {
      crossPlatformAlert(t('common.error'), t('stickers.enterValidAmount', 'Please enter a valid bill amount'));
      return;
    }

    setStage('submitting');

    try {
      // Complete the session with the bill amount.
      // If a sessionId exists (two-step flow), the server updates the existing session record.
      // Otherwise falls back to the legacy single-call flow for backward compatibility.
      const scanRes = await StickersApi.scanSticker({
        ...(sessionId ? { sessionId } : { stickerId }),
        billAmount,
        latitude,
        longitude,
      });

      if (!scanRes.success || !scanRes.data) {
        throw new Error(scanRes.error || t('stickers.scanFailed', 'Scan failed'));
      }

      const scanId = scanRes.data.id;
      const serverCashback = scanRes.data.cashbackPercent || cashbackPercent;
      const earned = (billAmount * serverCashback) / 100;
      setCashbackEarned(earned);

      // Upload the receipt photo linked to this scan
      if (imageUri) {
        await StickersApi.uploadReceiptForScan(scanId, imageUri);
      }

      // Cancel the 30-minute reminder now that the receipt has been submitted
      if (reminderNotificationId) {
        notificationService.cancelNotification(reminderNotificationId);
      }

      setStage('success');
    } catch (error: any) {
      crossPlatformAlert(t('common.error'), error.message || t('stickers.processFailed', 'Submission failed. Please try again.'));
      setStage('confirm');
    }
  };

  // ── Success ─────────────────────────────────────────────
  if (stage === 'success') {
    return (
      <View style={[s.container, s.centered]}>
        <LinearGradient
          colors={isDarkMode ? ['#052e16', '#14532d'] : ['#dcfce7', '#bbf7d0']}
          style={s.successCard}
        >
          <View style={s.successIconCircle}>
            <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
          </View>
          <Text style={s.successTitle}>{t('stickers.successTitle', 'Cashback Submitted!')}</Text>
          <Text style={s.successSubtitle}>
            {t('stickers.successDesc', 'Your receipt has been submitted for review.')}
          </Text>
          <View style={s.successAmountRow}>
            <Ionicons name="trending-up" size={20} color="#16a34a" />
            <Text style={s.successAmount}>
              +{cashbackEarned.toFixed(2)} BGN {t('stickers.cashbackLabel', 'cashback')}
            </Text>
          </View>
          <Text style={s.successNote}>
            {t('stickers.successNote', 'Cashback will be credited to your wallet once approved.')}
          </Text>
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

        <TouchableOpacity style={s.secondaryButton} activeOpacity={0.85} onPress={pickFromGallery}>
          <Ionicons name="image-outline" size={22} color={theme.colors.onSurface} />
          <Text style={s.secondaryButtonText}>{t('stickers.chooseFromGallery', 'Choose from Gallery')}</Text>
        </TouchableOpacity>
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
                onPress={() => setBillAmount(billAmount + 1)}
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
              {t('stickers.estimatedCashback', 'Max. possible cashback')}: {((billAmount * cashbackPercent) / 100).toFixed(2)} BGN
            </Text>
          </LinearGradient>
        )}
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
