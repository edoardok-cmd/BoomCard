/**
 * Language Selection Screen
 *
 * Shown on first app launch to let users choose their preferred language
 */

import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { changeLanguage } from '../i18n';
import { STORAGE_KEYS } from '../constants/config';

interface LanguageSelectionScreenProps {
  onLanguageSelected: () => void;
}

export default function LanguageSelectionScreen({ onLanguageSelected }: LanguageSelectionScreenProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);

  const handleLanguageSelect = async (language: string) => {
    setSelectedLanguage(language);

    // Set the language
    await changeLanguage(language);

    // Mark that language has been selected
    await SecureStore.setItemAsync(STORAGE_KEYS.LANGUAGE_SELECTED, 'true');

    // Notify parent that language has been selected
    setTimeout(() => {
      onLanguageSelected();
    }, 300);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo or App Icon */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="card" size={60} color="#4F46E5" />
          </View>
          <Text variant="headlineLarge" style={styles.appName}>
            BoomCard
          </Text>
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text variant="headlineSmall" style={styles.title}>
            Choose Your Language
          </Text>
          <Text variant="headlineSmall" style={styles.titleBg}>
            Изберете вашия език
          </Text>
        </View>

        {/* Language Options */}
        <View style={styles.languageContainer}>
          <TouchableOpacity
            style={[
              styles.languageButton,
              selectedLanguage === 'bg' && styles.languageButtonSelected
            ]}
            onPress={() => handleLanguageSelect('bg')}
          >
            <View style={styles.languageContent}>
              <Text style={styles.languageFlag}>🇧🇬</Text>
              <View style={styles.languageText}>
                <Text variant="titleLarge" style={styles.languageName}>
                  Български
                </Text>
                <Text variant="bodySmall" style={styles.languageSubtext}>
                  Bulgarian
                </Text>
              </View>
            </View>
            {selectedLanguage === 'bg' && (
              <Ionicons name="checkmark-circle" size={28} color="#4F46E5" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.languageButton,
              selectedLanguage === 'en' && styles.languageButtonSelected
            ]}
            onPress={() => handleLanguageSelect('en')}
          >
            <View style={styles.languageContent}>
              <Text style={styles.languageFlag}>🇬🇧</Text>
              <View style={styles.languageText}>
                <Text variant="titleLarge" style={styles.languageName}>
                  English
                </Text>
                <Text variant="bodySmall" style={styles.languageSubtext}>
                  Английски
                </Text>
              </View>
            </View>
            {selectedLanguage === 'en' && (
              <Ionicons name="checkmark-circle" size={28} color="#4F46E5" />
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text variant="bodySmall" style={styles.footer}>
          You can change this later in Settings
        </Text>
        <Text variant="bodySmall" style={styles.footer}>
          Можете да го промените по-късно в Настройки
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontWeight: 'bold',
    color: '#1F2937',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  titleBg: {
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  languageContainer: {
    gap: 16,
    marginBottom: 32,
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  languageButtonSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  languageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  languageFlag: {
    fontSize: 40,
  },
  languageText: {
    flex: 1,
  },
  languageName: {
    fontWeight: '600',
    color: '#1F2937',
  },
  languageSubtext: {
    color: '#6B7280',
    marginTop: 2,
  },
  footer: {
    textAlign: 'center',
    color: '#9CA3AF',
    marginTop: 8,
  },
});
