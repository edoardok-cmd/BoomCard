/**
 * Top Up Screen
 *
 * Allow users to top up their wallet with Paysera payment gateway
 */

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Card, Button, TextInput, HelperText } from 'react-native-paper';
import { crossPlatformAlert } from '../../utils/alert';
import { paymentService } from '../../services/payment.service';
import { useNavigation } from '@react-navigation/native';

const PRESET_AMOUNTS = [10, 20, 50, 100, 200];

export default function TopUpScreen() {
  const navigation = useNavigation();

  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAmountChange = (text: string) => {
    // Only allow digits and a single decimal point
    const filtered = text.replace(/[^0-9.]/g, '');
    // Prevent more than one decimal point
    const parts = filtered.split('.');
    const normalized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : filtered;
    setAmount(normalized);
    setAmountError(null);
  };

  const handlePresetAmount = (value: number) => {
    setAmount(value.toString());
    setAmountError(null);
  };

  const handleTopUp = async () => {
    const amountValue = parseFloat(amount);

    if (!amount || isNaN(amountValue) || amountValue < 5) {
      setAmountError('Minimum top-up amount is 5 BGN');
      return;
    }

    if (amountValue > 10000) {
      setAmountError('Maximum top-up amount is 10,000 BGN');
      return;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      setAmountError('Amount can have at most 2 decimal places');
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
        crossPlatformAlert(
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
        crossPlatformAlert(
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
      crossPlatformAlert('Error', error.message || 'Failed to process payment');
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
            onChangeText={handleAmountChange}
            keyboardType="decimal-pad"
            mode="outlined"
            style={styles.input}
            error={!!amountError}
          />
          <HelperText type={amountError ? 'error' : 'info'}>
            {amountError || 'Minimum: 5 BGN • Maximum: 10,000 BGN'}
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
            disabled={loading || !amount || !!amountError}
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
    backgroundColor: '#FAFBFC',
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
    backgroundColor: '#D4A843',
  },
  secureNote: {
    textAlign: 'center',
    marginTop: 8,
  },
});
