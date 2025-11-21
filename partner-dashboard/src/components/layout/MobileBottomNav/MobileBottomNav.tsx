import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { useLanguage } from '../../../contexts/LanguageContext';

const BottomNav = styled.nav`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: var(--color-background);
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 0 0.5rem;
  z-index: 1000;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);

  @media (min-width: 768px) {
    display: none;
  }

  [data-theme="dark"] & {
    background: #1f2937;
    border-top-color: #374151;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
  }
`;

const NavItem = styled(Link)<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  height: 100%;
  text-decoration: none;
  color: ${props => props.$active ? 'var(--color-primary)' : 'var(--color-text-secondary)'};
  transition: all 200ms ease;
  position: relative;

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 24px;
    height: 24px;
    margin-bottom: 0.25rem;
    transition: transform 200ms ease;
  }

  span {
    font-size: 0.6875rem;
    font-weight: ${props => props.$active ? '600' : '500'};
    font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  ${props => props.$active && `
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 40px;
      height: 3px;
      background: var(--color-primary);
      border-radius: 0 0 3px 3px;
    }

    svg {
      transform: translateY(-2px);
    }
  `}

  &:hover {
    color: var(--color-primary);
  }
`;

export const MobileBottomNav: React.FC = () => {
  const { t } = useLanguage();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const navItems = [
    {
      path: '/',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      label: t('nav.home') || 'Home'
    },
    {
      path: '/offers',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
      label: t('nav.offers') || 'Offers'
    },
    {
      path: '/categories',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
      label: t('nav.categories') || 'Categories'
    },
    {
      path: '/favorites',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
      label: t('nav.favorites') || 'Favorites'
    },
    {
      path: '/profile',
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      label: t('nav.profile') || 'Profile'
    }
  ];

  return (
    <BottomNav>
      {navItems.map((item) => (
        <NavItem
          key={item.path}
          to={item.path}
          $active={isActive(item.path)}
          aria-label={item.label}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavItem>
      ))}
    </BottomNav>
  );
};

export default MobileBottomNav;
