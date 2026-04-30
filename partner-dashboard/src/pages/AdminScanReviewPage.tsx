import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { API_CONFIG } from '../config/api.config';
import FraudReasonTag from '../components/admin/FraudReasonTag';
import * as authStorage from '../lib/auth/authStorage';

// ============================================
// Types
// ============================================

interface StickerScan {
  id: string;
  userId: string;
  stickerId: string;
  cardId: string;
  venueId: string;
  billAmount: number;
  verifiedAmount: number | null;
  cashbackPercent: number;
  cashbackAmount: number;
  status: 'PENDING' | 'VALIDATING' | 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW';
  latitude: number | null;
  longitude: number | null;
  distance: number | null;
  receiptImageUrl: string | null;
  ocrData: OCRData | null;
  fraudScore: number;
  fraudReasons: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  venue: {
    id: string;
    name: string;
    nameBg: string;
  };
  sticker: {
    id: string;
    stickerId: string;
    location: {
      name: string;
      nameBg: string;
      locationType: string;
    };
  };
  card: {
    id: string;
    cardType: 'BASIC' | 'LIGHT' | 'PREMIUM';
    lastFourDigits: string;
  };
}

interface OCRData {
  amount: number | null;
  date: string | null;
  merchantName: string | null;
  confidence: number;
  rawText: string;
}

interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
  avgFraudScore: number;
}

export type FilterStatus = 'all' | 'active' | 'MANUAL_REVIEW' | 'PENDING' | 'APPROVED' | 'REJECTED';
// Spec §7.1 buckets: 0-30 auto-approve, 31-60 review, 61+ high risk.
// Legacy LOW/MEDIUM/HIGH/CRITICAL labels were dropped — the spec defines
// only three tiers (Auto / Review / High), and shipping both produced
// confusing dropdowns. The dropdown surfaces the bucket scale only; the
// URL parser at initialFilterRisk hydrates from ?bucket= and also accepts
// legacy ?riskLevel=HIGH|MEDIUM|LOW deep-links so old bookmarks/emails
// don't silently land on 'all'.
export type FilterRisk =
  | 'all'
  | 'BUCKET_AUTO_0_30' | 'BUCKET_REVIEW_31_60' | 'BUCKET_HIGH_61_PLUS';

const VALID_STATUSES: FilterStatus[] = ['all', 'active', 'MANUAL_REVIEW', 'PENDING', 'APPROVED', 'REJECTED'];

// Wire ↔ state translation for risk buckets. Two explicit maps (rather than a
// template-literal one direction and a map the other) so the symmetry is
// checkable at a glance and a future risk value not starting with BUCKET_
// doesn't silently get mangled by string surgery on either side. Keep both
// maps in sync — adding a bucket means updating both.
const BUCKET_TO_PARAM: Record<Exclude<FilterRisk, 'all'>, string> = {
  BUCKET_AUTO_0_30: 'AUTO_0_30',
  BUCKET_REVIEW_31_60: 'REVIEW_31_60',
  BUCKET_HIGH_61_PLUS: 'HIGH_61_PLUS',
};
const WIRE_TO_BUCKET: Record<string, Exclude<FilterRisk, 'all'>> = {
  AUTO_0_30: 'BUCKET_AUTO_0_30',
  REVIEW_31_60: 'BUCKET_REVIEW_31_60',
  HIGH_61_PLUS: 'BUCKET_HIGH_61_PLUS',
};

export interface HydratedFilters {
  filterStatus: FilterStatus;
  filterRisk: FilterRisk;
  filterSuspicious: boolean;
  filterReasons: string;
  filterDateFromHours: string;
}

// Single source of truth for URL → filter state. Used both for the initial
// useState seeding and the useEffect that resyncs when ?params change after
// mount (e.g. admin clicks another alert while staying on /admin/control/risk).
export function hydrateFromUrl(searchParams: URLSearchParams): HydratedFilters {
  const bucket = searchParams.get('bucket');
  const riskLevel = searchParams.get('riskLevel');
  const status = searchParams.get('status');
  const suspicious = searchParams.get('suspicious') === 'true';
  const reasons = searchParams.get('reasons') || '';
  const rawHours = searchParams.get('dateFromHours');
  // Number() rejects '24abc' (NaN). Integers only — '24.7' is rejected rather
  // than silently floored, since deep-linked URLs are programmatic and a
  // fractional value almost certainly indicates a caller bug we'd rather
  // surface as an empty filter than mask. Empty string ('' → 0) and zero /
  // negative are rejected by the > 0 guard.
  // Deliberately NOT clamped — the backend is the source of truth for the
  // effective window and echoes it back as meta.appliedDateFromHours. The
  // chip below renders that echoed value, so a hand-crafted ?dateFromHours=99999
  // shows the *server-applied* number rather than a frontend-clamped lie (B-B2).
  const dateFromHours = (() => {
    if (!rawHours) return '';
    const parsed = Number(rawHours);
    if (!Number.isInteger(parsed) || parsed <= 0) return '';
    return String(parsed);
  })();
  // A recognised bucket / riskLevel is the only thing that should drive the
  // "active" status default — a malformed ?bucket=garbage shouldn't silently
  // flip the status filter (and dropping it from the truthy-test also stops
  // a garbage bucket from looking like "no bucket present" downstream).
  const mappedBucket = bucket ? WIRE_TO_BUCKET[bucket] : undefined;
  const isValidBucket = mappedBucket !== undefined;
  const isValidRiskLevel =
    riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ||
    riskLevel === 'MEDIUM' || riskLevel === 'LOW';
  const filterRisk: FilterRisk =
    mappedBucket
      ?? (riskLevel === 'HIGH' || riskLevel === 'CRITICAL' ? 'BUCKET_HIGH_61_PLUS'
        : riskLevel === 'MEDIUM' ? 'BUCKET_REVIEW_31_60'
        : riskLevel === 'LOW' ? 'BUCKET_AUTO_0_30'
        : 'all');
  const filterStatus: FilterStatus =
    status && VALID_STATUSES.includes(status as FilterStatus)
      ? (status as FilterStatus)
      : (isValidBucket || isValidRiskLevel || suspicious || reasons) ? 'active' : 'MANUAL_REVIEW';
  return {
    filterStatus,
    filterRisk,
    filterSuspicious: suspicious,
    filterReasons: reasons,
    filterDateFromHours: dateFromHours,
  };
}

// Inverse of hydrateFromUrl. Defaults must mirror hydrate's no-param result so
// every URL-mutating handler can route through this and produce a URL that
// round-trips exactly back through hydrate. Legacy ?riskLevel= is never
// re-emitted; hydrate still accepts it for old bookmarks/emails.
//
// The status default is *inferred*, not constant: hydrate returns 'active' when
// any qualifier (bucket / suspicious / reasons) is present and no explicit
// ?status= is in the URL, otherwise 'MANUAL_REVIEW'. We must compute the same
// inference here, otherwise picking 'MANUAL_REVIEW' from the dropdown while a
// qualifier is active would emit an empty status and hydrate would re-infer
// 'active', overwriting the admin's choice on the next resync. The qualifier
// set deliberately excludes filterDateFromHours — hydrate doesn't treat a lone
// time-window deep-link as enough to flip the default, so neither do we.
export function serializeFilters(state: HydratedFilters): URLSearchParams {
  const params = new URLSearchParams();
  const hasInferActiveQualifier =
    state.filterRisk !== 'all' || state.filterSuspicious || !!state.filterReasons;
  const inferredStatus: FilterStatus = hasInferActiveQualifier ? 'active' : 'MANUAL_REVIEW';
  if (state.filterStatus !== inferredStatus) params.set('status', state.filterStatus);
  if (state.filterRisk !== 'all') params.set('bucket', BUCKET_TO_PARAM[state.filterRisk]);
  if (state.filterSuspicious) params.set('suspicious', 'true');
  if (state.filterReasons) params.set('reasons', state.filterReasons);
  if (state.filterDateFromHours) params.set('dateFromHours', state.filterDateFromHours);
  return params;
}

// ============================================
// Styled Components
// ============================================

const PageContainer = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
`;

const Header = styled.div`
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  color: white;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
`;

const StatCard = styled.div<{ $color?: string }>`
  background: var(--color-background);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-left: 4px solid ${props => props.$color || '#667eea'};
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  font-weight: 500;
`;

const StatValue = styled.div`
  font-size: 36px;
  font-weight: 700;
  color: var(--color-text-primary);
`;

const FiltersBar = styled.div`
  background: var(--color-background);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 200px;
`;

const FilterLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const Select = styled.select`
  padding: 10px 16px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  background: var(--color-background);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #667eea;
  }

  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const Input = styled.input`
  padding: 10px 16px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  background: var(--color-background);
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const ScansGrid = styled.div`
  display: grid;
  gap: 20px;
`;

const ScanCard = styled.div<{ $selected?: boolean }>`
  background: var(--color-background);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid ${props => props.$selected ? '#667eea' : 'transparent'};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  }
`;

const ScanHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
`;

const ScanInfo = styled.div`
  flex: 1;
`;

const ScanId = styled.div`
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-bottom: 4px;
  font-family: monospace;
`;

const VenueName = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 4px;
`;

const StickerInfo = styled.div`
  font-size: 14px;
  color: var(--color-text-secondary);
`;

const RiskBadge = styled.div<{ $level: string }>`
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  background: ${props => {
    switch (props.$level) {
      case 'CRITICAL': return '#f44336';
      case 'HIGH': return '#ff9800';
      case 'MEDIUM': return '#ffc107';
      case 'LOW': return '#4caf50';
      default: return '#9e9e9e';
    }
  }};
  color: white;
`;

const ScanDetails = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
`;

const DetailItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const DetailLabel = styled.span`
  font-size: 12px;
  color: var(--color-text-tertiary);
  font-weight: 500;
`;

const DetailValue = styled.span`
  font-size: 16px;
  color: var(--color-text-primary);
  font-weight: 600;
`;

const FraudScoreBar = styled.div`
  margin-bottom: 16px;
`;

const ScoreLabel = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
`;

const ScoreBarContainer = styled.div`
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
`;

const ScoreBarFill = styled.div<{ $score: number }>`
  height: 100%;
  width: ${props => props.$score}%;
  background: ${props => {
    if (props.$score < 10) return '#4caf50';
    if (props.$score < 30) return '#ffc107';
    if (props.$score < 60) return '#ff9800';
    return '#f44336';
  }};
  transition: width 0.3s ease;
`;

// Spec §7.1 categorical bucket label rendered next to the score
const BucketBadge = styled.span<{ $score: number }>`
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 4px;
  background: ${props => props.$score < 31 ? '#e6f4ea' : props.$score < 61 ? '#fff4e0' : '#fde7e7'};
  color: ${props => props.$score < 31 ? '#1e7c3a' : props.$score < 61 ? '#9a5b00' : '#a82424'};
`;

const FraudReasonsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 16px 0;
`;

const FraudReason = styled.li`
  padding: 8px 12px;
  background: #fff3e0;
  border-left: 3px solid #ff9800;
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--color-text-secondary);
  border-radius: 4px;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 16px;
`;

const Button = styled.button<{ $variant?: 'approve' | 'reject' | 'view' }>`
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
  background: ${props => {
    switch (props.$variant) {
      case 'approve': return 'linear-gradient(135deg, #4caf50 0%, #66bb6a 100%)';
      case 'reject': return 'linear-gradient(135deg, #f44336 0%, #e57373 100%)';
      case 'view': return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      default: return 'linear-gradient(135deg, #616161 0%, #757575 100%)';
    }
  }};
  color: white;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const EmptyState = styled.div`
  background: var(--color-background);
  border-radius: 12px;
  padding: 60px 24px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
`;

const EmptyIcon = styled.div`
  font-size: 64px;
  margin-bottom: 16px;
`;

const EmptyTitle = styled.h3`
  font-size: 24px;
  color: var(--color-text-primary);
  margin-bottom: 8px;
`;

const EmptyText = styled.p`
  font-size: 16px;
  color: var(--color-text-secondary);
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px;
  background: var(--color-background);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
`;

const Spinner = styled.div`
  width: 50px;
  height: 50px;
  border: 4px solid var(--color-border);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
  padding: 16px;
`;

const PageButton = styled.button`
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  cursor: pointer;
  transition: background 100ms;
  &:hover:not(:disabled) { background: #f5f5f5; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const PageInfo = styled.span`
  font-size: 14px;
  color: #666;
  font-weight: 500;
`;

const BulkActionsBar = styled.div<{ $visible: boolean }>`
  position: fixed;
  bottom: ${props => props.$visible ? '24px' : '-100px'};
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-background);
  border-radius: 12px;
  padding: 16px 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 16px;
  transition: bottom 0.3s ease;
  z-index: 1000;
`;

const BulkInfo = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
`;

const BulkButton = styled(Button)`
  flex: 0 0 auto;
  min-width: 120px;
`;

// ============================================
// Modal Components
// ============================================

const Modal = styled.div<{ $isOpen: boolean }>`
  display: ${props => props.$isOpen ? 'flex' : 'none'};
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 2000;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const ModalContent = styled.div`
  background: var(--color-background);
  border-radius: 16px;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: 32px;
`;

const ModalHeader = styled.div`
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--color-border);
`;

const ModalTitle = styled.h2`
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 8px;
`;

const ModalSubtitle = styled.div`
  font-size: 14px;
  color: var(--color-text-secondary);
`;

const ModalSection = styled.div`
  margin-bottom: 24px;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 12px;
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 100px;
  padding: 12px 16px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  background: var(--color-background);
  font-family: inherit;
  resize: vertical;
  transition: all 0.2s ease;

  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
`;

// ============================================
// Main Component
// ============================================

export const AdminScanReviewPage: React.FC = () => {
  // Allow deep-links from the alerts page (spec §3.2) to preselect filters.
  //   ?bucket=HIGH_61_PLUS | REVIEW_31_60 | AUTO_0_30  → risk-tier filter
  //   ?status=active | MANUAL_REVIEW | PENDING | APPROVED | REJECTED | all → status filter
  //   ?suspicious=true                                  → suspicious-reasons filter
  //   ?reasons=CODE1,CODE2                              → exact-match reason filter
  // status=active is the canonical alias for "still requires admin attention"
  // (PENDING / VALIDATING / MANUAL_REVIEW); risk-tier alerts deep-link with it
  // so the page count matches what the alert counted.
  const [searchParams, setSearchParams] = useSearchParams();

  const [scans, setScans] = useState<StickerScan[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [selectedScans, setSelectedScans] = useState<Set<string>>(new Set());
  // INVARIANT: the five filter states below are mirrors of the URL. The only
  // permitted writers are (1) commitFilters() — the user-action path, which
  // serializes the full post-change state into the URL, and (2) the resync
  // effect below — the URL → state pump triggered by ?param changes from
  // outside (alert nav, browser back/forward). Anything else (a raw setFilterX
  // in a new handler) bypasses URL serialization, breaks the round-trip with
  // hydrateFromUrl, and reintroduces the qualifier-vs-status drift the
  // original B-B1 fix closed. Reads (fetch effects, render) use them directly.
  //
  // Mount-time hydrate via useState lazy init — runs exactly once and is never
  // recomputed (subsequent URL changes flow through the resync effect below).
  // Sharing one parse across the five useStates avoids redundant work without
  // forcing a single useReducer-style state shape.
  const [initialFilters] = useState<HydratedFilters>(() => hydrateFromUrl(searchParams));
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(initialFilters.filterStatus);
  const [filterRisk, setFilterRisk] = useState<FilterRisk>(initialFilters.filterRisk);
  const [filterSuspicious, setFilterSuspicious] = useState<boolean>(initialFilters.filterSuspicious);
  const [filterReasons, setFilterReasons] = useState<string>(initialFilters.filterReasons);
  const [filterDateFromHours, setFilterDateFromHours] = useState<string>(initialFilters.filterDateFromHours);
  // Server echoes the post-clamp window so the chip never claims a window the
  // server didn't actually apply (B-B2). Undefined until the first response.
  const [appliedDateFromHours, setAppliedDateFromHours] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  // Server pagination (spec §7.1 buckets pushed to DB)
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'approve' | 'reject'>('approve');
  const [reviewNotes, setReviewNotes] = useState('');
  const [verifiedAmount, setVerifiedAmount] = useState('');
  const [currentScan, setCurrentScan] = useState<StickerScan | null>(null);
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);

  // Resync filters from URL changes (B-B1). The URL is the single source of
  // truth for all five deep-linkable filters: every dropdown / chip handler
  // below routes through commitFilters() (which serializes the FULL post-change
  // state via serializeFilters), and alert links replace the search string
  // outright. This effect re-derives state from URL on every change; setState
  // bails on equality so redundant updates are free.
  //
  // An earlier asymmetric variant (only update status/risk when the URL had
  // the param) tried to preserve dropdown selections across chip removals,
  // but it broke cross-alert navigation: clicking from a bucket-filtered
  // alert to a non-bucket alert would leave the old bucket in state.
  // Full-state serialization on every mutation makes symmetric resync safe
  // — the URL carries everything currently selected, including an inferred
  // 'active' status from a qualifier-only deep-link, so clearing the lone
  // qualifier no longer demotes status to the no-qualifier default.
  //
  // The prevHoursRef inequality check (not the [searchParams] dep alone) is
  // what gates the applied-window reset — we co-batch setAppliedDateFromHours
  // with setFilterDateFromHours in a single render. A separate
  // `[filterDateFromHours]` effect produced a one-frame flash where the chip
  // rendered the previous post-clamp number against the new filter (effects
  // run after commit/paint).
  const prevHoursRef = useRef(initialFilters.filterDateFromHours);
  // Sequence guards for in-flight fetches. Filter / page changes refetch;
  // without a guard, a slow earlier response can land *after* a fast later
  // one and overwrite scans, total, truncated, appliedDateFromHours, and
  // (worst) flip loading=false while the newer request is still pending.
  // Each call captures `++ref.current` and only commits state when the
  // captured value still matches at completion. Stats has its own ref since
  // it lives on a different request lifecycle (no page/limit dep).
  const fetchScansSeqRef = useRef(0);
  const fetchStatsSeqRef = useRef(0);
  useEffect(() => {
    const next = hydrateFromUrl(searchParams);
    if (next.filterDateFromHours !== prevHoursRef.current) {
      setAppliedDateFromHours(undefined);
      prevHoursRef.current = next.filterDateFromHours;
    }
    setFilterStatus(next.filterStatus);
    setFilterRisk(next.filterRisk);
    setFilterSuspicious(next.filterSuspicious);
    setFilterReasons(next.filterReasons);
    setFilterDateFromHours(next.filterDateFromHours);
    // Co-batched with setFilterX so external URL navigation produces a single
    // render with both new filter and page=1 — the fetch effect then fires
    // once. Without this we had a two-render chain (setFilterX → re-render →
    // standalone page-reset effect → setPage(1) → re-render → second fetch),
    // which the fetchScans seq guard masked silently.
    // Requires React 18+ automatic batching: in React 17 each setState call
    // inside a useEffect body flushed synchronously. setAppliedDateFromHours
    // at the top of this effect fires first — conditionally, when
    // filterDateFromHours changes. The six unconditional calls (the five
    // setFilterX above plus setPage(1) below) always fire. Under React 17
    // that gives up to seven renders and seven fetches. React ^18.2.0 is
    // pinned in package.json; do not relax that constraint without
    // re-auditing this.
    //
    // Invariant: searchParams changes only via (a) commitFilters — which
    // already resets page before calling setSearchParams — or (b) external
    // navigation (alert links, browser back/forward) — which should always
    // reset to page 1. There is no path where the URL changes for a
    // non-filter reason (e.g. a future ?sort= param) while the admin holds a
    // meaningful page > 1. If such a param is ever added, this unconditional
    // setPage(1) must be made conditional.
    setPage(1);
  }, [searchParams]);

  // Single entry point for all dropdown / chip mutations. Updates local state
  // for tear-free controlled inputs AND serializes the full post-change state
  // into the URL. The resync effect above then sees the URL change and calls
  // setFilterX a second time — those land as equality-bail no-ops. Without the
  // local set, controlled <select> values would lag a frame behind the click
  // while the URL → state round-trip completes.
  //
  // CALLERS: invoke at most once per event handler. Two synchronous calls in a
  // row would have the second see the first's queued setState as the closure's
  // (still-stale) value and clobber its URL emission. If you need to change two
  // fields at once, pass them as a single partial.
  //
  // Each field is overridden only when its key is explicitly present on partial
  // (own-property check rather than `!== undefined`) so that a TS-permissive
  // `commitFilters({ filterStatus: undefined })` doesn't blank the URL slot.
  const commitFilters = useCallback((partial: Partial<HydratedFilters>) => {
    const has = <K extends keyof HydratedFilters>(k: K): boolean =>
      Object.prototype.hasOwnProperty.call(partial, k) && partial[k] !== undefined;
    if (has('filterStatus')) setFilterStatus(partial.filterStatus as FilterStatus);
    if (has('filterRisk')) setFilterRisk(partial.filterRisk as FilterRisk);
    if (has('filterSuspicious')) setFilterSuspicious(partial.filterSuspicious as boolean);
    if (has('filterReasons')) setFilterReasons(partial.filterReasons as string);
    if (has('filterDateFromHours')) setFilterDateFromHours(partial.filterDateFromHours as string);
    // Co-batch the applied-window reset with the filter set so the user-action
    // path matches the URL-driven path (the resync effect's prevHoursRef branch).
    // Without this, chip-removal had a one-frame window where filterDateFromHours
    // was '' but appliedDateFromHours still held the previous fetch's number;
    // the chip's truthy-gate hid that gap incidentally, but the invariant is
    // load-bearing in code now, not in render gating. Bump prevHoursRef in
    // lockstep so the upcoming resync effect sees an equal value and doesn't
    // double-clear (which would be harmless but redundant).
    if (has('filterDateFromHours') && partial.filterDateFromHours !== filterDateFromHours) {
      setAppliedDateFromHours(undefined);
      prevHoursRef.current = partial.filterDateFromHours as string;
    }
    // Co-batched with setFilterX so an in-page filter mutation produces a
    // single render with both new filter and page=1 — the fetch effect then
    // fires once even when the admin was on page > 1 (React 18+ automatic
    // batching; same version note as the resync effect above). setPage(1)
    // when already 1 is a no-op because React bails on value equality
    // (Object.is(1, 1) === true for number primitives), so we don't need an
    // explicit if (page !== 1) guard.
    //
    // Safety against "commitFilters called with unchanged value while page > 1":
    // • <select onChange> callers (filterStatus, filterRisk dropdowns): the
    //   browser only fires 'change' when the selected value actually differs.
    // • onClick chip-removal callers (filterSuspicious, filterReasons,
    //   filterDateFromHours chips): each chip is conditionally rendered only
    //   while its filter is active (non-default), so clicking it always
    //   transitions active → default — never a same-value call.
    // Neither path can invoke commitFilters with an unchanged value while
    // page > 1, so the unconditional setPage(1) cannot produce a spurious
    // page-reset through current call sites.
    setPage(1);
    const merged: HydratedFilters = {
      filterStatus: has('filterStatus') ? (partial.filterStatus as FilterStatus) : filterStatus,
      filterRisk: has('filterRisk') ? (partial.filterRisk as FilterRisk) : filterRisk,
      filterSuspicious: has('filterSuspicious') ? (partial.filterSuspicious as boolean) : filterSuspicious,
      filterReasons: has('filterReasons') ? (partial.filterReasons as string) : filterReasons,
      filterDateFromHours: has('filterDateFromHours') ? (partial.filterDateFromHours as string) : filterDateFromHours,
    };
    setSearchParams(serializeFilters(merged), { replace: true });
  }, [filterStatus, filterRisk, filterSuspicious, filterReasons, filterDateFromHours, setSearchParams]);

  // Fetch scans and stats. Filter / page changes refetch.
  // (pageSize is hardcoded — no setter — so it is a stable dep, never fires.)
  // Filter changes always come paired with setPage(1) (in commitFilters for
  // in-page mutations, and in the searchParams resync effect for external URL
  // navigation), so this effect fires exactly once per user action — no
  // standalone page-reset effect, no spurious double-fetch that the seq
  // guard would have to silently swallow.
  useEffect(() => {
    fetchScans();
    fetchStats();
  }, [filterStatus, filterRisk, filterSuspicious, filterReasons, filterDateFromHours, page, pageSize]);

  const fetchScans = async () => {
    const seq = ++fetchScansSeqRef.current;
    const isLatest = () => seq === fetchScansSeqRef.current;
    try {
      setLoading(true);
      const token = authStorage.getItem('token');
      const params = new URLSearchParams();

      if (filterStatus !== 'all') {
        params.append('status', filterStatus);
      }
      // Spec §7.1 categorical buckets pushed to backend. Uses BUCKET_TO_PARAM
      // (not string surgery) so the same map governs every BUCKET_* → wire
      // translation in this file — see serializeFilters above.
      if (filterRisk !== 'all') {
        params.append('bucket', BUCKET_TO_PARAM[filterRisk]);
      }
      if (filterSuspicious) params.append('suspicious', 'true');
      if (filterReasons) params.append('reasons', filterReasons);
      if (filterDateFromHours) params.append('dateFromHours', filterDateFromHours);
      params.append('page', String(page));
      params.append('limit', String(pageSize));

      const response = await fetch(
        `${API_CONFIG.baseURL}/stickers/admin/pending-review?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch scans');

      const json = await response.json();
      // Stale-response guard: a newer fetch superseded this one, so don't
      // commit. Bail before parsing-derived state writes to avoid the slow-
      // wins-over-fast race where filter A's response lands after filter B.
      if (!isLatest()) return;
      // Backend returns { success, data, meta: { total, page, limit, pages, truncated? } }
      // Older responses returned the array directly — tolerate both.
      const items: StickerScan[] = Array.isArray(json) ? json : json.data ?? [];
      setScans(items);
      setTotal(json?.meta?.total ?? items.length);
      // truncated=true indicates the suspicious raw-id list hit
      // SUSPICIOUS_ID_LIMIT (5000) and the visible set is a strict subset
      // (S-B1). Surface to the user so they don't trust the badge over the page.
      setTruncated(Boolean(json?.meta?.truncated));
      // Server-applied window — the chip below renders this rather than the
      // raw filterDateFromHours so the user sees what actually filtered the
      // page (B-B2). Coerce non-numeric values to undefined.
      const applied = json?.meta?.appliedDateFromHours;
      setAppliedDateFromHours(typeof applied === 'number' && Number.isFinite(applied) ? applied : undefined);
    } catch (error) {
      console.error('Error fetching scans:', error);
      // B-B2: a failed fetch must not let the chip keep claiming the *previous*
      // request's window. Without this, after a successful 24h fetch, switching
      // to 48h and getting a 5xx leaves the chip showing "Last 24h" against a
      // filterDateFromHours of "48" — exactly the lie the chip was added to
      // prevent. Same for the truncated banner: a stale "showing first N matches"
      // would mislead after the new request failed entirely.
      // Only the latest call clears these — an older failed call must not
      // blank out a newer in-flight call's pending result.
      if (!isLatest()) return;
      setAppliedDateFromHours(undefined);
      setTruncated(false);
    } finally {
      // Loading is a global "any request in flight" indicator; an older call
      // landing first must not flip it off while the newer one is still in
      // flight. The newer call's setLoading(true) at the top has already run
      // (synchronous), so gating here keeps the spinner visible until the
      // latest response settles.
      if (isLatest()) setLoading(false);
    }
  };

  const fetchStats = async () => {
    const seq = ++fetchStatsSeqRef.current;
    const isLatest = () => seq === fetchStatsSeqRef.current;
    try {
      const token = authStorage.getItem('token');
      const response = await fetch(
        `${API_CONFIG.baseURL}/stickers/admin/stats`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const json = await response.json();
        // Stale-response guard, same shape as fetchScans.
        if (!isLatest()) return;
        // Backend wraps as { success, data }; tolerate raw shape too.
        setStats(json?.data ?? json);
      }
    } catch (error) {
      // Log unconditionally — mirrors fetchScans, ensures stale-request errors
      // are never silently dropped. The isLatest() guard below only gates future
      // error-recovery state (e.g. setStatsError); it must not gate logging.
      console.error('Error fetching stats:', error);
      // isLatest() guard: no state is written today, but if error-recovery
      // state (e.g. setStatsError) is added here it must be gated on this
      // check — an older failed call must not clobber a newer in-flight
      // result, mirroring the pattern in fetchScans.
      if (!isLatest()) return;
    }
  };

  const handleScanSelect = (scanId: string) => {
    const newSelected = new Set(selectedScans);
    if (newSelected.has(scanId)) {
      newSelected.delete(scanId);
    } else {
      newSelected.add(scanId);
    }
    setSelectedScans(newSelected);
  };

  const openReviewModal = (scanId: string, mode: 'approve' | 'reject') => {
    const scan = scans.find(s => s.id === scanId) || null;
    setCurrentScanId(scanId);
    setCurrentScan(scan);
    setModalMode(mode);
    setReviewNotes('');
    // Seed override input with the scan's billAmount so admins edit rather than retype.
    setVerifiedAmount(scan ? String(scan.billAmount) : '');
    setModalOpen(true);
  };

  const handleReview = async () => {
    if (!currentScanId) return;

    try {
      const token = authStorage.getItem('token');
      const endpoint = modalMode === 'approve' ? 'approve' : 'reject';

      // Only send verifiedAmount when approving AND the admin actually changed it
      // from the scan's original billAmount — otherwise we'd trigger a needless
      // recompute (and persist the same value as an "override").
      const body: Record<string, unknown> = { notes: reviewNotes || undefined };
      if (modalMode === 'approve' && currentScan && verifiedAmount !== '') {
        const parsed = Number(verifiedAmount);
        if (!isFinite(parsed) || parsed <= 0) {
          alert('Verified amount must be a positive number');
          return;
        }
        if (parsed !== currentScan.billAmount) {
          body.verifiedAmount = parsed;
        }
      }

      const response = await fetch(
        `${API_CONFIG.baseURL}/stickers/admin/${endpoint}/${currentScanId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || `Failed to ${modalMode} scan`);
      }

      await fetchScans();
      await fetchStats();

      setModalOpen(false);
      setCurrentScanId(null);
      setCurrentScan(null);
      setReviewNotes('');
      setVerifiedAmount('');
    } catch (error) {
      console.error(`Error ${modalMode}ing scan:`, error);
      alert(error instanceof Error ? error.message : `Failed to ${modalMode} scan. Please try again.`);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedScans.size === 0) return;
    const ids = Array.from(selectedScans);

    if (!confirm(`Approve ${ids.length} scan(s)? This credits cashback and cannot be undone.`)) {
      return;
    }

    try {
      const token = authStorage.getItem('token');
      const response = await fetch(`${API_CONFIG.baseURL}/stickers/admin/bulk-approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scanIds: ids }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to bulk approve scans');
      }
      if (data.errorCount > 0) {
        alert(`${data.successCount} approved, ${data.errorCount} failed. Check logs for details.`);
      }
      await fetchScans();
      await fetchStats();
      setSelectedScans(new Set());
    } catch (error) {
      console.error('Error bulk approving:', error);
      alert(error instanceof Error ? error.message : 'Failed to approve scans. Please try again.');
    }
  };

  const handleBulkReject = async () => {
    if (selectedScans.size === 0) return;
    const ids = Array.from(selectedScans);

    const reason = prompt(`Enter rejection reason for ${ids.length} scans:`);
    if (!reason) return;

    try {
      const token = authStorage.getItem('token');
      const response = await fetch(`${API_CONFIG.baseURL}/stickers/admin/bulk-reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scanIds: ids, reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to bulk reject scans');
      }
      if (data.errorCount > 0) {
        alert(`${data.successCount} rejected, ${data.errorCount} failed. Check logs for details.`);
      }
      await fetchScans();
      await fetchStats();
      setSelectedScans(new Set());
    } catch (error) {
      console.error('Error bulk rejecting:', error);
      alert(error instanceof Error ? error.message : 'Failed to reject scans. Please try again.');
    }
  };

  // Search is still client-side (operates on the current page); status / riskLevel /
  // bucket filters and pagination are server-side per spec §7.1.
  const filteredScans = scans.filter(scan => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      scan.id.toLowerCase().includes(query) ||
      scan.stickerId.toLowerCase().includes(query) ||
      scan.venue.name.toLowerCase().includes(query) ||
      scan.user.email.toLowerCase().includes(query)
    );
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <PageContainer>
      <Header>
        <Title>Admin Scan Review</Title>
        <Subtitle>Review and approve flagged sticker scans</Subtitle>
      </Header>

      {stats && (
        <StatsGrid>
          <StatCard $color="#ff9800">
            <StatLabel>Pending Review</StatLabel>
            <StatValue>{stats.pending}</StatValue>
          </StatCard>
          <StatCard $color="#4caf50">
            <StatLabel>Approved Today</StatLabel>
            <StatValue>{stats.approved}</StatValue>
          </StatCard>
          <StatCard $color="#f44336">
            <StatLabel>Rejected Today</StatLabel>
            <StatValue>{stats.rejected}</StatValue>
          </StatCard>
          <StatCard $color="#667eea">
            <StatLabel>Avg Fraud Score</StatLabel>
            <StatValue>{stats.avgFraudScore.toFixed(1)}</StatValue>
          </StatCard>
        </StatsGrid>
      )}

      <FiltersBar>
        <FilterGroup>
          <FilterLabel>Status</FilterLabel>
          <Select
            value={filterStatus}
            onChange={(e) => commitFilters({ filterStatus: e.target.value as FilterStatus })}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active (Pending / Validating / Manual Review)</option>
            <option value="MANUAL_REVIEW">Manual Review</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </FilterGroup>

        <FilterGroup>
          <FilterLabel>Risk Level</FilterLabel>
          <Select
            value={filterRisk}
            // 'all' is the Risk default so it's omitted from the URL; any
            // bucket writes ?bucket=*. Legacy ?riskLevel= is never re-emitted
            // (hydrate still accepts it on incoming URLs), so a deep-link with
            // ?riskLevel= is normalized to ?bucket= on the first interaction.
            onChange={(e) => commitFilters({ filterRisk: e.target.value as FilterRisk })}
          >
            <option value="all">All Risk Levels</option>
            <option value="BUCKET_AUTO_0_30">Auto-approve (0–30)</option>
            <option value="BUCKET_REVIEW_31_60">Review (31–60)</option>
            <option value="BUCKET_HIGH_61_PLUS">High risk (61+)</option>
          </Select>
        </FilterGroup>

        <FilterGroup style={{ flex: 1 }}>
          <FilterLabel>Search</FilterLabel>
          <Input
            type="text"
            placeholder="Search by ID, venue, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </FilterGroup>

        {(filterSuspicious || filterReasons || filterDateFromHours) && (
          <div style={{ flexBasis: '100%', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
              Active filter:
            </span>
            {filterSuspicious && (
              <button
                type="button"
                aria-label="Remove suspicious activity filter"
                onClick={() => commitFilters({ filterSuspicious: false })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: '1px solid #f59e0b', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Suspicious activity ×
              </button>
            )}
            {filterReasons && (
              <button
                type="button"
                aria-label={`Remove reason filter: ${filterReasons}`}
                onClick={() => commitFilters({ filterReasons: '' })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: '1px solid #f59e0b', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Reason: {filterReasons} ×
              </button>
            )}
            {filterDateFromHours && (
              <button
                type="button"
                // Mirrors the visual chip text exactly. B-B2 says "never claim
                // a window the server didn't apply" — that has to hold for
                // assistive tech too, so until the server echoes a post-clamp
                // value we don't surface the raw user input here either. The
                // visual reads "Time window … ×"; the aria-label reads the
                // same shape with a clarifying "applying" verb.
                aria-label={
                  appliedDateFromHours !== undefined
                    ? `Remove time-window filter: last ${appliedDateFromHours} hours`
                    : 'Remove time-window filter (applying)'
                }
                // The resync effect's prevHoursRef inequality check clears
                // appliedDateFromHours; no need to double-bookkeep here.
                onClick={() => commitFilters({ filterDateFromHours: '' })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: '1px solid #f59e0b', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                {/* Show the server-echoed window only — never the raw user input.
                    Until the first response lands appliedDateFromHours is
                    undefined; render an ellipsis rather than the raw value so
                    we never claim a window the server didn't actually apply
                    (B-B2). The resync effect co-batches the applied reset with
                    setFilterDateFromHours so transitions don't paint the
                    previous window's number against the new filter. */}
                {appliedDateFromHours !== undefined
                  ? `Last ${appliedDateFromHours}h ×`
                  : 'Time window … ×'}
              </button>
            )}
          </div>
        )}
        {/* WCAG 4.1.3: announces the applying → applied transition so screen-reader
            users hear the server-echoed window without navigating back to the chip.
            Always rendered so aria-live fires on text *changes*, not initial content. */}
        <span
          role="status"
          aria-live="polite"
          data-testid="tw-live"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {filterDateFromHours
            ? appliedDateFromHours !== undefined
              ? `Time window filter applied: last ${appliedDateFromHours} hours`
              : 'Time window filter applying…'
            : ''}
        </span>
      </FiltersBar>

      {truncated && !loading && (
        <div
          role="status"
          style={{
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            color: '#92400e',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Showing the first {total.toLocaleString()} matches — the suspicious-scan list
          hit the safety cap. Narrow the filters (status, bucket, time window) to see
          the exact set.
        </div>
      )}

      {loading ? (
        <LoadingSpinner>
          <Spinner />
        </LoadingSpinner>
      ) : filteredScans.length === 0 ? (
        <EmptyState>
          <EmptyIcon>✅</EmptyIcon>
          <EmptyTitle>All Clear!</EmptyTitle>
          <EmptyText>No scans matching your filters. Great job!</EmptyText>
        </EmptyState>
      ) : (
        <ScansGrid>
          {filteredScans.map(scan => (
            <ScanCard
              key={scan.id}
              $selected={selectedScans.has(scan.id)}
              onClick={() => handleScanSelect(scan.id)}
            >
              <ScanHeader>
                <ScanInfo>
                  <ScanId>ID: {scan.id}</ScanId>
                  <VenueName>{scan.venue.name}</VenueName>
                  <StickerInfo>
                    {scan.sticker.stickerId} • {scan.sticker.location.name}
                  </StickerInfo>
                </ScanInfo>
                <RiskBadge $level={scan.riskLevel}>
                  {scan.riskLevel}
                </RiskBadge>
              </ScanHeader>

              <ScanDetails>
                <DetailItem>
                  <DetailLabel>Customer</DetailLabel>
                  <DetailValue>
                    {scan.user.firstName} {scan.user.lastName}
                  </DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Bill Amount</DetailLabel>
                  <DetailValue>{scan.billAmount.toFixed(2)} лв</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Cashback</DetailLabel>
                  <DetailValue>{scan.cashbackAmount.toFixed(2)} лв</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Card Type</DetailLabel>
                  <DetailValue>{scan.card.cardType}</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Distance</DetailLabel>
                  <DetailValue>
                    {scan.distance !== null ? `${scan.distance.toFixed(0)}m` : 'N/A'}
                  </DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Scan Time</DetailLabel>
                  <DetailValue>
                    {new Date(scan.createdAt).toLocaleString()}
                  </DetailValue>
                </DetailItem>
              </ScanDetails>

              <FraudScoreBar>
                <ScoreLabel>
                  <span>
                    Fraud Score
                    <BucketBadge $score={scan.fraudScore}>
                      {scan.fraudScore < 31
                        ? 'Auto-approve'
                        : scan.fraudScore < 61
                          ? 'Review'
                          : 'High risk'}
                    </BucketBadge>
                  </span>
                  <span>{scan.fraudScore.toFixed(1)}/100</span>
                </ScoreLabel>
                <ScoreBarContainer>
                  <ScoreBarFill $score={scan.fraudScore} />
                </ScoreBarContainer>
              </FraudScoreBar>

              {scan.fraudReasons.length > 0 && (
                <FraudReasonsList>
                  {scan.fraudReasons.map((reason, idx) => (
                    <FraudReason key={idx}>
                      <FraudReasonTag reason={reason} />
                    </FraudReason>
                  ))}
                </FraudReasonsList>
              )}

              <ActionButtons onClick={(e) => e.stopPropagation()}>
                <Button
                  $variant="approve"
                  onClick={() => openReviewModal(scan.id, 'approve')}
                >
                  ✓ Approve
                </Button>
                <Button
                  $variant="reject"
                  onClick={() => openReviewModal(scan.id, 'reject')}
                >
                  ✗ Reject
                </Button>
                {scan.receiptImageUrl && (
                  <Button
                    $variant="view"
                    onClick={() => window.open(scan.receiptImageUrl!, '_blank')}
                  >
                    🖼️ View Receipt
                  </Button>
                )}
              </ActionButtons>
            </ScanCard>
          ))}
        </ScansGrid>
      )}

      {!loading && total > pageSize && (
        <Pagination>
          <PageButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            ← Prev
          </PageButton>
          <PageInfo>
            Page {page} of {totalPages} · {total.toLocaleString()} scans
          </PageInfo>
          <PageButton onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next →
          </PageButton>
        </Pagination>
      )}

      <BulkActionsBar $visible={selectedScans.size > 0}>
        <BulkInfo>{selectedScans.size} scans selected</BulkInfo>
        <BulkButton $variant="approve" onClick={handleBulkApprove}>
          Approve All
        </BulkButton>
        <BulkButton $variant="reject" onClick={handleBulkReject}>
          Reject All
        </BulkButton>
        <BulkButton onClick={() => setSelectedScans(new Set())}>
          Clear
        </BulkButton>
      </BulkActionsBar>

      <Modal $isOpen={modalOpen} onClick={() => setModalOpen(false)}>
        <ModalContent onClick={(e) => e.stopPropagation()}>
          <ModalHeader>
            <ModalTitle>
              {modalMode === 'approve' ? '✓ Approve' : '✗ Reject'} Scan
            </ModalTitle>
            <ModalSubtitle>
              Add notes about your decision (optional)
            </ModalSubtitle>
          </ModalHeader>

          {modalMode === 'approve' && currentScan && (
            <ModalSection>
              <SectionTitle>
                Verified Bill Amount (лв)
              </SectionTitle>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                User submitted <strong>{currentScan.billAmount.toFixed(2)} лв</strong>
                {currentScan.ocrData?.amount != null ? ` — OCR detected ${currentScan.ocrData.amount.toFixed(2)} лв` : ''}.
                Edit this to correct the amount before approving; cashback will be recomputed.
              </div>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={verifiedAmount}
                onChange={(e) => setVerifiedAmount(e.target.value)}
                style={{ width: '100%' }}
              />
            </ModalSection>
          )}

          <ModalSection>
            <SectionTitle>Admin Notes</SectionTitle>
            <TextArea
              placeholder="Enter any notes about this decision..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
            />
          </ModalSection>

          <ModalActions>
            <Button
              $variant={modalMode}
              onClick={handleReview}
            >
              Confirm {modalMode === 'approve' ? 'Approval' : 'Rejection'}
            </Button>
            <Button onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
          </ModalActions>
        </ModalContent>
      </Modal>
    </PageContainer>
  );
};

export default AdminScanReviewPage;
