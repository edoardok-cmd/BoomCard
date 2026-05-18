import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { DataTable, ColumnDef, RowAction } from '../../components/admin/DataTable/DataTable';
import {
  adminPartnerRequestsService,
  PendingPartner,
  AssignableAdmin,
} from '../../services/adminPartnerRequests.service';
import { getCategoryName } from '../../types/categories.types';
import PartnerRequestDrawer from '../../components/admin/PartnerRequestDrawer';

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  'RESTAURANTS_FOOD': 'restaurants', 'ACCOMMODATION': 'accommodation',
  'SPA_WELLNESS': 'spa', 'PANORAMIC_PLACES': 'panoramic',
  'CLUBS_NIGHTLIFE': 'clubs', 'CAFES_BAKERIES': 'cafes',
  'GASTRONOMIC': 'gastronomic', 'HISTORICAL_CULTURAL': 'historical-cultural',
  'ACTIVE_ADVENTURE': 'active-adventure', 'EXTREME': 'extreme',
  'EDUCATIONAL_CREATIVE': 'educational-creative', 'RELAX_WELLNESS': 'relax-wellness',
  'RESTAURANT': 'restaurants', 'HOTEL': 'accommodation', 'SPA': 'spa',
  'WINERY': 'restaurants', 'Wineries': 'restaurants',
  'Spa': 'spa', 'Hotels': 'accommodation',
  'Experiences': 'gastronomic', 'Restaurants': 'restaurants', 'Wellness': 'spa',
};
function migrateCategoryId(id: string): string {
  return LEGACY_CATEGORY_MAP[id] ?? id;
}

/* ─── Palette ──────────────────────────────────────────────────────────────── */
const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  warning: '#b5803a', warningSoft: '#f5ead2',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  info: '#2563eb', infoSoft: '#dbeafe',
  teal: '#0f766e', tealSoft: '#ccfbf1',
};

/* ─── Layout ───────────────────────────────────────────────────────────────── */
const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
`;
const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  gap: 1rem;
  flex-wrap: wrap;
`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`
  font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;
`;
const PageTitle = styled.h1`
  font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;
`;
const PageSubtitle = styled.p`
  font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;
`;

/* ─── Pipeline summary bar ─────────────────────────────────────────────────── */
const PipelineSummary = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1.75rem;
  flex-wrap: wrap;
`;
const StageCard = styled.button<{ $active: boolean; $color: string }>`
  flex: 1;
  min-width: 140px;
  background: ${p => p.$active ? p.$color + '22' : palette.surface};
  border: 2px solid ${p => p.$active ? p.$color : palette.border};
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms, background 150ms;
  &:hover { border-color: ${p => p.$color}; background: ${p => p.$color}11; }
`;
const StageLabel = styled.div<{ $color: string }>`
  font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: ${p => p.$color}; margin-bottom: 0.25rem;
`;
const StageCount = styled.div`
  font-size: 1.75rem; font-weight: 800; color: ${palette.text};
`;
const StageHint = styled.div`
  font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;
`;

/* ─── Table card ───────────────────────────────────────────────────────────── */
const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
`;
const SectionTitle = styled.h2<{ $color: string }>`
  font-size: 1rem; font-weight: 700; color: ${p => p.$color};
  margin: 0 0 1rem;
  display: flex; align-items: center; gap: 0.5rem;
`;
const StageDot = styled.span<{ $color: string }>`
  display: inline-block; width: 10px; height: 10px;
  border-radius: 50%; background: ${p => p.$color};
`;
const SearchRow = styled.div`
  display: flex; gap: 0.75rem; margin-bottom: 1.25rem;
  align-items: center; flex-wrap: wrap;
`;
const SearchInput = styled.input`
  flex: 1; max-width: 20rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border}; border-radius: 0.5rem;
  font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
  &::placeholder { color: ${palette.textSubtle}; }
`;

/* ─── Cell helpers ─────────────────────────────────────────────────────────── */
const BusinessCell = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`
  font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;
`;
const ContactCell = styled.div`
  font-size: 0.8125rem; color: ${palette.textMuted};
  display: flex; flex-direction: column; gap: 0.125rem;
`;

/* ─── Reject modal ─────────────────────────────────────────────────────────── */
const Overlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  z-index: 200; display: flex; align-items: center; justify-content: center;
`;
const Modal = styled.div`
  background: ${palette.surface}; border-radius: 0.875rem;
  padding: 1.75rem; width: 100%; max-width: 26rem;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
`;
const ModalTitle = styled.h2`font-size: 1.125rem; font-weight: 700; color: ${palette.text}; margin: 0 0 0.5rem;`;
const ModalSubtitle = styled.p`font-size: 0.875rem; color: ${palette.textMuted}; margin: 0 0 1rem;`;
const ReasonTextarea = styled.textarea`
  width: 100%; min-height: 5rem; padding: 0.625rem 0.875rem;
  border: 1px solid ${palette.border}; border-radius: 0.5rem;
  font-size: 0.875rem; font-family: inherit; background: ${palette.bg};
  color: ${palette.text}; resize: vertical; box-sizing: border-box; outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;
const ModalActions = styled.div`
  display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.25rem;
`;
const Btn = styled.button<{ $variant?: 'danger' | 'ghost' | 'primary' }>`
  padding: 0.5rem 1.125rem; border-radius: 0.5rem;
  font-size: 0.875rem; font-weight: 600; cursor: pointer; border: none; transition: opacity 150ms;
  background: ${p =>
    p.$variant === 'danger' ? palette.danger :
    p.$variant === 'primary' ? palette.accent :
    'transparent'};
  color: ${p => p.$variant === 'ghost' ? palette.textMuted : '#fff'};
  border: ${p => p.$variant === 'ghost' ? `1px solid ${palette.border}` : 'none'};
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

/* ─── Readiness cell (§5.2) ────────────────────────────────────────────────── */
const ReadinessRow = styled.div`
  display: flex; align-items: center; gap: 0.375rem;
  font-size: 0.75rem; line-height: 1.2;
`;
const ReadinessIcon = styled.span<{ $ok: boolean }>`
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; border-radius: 50%;
  background: ${p => p.$ok ? palette.successSoft : palette.warningSoft};
  color: ${p => p.$ok ? palette.success : palette.warning};
  font-size: 0.625rem; font-weight: 800;
  flex-shrink: 0;
`;

function OnboardingReadinessCell({ partnerId, language }: { partnerId: string; language: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-readiness', partnerId],
    queryFn: () => adminPartnerRequestsService.getOnboardingReadiness(partnerId),
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return <span style={{ fontSize: '0.75rem', color: palette.textSubtle }}>…</span>;
  }
  if (!data) {
    return <span style={{ fontSize: '0.75rem', color: palette.textSubtle }}>—</span>;
  }

  // All three checks are per-venue (spec §5.2). The receipt and QR gates
  // require coverage of every venue: a 5-venue partner needs 5 receipt-covered
  // venues + 5 active sticker configs, not just one of each.
  const locationsOk = data.venueCount > 0;
  const receiptsOk = data.venueCount > 0 && data.venuesWithReceipts >= data.venueCount;
  const qrOk = data.venueCount > 0 && data.stickerConfigCount >= data.venueCount;

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <ReadinessRow>
        <ReadinessIcon $ok={locationsOk}>{locationsOk ? '✓' : '!'}</ReadinessIcon>
        <span style={{ color: palette.textMuted }}>
          {language === 'bg' ? 'Локации' : 'Locations'}: <strong>{data.venueCount}</strong>
        </span>
      </ReadinessRow>
      <ReadinessRow>
        <ReadinessIcon $ok={receiptsOk}>{receiptsOk ? '✓' : '!'}</ReadinessIcon>
        <span style={{ color: palette.textMuted }}>
          {language === 'bg' ? 'Касови бележки' : 'Receipts'}: <strong>{data.venuesWithReceipts}</strong>
          {data.venueCount > 0 && <span style={{ color: palette.textSubtle }}>/{data.venueCount}</span>}
          {data.receiptTemplateCount > data.venuesWithReceipts && (
            <span style={{ color: palette.textSubtle, fontSize: '0.7rem', marginLeft: '0.25rem' }}>
              ({data.receiptTemplateCount} {language === 'bg' ? 'шаблона' : 'templates'})
            </span>
          )}
        </span>
      </ReadinessRow>
      <ReadinessRow>
        <ReadinessIcon $ok={qrOk}>{qrOk ? '✓' : '!'}</ReadinessIcon>
        <span style={{ color: palette.textMuted }}>
          {language === 'bg' ? 'QR настройки' : 'QR settings'}: <strong>{data.stickerConfigCount}</strong>
          {data.venueCount > 0 && <span style={{ color: palette.textSubtle }}>/{data.venueCount}</span>}
        </span>
      </ReadinessRow>
    </span>
  );
}

/* ─── Stage config ─────────────────────────────────────────────────────────── */
interface PipelineStage {
  key: string;
  label: { bg: string; en: string };
  hint: { bg: string; en: string };
  color: string;
  next: string | null;
}

const STAGES: PipelineStage[] = [
  {
    key: 'NOVA',
    label: { bg: 'Нова заявка', en: 'New Request' },
    hint: { bg: 'Без действие', en: 'Awaiting action' },
    color: palette.textSubtle,
    next: 'KOMUNIKACIYA',
  },
  {
    key: 'KOMUNIKACIYA',
    label: { bg: 'Комуникация', en: 'Communication' },
    hint: { bg: 'Контакт осъществен', en: 'Contact made' },
    color: palette.info,
    next: 'DOGOVARYANE',
  },
  {
    key: 'DOGOVARYANE',
    label: { bg: 'Договаряне', en: 'Negotiation' },
    hint: { bg: 'Обсъждане на условия', en: 'Discussing terms' },
    color: palette.warning,
    next: 'ONBOARDING',
  },
  {
    key: 'ONBOARDING',
    label: { bg: 'Онбординг', en: 'Onboarding' },
    hint: { bg: 'Събиране на данни', en: 'Data collection' },
    color: palette.teal,
    next: 'ODOBRENA',
  },
  {
    key: 'ODOBRENA',
    label: { bg: 'Одобрен', en: 'Approved' },
    hint: { bg: 'Готов за активиране', en: 'Ready for activation' },
    color: palette.success,
    next: null,
  },
];

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function AdminPartnerPipelinePage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const canWrite = user?.rawRole === 'SUPER_ADMIN' || user?.permissions?.includes('partners.requests.write');

  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<PendingPartner | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [drawerPartnerId, setDrawerPartnerId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<PendingPartner | null>(null);

  const assignableAdminsQuery = useQuery({
    queryKey: ['admin-assignable-admins'],
    queryFn: () => adminPartnerRequestsService.getAssignableAdmins(),
    enabled: !!canWrite,
    staleTime: 5 * 60 * 1000,
  });

  const stagesToShow = activeStage
    ? STAGES.filter(s => s.key === activeStage)
    : STAGES;

  // Fetch NOVA stage (spec §5.2 — "Нова заявка – Без действие")
  const novaQuery = useQuery({
    queryKey: ['pipeline', 'NOVA', search],
    queryFn: () => adminPartnerRequestsService.list({ requestStatus: 'NOVA', search: search || undefined, limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });
  // Fetch all pipeline stages simultaneously
  const komunikaciyaQuery = useQuery({
    queryKey: ['pipeline', 'KOMUNIKACIYA', search],
    queryFn: () => adminPartnerRequestsService.list({ requestStatus: 'KOMUNIKACIYA', search: search || undefined, limit: 100 }),
  });
  const dogovaryaneQuery = useQuery({
    queryKey: ['pipeline', 'DOGOVARYANE', search],
    queryFn: () => adminPartnerRequestsService.list({ requestStatus: 'DOGOVARYANE', search: search || undefined, limit: 100 }),
  });
  const onboardingQuery = useQuery({
    queryKey: ['pipeline', 'ONBOARDING', search],
    queryFn: () => adminPartnerRequestsService.list({ requestStatus: 'ONBOARDING', search: search || undefined, limit: 100 }),
  });
  const odobrenQuery = useQuery({
    queryKey: ['pipeline', 'ODOBRENA', search],
    queryFn: () => adminPartnerRequestsService.list({ requestStatus: 'ODOBRENA', search: search || undefined, limit: 100 }),
  });

  const stageData: Record<string, PendingPartner[]> = {
    NOVA:         novaQuery.data?.partners ?? [],
    KOMUNIKACIYA: komunikaciyaQuery.data?.partners ?? [],
    DOGOVARYANE:  dogovaryaneQuery.data?.partners ?? [],
    ONBOARDING:   onboardingQuery.data?.partners ?? [],
    ODOBRENA:     odobrenQuery.data?.partners ?? [],
  };
  const stageCounts: Record<string, number> = {
    NOVA:         novaQuery.data?.total ?? 0,
    KOMUNIKACIYA: komunikaciyaQuery.data?.total ?? 0,
    DOGOVARYANE:  dogovaryaneQuery.data?.total ?? 0,
    ONBOARDING:   onboardingQuery.data?.total ?? 0,
    ODOBRENA:     odobrenQuery.data?.total ?? 0,
  };
  const isLoading = novaQuery.isLoading || komunikaciyaQuery.isLoading || dogovaryaneQuery.isLoading || onboardingQuery.isLoading || odobrenQuery.isLoading;

  const advanceMutation = useMutation({
    mutationFn: ({ id, requestStatus }: { id: string; requestStatus: string }) =>
      adminPartnerRequestsService.advancePipeline(id, requestStatus),
    onSuccess: () => {
      toast.success(language === 'bg' ? 'Статусът е обновен' : 'Status updated');
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['admin-partner-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminPartnerRequestsService.approve(id),
    onSuccess: () => {
      toast.success(t('admin.requestApproved'));
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['admin-partner-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminPartnerRequestsService.reject(id, reason),
    onSuccess: () => {
      toast.success(t('admin.requestRejected'));
      setRejectTarget(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['admin-partner-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, adminId }: { id: string; adminId: string | null }) =>
      adminPartnerRequestsService.assign(id, adminId),
    onSuccess: () => {
      toast.success(language === 'bg' ? 'Отговорникът е обновен' : 'Owner updated');
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { setSearch(searchInput); }
  };

  const baseColumns: ColumnDef<PendingPartner>[] = [
    {
      key: 'businessName',
      header: t('admin.requestColBusiness'),
      render: (row) => (
        <BusinessCell>
          {row.businessName}
          <MetaLine>{getCategoryName(migrateCategoryId(row.category), language as 'en' | 'bg')}</MetaLine>
          {/* Inline note count indicator per spec §5.2 */}
          {(row._count?.requestNotes ?? 0) > 0 && (
            <MetaLine style={{ color: palette.teal }}>
              💬 {row._count!.requestNotes} {language === 'bg' ? 'бележки' : 'notes'}
            </MetaLine>
          )}
        </BusinessCell>
      ),
    },
    {
      key: 'contact',
      header: t('admin.requestColContact'),
      render: (row) => (
        <ContactCell>
          <span>{row.user.firstName} {row.user.lastName}</span>
          <span>{row.email ?? row.user.email}</span>
          {(row.phone ?? row.user.phone) && <span>{row.phone ?? row.user.phone}</span>}
        </ContactCell>
      ),
    },
    {
      key: 'address',
      header: language === 'bg' ? 'Адрес' : 'Address',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {row.address
            ? <>{row.address}{row.city ? <><br /><span style={{ color: palette.textSubtle }}>{row.city}</span></> : null}</>
            : (row.city ?? <span style={{ color: palette.textSubtle }}>—</span>)
          }
        </span>
      ),
    },
    {
      key: 'assignedAdmin',
      header: language === 'bg' ? 'Отговорник' : 'Owner',
      render: (row) =>
        row.assignedAdmin ? (
          <ContactCell>
            <span>
              {row.assignedAdmin.firstName || row.assignedAdmin.lastName
                ? `${row.assignedAdmin.firstName ?? ''} ${row.assignedAdmin.lastName ?? ''}`.trim()
                : row.assignedAdmin.email}
            </span>
          </ContactCell>
        ) : (
          <span style={{ color: palette.textSubtle, fontStyle: 'italic', fontSize: '0.8125rem' }}>
            {language === 'bg' ? 'Не е възложено' : 'Unassigned'}
          </span>
        ),
    },
    {
      key: 'joinedAt',
      header: t('admin.requestColJoined'),
      sortable: true,
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>
          {new Date(row.joinedAt).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
          })}
        </span>
      ),
    },
  ];

  // Spec §5.2 — DOGOVARYANE stage shows negotiated % alongside base columns
  const dogovaryaneColumns: ColumnDef<PendingPartner>[] = [
    ...baseColumns.slice(0, -1),
    {
      key: 'discountRate',
      header: language === 'bg' ? 'Договаряне %' : 'Negotiating %',
      render: (row: PendingPartner) => (
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: row.discountRate != null ? palette.accent : palette.textSubtle }}>
          {row.discountRate != null ? `${row.discountRate}%` : '—'}
        </span>
      ),
    },
    baseColumns[baseColumns.length - 1],
  ];

  const buildRowActions = (nextStage: string | null): RowAction<PendingPartner>[] => [
    ...(canWrite ? [
      {
        label: nextStage
          ? (language === 'bg'
              ? `Напред → ${STAGES.find(s => s.key === nextStage)?.label.bg ?? nextStage}`
              : `Advance → ${STAGES.find(s => s.key === nextStage)?.label.en ?? nextStage}`)
          : (language === 'bg' ? 'Активирай партньора' : 'Activate partner'),
        onClick: (row: PendingPartner) => {
          if (nextStage) {
            advanceMutation.mutate({ id: row.id, requestStatus: nextStage });
          } else {
            approveMutation.mutate(row.id);
          }
        },
      },
      {
        label: t('admin.requestReject'),
        danger: true,
        onClick: (row: PendingPartner) => { setRejectTarget(row); setRejectReason(''); },
      },
      {
        label: language === 'bg' ? 'Задай на мен' : 'Assign to me',
        onClick: (row: PendingPartner) => { if (!user?.id) return; assignMutation.mutate({ id: row.id, adminId: user.id }); },
        hidden: (row: PendingPartner) => row.assignedAdminId === user?.id,
      },
      {
        label: language === 'bg' ? 'Възложи на друг…' : 'Assign to other…',
        onClick: (row: PendingPartner) => setAssignTarget(row),
      },
      {
        label: language === 'bg' ? 'Освободи' : 'Unassign',
        onClick: (row: PendingPartner) => assignMutation.mutate({ id: row.id, adminId: null }),
        hidden: (row: PendingPartner) => !row.assignedAdminId,
      },
    ] : []),
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>{language === 'bg' ? 'Партньори' : 'Partners'}</Eyebrow>
          <PageTitle>{language === 'bg' ? 'Комуникация и онбординг' : 'Communication & Onboarding'}</PageTitle>
          <PageSubtitle>
            {language === 'bg'
              ? 'Проследявайте партньорите в процес на квалификация, договаряне и онбординг'
              : 'Track partners in qualification, negotiation and onboarding stages'}
          </PageSubtitle>
        </TitleBlock>
      </PageHeader>

      {/* Pipeline summary cards */}
      <PipelineSummary>
        {STAGES.map(stage => (
          <StageCard
            key={stage.key}
            $active={activeStage === stage.key}
            $color={stage.color}
            onClick={() => setActiveStage(prev => prev === stage.key ? null : stage.key)}
          >
            <StageLabel $color={stage.color}>
              {language === 'bg' ? stage.label.bg : stage.label.en}
            </StageLabel>
            <StageCount>{isLoading ? '…' : stageCounts[stage.key]}</StageCount>
            <StageHint>{language === 'bg' ? stage.hint.bg : stage.hint.en}</StageHint>
          </StageCard>
        ))}
      </PipelineSummary>

      {/* Search */}
      <SearchRow>
        <SearchInput
          type="text"
          placeholder={language === 'bg' ? 'Търсене по бизнес, имейл или град…' : 'Search by business, email or city…'}
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      </SearchRow>

      {/* Per-stage tables */}
      {stagesToShow.map(stage => {
        const rows = stageData[stage.key];
        const isStageLoading =
          stage.key === 'NOVA'         ? novaQuery.isLoading         :
          stage.key === 'KOMUNIKACIYA' ? komunikaciyaQuery.isLoading :
          stage.key === 'DOGOVARYANE'  ? dogovaryaneQuery.isLoading  :
          stage.key === 'ONBOARDING'   ? onboardingQuery.isLoading   :
          odobrenQuery.isLoading;
        // Spec §5.2 — DOGOVARYANE shows discount %, ONBOARDING/ODOBRENA shows readiness
        const stageColumns: ColumnDef<PendingPartner>[] =
          stage.key === 'ONBOARDING' || stage.key === 'ODOBRENA'
            ? [
                ...baseColumns.slice(0, -1),
                {
                  key: 'readiness',
                  header: language === 'bg' ? 'Готовност' : 'Readiness',
                  render: (row: PendingPartner) => (
                    <OnboardingReadinessCell partnerId={row.id} language={language} />
                  ),
                },
                baseColumns[baseColumns.length - 1],
              ]
            : stage.key === 'DOGOVARYANE'
              ? dogovaryaneColumns
              : baseColumns;
        return (
          <Card key={stage.key}>
            <SectionTitle $color={stage.color}>
              <StageDot $color={stage.color} />
              {language === 'bg' ? stage.label.bg : stage.label.en}
              {' '}({stageCounts[stage.key]})
            </SectionTitle>
            <DataTable
              columns={stageColumns}
              data={rows}
              rowKey={row => row.id}
              rowActions={buildRowActions(stage.next)}
              loading={isStageLoading}
              emptyMessage={language === 'bg' ? 'Няма партньори в тази фаза' : 'No partners in this stage'}
              onRowClick={(row) => setDrawerPartnerId(row.id)}
            />
          </Card>
        );
      })}

      {/* Request detail drawer — row click opens same drawer as §5.1 */}
      <PartnerRequestDrawer
        partnerId={drawerPartnerId}
        onClose={() => setDrawerPartnerId(null)}
        canWrite={!!canWrite}
        onApproved={() => { setDrawerPartnerId(null); queryClient.invalidateQueries({ queryKey: ['pipeline'] }); }}
        onRejected={() => { setDrawerPartnerId(null); queryClient.invalidateQueries({ queryKey: ['pipeline'] }); }}
      />

      {/* Assign-to-other-admin modal */}
      {assignTarget && (
        <Overlay onClick={() => setAssignTarget(null)}>
          <Modal onClick={e => e.stopPropagation()}>
            <ModalTitle>
              {language === 'bg' ? 'Възложи отговорник' : 'Assign owner'}
            </ModalTitle>
            <ModalSubtitle>
              {language === 'bg'
                ? `Изберете администратор за заявката „${assignTarget.businessName}".`
                : `Pick an admin for the request "${assignTarget.businessName}".`}
            </ModalSubtitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '20rem', overflowY: 'auto' }}>
              {assignableAdminsQuery.isLoading ? (
                <span style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>…</span>
              ) : (assignableAdminsQuery.data?.admins ?? []).map((admin: AssignableAdmin) => {
                const fullName = [admin.firstName, admin.lastName].filter(Boolean).join(' ').trim() || admin.email;
                const isCurrent = admin.id === assignTarget.assignedAdminId;
                return (
                  <button
                    key={admin.id}
                    onClick={() => {
                      assignMutation.mutate({ id: assignTarget.id, adminId: admin.id });
                      setAssignTarget(null);
                    }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.125rem',
                      padding: '0.625rem 0.875rem',
                      background: isCurrent ? palette.accentSoft : palette.bg,
                      border: `1px solid ${isCurrent ? palette.accent : palette.border}`,
                      borderRadius: '0.5rem', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: palette.text, fontSize: '0.875rem' }}>
                      {fullName}
                      {isCurrent && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: palette.accent, fontWeight: 700 }}>
                          {language === 'bg' ? '· текущ' : '· current'}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: palette.textSubtle }}>
                      {admin.email}{admin.role === 'SUPER_ADMIN' ? ' · SUPER_ADMIN' : ''}
                    </span>
                  </button>
                );
              })}
              {!assignableAdminsQuery.isLoading && (assignableAdminsQuery.data?.admins ?? []).length === 0 && (
                <span style={{ color: palette.textSubtle, fontStyle: 'italic', fontSize: '0.875rem' }}>
                  {language === 'bg' ? 'Няма налични администратори.' : 'No admins available.'}
                </span>
              )}
            </div>
            <ModalActions>
              <Btn $variant="ghost" onClick={() => setAssignTarget(null)}>
                {t('common.cancel')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <Overlay onClick={() => setRejectTarget(null)}>
          <Modal onClick={e => e.stopPropagation()}>
            <ModalTitle>{t('admin.requestRejectTitle')}</ModalTitle>
            <ModalSubtitle>
              {t('admin.requestRejectSubtitle').replace('{name}', rejectTarget.businessName)}
            </ModalSubtitle>
            <ReasonTextarea
              placeholder={t('admin.requestRejectReasonPlaceholder')}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              autoFocus
            />
            <ModalActions>
              <Btn $variant="ghost" onClick={() => setRejectTarget(null)}>
                {t('common.cancel')}
              </Btn>
              <Btn
                $variant="danger"
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason })}
              >
                {rejectMutation.isPending ? '…' : t('admin.requestReject')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}
    </PageShell>
  );
}
