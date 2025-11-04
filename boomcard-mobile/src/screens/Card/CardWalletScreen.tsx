import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const CardWalletScreen = () => {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>BoomCard</Text>
        <Text style={styles.cardType}>STANDARD</Text>
        <Text style={styles.cardNumber}>**** **** **** 1234</Text>
        <View style={styles.qrPlaceholder}>
          <Text style={styles.qrText}>QR Code</Text>
        </View>
      </View>
      <View style={styles.benefits}>
        <Text style={styles.benefitsTitle}>Card Benefits</Text>
        <Text style={styles.benefitItem}>• 5% Cashback on all purchases</Text>
        <Text style={styles.benefitItem}>• Valid at all partner venues</Text>
        <Text style={styles.benefitItem}>• Digital card - no physical card needed</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 16,
  },
  card: {
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  cardType: {
    color: '#E0E7FF',
    fontSize: 12,
    marginBottom: 32,
  },
  cardNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    marginBottom: 24,
  },
  qrPlaceholder: {
    backgroundColor: '#FFFFFF',
    height: 150,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrText: {
    fontSize: 16,
    color: '#6B7280',
  },
  benefits: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
  },
  benefitsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  benefitItem: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
});

export default CardWalletScreen;
