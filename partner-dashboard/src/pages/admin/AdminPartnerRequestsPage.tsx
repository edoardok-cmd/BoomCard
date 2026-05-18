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

// Maps legacy SCREAMING_SNAKE_CASE and old display-name values to canonical category IDs
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

/* ─── Palette ─────────────────────────────────────────────────────────────── */
const palette = {
  bg: '#faf9f5',
  surface: '#ffffff',
  border: '#e8e5dc',
  text: '#141413',
  textMuted: '#605a50',
  textSubtle: '#8c8678',
  accent: '#c96442',
  accentSoft: '#f3e8de',
  success: '#4a7c59',
  successSoft: '#e6efe3',
  warning: '#b5803a',
  warningSoft: '#f5ead2',
  danger: '#b54327',
  dangerSoft: '#f4dcd2',
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
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${palette.textSubtle};
  margin-bottom: 0.25rem;
`;

const PageTitle = styled.h1`
  font-size: 1.75rem;
  font-weight: 800;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;

const PageSubtitle = styled.p`
  font-size: 0.9375rem;
  color: ${palette.textMuted};
  margin: 0;
`;

const CountBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${palette.warningSoft};
  color: ${palette.warning};
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 9999px;
  padding: 0.125rem 0.6rem;
  margin-left: 0.5rem;
`;

const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
`;

const SearchRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  align-items: center;
  flex-wrap: wrap;
`;

const FilterSelect = styled.select`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  cursor: pointer;
  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const SearchInput = styled.input`
  flex: 1;
  max-width: 20rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }

  &::placeholder {
    color: ${palette.textSubtle};
  }
`;

/* ─── Reject modal ─────────────────────────────────────────────────────────── */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Modal = styled.div`
  background: ${palette.surface};
  border-radius: 0.875rem;
  padding: 1.75rem;
  width: 100%;
  max-width: 26rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
`;

const ModalTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.5rem;
`;

const ModalSubtitle = styled.p`
  font-size: 0.875rem;
  color: ${palette.textMuted};
  margin: 0 0 1rem;
`;

const ReasonTextarea = styled.textarea`
  width: 100%;
  min-height: 5rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-family: inherit;
  background: ${palette.bg};
  color: ${palette.text};
  resize: vertical;
  box-sizing: border-box;
  outline: none;

  &:focus {
    border-color: ${palette.accent};
    box-shadow: 0 0 0 2px ${palette.accentSoft};
  }
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.25rem;
`;

const Btn = styled.button<{ $variant?: 'danger' | 'ghost' }>`
  padding: 0.5rem 1.125rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 150ms;

  background: ${(p) =>
    p.$variant === 'danger' ? palette.danger : p.$variant === 'ghost' ? 'transparent' : palette.accent};
  color: ${(p) => (p.$variant === 'ghost' ? palette.textMuted : '#fff')};
  border: ${(p) => (p.$variant === 'ghost' ? `1px solid ${palette.border}` : 'none')};

  &:hover {
    opacity: 0.85;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/* ─── Cell helpers ─────────────────────────────────────────────────────────── */
const BusinessCell = styled.div`
  font-weight: 600;
  color: ${palette.text};
`;

const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const ContactCell = styled.div`
  font-size: 0.8125rem;
  color: ${palette.textMuted};
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

/* ─── Component ───────────────────────────────────────────────────────────── */
const PAGE_SIZE = 20;

// Human-readable labels for PartnerRequestStatus values shown in the status cell.
const REQUEST_STATUS_LABELS: Record<string, { bg: string; en: string }> = {
  NOVA:         { bg: 'Нова',        en: 'New' },
  KOMUNIKACIYA: { bg: 'Комуникация', en: 'Communication' },
  DOGOVARYANE:  { bg: 'Договаряне', en: 'Negotiation' },
  ONBOARDING:   { bg: 'Онбординг',  en: 'Onboarding' },
  ODOBRENA:     { bg: 'Одобрена',   en: 'Approved' },
  OTKAZANA:     { bg: 'Отказана',   en: 'Rejected' },
};

// Spec §5.1 — filter options. All pipeline stages including Договаряне.
const REQUEST_STATUS_FILTER_OPTIONS: Array<[string, { bg: string; en: string }]> = [
  ['NOVA',         { bg: 'Нова',         en: 'New' }],
  ['KOMUNIKACIYA', { bg: 'Комуникация',  en: 'Communication' }],
  ['DOGOVARYANE',  { bg: 'Договаряне',  en: 'Negotiation' }],
  ['ONBOARDING',   { bg: 'Онбординг',   en: 'Onboarding' }],
  ['ODOBRENA',     { bg: 'Одобрена',    en: 'Approved' }],
  ['OTKAZANA',     { bg: 'Отказана',    en: 'Rejected' }],
];

// Next pipeline step for each current status
const NEXT_PIPELINE_STEP: Record<string, string> = {
  NOVA:         'KOMUNIKACIYA',
  KOMUNIKACIYA: 'DOGOVARYANE',
  DOGOVARYANE:  'ONBOARDING',
  ONBOARDING:   'ODOBRENA',
};

export default function AdminPartnerRequestsPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const canWrite = user?.rawRole === 'SUPER_ADMIN' || user?.permissions?.includes('partners.requests.write');

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState('');
  // Spec §5.1 v1.1 — filter by declared "Брой обекти" bucket.
  const [objectCountFilter, setObjectCountFilter] = useState('');
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

  const { data, isLoading } = useQuery({
    queryKey: ['admin-partner-requests', page, search, requestStatusFilter, objectCountFilter],
    queryFn: () => adminPartnerRequestsService.list({
      page,
      limit: PAGE_SIZE,
      search: search || undefined,
      requestStatus: requestStatusFilter || undefined,
      objectCount: objectCountFilter || undefined,
    }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminPartnerRequestsService.approve(id),
    onSuccess: () => {
      toast.success(t('admin.requestApproved'));
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
      queryClient.invalidateQueries({ queryKey: ['admin-partner-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, requestStatus }: { id: string; requestStatus: string }) =>
      adminPartnerRequestsService.advancePipeline(id, requestStatus),
    onSuccess: () => {
      toast.success(language === 'bg' ? 'Статусът е обновен' : 'Status updated');
      queryClient.invalidateQueries({ queryKey: ['admin-partner-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['admin-alerts'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, adminId }: { id: string; adminId: string | null }) =>
      adminPartnerRequestsService.assign(id, adminId),
    onSuccess: () => {
      toast.success(language === 'bg' ? 'Отговорникът е обновен' : 'Owner updated');
      queryClient.invalidateQueries({ queryKey: ['admin-partner-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
    onError: () => toast.error(t('common.error')),
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setSearch(searchInput);
      setPage(1);
    }
  };

  const columns: ColumnDef<PendingPartner>[] = [
    {
      key: 'businessName',
      header: t('admin.requestColBusiness'),
      render: (row) => (
        <BusinessCell>
          {row.businessName}
          <MetaLine>{getCategoryName(migrateCategoryId(row.category), language as 'en' | 'bg')}</MetaLine>
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
      key: 'requestStatus',
      header: language === 'bg' ? 'Статус' : 'Status',
      render: (row) => {
        const rawStatus = row.requestStatus ?? 'NOVA';
        const label = REQUEST_STATUS_LABELS[rawStatus];
        return (
          <span style={{ fontSize: '0.8125rem', color: palette.textMuted, fontWeight: 600 }}>
            {label ? (language === 'bg' ? label.bg : label.en) : rawStatus}
          </span>
        );
      },
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
            <MetaLine>{row.assignedAdmin.email}</MetaLine>
          </ContactCell>
        ) : (
          <span style={{ color: palette.textSubtle, fontStyle: 'italic', fontSize: '0.8125rem' }}>
            {language === 'bg' ? 'Не е възложено' : 'Unassigned'}
          </span>
        ),
    },
    {
      key: 'requestObjectCount',
      header: language === 'bg' ? 'Обекти' : 'Venues',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem', fontWeight: 600 }}>
          {row.requestObjectCount ?? <span style={{ color: palette.textSubtle, fontWeight: 400 }}>—</span>}
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
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'sla',
      header: 'SLA',
      render: (row) => {
        const sla = row.sla;
        if (!sla || sla.isClosed) {
          return <span style={{ color: palette.textSubtle, fontSize: '0.75rem' }}>—</span>;
        }
        const { state, hoursElapsed, hoursRemaining } = sla;
        const bg = state === 'overdue' ? palette.dangerSoft
                 : state === 'warning' ? palette.warningSoft
                 : palette.successSoft;
        const fg = state === 'overdue' ? palette.danger
                 : state === 'warning' ? palette.warning
                 : palette.success;
        const label = state === 'overdue'
          ? (language === 'bg' ? `+${Math.round(hoursElapsed - 24)}ч просрочена` : `+${Math.round(hoursElapsed - 24)}h overdue`)
          : (language === 'bg' ? `${Math.round(hoursRemaining)}ч остават` : `${Math.round(hoursRemaining)}h left`);
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '0.15rem 0.5rem', borderRadius: '9999px',
            background: bg, color: fg,
            fontSize: '0.6875rem', fontWeight: 700,
            letterSpacing: '0.03em', whiteSpace: 'nowrap',
          }}>
            {label}
          </span>
        );
      },
    },
  ];

  const rowActions: RowAction<PendingPartner>[] = [
    ...(canWrite ? [
      {
        label: t('admin.requestApprove'),
        onClick: (row: PendingPartner) => approveMutation.mutate(row.id),
        // Spec §5.2 — approval only valid after completing the full pipeline.
        // Direct approve from NOVA/KOMUNIKACIYA/DOGOVARYANE bypasses onboarding.
        hidden: (row: PendingPartner) => row.requestStatus !== 'ONBOARDING',
      },
      {
        label: t('admin.requestReject'),
        danger: true,
        onClick: (row: PendingPartner) => {
          setRejectTarget(row);
          setRejectReason('');
        },
        hidden: (row: PendingPartner) =>
          row.requestStatus === 'ODOBRENA' || row.requestStatus === 'OTKAZANA',
      },
      {
        label: language === 'bg' ? 'Напред в процеса' : 'Advance stage',
        onClick: (row: PendingPartner) => {
          const current = row.requestStatus ?? 'NOVA';
          const next = NEXT_PIPELINE_STEP[current];
          if (!next) return;
          advanceMutation.mutate({ id: row.id, requestStatus: next });
        },
        hidden: (row: PendingPartner) => !NEXT_PIPELINE_STEP[row.requestStatus ?? 'NOVA'],
      },
      {
        label: language === 'bg' ? 'Задай на мен' : 'Assign to me',
        onClick: (row: PendingPartner) => {
          if (!user?.id) return;
          assignMutation.mutate({ id: row.id, adminId: user.id });
        },
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
          <Eyebrow>{t('admin.partners')}</Eyebrow>
          <PageTitle>
            {t('admin.requests')}
            {data && data.total > 0 && <CountBadge>{data.total}</CountBadge>}
          </PageTitle>
          <PageSubtitle>{t('admin.requestsSubtitle')}</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <SearchRow>
          <SearchInput
            type="text"
            placeholder={t('admin.requestSearchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <FilterSelect
            value={requestStatusFilter}
            onChange={(e) => { setRequestStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">{language === 'bg' ? 'Всички статуси' : 'All statuses'}</option>
            {REQUEST_STATUS_FILTER_OPTIONS.map(([key, lbl]) => (
              <option key={key} value={key}>{language === 'bg' ? lbl.bg : lbl.en}</option>
            ))}
          </FilterSelect>
          {/* Spec §5.1 v1.1 — "Брой обекти" filter */}
          <FilterSelect
            value={objectCountFilter}
            onChange={(e) => { setObjectCountFilter(e.target.value); setPage(1); }}
            aria-label={language === 'bg' ? 'Брой обекти' : 'Number of venues'}
          >
            <option value="">{language === 'bg' ? 'Всички обекти' : 'All venue counts'}</option>
            <option value="1">1</option>
            <option value="2-5">2-5</option>
            <option value="6-10">6-10</option>
            <option value="11+">11+</option>
          </FilterSelect>
        </SearchRow>

        <DataTable
          columns={columns}
          data={data?.partners ?? []}
          rowKey={(row) => row.id}
          rowActions={rowActions}
          loading={isLoading}
          emptyMessage={search ? t('common.noResultsFound') : t('admin.requestsEmpty')}
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.total}
          onPageChange={setPage}
          onRowClick={(row) => setDrawerPartnerId(row.id)}
        />
      </Card>

      {rejectTarget && (
        <Overlay onClick={() => setRejectTarget(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{t('admin.requestRejectTitle')}</ModalTitle>
            <ModalSubtitle>
              {t('admin.requestRejectSubtitle').replace('{name}', rejectTarget.businessName)}
            </ModalSubtitle>
            <ReasonTextarea
              placeholder={t('admin.requestRejectReasonPlaceholder')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
            <ModalActions>
              <Btn $variant="ghost" onClick={() => setRejectTarget(null)}>
                {t('common.cancel')}
              </Btn>
              <Btn
                $variant="danger"
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                onClick={() =>
                  rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason })
                }
              >
                {rejectMutation.isPending ? '…' : t('admin.requestReject')}
              </Btn>
            </ModalActions>
          </Modal>
        </Overlay>
      )}

      <PartnerRequestDrawer
        partnerId={drawerPartnerId}
        onClose={() => setDrawerPartnerId(null)}
        canWrite={!!canWrite}
        onApproved={() => queryClient.invalidateQueries({ queryKey: ['admin-partner-requests'] })}
        onRejected={() => queryClient.invalidateQueries({ queryKey: ['admin-partner-requests'] })}
      />

      {assignTarget && (
        <Overlay onClick={() => setAssignTarget(null)}>
          <Modal onClick={(e) => e.stopPropagation()}>
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
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '0.125rem',
                      padding: '0.625rem 0.875rem',
                      background: isCurrent ? palette.accentSoft : palette.bg,
                      border: `1px solid ${isCurrent ? palette.accent : palette.border}`,
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      textAlign: 'left',
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
    </PageShell>
  );
}
