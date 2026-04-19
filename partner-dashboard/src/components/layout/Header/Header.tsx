import React, { useState, useEffect, useRef } from 'react';
import { StyledHeader } from './Header.styles';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import Button from '../../common/Button/Button';
import MegaMenu from '../Navigation/MegaMenu';
import NotificationCenter from '../../common/NotificationCenter/NotificationCenter';
import SocialShareButton from '../../common/ShareButton/ShareButton';
import Tooltip from '../../common/Tooltip/Tooltip';
import { navigationConfig } from '../../../types/navigation';
import { useFavorites } from '../../../contexts/FavoritesContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme, ThemeMode } from '../../../contexts/ThemeContext';
import { apiService } from '../../../services/api.service';

interface ImpersonatablePartner {
  partnerId: string;
  userId: string;
  businessName: string;
  businessNameBg?: string | null;
  logo?: string | null;
  status: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
}


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

  [data-theme="dark"] & {
    background: #374151;
    color: #f9fafb;
  }

  &:hover {
    background: #f3f4f6;

    [data-theme="dark"] & {
      background: #4b5563;
    }
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

  [data-theme="dark"] & {
    background: #374151;
    border-color: #4b5563;
  }

  &:hover {
    background: #f9fafb;
    border-color: #d1d5db;

    [data-theme="dark"] & {
      background: #4b5563;
      border-color: #6b7280;
    }
  }

  @media (max-width: 640px) {
    padding: 0.25rem 0.5rem;
    gap: 0.375rem;
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

  @media (max-width: 640px) {
    width: 1.75rem;
    height: 1.75rem;
    font-size: 0.75rem;
  }
`;

const UserName = styled.span`
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  [data-theme="dark"] & {
    color: #d1d5db;
  }

  @media (max-width: 1400px) {
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
  max-height: calc(100vh - 5rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  z-index: 50;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  }
`;

const UserMenuHeader = styled.div`
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;

  [data-theme="dark"] & {
    background: #111827;
    border-bottom-color: #374151;
  }
`;

const UserMenuEmail = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const UserMenuName = styled.div`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const UserMenuRoleBadge = styled.span<{ $role: 'admin' | 'partner' | 'user'; $impersonating?: boolean }>`
  display: inline-block;
  margin-top: 0.375rem;
  padding: 0.1875rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 999px;
  background: ${p =>
    p.$impersonating
      ? '#fef3c7'
      : p.$role === 'admin'
        ? '#ede9fe'
        : p.$role === 'partner'
          ? '#dcfce7'
          : '#e5e7eb'};
  color: ${p =>
    p.$impersonating
      ? '#92400e'
      : p.$role === 'admin'
        ? '#5b21b6'
        : p.$role === 'partner'
          ? '#166534'
          : '#374151'};

  [data-theme="dark"] & {
    background: ${p =>
      p.$impersonating
        ? '#78350f'
        : p.$role === 'admin'
          ? '#4c1d95'
          : p.$role === 'partner'
            ? '#14532d'
            : '#374151'};
    color: ${p =>
      p.$impersonating
        ? '#fde68a'
        : p.$role === 'admin'
          ? '#ddd6fe'
          : p.$role === 'partner'
            ? '#bbf7d0'
            : '#e5e7eb'};
  }
`;

const UserMenuItems = styled.nav`
  padding: 0.5rem 0;
`;

const UserMenuButtonItem = styled.button`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  color: #374151;
  text-align: left;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 200ms;

  [data-theme="dark"] & {
    color: #d1d5db;
  }

  &:hover {
    background: #f9fafb;
    color: #111827;

    [data-theme="dark"] & {
      background: #374151;
      color: #f9fafb;
    }
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
    color: #6b7280;

    [data-theme="dark"] & {
      color: #9ca3af;
    }
  }
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

  [data-theme="dark"] & {
    color: #d1d5db;
  }

  &:hover {
    background: #f9fafb;
    color: #111827;

    [data-theme="dark"] & {
      background: #374151;
      color: #f9fafb;
    }
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
    color: #6b7280;

    [data-theme="dark"] & {
      color: #9ca3af;
    }
  }
`;

const UserMenuDivider = styled.div`
  height: 1px;
  background: #e5e7eb;
  margin: 0.5rem 0;

  [data-theme="dark"] & {
    background: #374151;
  }
`;

const AccountSwitcherSection = styled.div`
  padding: 0.5rem 0;
  border-bottom: 1px solid #e5e7eb;

  [data-theme="dark"] & {
    border-bottom-color: #374151;
  }
`;

const AccountSwitcherLabel = styled.div`
  padding: 0.25rem 1rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #9ca3af;

  [data-theme="dark"] & {
    color: #6b7280;
  }
`;

const AccountSwitcherItem = styled.button<{ $active: boolean; $disabled: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.5rem 1rem;
  background: ${p => (p.$active ? '#f3f4f6' : 'transparent')};
  border: none;
  color: #111827;
  font-size: 0.8125rem;
  font-weight: 500;
  text-align: left;
  cursor: ${p => (p.$disabled ? 'not-allowed' : 'pointer')};
  opacity: ${p => (p.$disabled && !p.$active ? 0.6 : 1)};
  transition: background 150ms;

  [data-theme="dark"] & {
    background: ${p => (p.$active ? '#374151' : 'transparent')};
    color: #f9fafb;
  }

  &:hover {
    background: ${p => (p.$disabled ? (p.$active ? '#f3f4f6' : 'transparent') : '#f9fafb')};

    [data-theme="dark"] & {
      background: ${p => (p.$disabled ? (p.$active ? '#374151' : 'transparent') : '#374151')};
    }
  }
`;

const AccountSwitcherAvatar = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  background: ${p => (p.$active ? 'linear-gradient(135deg, #111827 0%, #374151 100%)' : '#e5e7eb')};
  color: ${p => (p.$active ? 'white' : '#6b7280')};
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;

  [data-theme="dark"] & {
    background: ${p => (p.$active ? 'linear-gradient(135deg, #f9fafb 0%, #d1d5db 100%)' : '#4b5563')};
    color: ${p => (p.$active ? '#111827' : '#d1d5db')};
  }
`;

const AccountSwitcherBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const AccountSwitcherName = styled.div`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const AccountSwitcherRole = styled.div`
  font-size: 0.6875rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.03em;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const AccountSwitcherCheck = styled.div`
  flex-shrink: 0;
  color: #10b981;

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

const ImpersonateOverlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1000;
`;

const ImpersonateModal = styled(motion.div)`
  width: 100%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  overflow: hidden;

  [data-theme="dark"] & {
    background: #1f2937;
  }
`;

const ImpersonateModalHeader = styled.div`
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e5e7eb;

  [data-theme="dark"] & {
    border-bottom-color: #374151;
  }
`;

const ImpersonateModalTitle = styled.h3`
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const ImpersonateModalSubtitle = styled.p`
  margin: 0.25rem 0 0 0;
  font-size: 0.8125rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const ImpersonateSearchInput = styled.input`
  width: 100%;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: #ffffff;
  color: #111827;
  outline: none;
  margin-top: 0.75rem;

  &:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }

  [data-theme="dark"] & {
    background: #111827;
    border-color: #374151;
    color: #f9fafb;
  }
`;

const ImpersonateModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0;
`;

const ImpersonateModalFooter = styled.div`
  padding: 0.75rem 1.25rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;

  [data-theme="dark"] & {
    border-top-color: #374151;
  }
`;

const ImpersonateCancelButton = styled.button`
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #374151;
  border-radius: 0.5rem;
  cursor: pointer;

  [data-theme="dark"] & {
    background: transparent;
    border-color: #374151;
    color: #d1d5db;
  }
`;

const ImpersonateEmptyState = styled.div`
  padding: 2rem 1.25rem;
  text-align: center;
  font-size: 0.875rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
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

    [data-theme="dark"] & {
      background: rgba(239, 68, 68, 0.1);
    }
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`;

const ThemeMenuContainer = styled.div`
  position: relative;
`;

const ThemeButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: #374151;
  cursor: pointer;
  transition: all 200ms;

  [data-theme="dark"] & {
    color: #d1d5db;
  }

  &:hover {
    background: #f3f4f6;
    color: #111827;

    [data-theme="dark"] & {
      background: #374151;
      color: #f9fafb;
    }
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  @media (max-width: 640px) {
    width: 2.25rem;
    height: 2.25rem;

    svg {
      width: 1.125rem;
      height: 1.125rem;
    }
  }
`;

const ThemeMenuDropdown = styled(motion.div)`
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  min-width: 12rem;
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  padding: 0.5rem;
  z-index: 1000;
  border: 1px solid #e5e7eb;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  }
`;

const ThemeOption = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: ${props => props.$active ? '#f3f4f6' : 'transparent'};
  border: none;
  border-radius: 0.5rem;
  color: ${props => props.$active ? '#111827' : '#374151'};
  font-size: 0.875rem;
  font-weight: ${props => props.$active ? '600' : '500'};
  cursor: pointer;
  transition: all 200ms;
  text-align: left;

  [data-theme="dark"] & {
    background: ${props => props.$active ? '#374151' : 'transparent'};
    color: ${props => props.$active ? '#f9fafb' : '#d1d5db'};
  }

  &:hover {
    background: #f3f4f6;
    color: #111827;

    [data-theme="dark"] & {
      background: #374151;
      color: #f9fafb;
    }
  }

  svg, span {
    width: 1.125rem;
    height: 1.125rem;
    flex-shrink: 0;
  }
`;

const LanguageButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  color: #374151;
  transition: all 200ms;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;

  [data-theme="dark"] & {
    color: #d1d5db;
  }

  &:hover {
    background: #f3f4f6;
    color: #111827;

    [data-theme="dark"] & {
      background: #374151;
      color: #f9fafb;
    }
  }

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }

  @media (max-width: 640px) {
    width: 2.25rem;
    height: 2.25rem;

    svg {
      width: 1rem;
      height: 1rem;
    }
  }
`;

const MobileMenuPanel = styled(motion.div)`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  height: 100vh;
  width: 100%;
  max-width: 32rem;
  background: var(--color-background, #ffffff);
  box-shadow: 0 20px 60px -15px rgba(0, 0, 0, 0.3);
  z-index: 9999;
  overflow-y: auto;
  transition: background-color 0.3s ease;

  [data-theme="dark"] & {
    background: var(--color-background, #0f172a);
  }

  @media (min-width: 1400px) {
    display: none;
  }
`;

const SearchButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: #374151;
  cursor: pointer;
  transition: all 200ms;

  [data-theme="dark"] & {
    color: #d1d5db;
  }

  &:hover {
    background: #f3f4f6;
    color: #111827;

    [data-theme="dark"] & {
      background: #374151;
      color: #f9fafb;
    }
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  @media (max-width: 640px) {
    width: 2.25rem;
    height: 2.25rem;

    svg {
      width: 1.125rem;
      height: 1.125rem;
    }
  }
`;

const SearchBarContainer = styled(motion.div)`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  z-index: 40;

  [data-theme="dark"] & {
    background: #1f2937;
    border-bottom-color: #374151;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
  }
`;

const SearchBarInner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 1.5rem 3rem;

  @media (max-width: 1024px) {
    padding: 1.25rem 1.5rem;
  }

  @media (max-width: 640px) {
    padding: 1rem 0.75rem;
  }
`;

const SearchInputWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const SearchInput = styled.input`
  flex: 1;
  padding: 0.875rem 1rem 0.875rem 3rem;
  background: #f9fafb;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  color: #111827;
  font-size: 1rem;
  transition: all 200ms;

  [data-theme="dark"] & {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }

  &:focus {
    outline: none;
    border-color: #3b82f6;
    background: white;

    [data-theme="dark"] & {
      background: #1f2937;
      border-color: #60a5fa;
    }
  }

  &::placeholder {
    color: #9ca3af;

    [data-theme="dark"] & {
      color: #6b7280;
    }
  }

  @media (max-width: 640px) {
    padding: 0.75rem 0.875rem 0.75rem 2.75rem;
    font-size: 0.9375rem;
  }
`;

const SearchIconWrapper = styled.div`
  position: absolute;
  left: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;

  [data-theme="dark"] & {
    color: #6b7280;
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  @media (max-width: 640px) {
    left: 0.875rem;

    svg {
      width: 1.125rem;
      height: 1.125rem;
    }
  }
`;

const SearchCloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  transition: all 200ms;

  [data-theme="dark"] & {
    color: #9ca3af;
  }

  &:hover {
    background: #f3f4f6;
    color: #111827;

    [data-theme="dark"] & {
      background: #4b5563;
      color: #f9fafb;
    }
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  @media (max-width: 640px) {
    padding: 0.625rem;

    svg {
      width: 1.125rem;
      height: 1.125rem;
    }
  }
`;

export interface HeaderProps {
  children?: React.ReactNode;
  className?: string;
}

// Header component with theme support
export const Header: React.FC<HeaderProps> = ({
  children,
  className
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { favoritesCount } = useFavorites();
  const {
    user,
    isAuthenticated,
    logout,
    switchableAccounts,
    switchAccount,
    isImpersonating,
    impersonate,
    stopImpersonating,
  } = useAuth();
  const [isSwitching, setIsSwitching] = useState<string | null>(null);
  const [impersonateModalOpen, setImpersonateModalOpen] = useState(false);
  const [impersonatableSearch, setImpersonatableSearch] = useState('');
  const [impersonatablePartners, setImpersonatablePartners] = useState<ImpersonatablePartner[] | null>(null);
  const [impersonatableLoading, setImpersonatableLoading] = useState(false);
  const [impersonatableError, setImpersonatableError] = useState<string | null>(null);
  const [isImpersonateBusy, setIsImpersonateBusy] = useState<string | null>(null);
  const [isStoppingImpersonation, setIsStoppingImpersonation] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Fetch impersonatable partners lazily when the modal opens. Refetch each
  // open so admins see newly-onboarded partners without a full reload. If the
  // admin types in the search box, debouncing lives on the input itself —
  // here we just reload on open.
  useEffect(() => {
    if (!impersonateModalOpen) return;
    let cancelled = false;
    setImpersonatableLoading(true);
    setImpersonatableError(null);
    apiService
      .get<ImpersonatablePartner[] | { data?: ImpersonatablePartner[] }>('/auth/impersonatable-partners')
      .then((resp) => {
        if (cancelled) return;
        const list = Array.isArray(resp) ? resp : resp?.data;
        setImpersonatablePartners(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err?.response?.data?.error?.message
          || err?.response?.data?.message
          || err?.message
          || 'Failed to load partners';
        setImpersonatableError(message);
      })
      .finally(() => {
        if (!cancelled) setImpersonatableLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [impersonateModalOpen]);

  // Reset search + list on close so reopening starts clean.
  useEffect(() => {
    if (!impersonateModalOpen) {
      setImpersonatableSearch('');
      setImpersonatablePartners(null);
      setImpersonatableError(null);
      setIsImpersonateBusy(null);
    }
  }, [impersonateModalOpen]);

  // Close impersonate modal on Escape. Suppress while a request is in flight
  // so the admin doesn't accidentally dismiss the UI while a pick is still
  // being processed (the overlay click is already guarded against the same).
  useEffect(() => {
    if (!impersonateModalOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isImpersonateBusy === null) {
        setImpersonateModalOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [impersonateModalOpen, isImpersonateBusy]);

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

  // Close user menu when clicking outside — but suppress while a switch is
  // in flight so the success toast + navigate still happen on the same menu
  // the user initiated from (otherwise the menu would close mid-await and
  // the "Switched to X" UX feels like a cancellation).
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isSwitching !== null) return;
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
  }, [userMenuOpen, isSwitching]);

  // Close theme menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    };

    if (themeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [themeMenuOpen]);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };

    if (searchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [searchOpen]);

  // Auto-focus search input when search opens
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Close search on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };

    if (searchOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [searchOpen]);

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    navigate('/');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Navigate to search results page or handle search
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const handleSearchClose = () => {
    setSearchOpen(false);
    setSearchQuery('');
  };

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // If already on homepage, reload the page to scroll to top
    if (location.pathname === '/') {
      e.preventDefault();
      window.location.reload();
    }
  };

  const getUserInitials = () => {
    if (!user) return '';
    return `${user.firstName[0]}${user.lastName[0]}`;
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        );
      case 'dark':
        return (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        );
      case 'color':
        return (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        );
      default:
        return null;
    }
  };

  const themeOptions: { mode: ThemeMode; label: string; labelBg: string; icon: string; color: string }[] = [
    { mode: 'light', label: 'Light', labelBg: 'Светъл', icon: '☀️', color: '#000000' },
    { mode: 'dark', label: 'Dark', labelBg: 'Тъмен', icon: '🌙', color: '#06b6d4' },
    // Hidden: Vibrant mode
    // { mode: 'color', label: 'Vibrant', labelBg: 'Цветен', icon: '🎨', color: '#8b5cf6' },
  ];

  // Rendered in both the desktop user-menu dropdown and the mobile drawer so
  // narrow-viewport partner-dashboard users can also switch accounts.
  // `closeMenu` lets each surface dismiss its own container after success.
  const renderAccountSwitcher = (closeMenu: () => void) => {
    if (!user || switchableAccounts.length <= 1) return null;
    return (
      <AccountSwitcherSection>
        <AccountSwitcherLabel>
          {t('header.switchAccount')}
        </AccountSwitcherLabel>
        {switchableAccounts.map((account) => {
          const isActive = account.id === user.id;
          const displayName =
            account.businessName ||
            [account.firstName, account.lastName].filter(Boolean).join(' ') ||
            account.role;
          const initials = (
            account.businessName?.[0] ||
            account.firstName?.[0] ||
            account.role[0]
          ) + (
            account.businessName?.[1] ||
            account.lastName?.[0] ||
            ''
          );
          const roleLabel =
            account.role === 'SUPER_ADMIN' || account.role === 'ADMIN'
              ? t('header.role.admin')
              : account.role === 'PARTNER'
                ? t('header.role.partner')
                : account.role;
          const isRowBusy = isSwitching !== null;
          return (
            <AccountSwitcherItem
              key={account.id}
              $active={isActive}
              $disabled={isRowBusy || isActive}
              onClick={async () => {
                if (isActive || isRowBusy) return;
                setIsSwitching(account.id);
                try {
                  await switchAccount(account.id);
                  closeMenu();
                  // Send the user to a surface that makes sense for the
                  // new role — admin menu items and partner menu items
                  // don't overlap, so "stay on current route" usually 404s.
                  if (account.role === 'SUPER_ADMIN' || account.role === 'ADMIN') {
                    navigate('/admin');
                  } else if (account.role === 'PARTNER') {
                    navigate('/dashboard');
                  }
                } catch {
                  // toast already shown by switchAccount
                } finally {
                  setIsSwitching(null);
                }
              }}
            >
              <AccountSwitcherAvatar $active={isActive}>
                {initials.toUpperCase()}
              </AccountSwitcherAvatar>
              <AccountSwitcherBody>
                <AccountSwitcherName>{displayName}</AccountSwitcherName>
                <AccountSwitcherRole>{roleLabel}</AccountSwitcherRole>
              </AccountSwitcherBody>
              {isActive && (
                <AccountSwitcherCheck>
                  <svg viewBox="0 0 16 16" fill="none">
                    <path
                      d="M13.3334 4L6.00002 11.3333L2.66669 8"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </AccountSwitcherCheck>
              )}
            </AccountSwitcherItem>
          );
        })}
      </AccountSwitcherSection>
    );
  };

  return (
    <StyledHeader className={`${className || ''} ${scrolled ? 'scrolled' : ''}`}>
      <div className="w-full px-3 sm:px-6 lg:px-12">
        <div className="flex items-center justify-between h-16 relative">
          {/* Logo - Far Left */}
          <Link to="/" className="flex items-center z-50 flex-shrink-0" onClick={handleLogoClick}>
            <img
              src="/iconic.svg"
              alt="BOOM Card"
              className="h-10 sm:h-12 w-auto"
              style={{ transition: 'opacity 0.3s ease' }}
            />
          </Link>

          {/* Desktop Navigation - Absolutely centered on page */}
          <div className="hidden nav:flex items-center justify-center absolute left-1/2 transform -translate-x-1/2 pointer-events-auto" style={{ maxWidth: 'calc(100% - 500px)' }}>
            <MegaMenu items={navigationConfig.main} language={language} onMenuItemClick={undefined} />
          </div>

          {/* Right Side Utilities - Always Visible */}
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0 z-50">
            {/* Search Button */}
            <Tooltip content={language === 'bg' ? 'Търсене' : 'Search'} position="bottom">
              <SearchButton
                onClick={() => setSearchOpen(!searchOpen)}
                aria-label="Search"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </SearchButton>
            </Tooltip>


            {/* Theme Switcher - Desktop only */}
            <ThemeMenuContainer ref={themeMenuRef} className="hidden nav:flex">
              <Tooltip content={language === 'bg' ? 'Промени тема' : 'Change Theme'} position="bottom">
                <ThemeButton
                  onClick={() => setThemeMenuOpen(!themeMenuOpen)}
                  aria-label="Change theme"
                  data-testid="theme-picker"
                >
                  {getThemeIcon()}
                </ThemeButton>
              </Tooltip>

              <AnimatePresence>
                {themeMenuOpen && (
                  <ThemeMenuDropdown
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  >
                    {themeOptions.map((option) => (
                      <ThemeOption
                        key={option.mode}
                        $active={theme === option.mode}
                        onClick={() => {
                          setTheme(option.mode);
                          setThemeMenuOpen(false);
                        }}
                      >
                        <span style={{ fontSize: '1.25rem' }}>{option.icon}</span>
                        <span style={{ flex: 1 }}>{language === 'bg' ? option.labelBg : option.label}</span>
                        {theme === option.mode && (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            style={{ flexShrink: 0 }}
                          >
                            <path
                              d="M13.3334 4L6.00002 11.3333L2.66669 8"
                              stroke={option.color}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </ThemeOption>
                    ))}
                  </ThemeMenuDropdown>
                )}
              </AnimatePresence>
            </ThemeMenuContainer>

            {/* Language Toggle - Desktop only */}
            <Tooltip content={language === 'en' ? 'Switch to Bulgarian' : 'Превключи на английски'} position="bottom">
              <LanguageButton
                className="hidden nav:flex"
                onClick={() => setLanguage(language === 'en' ? 'bg' : 'en')}
                aria-label="Toggle language"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                  />
                </svg>
              </LanguageButton>
            </Tooltip>

            {isAuthenticated && user ? (
              <>
                <NotificationCenter />
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
                        <UserMenuRoleBadge $role={user.role} $impersonating={isImpersonating}>
                          {isImpersonating
                            ? t('header.role.impersonating')
                            : user.role === 'admin'
                              ? t('header.role.admin')
                              : user.role === 'partner'
                                ? t('header.role.partner')
                                : t('header.role.user')}
                        </UserMenuRoleBadge>
                      </UserMenuHeader>

                      {renderAccountSwitcher(() => setUserMenuOpen(false))}

                      <UserMenuItems>
                        {isImpersonating && (
                          <UserMenuButtonItem
                            type="button"
                            disabled={isStoppingImpersonation}
                            onClick={async () => {
                              if (isStoppingImpersonation) return;
                              setIsStoppingImpersonation(true);
                              try {
                                await stopImpersonating();
                                setUserMenuOpen(false);
                                navigate('/admin');
                              } catch {
                                // toast already shown
                              } finally {
                                setIsStoppingImpersonation(false);
                              }
                            }}
                          >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 19l-7-7 7-7"
                              />
                            </svg>
                            {t('impersonation.stop')}
                          </UserMenuButtonItem>
                        )}
                        {user.role === 'admin' && !isImpersonating && (
                          <UserMenuButtonItem
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false);
                              setImpersonateModalOpen(true);
                            }}
                          >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                            {t('header.impersonatePartner')}
                          </UserMenuButtonItem>
                        )}
                        {user.role === 'admin' ? (
                          <>
                            <UserMenuItem
                              to="/admin"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                                />
                              </svg>
                              {t('header.adminDashboard')}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/partners"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                              {t('header.managePartners')}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/top-discounts"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                                />
                              </svg>
                              {t('header.topDiscounts')}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/partner-types"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                />
                              </svg>
                              {t('header.partnerTypes')}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/receipts"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                              {t('header.adminReceipts')}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/scan-review"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M15 13l-3 3-1.5-1.5"
                                />
                              </svg>
                              {t('header.scanReview')}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/bulk-import"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                />
                              </svg>
                              {t('header.bulkImport')}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/cashback"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              {language === 'bg' ? 'Кешбек Плащания' : 'Cashback Payments'}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/cashback/rates"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                />
                              </svg>
                              {language === 'bg' ? 'Кешбек Ставки' : 'Cashback Rates'}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/merchant-whitelist"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                />
                              </svg>
                              {language === 'bg' ? 'Списък Търговци' : 'Merchant Whitelist'}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/venue-fraud-config"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                              {language === 'bg' ? 'Конфиг за Измами' : 'Venue Fraud Config'}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/receipt-templates"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                                />
                              </svg>
                              {language === 'bg' ? 'Шаблони за Бележки' : 'Receipt Templates'}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/admin/menu-approvals"
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
                              {language === 'bg' ? 'Одобрения на менюта' : 'Menu Approvals'}
                            </UserMenuItem>
                          </>
                        ) : user.role === 'partner' || isImpersonating ? (
                          <>
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
                              {t('header.profile')}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/partners/menus"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 6h16M4 12h16M4 18h7"
                                />
                              </svg>
                              {language === 'bg' ? 'Менюта на обектите' : 'Venue Menus'}
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
                              {t('header.analytics')}
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
                              {t('header.settings')}
                            </UserMenuItem>
                          </>
                        ) : (
                          <>
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
                              {t('header.profile')}
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
                              {t('header.myCards')}
                            </UserMenuItem>

                            <UserMenuItem
                              to="/nearby"
                              onClick={() => setUserMenuOpen(false)}
                            >
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
                              {t('header.nearby') || 'Nearby'}
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
                              {t('header.favorites')}
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
                              {t('header.rewards')}
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
                              {t('header.settings')}
                            </UserMenuItem>
                          </>
                        )}

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
                          {t('common.logout')}
                        </UserMenuButton>
                      </UserMenuItems>
                    </UserMenuDropdown>
                  )}
                </AnimatePresence>
              </UserMenuContainer>
              </>
            ) : (
              <>
                <Link to="/login" className="hidden nav:block">
                  <Button variant="ghost" size="small">
                    {t('common.signIn')}
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button - Show when menu is hidden */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="nav:hidden z-[10000] p-1.5 sm:p-2 transition-colors ml-1.5 sm:ml-2 flex-shrink-0"
            style={{
              color: 'var(--color-text-primary)'
            }}
            aria-label="Toggle menu"
          >
            <svg
              className="h-5 w-5 sm:h-6 sm:w-6"
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

      {/* Expandable Search Bar */}
      <AnimatePresence>
        {searchOpen && (
          <SearchBarContainer
            ref={searchRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <SearchBarInner>
              <form onSubmit={handleSearchSubmit}>
                <SearchInputWrapper>
                  <SearchIconWrapper>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </SearchIconWrapper>
                  <SearchInput
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={language === 'bg' ? 'Търсете оферти, партньори, локации...' : 'Search offers, partners, locations...'}
                  />
                  <SearchCloseButton
                    type="button"
                    onClick={handleSearchClose}
                    aria-label="Close search"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </SearchCloseButton>
                </SearchInputWrapper>
              </form>
            </SearchBarInner>
          </SearchBarContainer>
        )}
      </AnimatePresence>

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
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[9998] nav:hidden"
              style={{ height: '100vh', width: '100vw' }}
            />

              {/* Menu Panel */}
              <MobileMenuPanel
              data-testid="mobile-menu-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
            >
              <div className="p-6 pt-20">
                {/* Language Toggle Mobile */}
                <button
                  onClick={() => setLanguage(language === 'en' ? 'bg' : 'en')}
                  className="mb-4 flex items-center justify-center gap-3 px-4 py-3 rounded-lg transition-all"
                  style={{
                    width: '100%',
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)'
                  }}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '1.25rem', height: '1.25rem' }}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                    />
                  </svg>
                  <span className="font-semibold">{language === 'en' ? 'Switch to Bulgarian' : 'Превключи на английски'}</span>
                </button>

                {/* Theme Switcher Mobile */}
                <div className="mb-6 flex gap-2">
                  {themeOptions.map((option) => (
                    <button
                      key={option.mode}
                      onClick={() => setTheme(option.mode)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all ${
                        theme === option.mode
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={{
                        backgroundColor: theme === option.mode ? 'var(--color-primary)' : 'var(--color-background-secondary)',
                        color: theme === option.mode ? 'var(--color-secondary)' : 'var(--color-text-primary)'
                      }}
                    >
                      <span>{option.icon}</span>
                      <span className="text-sm font-medium">{option.label}</span>
                    </button>
                  ))}
                </div>

                {/* Account Switcher Mobile — only rendered when the session
                    has sibling accounts (same logic as the desktop dropdown). */}
                {isAuthenticated && (
                  <div className="mb-4">
                    {renderAccountSwitcher(() => setMobileMenuOpen(false))}
                  </div>
                )}

                {/* Nearby Link Mobile */}
                <MobileFavoritesLink
                  to="/nearby"
                  onClick={() => setMobileMenuOpen(false)}
                  className="mb-4"
                >
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
                  <span>{t('header.nearby') || 'Nearby'}</span>
                </MobileFavoritesLink>

                {/* Favorites Link Mobile - only for authenticated users */}
                {isAuthenticated ? (
                  <MobileFavoritesLink
                    to="/favorites"
                    onClick={() => setMobileMenuOpen(false)}
                    className="mb-4"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                    <span>{t('header.favorites')}</span>
                    {favoritesCount > 0 && (
                      <MobileFavoritesBadge>
                        {favoritesCount > 99 ? '99+' : favoritesCount}
                      </MobileFavoritesBadge>
                    )}
                  </MobileFavoritesLink>
                ) : (
                  <MobileFavoritesLink
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="mb-4"
                    style={{ opacity: 0.7 }}
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                    <span>{language === 'bg' ? 'Влезте за любими' : 'Sign in for favorites'}</span>
                  </MobileFavoritesLink>
                )}


                {/* Share Button Mobile */}
                <div className="mb-6">
                  <SocialShareButton
                    url={window.location.href}
                    title="BOOM Card - Live More, Pay Less"
                    description={language === 'bg' ? 'Открийте невероятни оферти и преживявания с BOOM Card' : 'Discover amazing offers and experiences with BOOM Card'}
                    buttonText={language === 'bg' ? 'Сподели' : 'Share'}
                    className="w-full"
                  />
                </div>

                {/* Mobile Navigation */}
                <nav className="mb-8">
                  <MegaMenu
                    items={navigationConfig.main}
                    language={language}
                    autoExpandOnMobile={false}
                    onMenuItemClick={() => setMobileMenuOpen(false)}
                  />
                </nav>

                <div className="flex flex-col gap-3 pt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" size="large" className="w-full">
                      {t('common.signIn')}
                    </Button>
                  </Link>
                </div>
              </div>
            </MobileMenuPanel>
          </>
        )}
      </AnimatePresence>

      {children}

      <AnimatePresence>
        {impersonateModalOpen && (
          <ImpersonateOverlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !isImpersonateBusy) {
                setImpersonateModalOpen(false);
              }
            }}
          >
            <ImpersonateModal
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.15 }}
            >
              <ImpersonateModalHeader>
                <ImpersonateModalTitle>
                  {t('impersonation.modalTitle')}
                </ImpersonateModalTitle>
                <ImpersonateModalSubtitle>
                  {t('impersonation.modalSubtitle')}
                </ImpersonateModalSubtitle>
                <ImpersonateSearchInput
                  autoFocus
                  type="text"
                  value={impersonatableSearch}
                  onChange={(e) => setImpersonatableSearch(e.target.value)}
                  placeholder={t('impersonation.searchPlaceholder')}
                />
              </ImpersonateModalHeader>

              <ImpersonateModalBody>
                {impersonatableLoading && (
                  <ImpersonateEmptyState>
                    {t('impersonation.loading')}
                  </ImpersonateEmptyState>
                )}
                {impersonatableError && !impersonatableLoading && (
                  <ImpersonateEmptyState>{impersonatableError}</ImpersonateEmptyState>
                )}
                {!impersonatableLoading && !impersonatableError && impersonatablePartners && (() => {
                  const term = impersonatableSearch.trim().toLowerCase();
                  const filtered = term
                    ? impersonatablePartners.filter((p) => {
                        return (
                          (p.businessName || '').toLowerCase().includes(term) ||
                          (p.businessNameBg || '').toLowerCase().includes(term) ||
                          (p.email || '').toLowerCase().includes(term) ||
                          (p.firstName || '').toLowerCase().includes(term) ||
                          (p.lastName || '').toLowerCase().includes(term)
                        );
                      })
                    : impersonatablePartners;

                  if (filtered.length === 0) {
                    return (
                      <ImpersonateEmptyState>
                        {t('impersonation.empty')}
                      </ImpersonateEmptyState>
                    );
                  }

                  return filtered.map((p) => {
                    const displayName = p.businessName || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
                    const initials = (
                      (p.businessName?.[0] || p.firstName?.[0] || p.email[0] || '?') +
                      (p.businessName?.[1] || p.lastName?.[0] || '')
                    ).toUpperCase();
                    const isRowBusy = isImpersonateBusy !== null;
                    return (
                      <AccountSwitcherItem
                        key={p.userId}
                        $active={false}
                        $disabled={isRowBusy}
                        onClick={async () => {
                          if (isRowBusy) return;
                          setIsImpersonateBusy(p.userId);
                          try {
                            await impersonate(p.userId);
                            setImpersonateModalOpen(false);
                            navigate('/dashboard');
                          } catch {
                            // toast already shown by impersonate()
                          } finally {
                            setIsImpersonateBusy(null);
                          }
                        }}
                      >
                        <AccountSwitcherAvatar $active={false}>{initials}</AccountSwitcherAvatar>
                        <AccountSwitcherBody>
                          <AccountSwitcherName>{displayName}</AccountSwitcherName>
                          <AccountSwitcherRole>{p.email}</AccountSwitcherRole>
                        </AccountSwitcherBody>
                      </AccountSwitcherItem>
                    );
                  });
                })()}
              </ImpersonateModalBody>

              <ImpersonateModalFooter>
                <ImpersonateCancelButton
                  type="button"
                  disabled={isImpersonateBusy !== null}
                  onClick={() => setImpersonateModalOpen(false)}
                >
                  {t('impersonation.cancel')}
                </ImpersonateCancelButton>
              </ImpersonateModalFooter>
            </ImpersonateModal>
          </ImpersonateOverlay>
        )}
      </AnimatePresence>
    </StyledHeader>
  );
};

export default Header;