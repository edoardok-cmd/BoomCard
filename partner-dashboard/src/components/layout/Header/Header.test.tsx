import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Header from './Header';

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn(), toggleLanguage: vi.fn(), t: (k: string) => k }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    token: null,
    login: vi.fn(),
    loginWithOAuth: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    uploadAvatar: vi.fn(),
    removeAvatar: vi.fn(),
  }),
}));

vi.mock('../../../contexts/FavoritesContext', () => ({
  useFavorites: () => ({
    favorites: [],
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    isFavorite: vi.fn(() => false),
  }),
}));

vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
  ThemeMode: { LIGHT: 'light', DARK: 'dark', COLOR: 'color' },
}));

describe('Header', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <Header>Test</Header>
      </MemoryRouter>
    );
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
