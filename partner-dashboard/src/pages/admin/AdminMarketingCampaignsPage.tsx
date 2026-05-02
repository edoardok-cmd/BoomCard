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

const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT:     'Чернова',
  SCHEDULED: 'Планирана',
  SENT:      'Изпратена',
  PAUSED:    'Спряна',
};

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
  return new Date(iso).toLocaleDateString('bg-BG', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('bg-BG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

  const [toggleError, setToggleError] = useState('');

  const handleStatusToggle = async (row: MarketingCampaign, next: CampaignStatus) => {
    // BUG 2: client-side guard mirrors the new server-side rule —
    // SCHEDULED status cannot be entered without a future scheduledAt.
    // Without this the inline "Планирай" button now hits a 400 instead of silently failing.
    if (next === 'SCHEDULED' && !row.scheduledAt) {
      setToggleError(`Кампания "${row.name}" няма дата за планиране. Редактирайте я и задайте време за изпращане.`);
      return;
    }
    setToggleError('');
    setTogglingId(row.id);
    try {
      await adminMarketingService.patchCampaignStatus(row.id, next);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setToggleError(e?.response?.data?.error ?? e?.message ?? 'Грешка при смяна на статус');
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
      const msg = (err as { message?: string })?.message ?? 'Грешка. Опитайте отново.';
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

  const closeModal = () => { setModal(null); setSelected(null); setDetailData(null); setSaveError(''); };

  const [saveError, setSaveError] = useState('');

  const handleSave = async () => {
    if (!form.name.trim()) return;
    // Mirror the server-side guard: SCHEDULED status without a date is rejected
    // by the backend now (BUG 2 fix), but block the round-trip on the client too
    // for an instant validation message.
    if (form.status === 'SCHEDULED' && !form.scheduledAt) {
      setSaveError('Изберете дата и час за изпращане на планираната кампания.');
      return;
    }
    setSaveError('');
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
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setSaveError(e?.response?.data?.error ?? e?.message ?? 'Неуспешно запазване. Опитайте отново.');
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
    if (!confirmTarget.templateId) sendNowWarnings.push('Без шаблон — кампанията няма съдържание за изпращане.');
    if (!confirmTarget.listId)     sendNowWarnings.push('Без списък с аудитория — кампанията няма получатели.');
    else if (confirmTarget.audience === 0) sendNowWarnings.push('Списъкът с аудитория изглежда е празен (0 членове).');
    if (confirmTarget.type === 'SMS') sendNowWarnings.push('SMS доставката не е активирана — маркирането като изпратена няма да изпрати съобщения.');
  }

  // ── Columns ───────────────────────────────────────────────────────────────

  const columns: ColumnDef<MarketingCampaign>[] = [
    {
      key: 'name',
      header: (
        <SortableHeader $active={sortBy === 'name'} onClick={() => handleSort('name')}>
          Кампания{sortIcon('name')}
        </SortableHeader>
      ) as unknown as string,
      render: (row) => (
        <span>
          <PrimaryLine>{row.name}</PrimaryLine>
          <MetaLine>
            <span style={{ color: TYPE_COLOR[row.type], fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.type}</span>
            <span style={{ marginLeft: '0.5rem', color: palette.textSubtle }}>Създадена {fmtDate(row.createdAt)}</span>
          </MetaLine>
        </span>
      ),
    },
    {
      key: 'status',
      header: (
        <SortableHeader $active={sortBy === 'status'} onClick={() => handleSort('status')}>
          Статус{sortIcon('status')}
        </SortableHeader>
      ) as unknown as string,
      render: (row) => {
        const busy = togglingId === row.id;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
            <StatusBadge $status={row.status}>{CAMPAIGN_STATUS_LABELS[row.status]}</StatusBadge>
            {row.status === 'DRAFT' && (
              <>
                <ToggleBtn $variant="info" disabled={busy} onClick={() => handleStatusToggle(row, 'SCHEDULED')}>Планирай</ToggleBtn>
                <ToggleBtn $variant="success" disabled={busy} onClick={() => openSendConfirm(row)}>Изпрати сега</ToggleBtn>
              </>
            )}
            {row.status === 'SCHEDULED' && (
              <>
                <ToggleBtn $variant="warn" disabled={busy} onClick={() => handleStatusToggle(row, 'PAUSED')}>Спри</ToggleBtn>
                <ToggleBtn $variant="success" disabled={busy} onClick={() => openSendConfirm(row)}>Изпрати сега</ToggleBtn>
              </>
            )}
            {row.status === 'PAUSED' && (
              <>
                <ToggleBtn $variant="info" disabled={busy} onClick={() => handleStatusToggle(row, 'SCHEDULED')}>Продължи</ToggleBtn>
                <ToggleBtn $variant="success" disabled={busy} onClick={() => openSendConfirm(row)}>Изпрати сега</ToggleBtn>
              </>
            )}
            {row.status === 'SENT' && (
              <ToggleBtn $variant="danger" disabled={busy} onClick={() => openResetConfirm(row)}>Върни в чернова</ToggleBtn>
            )}
          </span>
        );
      },
    },
    {
      key: 'audience',
      header: 'Аудитория',
      render: (row) => {
        // BUG 3: distinguish three states explicitly so the operator can tell
        // an empty list (0) from a campaign without a list at all (—).
        if (!row.list) {
          return <span style={{ fontSize: '0.8125rem', color: palette.textSubtle, fontStyle: 'italic' }}>без списък</span>;
        }
        return (
          <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: row.audience === 0 ? palette.warning : palette.text }}
                title={`Списък: ${row.list.name}`}>
            {row.audience.toLocaleString('bg-BG')}
          </span>
        );
      },
    },
    {
      key: 'scheduledAt',
      header: (
        <SortableHeader $active={sortBy === 'scheduledAt'} onClick={() => handleSort('scheduledAt')}>
          Планирана{sortIcon('scheduledAt')}
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
          Изпратена{sortIcon('sentAt')}
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
      header: 'Отваряния / Кликове',
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
          <Eyebrow>Маркетинг</Eyebrow>
          <PageTitle>
            Кампании
            {total > 0 && <TotalBadge>{total}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Email, push и SMS кампании до абонати и партньори</PageSubtitle>
        </TitleBlock>
        <PrimaryBtn onClick={openCreate}>+ Нова кампания</PrimaryBtn>
      </PageHeader>

      {toggleError && (
        <ErrorBanner style={{ marginBottom: '1rem' }}>
          {toggleError}
          <button
            type="button"
            onClick={() => setToggleError('')}
            style={{ marginLeft: '0.5rem', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
          >
            Затвори
          </button>
        </ErrorBanner>
      )}

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Търси кампании…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as CampaignStatus | ''); setPage(1); }}>
            <option value="">Всички статуси</option>
            <option value="DRAFT">Чернова</option>
            <option value="SCHEDULED">Планирана</option>
            <option value="SENT">Изпратена</option>
            <option value="PAUSED">Спряна</option>
          </Select>
          <Select value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value as MarketingChannel | ''); setPage(1); }}>
            <option value="">Всички канали</option>
            <option value="EMAIL">Email</option>
            <option value="PUSH">Push</option>
            <option value="SMS">SMS</option>
          </Select>
          <FilterLabel>Планирана от</FilterLabel>
          <DateInput
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
          <FilterLabel>до</FilterLabel>
          <DateInput
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
          {(dateFrom || dateTo) && (
            <GhostBtn style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}>
              Изчисти датите
            </GhostBtn>
          )}
        </FilterRow>

        <DataTable
          columns={columns}
          data={items}
          rowKey={(row) => row.id}
          loading={loading}
          emptyMessage="Няма намерени кампании"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={total}
          onPageChange={setPage}
          rowActions={[
            { label: 'Детайли', onClick: openView },
            { label: 'Редактирай', onClick: openEdit },
            { label: 'Изтрий', onClick: openDelete },
          ]}
        />
      </Card>

      {/* ── Create / Edit modal ─────────────────────────────────────────── */}
      {(modal === 'create' || modal === 'edit') && (
        <Overlay onClick={closeModal}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{modal === 'create' ? 'Нова кампания' : 'Редактирай кампания'}</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {saveError && <ErrorBanner>{saveError}</ErrorBanner>}
              {noTemplateWarning && (
                <WarnBanner>Без шаблон — планираната кампания се нуждае от шаблон за съдържание.</WarnBanner>
              )}
              <FormGroup>
                <Label>Наименование *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="напр. Пролет 2026 — бюлетин"
                  autoFocus
                />
              </FormGroup>
              <FormGroup>
                <Label>Канал *</Label>
                <ModalSelect
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as MarketingChannel }))}
                >
                  <option value="EMAIL">Email</option>
                  <option value="PUSH">Push известие</option>
                  <option value="SMS">SMS</option>
                </ModalSelect>
              </FormGroup>
              <FormGroup>
                <Label>Статус</Label>
                <ModalSelect
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as FormState['status'] }))}
                >
                  <option value="DRAFT">Чернова</option>
                  <option value="SCHEDULED">Планирана</option>
                  {modal === 'edit' && <option value="PAUSED">Спряна</option>}
                </ModalSelect>
              </FormGroup>
              {form.status === 'SCHEDULED' && (
                <FormGroup>
                  <Label>Дата и час за изпращане</Label>
                  <Input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                  />
                  <HintText>Кога ще бъде изпратена кампанията.</HintText>
                </FormGroup>
              )}
              <FormGroup>
                <Label>Списък с аудитория</Label>
                <ModalSelect
                  value={form.listId}
                  onChange={(e) => setForm((f) => ({ ...f, listId: e.target.value }))}
                >
                  <option value="">— Без —</option>
                  <optgroup label="Към абонати">
                    {lists.filter((l) => l.audienceKind === 'SUBSCRIBERS').map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.size})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Към партньори">
                    {lists.filter((l) => l.audienceKind === 'PARTNERS').map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.size})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Смесена аудитория">
                    {lists.filter((l) => l.audienceKind === 'MIXED' || (!l.audienceKind && l.size > 0)).map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.type}, {l.size})</option>
                    ))}
                  </optgroup>
                  {/* Truly empty lists (audienceKind === 'EMPTY' or size 0) are
                      omitted — selecting one would target zero recipients. */}
                  <optgroup label="Празни (без получатели)">
                    {lists.filter((l) => l.audienceKind === 'EMPTY' && l.size === 0).map((l) => (
                      <option key={l.id} value={l.id} disabled>{l.name} ({l.type})</option>
                    ))}
                  </optgroup>
                </ModalSelect>
                {computedAudience !== null && selectedList && (
                  <HintText>
                    {selectedList.audienceKind === 'SUBSCRIBERS' && 'Аудитория: '}
                    {selectedList.audienceKind === 'PARTNERS' && 'Аудитория към партньори: '}
                    {selectedList.audienceKind === 'MIXED' && 'Смесена аудитория: '}
                    {computedAudience.toLocaleString('bg-BG')} контакта (от избрания списък)
                  </HintText>
                )}
              </FormGroup>
              <FormGroup>
                <Label>Шаблон</Label>
                <ModalSelect
                  value={form.templateId}
                  onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
                >
                  <option value="">— Без —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                  ))}
                </ModalSelect>
                <HintText>Шаблонът определя темата и съдържанието на съобщението.</HintText>
              </FormGroup>
              {form.type === 'SMS' && (
                <WarnBanner>SMS доставката не е активирана. Кампанията може да бъде записана, но няма да изпрати съобщения.</WarnBanner>
              )}
              {modal === 'edit' && selected?.status === 'SENT' && (
                <InfoBox>Тази кампания вече е изпратена. Редакцията записва само метаданни — изпратените съобщения не се засягат.</InfoBox>
              )}
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Отказ</GhostBtn>
              <PrimaryBtn onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Запазване…' : modal === 'create' ? 'Създай кампания' : 'Запази промените'}
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
              <ModalTitle>Изтриване на кампания?</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <ConfirmText>Предстои изтриване на <strong>{selected.name}</strong>.</ConfirmText>
              <ConfirmSub>Действието е необратимо.</ConfirmSub>
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Отказ</GhostBtn>
              <DangerBtn onClick={handleDelete} disabled={saving}>
                {saving ? 'Изтриване…' : 'Изтрий кампанията'}
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
                  <StatusBadge $status={selected.status}>{CAMPAIGN_STATUS_LABELS[selected.status]}</StatusBadge>
                </div>
              </div>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: palette.textSubtle }}>Зареждане…</div>
              ) : detailData ? (
                <>
                  {/* BUG 3: distinguish between "no list assigned" and "list with 0 members".
                      Old UI showed "—" in both cases which made an empty list look like "no list set". */}
                  {detailData.list && detailData.audience === 0 && (
                    <WarnBanner>
                      Списъкът <strong>{detailData.list.name}</strong> е празен. Кампанията няма да достигне до никого, докато сегментът не се обнови.
                    </WarnBanner>
                  )}
                  {!detailData.list && detailData.status !== 'DRAFT' && (
                    <WarnBanner>
                      На кампанията не е зададен списък с аудитория. Изпращането ще бъде блокирано, докато не зададете списък.
                    </WarnBanner>
                  )}
                  <DetailGrid style={{ marginBottom: '1.5rem' }}>
                    <DetailItem>
                      <DetailLabel>Аудитория</DetailLabel>
                      <DetailValue>
                        {detailData.list
                          ? `${detailData.audience.toLocaleString('bg-BG')} контакта`
                          : <span style={{ color: palette.textSubtle, fontWeight: 400 }}>не е зададен списък</span>}
                      </DetailValue>
                    </DetailItem>
                    <DetailItem>
                      <DetailLabel>Списък</DetailLabel>
                      <DetailValue>{detailData.list ? detailData.list.name : '—'}</DetailValue>
                    </DetailItem>
                    <DetailItem>
                      <DetailLabel>Шаблон</DetailLabel>
                      <DetailValue>{detailData.template ? detailData.template.name : <span style={{ color: palette.textSubtle, fontWeight: 400 }}>—</span>}</DetailValue>
                    </DetailItem>
                    <DetailItem>
                      <DetailLabel>Създадена</DetailLabel>
                      <DetailValue>{fmtDate(detailData.createdAt)}</DetailValue>
                    </DetailItem>
                    {/* GAP 2: SCHEDULED campaigns must show their planned send time.
                        For DRAFT this field is irrelevant; for SENT we already show sentAt. */}
                    {detailData.status === 'SCHEDULED' && (
                      <DetailItem>
                        <DetailLabel>Планирана за</DetailLabel>
                        <DetailValue>{detailData.scheduledAt ? fmtDatetime(detailData.scheduledAt) : <span style={{ color: palette.danger, fontWeight: 400 }}>не е зададена</span>}</DetailValue>
                      </DetailItem>
                    )}
                    {detailData.status === 'PAUSED' && detailData.scheduledAt && (
                      <DetailItem>
                        <DetailLabel>Планирана за</DetailLabel>
                        <DetailValue>{fmtDatetime(detailData.scheduledAt)}</DetailValue>
                      </DetailItem>
                    )}
                    {detailData.sentAt && (
                      <DetailItem>
                        <DetailLabel>Изпратена в</DetailLabel>
                        <DetailValue>{fmtDatetime(detailData.sentAt)}</DetailValue>
                      </DetailItem>
                    )}
                  </DetailGrid>
                  {(detailData.openRate != null || detailData.clickRate != null) && (
                    <>
                      <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: '1rem', marginBottom: '1rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: palette.textSubtle }}>Анализ</div>
                      <DetailGrid>
                        <DetailItem>
                          <DetailLabel>Отваряния</DetailLabel>
                          <DetailValue style={{ fontSize: '1.25rem', fontWeight: 700 }}>{detailData.openRate != null ? `${detailData.openRate}%` : '—'}</DetailValue>
                        </DetailItem>
                        <DetailItem>
                          <DetailLabel>Кликове</DetailLabel>
                          <DetailValue style={{ fontSize: '1.25rem', fontWeight: 700 }}>{detailData.clickRate != null ? `${detailData.clickRate}%` : '—'}</DetailValue>
                        </DetailItem>
                      </DetailGrid>
                    </>
                  )}
                </>
              ) : null}
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal}>Затвори</GhostBtn>
              <PrimaryBtn onClick={() => { closeModal(); if (selected) setTimeout(() => openEdit(selected), 50); }}>Редактирай кампанията</PrimaryBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Send now confirm ─────────────────────────────────────────────── */}
      {confirmMode === 'send-now' && confirmTarget && (
        <Overlay onClick={() => { setConfirmMode(null); setConfirmTarget(null); }}>
          <ModalBox style={{ maxWidth: '28rem' }} onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Изпрати кампания сега?</ModalTitle>
              <CloseBtn onClick={() => { setConfirmMode(null); setConfirmTarget(null); }}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {sendNowWarnings.map((w) => (
                <WarnBanner key={w}>{w}</WarnBanner>
              ))}
              {confirmError && <ErrorBanner>{confirmError}</ErrorBanner>}
              <ConfirmText>
                Предстои изпращане на <strong>{confirmTarget.name}</strong>
                {confirmTarget.audience > 0 ? ` до ${confirmTarget.audience.toLocaleString('bg-BG')} получателя` : ''}.
              </ConfirmText>
              <ConfirmSub>
                Ще се изпратят съобщения до всички членове на списъка и ще се запише времеви печат.
                {sendNowWarnings.length > 0 ? ' Коригирайте предупрежденията по-горе преди изпращане за по-добри резултати.' : ''}
              </ConfirmSub>
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={() => { setConfirmMode(null); setConfirmTarget(null); }} disabled={saving}>Отказ</GhostBtn>
              <PrimaryBtn onClick={handleConfirmAction} disabled={saving}>
                {saving ? 'Изпращане…' : 'Изпрати сега'}
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
              <ModalTitle>Върни в чернова?</ModalTitle>
              <CloseBtn onClick={() => { setConfirmMode(null); setConfirmTarget(null); }}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <ConfirmText><strong>{confirmTarget.name}</strong> вече е изпратена.</ConfirmText>
              <ConfirmSub>Връщането в чернова ще изчисти времето на изпращане и ще позволи повторно редактиране. Вече доставените съобщения не се засягат.</ConfirmSub>
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={() => { setConfirmMode(null); setConfirmTarget(null); }} disabled={saving}>Отказ</GhostBtn>
              <DangerBtn onClick={handleConfirmAction} disabled={saving}>
                {saving ? 'Нулиране…' : 'Върни в чернова'}
              </DangerBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}
    </PageShell>
  );
}
