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
import StickersApi from '../../api/stickers.api';

export default function StickerScannerScreen() {
  const navigation = useNavigation();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [showAmountModal, setShowAmountModal] = useState(false);
  const [stickerId, setStickerId] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const cameraStatus = await Camera.requestCameraPermissionsAsync();
    const locationStatus = await Location.requestForegroundPermissionsAsync();

    setHasPermission(
      cameraStatus.status === 'granted' && locationStatus.status === 'granted'
    );
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
      Alert.alert('Error', 'Please enter a valid bill amount');
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
        gpsLatitude: location.coords.latitude,
        gpsLongitude: location.coords.longitude,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to scan sticker');
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
      Alert.alert('Error', error.message || 'Failed to process scan');
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
        <Text>Requesting permissions...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          Camera and location permissions are required
        </Text>
        <Button mode="contained" onPress={requestPermissions}>
          Grant Permissions
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>

          <Text style={styles.instructions}>
            Scan the QR code on the BOOM-Sticker
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
            Enter Bill Amount
          </Text>

          <TextInput
            label="Bill Amount (BGN)"
            value={billAmount}
            onChangeText={setBillAmount}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
            autoFocus
          />

          <HelperText type="info">
            You will earn 5-10% cashback on this amount
          </HelperText>

          <View style={styles.modalButtons}>
            <Button
              mode="outlined"
              onPress={handleCancel}
              style={styles.button}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleConfirmScan}
              style={styles.button}
              loading={processing}
              disabled={processing}
            >
              Continue
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
