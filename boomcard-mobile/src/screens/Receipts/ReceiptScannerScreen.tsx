/**
 * Receipt Scanner Screen
 *
 * CRITICAL: Camera capture + GPS validation for 60-meter requirement
 * Handles receipt photo capture, OCR processing, and GPS-validated submission
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  TextInput,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import LocationService from '../../services/location.service';
import OCRService from '../../services/ocr.service';
import ReceiptsApi from '../../api/receipts.api';
import { GPS_CONFIG } from '../../constants/config';
import { formatDistance } from '../../utils/distance';
import type { ReceiptSubmitRequest, GPSValidationResult } from '../../types';

const ReceiptScannerScreen = ({ navigation, route }: any) => {
  const { t } = useTranslation();

  useEffect(() => {
    navigation.setOptions({
      title: t('receipts.scanReceipt'),
    });
  }, [navigation, t]);
  const cameraRef = useRef<CameraView>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrData, setOcrData] = useState<any>(null);
  const [gpsValidation, setGpsValidation] = useState<GPSValidationResult | null>(null);

  // Form data
  const [merchantName, setMerchantName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);

  // Venue from route params (if scanning from venue screen)
  const venueId = route?.params?.venueId;
  const venueLatitude = route?.params?.venueLatitude;
  const venueLongitude = route?.params?.venueLongitude;

  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const cameraPermission = await Camera.requestCameraPermissionsAsync();
    const locationPermission = await LocationService.requestPermissions();

    setHasPermission(cameraPermission.status === 'granted' && locationPermission.granted);

    if (!cameraPermission.granted) {
      Alert.alert(
        t('receipts.scanner.cameraPermissionTitle'),
        t('receipts.scanner.cameraPermissionMessage')
      );
    }

    if (!locationPermission.granted) {
      Alert.alert(
        t('receipts.scanner.locationPermissionTitle'),
        t('receipts.scanner.locationPermissionMessage')
      );
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      setIsProcessing(true);

      // Capture photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      setCapturedImage(photo.uri);

      // Process image with OCR (placeholder - would integrate Tesseract.js or ML Kit)
      await processReceiptImage(photo.uri);

      setIsProcessing(false);
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert(t('common.error'), t('receipts.scanner.captureError'));
      setIsProcessing(false);
    }
  };

  const pickImageFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
        setIsProcessing(true);
        await processReceiptImage(result.assets[0].uri);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('common.error'), t('receipts.scanner.selectImageError'));
    }
  };

  /**
   * Process receipt image with OCR
   * Uses backend OCR service for reliable multilingual text extraction
   */
  const processReceiptImage = async (imageUri: string) => {
    try {
      // Process image with OCR service
      const ocrResult = await OCRService.processReceiptImage(
        imageUri,
        (progress) => {
          console.log(`OCR Progress: ${progress}%`);
        }
      );

      // Validate OCR results
      const validation = OCRService.validateOCRResult(ocrResult);

      if (!validation.isValid) {
        Alert.alert(
          t('receipts.scanner.ocrQualityWarning'),
          `Some data could not be automatically extracted:\n${validation.errors.join('\n')}\n\nPlease verify and enter missing information manually.`
        );
      }

      // Set OCR data
      setOcrData(ocrResult);
      setMerchantName(ocrResult.merchantName);
      setTotalAmount(ocrResult.totalAmount > 0 ? ocrResult.totalAmount.toString() : '');
      setReceiptDate(ocrResult.receiptDate);

      // Show success message with confidence
      if (ocrResult.confidence >= 80) {
        Alert.alert(
          t('receipts.scanner.ocrSuccess'),
          `Receipt processed with ${OCRService.formatConfidence(ocrResult.confidence)} confidence. Please verify the extracted data.`
        );
      }
    } catch (error: any) {
      console.error('OCR processing error:', error);
      Alert.alert(
        t('receipts.scanner.ocrFailed'),
        t('receipts.scanner.ocrFailedMessage')
      );

      // Set empty OCR data for manual entry
      setOcrData({
        merchantName: '',
        totalAmount: 0,
        receiptDate: new Date().toISOString().split('T')[0],
        items: [],
        rawText: '',
        confidence: 0,
      });
    }
  };

  /**
   * CRITICAL: Validate GPS location before submission
   * Enforces 60-meter radius requirement
   */
  const validateLocation = async (): Promise<boolean> => {
    if (!venueLatitude || !venueLongitude) {
      Alert.alert(
        t('receipts.scanner.venueRequired'),
        t('receipts.scanner.venueRequiredMessage')
      );
      return false;
    }

    try {
      // Validate GPS proximity with 60-meter radius
      const validation = await LocationService.validateProximityToVenue(
        venueLatitude,
        venueLongitude,
        GPS_CONFIG.MAX_RADIUS_METERS
      );

      setGpsValidation(validation);

      if (!validation.isValid) {
        Alert.alert(
          t('receipts.scanner.locationVerificationFailed'),
          `${validation.message}\n\nYou are ${formatDistance(validation.distance)} from the venue. You must be within ${formatDistance(GPS_CONFIG.MAX_RADIUS_METERS)} to submit this receipt.`,
          [{ text: 'OK' }]
        );
        return false;
      }

      return true;
    } catch (error: any) {
      Alert.alert(
        t('receipts.scanner.locationError'),
        error.message || 'Unable to verify your location. Please ensure GPS is enabled.'
      );
      return false;
    }
  };

  const submitReceipt = async () => {
    // Validation
    if (!capturedImage) {
      Alert.alert(t('common.error'), t('receipts.scanner.capturePhotoFirst'));
      return;
    }

    if (!merchantName || !totalAmount) {
      Alert.alert(t('common.error'), t('receipts.scanner.enterMerchantAndAmount'));
      return;
    }

    const amount = parseFloat(totalAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t('common.error'), t('receipts.scanner.enterValidAmount'));
      return;
    }

    // CRITICAL: Validate GPS location (60-meter requirement)
    const isLocationValid = await validateLocation();
    if (!isLocationValid) {
      return;
    }

    setIsProcessing(true);

    try {
      // Upload receipt image first
      const uploadResponse = await ReceiptsApi.uploadReceiptImage(
        capturedImage,
        (progress) => {
          console.log('Upload progress:', progress);
        }
      );

      if (!uploadResponse.success || !uploadResponse.data) {
        throw new Error(uploadResponse.error || 'Failed to upload image');
      }

      // Submit receipt with GPS coordinates
      const submitData: ReceiptSubmitRequest = {
        merchantName,
        totalAmount: amount,
        receiptDate,
        latitude: gpsValidation!.userLocation.latitude,
        longitude: gpsValidation!.userLocation.longitude,
        venueId,
        ocrData,
        ocrConfidence: ocrData?.confidence || 0,
      };

      const submitResponse = await ReceiptsApi.submitReceipt(submitData);

      if (!submitResponse.success) {
        throw new Error(submitResponse.error || 'Failed to submit receipt');
      }

      Alert.alert(
        t('receipts.scanner.submitSuccess'),
        t('receipts.scanner.submitSuccessMessage'),
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(t('receipts.scanner.submissionFailed'), error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Camera and Location permissions required</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermissions}>
          <Text style={styles.buttonText}>Grant Permissions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (capturedImage) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.preview}>
          <Image source={{ uri: capturedImage }} style={styles.previewImage} />

          {gpsValidation && (
            <View style={[
              styles.gpsStatus,
              gpsValidation.isValid ? styles.gpsValid : styles.gpsInvalid
            ]}>
              <Text style={styles.gpsStatusText}>
                {gpsValidation.isValid ? '✓' : '✗'} {gpsValidation.message}
              </Text>
            </View>
          )}

          <View style={styles.form}>
            <Text style={styles.label}>Merchant Name *</Text>
            <TextInput
              style={styles.input}
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder="Enter merchant name"
              editable={!isProcessing}
            />

            <Text style={styles.label}>Total Amount (BGN) *</Text>
            <TextInput
              style={styles.input}
              value={totalAmount}
              onChangeText={setTotalAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              editable={!isProcessing}
            />

            <Text style={styles.label}>Receipt Date *</Text>
            <TextInput
              style={styles.input}
              value={receiptDate}
              onChangeText={setReceiptDate}
              placeholder="YYYY-MM-DD"
              editable={!isProcessing}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, { flex: 1, marginRight: 8 }]}
                onPress={() => setCapturedImage(null)}
                disabled={isProcessing}
              >
                <Text style={styles.secondaryButtonText}>Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.primaryButton, { flex: 1 }]}
                onPress={submitReceipt}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Submit Receipt</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        <View style={styles.cameraOverlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.instruction}>
            {t('receipts.scanner.positionReceipt')}
          </Text>
        </View>
      </CameraView>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.galleryButton}
          onPress={pickImageFromGallery}
        >
          <Text style={styles.buttonText}>{t('receipts.scanner.gallery')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.captureButton}
          onPress={takePicture}
          disabled={isProcessing}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>

        <View style={{ width: 80 }} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 300,
    height: 400,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  instruction: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 24,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 12,
    borderRadius: 8,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#000000',
  },
  galleryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3B82F6',
  },
  preview: {
    flex: 1,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: 16,
  },
  gpsStatus: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  gpsValid: {
    backgroundColor: '#D1FAE5',
  },
  gpsInvalid: {
    backgroundColor: '#FEE2E2',
  },
  gpsStatusText: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  form: {
    marginTop: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
  },
  secondaryButton: {
    backgroundColor: '#E5E7EB',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 24,
  },
});

export default ReceiptScannerScreen;
