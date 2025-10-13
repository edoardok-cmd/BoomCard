import React, { useState, useEffect, useRef } from 'react';
import { StyledHeader } from './Header.styles';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import Button from '../../common/Button/Button';
import MegaMenu from '../Navigation/MegaMenu';
import NotificationCenter from '../../common/NotificationCenter/NotificationCenter';
import { navigationConfig } from '../../../types/navigation';
import { useFavorites } from '../../../contexts/FavoritesContext';
import { useAuth } from '../../../contexts/AuthContext';

const FavoritesLink = styled(Link)`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  color: #374151;
  transition: all 200ms;

  &:hover {
    background: #f3f4f6;
    color: #111827;
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }
`;

const MobileFavoritesLink = styled(Link)`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 0.75rem;
  background: #f9fafb;
  color: #111827;
  font-weight: 500;
  transition: all 200ms;

  &:hover {
    background: #f3f4f6;
  }

  svg {
    width: 1.5rem;
    height: 1.5rem;
  }
`;

const MobileFavoritesBadge = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  height: 1.5rem;
  padding: 0 0.375rem;
  background: #ef4444;
  color: white;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-left: auto;
`;

const FavoritesBadge = styled(motion.span)`
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.25rem;
  background: #ef4444;
  color: white;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 700;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const UserMenuContainer = styled.div`
  position: relative;
`;

const UserButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 9999px;
  background: white;
  cursor: pointer;
  transition: all 200ms;

  &:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }
`;

const UserAvatar = styled.div`
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #111827 0%, #374151 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
`;

const UserName = styled.span`
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 1024px) {
    display: none;
  }
`;

const UserMenuDropdown = styled(motion.div)`
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  width: 15rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  z-index: 50;
`;

const UserMenuHeader = styled.div`
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
`;

const UserMenuEmail = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const UserMenuName = styled.div`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;
`;

const UserMenuItems = styled.nav`
  padding: 0.5rem 0;
`;

const UserMenuItem = styled(Link)`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  color: #374151;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 200ms;

  &:hover {
    background: #f9fafb;
    color: #111827;
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
    color: #6b7280;
  }
`;

const UserMenuDivider = styled.div`
  height: 1px;
  background: #e5e7eb;
  margin: 0.5rem 0;
`;

const UserMenuButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  color: #ef4444;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 200ms;
  text-align: left;

  &:hover {
    background: #fef2f2;
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`;

export interface HeaderProps {
  children?: React.ReactNode;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  children,
  className
}) => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [language, setLanguage] = useState<'en' | 'bg'>('en');
  const { favoritesCount } = useFavorites();
  const { user, isAuthenticated, logout } = useAuth();
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 10;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [scrolled]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    if (mobileMenuOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    navigate('/');
  };

  const getUserInitials = () => {
    if (!user) return '';
    return `${user.firstName[0]}${user.lastName[0]}`;
  };

  return (
    <StyledHeader className={`${className || ''} ${scrolled ? 'scrolled' : ''}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center z-50">
            <span className="text-2xl font-bold text-gray-900">BoomCard</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center flex-1 justify-center">
            <MegaMenu items={navigationConfig.main} language={language} />
          </div>

          {/* Desktop Buttons & Language Toggle */}
          <div className="hidden lg:flex items-center gap-4">
            {/* Nearby Offers */}
            <FavoritesLink to="/nearby" aria-label="Nearby Offers">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </FavoritesLink>

            {/* Favorites */}
            <FavoritesLink to="/favorites" aria-label="Favorites">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
              <AnimatePresence>
                {favoritesCount > 0 && (
                  <FavoritesBadge
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  >
                    {favoritesCount > 99 ? '99+' : favoritesCount}
                  </FavoritesBadge>
                )}
              </AnimatePresence>
            </FavoritesLink>

            {/* Notification Center */}
            {isAuthenticated && <NotificationCenter />}

            {/* Language Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
              <button
                onClick={() => setLanguage('en')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  language === 'en'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLanguage('bg')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  language === 'bg'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                BG
              </button>
            </div>

            {isAuthenticated && user ? (
              <UserMenuContainer ref={userMenuRef}>
                <UserButton onClick={() => setUserMenuOpen(!userMenuOpen)}>
                  <UserAvatar>{getUserInitials()}</UserAvatar>
                  <UserName>{user.firstName}</UserName>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    style={{
                      transform: userMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 200ms',
                    }}
                  >
                    <path
                      d="M4 6L8 10L12 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </UserButton>

                <AnimatePresence>
                  {userMenuOpen && (
                    <UserMenuDropdown
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <UserMenuHeader>
                        <UserMenuName>{`${user.firstName} ${user.lastName}`}</UserMenuName>
                        <UserMenuEmail>{user.email}</UserMenuEmail>
                      </UserMenuHeader>

                      <UserMenuItems>
                        <UserMenuItem
                          to="/profile"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                          {language === 'bg' ? 'Профил' : 'Profile'}
                        </UserMenuItem>

                        <UserMenuItem
                          to="/dashboard"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                            />
                          </svg>
                          {language === 'bg' ? 'Моите карти' : 'My Cards'}
                        </UserMenuItem>

                        <UserMenuItem
                          to="/favorites"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                            />
                          </svg>
                          {language === 'bg' ? 'Любими' : 'Favorites'}
                        </UserMenuItem>

                        <UserMenuItem
                          to="/rewards"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"
                            />
                          </svg>
                          {language === 'bg' ? 'Награди' : 'Rewards'}
                        </UserMenuItem>

                        <UserMenuItem
                          to="/partners/offers"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                            />
                          </svg>
                          {language === 'bg' ? 'Моите Оферти' : 'My Offers'}
                        </UserMenuItem>

                        <UserMenuItem
                          to="/analytics"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                            />
                          </svg>
                          {language === 'bg' ? 'Анализи' : 'Analytics'}
                        </UserMenuItem>

                        <UserMenuItem
                          to="/settings"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          {language === 'bg' ? 'Настройки' : 'Settings'}
                        </UserMenuItem>

                        <UserMenuDivider />

                        <UserMenuButton onClick={handleLogout}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                          </svg>
                          {language === 'bg' ? 'Изход' : 'Logout'}
                        </UserMenuButton>
                      </UserMenuItems>
                    </UserMenuDropdown>
                  )}
                </AnimatePresence>
              </UserMenuContainer>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="small">
                    {language === 'bg' ? 'Вход' : 'Sign In'}
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary" size="small">
                    {language === 'bg' ? 'Регистрация' : 'Get Started'}
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden z-50 p-2 text-gray-700 hover:text-gray-900 transition-colors"
            aria-label="Toggle menu"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
            />

            {/* Menu Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white shadow-2xl z-40 lg:hidden overflow-y-auto"
            >
              <div className="p-6 pt-20">
                {/* Language Toggle Mobile */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 mb-6">
                  <button
                    onClick={() => setLanguage('en')}
                    className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      language === 'en'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    onClick={() => setLanguage('bg')}
                    className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      language === 'bg'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    BG
                  </button>
                </div>

                {/* Favorites Link Mobile */}
                <MobileFavoritesLink
                  to="/favorites"
                  onClick={() => setMobileMenuOpen(false)}
                  className="mb-6"
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                  <span>{language === 'bg' ? 'Любими' : 'Favorites'}</span>
                  {favoritesCount > 0 && (
                    <MobileFavoritesBadge>
                      {favoritesCount > 99 ? '99+' : favoritesCount}
                    </MobileFavoritesBadge>
                  )}
                </MobileFavoritesLink>

                {/* Mobile Navigation */}
                <nav className="mb-8">
                  <MegaMenu items={navigationConfig.main} language={language} />
                </nav>

                <div className="flex flex-col gap-3 pt-6 border-t border-gray-200">
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" size="large" className="w-full">
                      {language === 'bg' ? 'Вход' : 'Sign In'}
                    </Button>
                  </Link>
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="primary" size="large" className="w-full">
                      {language === 'bg' ? 'Регистрация' : 'Get Started'}
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {children}
    </StyledHeader>
  );
};

export default Header;