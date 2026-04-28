import React, { useState } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminLocationsService,
  AdminVenue,
  MenuStatus,
} from '../../services/adminLocations.service';

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
  info: '#2563eb',
  infoSoft: '#dbeafe',
  teal: '#0f766e',
  tealSoft: '#ccfbf1',
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
const TotalBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${palette.infoSoft};
  color: ${palette.info};
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
const FilterRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
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
  &::placeholder { color: ${palette.textSubtle}; }
`;
const Select = styled.select`
  padding: 0.5rem 0.75rem;
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

/* ─── Cell helpers ─────────────────────────────────────────────────────────── */
const PrimaryLine = styled.div`
  font-weight: 600;
  color: ${palette.text};
`;
const MetaLine = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin-top: 0.125rem;
`;

const MenuStatusBadge = styled.span<{ $status: MenuStatus }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'APPROVED': return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'PENDING':  return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      case 'REJECTED': return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      default:         return `background: #f3f4f6; color: #6b7280;`;
    }
  }}
`;

const StickerDot = styled.span<{ $active: boolean }>`
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: ${({ $active }) => ($active ? palette.success : palette.textSubtle)};
  margin-right: 0.375rem;
`;

const PartnerTypePill = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 0.25rem;
  padding: 0.1rem 0.4rem;
  background: ${({ $color }) => $color}22;
  color: ${({ $color }) => $color};
  margin-top: 0.125rem;
`;

/* ─── Modal ────────────────────────────────────────────────────────────────── */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;
const ModalBox = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.75rem;
  width: 100%;
  max-width: 26rem;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
`;
const ModalTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.75rem;
`;
const ModalLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${palette.textMuted};
  display: block;
  margin-bottom: 0.375rem;
`;
const ModalTextarea = styled.textarea`
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  resize: vertical;
  min-height: 80px;
  box-sizing: border-box;
  &:focus { outline: none; border-color: ${palette.accent}; }
`;
const ModalActions = styled.div`
  display: flex;
  gap: 0.625rem;
  justify-content: flex-end;
  margin-top: 1rem;
`;
const Btn = styled.button<{ $variant?: 'danger' | 'primary' | 'ghost' }>`
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  ${({ $variant }) => {
    switch ($variant) {
      case 'danger':
        return `background: ${palette.danger}; color: #fff; &:hover { opacity: 0.9; }`;
      case 'primary':
        return `background: ${palette.accent}; color: #fff; &:hover { opacity: 0.9; }`;
      default:
        return `background: transparent; color: ${palette.textMuted}; border-color: ${palette.border}; &:hover { background: ${palette.bg}; }`;
    }
  }}
`;

/* ─── Options ──────────────────────────────────────────────────────────────── */
const MENU_STATUS_OPTIONS: Array<{ value: MenuStatus | ''; label: string }> = [
  { value: '', label: 'All menu statuses' },
  { value: 'NONE', label: 'No menu' },
  { value: 'PENDING', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const PAGE_SIZE = 25;

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function AdminPartnerLocationsPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [menuStatus, setMenuStatus] = useState<MenuStatus | ''>('');

  const [rejectTarget, setRejectTarget] = useState<AdminVenue | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-venues', page, search, menuStatus],
    queryFn: () =>
      adminLocationsService.list({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        menuStatus: menuStatus || undefined,
      }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) =>
      adminLocationsService.approveMenu(id, url),
    onSuccess: () => {
      toast.success('Menu approved');
      queryClient.invalidateQueries({ queryKey: ['admin-venues'] });
    },
    onError: () => toast.error('Failed to approve menu'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminLocationsService.rejectMenu(id, reason),
    onSuccess: () => {
      toast.success('Menu rejected');
      setRejectTarget(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-venues'] });
    },
    onError: () => toast.error('Failed to reject menu'),
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const columns: ColumnDef<AdminVenue>[] = [
    {
      key: 'venue',
      header: 'Venue',
      render: (row) => (
        <PrimaryLine>
          {row.name}
          <MetaLine>{row.address}, {row.city}{row.region ? `, ${row.region}` : ''}</MetaLine>
          {row.phone && <MetaLine>{row.phone}</MetaLine>}
        </PrimaryLine>
      ),
    },
    {
      key: 'partner',
      header: 'Partner',
      render: (row) => (
        <span>
          <PrimaryLine style={{ fontWeight: 500 }}>{row.partner.businessName}</PrimaryLine>
          {row.partner.partnerType && (
            <PartnerTypePill $color={row.partner.partnerType.color}>
              {row.partner.partnerType.name}
            </PartnerTypePill>
          )}
        </span>
      ),
    },
    {
      key: 'menu',
      header: 'Menu',
      render: (row) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <MenuStatusBadge $status={row.menuStatus}>{row.menuStatus}</MenuStatusBadge>
          {row.pendingMenuUrl && (
            <a
              href={row.pendingMenuUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.75rem', color: palette.warning }}
            >
              Pending ↗
            </a>
          )}
          {row.menuUrl && row.menuStatus === 'APPROVED' && (
            <a
              href={row.menuUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.75rem', color: palette.teal }}
            >
              Live ↗
            </a>
          )}
        </span>
      ),
    },
    {
      key: 'sticker',
      header: 'Sticker',
      render: (row) => {
        if (!row.stickerConfig) {
          return <MetaLine>Not configured</MetaLine>;
        }
        return (
          <span>
            <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
              <StickerDot $active={row.stickerConfig.isActive} />
              {row.stickerConfig.cashbackPercent}% cashback
            </span>
            <MetaLine>GPS {row.stickerConfig.gpsVerificationEnabled ? 'on' : 'off'}</MetaLine>
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Partners</Eyebrow>
          <PageTitle>
            Locations
            {data && data.meta.total > 0 && (
              <TotalBadge>{data.meta.total.toLocaleString()}</TotalBadge>
            )}
          </PageTitle>
          <PageSubtitle>All partner venues — menus, sticker configs, and locations</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search venue name, partner, city…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <Select
            value={menuStatus}
            onChange={(e) => { setMenuStatus(e.target.value as MenuStatus | ''); setPage(1); }}
          >
            {MENU_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage="No venues found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.meta.total}
          onPageChange={setPage}
          rowActions={[
            {
              label: 'Approve menu',
              hidden: (row) => row.menuStatus !== 'PENDING',
              onClick: (row) => {
                if (!row.pendingMenuUrl) return;
                approveMutation.mutate({ id: row.id, url: row.pendingMenuUrl });
              },
            },
            {
              label: 'Reject menu',
              danger: true,
              hidden: (row) => row.menuStatus !== 'PENDING',
              onClick: (row) => { setRejectTarget(row); setRejectReason(''); },
            },
          ]}
        />
      </Card>

      {rejectTarget && (
        <Overlay onClick={() => setRejectTarget(null)}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Reject menu — {rejectTarget.name}</ModalTitle>
            <ModalLabel>Reason for rejection</ModalLabel>
            <ModalTextarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this menu URL was rejected…"
            />
            <ModalActions>
              <Btn $variant="ghost" onClick={() => setRejectTarget(null)}>
                Cancel
              </Btn>
              <Btn
                $variant="danger"
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                onClick={() =>
                  rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })
                }
              >
                {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
              </Btn>
            </ModalActions>
          </ModalBox>
        </Overlay>
      )}
    </PageShell>
  );
}
