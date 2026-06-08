import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import { palette } from '../../styles/adminTheme';
import {
  adminLocationsService,
  AdminVenue,
  MenuStatus,
  VenueStatus,
  VenueStatusHistoryEntry,
} from '../../services/adminLocations.service';

/* ─── Palette ─────────────────────────────────────────────────────────────── */

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
      default:         return `background: ${palette.surfaceAlt}; color: ${palette.textMuted};`;
    }
  }}
`;

const VenueStatusBadge = styled.span<{ $status: VenueStatus }>`
  display: inline-flex; align-items: center;
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'ACTIVE':    return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'SUSPENDED': return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'REPLACED':  return `background: ${palette.surfaceAlt}; color: ${palette.textMuted};`;
      default:          return `background: ${palette.surfaceAlt}; color: ${palette.textMuted};`;
    }
  }}
`;

const IdText = styled.span`
  font-family: monospace; font-size: 0.7rem;
  color: ${palette.textSubtle}; display: block; margin-top: 0.125rem;
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

/* ─── Detail Drawer ────────────────────────────────────────────────────────── */
const DrawerBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 900;
`;
const DrawerPanel = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  width: 100%;
  max-width: 26rem;
  background: ${palette.surface};
  border-left: 1px solid ${palette.border};
  z-index: 901;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
`;
const DrawerHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 0.75rem;
  border-bottom: 1px solid ${palette.border};
  gap: 0.75rem;
`;
const DrawerTitle = styled.h2`
  font-size: 1.1rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0;
  line-height: 1.3;
`;
const DrawerClose = styled.button`
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: ${palette.textSubtle};
  padding: 0.25rem;
  line-height: 1;
  flex-shrink: 0;
  &:hover { color: ${palette.text}; }
`;
const DrawerBody = styled.div`
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  flex: 1;
`;
const DrawerSection = styled.div``;
const DrawerSectionTitle = styled.div`
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${palette.textSubtle};
  margin-bottom: 0.5rem;
`;
const DrawerRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-size: 0.8125rem;
  gap: 0.5rem;
  padding: 0.25rem 0;
`;
const DrawerLabel = styled.span`
  color: ${palette.textMuted};
  flex-shrink: 0;
`;
const DrawerValue = styled.span`
  color: ${palette.text};
  font-weight: 500;
  text-align: right;
`;
const NoQrWarning = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.875rem;
  background: ${palette.warningSoft};
  border: 1px solid ${palette.warningBorder};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  color: ${palette.warning};
  font-weight: 600;
`;
const DrawerDivider = styled.hr`
  border: none;
  border-top: 1px solid ${palette.border};
  margin: 0;
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
        return `background: ${palette.danger}; color: ${palette.onAccent}; &:hover { opacity: 0.9; }`;
      case 'primary':
        return `background: ${palette.accent}; color: ${palette.onAccent}; &:hover { opacity: 0.9; }`;
      default:
        return `background: transparent; color: ${palette.textMuted}; border-color: ${palette.border}; &:hover { background: ${palette.bg}; }`;
    }
  }}
`;

const PAGE_SIZE = 25;

/* ─── QR Code Card (spec §5.4) ─────────────────────────────────────────────── */
function QrCodeCard({ qrValue, language }: { qrValue: string; language: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(qrValue, { width: 160, margin: 1, color: { dark: '#000', light: '#fff' } })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [qrValue]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${qrValue.slice(0, 8)}.png`;
    a.click();
  };

  return (
    <div style={{
      padding: '0.75rem', background: palette.bg, border: `1px solid ${palette.border}`,
      borderRadius: '0.5rem', marginBottom: '0.5rem',
    }}>
      {dataUrl ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <img src={dataUrl} alt="QR code" style={{ width: 80, height: 80, imageRendering: 'pixelated', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: palette.textMuted, wordBreak: 'break-all', marginBottom: '0.5rem' }}>
              {qrValue}
            </div>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => navigator.clipboard.writeText(qrValue).then(() => toast.success('QR value copied'))}
                style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem', fontWeight: 600, background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: '0.375rem', cursor: 'pointer' }}
              >
                📋 {language === 'bg' ? 'Копирай' : 'Copy'}
              </button>
              <button
                onClick={handleDownload}
                style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem', fontWeight: 600, background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: '0.375rem', cursor: 'pointer' }}
              >
                ↓ {language === 'bg' ? 'Свали PNG' : 'Download PNG'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: palette.textMuted, wordBreak: 'break-all', flex: 1 }}>{qrValue}</span>
          <button
            onClick={() => navigator.clipboard.writeText(qrValue).then(() => toast.success('QR value copied'))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: palette.textSubtle, fontSize: '0.8rem', flexShrink: 0 }}
          >
            📋
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Status history timeline (spec §5.4) ──────────────────────────────────── */
const STATUS_LABELS_TIMELINE: Record<VenueStatus, { bg: string; en: string }> = {
  ACTIVE:    { bg: 'Активна',  en: 'Active' },
  SUSPENDED: { bg: 'Спряна',   en: 'Suspended' },
  REPLACED:  { bg: 'Заменена', en: 'Replaced' },
};

function StatusHistoryTimeline({ venueId, language }: { venueId: string; language: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['venue-status-history', venueId],
    queryFn: () => adminLocationsService.getStatusHistory(venueId),
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: palette.textSubtle }}>
        …
      </div>
    );
  }
  if (error || !data?.data) {
    return null;
  }
  const history = data.data;
  if (history.length === 0) {
    return (
      <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: palette.textSubtle, fontStyle: 'italic' }}>
        {language === 'bg' ? 'Няма промени в статуса.' : 'No status changes recorded.'}
      </div>
    );
  }
  return (
    <div style={{ marginTop: '0.875rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: palette.textSubtle, marginBottom: '0.5rem' }}>
        {language === 'bg' ? 'История' : 'Timeline'} ({history.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {history.map((entry: VenueStatusHistoryEntry) => {
          const fromLabel = STATUS_LABELS_TIMELINE[entry.fromStatus]?.[language === 'bg' ? 'bg' : 'en'] ?? entry.fromStatus;
          const toLabel = STATUS_LABELS_TIMELINE[entry.toStatus]?.[language === 'bg' ? 'bg' : 'en'] ?? entry.toStatus;
          const actorName = entry.changedBy
            ? [entry.changedBy.firstName, entry.changedBy.lastName].filter(Boolean).join(' ').trim() || entry.changedBy.email
            : (language === 'bg' ? 'Системен' : 'System');
          const isStatusChange = entry.fromStatus !== entry.toStatus;
          return (
            <div
              key={entry.id}
              style={{
                padding: '0.5rem 0.75rem',
                background: palette.bg,
                border: `1px solid ${palette.border}`,
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ color: palette.text, fontWeight: 600 }}>
                  {isStatusChange ? `${fromLabel} → ${toLabel}` : (language === 'bg' ? 'Бележка обновена' : 'Note updated')}
                </span>
                <span style={{ color: palette.textSubtle, fontSize: '0.7rem' }}>
                  {new Date(entry.createdAt).toLocaleString(language === 'bg' ? 'bg-BG' : 'en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
              {entry.note && (
                <div style={{ marginTop: '0.25rem', color: palette.textMuted }}>
                  {entry.note}
                </div>
              )}
              <div style={{ marginTop: '0.25rem', color: palette.textSubtle, fontSize: '0.7rem' }}>
                {language === 'bg' ? 'От' : 'By'}: {actorName}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function AdminPartnerLocationsPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const canWrite = user?.rawRole === 'SUPER_ADMIN' || (user?.permissions ?? []).includes('partners.locations.write');

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [menuStatus, setMenuStatus] = useState<MenuStatus | ''>('');
  const [venueStatus, setVenueStatus] = useState<VenueStatus | ''>('');

  const [rejectTarget, setRejectTarget] = useState<AdminVenue | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [statusTarget, setStatusTarget] = useState<AdminVenue | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [statusValue, setStatusValue] = useState<VenueStatus>('ACTIVE');
  const [drawerVenue, setDrawerVenue] = useState<AdminVenue | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-venues', page, search, menuStatus, venueStatus],
    queryFn: () =>
      adminLocationsService.list({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        menuStatus: menuStatus || undefined,
        venueStatus: venueStatus || undefined,
      }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) =>
      adminLocationsService.approveMenu(id, url),
    onSuccess: () => {
      toast.success(t('admin.locationsMenuApproved'));
      queryClient.invalidateQueries({ queryKey: ['admin-venues'] });
    },
    onError: () => toast.error(t('admin.locationsMenuApproveFailed')),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminLocationsService.rejectMenu(id, reason),
    onSuccess: () => {
      toast.success(t('admin.locationsMenuRejected'));
      setRejectTarget(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-venues'] });
    },
    onError: () => toast.error(t('admin.locationsMenuRejectFailed')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, vs, note }: { id: string; vs: VenueStatus; note: string }) =>
      adminLocationsService.updateStatus(id, vs, note || undefined),
    onSuccess: (_data, vars) => {
      toast.success(language === 'bg' ? 'Статусът на локацията е обновен' : 'Location status updated');
      setStatusTarget(null);
      setStatusNote('');
      queryClient.invalidateQueries({ queryKey: ['admin-venues'] });
      // Also invalidate this venue's history so a freshly-changed status shows
      // up immediately if the drawer is reopened.
      queryClient.invalidateQueries({ queryKey: ['venue-status-history', vars.id] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? t('common.error');
      toast.error(msg);
    },
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { setSearch(searchInput); setPage(1); }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });

  const menuStatusOptions: Array<{ value: MenuStatus | ''; label: string }> = [
    { value: '', label: t('admin.locationsMenuStatusAll') },
    { value: 'NONE', label: t('admin.locationsMenuStatusNone') },
    { value: 'PENDING', label: t('admin.locationsMenuStatusPending') },
    { value: 'APPROVED', label: t('admin.locationsMenuStatusApproved') },
    { value: 'REJECTED', label: t('admin.locationsMenuStatusRejected') },
  ];

  const venueStatusOptions: Array<{ value: VenueStatus | ''; label: string }> = [
    { value: '', label: language === 'bg' ? 'Всички локации' : 'All locations' },
    { value: 'ACTIVE',    label: language === 'bg' ? 'Активна' : 'Active' },
    { value: 'SUSPENDED', label: language === 'bg' ? 'Спряна' : 'Suspended' },
    { value: 'REPLACED',  label: language === 'bg' ? 'Заменена' : 'Replaced' },
  ];

  const venueStatusLabels: Record<VenueStatus, { bg: string; en: string }> = {
    ACTIVE:    { bg: 'Активна',  en: 'Active' },
    SUSPENDED: { bg: 'Спряна',   en: 'Suspended' },
    REPLACED:  { bg: 'Заменена', en: 'Replaced' },
  };

  const columns: ColumnDef<AdminVenue>[] = [
    {
      key: 'venue',
      header: t('admin.locationsColVenue'),
      render: (row) => (
        <PrimaryLine>
          {row.name}
          <MetaLine>{row.address}, {row.city}{row.region ? `, ${row.region}` : ''}</MetaLine>
          {row.phone && <MetaLine>{row.phone}</MetaLine>}
          <IdText>ID: {row.id.slice(0, 8)}…</IdText>
        </PrimaryLine>
      ),
    },
    {
      key: 'partner',
      header: t('admin.locationsColPartner'),
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
      key: 'venueStatus',
      header: language === 'bg' ? 'Статус' : 'Status',
      render: (row) => {
        const vs: VenueStatus = (row.venueStatus as VenueStatus) ?? 'ACTIVE';
        const lbl = venueStatusLabels[vs];
        // Don't surface venueStatusNote inline for ACTIVE rows: a note carried
        // over from a prior REPLACED/SUSPENDED period is stale context, not a
        // current explanation. The drawer timeline keeps the audit trail.
        const showNote = !!row.venueStatusNote && vs !== 'ACTIVE';
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <VenueStatusBadge $status={vs}>{language === 'bg' ? lbl.bg : lbl.en}</VenueStatusBadge>
            {row.venueStatusAt && (
              <MetaLine>
                {new Date(row.venueStatusAt).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </MetaLine>
            )}
            {showNote && row.venueStatusNote && (
              <MetaLine title={row.venueStatusNote}>
                {row.venueStatusNote.length > 30 ? row.venueStatusNote.slice(0, 30) + '…' : row.venueStatusNote}
              </MetaLine>
            )}
          </span>
        );
      },
    },
    {
      key: 'qr',
      header: language === 'bg' ? 'QR / Стикери' : 'QR / Stickers',
      render: (row) => {
        const count = row._count?.stickers ?? 0;
        const cfg = row.stickerConfig;
        // Warn when an ACTIVE venue has no active sticker config — this is the
        // same condition the backend gate enforces on PATCH /:id/status → ACTIVE.
        const isActiveNoQr = (row.venueStatus as VenueStatus) === 'ACTIVE' && !cfg?.isActive;
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8125rem', color: isActiveNoQr ? palette.warning : palette.textMuted, fontWeight: isActiveNoQr ? 600 : 400 }}>
              {count > 0 ? (
                <span title={isActiveNoQr ? (language === 'bg' ? 'Активна локация без активна QR конфигурация!' : 'Active location has no active QR config!') : undefined}>
                  {isActiveNoQr ? '⚠ ' : ''}{count} QR {language === 'bg' ? 'кода' : 'codes'}
                </span>
              ) : (
                <span title={isActiveNoQr ? (language === 'bg' ? 'Активна локация без QR конфигурация!' : 'Active location has no QR config!') : undefined}>
                  {isActiveNoQr ? '⚠ ' : ''}{language === 'bg' ? 'Без QR' : 'No QR'}
                </span>
              )}
            </span>
            {cfg && (
              <MetaLine>
                <StickerDot $active={cfg.isActive} />
                {cfg.cashbackPercent}% cashback
              </MetaLine>
            )}
          </span>
        );
      },
    },
    {
      key: 'menu',
      header: t('admin.locationsColMenu'),
      render: (row) => {
        const menuStatusLabel: Record<string, string> = {
          NONE:     t('admin.locationsMenuStatusNone'),
          PENDING:  t('admin.locationsMenuStatusPending'),
          APPROVED: t('admin.locationsMenuStatusApproved'),
          REJECTED: t('admin.locationsMenuStatusRejected'),
        };
        return (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <MenuStatusBadge $status={row.menuStatus}>{menuStatusLabel[row.menuStatus] ?? row.menuStatus}</MenuStatusBadge>
          {row.pendingMenuUrl && (
            <a href={row.pendingMenuUrl} target="_blank" rel="noreferrer"
              style={{ fontSize: '0.75rem', color: palette.warning }}>
              {t('admin.locationsMenuPending')}
            </a>
          )}
          {row.menuUrl && row.menuStatus === 'APPROVED' && (
            <a href={row.menuUrl} target="_blank" rel="noreferrer"
              style={{ fontSize: '0.75rem', color: palette.teal }}>
              {t('admin.locationsMenuLive')}
            </a>
          )}
        </span>
        );
      },
    },
    {
      key: 'qrHistory',
      header: language === 'bg' ? 'QR История' : 'QR History',
      render: (row) => {
        const stickers = row.stickers ?? [];
        const vs: VenueStatus = (row.venueStatus as VenueStatus) ?? 'ACTIVE';
        // Spec §5.4 — surface "защо е сменян" inline only for non-ACTIVE
        // statuses (REPLACED/SUSPENDED). ACTIVE rows with a stale note from a
        // prior status change shouldn't leak that note here; the full timeline
        // is available in the drawer.
        const note = row.venueStatusNote;
        const showNote = !!note && vs !== 'ACTIVE';
        const noteLabel =
          vs === 'REPLACED' ? (language === 'bg' ? 'Заменен' : 'Replaced')
          : vs === 'SUSPENDED' ? (language === 'bg' ? 'Спрян' : 'Suspended')
          : (language === 'bg' ? 'Бележка' : 'Note');
        const historyCount = row._count?.statusHistory ?? 0;

        if (stickers.length === 0 && !showNote && historyCount === 0) {
          return <span style={{ color: palette.textSubtle, fontSize: '0.8125rem' }}>—</span>;
        }
        const latest = stickers[0];
        const activeCount = stickers.filter(s => s.status === 'ACTIVE').length;
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
            {latest && (
              <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
                {language === 'bg' ? 'Последен:' : 'Latest:'} {fmt(latest.createdAt)}
              </span>
            )}
            {stickers.length > 1 && (
              <MetaLine>
                {activeCount}/{stickers.length} {language === 'bg' ? 'активни' : 'active'}
              </MetaLine>
            )}
            {showNote && note && (
              <span
                title={note}
                style={{
                  fontSize: '0.7rem',
                  color: palette.danger,
                  fontWeight: 500,
                  marginTop: '0.125rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <span style={{ fontWeight: 700 }}>{noteLabel}:</span>{' '}
                {note.length > 40 ? note.slice(0, 40) + '…' : note}
              </span>
            )}
            {historyCount > 0 && (
              <MetaLine style={{ color: palette.textSubtle }}>
                {language === 'bg' ? 'Промени' : 'Changes'}: <strong>{historyCount}</strong>
              </MetaLine>
            )}
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      header: t('admin.locationsColCreated'),
      render: (row) => (
        <span style={{ color: palette.textMuted, fontSize: '0.8125rem' }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>{t('admin.partners')}</Eyebrow>
          <PageTitle>
            {t('admin.locationsPageTitle')}
            {data && data.meta.total > 0 && (
              <TotalBadge>{data.meta.total.toLocaleString()}</TotalBadge>
            )}
          </PageTitle>
          <PageSubtitle>{t('admin.locationsPageSubtitle')}</PageSubtitle>
        </TitleBlock>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder={t('admin.locationsSearchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <Select
            value={venueStatus}
            onChange={(e) => { setVenueStatus(e.target.value as VenueStatus | ''); setPage(1); }}
          >
            {venueStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select
            value={menuStatus}
            onChange={(e) => { setMenuStatus(e.target.value as MenuStatus | ''); setPage(1); }}
          >
            {menuStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          emptyMessage={t('admin.locationsEmpty')}
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={data?.meta.total}
          onPageChange={setPage}
          onRowClick={(row) => setDrawerVenue(row)}
          rowActions={[
            ...(canWrite ? [{
              label: language === 'bg' ? 'Промени статус' : 'Change Status',
              onClick: (row: AdminVenue) => {
                setStatusTarget(row);
                const currentVs = (row.venueStatus as VenueStatus) ?? 'ACTIVE';
                setStatusValue(currentVs);
                // Only carry the note forward when it's still relevant (i.e. the
                // venue is currently non-ACTIVE). For ACTIVE venues, any stored
                // note is stale context from a prior REPLACED/SUSPENDED period
                // and shouldn't pre-fill the textarea — otherwise saving without
                // editing re-stamps the stale note into the next history row.
                setStatusNote(currentVs !== 'ACTIVE' ? (row.venueStatusNote ?? '') : '');
              },
            }] : []),
            {
              label: t('admin.locationsApproveMenu'),
              hidden: (row: AdminVenue) => row.menuStatus !== 'PENDING' || !row.pendingMenuUrl,
              onClick: (row: AdminVenue) => {
                if (!row.pendingMenuUrl) return;
                approveMutation.mutate({ id: row.id, url: row.pendingMenuUrl });
              },
            },
            {
              label: t('admin.locationsRejectMenu'),
              danger: true,
              hidden: (row: AdminVenue) => row.menuStatus !== 'PENDING',
              onClick: (row: AdminVenue) => { setRejectTarget(row); setRejectReason(''); },
            },
          ]}
        />
      </Card>

      {rejectTarget && (
        <Overlay onClick={() => setRejectTarget(null)}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalTitle>
              {t('admin.locationsRejectMenuTitle').replace('{name}', rejectTarget.name)}
            </ModalTitle>
            <ModalLabel>{t('admin.locationsRejectMenuLabel')}</ModalLabel>
            <ModalTextarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('admin.locationsRejectMenuPlaceholder')}
            />
            <ModalActions>
              <Btn $variant="ghost" onClick={() => setRejectTarget(null)}>
                {t('common.cancel')}
              </Btn>
              <Btn
                $variant="danger"
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                onClick={() =>
                  rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })
                }
              >
                {rejectMutation.isPending ? '…' : t('admin.locationsRejectMenu')}
              </Btn>
            </ModalActions>
          </ModalBox>
        </Overlay>
      )}

      {statusTarget && (
        <Overlay onClick={() => setStatusTarget(null)}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalTitle>
              {language === 'bg' ? `Статус — ${statusTarget.name}` : `Status — ${statusTarget.name}`}
            </ModalTitle>
            <ModalLabel>{language === 'bg' ? 'Нов статус' : 'New status'}</ModalLabel>
            <Select
              value={statusValue}
              onChange={(e) => {
                const next = e.target.value as VenueStatus;
                setStatusValue(next);
                // Flipping to ACTIVE clears any pre-filled note so the venue
                // doesn't carry a stale REPLACED/SUSPENDED-era explanation
                // forward. Admin can re-type if they want a reactivation note.
                if (next === 'ACTIVE') setStatusNote('');
              }}
              style={{ width: '100%', marginBottom: '0.75rem' }}
            >
              {venueStatusOptions.filter((o) => o.value !== '').map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <ModalLabel>{language === 'bg' ? 'Бележка (незадължително)' : 'Note (optional)'}</ModalLabel>
            <ModalTextarea
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              placeholder={language === 'bg' ? 'Причина или вътрешна бележка…' : 'Reason or internal note…'}
            />
            <ModalActions>
              <Btn $variant="ghost" onClick={() => setStatusTarget(null)}>
                {t('common.cancel')}
              </Btn>
              <Btn
                $variant="primary"
                disabled={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({ id: statusTarget.id, vs: statusValue, note: statusNote })
                }
              >
                {statusMutation.isPending ? '…' : (language === 'bg' ? 'Запази' : 'Save')}
              </Btn>
            </ModalActions>
          </ModalBox>
        </Overlay>
      )}

      {drawerVenue && (
        <>
          <DrawerBackdrop onClick={() => setDrawerVenue(null)} />
          <DrawerPanel>
            <DrawerHeader>
              <div>
                <DrawerTitle>{drawerVenue.name}</DrawerTitle>
                <MetaLine style={{ marginTop: '0.25rem' }}>{drawerVenue.address}, {drawerVenue.city}</MetaLine>
              </div>
              <DrawerClose onClick={() => setDrawerVenue(null)}>✕</DrawerClose>
            </DrawerHeader>

            <DrawerBody>
              {/* No-QR warning — mirrors the backend gate: ACTIVE without an
                  active stickerConfig means scanning is broken for this venue. */}
              {(drawerVenue.venueStatus as VenueStatus) === 'ACTIVE' && !drawerVenue.stickerConfig?.isActive && (
                <NoQrWarning>
                  ⚠ {language === 'bg' ? 'Активна локация без активна QR конфигурация — настройте QR / стикер конфигурацията.' : 'Active location has no active QR config — set up the sticker configuration.'}
                </NoQrWarning>
              )}

              {/* Identity */}
              <DrawerSection>
                <DrawerSectionTitle>{language === 'bg' ? 'Детайли' : 'Details'}</DrawerSectionTitle>
                <DrawerRow>
                  <DrawerLabel>ID</DrawerLabel>
                  <DrawerValue
                    style={{ fontFamily: 'monospace', fontSize: '0.72rem', cursor: 'pointer', wordBreak: 'break-all' }}
                    title={language === 'bg' ? 'Щракнете за копиране' : 'Click to copy'}
                    onClick={() => navigator.clipboard.writeText(drawerVenue.id).then(() => toast.success('ID copied'))}
                  >
                    {drawerVenue.id} 📋
                  </DrawerValue>
                </DrawerRow>
                {drawerVenue.phone && (
                  <DrawerRow>
                    <DrawerLabel>{language === 'bg' ? 'Телефон' : 'Phone'}</DrawerLabel>
                    <DrawerValue>{drawerVenue.phone}</DrawerValue>
                  </DrawerRow>
                )}
                {drawerVenue.region && (
                  <DrawerRow>
                    <DrawerLabel>{language === 'bg' ? 'Регион' : 'Region'}</DrawerLabel>
                    <DrawerValue>{drawerVenue.region}</DrawerValue>
                  </DrawerRow>
                )}
                <DrawerRow>
                  <DrawerLabel>{language === 'bg' ? 'Партньор' : 'Partner'}</DrawerLabel>
                  <DrawerValue>{drawerVenue.partner.businessName}</DrawerValue>
                </DrawerRow>
                <DrawerRow>
                  <DrawerLabel>{language === 'bg' ? 'Създадена' : 'Created'}</DrawerLabel>
                  <DrawerValue>{fmt(drawerVenue.createdAt)}</DrawerValue>
                </DrawerRow>
              </DrawerSection>

              <DrawerDivider />

              {/* Status + history */}
              <DrawerSection>
                <DrawerSectionTitle>{language === 'bg' ? 'Статус & История' : 'Status & History'}</DrawerSectionTitle>
                <DrawerRow>
                  <DrawerLabel>{language === 'bg' ? 'Текущ статус' : 'Current status'}</DrawerLabel>
                  <DrawerValue>
                    <VenueStatusBadge $status={(drawerVenue.venueStatus as VenueStatus) ?? 'ACTIVE'}>
                      {venueStatusLabels[(drawerVenue.venueStatus as VenueStatus) ?? 'ACTIVE']?.[language === 'bg' ? 'bg' : 'en']}
                    </VenueStatusBadge>
                  </DrawerValue>
                </DrawerRow>
                {drawerVenue.venueStatusAt && (
                  <DrawerRow>
                    <DrawerLabel>{language === 'bg' ? 'Промяна на' : 'Changed on'}</DrawerLabel>
                    <DrawerValue>{fmt(drawerVenue.venueStatusAt)}</DrawerValue>
                  </DrawerRow>
                )}
                {/* Current-status note only makes sense while the venue is in
                    a non-ACTIVE state. For ACTIVE venues the timeline below is
                    the canonical history; surfacing a stale note here would
                    just duplicate the prior REPLACED/SUSPENDED entry. */}
                {(() => {
                  const drawerVs = (drawerVenue.venueStatus as VenueStatus) ?? 'ACTIVE';
                  if (drawerVs === 'ACTIVE') return null;
                  return drawerVenue.venueStatusNote ? (
                    <div style={{ marginTop: '0.5rem', padding: '0.625rem 0.75rem', background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: '0.5rem', fontSize: '0.8125rem', color: palette.textMuted }}>
                      {drawerVenue.venueStatusNote}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8125rem', color: palette.textSubtle, fontStyle: 'italic', marginTop: '0.25rem' }}>
                      {language === 'bg' ? 'Няма бележка за статуса.' : 'No status note.'}
                    </div>
                  );
                })()}
                <StatusHistoryTimeline venueId={drawerVenue.id} language={language} />
              </DrawerSection>

              <DrawerDivider />

              {/* QR */}
              <DrawerSection>
                <DrawerSectionTitle>QR {language === 'bg' ? 'Кодове' : 'Codes'}</DrawerSectionTitle>
                <DrawerRow>
                  <DrawerLabel>{language === 'bg' ? 'Брой QR' : 'QR count'}</DrawerLabel>
                  <DrawerValue>{drawerVenue._count?.stickers ?? 0}</DrawerValue>
                </DrawerRow>
                {drawerVenue.stickerConfig && (
                  <>
                    <DrawerRow>
                      <DrawerLabel>{language === 'bg' ? 'Кешбек %' : 'Cashback %'}</DrawerLabel>
                      <DrawerValue>{drawerVenue.stickerConfig.cashbackPercent}%</DrawerValue>
                    </DrawerRow>
                    <DrawerRow>
                      <DrawerLabel>{language === 'bg' ? 'Активен' : 'Active'}</DrawerLabel>
                      <DrawerValue>{drawerVenue.stickerConfig.isActive ? (language === 'bg' ? 'Да' : 'Yes') : (language === 'bg' ? 'Не' : 'No')}</DrawerValue>
                    </DrawerRow>
                    <DrawerRow>
                      <DrawerLabel>{language === 'bg' ? 'Макс. скана/ден' : 'Max scans/day'}</DrawerLabel>
                      <DrawerValue>
                        {drawerVenue.stickerConfig.maxScansPerDay >= 999999
                          ? (language === 'bg' ? 'Неограничен' : 'Unlimited')
                          : drawerVenue.stickerConfig.maxScansPerDay}
                      </DrawerValue>
                    </DrawerRow>
                  </>
                )}
                {drawerVenue.stickers && drawerVenue.stickers.length > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: palette.textSubtle, marginBottom: '0.5rem' }}>
                      {language === 'bg' ? 'QR кодове' : 'QR Codes'}
                    </div>
                    {drawerVenue.stickers.map((s, i) => (
                      <QrCodeCard key={i} qrValue={s.qrCode} language={language} />
                    ))}
                  </div>
                )}
              </DrawerSection>

              {canWrite && (
                <>
                  <DrawerDivider />
                  <Btn
                    $variant="primary"
                    onClick={() => {
                      setStatusTarget(drawerVenue);
                      const currentVs = (drawerVenue.venueStatus as VenueStatus) ?? 'ACTIVE';
                      setStatusValue(currentVs);
                      // See Change-Status row action: don't carry a stale ACTIVE-era
                      // note into the modal; saving unchanged would re-persist it.
                      setStatusNote(currentVs !== 'ACTIVE' ? (drawerVenue.venueStatusNote ?? '') : '');
                      setDrawerVenue(null);
                    }}
                  >
                    {language === 'bg' ? 'Промени статус' : 'Change Status'}
                  </Btn>
                </>
              )}
            </DrawerBody>
          </DrawerPanel>
        </>
      )}
    </PageShell>
  );
}
