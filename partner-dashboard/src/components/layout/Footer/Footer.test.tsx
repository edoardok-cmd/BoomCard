import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { CookieConsentProvider } from '../../../contexts/CookieConsentContext';
import Footer from './Footer';

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <CookieConsentProvider>
        <MemoryRouter>
          {children}
        </MemoryRouter>
      </CookieConsentProvider>
    </LanguageProvider>
  );
}

describe('Footer', () => {
  beforeEach(() => {
    // Ensure English language in test environment
    localStorage.setItem('boomcard_language', 'en');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders without crashing', async () => {
    render(
      <AllProviders>
        <Footer>Test</Footer>
      </AllProviders>
    );

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });
});
