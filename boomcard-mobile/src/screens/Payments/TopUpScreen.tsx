/**
 * Top Up Screen
 *
 * Allow users to top up their wallet with Paysera payment gateway
 */

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, Button, TextInput, HelperText } from 'react-native-paper';
import { paymentService } from '../../services/payment.service';
import { useNavigation } from '@react-navigation/native';

const PRESET_AMOUNTS = [10, 20, 50, 100, 200];

export default function TopUpScreen() {
  const navigation = useNavigation();

  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePresetAmount = (value: number) => {
    setAmount(value.toString());
  };

  const handleTopUp = async () => {
    const amountValue = parseFloat(amount);

    if (!amountValue || amountValue < 5) {
      Alert.alert('Error', 'Minimum top-up amount is 5 BGN');
      return;
    }

    if (amountValue > 10000) {
      Alert.alert('Error', 'Maximum top-up amount is 10,000 BGN');
      return;
    }

    setLoading(true);

    try {
      // Process payment with Paysera (opens browser, handles payment, verifies)
      const result = await paymentService.processPayment({
        amount: amountValue,
        currency: 'BGN',
        description: 'Wallet top-up',
        metadata: {
          source: 'mobile_app',
          screen: 'TopUpScreen',
        },
      });

      if (result.success && result.status?.status === 'completed') {
        Alert.alert(
          'Success',
          `Your wallet has been topped up with ${amountValue} BGN`,
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        Alert.alert(
          'Payment Cancelled',
          'Your payment was cancelled. No charges were made.',
          [
            {
              text: 'OK',
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Title title="Top Up Wallet" />
        <Card.Content>
          {/* Preset Amounts */}
          <Text variant="labelLarge" style={styles.label}>
            Quick Amounts
          </Text>
          <View style={styles.presetContainer}>
            {PRESET_AMOUNTS.map((value) => (
              <Button
                key={value}
                mode={amount === value.toString() ? 'contained' : 'outlined'}
                style={styles.presetButton}
                onPress={() => handlePresetAmount(value)}
              >
                {value} BGN
              </Button>
            ))}
          </View>

          {/* Custom Amount */}
          <TextInput
            label="Custom Amount (BGN)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
          />
          <HelperText type="info">
            Minimum: 5 BGN • Maximum: 10,000 BGN
          </HelperText>

          {/* Payment Info */}
          <Text variant="bodyMedium" style={styles.paymentInfo}>
            You will be redirected to Paysera payment gateway to complete your payment securely.
          </Text>

          {/* Payment Button */}
          <Button
            mode="contained"
            onPress={handleTopUp}
            loading={loading}
            disabled={loading || !amount}
            style={styles.payButton}
          >
            {loading ? 'Processing...' : `Top Up ${amount || '0'} BGN`}
          </Button>

          <HelperText type="info" style={styles.secureNote}>
            Secure payment powered by Paysera
          </HelperText>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  card: {
    margin: 16,
  },
  label: {
    marginTop: 16,
    marginBottom: 8,
  },
  presetContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  presetButton: {
    flex: 1,
    minWidth: '30%',
  },
  input: {
    marginTop: 8,
  },
  paymentInfo: {
    marginTop: 24,
    marginBottom: 8,
    textAlign: 'center',
    color: '#666',
  },
  payButton: {
    marginTop: 16,
    paddingVertical: 8,
  },
  secureNote: {
    textAlign: 'center',
    marginTop: 8,
  },
});
