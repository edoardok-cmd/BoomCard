import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminMarketingService,
  MarketingCampaign,
  MarketingChannel,
  CampaignStatus,
  MarketingTemplate,
  MarketingList,
} from '../../services/adminMarketing.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  warning: '#b5803a', warningSoft: '#f5ead2',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  info: '#2563eb', infoSoft: '#dbeafe',
};

const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const TotalBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${palette.infoSoft}; color: ${palette.info}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const FilterRow = styled.div`display: flex; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center;`;
const SearchInput = styled.input`flex: 1; max-width: 18rem; padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; } &::placeholder { color: ${palette.textSubtle}; }`;
const DateInput = styled.input`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const FilterLabel = styled.span`font-size: 0.75rem; color: ${palette.textSubtle}; white-space: nowrap;`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

const SortableHeader = styled.button<{ $active: boolean }>`
  background: none; border: none; padding: 0; cursor: pointer; font-size: inherit;
  font-weight: 700; color: ${({ $active }) => $active ? palette.accent : 'inherit'};
  display: inline-flex; align-items: center; gap: 0.25rem;
  &:hover { color: ${palette.accent}; }
`;

const StatusBadge = styled.span<{ $status: CampaignStatus }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'SENT':      return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'SCHEDULED': return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'PAUSED':    return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      default:          return `background: ${palette.border}; color: ${palette.textMuted};`;
    }
  }}
`;

const TYPE_COLOR: Record<MarketingChannel, string> = {
  EMAIL: palette.info,
  PUSH: palette.accent,
  SMS: palette.success,
};

const PrimaryBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.accent}; color: #fff; border: none; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { opacity: 0.9; } &:disabled { opacity: 0.5; cursor: default; }`;
const GhostBtn = styled.button`padding: 0.5rem 1.125rem; background: transparent; color: ${palette.textMuted}; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { border-color: ${palette.textMuted}; }`;
const DangerBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.dangerSoft}; color: ${palette.danger}; border: 1px solid #f1c4b8; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { background: #eebcac; }`;

const ToggleBtn = styled.button<{ $variant: 'info' | 'warn' | 'success' | 'danger' }>`
  margin-left: 0.4rem; padding: 0.1rem 0.45rem; border-radius: 0.25rem; font-size: 0.65rem;
  font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; cursor: pointer; border: 1px solid;
  ${({ $variant }) => {
    if ($variant === 'info')    return `background: ${palette.infoSoft}; color: ${palette.info}; border-color: #93c5fd;`;
    if ($variant === 'warn')    return `background: ${palette.warningSoft}; color: ${palette.warning}; border-color: #fbbf24;`;
    if ($variant === 'danger')  return `background: ${palette.dangerSoft}; color: ${palette.danger}; border-color: #f1c4b8;`;
    return `background: ${palette.successSoft}; color: ${palette.success}; border-color: #86efac;`;
  }}
  &:hover { opacity: 0.8; } &:disabled { opacity: 0.45; cursor: default; }
`;

const Overlay = styled.div`position: fixed; inset: 0; background: rgba(20,20,19,0.45); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 1rem;`;
const ModalBox = styled.div`background: ${palette.surface}; border-radius: 0.875rem; width: 100%; max-width: 34rem; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.18);`;
const ModalHeader = styled.div`display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid ${palette.border};`;
const ModalTitle = styled.h2`font-size: 1.125rem; font-weight: 700; color: ${palette.text}; margin: 0;`;
const CloseBtn = styled.button`background: none; border: none; font-size: 1.25rem; color: ${palette.textSubtle}; cursor: pointer; padding: 0.25rem; line-height: 1; &:hover { color: ${palette.text}; }`;
const ModalBody = styled.div`padding: 1.5rem;`;
const ModalFooter = styled.div`display: flex; gap: 0.75rem; justify-content: flex-end; padding: 1rem 1.5rem; border-top: 1px solid ${palette.border};`;
const FormGroup = styled.div`display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1.125rem;`;
const Label = styled.label`font-size: 0.8125rem; font-weight: 600; color: ${palette.text};`;
const Input = styled.input`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 100%; box-sizing: border-box; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }`;
const ModalSelect = styled.select`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 100%; &:focus { border-color: ${palette.accent}; }`;
const ConfirmText = styled.p`font-size: 0.9375rem; color: ${palette.text}; margin: 0 0 0.5rem;`;
const ConfirmSub = styled.p`font-size: 0.8125rem; color: ${palette.textSubtle}; margin: 0;`;
const HintText = styled.p`font-size: 0.75rem; color: ${palette.textSubtle}; margin: 0.25rem 0 0;`;
const InfoBox = styled.div`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.textMuted};`;
const WarnBanner = styled.div`padding: 0.5rem 0.875rem; border: 1px solid #fbbf24; border-radius: 0.5rem; font-size: 0.8125rem; background: ${palette.warningSoft}; color: ${palette.warning}; margin-bottom: 1.125rem;`;
const ErrorBanner = styled.div`padding: 0.5rem 0.875rem; border: 1px solid #f1c4b8; border-radius: 0.5rem; font-size: 0.8125rem; background: ${palette.dangerSoft}; color: ${palette.danger}; margin-bottom: 1.125rem;`;

const DetailGrid = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;`;
const DetailItem = styled.div``;
const DetailLabel = styled.div`font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const DetailValue = styled.div`font-size: 0.9375rem; color: ${palette.text}; font-weight: 500;`;

type ModalMode = 'create' | 'edit' | 'delete' | 'view' | null;
type ConfirmMode = 'reset-draft' | 'send-now' | null;

interface FormState {
  name: string;
  type: MarketingChannel;
  status: 'DRAFT' | 'SCHEDULED' | 'PAUSED';
  scheduledAt: string;
  templateId: string;
  listId: string;
}

const DEFAULT_FORM: FormState = { name: '', type: 'EMAIL', status: 'DRAFT', scheduledAt: '', templateId: '', listId: '' };
const PAGE_SIZE = 25;

function toLocalDatetimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type SortField = 'name' | 'status' | 'sentAt' | 'scheduledAt' | 'createdAt';

export default function AdminMarketingCampaignsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('');
  const [channelFilter, setChannelFilter] = useState<MarketingChannel | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MarketingCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [lists, setLists] = useState<MarketingList[]>([]);

  const [modal, setModal] = useState<ModalMode>(null);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);
  const [confirmTarget, setConfirmTarget] = useState<MarketingCampaign | null>(null);
  const [confirmError, setConfirmError] = useState('');
  const [selected, setSelected] = useState<MarketingCampaign | null>(null);
  const [detailData, setDetailData] = useState<MarketingCampaign | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminMarketingService
      .listCampaigns({
        page, limit: PAGE_SIZE, search,
        status: statusFilter, type: channelFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy, sortDir,
      })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .finally(() => setLoading(false));
  }, [page, search, statusFilter, channelFilter, dateFrom, dateTo, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminMarketingService.listTemplates({ limit: 100 }).then((r) => setTemplates(r.items));
    adminMarketingService.listLists({ limit: 100 }).then((r) => setLists(r.items));
  }, []);

  // ── Column sorting ────────────────────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  const sortIcon = (field: SortField) => {
    if (sortBy !== field) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  // ── Inline status toggles ─────────────────────────────────────────────────

  const handleStatusToggle = async (row: MarketingCampaign, next: CampaignStatus) => {
    setTogglingId(row.id);
    try {
      await adminMarketingService.patchCampaignStatus(row.id, next);
      load();
    } finally {
      setTogglingId(null);
    }
  };

  const openSendConfirm = (row: MarketingCampaign) => {
    setConfirmTarget(row);
    setConfirmError('');
    setConfirmMode('send-now');
  };

  const openResetConfirm = (row: MarketingCampaign) => {
    setConfirmTarget(row);
    setConfirmError('');
    setConfirmMode('reset-draft');
  };

  const handleConfirmAction = async () => {
    if (!confirmTarget) return;
    setSaving(true);
    setConfirmError('');
    try {
      if (confirmMode === 'send-now') {
        await adminMarketingService.patchCampaignStatus(confirmTarget.id, 'SENT');
      } else if (confirmMode === 'reset-draft') {
        await adminMarketingService.patchCampaignStatus(confirmTarget.id, 'DRAFT');
      }
      setConfirmMode(null);
      setConfirmTarget(null);
      load();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'An error occurred. Please try again.';
      setConfirmError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── CRUD modals ───────────────────────────────────────────────────────────

  const openCreate = () => {
    setSelected(null);
    setForm(DEFAULT_FORM);
    setModal('create');
  };

  const openEdit = (row: MarketingCampaign) => {
    setSelected(row);
    const safeStatus = (['DRAFT', 'SCHEDULED', 'PAUSED'] as const).includes(row.status as 'DRAFT' | 'SCHEDULED' | 'PAUSED')
      ? (row.status as 'DRAFT' | 'SCHEDULED' | 'PAUSED')
      : 'DRAFT';
    setForm({
      name: row.name,
      type: row.type,
      status: safeStatus,
      scheduledAt: toLocalDatetimeInput(row.scheduledAt),
      templateId: row.templateId ?? '',
      listId: row.listId ?? '',
    });
    setModal('edit');
  };

  const openDelete = (row: MarketingCampaign) => {
    setSelected(row);
    setModal('delete');
  };

  const openView = async (row: MarketingCampaign) => {
    setSelected(row);
    setDetailData(null);
    setModal('view');
    setDetailLoading(true);
    try {
      const detail = await adminMarketingService.getCampaign(row.id);
      setDetailData(detail);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => { setModal(null); setSelected(null); setDetailData(null); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        status: form.status,
        scheduledAt: form.status === 'SCHEDULED' && form.scheduledAt
          ? new Date(form.scheduledAt).toISOString()
          : undefined,
        templateId: form.templateId || undefined,
        listId: form.listId || undefined,
      };
      if (modal === 'create') {
        await adminMarketingService.createCampaign(payload);
      } else if (modal === 'edit' && selected) {
        await adminMarketingService.updateCampaign(selected.id, payload);
      }
      closeModal();
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminMarketingService.deleteCampaign(selected.id);
      closeModal();
      load();
    } finally {
      setSaving(false);
    }
  };

  // ── Computed audience from selected list ──────────────────────────────────

  const selectedList = lists.find((l) => l.id === form.listId);
  const computedAudience = selectedList ? selectedList.size : null;

  // ── Warnings ──────────────────────────────────────────────────────────────

  const noTemplateWarning = form.status === 'SCHEDULED' && !form.templateId;

  // Send-now pre-flight warnings for confirm dialog
  const sendNowWarnings: string[] = [];
  if (confirmTarget && confirmMode === 'send-now') {
    if (!confirmTarget.templateId) sendNowWarnings.push('No template assigned — the campaign has no content to send.');
    if (!confirmTarget.listId)     sendNowWarnings.push('No audience list selected — no recipients will receive this campaign.');
    else if (confirmTarget.audience === 0) sendNowWarnings.push('The audience list appears to have 0 members.');
    if (confirmTarget.type === 'SMS') sendNowWarnings.push('SMS delivery is not yet enabled — marking this campaign as sent will not dispatch any messages to recipients.');
  }

  // ── Columns ───────────────────────────────────────────────────────────────

  const columns: ColumnDef<MarketingCampaign>[] = [
    {
      key: 'name',
      header: (
        <SortableHeader $active={sortBy === 'name'} onClick={() => handleSort('name')}>
          Campaign{sortIcon('name')}
        </SortableHeader>
      ) as unknown as string,
      render: (row) => (
        <span>
          <PrimaryLine>{row.name}</PrimaryLine>
          <MetaLine>
            <span style={{ color: TYPE_COLOR[row.type], fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.type}</span>
            <span style={{ marginLeft: '0.5rem', color: palette.textSubtle }}>Created {fmtDate(row.createdAt)}</span>
          </MetaLine>
        </span>
      ),
    },
    {
      key: 'status',
      header: (
        <SortableHeader $active={sortBy === 'status'} onClick={() => handleSort('status')}>
          Status{sortIcon('status')}
        </SortableHeader>
      ) as unknown as string,
      render: (row) => {
        const busy = togglingId === row.id;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
            <StatusBadge $status={row.status}>{row.status}</StatusBadge>
            {row.status === 'DRAFT' && (
              <>
                <ToggleBtn $variant="info" disabled={busy} onClick={() => handleStatusToggle(row, 'SCHEDULED')}>Schedule</ToggleBtn>
                <ToggleBtn $variant="success" disabled={busy} onClick={() => openSendConfirm(row)}>Send now</ToggleBtn>
              </>
            )}
            {row.status === 'SCHEDULED' && (
              <>
                <ToggleBtn $variant="warn" disabled={busy} onClick={() => handleStatusToggle(row, 'PAUSED')}>Pause</ToggleBtn>
                <ToggleBtn $variant="success" disabled={busy} onClick={() => openSendConfirm(row)}>Send now</ToggleBtn>
              </>
            )}
            {row.status === 'PAUSED' && (
              <>
                <ToggleBtn $variant="info" disabled={busy} onClick={() => handleStatusToggle(row, 'SCHEDULED')}>Resume</ToggleBtn>
                <ToggleBtn $variant="success" disabled={busy} onClick={() => openSendConfirm(row)}>Send now</ToggleBtn>
              </>
            )}
            {row.status === 'SENT' && (
              <ToggleBtn $variant="danger" disabled={busy} onClick={() => openResetConfirm(row)}>Reset to Draft</ToggleBtn>
            )}
          </span>
        );
      },
    },
    {
      key: 'audience',
      header: 'Audience',
      render: (row) => (
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
          {row.audience > 0 ? row.audience.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'scheduledAt',
      header: (
        <SortableHeader $active={sortBy === 'scheduledAt'} onClick={() => handleSort('scheduledAt')}>
          Scheduled{sortIcon('scheduledAt')}
        </SortableHeader>
      ) as unknown as string,
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.scheduledAt ? fmtDatetime(row.scheduledAt) : '—'}
        </span>
      ),
    },
    {
      key: 'sentAt',
      header: (
        <SortableHeader $active={sortBy === 'sentAt'} onClick={() => handleSort('sentAt')}>
          Sent{sortIcon('sentAt')}
        </SortableHeader>
      ) as unknown as string,
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.sentAt ? fmtDate(row.sentAt) : '—'}
        </span>
      ),
    },
    {
      key: 'openRate',
      header: 'Open / Click',
      render: (row) => (
        <span style={{ fontSize: '0.875rem', color: palette.text }}>
          {row.openRate != null ? (
            <>
              <span style={{ fontWeight: 600 }}>{row.openRate}%</span>
              <span style={{ color: palette.textSubtle }}> / {row.clickRate}%</span>
            </>
          ) : '—'}
        </span>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Marketing</Eyebrow>
          <PageTitle>
            Campaigns
            {total > 0 && <TotalBadge>{total}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Email, push, and SMS campaigns to subscribers and partners</PageSubtitle>
        </TitleBlock>
        <PrimaryBtn onClick={openCreate}>+ New Campaign</PrimaryBtn>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search campaigns…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as CampaignStatus | ''); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="SENT">Sent</option>
            <option value="PAUSED">Paused</option>
          </Select>
          <Select value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value as MarketingChannel | ''); setPage(1); }}>
            <option value="">All channels</option>
            <option value="EMAIL">Email</option>
            <option value="PUSH">Push</option>
            <option value="SMS">SMS</option>
          </Select>
          <FilterLabel>Scheduled from</FilterLabel>
          <DateInput
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
          <FilterLabel>to</FilterLabel>
          <DateInput
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
          {(dateFrom || dateTo) && (
            <GhostBtn style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}>
              Clear dates
            </GhostBtn>
          )}
        </FilterRow>

        <DataTable
          columns={columns}
          data={items}
          rowKey={(row) => row.id}
          loading={loading}
          emptyMessage="No campaigns found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={total}
          onPageChange={setPage}
          rowActions={[
            { label: 'View', onClick: openView },
            { label: 'Edit', onClick: openEdit },
            { label: 'Delete', onClick: openDelete },
          ]}
        />
      </Card>

      {/* ── Create / Edit modal ─────────────────────────────────────────── */}
      {(modal === 'create' || modal === 'edit') && (
        <Overlay onClick={closeModal}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{modal === 'create' ? 'New Campaign' : 'Edit Campaign'}</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {noTemplateWarning && (
                <WarnBanner>No template selected — a scheduled campaign needs a template to define its content.</WarnBanner>
              )}
              <FormGroup>
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Spring 2026 Newsletter"
                  autoFocus
                />
              </FormGroup>
              <FormGroup>
                <Label>Channel *</Label>
                <ModalSelect
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as MarketingChannel }))}
                >
                  <option value="EMAIL">Email</option>
                  <option value="PUSH">Push notification</option>
                  <option value="SMS">SMS</option>
                </ModalSelect>
              </FormGroup>
              <FormGroup>
                <Label>Status</Label>
                <ModalSelect
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as FormState['status'] }))}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="SCHEDULED">Scheduled</option>
                  {modal === 'edit' && <option value="PAUSED">Paused</option>}
                </ModalSelect>
              </FormGroup>
              {form.status === 'SCHEDULED' && (
                <FormGroup>
                  <Label>Scheduled send date</Label>
                  <Input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                  />
                  <HintText>When this campaign should be dispatched.</HintText>
                </FormGroup>
              )}
              <FormGroup>
                <Label>Audience list</Label>
                <ModalSelect
                  value={form.listId}
                  onChange={(e) => setForm((f) => ({ ...f, listId: e.target.value }))}
                >
                  <option value="">— None —</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
                  ))}
                </ModalSelect>
                {computedAudience !== null && (
                  <HintText>Audience size: {computedAudience.toLocaleString()} contacts (from selected list)</HintText>
                )}
              </FormGroup>
              <FormGroup>
                <Label>Template</Label>
                <ModalSelect
                  value={form.templateId}
                  onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
                >
                  <option value="">— None —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                  ))}
                </ModalSelect>
                <HintText>The template defines subject and message body for this campaign.</HintText>
              </FormGroup>
              {form.type === 'SMS' && (
                <WarnBanner>SMS delivery is not yet enabled. This campaign can be saved but will not dispatch messages when sent.</WarnBanner>
              )}
              {modal === 'edit' && selected?.status === 'SENT' && (
                <InfoBox>This campaign has already been sent. Editing will save metadata only — the sent messages are not affected.</InfoBox>
              )}
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Cancel</GhostBtn>
              <PrimaryBtn onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : modal === 'create' ? 'Create campaign' : 'Save changes'}
              </PrimaryBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Delete confirm ──────────────────────────────────────────────── */}
      {modal === 'delete' && selected && (
        <Overlay onClick={closeModal}>
          <ModalBox style={{ maxWidth: '26rem' }} onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Delete campaign?</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <ConfirmText>You are about to delete <strong>{selected.name}</strong>.</ConfirmText>
              <ConfirmSub>This action cannot be undone.</ConfirmSub>
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Cancel</GhostBtn>
              <DangerBtn onClick={handleDelete} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete campaign'}
              </DangerBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Campaign detail view ─────────────────────────────────────────── */}
      {modal === 'view' && selected && (
        <Overlay onClick={closeModal}>
          <ModalBox style={{ maxWidth: '38rem' }} onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>{selected.name}</ModalTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                  <span style={{ color: TYPE_COLOR[selected.type], fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{selected.type}</span>
                  <StatusBadge $status={selected.status}>{selected.status}</StatusBadge>
                </div>
              </div>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: palette.textSubtle }}>Loading…</div>
              ) : detailData ? (
                <>
                  <DetailGrid style={{ marginBottom: '1.5rem' }}>
                    <DetailItem>
                      <DetailLabel>Audience</DetailLabel>
                      <DetailValue>{detailData.audience > 0 ? detailData.audience.toLocaleString() + ' contacts' : '—'}</DetailValue>
                    </DetailItem>
                    <DetailItem>
                      <DetailLabel>Audience List</DetailLabel>
                      <DetailValue>{detailData.list ? detailData.list.name : '—'}</DetailValue>
                    </DetailItem>
                    <DetailItem>
                      <DetailLabel>Template</DetailLabel>
                      <DetailValue>{detailData.template ? detailData.template.name : '—'}</DetailValue>
                    </DetailItem>
                    <DetailItem>
                      <DetailLabel>Created</DetailLabel>
                      <DetailValue>{fmtDate(detailData.createdAt)}</DetailValue>
                    </DetailItem>
                    {detailData.scheduledAt && (
                      <DetailItem>
                        <DetailLabel>Scheduled for</DetailLabel>
                        <DetailValue>{fmtDatetime(detailData.scheduledAt)}</DetailValue>
                      </DetailItem>
                    )}
                    {detailData.sentAt && (
                      <DetailItem>
                        <DetailLabel>Sent at</DetailLabel>
                        <DetailValue>{fmtDatetime(detailData.sentAt)}</DetailValue>
                      </DetailItem>
                    )}
                  </DetailGrid>
                  {(detailData.openRate != null || detailData.clickRate != null) && (
                    <>
                      <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: '1rem', marginBottom: '1rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: palette.textSubtle }}>Analytics</div>
                      <DetailGrid>
                        <DetailItem>
                          <DetailLabel>Open rate</DetailLabel>
                          <DetailValue style={{ fontSize: '1.25rem', fontWeight: 700 }}>{detailData.openRate != null ? `${detailData.openRate}%` : '—'}</DetailValue>
                        </DetailItem>
                        <DetailItem>
                          <DetailLabel>Click rate</DetailLabel>
                          <DetailValue style={{ fontSize: '1.25rem', fontWeight: 700 }}>{detailData.clickRate != null ? `${detailData.clickRate}%` : '—'}</DetailValue>
                        </DetailItem>
                      </DetailGrid>
                    </>
                  )}
                </>
              ) : null}
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal}>Close</GhostBtn>
              <PrimaryBtn onClick={() => { closeModal(); if (selected) setTimeout(() => openEdit(selected), 50); }}>Edit campaign</PrimaryBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Send now confirm ─────────────────────────────────────────────── */}
      {confirmMode === 'send-now' && confirmTarget && (
        <Overlay onClick={() => { setConfirmMode(null); setConfirmTarget(null); }}>
          <ModalBox style={{ maxWidth: '28rem' }} onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Send campaign now?</ModalTitle>
              <CloseBtn onClick={() => { setConfirmMode(null); setConfirmTarget(null); }}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {sendNowWarnings.map((w) => (
                <WarnBanner key={w}>{w}</WarnBanner>
              ))}
              {confirmError && <ErrorBanner>{confirmError}</ErrorBanner>}
              <ConfirmText>
                You are about to send <strong>{confirmTarget.name}</strong>
                {confirmTarget.audience > 0 ? ` to ${confirmTarget.audience.toLocaleString()} recipients` : ''}.
              </ConfirmText>
              <ConfirmSub>
                This will dispatch messages to all list members and record the send timestamp.
                {sendNowWarnings.length > 0 ? ' Fix the warnings above before sending for best results.' : ''}
              </ConfirmSub>
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={() => { setConfirmMode(null); setConfirmTarget(null); }} disabled={saving}>Cancel</GhostBtn>
              <PrimaryBtn onClick={handleConfirmAction} disabled={saving}>
                {saving ? 'Sending…' : 'Send now'}
              </PrimaryBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Reset to Draft confirm ───────────────────────────────────────── */}
      {confirmMode === 'reset-draft' && confirmTarget && (
        <Overlay onClick={() => { setConfirmMode(null); setConfirmTarget(null); }}>
          <ModalBox style={{ maxWidth: '28rem' }} onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Reset to Draft?</ModalTitle>
              <CloseBtn onClick={() => { setConfirmMode(null); setConfirmTarget(null); }}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <ConfirmText><strong>{confirmTarget.name}</strong> has already been sent.</ConfirmText>
              <ConfirmSub>Resetting to Draft will clear the sent timestamp and allow re-editing. The messages already delivered to recipients are not affected.</ConfirmSub>
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={() => { setConfirmMode(null); setConfirmTarget(null); }} disabled={saving}>Cancel</GhostBtn>
              <DangerBtn onClick={handleConfirmAction} disabled={saving}>
                {saving ? 'Resetting…' : 'Reset to Draft'}
              </DangerBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}
    </PageShell>
  );
}
