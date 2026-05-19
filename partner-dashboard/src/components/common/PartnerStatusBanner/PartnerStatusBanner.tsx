import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useAuth } from '../../../contexts/AuthContext';

const BannerRoot = styled.div`
  position: fixed;
  top: var(--imp-banner-h, 0px);
  left: 0;
  right: 0;
  z-index: 1090;
  width: 100%;
  background: linear-gradient(90deg, #dc2626 0%, #b91c1c 100%);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
`;

const BannerInner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const BannerIcon = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`;

const BannerText = styled.p`
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.3;
`;

const PartnerStatusBanner: React.FC = () => {
  const { user, partnerRestriction } = useAuth();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isVisible = user?.role === 'partner' && !!partnerRestriction;

  useEffect(() => {
    const root = document.documentElement;
    if (!isVisible) {
      root.style.removeProperty('--partner-restriction-h');
      return;
    }
    const el = rootRef.current;
    if (!el) return;
    const sync = () => root.style.setProperty('--partner-restriction-h', `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--partner-restriction-h');
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <BannerRoot ref={rootRef} role="alert" aria-live="polite">
      <BannerInner>
        <BannerIcon>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </BannerIcon>
        <BannerText>
          ⚠️ Вашият партньорски акаунт е временно спрян. За повторно активиране се свържете с{' '}
          <strong>office@boomcard.bg</strong>.
        </BannerText>
      </BannerInner>
    </BannerRoot>
  );
};

export default PartnerStatusBanner;
