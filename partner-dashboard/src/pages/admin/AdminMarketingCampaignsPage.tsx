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
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

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

const PrimaryBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.accent}; color: #fff; border: none; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { opacity: 0.9; }`;
const GhostBtn = styled.button`padding: 0.5rem 1.125rem; background: transparent; color: ${palette.textMuted}; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { border-color: ${palette.textMuted}; }`;
const DangerBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.dangerSoft}; color: ${palette.danger}; border: 1px solid #f1c4b8; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { background: #eebcac; }`;
const ToggleBtn = styled.button<{ $variant: 'info' | 'warn' | 'success' }>`
  margin-left: 0.4rem; padding: 0.1rem 0.45rem; border-radius: 0.25rem; font-size: 0.65rem;
  font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; cursor: pointer; border: 1px solid;
  ${({ $variant }) => {
    if ($variant === 'info')    return `background: ${palette.infoSoft}; color: ${palette.info}; border-color: #93c5fd;`;
    if ($variant === 'warn')    return `background: ${palette.warningSoft}; color: ${palette.warning}; border-color: #fbbf24;`;
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

type ModalMode = 'create' | 'edit' | 'delete' | null;

interface FormState {
  name: string;
  type: MarketingChannel;
  status: CampaignStatus;
  audience: string;
  templateId: string;
  listId: string;
}

const DEFAULT_FORM: FormState = { name: '', type: 'EMAIL', status: 'DRAFT', audience: '0', templateId: '', listId: '' };
const PAGE_SIZE = 25;

export default function AdminMarketingCampaignsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MarketingCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [lists, setLists] = useState<MarketingList[]>([]);

  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<MarketingCampaign | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleStatusToggle = async (row: MarketingCampaign, next: CampaignStatus) => {
    setTogglingId(row.id);
    try {
      await adminMarketingService.patchCampaignStatus(row.id, next);
      load();
    } finally {
      setTogglingId(null);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    adminMarketingService
      .listCampaigns({ page, limit: PAGE_SIZE, search, status: statusFilter })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .finally(() => setLoading(false));
  }, [page, search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminMarketingService.listTemplates({ limit: 100 }).then((r) => setTemplates(r.items));
    adminMarketingService.listLists({ limit: 100 }).then((r) => setLists(r.items));
  }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const openCreate = () => {
    setSelected(null);
    setForm(DEFAULT_FORM);
    setModal('create');
  };

  const openEdit = (row: MarketingCampaign) => {
    setSelected(row);
    setForm({
      name: row.name,
      type: row.type,
      status: row.status,
      audience: String(row.audience),
      templateId: row.templateId ?? '',
      listId: row.listId ?? '',
    });
    setModal('edit');
  };

  const openDelete = (row: MarketingCampaign) => {
    setSelected(row);
    setModal('delete');
  };

  const closeModal = () => { setModal(null); setSelected(null); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        status: form.status,
        audience: parseInt(form.audience) || 0,
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

  const columns: ColumnDef<MarketingCampaign>[] = [
    {
      key: 'name',
      header: 'Campaign',
      render: (row) => (
        <span>
          <PrimaryLine>{row.name}</PrimaryLine>
          <MetaLine>
            <span style={{ color: TYPE_COLOR[row.type], fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.type}</span>
            <span style={{ marginLeft: '0.5rem', color: palette.textSubtle }}>Created {fmt(row.createdAt)}</span>
          </MetaLine>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const busy = togglingId === row.id;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
            <StatusBadge $status={row.status}>{row.status}</StatusBadge>
            {row.status === 'DRAFT' && (
              <ToggleBtn $variant="info" disabled={busy} onClick={() => handleStatusToggle(row, 'SCHEDULED')}>
                Schedule
              </ToggleBtn>
            )}
            {row.status === 'SCHEDULED' && (
              <ToggleBtn $variant="warn" disabled={busy} onClick={() => handleStatusToggle(row, 'PAUSED')}>
                Pause
              </ToggleBtn>
            )}
            {row.status === 'PAUSED' && (
              <ToggleBtn $variant="success" disabled={busy} onClick={() => handleStatusToggle(row, 'SCHEDULED')}>
                Resume
              </ToggleBtn>
            )}
            {row.status === 'SENT' && (
              <ToggleBtn $variant="warn" disabled={busy} onClick={() => handleStatusToggle(row, 'DRAFT')}>
                Reset to Draft
              </ToggleBtn>
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
      key: 'sentAt',
      header: 'Sent',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.sentAt ? fmt(row.sentAt) : '—'}
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

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Marketing</Eyebrow>
          <PageTitle>
            Campaigns
            {total > 0 && <TotalBadge>{total}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Email, push, and SMS campaigns sent to subscribers</PageSubtitle>
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
            { label: 'Edit', onClick: openEdit },
            { label: 'Delete', onClick: openDelete },
          ]}
        />
      </Card>

      {(modal === 'create' || modal === 'edit') && (
        <Overlay onClick={closeModal}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{modal === 'create' ? 'New Campaign' : 'Edit Campaign'}</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
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
                <Label>Status *</Label>
                <ModalSelect
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CampaignStatus }))}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="SENT">Sent</option>
                  <option value="PAUSED">Paused</option>
                </ModalSelect>
              </FormGroup>
              <FormGroup>
                <Label>Audience size</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.audience}
                  onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
                  placeholder="0"
                />
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
              </FormGroup>
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
              </FormGroup>
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
    </PageShell>
  );
}
