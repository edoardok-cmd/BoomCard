/**
 * Language Selection Screen
 *
 * Shown on first app launch to let users choose their preferred language.
 * Also includes a dark/light mode toggle.
 */

import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { changeLanguage } from '../i18n';
import { STORAGE_KEYS } from '../constants/config';
import { useTheme } from '../contexts/ThemeContext';

interface LanguageSelectionScreenProps {
  onLanguageSelected: () => void;
}

export default function LanguageSelectionScreen({ onLanguageSelected }: LanguageSelectionScreenProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const { isDarkMode, toggleTheme, theme } = useTheme();

  const styles = getStyles(theme, isDarkMode);

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
        {/* Theme Toggle */}
        <View style={styles.themeToggleContainer}>
          <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
            <Ionicons
              name={isDarkMode ? 'sunny' : 'moon'}
              size={22}
              color={isDarkMode ? '#FCD34D' : '#6B7280'}
            />
          </TouchableOpacity>
        </View>

        {/* Logo or App Icon */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
          </View>
          <Text variant="headlineLarge" style={styles.appName}>
            BOOM Card
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
              <Ionicons name="checkmark-circle" size={28} color={theme.colors.primary} />
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
              <Ionicons name="checkmark-circle" size={28} color={theme.colors.primary} />
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

const getStyles = (theme: any, isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },

  // Theme Toggle
  themeToggleContainer: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
  },
  themeToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },

  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  logoImage: {
    width: 90,
    height: 90,
  },
  appName: {
    fontWeight: 'bold',
    color: theme.colors.onSurface,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontWeight: '600',
    color: theme.colors.onSurface,
    textAlign: 'center',
    marginBottom: 8,
  },
  titleBg: {
    fontWeight: '600',
    color: theme.colors.onSurfaceVariant,
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
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.colors.surfaceVariant,
  },
  languageButtonSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0, 0, 0, 0.04)',
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
    color: theme.colors.onSurface,
  },
  languageSubtext: {
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  footer: {
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
    marginTop: 8,
  },
});
