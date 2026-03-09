import React from 'react';
import styled from 'styled-components';
import { useLanguage } from '../../../contexts/LanguageContext';

const APP_STORE_URL = 'https://apps.apple.com/app/boomcard/id6740091561';
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.boomcard.app';

const getDevicePlatform = (): 'ios' | 'android' | 'desktop' => {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
};

const getDownloadUrl = (): string => {
  const platform = getDevicePlatform();
  if (platform === 'ios') return APP_STORE_URL;
  if (platform === 'android') return GOOGLE_PLAY_URL;
  return APP_STORE_URL;
};

const Container = styled.div`
  text-align: center;
  padding: 2rem 0 1rem;
`;

const DownloadButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 2rem;
  background: #ffffff;
  color: #111827;
  border-radius: 0.75rem;
  font-size: 1.125rem;
  font-weight: 700;
  text-decoration: none;
  transition: all 200ms;
  box-shadow: 0 4px 15px rgba(255, 255, 255, 0.3);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 255, 255, 0.4);
  }

  [data-theme="color"] & {
    background: linear-gradient(135deg, #d946ef 0%, #a855f7 100%);
    color: white;
    box-shadow: 0 4px 15px rgba(168, 85, 247, 0.4);

    &:hover {
      box-shadow: 0 6px 20px rgba(168, 85, 247, 0.5);
    }
  }
`;

const SecondaryText = styled.p`
  font-size: 0.875rem;
  color: #9ca3af;
  margin-top: 0.75rem;

  [data-theme="dark"] & {
    color: #6b7280;
  }

  [data-theme="color"] & {
    color: #c4b5fd;
  }
`;

const StoreLinksRow = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1rem;
`;

const StoreLink = styled.a`
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  transition: all 200ms;
  opacity: 0.9;

  &:hover {
    opacity: 1;
    transform: translateY(-1px);
  }

  img {
    display: block;
  }
`;

const DownloadAppSection: React.FC = () => {
  const { language } = useLanguage();
  const isDesktop = getDevicePlatform() === 'desktop';

  const downloadCta = language === 'bg' ? 'Изтегли BOOM приложението' : 'Download the BOOM App';
  const availableText = language === 'bg' ? 'Налично за iOS и Android' : 'Available for iOS and Android';

  return (
    <Container>
      <DownloadButton
        href={getDownloadUrl()}
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '1.25rem', height: '1.25rem' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {downloadCta}
      </DownloadButton>
      <SecondaryText>{availableText}</SecondaryText>
      {isDesktop && (
        <StoreLinksRow>
          <StoreLink href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
            <img src="/badge-app-store.svg" alt="Download on the App Store" style={{ height: '2.25rem' }} />
          </StoreLink>
          <StoreLink href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer">
            <img src="/badge-google-play.svg" alt="Get it on Google Play" style={{ height: '2.25rem' }} />
          </StoreLink>
        </StoreLinksRow>
      )}
    </Container>
  );
};

export default DownloadAppSection;
