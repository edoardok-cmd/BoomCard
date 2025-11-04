/**
 * Add Card Screen
 *
 * Add a new payment method to saved cards using Stripe
 */

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, Button, Switch, HelperText } from 'react-native-paper';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import { useNavigation } from '@react-navigation/native';
import { paymentsApi } from '../../api/payments.api';

export default function AddCardScreen() {
  const navigation = useNavigation();
  const { createPaymentMethod } = useStripe();

  const [cardComplete, setCardComplete] = useState(false);
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleAddCard = async () => {
    if (!cardComplete) {
      Alert.alert('Error', 'Please enter valid card details');
      return;
    }

    setLoading(true);

    try {
      // Create payment method with Stripe
      const { paymentMethod, error } = await createPaymentMethod({
        paymentMethodType: 'Card',
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      if (!paymentMethod) {
        Alert.alert('Error', 'Failed to create payment method');
        return;
      }

      // Save payment method to backend
      await paymentsApi.addPaymentMethod(paymentMethod.id);

      // Set as default if requested
      if (setAsDefault) {
        await paymentsApi.setDefaultPaymentMethod(paymentMethod.id);
      }

      Alert.alert(
        'Success',
        'Card added successfully',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add card');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Title title="Add Payment Card" />
        <Card.Content>
          <Text variant="bodyMedium" style={styles.description}>
            Add a card to save it for future payments and wallet top-ups.
          </Text>

          {/* Card Input */}
          <Text variant="labelLarge" style={styles.label}>
            Card Details
          </Text>
          <View style={styles.cardFieldContainer}>
            <CardField
              postalCodeEnabled={true}
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

          <HelperText type="info">
            Your card details are securely processed by Stripe
          </HelperText>

          {/* Set as Default */}
          <View style={styles.switchContainer}>
            <View style={styles.switchLabel}>
              <Text variant="bodyLarge">Set as default card</Text>
              <Text variant="bodySmall" style={styles.switchSubtext}>
                Use this card for all future payments
              </Text>
            </View>
            <Switch
              value={setAsDefault}
              onValueChange={setSetAsDefault}
            />
          </View>

          {/* Add Button */}
          <Button
            mode="contained"
            onPress={handleAddCard}
            loading={loading}
            disabled={loading || !cardComplete}
            style={styles.addButton}
          >
            {loading ? 'Adding Card...' : 'Add Card'}
          </Button>

          <HelperText type="info" style={styles.secureNote}>
            Your payment information is encrypted and secure
          </HelperText>
        </Card.Content>
      </Card>

      {/* Security Info */}
      <Card style={styles.card}>
        <Card.Title title="Security & Privacy" />
        <Card.Content>
          <Text variant="bodySmall" style={styles.securityText}>
            • Your card details are encrypted and never stored on our servers{'\n'}
            • All payments are processed securely through Stripe{'\n'}
            • You can remove your card at any time{'\n'}
            • We never share your payment information
          </Text>
        </Card.Content>
      </Card>

      {/* Test Cards (Development) */}
      {__DEV__ && (
        <Card style={styles.card}>
          <Card.Title title="Test Cards (Development)" />
          <Card.Content>
            <Text variant="bodySmall">
              • Success: 4242 4242 4242 4242{'\n'}
              • Declined: 4000 0000 0000 0002{'\n'}
              • 3D Secure: 4000 0025 0000 3155{'\n'}
              • Insufficient funds: 4000 0000 0000 9995
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
    marginBottom: 8,
  },
  description: {
    marginBottom: 16,
    opacity: 0.7,
  },
  label: {
    marginTop: 16,
    marginBottom: 8,
  },
  cardFieldContainer: {
    marginTop: 8,
    marginBottom: 8,
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
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  switchLabel: {
    flex: 1,
    marginRight: 16,
  },
  switchSubtext: {
    opacity: 0.6,
    marginTop: 4,
  },
  addButton: {
    marginTop: 24,
    paddingVertical: 8,
  },
  secureNote: {
    textAlign: 'center',
    marginTop: 8,
  },
  securityText: {
    lineHeight: 20,
  },
});
