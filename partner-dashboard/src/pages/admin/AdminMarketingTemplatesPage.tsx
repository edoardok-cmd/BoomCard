import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminMarketingService,
  MarketingTemplate,
  MarketingChannel,
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

const TypePill = styled.span<{ $type: MarketingChannel }>`
  display: inline-flex; font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; border-radius: 0.25rem; padding: 0.1rem 0.4rem;
  ${({ $type }) => {
    switch ($type) {
      case 'EMAIL': return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'PUSH':  return `background: #f3e8de; color: #c96442;`;
      case 'SMS':   return `background: ${palette.successSoft}; color: ${palette.success};`;
    }
  }}
`;

const SmsBadge = styled.span`
  display: inline-flex; font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; border-radius: 0.25rem; padding: 0.1rem 0.35rem; margin-left: 0.35rem;
  background: ${palette.warningSoft}; color: ${palette.warning}; border: 1px solid #fbbf24;
`;

const PrimaryBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.accent}; color: #fff; border: none; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { opacity: 0.9; } &:disabled { opacity: 0.5; cursor: default; }`;
const GhostBtn = styled.button`padding: 0.5rem 1.125rem; background: transparent; color: ${palette.textMuted}; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { border-color: ${palette.textMuted}; }`;
const DangerBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.dangerSoft}; color: ${palette.danger}; border: 1px solid #f1c4b8; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { background: #eebcac; }`;

const Overlay = styled.div`position: fixed; inset: 0; background: rgba(20,20,19,0.45); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 1rem;`;
const ModalBox = styled.div`background: ${palette.surface}; border-radius: 0.875rem; width: 100%; max-width: 38rem; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.18);`;
const ModalHeader = styled.div`display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid ${palette.border};`;
const ModalTitle = styled.h2`font-size: 1.125rem; font-weight: 700; color: ${palette.text}; margin: 0;`;
const CloseBtn = styled.button`background: none; border: none; font-size: 1.25rem; color: ${palette.textSubtle}; cursor: pointer; padding: 0.25rem; line-height: 1; &:hover { color: ${palette.text}; }`;
const ModalBody = styled.div`padding: 1.5rem;`;
const ModalFooter = styled.div`display: flex; gap: 0.75rem; justify-content: flex-end; padding: 1rem 1.5rem; border-top: 1px solid ${palette.border};`;
const FormGroup = styled.div`display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1.125rem;`;
const Label = styled.label`font-size: 0.8125rem; font-weight: 600; color: ${palette.text};`;
const Input = styled.input`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 100%; box-sizing: border-box; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }`;
const Textarea = styled.textarea`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.8125rem; font-family: 'SF Mono', 'Fira Code', monospace; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 100%; box-sizing: border-box; resize: vertical; min-height: 8rem; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }`;
const ModalSelect = styled.select`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 100%; &:focus { border-color: ${palette.accent}; }`;
const HintText = styled.p`font-size: 0.75rem; color: ${palette.textSubtle}; margin: 0;`;
const ConfirmText = styled.p`font-size: 0.9375rem; color: ${palette.text}; margin: 0 0 0.5rem;`;
const ConfirmSub = styled.p`font-size: 0.8125rem; color: ${palette.textSubtle}; margin: 0;`;
const WarnBanner = styled.div`padding: 0.5rem 0.875rem; border: 1px solid #fbbf24; border-radius: 0.5rem; font-size: 0.8125rem; background: ${palette.warningSoft}; color: ${palette.warning}; margin-bottom: 1rem;`;
const ErrorBanner = styled.div`padding: 0.5rem 0.875rem; border: 1px solid #f1c4b8; border-radius: 0.5rem; font-size: 0.8125rem; background: ${palette.dangerSoft}; color: ${palette.danger}; margin-bottom: 1rem;`;

const TabRow = styled.div`display: flex; gap: 0; border-bottom: 1px solid ${palette.border}; margin-bottom: 1rem;`;
const Tab = styled.button<{ $active: boolean }>`
  padding: 0.5rem 1rem; background: none; border: none; border-bottom: 2px solid ${({ $active }) => $active ? palette.accent : 'transparent'};
  font-size: 0.8125rem; font-weight: 600; color: ${({ $active }) => $active ? palette.accent : palette.textMuted};
  cursor: pointer; margin-bottom: -1px;
  &:hover { color: ${palette.accent}; }
`;
const PreviewFrame = styled.div`
  border: 1px solid ${palette.border}; border-radius: 0.5rem; padding: 1rem;
  background: #ffffff; min-height: 6rem; font-size: 0.875rem; line-height: 1.6;
  overflow: auto; max-height: 22rem;
`;
const DetailLabel = styled.div`font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const DetailValue = styled.div`font-size: 0.9375rem; color: ${palette.text}; font-weight: 500; margin-bottom: 1rem;`;

type ModalMode = 'create' | 'edit' | 'delete' | 'view' | null;

const TEMPLATE_CATEGORIES = [
  { value: 'registration',    label: 'Регистрация' },
  { value: 'threshold',       label: 'Достигнат праг' },
  { value: 'cashback',        label: 'Кешбек' },
  { value: 'partner_request', label: 'Заявка от партньор' },
  { value: 'onboarding',      label: 'Въвеждане' },
  { value: 'support',         label: 'Поддръжка' },
];

interface FormState {
  name: string;
  type: MarketingChannel;
  category: string;
  subject: string;
  subjectEn: string;
  body: string;
  bodyEn: string;
}

const DEFAULT_FORM: FormState = { name: '', type: 'EMAIL', category: '', subject: '', subjectEn: '', body: '', bodyEn: '' };
const PAGE_SIZE = 25;

export default function AdminMarketingTemplatesPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<MarketingChannel | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MarketingTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<MarketingTemplate | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [previewTab, setPreviewTab] = useState<'edit' | 'preview'>('edit');

  // View modal state
  const [viewDetail, setViewDetail] = useState<{ body: string; subjectEn: string | null; bodyEn: string | null } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewTab, setViewTab] = useState<'body' | 'preview'>('body');

  const load = useCallback(() => {
    setLoading(true);
    adminMarketingService
      .listTemplates({ page, limit: PAGE_SIZE, search, type: typeFilter, category: categoryFilter })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .finally(() => setLoading(false));
  }, [page, search, typeFilter, categoryFilter]);

  useEffect(() => { load(); }, [load]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('bg-BG', { day: '2-digit', month: 'short', year: 'numeric' });

  const openCreate = () => {
    setSelected(null);
    setForm(DEFAULT_FORM);
    setPreviewTab('edit');
    setModal('create');
  };

  const openEdit = async (row: MarketingTemplate) => {
    setSelected(row);
    setForm({ name: row.name, type: row.type, category: row.category ?? '', subject: row.subject ?? '', subjectEn: '', body: '', bodyEn: '' });
    setPreviewTab('edit');
    setBodyLoading(true);
    setModal('edit');
    try {
      const detail = await adminMarketingService.getTemplate(row.id);
      setForm({ name: detail.name, type: detail.type, category: detail.category ?? '', subject: detail.subject ?? '', subjectEn: detail.subjectEn ?? '', body: detail.body, bodyEn: detail.bodyEn ?? '' });
    } finally {
      setBodyLoading(false);
    }
  };

  const openView = async (row: MarketingTemplate) => {
    setSelected(row);
    setViewDetail(null);
    setViewTab('body');
    setViewLoading(true);
    setModal('view');
    try {
      const detail = await adminMarketingService.getTemplate(row.id);
      setViewDetail({ body: detail.body, subjectEn: detail.subjectEn ?? null, bodyEn: detail.bodyEn ?? null });
    } finally {
      setViewLoading(false);
    }
  };

  const openDelete = (row: MarketingTemplate) => {
    setSelected(row);
    setDeleteError('');
    setModal('delete');
  };

  const closeModal = () => { setModal(null); setSelected(null); setViewDetail(null); setDeleteError(''); };

  const handleSave = async () => {
    if (!form.name.trim() || bodyLoading) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        category: form.category || undefined,
        subject: form.subject || undefined,
        subjectEn: form.subjectEn || undefined,
        body: form.body,
        bodyEn: form.bodyEn || undefined,
      };
      if (modal === 'create') {
        await adminMarketingService.createTemplate(payload);
      } else if (modal === 'edit' && selected) {
        await adminMarketingService.updateTemplate(selected.id, payload);
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
    setDeleteError('');
    try {
      await adminMarketingService.deleteTemplate(selected.id);
      closeModal();
      load();
    } catch (err: unknown) {
      setDeleteError((err as any)?.response?.data?.error ?? (err as { message?: string })?.message ?? 'Грешка при изтриване. Опитайте отново.');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<MarketingTemplate>[] = [
    {
      key: 'name',
      header: 'Шаблон',
      render: (row) => (
        <span>
          <PrimaryLine>{row.name}</PrimaryLine>
          {row.subject && <MetaLine>{row.subject}</MetaLine>}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Тип',
      render: (row) => (
        <span>
          <TypePill $type={row.type}>{row.type}</TypePill>
          {row.type === 'SMS' && (
            <SmsBadge title="SMS провайдърът все още не е свързан. Шаблонът се записва, но кампаниите, които го използват, няма да изпратят съобщения и не нарастват броя „Употреби“.">
              провайдър липсва
            </SmsBadge>
          )}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Категория',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.category ? TEMPLATE_CATEGORIES.find((c) => c.value === row.category)?.label ?? row.category : '—'}
        </span>
      ),
    },
    {
      key: 'usageCount',
      header: 'Употреби',
      render: (row) => (
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
          {row.usageCount > 0 ? row.usageCount.toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'lastUsed',
      header: 'Последна употреба',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>
          {row.lastUsed ? fmt(row.lastUsed) : 'Никога'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Създаден',
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
            Имейл шаблони
            {total > 0 && <TotalBadge>{total}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Шаблони за кампании и автоматизации (имейл, push и SMS)</PageSubtitle>
        </TitleBlock>
        <PrimaryBtn onClick={openCreate}>+ Нов шаблон</PrimaryBtn>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Търси шаблони…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as MarketingChannel | ''); setPage(1); }}>
            <option value="">Всички типове</option>
            <option value="EMAIL">Имейл</option>
            <option value="PUSH">Push</option>
            <option value="SMS">SMS</option>
          </Select>
          <Select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
            <option value="">Всички категории</option>
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={items}
          rowKey={(row) => row.id}
          loading={loading}
          emptyMessage="Няма намерени шаблони"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={total}
          onPageChange={setPage}
          rowActions={[
            { label: 'Преглед', onClick: openView },
            { label: 'Редактирай', onClick: openEdit },
            { label: 'Изтрий', onClick: openDelete },
          ]}
        />
      </Card>

      {/* ── Create / Edit modal ──────────────────────────────────────────── */}
      {(modal === 'create' || modal === 'edit') && (
        <Overlay onClick={closeModal}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{modal === 'create' ? 'Нов шаблон' : 'Редактирай шаблон'}</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <FormGroup>
                <Label>Наименование *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="напр. Добре дошъл"
                  autoFocus
                />
              </FormGroup>
              <FormGroup>
                <Label>Канал *</Label>
                <ModalSelect
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as MarketingChannel }))}
                >
                  <option value="EMAIL">Имейл</option>
                  <option value="PUSH">Push известие</option>
                  <option value="SMS">SMS</option>
                </ModalSelect>
                {form.type === 'SMS' && (
                  <WarnBanner>SMS доставката не е активирана. Шаблони с този канал могат да се създават, но кампаниите, използващи ги, няма да изпращат съобщения.</WarnBanner>
                )}
              </FormGroup>
              <FormGroup>
                <Label>Категория</Label>
                <ModalSelect
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  <option value="">— Без —</option>
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </ModalSelect>
                <HintText>Категоризирайте по случай на употреба за по-лесно намиране.</HintText>
              </FormGroup>
              {form.type === 'EMAIL' && (
                <FormGroup>
                  <Label>Тема (BG)</Label>
                  <Input
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="напр. Вашата BoomCard карта е готова"
                  />
                </FormGroup>
              )}
              {form.type === 'EMAIL' && (
                <FormGroup>
                  <Label>Тема (EN) <span style={{ fontWeight: 400, color: palette.textSubtle }}>— изпращана на потребители с preferredLanguage = en</span></Label>
                  <Input
                    value={form.subjectEn}
                    onChange={(e) => setForm((f) => ({ ...f, subjectEn: e.target.value }))}
                    placeholder="напр. Your BoomCard is ready to use"
                  />
                </FormGroup>
              )}
              <FormGroup>
                <Label>Текст * {form.type === 'EMAIL' ? '(BG)' : ''}</Label>
                {form.type === 'EMAIL' && (
                  <TabRow>
                    <Tab $active={previewTab === 'edit'} onClick={() => setPreviewTab('edit')}>Редактирай</Tab>
                    <Tab $active={previewTab === 'preview'} onClick={() => setPreviewTab('preview')}>Преглед</Tab>
                  </TabRow>
                )}
                {bodyLoading ? (
                  <div style={{ padding: '1rem', color: palette.textSubtle, fontSize: '0.875rem' }}>Зарежда се…</div>
                ) : previewTab === 'preview' && form.type === 'EMAIL' ? (
                  <PreviewFrame dangerouslySetInnerHTML={{ __html: form.body || '<em style="color:#8c8678">Без съдържание.</em>' }} />
                ) : (
                  <Textarea
                    value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                    placeholder={form.type === 'EMAIL' ? 'HTML или обикновен текст…' : 'Съдържание на съобщението…'}
                    rows={form.type === 'EMAIL' ? 10 : 4}
                  />
                )}
                {form.type !== 'EMAIL' && !bodyLoading && (
                  <HintText>Използвайте {'{{variable}}'} за динамични стойности.</HintText>
                )}
              </FormGroup>
              {form.type === 'EMAIL' && (
                <FormGroup>
                  <Label>Текст (EN) <span style={{ fontWeight: 400, color: palette.textSubtle }}>— изпращан на потребители с preferredLanguage = en</span></Label>
                  <Textarea
                    value={form.bodyEn}
                    onChange={(e) => setForm((f) => ({ ...f, bodyEn: e.target.value }))}
                    placeholder="HTML или обикновен текст на английски…"
                    rows={8}
                  />
                </FormGroup>
              )}
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Откажи</GhostBtn>
              <PrimaryBtn onClick={handleSave} disabled={saving || bodyLoading || !form.name.trim()}>
                {saving ? 'Запазва…' : bodyLoading ? 'Зарежда…' : modal === 'create' ? 'Създай шаблон' : 'Запази промените'}
              </PrimaryBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Preview (read-only view) modal ───────────────────────────────── */}
      {modal === 'view' && selected && (
        <Overlay onClick={closeModal}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>{selected.name}</ModalTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                  <TypePill $type={selected.type}>{selected.type}</TypePill>
                  {selected.type === 'SMS' && <SmsBadge title="SMS провайдърът все още не е свързан">провайдър липсва</SmsBadge>}
                  {selected.category && (
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.04em', borderRadius: '0.25rem', padding: '0.1rem 0.4rem',
                      background: palette.border, color: palette.textMuted,
                    }}>
                      {TEMPLATE_CATEGORIES.find((c) => c.value === selected.category)?.label ?? selected.category}
                    </span>
                  )}
                </div>
              </div>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {selected.subject && (
                <>
                  <DetailLabel>Тема (BG)</DetailLabel>
                  <DetailValue>{selected.subject}</DetailValue>
                </>
              )}
              {!viewLoading && viewDetail?.subjectEn && (
                <>
                  <DetailLabel>Тема (EN)</DetailLabel>
                  <DetailValue>{viewDetail.subjectEn}</DetailValue>
                </>
              )}
              <DetailLabel>Текст {selected.type === 'EMAIL' ? '(BG)' : ''}</DetailLabel>
              {selected.type === 'EMAIL' && (
                <TabRow style={{ marginBottom: '0.75rem' }}>
                  <Tab $active={viewTab === 'body'} onClick={() => setViewTab('body')}>Код</Tab>
                  <Tab $active={viewTab === 'preview'} onClick={() => setViewTab('preview')}>Преглед</Tab>
                </TabRow>
              )}
              {viewLoading ? (
                <div style={{ padding: '1rem', color: palette.textSubtle, fontSize: '0.875rem' }}>Зарежда се…</div>
              ) : viewDetail ? (
                viewTab === 'preview' && selected.type === 'EMAIL' ? (
                  <PreviewFrame dangerouslySetInnerHTML={{ __html: viewDetail.body || '<em style="color:#8c8678">Без съдържание.</em>' }} />
                ) : (
                  <Textarea
                    value={viewDetail.body}
                    readOnly
                    rows={selected.type === 'EMAIL' ? 12 : 5}
                    style={{ cursor: 'default', background: palette.bg }}
                  />
                )
              ) : null}
              {!viewLoading && viewDetail?.bodyEn && selected.type === 'EMAIL' && (
                <>
                  <DetailLabel style={{ marginTop: '1rem' }}>Текст (EN)</DetailLabel>
                  {viewTab === 'preview' ? (
                    <PreviewFrame dangerouslySetInnerHTML={{ __html: viewDetail.bodyEn }} />
                  ) : (
                    <Textarea
                      value={viewDetail.bodyEn}
                      readOnly
                      rows={8}
                      style={{ cursor: 'default', background: palette.bg }}
                    />
                  )}
                </>
              )}
              {!viewLoading && (
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', fontSize: '0.8125rem', color: palette.textSubtle }}>
                  <span>Употребен {selected.usageCount > 0 ? selected.usageCount.toLocaleString() + ' пъти' : 'никога'}</span>
                  {selected.lastUsed && <span>Последна употреба {fmt(selected.lastUsed)}</span>}
                  <span>Създаден {fmt(selected.createdAt)}</span>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal}>Затвори</GhostBtn>
              <PrimaryBtn onClick={() => { closeModal(); setTimeout(() => openEdit(selected!), 50); }}>Редактирай</PrimaryBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Delete confirm ───────────────────────────────────────────────── */}
      {modal === 'delete' && selected && (
        <Overlay onClick={closeModal}>
          <ModalBox style={{ maxWidth: '26rem' }} onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Изтриване на шаблон?</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {deleteError && <ErrorBanner>{deleteError}</ErrorBanner>}
              <ConfirmText>
                Предстои изтриване на <strong>{selected.name}</strong>.
              </ConfirmText>
              <ConfirmSub>
                Кампаниите, използващи този шаблон, ще загубят препратката към него.
                <strong style={{ color: '#b54327' }}> Активни автоматизации, свързани с шаблона, не могат да бъдат изтрити — спрете ги първо.</strong>
                {' '}Действието не може да бъде отменено.
              </ConfirmSub>
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Откажи</GhostBtn>
              <DangerBtn onClick={handleDelete} disabled={saving}>
                {saving ? 'Изтрива се…' : 'Изтрий шаблон'}
              </DangerBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}
    </PageShell>
  );
}
