/**
 * Upload Receipt Screen
 *
 * Upload receipt photo after scanning sticker
 */

import React, { useState } from 'react';
import { View, StyleSheet, Image, Alert } from 'react-native';
import { Text, Card, Button } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { useRoute, useNavigation } from '@react-navigation/native';
import StickersApi from '../../api/stickers.api';

export default function UploadReceiptScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { scanId, billAmount, cashbackPercent } = route.params as any;

  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    if (!image) {
      Alert.alert('Error', 'Please select a receipt image');
      return;
    }

    setUploading(true);

    try {
      // Upload receipt
      const response = await StickersApi.uploadReceiptForScan(scanId, image);

      if (!response.success) {
        throw new Error(response.error || 'Failed to upload receipt');
      }

      const cashbackAmount = (billAmount * cashbackPercent) / 100;

      Alert.alert(
        'Success',
        `Receipt uploaded! You will earn ${cashbackAmount.toFixed(2)} BGN cashback once approved.`,
        [
          {
            text: 'OK',
            onPress: () => (navigation as any).navigate('Dashboard'),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to upload receipt');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleLarge" style={styles.title}>
            Upload Your Receipt
          </Text>

          <View style={styles.infoRow}>
            <Text>Bill Amount:</Text>
            <Text style={styles.value}>{billAmount.toFixed(2)} BGN</Text>
          </View>

          <View style={styles.infoRow}>
            <Text>Expected Cashback:</Text>
            <Text style={[styles.value, styles.cashback]}>
              {((billAmount * cashbackPercent) / 100).toFixed(2)} BGN
            </Text>
          </View>

          {image ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: image }} style={styles.image} />
              <Button mode="text" onPress={() => setImage(null)}>
                Remove Image
              </Button>
            </View>
          ) : (
            <View style={styles.imagePickers}>
              <Button
                mode="contained"
                icon="camera"
                onPress={pickImage}
                style={styles.imageButton}
              >
                Take Photo
              </Button>
              <Button
                mode="outlined"
                icon="image"
                onPress={pickFromGallery}
                style={styles.imageButton}
              >
                Choose from Gallery
              </Button>
            </View>
          )}

          <Button
            mode="contained"
            onPress={handleUpload}
            loading={uploading}
            disabled={!image || uploading}
            style={styles.uploadButton}
          >
            {uploading ? 'Uploading...' : 'Upload Receipt'}
          </Button>

          <Text variant="bodySmall" style={styles.note}>
            Make sure the receipt is clear and shows the total amount
          </Text>
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  card: {
    flex: 1,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  value: {
    fontWeight: '600',
  },
  cashback: {
    color: '#ff9800',
  },
  imageContainer: {
    marginVertical: 16,
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginBottom: 8,
  },
  imagePickers: {
    marginVertical: 24,
    gap: 12,
  },
  imageButton: {
    paddingVertical: 8,
  },
  uploadButton: {
    marginTop: 16,
    paddingVertical: 8,
  },
  note: {
    textAlign: 'center',
    opacity: 0.6,
    marginTop: 16,
  },
});
