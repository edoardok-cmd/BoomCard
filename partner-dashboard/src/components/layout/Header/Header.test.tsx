import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { AuthProvider } from '../../../contexts/AuthContext';
import { FavoritesProvider } from '../../../contexts/FavoritesContext';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import Header from './Header';

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <FavoritesProvider>
            <MemoryRouter>
              {children}
            </MemoryRouter>
          </FavoritesProvider>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}

describe('Header', () => {
  beforeEach(() => {
    // Ensure English language in test environment (jsdom hostname ≠ boomcard.eu → defaults to bg)
    localStorage.setItem('boomcard_language', 'en');
    // No stored auth token — AuthProvider will initialise as logged-out without API calls
    localStorage.removeItem('token');
    localStorage.removeItem('boomcard_auth');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders without crashing', async () => {
    render(
      <AllProviders>
        <Header>Test</Header>
      </AllProviders>
    );

    // waitFor handles the async isLoading → false transition in AuthProvider
    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });
});
