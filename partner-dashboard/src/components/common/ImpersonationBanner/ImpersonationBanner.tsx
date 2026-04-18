import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';

// Banner sits on top of a `position: fixed` Header. Both anchor to top: 0,
// so the banner (z-index 1100) used to sit flush with the header and hide
// its entire navigation + user menu. We now publish the banner's height as
// `--imp-banner-h` on <html> so the header can slide down and the main
// content can pad itself off. StyledHeader reads `top: var(--imp-banner-h, 0)`
// and Layout.tsx reads the same variable for its padding-top.
const BannerRoot = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1100;
  width: 100%;
  background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
`;

const BannerInner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 0.625rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const BannerIcon = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`;

const BannerText = styled.div`
  flex: 1;
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.3;

  strong {
    font-weight: 700;
  }
`;

const StopButton = styled.button`
  flex-shrink: 0;
  padding: 0.375rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 600;
  background: #ffffff;
  color: #92400e;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 150ms;

  &:hover {
    background: #fef3c7;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ImpersonationBanner: React.FC = () => {
  const { isImpersonating, user, stopImpersonating } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [stopping, setStopping] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Publish actual banner height as a CSS variable so the (position:fixed)
  // Header and main-content padding can offset by it. ResizeObserver covers
  // line-wrap on narrow viewports where flex-wrap changes the height.
  useEffect(() => {
    const root = document.documentElement;
    if (!isImpersonating) {
      root.style.removeProperty('--imp-banner-h');
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const sync = () => {
      root.style.setProperty('--imp-banner-h', `${el.offsetHeight}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--imp-banner-h');
    };
  }, [isImpersonating]);

  if (!isImpersonating || !user) return null;

  const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await stopImpersonating();
      navigate('/admin');
    } catch {
      // toast already shown
    } finally {
      setStopping(false);
    }
  };

  return (
    <BannerRoot ref={rootRef} role="alert" aria-live="polite">
      <BannerInner>
        <BannerIcon>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"
            />
          </svg>
        </BannerIcon>
        <BannerText>
          {t('impersonation.bannerPrefix')} <strong>{displayName}</strong>{t('impersonation.bannerSuffix')}
        </BannerText>
        <StopButton type="button" onClick={handleStop} disabled={stopping}>
          {stopping ? t('impersonation.stopping') : t('impersonation.stop')}
        </StopButton>
      </BannerInner>
    </BannerRoot>
  );
};

export default ImpersonationBanner;
