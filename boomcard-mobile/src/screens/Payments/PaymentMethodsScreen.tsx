/**
 * Payment Methods Screen
 *
 * Manage saved payment cards
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, Button, List, IconButton, FAB } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { paymentsApi } from '../../api/payments.api';

export default function PaymentMethodsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<any[]>([]);

  const loadCards = async () => {
    try {
      const data = await paymentsApi.getPaymentMethods();
      setCards(data.cards || []);
    } catch (error: any) {
      console.error('Failed to load cards:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, []);

  const handleSetDefault = async (cardId: string) => {
    try {
      await paymentsApi.setDefaultPaymentMethod(cardId);
      Alert.alert('Success', 'Default card updated');
      loadCards();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleRemoveCard = async (cardId: string) => {
    Alert.alert(
      'Remove Card',
      'Are you sure you want to remove this card?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await paymentsApi.removePaymentMethod(cardId);
              Alert.alert('Success', 'Card removed');
              loadCards();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  const getCardIcon = (brand: string) => {
    const icons: Record<string, string> = {
      visa: 'credit-card',
      mastercard: 'credit-card',
      amex: 'credit-card',
    };
    return icons[brand.toLowerCase()] || 'credit-card';
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading cards...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        {cards.length === 0 ? (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.emptyText}>No saved cards</Text>
              <Text style={styles.emptySubtext}>
                Add a card to make payments faster
              </Text>
            </Card.Content>
          </Card>
        ) : (
          cards.map((card: any) => (
            <Card key={card.id} style={styles.card}>
              <List.Item
                title={`${card.brand.toUpperCase()} •••• ${card.last4}`}
                description={`Expires ${card.expiryMonth}/${card.expiryYear}`}
                left={(props) => (
                  <List.Icon {...props} icon={getCardIcon(card.brand)} />
                )}
                right={() => (
                  <View style={styles.cardActions}>
                    {card.isDefault && (
                      <Text style={styles.defaultBadge}>DEFAULT</Text>
                    )}
                    {!card.isDefault && (
                      <Button
                        mode="text"
                        onPress={() => handleSetDefault(card.id)}
                      >
                        Set Default
                      </Button>
                    )}
                    <IconButton
                      icon="delete"
                      onPress={() => handleRemoveCard(card.id)}
                    />
                  </View>
                )}
              />
            </Card>
          ))
        )}
      </ScrollView>

      <FAB
        style={styles.fab}
        icon="plus"
        label="Add Card"
        onPress={() => (navigation as any).navigate('AddCard')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    margin: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 18,
    marginBottom: 8,
  },
  emptySubtext: {
    textAlign: 'center',
    opacity: 0.6,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  defaultBadge: {
    backgroundColor: '#4caf50',
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});
