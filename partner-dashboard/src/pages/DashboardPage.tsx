import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/common/Button/Button';
import { useCurrentPartner, usePartnerStats } from '../hooks/usePartners';
import { useOffers } from '../hooks/useOffers';
import { apiService } from '../services/api.service';

// B3 fix (r2q): gate the "Manage Offers" Quick Action card behind the same
// feature flag that controls the offer write routes (spec §8a — unspecified
// feature). Without this gate, the card always appears for Active partners
// regardless of whether the routes are registered, surfacing an unspecified
// feature to end-users.
const OFFER_MANAGEMENT_ENABLED = import.meta.env.VITE_OFFER_MANAGEMENT_ENABLED === 'true';
import { useCurrencyDisplay, formatWithCurrency } from '../utils/currencyDisplay';
import type { DualCurrencyAmount } from '../services/adminCashback.service';

const PageContainer = styled.div`
  max-width: 72rem;
  margin: 0 auto;
  padding: 2rem 1rem;
  min-height: calc(100vh - 4rem);
`;

const PageHeader = styled.div`
  margin-bottom: 2.5rem;
`;

const Title = styled.h1`
  font-size: 2.75rem;
  font-weight: 800;
  background: linear-gradient(135deg, #111827 0%, #4f46e5 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.625rem;
  letter-spacing: -0.03em;
  line-height: 1.2;

  [data-theme="dark"] & {
    background: linear-gradient(135deg, #f9fafb 0%, #a78bfa 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  @media (max-width: 640px) {
    font-size: 2rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.125rem;
  color: #6b7280;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.6;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1.5rem;
  margin-bottom: 2.5rem;
`;

const StatCard = styled(motion.div)`
  background: linear-gradient(to bottom right, #ffffff 0%, #fafbfc 100%);
  border-radius: 1.5rem;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.06),
    0 16px 48px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 2rem;
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;

  [data-theme="dark"] & {
    background: linear-gradient(to bottom right, #1f2937 0%, #111827 100%);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.3),
      0 8px 24px rgba(0, 0, 0, 0.2),
      0 16px 48px rgba(0, 0, 0, 0.1);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, #6366f1 0%, #a855f7 100%);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:hover {
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 12px 32px rgba(0, 0, 0, 0.1),
      0 24px 64px rgba(0, 0, 0, 0.08);
    transform: translateY(-6px);
    border-color: rgba(99, 102, 241, 0.2);

    [data-theme="dark"] & {
      box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.4),
        0 12px 32px rgba(0, 0, 0, 0.3),
        0 24px 64px rgba(0, 0, 0, 0.2);
      border-color: rgba(99, 102, 241, 0.4);
    }

    &::before {
      transform: scaleX(1);
    }
  }
`;

const StatLabel = styled.p`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.625rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const StatValue = styled.p`
  font-size: 2.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #111827 0%, #4f46e5 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.375rem;
  letter-spacing: -0.03em;
  line-height: 1.2;

  [data-theme="dark"] & {
    background: linear-gradient(135deg, #f9fafb 0%, #a78bfa 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
`;

const StatChange = styled.p<{ $positive?: boolean }>`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${props => props.$positive ? '#10b981' : '#6b7280'};

  [data-theme="dark"] & {
    color: ${props => props.$positive ? '#34d399' : '#9ca3af'};
  }
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
`;

const SectionTitle = styled.h2`
  font-size: 1.75rem;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.02em;
  line-height: 1.3;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
  gap: 1.5rem;
  margin-bottom: 2.5rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const BoomCardItem = styled(motion.div)`
  background: white;
  border-radius: 1.5rem;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.06),
    0 16px 48px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.3),
      0 8px 24px rgba(0, 0, 0, 0.2),
      0 16px 48px rgba(0, 0, 0, 0.1);
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 1.5rem;
    padding: 2px;
    background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 400ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:hover {
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 12px 32px rgba(0, 0, 0, 0.1),
      0 24px 64px rgba(0, 0, 0, 0.08);
    transform: translateY(-8px);
    border-color: rgba(99, 102, 241, 0.2);

    [data-theme="dark"] & {
      box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.4),
        0 12px 32px rgba(0, 0, 0, 0.3),
        0 24px 64px rgba(0, 0, 0, 0.2);
      border-color: rgba(99, 102, 241, 0.4);
    }

    &::after {
      opacity: 1;
    }
  }
`;

const ActionCardImage = styled.div<{ $imageUrl?: string }>`
  width: 100%;
  height: 200px;
  background: ${props => props.$imageUrl ? `url(${props.$imageUrl})` : 'var(--color-background-secondary)'};
  background-size: cover;
  background-position: center;
  overflow: hidden;
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 0.75rem 0.75rem 0 0;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%);
  }

  [data-theme="dark"] &::after {
    background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 100%);
  }
`;

const CardBody = styled.div`
  padding: 1.5rem;
`;

const VenueName = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
  letter-spacing: -0.015em;
  line-height: 1.3;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const VenueCategory = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const ActivityContainer = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 2.5rem;

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
`;

const ActivityList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

/* ActivityItem, ActivityContent, ActivityTitle, ActivityMeta removed —
   the hardcoded-data partner activity section was replaced with a
   spec-compliant empty state pending real API integration (MEDIUM-1 fix). */

/* ── Consumer-only styled components ── */

const CtaCard = styled(motion.div)`
  background: linear-gradient(135deg, #111827 0%, #4f46e5 100%);
  border-radius: 1.5rem;
  padding: 2rem 2.5rem;
  margin-bottom: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const CtaContent = styled.div``;

const CtaTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 800;
  color: white;
  margin-bottom: 0.375rem;
  letter-spacing: -0.02em;
`;

const CtaDesc = styled.p`
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.75);
`;

const SubscriptionCard = styled(motion.div)`
  background: white;
  border-radius: 1.5rem;
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 1.75rem 2rem;
  margin-bottom: 2.5rem;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.06),
    0 8px 24px rgba(0, 0, 0, 0.04);

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: rgba(255, 255, 255, 0.1);
  }
`;

const SubscriptionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

const SubscriptionMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const SubscriptionMetaLabel = styled.span`
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.07em;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const SubscriptionMetaValue = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const PlanBadge = styled.span<{ $plan: string }>`
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 1rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  background: ${({ $plan }) => {
    // Canonical SubscriptionPlan tokens: PREMIUM_MONTHLY (purple, top tier),
    // PREMIUM_WEEKLY (violet), BASIC (blue). Anything else falls back to grey.
    if ($plan === 'PREMIUM_MONTHLY') return 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)';
    if ($plan === 'PREMIUM_WEEKLY') return 'linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%)';
    if ($plan === 'BASIC') return 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)';
    return 'linear-gradient(135deg, #374151 0%, #6b7280 100%)';
  }};
  color: white;
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${({ $status }) => {
    if ($status === 'APPROVED' || $status === 'ACTIVE') return '#d1fae5';
    if ($status === 'PENDING' || $status === 'TRIALING') return '#fef3c7';
    if ($status === 'MANUAL_REVIEW') return '#dbeafe';
    if ($status === 'REJECTED' || $status === 'CANCELLED' || $status === 'FAILED_PAYMENT') return '#fee2e2';
    if ($status === 'PAST_DUE') return '#fff7ed';
    if ($status === 'EXPIRED') return '#f3f4f6';
    return '#f3f4f6';
  }};
  color: ${({ $status }) => {
    if ($status === 'APPROVED' || $status === 'ACTIVE') return '#065f46';
    if ($status === 'PENDING' || $status === 'TRIALING') return '#92400e';
    if ($status === 'MANUAL_REVIEW') return '#1e40af';
    if ($status === 'REJECTED' || $status === 'CANCELLED' || $status === 'FAILED_PAYMENT') return '#991b1b';
    if ($status === 'PAST_DUE') return '#c2410c';
    if ($status === 'EXPIRED') return '#374151';
    return '#374151';
  }};

  [data-theme="dark"] & {
    background: ${({ $status }) => {
      if ($status === 'APPROVED' || $status === 'ACTIVE') return 'rgba(16, 185, 129, 0.2)';
      if ($status === 'PENDING' || $status === 'TRIALING') return 'rgba(245, 158, 11, 0.2)';
      if ($status === 'MANUAL_REVIEW') return 'rgba(59, 130, 246, 0.2)';
      if ($status === 'REJECTED' || $status === 'CANCELLED' || $status === 'FAILED_PAYMENT') return 'rgba(239, 68, 68, 0.2)';
      if ($status === 'PAST_DUE') return 'rgba(234, 88, 12, 0.2)';
      if ($status === 'EXPIRED') return 'rgba(107, 114, 128, 0.2)';
      return 'rgba(107, 114, 128, 0.2)';
    }};
    color: ${({ $status }) => {
      if ($status === 'APPROVED' || $status === 'ACTIVE') return '#34d399';
      if ($status === 'PENDING' || $status === 'TRIALING') return '#fcd34d';
      if ($status === 'MANUAL_REVIEW') return '#93c5fd';
      if ($status === 'REJECTED' || $status === 'CANCELLED' || $status === 'FAILED_PAYMENT') return '#fca5a5';
      if ($status === 'PAST_DUE') return '#fb923c';
      if ($status === 'EXPIRED') return '#d1d5db';
      return '#d1d5db';
    }};
  }
`;

const TransactionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  gap: 1rem;

  [data-theme="dark"] & {
    background: #111827;
  }
`;

const TransactionInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const TransactionMerchant = styled.div`
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const TransactionDate = styled.div`
  font-size: 0.8125rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const TransactionAmount = styled.div`
  font-size: 1rem;
  font-weight: 700;
  color: #10b981;
  white-space: nowrap;

  [data-theme="dark"] & {
    color: #34d399;
  }
`;

const UpgradeBanner = styled(motion.div)`
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  border-radius: 1.5rem;
  padding: 1.75rem 2rem;
  margin-top: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const UpgradeBannerContent = styled.div``;

const UpgradeBannerTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: white;
  margin-bottom: 0.25rem;
`;

const UpgradeBannerDesc = styled.p`
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
`;

const EmptyMessage = styled.p`
  text-align: center;
  color: #6b7280;
  font-size: 0.9375rem;
  padding: 1.5rem 0;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

/* ── Partner status banners (spec §5.1, §11.2, §14.1) ── */

const BlockedBanner = styled(motion.div)`
  background: #fff1f2;
  border: 1.5px solid #fca5a5;
  border-radius: 1rem;
  padding: 2rem;
  text-align: center;
  margin-bottom: 2rem;
`;

const BlockedTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  color: #991b1b;
  margin-bottom: 0.5rem;
`;

const BlockedDesc = styled.p`
  font-size: 0.9375rem;
  color: #7f1d1d;
`;

const ErrorBanner = styled(motion.div)`
  background: #fffbeb;
  border: 1.5px solid #fcd34d;
  border-radius: 0.75rem;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
`;

const ErrorMessage = styled.p`
  font-size: 0.9375rem;
  color: #78350f;
`;

const ReadOnlyBanner = styled(motion.div)`
  background: #fef3c7;
  border: 1.5px solid #f59e0b;
  border-radius: 0.75rem;
  padding: 0.875rem 1.25rem;
  margin-bottom: 1.5rem;
`;

const ReadOnlyBannerText = styled.p`
  font-size: 0.875rem;
  color: #92400e;
  margin: 0;
`;

/* ── User dashboard status banners (§3.3, §3.5.1) ── */

const UserStatusBanner = styled(motion.div)<{ $variant: 'danger' | 'warning' }>`
  background: ${({ $variant }) => $variant === 'danger' ? '#fff1f2' : '#fffbeb'};
  border: 1.5px solid ${({ $variant }) => $variant === 'danger' ? '#fca5a5' : '#fcd34d'};
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  [data-theme="dark"] & {
    background: ${({ $variant }) => $variant === 'danger' ? 'rgba(153, 27, 27, 0.15)' : 'rgba(120, 53, 15, 0.15)'};
    border-color: ${({ $variant }) => $variant === 'danger' ? 'rgba(252, 165, 165, 0.5)' : 'rgba(252, 211, 77, 0.5)'};
  }

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

const UserStatusBannerText = styled.p<{ $variant: 'danger' | 'warning' }>`
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${({ $variant }) => $variant === 'danger' ? '#991b1b' : '#78350f'};
  margin: 0;

  [data-theme="dark"] & {
    color: ${({ $variant }) => $variant === 'danger' ? '#fca5a5' : '#fcd34d'};
  }
`;

const UserStatusBannerLink = styled(Link)<{ $variant: 'danger' | 'warning' }>`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${({ $variant }) => $variant === 'danger' ? '#991b1b' : '#78350f'};
  text-decoration: underline;
  white-space: nowrap;

  [data-theme="dark"] & {
    color: ${({ $variant }) => $variant === 'danger' ? '#fca5a5' : '#fcd34d'};
  }

  &:hover {
    opacity: 0.8;
  }
`;

/* ── User cashback card with 3-row layout ── */

const CashbackCard = styled(motion.div)`
  background: white;
  border-radius: 1.5rem;
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 1.75rem 2rem;
  margin-bottom: 2.5rem;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.06),
    0 8px 24px rgba(0, 0, 0, 0.04);

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: rgba(255, 255, 255, 0.1);
  }
`;

const CashbackRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0;

  & + & {
    border-top: 1px solid rgba(0, 0, 0, 0.06);

    [data-theme="dark"] & {
      border-top-color: rgba(255, 255, 255, 0.06);
    }
  }
`;

const CashbackRowLabel = styled.span`
  font-size: 0.9375rem;
  font-weight: 500;
  color: #374151;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const CashbackRowValue = styled.span<{ $highlighted?: boolean }>`
  font-size: 1rem;
  font-weight: 700;
  color: ${({ $highlighted }) => $highlighted ? '#dc2626' : '#111827'};

  [data-theme="dark"] & {
    color: ${({ $highlighted }) => $highlighted ? '#f87171' : '#f9fafb'};
  }
`;

const ExpiringLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.9375rem;
  font-weight: 500;
  color: #dc2626;

  [data-theme="dark"] & {
    color: #f87171;
  }
`;

/* ── Subscription auto-renewal indicator ── */

const AutoRenewalRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const AutoRenewalDot = styled.span<{ $on: boolean }>`
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: ${({ $on }) => $on ? '#10b981' : '#6b7280'};
  flex-shrink: 0;
`;

const AutoRenewalText = styled.span`
  font-size: 0.875rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

/* ── Types ── */

interface DashboardReceipt {
  id: string;
  merchantName: string;
  // Backend /dashboard/me wraps these through toDualCurrency() — they are
  // DualCurrencyAmount objects, not plain numbers (F2 fix).
  totalAmount: DualCurrencyAmount;
  cashbackAmount: DualCurrencyAmount;
  status: string;
  createdAt: string;
}

interface DashboardSubscription {
  plan: string;
  status: string;
  currentPeriodEnd?: string;
  // `gracePeriodEndsAt` removed: it is a phantom field — /dashboard/me never
  // returns it and the Subscription schema has no such column (SubscriptionPage
  // already documented this). The PAST_DUE grace banner that depended on it has
  // been removed accordingly.
  retryAttempt?: number;
  // §3.5.1: auto-renewal indicator displayed in the Subscription block.
  autoRenewal?: boolean;
}

interface DashboardWallet {
  availableBalance: number;
  pendingBalance: number;
  // §3.5.1: cashback expiring within 7 days — only shown when > 0.
  expiringBalance?: number;
}

interface DashboardData {
  subscription: DashboardSubscription;
  wallet: DashboardWallet;
  receipts: DashboardReceipt[];
  showUpgradePrompt?: boolean;
  // §7.3 / Clash 12.1: when true, wallet amounts are BGN scalars; when false, EUR scalars.
  // Populated by backend after parallel fix adds it to /api/dashboard/me.
  currencyWindowOpen?: boolean;
}

/* ── Component ── */

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  // MEDIUM-4: currency display mode — resolves to EUR_ONLY post-2026-01-01 (Clash 12.1).
  const currencyMode = useCurrencyDisplay();

  // MEDIUM-1: Admin users see a different dashboard view and must NOT trigger /partners/me.
  // Only users with role === 'partner' are actual partner accounts.
  const isPartner = user?.role === 'partner';

  // MEDIUM-1 fix: guard useCurrentPartner with isPartner so the query never fires
  // for consumer or admin users (prevents spurious /partners/me requests).
  const { data: partnerData, isLoading: isLoadingPartner, isError: isPartnerError } = useCurrentPartner(isPartner);
  const { data: stats, isLoading: isLoadingStats, isError: isStatsError } = usePartnerStats(partnerData?.id);
  // S2 fix: add enabled guard so the query never fires for consumer/admin users.
  // Without it, partnerData is null for non-partners and the query fires with
  // partnerId=undefined, sending spurious API requests on every consumer load.
  const { isLoading: isLoadingOffers, isError: isOffersError } = useOffers({
    partnerId: partnerData?.id,
    limit: 10,
    active: true,
    enabled: isPartner && !!partnerData?.id,
  });

  // INFO-1 fix (r2q): removed non-spec fields (activeOffers, totalOffers,
  // averageRating, totalReviews) — spec §5.3 KPIs are visits, transactions,
  // turnover, commission %, and expected amounts only.
  const fallbackStats = {
    totalRedemptions: 0,
    monthlyRedemptions: 0,
    revenue: 0,
    totalVenues: 0,
    // §5.3 extended KPIs (BC-PARTNER-PORTAL-SCOPE-B). Undefined → render "—".
    expectedAmount: undefined as number | undefined,
    totalVisits: undefined as number | undefined,
  };

  const displayStats = stats || (isStatsError || isPartnerError ? fallbackStats : null);

  const isLoading = (isLoadingPartner && !isPartnerError) ||
                    (isLoadingStats && !isStatsError && !!partnerData?.id) ||
                    (isLoadingOffers && !isOffersError && !!partnerData?.id);

  // MEDIUM-2: when partner fetch fails and no data is available, we cannot
  // determine the actual partner status. Never fall through to the full
  // dashboard layout in this state — show only an error/retry message.
  const isStatusUnknown = isPartner && !isLoading && isPartnerError && !partnerData;

  // MEDIUM-3: partner account status (§14.1).
  // The canonical partner_account_status collapses PAUSED, SUSPENDED and INACTIVE
  // all to a single 'Inactive' state in the /partners/me response. The frontend
  // genuinely cannot distinguish a voluntary pause (Пауза) from an admin-imposed
  // suspension (Спрян): the backend only ever sets partnerRestriction = 'SUSPENDED'
  // (for SUSPENDED), and never emits a PAUSED sub-status. Asserting 'Спрян' here
  // would mislabel a voluntarily-paused partner, so we use the canonical neutral
  // 'Inactive/Неактивен' wording instead of guessing. If the backend ever provides
  // an explicit sub-status, this is the place to surface it — until then, stay
  // accurate and read-only.
  const partnerStatusRaw = (partnerData as { status?: string } | undefined)?.status?.toUpperCase();
  const isInactivePartner = isPartner && (partnerStatusRaw === 'INACTIVE' || partnerStatusRaw === 'PAUSED' || partnerStatusRaw === 'SUSPENDED');
  const isArchivedPartner = isPartner && partnerStatusRaw === 'ARCHIVED';
  const partnerStatusLabel = (): string => {
    if (!partnerStatusRaw) return '—';
    if (partnerStatusRaw === 'ACTIVE') return 'Активен';
    if (partnerStatusRaw === 'ARCHIVED') return 'Архивиран';
    // PAUSED, SUSPENDED and INACTIVE are indistinguishable at the FE (the backend
    // collapses them to 'Inactive' and never emits a PAUSED sub-status). Do NOT
    // guess 'Спрян' vs 'Пауза' — surface the canonical neutral label.
    if (partnerStatusRaw === 'SUSPENDED' || partnerStatusRaw === 'PAUSED' || partnerStatusRaw === 'INACTIVE') {
      return language === 'bg' ? 'Неактивен' : 'Inactive';
    }
    // Any other raw value (e.g. REJECTED/PENDING) canonicalizes to Inactive for
    // display — never surface a raw uppercase enum token to the partner.
    return language === 'bg' ? 'Неактивен' : 'Inactive';
  };

  // Consumer dashboard data
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  // F2: track fetch failure so we can render an error notice instead of
  // misleading subscription/cashback defaults when the API call fails.
  const [hasDashboardError, setHasDashboardError] = useState(false);

  useEffect(() => {
    if (isPartner) return;
    setIsLoadingDashboard(true);
    setHasDashboardError(false);
    apiService.get<DashboardData>('/dashboard/me')
      .then(data => setDashboardData(data))
      .catch(() => { setHasDashboardError(true); })
      .finally(() => setIsLoadingDashboard(false));
  }, [isPartner]);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  /**
   * MEDIUM-4 fix: currency display (§7.3, Clash 12.1).
   * Uses the currency mode resolved from `useCurrencyDisplay()` above.
   * Post-transition (2026-01-01) this returns EUR_ONLY.
   */
  const formatCurrency = (amount: number) =>
    formatWithCurrency(amount, currencyMode, language === 'bg' ? 'bg' : 'en');

  /**
   * F1 fix: wallet amounts use a display mode driven by the API response field
   * `currencyWindowOpen` (§7.3, Clash 12.1).  When the backend reports the BGN
   * transition window is still open, wallet scalars are BGN → show DUAL (BGN + EUR).
   * When the window is closed (or the field is absent), fall back to the
   * date-based `currencyMode` which resolves to EUR_ONLY post-2026-01-01.
   */
  const walletDisplayMode = dashboardData?.currencyWindowOpen ? 'DUAL' : currencyMode;
  const formatWalletCurrency = (amount: number) =>
    formatWithCurrency(amount, walletDisplayMode, language === 'bg' ? 'bg' : 'en');

  const statusLabel = (status: string) => {
    const map: Record<string, { en: string; bg: string }> = {
      APPROVED:       { en: t('dashboard.statusApproved'),        bg: t('dashboard.statusApproved') },
      PENDING:        { en: t('dashboard.statusPending'),         bg: t('dashboard.statusPending') },
      MANUAL_REVIEW:  { en: t('dashboard.statusReview'),          bg: t('dashboard.statusReview') },
      REJECTED:       { en: t('dashboard.statusRejected'),        bg: t('dashboard.statusRejected') },
      ACTIVE:         { en: t('dashboard.subStatusActive'),       bg: t('dashboard.subStatusActive') },
      TRIALING:       { en: t('dashboard.subStatusTrialing'),     bg: t('dashboard.subStatusTrialing') },
      PAST_DUE:       { en: t('dashboard.subStatusPastDue'),      bg: t('dashboard.subStatusPastDue') },
      CANCELLED:      { en: t('dashboard.subStatusCancelled'),    bg: t('dashboard.subStatusCancelled') },
      // F4: missing subscription statuses
      FAILED_PAYMENT: { en: t('dashboard.subStatusFailedPayment'), bg: t('dashboard.subStatusFailedPayment') },
      EXPIRED:        { en: t('dashboard.subStatusExpired'),       bg: t('dashboard.subStatusExpired') },
    };
    return map[status]?.[language === 'bg' ? 'bg' : 'en'] ?? status;
  };

  // Canonical SubscriptionPlan enum (PREMIUM_WEEKLY | BASIC | PREMIUM_MONTHLY)
  // → customer-facing display name. Cross-checked against the backend Plans
  // table displayName (getPlanBenefits maps PREMIUM_WEEKLY→LIGHT='Premium
  // Weekly', PREMIUM_MONTHLY→PREMIUM='Premium Monthly'). No legacy LIGHT/PREMIUM.
  const planLabel = (plan: string) => {
    const map: Record<string, { en: string; bg: string }> = {
      PREMIUM_WEEKLY:  { en: 'Premium Weekly',  bg: 'Premium седмичен' },
      BASIC:           { en: 'Basic',           bg: 'Basic' },
      PREMIUM_MONTHLY: { en: 'Premium Monthly', bg: 'Premium месечен' },
    };
    return map[plan]?.[language === 'bg' ? 'bg' : 'en'] ?? plan;
  };

  const showUpgradeBanner = dashboardData?.showUpgradePrompt ?? false;

  return (
    <PageContainer>
      <PageHeader>
        <Title>
          {t('dashboard.greeting')}, {user?.firstName || user?.email?.split('@')[0]}!
        </Title>
        <Subtitle>
          {isPartner ? t('dashboard.partnerSubtitle') : t('dashboard.subtitle')}
        </Subtitle>
      </PageHeader>

      {/* Partner Dashboard — spec §5.3 */}
      {isPartner ? (
        <>
          {/* LOW-1 fix (r2q): show a loading indicator first so an Archived partner
              does not see the KPI skeleton before BlockedBanner replaces it. */}
          {isLoading ? (
            <EmptyMessage>...</EmptyMessage>
          ) : /* MEDIUM-2: Archived partner — zero portal access (§1.2, §5.1, §11.2). */
          isArchivedPartner ? (
            <BlockedBanner
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <BlockedTitle>Акаунтът е архивиран</BlockedTitle>
              <BlockedDesc>
                Достъпът до партньорския портал е прекратен. За повече информация се свържете с BoomCard на office@boomcard.bg.
              </BlockedDesc>
            </BlockedBanner>
          ) : isStatusUnknown ? (
            /* MEDIUM-2: partner data fetch failed — show only the error banner, never fall
               through to the KPI/Quick Actions layout (partner could be Inactive/Archived). */
            <ErrorBanner
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ErrorMessage>
                Данните за профила не можаха да се заредят. Моля, опреснете страницата.
              </ErrorMessage>
            </ErrorBanner>
          ) : (
            <>
              {/* MEDIUM-3: Partner account status badge (§5.3, §14.1).
                  Distinguishes SUSPENDED ('Спрян') from PAUSED ('Пауза'). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#6b7280' }}>
                  Статус на акаунта:
                </span>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  background: partnerStatusRaw === 'ACTIVE' ? '#d1fae5' : '#fee2e2',
                  color: partnerStatusRaw === 'ACTIVE' ? '#065f46' : '#991b1b',
                }}>
                  {partnerStatusLabel()}
                </span>
              </div>

              {/* Inactive (Пауза/Спрян) read-only notice (§5.1, §11.2) */}
              {isInactivePartner && (
                <ReadOnlyBanner
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <ReadOnlyBannerText>
                    Акаунтът е в режим само за четене. Нови транзакции не се приемат. За съдействие се свържете с BoomCard.
                  </ReadOnlyBannerText>
                </ReadOnlyBanner>
              )}

              {/* KPI Cards — spec §5.3: visits, transactions, turnover,
                  contracted commission %, expected amounts.
                  HIGH-2 fix (r2q): replaced non-spec KPIs (Active Offers,
                  Customer Rating) with the spec-mandated fields.
                  Fields not yet exposed by /partners/stats API are shown as
                  "—" until the backend endpoint is extended. */}
              <StatsGrid>
                {/* §5.3 KPI 1: Number of visits */}
                <StatCard
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <StatLabel>
                    {language === 'bg' ? 'Брой посещения' : 'Visits'}
                  </StatLabel>
                  <StatValue>
                    {isLoading ? '...' : (
                      displayStats?.totalVisits !== undefined
                        ? displayStats.totalVisits.toLocaleString()
                        : '—'
                    )}
                  </StatValue>
                  <StatChange $positive>
                    {language === 'bg' ? 'Общо посещения' : 'Total visits'}
                  </StatChange>
                </StatCard>

                {/* §5.3 KPI 2: Number of transactions */}
                <StatCard
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  <StatLabel>
                    {language === 'bg' ? 'Брой транзакции' : 'Transactions'}
                  </StatLabel>
                  <StatValue>
                    {isLoading ? '...' : (displayStats?.totalRedemptions || 0).toLocaleString()}
                  </StatValue>
                  <StatChange $positive>
                    {displayStats?.monthlyRedemptions || 0} {language === 'bg' ? 'този месец' : 'this month'}
                  </StatChange>
                </StatCard>

                {/* §5.3 KPI 3: Cashback paid.
                    MEDIUM fix (re-audit): this card was labelled "Оборот / Turnover"
                    but the value (displayStats.revenue) is the sum of cashbackAmount
                    (cashback paid out), NOT gross transaction volume. Spec §5.3 defines
                    turnover as gross volume, which the backend does not provide here.
                    Relabelled to describe what the figure actually is; no turnover
                    value is invented. */}
                <StatCard
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  <StatLabel>
                    {language === 'bg' ? 'Изплатен кешбек' : 'Cashback paid'}
                  </StatLabel>
                  <StatValue>
                    {isLoading ? '...' : formatCurrency(displayStats?.revenue || 0)}
                  </StatValue>
                  <StatChange $positive>
                    {language === 'bg' ? 'От всички транзакции' : 'From all transactions'}
                  </StatChange>
                </StatCard>

                {/* §5.3 KPI 4: Contracted commission % */}
                <StatCard
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                >
                  <StatLabel>
                    {language === 'bg' ? 'Договорена комисионна' : 'Contracted Commission'}
                  </StatLabel>
                  <StatValue>
                    {isLoading ? '...' : (() => {
                      // /partners/me returns the contracted rate in `discountRate`,
                      // but for most partners that column is null and the backend
                      // exposes the resolved value as `effectiveDiscountRate`
                      // (= discountRate ?? partnerType.maxDiscountRate). Prefer the
                      // contracted rate when set, otherwise fall back to the
                      // effective rate so the KPI is not perpetually "—".
                      const pd = partnerData as { discountRate?: number | null; effectiveDiscountRate?: number | null } | undefined;
                      const rate = pd?.discountRate ?? pd?.effectiveDiscountRate;
                      return rate !== undefined && rate !== null ? `${rate}%` : '—';
                    })()}
                  </StatValue>
                  <StatChange>
                    {language === 'bg' ? 'Договорен процент' : 'Agreed rate'}
                  </StatChange>
                </StatCard>

                {/* §5.3 KPI 5: Expected amounts */}
                <StatCard
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
                  <StatLabel>
                    {language === 'bg' ? 'Очаквани суми' : 'Expected Amounts'}
                  </StatLabel>
                  <StatValue>
                    {isLoading ? '...' : (
                      displayStats?.expectedAmount !== undefined
                        ? formatCurrency(displayStats.expectedAmount)
                        : '—'
                    )}
                  </StatValue>
                  <StatChange>
                    {language === 'bg' ? 'Очаквана фактура' : 'Expected invoice'}
                  </StatChange>
                </StatCard>
              </StatsGrid>

              {/* Quick Actions — hidden for Inactive partners (§5.1, §11.2). */}
              {!isInactivePartner && (
                <>
                  <SectionHeader>
                    <SectionTitle>{t('dashboard.quickActions') || (language === 'bg' ? 'Бързи действия' : 'Quick Actions')}</SectionTitle>
                  </SectionHeader>

                  <CardsGrid>
                    {/* B3 fix (r2q): spec §8a prohibits surfacing offer management to
                        partners without an approved product spec. Gate this card behind
                        the same feature flag that controls the /partners/offers/* routes.
                        When the flag is false (the default in all envs), neither the card
                        nor the routes exist from the partner's perspective. */}
                    {OFFER_MANAGEMENT_ENABLED && (
                      <BoomCardItem
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        onClick={() => window.location.href = '/partners/offers'}
                        style={{ cursor: 'pointer' }}
                      >
                        <ActionCardImage $imageUrl="https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&h=400&fit=crop" />
                        <CardBody>
                          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                            <VenueName>{t('dashboard.manageOffers') || (language === 'bg' ? 'Управление на отстъпки' : 'Manage Discounts')}</VenueName>
                            <VenueCategory>View, edit, and create new discounts</VenueCategory>
                            <div style={{ marginTop: '1rem' }}>
                              <Button variant="primary" size="medium">Go to Discounts</Button>
                            </div>
                          </div>
                        </CardBody>
                      </BoomCardItem>
                    )}

                    <BoomCardItem
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                      onClick={() => window.location.href = '/analytics'}
                      style={{ cursor: 'pointer' }}
                    >
                      <ActionCardImage $imageUrl="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=400&fit=crop" />
                      <CardBody>
                        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                          <VenueName>{t('dashboard.viewAnalytics') || (language === 'bg' ? 'Анализи' : 'View Analytics')}</VenueName>
                          <VenueCategory>{t('dashboard.analyticsSubtitle') || (language === 'bg' ? 'Проследявайте резултати и анализи' : 'Track performance and insights')}</VenueCategory>
                          <div style={{ marginTop: '1rem' }}>
                            <Button variant="primary" size="medium">{t('dashboard.viewAnalytics') || (language === 'bg' ? 'Анализи' : 'View Analytics')}</Button>
                          </div>
                        </div>
                      </CardBody>
                    </BoomCardItem>

                    {/* Profile navigation — view only. Critical fields require a Change Request (§5.4). */}
                    <BoomCardItem
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.2 }}
                      onClick={() => window.location.href = '/profile'}
                      style={{ cursor: 'pointer' }}
                    >
                      <ActionCardImage $imageUrl="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=400&fit=crop" />
                      <CardBody>
                        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                          <VenueName>{t('dashboard.businessProfile') || (language === 'bg' ? 'Бизнес профил' : 'Business Profile')}</VenueName>
                          {/* "Business Profile" — edits require a Change Request (§5.4) */}
                          <VenueCategory>{t('dashboard.businessProfileSubtitle') || (language === 'bg' ? 'Преглед на бизнес информацията' : 'View business information')}</VenueCategory>
                          <div style={{ marginTop: '1rem' }}>
                            <Button variant="primary" size="medium">{t('dashboard.viewProfile') || (language === 'bg' ? 'Преглед на профил' : 'View Profile')}</Button>
                          </div>
                        </div>
                      </CardBody>
                    </BoomCardItem>
                  </CardsGrid>
                </>
              )}

              <SectionHeader style={{ marginTop: isInactivePartner ? 0 : '2rem' }}>
                <SectionTitle>
                  {language === 'bg' ? 'Последна активност' : 'Recent Activity'}
                </SectionTitle>
              </SectionHeader>

              {/* MEDIUM-1 fix (r2q): removed hardcoded placeholder entries.
                  Spec §5.3 requires "most recent transactions or most recent
                  report changes." Real data integration is pending. */}
              <ActivityContainer>
                <EmptyMessage>
                  {language === 'bg'
                    ? 'Последните транзакции ще се покажат тук след интеграция.'
                    : 'Recent transactions will appear here once the integration is complete.'}
                </EmptyMessage>
              </ActivityContainer>
            </>
          )}
        </>
      ) : (
        <>
          {/* ── §3.3 / §3.5.1 Account status banners — rendered first ── */}

          {/* Banner 1: Account paused (user.status === 'INACTIVE') */}
          {/* Suppress when hasDashboardError — the error banner below already informs the user. */}
          {!hasDashboardError && user?.status === 'INACTIVE' && (
            <UserStatusBanner
              $variant="danger"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <UserStatusBannerText $variant="danger">
                {language === 'bg' ? 'Акаунтът е в пауза' : 'Account paused'}
              </UserStatusBannerText>
              <UserStatusBannerLink $variant="danger" to="/subscription">
                {language === 'bg' ? 'Възобнови акаунта' : 'Resume account'}
              </UserStatusBannerLink>
            </UserStatusBanner>
          )}

          {/* Banner 2: Subscription payment failed */}
          {dashboardData?.subscription?.status === 'FAILED_PAYMENT' && (
            <UserStatusBanner
              $variant="warning"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <UserStatusBannerText $variant="warning">
                {language === 'bg'
                  ? 'Плащането на абонамента е неуспешно'
                  : 'Subscription payment failed'}
              </UserStatusBannerText>
              <UserStatusBannerLink $variant="warning" to="/subscription">
                {language === 'bg'
                  ? 'Обнови начина на плащане'
                  : 'Update payment method'}
              </UserStatusBannerLink>
            </UserStatusBanner>
          )}

          {/* F2: API fetch failure — replace subscription/cashback/transaction blocks
              with a clear error notice instead of showing misleading default values. */}
          {!isLoadingDashboard && hasDashboardError ? (
            <ErrorBanner
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ErrorMessage>
                {language === 'bg'
                  ? 'Неуспешно зареждане на данните. Моля, опреснете страницата.'
                  : 'Unable to load dashboard. Please refresh.'}
              </ErrorMessage>
            </ErrorBanner>
          ) : (
          <>

          {/* ── §3.5.1 Subscription block ── */}
          <SectionHeader>
            <SectionTitle>{t('dashboard.subscriptionPlan')}</SectionTitle>
          </SectionHeader>

          <SubscriptionCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <SubscriptionHeader>
              <PlanBadge $plan={dashboardData?.subscription?.plan ?? 'BASIC'}>
                {isLoadingDashboard ? '...' : planLabel(dashboardData?.subscription?.plan ?? 'BASIC')}
              </PlanBadge>
              <StatusBadge $status={dashboardData?.subscription?.status ?? 'ACTIVE'}>
                {isLoadingDashboard ? '...' : statusLabel(dashboardData?.subscription?.status ?? 'ACTIVE')}
              </StatusBadge>
            </SubscriptionHeader>

            {dashboardData?.subscription?.currentPeriodEnd && (
              <SubscriptionMeta>
                <SubscriptionMetaLabel>
                  {t('dashboard.nextBilling')}
                </SubscriptionMetaLabel>
                <SubscriptionMetaValue>
                  {formatDate(dashboardData.subscription.currentPeriodEnd)}
                </SubscriptionMetaValue>
              </SubscriptionMeta>
            )}

            {/* §3.5.1: auto-renewal on/off indicator */}
            {!isLoadingDashboard && dashboardData?.subscription?.autoRenewal !== undefined && (
              <AutoRenewalRow>
                <AutoRenewalDot $on={dashboardData.subscription.autoRenewal} />
                <AutoRenewalText>
                  {dashboardData.subscription.autoRenewal
                    ? (language === 'bg' ? 'Автоматично подновяване: Вкл.' : 'Auto-renewal: On')
                    : (language === 'bg' ? 'Автоматично подновяване: Изкл.' : 'Auto-renewal: Off')}
                </AutoRenewalText>
              </AutoRenewalRow>
            )}

            {/* PAST_DUE grace banner removed: it depended on the phantom
                `gracePeriodEndsAt` field that /dashboard/me never returns, so the
                countdown could never be computed and the banner never rendered. */}
          </SubscriptionCard>

          {/* ── §3.5.1 Cashback block ── */}
          <SectionHeader>
            <SectionTitle>
              {language === 'bg' ? 'Кешбек' : 'Cashback'}
            </SectionTitle>
          </SectionHeader>

          <CashbackCard
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            {/* Available (Cleared) */}
            <CashbackRow>
              <CashbackRowLabel>
                {t('dashboard.cashbackAvailable')}
              </CashbackRowLabel>
              <CashbackRowValue>
                {isLoadingDashboard ? '...' : formatWalletCurrency(dashboardData?.wallet.availableBalance ?? 0)}
              </CashbackRowValue>
            </CashbackRow>

            {/* Pending */}
            <CashbackRow>
              <CashbackRowLabel>
                {t('dashboard.cashbackPending')}
              </CashbackRowLabel>
              <CashbackRowValue>
                {isLoadingDashboard ? '...' : formatWalletCurrency(dashboardData?.wallet.pendingBalance ?? 0)}
              </CashbackRowValue>
            </CashbackRow>

            {/* Expiring within 7 days — only shown when > 0 */}
            {!isLoadingDashboard && (dashboardData?.wallet.expiringBalance ?? 0) > 0 && (
              <CashbackRow>
                <ExpiringLabel>
                  {language === 'bg' ? 'Изтичащ скоро (7 дни)' : 'Expiring soon (7 days)'}
                </ExpiringLabel>
                <CashbackRowValue $highlighted>
                  {formatWalletCurrency(dashboardData!.wallet.expiringBalance!)}
                </CashbackRowValue>
              </CashbackRow>
            )}
          </CashbackCard>

          {/* ── §3.5.1 Primary CTA: Upload receipt ── */}
          <CtaCard
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
          >
            <CtaContent>
              <CtaTitle>{t('dashboard.uploadReceiptCta')}</CtaTitle>
              <CtaDesc>{t('dashboard.uploadReceiptCtaDesc')}</CtaDesc>
            </CtaContent>
            <Link to="/upload-receipt">
              <Button variant="secondary" size="large">
                {t('dashboard.uploadReceiptCta')}
              </Button>
            </Link>
          </CtaCard>

          {/* ── §3.5.1 Recent transactions (last 3) ── */}
          <SectionHeader>
            <SectionTitle>{t('dashboard.recentTransactions')}</SectionTitle>
            <Link to="/receipts">
              <Button variant="ghost" size="small">{t('common.viewAll')}</Button>
            </Link>
          </SectionHeader>

          <ActivityContainer>
            {isLoadingDashboard ? (
              <EmptyMessage>...</EmptyMessage>
            ) : dashboardData?.receipts.length ? (
              <ActivityList>
                {dashboardData.receipts.map((receipt, index) => (
                  <TransactionRow key={receipt.id}
                    as={motion.div}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.06 }}
                  >
                    <TransactionInfo>
                      <TransactionMerchant>{receipt.merchantName}</TransactionMerchant>
                      <TransactionDate>{formatDate(receipt.createdAt)}</TransactionDate>
                    </TransactionInfo>
                    <StatusBadge $status={receipt.status}>
                      {statusLabel(receipt.status)}
                    </StatusBadge>
                    <TransactionAmount>
                      +{receipt.cashbackAmount.windowOpen && receipt.cashbackAmount.bgn !== null
                        ? formatWithCurrency(receipt.cashbackAmount.bgn, 'DUAL', language === 'bg' ? 'bg' : 'en')
                        : `€${receipt.cashbackAmount.eur.toFixed(2)}`}
                    </TransactionAmount>
                  </TransactionRow>
                ))}
              </ActivityList>
            ) : (
              <EmptyMessage>{t('dashboard.noTransactions')}</EmptyMessage>
            )}
          </ActivityContainer>

          {/* ── §3.5.1 Upsell block — Basic / Premium Weekly with Active subscription ── */}
          {showUpgradeBanner && (
            <UpgradeBanner
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.2 }}
            >
              <UpgradeBannerContent>
                <UpgradeBannerTitle>{t('dashboard.upgradeTitle')}</UpgradeBannerTitle>
                <UpgradeBannerDesc>{t('dashboard.upgradeDesc')}</UpgradeBannerDesc>
              </UpgradeBannerContent>
              <Link to="/subscription">
                <Button variant="secondary" size="medium">{t('dashboard.upgradeBtn')}</Button>
              </Link>
            </UpgradeBanner>
          )}
          </>
          )}
        </>
      )}
    </PageContainer>
  );
};

export default DashboardPage;
