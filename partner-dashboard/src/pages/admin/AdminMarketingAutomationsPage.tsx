import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminMarketingService,
  MarketingAutomation,
  AutomationStatus,
  MarketingTemplate,
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
const Select = styled.select`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer; &:focus { border-color: ${palette.accent}; }`;
const SearchInput = styled.input`padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; min-width: 14rem; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }`;
const PrimaryLine = styled.div`font-weight: 600; color: ${palette.text};`;
const MetaLine = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.125rem;`;

const STATUS_LABELS: Record<AutomationStatus, string> = {
  ACTIVE: 'Активна',
  PAUSED: 'Спряна',
  DRAFT:  'Чернова',
};

const StatusBadge = styled.span<{ $status: AutomationStatus }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  ${({ $status }) => {
    switch ($status) {
      case 'ACTIVE': return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'PAUSED': return `background: ${palette.warningSoft}; color: ${palette.warning};`;
      default:       return `background: ${palette.border}; color: ${palette.textMuted};`;
    }
  }}
`;

const WarnBanner = styled.div`
  background: ${palette.warningSoft}; color: ${palette.warning};
  border: 1px solid #e8c97a; border-radius: 0.5rem;
  padding: 0.625rem 0.875rem; font-size: 0.8125rem; margin-top: 0.5rem;
`;

const PrimaryBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.accent}; color: #fff; border: none; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { opacity: 0.9; } &:disabled { opacity: 0.5; cursor: not-allowed; }`;
const GhostBtn = styled.button`padding: 0.5rem 1.125rem; background: transparent; color: ${palette.textMuted}; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { border-color: ${palette.textMuted}; }`;
const DangerBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.dangerSoft}; color: ${palette.danger}; border: 1px solid #f1c4b8; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { background: #eebcac; }`;

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
const HintText = styled.p`font-size: 0.75rem; color: ${palette.textSubtle}; margin: 0;`;
const ConfirmText = styled.p`font-size: 0.9375rem; color: ${palette.text}; margin: 0 0 0.5rem;`;
const ConfirmSub = styled.p`font-size: 0.8125rem; color: ${palette.textSubtle}; margin: 0;`;

// Spec §8 required triggers first, then common extras
const TRIGGER_SUGGESTIONS = [
  // Spec §8 required: достигнат праг, изтичащ кешбек, нов партньор, одобрен партньор
  'cashback.threshold_reached',
  'cashback.expiring',
  'partner.created',
  'partner.approved',
  // Additional useful triggers
  'user.signup',
  'user.inactive_30d',
  'user.inactive_90d',
  'card.issued',
  'card.first_use',
  'cashback.earned',
  'subscription.created',
  'subscription.renewed',
  'subscription.renew_due',
  'subscription.expired',
  'billing.month_end',
  'payment.succeeded',
  'payment.failed',
];

type ModalMode = 'create' | 'edit' | 'delete' | null;

interface FormState {
  name: string;
  trigger: string;
  status: AutomationStatus;
  templateId: string;
}

const DEFAULT_FORM: FormState = { name: '', trigger: '', status: 'DRAFT', templateId: '' };
const PAGE_SIZE = 25;

export default function AdminMarketingAutomationsPage() {
  const [statusFilter, setStatusFilter] = useState<AutomationStatus | ''>('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MarketingAutomation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<MarketingAutomation | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminMarketingService
      .listAutomations({
        page, limit: PAGE_SIZE, status: statusFilter,
        search: search || undefined,
        trigger: triggerFilter || undefined,
      })
      .then((r) => { setItems(r.items); setTotal(r.total); setApiError(null); })
      .catch((err: any) => setApiError(err?.response?.data?.error ?? err?.message ?? 'Грешка при зареждане'))
      .finally(() => setLoading(false));
  }, [page, statusFilter, search, triggerFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminMarketingService.listTemplates({ limit: 100 }).then((r) => setTemplates(r.items));
  }, []);

  // On mount: ensure spec §8 defaults exist and reload so they appear immediately
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    adminMarketingService.ensureDefaultAutomations().catch(() => {}).finally(() => load());
  }, []);

  // Escape key closes any open modal
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('bg-BG', { day: '2-digit', month: 'short', year: 'numeric' });

  const openCreate = () => {
    setSelected(null);
    setForm(DEFAULT_FORM);
    setApiError(null);
    setModal('create');
  };

  const openEdit = (row: MarketingAutomation) => {
    setSelected(row);
    setForm({
      name: row.name,
      trigger: row.trigger,
      status: row.status,
      templateId: row.templateId ?? '',
    });
    setApiError(null);
    setModal('edit');
  };

  const openDelete = (row: MarketingAutomation) => {
    setSelected(row);
    setApiError(null);
    setModal('delete');
  };

  const closeModal = () => { setModal(null); setSelected(null); setApiError(null); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.trigger.trim()) return;
    setSaving(true);
    setApiError(null);
    try {
      const payload = {
        name: form.name,
        trigger: form.trigger,
        status: form.status,
        templateId: form.templateId || undefined,
      };
      if (modal === 'create') {
        await adminMarketingService.createAutomation(payload);
      } else if (modal === 'edit' && selected) {
        await adminMarketingService.updateAutomation(selected.id, payload);
      }
      closeModal();
      load();
    } catch (err: any) {
      setApiError(err?.response?.data?.error ?? err?.message ?? 'Грешка при запис');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    setApiError(null);
    try {
      await adminMarketingService.deleteAutomation(selected.id);
      closeModal();
      load();
    } catch (err: any) {
      setApiError(err?.response?.data?.error ?? err?.message ?? 'Грешка при изтриване');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: MarketingAutomation) => {
    if (togglingId === row.id) return;
    const next: AutomationStatus = row.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setTogglingId(row.id);
    setApiError(null);
    try {
      await adminMarketingService.patchAutomationStatus(row.id, next);
      load();
    } catch (err: any) {
      setApiError(err?.response?.data?.error ?? err?.message ?? 'Грешка при смяна на статус');
    } finally {
      setTogglingId(null);
    }
  };

  // Warn in form when status is ACTIVE but no template picked
  const formWantsActiveWithoutTemplate = form.status === 'ACTIVE' && !form.templateId;

  // Best-effort client-side duplicate trigger check (advisory — server enforces with 409)
  const formTriggerConflict = form.trigger.trim()
    ? items.some((a) => a.trigger === form.trigger.trim() && a.id !== selected?.id)
    : false;

  const columns: ColumnDef<MarketingAutomation>[] = [
    {
      key: 'name',
      header: 'Автоматизация',
      render: (row) => (
        <span>
          <PrimaryLine>{row.name}</PrimaryLine>
          <MetaLine>Събитие: <code style={{ fontSize: '0.72rem', background: palette.bg, padding: '0.05rem 0.3rem', borderRadius: '0.2rem' }}>{row.trigger}</code></MetaLine>
        </span>
      ),
    },
    {
      key: 'template',
      header: 'Шаблон',
      render: (row) => (
        <span style={{ fontSize: '0.875rem', color: row.template ? palette.textMuted : palette.danger }}>
          {row.template?.name ?? <em>Без шаблон — не може да се активира</em>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (row) => <StatusBadge $status={row.status}>{STATUS_LABELS[row.status]}</StatusBadge>,
    },
    {
      key: 'totalRuns',
      header: 'Общо изпращания',
      render: (row) => (
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
          {row.totalRuns > 0 ? row.totalRuns.toLocaleString('bg-BG') : '—'}
        </span>
      ),
    },
    {
      key: 'lastRunAt',
      header: 'Последно изпращане',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.lastRunAt ? fmt(row.lastRunAt) : 'Никога'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Създадена',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Маркетинг</Eyebrow>
          <PageTitle>
            Автоматизации
            {total > 0 && <TotalBadge>{total}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Автоматични потоци от съобщения, задействани от системни събития</PageSubtitle>
        </TitleBlock>
        <PrimaryBtn onClick={openCreate}>+ Нова автоматизация</PrimaryBtn>
      </PageHeader>

      {apiError && !modal && (
        <WarnBanner style={{ marginBottom: '1rem', background: palette.dangerSoft, color: palette.danger, borderColor: '#f1c4b8' }}>
          {apiError}
        </WarnBanner>
      )}

      <Card>
        <FilterRow>
          <SearchInput
            type="search"
            placeholder="Търси по наименование…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <SearchInput
            list="trigger-filter-suggestions"
            type="search"
            placeholder="Филтрирай по събитие…"
            value={triggerFilter}
            onChange={(e) => { setTriggerFilter(e.target.value); setPage(1); }}
          />
          <datalist id="trigger-filter-suggestions">
            {TRIGGER_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
          </datalist>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as AutomationStatus | ''); setPage(1); }}>
            <option value="">Всички статуси</option>
            <option value="ACTIVE">Активна</option>
            <option value="PAUSED">Спряна</option>
            <option value="DRAFT">Чернова</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={items}
          rowKey={(row) => row.id}
          loading={loading}
          emptyMessage="Няма намерени автоматизации"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={total}
          onPageChange={setPage}
          rowActions={[
            { label: 'Редактирай', onClick: openEdit },
            { label: 'Спри', hidden: (row) => row.status !== 'ACTIVE', disabled: (row) => togglingId === row.id, onClick: toggleStatus },
            { label: 'Активирай', hidden: (row) => row.status === 'ACTIVE', disabled: (row) => togglingId === row.id, onClick: toggleStatus },
            { label: 'Изтрий', onClick: openDelete },
          ]}
        />
      </Card>

      {(modal === 'create' || modal === 'edit') && (
        <Overlay onClick={closeModal}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{modal === 'create' ? 'Нова автоматизация' : 'Редактирай автоматизация'}</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {apiError && (
                <div style={{ background: palette.dangerSoft, color: palette.danger, border: '1px solid #f1c4b8', borderRadius: '0.5rem', padding: '0.625rem 0.875rem', fontSize: '0.8125rem', marginBottom: '1rem' }}>
                  {apiError}
                </div>
              )}
              <FormGroup>
                <Label>Наименование *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="напр. Добре дошли при регистрация"
                  autoFocus
                />
              </FormGroup>
              <FormGroup>
                <Label>Събитие *</Label>
                <Input
                  list="trigger-suggestions"
                  value={form.trigger}
                  onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))}
                  placeholder="напр. user.signup"
                />
                <datalist id="trigger-suggestions">
                  {TRIGGER_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
                </datalist>
                <HintText>Използвайте идентификатори с точкова нотация. Изберете от предложенията или въведете персонализирано събитие.</HintText>
                {formTriggerConflict && (
                  <WarnBanner>
                    Събитие <code style={{ fontSize: '0.75rem' }}>{form.trigger}</code> вече се използва от друга автоматизация — само едно правило на събитие е позволено.
                  </WarnBanner>
                )}
              </FormGroup>
              <FormGroup>
                <Label>Шаблон</Label>
                <ModalSelect
                  value={form.templateId}
                  onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
                >
                  <option value="">— Без шаблон —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                  ))}
                </ModalSelect>
              </FormGroup>
              <FormGroup>
                <Label>Статус *</Label>
                <ModalSelect
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AutomationStatus }))}
                >
                  <option value="DRAFT">Чернова — не е активна</option>
                  <option value="ACTIVE">Активна — изпраща</option>
                  <option value="PAUSED">Спряна — временно деактивирана</option>
                </ModalSelect>
                {formWantsActiveWithoutTemplate && (
                  <WarnBanner>
                    Без шаблон — не може да активирате автоматизация без шаблон. Изберете шаблон по-горе.
                  </WarnBanner>
                )}
              </FormGroup>
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Отказ</GhostBtn>
              <PrimaryBtn
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.trigger.trim() || formWantsActiveWithoutTemplate}
              >
                {saving ? 'Запазване…' : modal === 'create' ? 'Създай автоматизация' : 'Запази промените'}
              </PrimaryBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {modal === 'delete' && selected && (
        <Overlay onClick={closeModal}>
          <ModalBox style={{ maxWidth: '26rem' }} onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Изтриване на автоматизация?</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <ConfirmText>Предстои изтриване на <strong>{selected.name}</strong>.</ConfirmText>
              <ConfirmSub>Автоматизацията ще спре незабавно. Действието е необратимо.</ConfirmSub>
              {selected.status === 'ACTIVE' && (
                <WarnBanner style={{ marginTop: '0.75rem', background: palette.dangerSoft, color: palette.danger, borderColor: '#f1c4b8' }}>
                  <strong>Автоматизацията е АКТИВНА</strong>
                  {selected.totalRuns > 0 && ` и е изпращала ${selected.totalRuns.toLocaleString('bg-BG')} пъти`}.
                  {' '}Изтриването й ще спре всички бъдещи изпращания.
                </WarnBanner>
              )}
              {!selected.templateId && (
                <WarnBanner style={{ marginTop: '0.75rem' }}>
                  Автоматизацията няма шаблон и не е изпращала съобщения.
                </WarnBanner>
              )}
              {apiError && (
                <div style={{ background: palette.dangerSoft, color: palette.danger, border: '1px solid #f1c4b8', borderRadius: '0.5rem', padding: '0.625rem 0.875rem', fontSize: '0.8125rem', marginTop: '0.75rem' }}>
                  {apiError}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Отказ</GhostBtn>
              <DangerBtn onClick={handleDelete} disabled={saving}>
                {saving ? 'Изтриване…' : 'Изтрий автоматизацията'}
              </DangerBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}
    </PageShell>
  );
}
