import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { DataTable, ColumnDef, RowAction } from '../../components/admin/DataTable/DataTable';
import {
  adminPartnerRequestsService,
  PendingPartner,
} from '../../services/adminPartnerRequests.service';
import { getCategoryName } from '../../types/categories.types';

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

const DiscountBadge = styled.span`
  display: inline-flex;
  align-items: center;
  background: ${palette.accentSoft};
  color: ${palette.accent};
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
`;

/* ─── Component ───────────────────────────────────────────────────────────── */
const PAGE_SIZE = 20;

export default function AdminPartnerRequestsPage() {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<PendingPartner | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-partner-requests', page, search],
    queryFn: () => adminPartnerRequestsService.list({ page, limit: PAGE_SIZE, search: search || undefined }),
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
          <MetaLine>{getCategoryName(row.category, language as 'en' | 'bg')}</MetaLine>
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
      key: 'city',
      header: t('admin.requestColCity'),
      render: (row) => <span style={{ color: palette.textMuted }}>{row.city ?? '—'}</span>,
    },
    {
      key: 'discountRate',
      header: t('admin.requestColDiscount'),
      render: (row) =>
        row.discountRate != null ? (
          <DiscountBadge>{row.discountRate}%</DiscountBadge>
        ) : (
          <span style={{ color: palette.textSubtle }}>—</span>
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
  ];

  const rowActions: RowAction<PendingPartner>[] = [
    {
      label: t('admin.requestApprove'),
      onClick: (row) => approveMutation.mutate(row.id),
    },
    {
      label: t('admin.requestReject'),
      danger: true,
      onClick: (row) => {
        setRejectTarget(row);
        setRejectReason('');
      },
    },
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
    </PageShell>
  );
}
