import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Footer from './Footer';

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn(), toggleLanguage: vi.fn(), t: (k: string) => k }),
}));

vi.mock('../../../contexts/CookieConsentContext', () => ({
  useCookieConsent: () => ({
    consent: null,
    preferences: { essential: true, analytics: false, marketing: false, functional: false },
    isConsentGiven: false,
    openSettings: vi.fn(),
    acceptAll: vi.fn(),
    rejectAll: vi.fn(),
    savePreferences: vi.fn(),
  }),
}));

describe('Footer', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <Footer>Test</Footer>
      </MemoryRouter>
    );
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
