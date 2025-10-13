import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'gold' | 'red' | 'yellow' | 'blue';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleDarkMode: () => void;
  isDark: boolean;
  isColorMode: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'boomcard_theme';

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    // Load from localStorage or default to 'light'
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['light', 'dark', 'gold', 'red', 'yellow', 'blue'].includes(stored)) {
      return stored as ThemeMode;
    }
    return 'light';
  });

  // Apply theme to document
  useEffect(() => {
    // Set data-theme attribute on root element
    document.documentElement.setAttribute('data-theme', theme);

    // Persist to localStorage
    localStorage.setItem(STORAGE_KEY, theme);

    // Add/remove dark class for compatibility
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  const toggleDarkMode = () => {
    setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const isDark = theme === 'dark';
  const isColorMode = ['gold', 'red', 'yellow', 'blue'].includes(theme);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleDarkMode, isDark, isColorMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
