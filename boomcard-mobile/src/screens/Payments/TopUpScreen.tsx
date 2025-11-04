/**
 * Top Up Screen
 *
 * Allow users to top up their wallet with Stripe card payment
 */

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { Text, Card, Button, TextInput, HelperText } from 'react-native-paper';
import { CardField, useConfirmPayment } from '@stripe/stripe-react-native';
import { walletApi } from '../../api/wallet.api';
import { useNavigation } from '@react-navigation/native';

const PRESET_AMOUNTS = [10, 20, 50, 100, 200];

export default function TopUpScreen() {
  const navigation = useNavigation();
  const { confirmPayment } = useConfirmPayment();

  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);

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

    if (!cardComplete) {
      Alert.alert('Error', 'Please enter valid card details');
      return;
    }

    setLoading(true);

    try {
      // Create payment intent
      const { paymentIntent, transaction } = await walletApi.createTopUp(amountValue);

      // Confirm payment with Stripe
      const { error, paymentIntent: confirmedPayment } = await confirmPayment(
        paymentIntent.clientSecret,
        {
          paymentMethodType: 'Card',
        }
      );

      if (error) {
        Alert.alert('Payment Failed', error.message);
        return;
      }

      if (confirmedPayment?.status === 'Succeeded') {
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

          {/* Card Details */}
          <Text variant="labelLarge" style={styles.label}>
            Card Details
          </Text>
          <View style={styles.cardFieldContainer}>
            <CardField
              postalCodeEnabled={false}
              placeholders={{
                number: '4242 4242 4242 4242',
              }}
              cardStyle={styles.cardField}
              style={styles.cardFieldWrapper}
              onCardChange={(cardDetails) => {
                setCardComplete(cardDetails.complete);
              }}
            />
          </View>

          {/* Payment Button */}
          <Button
            mode="contained"
            onPress={handleTopUp}
            loading={loading}
            disabled={loading || !amount || !cardComplete}
            style={styles.payButton}
          >
            {loading ? 'Processing...' : `Pay ${amount || '0'} BGN`}
          </Button>

          <HelperText type="info" style={styles.secureNote}>
            Your payment is secure and encrypted
          </HelperText>
        </Card.Content>
      </Card>

      {/* Test Cards Info (only in development) */}
      {__DEV__ && (
        <Card style={styles.card}>
          <Card.Title title="Test Cards (Development)" />
          <Card.Content>
            <Text variant="bodySmall">
              • Success: 4242 4242 4242 4242{'\n'}
              • Declined: 4000 0000 0000 0002{'\n'}
              • 3D Secure: 4000 0025 0000 3155
            </Text>
          </Card.Content>
        </Card>
      )}
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
  cardFieldContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  cardFieldWrapper: {
    height: 50,
  },
  cardField: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
  },
  payButton: {
    marginTop: 24,
    paddingVertical: 8,
  },
  secureNote: {
    textAlign: 'center',
    marginTop: 8,
  },
});
