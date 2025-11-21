/**
 * Sticker Scanner Screen
 *
 * Scan BOOM-Sticker QR codes with GPS validation
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button, Portal, Modal, TextInput, HelperText } from 'react-native-paper';
import { CameraView, Camera } from 'expo-camera';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import StickersApi from '../../api/stickers.api';

export default function StickerScannerScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [showAmountModal, setShowAmountModal] = useState(false);
  const [stickerId, setStickerId] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    console.log('StickerScannerScreen: Requesting permissions...');
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    try {
      console.log('Requesting camera permissions...');
      const cameraStatus = await Camera.requestCameraPermissionsAsync();
      console.log('Camera permission:', cameraStatus.status);

      console.log('Requesting location permissions...');
      const locationStatus = await Location.requestForegroundPermissionsAsync();
      console.log('Location permission:', locationStatus.status);

      const granted = cameraStatus.status === 'granted' && locationStatus.status === 'granted';
      console.log('Permissions granted:', granted);
      setHasPermission(granted);
    } catch (error) {
      console.error('Error requesting permissions:', error);
      setHasPermission(false);
    }
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;

    setScanned(true);
    setStickerId(data);
    setShowAmountModal(true);
  };

  const handleConfirmScan = async () => {
    const amount = parseFloat(billAmount);

    if (!amount || amount <= 0) {
      Alert.alert(t('common.error'), t('stickers.enterValidAmount'));
      return;
    }

    setProcessing(true);

    try {
      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Initiate scan
      const response = await StickersApi.scanSticker({
        stickerId,
        billAmount: amount,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || t('stickers.scanFailed'));
      }

      const scan = response.data;

      setShowAmountModal(false);
      setBillAmount('');

      // Navigate to receipt upload
      (navigation as any).navigate('UploadReceipt', {
        scanId: scan.scanId,
        billAmount: amount,
        cashbackPercent: scan.cashbackPercent,
      });
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || t('stickers.processFailed'));
      setScanned(false);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    setShowAmountModal(false);
    setBillAmount('');
    setScanned(false);
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
        <Text style={styles.errorText}>
          {t('stickers.permissionsRequired')}
        </Text>
        <HelperText type="info" style={styles.helperText}>
          {t('stickers.permissionsHelp')}
        </HelperText>
        <Button mode="contained" onPress={requestPermissions} style={styles.permissionButton}>
          {t('stickers.grantPermissions')}
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onCameraReady={() => {
          console.log('Camera is ready!');
          setCameraReady(true);
        }}
        onMountError={(error) => {
          console.error('Camera mount error:', error);
          Alert.alert(t('common.error'), 'Camera failed to start: ' + error.message);
        }}
      >
        <View style={styles.overlay}>
          {!cameraReady && (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Starting camera...</Text>
            </View>
          )}

          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>

          <Text style={styles.instructions}>
            {t('stickers.scanInstructions')}
          </Text>
        </View>
      </CameraView>

      {/* Amount Input Modal */}
      <Portal>
        <Modal
          visible={showAmountModal}
          onDismiss={handleCancel}
          contentContainerStyle={styles.modal}
        >
          <Text variant="headlineSmall" style={styles.modalTitle}>
            {t('stickers.enterBillAmount')}
          </Text>

          <TextInput
            label={t('stickers.billAmount')}
            value={billAmount}
            onChangeText={setBillAmount}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
            autoFocus
          />

          <HelperText type="info">
            {t('stickers.cashbackInfo')}
          </HelperText>

          <View style={styles.modalButtons}>
            <Button
              mode="outlined"
              onPress={handleCancel}
              style={styles.button}
              disabled={processing}
            >
              {t('common.cancel')}
            </Button>
            <Button
              mode="contained"
              onPress={handleConfirmScan}
              style={styles.button}
              loading={processing}
              disabled={processing}
            >
              {t('common.continue')}
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 16,
  },
  helperText: {
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  permissionButton: {
    marginTop: 8,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: 'white',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  instructions: {
    color: 'white',
    marginTop: 32,
    textAlign: 'center',
    fontSize: 16,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
  },
  modal: {
    backgroundColor: 'white',
    padding: 24,
    margin: 20,
    borderRadius: 8,
  },
  modalTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 8,
  },
  button: {
    flex: 1,
  },
});
