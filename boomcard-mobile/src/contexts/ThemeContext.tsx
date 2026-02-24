/**
 * Theme Context
 *
 * Manages dark/light mode theme for the entire app
 * Integrates with react-native-paper for Material Design 3 themes
 */

import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { MD3LightTheme, MD3DarkTheme, Provider as PaperProvider } from 'react-native-paper';
import { useColorScheme } from 'react-native';
import StorageService from '../services/storage.service';

// Custom light theme colors — aligned with partner-dashboard website palette
const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#3B82F6', // Blue (website info/action color)
    onPrimary: '#FFFFFF',
    secondary: '#8B5CF6', // Purple
    tertiary: '#10B981', // Green (website accent)
    error: '#EF4444', // Red
    background: '#FFFFFF',
    surface: '#FAFBFC', // Website background-secondary
    surfaceVariant: '#F3F4F6', // Website background-tertiary
    onSurface: '#0F172A', // Website text-primary (slate-900)
    onSurfaceVariant: '#64748B', // Website text-secondary (slate-500)
    outline: '#E5E7EB', // Website border color
  },
};

// Custom dark theme colors — aligned with partner-dashboard website palette
const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#3B82F6', // Website dark mode primary (same blue)
    onPrimary: '#FFFFFF',
    secondary: '#8B5CF6', // Purple
    tertiary: '#34D399', // Green
    error: '#EF4444', // Red (website uses same)
    background: '#111827', // Deep dark
    surface: '#1F2937', // Website dark background
    surfaceVariant: '#374151', // Website dark border/tertiary
    onSurface: '#F8FAFC', // Website dark text-primary (slate-50)
    onSurfaceVariant: '#CBD5E1', // Website dark text-secondary (slate-300)
    outline: '#374151', // Website dark border
  },
};

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => Promise<void>;
  theme: typeof lightTheme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load theme preference from storage on mount
  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await StorageService.getTheme();

      if (savedTheme) {
        // Use saved preference
        setIsDarkMode(savedTheme === 'dark');
      } else {
        // Follow system preference if no saved preference
        setIsDarkMode(systemColorScheme === 'dark');
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
      // Fallback to system preference
      setIsDarkMode(systemColorScheme === 'dark');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTheme = async () => {
    try {
      const newTheme = !isDarkMode;
      setIsDarkMode(newTheme);
      await StorageService.setTheme(newTheme ? 'dark' : 'light');
    } catch (error) {
      console.error('Failed to save theme:', error);
      // Revert on error
      setIsDarkMode(!isDarkMode);
    }
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  // Show nothing while loading to avoid flash of wrong theme
  if (isLoading) {
    return null;
  }

  const value: ThemeContextType = {
    isDarkMode,
    toggleTheme,
    theme,
  };

  return (
    <ThemeContext.Provider value={value}>
      <PaperProvider theme={theme}>
        {children}
      </PaperProvider>
    </ThemeContext.Provider>
  );
};

/**
 * Hook to access theme context
 * Must be used within a ThemeProvider
 */
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
