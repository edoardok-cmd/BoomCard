import { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminMarketingService,
  MarketingList,
  MarketingListType,
  MarketingListMember,
  UserSearchResult,
  PartnerSearchResult,
} from '../../services/adminMarketing.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  info: '#2563eb', infoSoft: '#dbeafe',
  warning: '#92400e', warningSoft: '#fef3c7',
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

const TypePill = styled.span<{ $type: MarketingListType }>`
  display: inline-flex; font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em; border-radius: 0.25rem; padding: 0.1rem 0.4rem;
  ${({ $type }) => {
    switch ($type) {
      case 'DYNAMIC':  return `background: ${palette.infoSoft}; color: ${palette.info};`;
      case 'SEGMENT':  return `background: ${palette.successSoft}; color: ${palette.success};`;
      default:         return `background: #f3e8de; color: #c96442;`;
    }
  }}
`;

const MemberTypePill = styled.span<{ $type: string }>`
  display: inline-flex; font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; border-radius: 0.25rem; padding: 0.1rem 0.35rem;
  ${({ $type }) =>
    $type === 'USER'
      ? `background: ${palette.infoSoft}; color: ${palette.info};`
      : `background: #f3e8de; color: #c96442;`}
`;

const PrimaryBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.accent}; color: #fff; border: none; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { opacity: 0.9; } &:disabled { opacity: 0.5; cursor: default; }`;
const SecondaryBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.infoSoft}; color: ${palette.info}; border: 1px solid #93c5fd; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { opacity: 0.9; } &:disabled { opacity: 0.5; cursor: default; }`;
const GhostBtn = styled.button`padding: 0.5rem 1.125rem; background: transparent; color: ${palette.textMuted}; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { border-color: ${palette.textMuted}; }`;
const DangerBtn = styled.button`padding: 0.5rem 1.125rem; background: ${palette.dangerSoft}; color: ${palette.danger}; border: 1px solid #f1c4b8; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover { background: #eebcac; }`;
const SmIconBtn = styled.button`padding: 0.2rem 0.5rem; background: ${palette.dangerSoft}; color: ${palette.danger}; border: 1px solid #f1c4b8; border-radius: 0.25rem; font-size: 0.7rem; font-weight: 600; cursor: pointer; &:hover { background: #eebcac; } &:disabled { opacity: 0.4; cursor: default; }`;

const Overlay = styled.div`position: fixed; inset: 0; background: rgba(20,20,19,0.45); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 1rem;`;
const ModalBox = styled.div`background: ${palette.surface}; border-radius: 0.875rem; width: 100%; max-width: 34rem; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.18);`;
const WideModalBox = styled(ModalBox)`max-width: 52rem;`;
const ModalHeader = styled.div`display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid ${palette.border};`;
const ModalTitle = styled.h2`font-size: 1.125rem; font-weight: 700; color: ${palette.text}; margin: 0;`;
const CloseBtn = styled.button`background: none; border: none; font-size: 1.25rem; color: ${palette.textSubtle}; cursor: pointer; padding: 0.25rem; line-height: 1; &:hover { color: ${palette.text}; }`;
const ModalBody = styled.div`padding: 1.5rem;`;
const ModalFooter = styled.div`display: flex; gap: 0.75rem; justify-content: flex-end; padding: 1rem 1.5rem; border-top: 1px solid ${palette.border};`;
const FormGroup = styled.div`display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1.125rem;`;
const Label = styled.label`font-size: 0.8125rem; font-weight: 600; color: ${palette.text};`;
const Input = styled.input`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 100%; box-sizing: border-box; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; } &:disabled { background: #f0ede6; color: ${palette.textSubtle}; cursor: not-allowed; }`;
const Textarea = styled.textarea`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 100%; box-sizing: border-box; resize: vertical; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }`;
const ModalSelect = styled.select`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 100%; &:focus { border-color: ${palette.accent}; }`;
const HintText = styled.p`font-size: 0.75rem; color: ${palette.textSubtle}; margin: 0;`;
const ConfirmText = styled.p`font-size: 0.9375rem; color: ${palette.text}; margin: 0 0 0.5rem;`;
const ConfirmSub = styled.p`font-size: 0.8125rem; color: ${palette.textSubtle}; margin: 0;`;
const ErrorBanner = styled.div`padding: 0.5rem 0.875rem; border: 1px solid #f1c4b8; border-radius: 0.5rem; font-size: 0.8125rem; background: ${palette.dangerSoft}; color: ${palette.danger}; margin-bottom: 1rem;`;
const WarnBanner = styled.div`padding: 0.625rem 0.875rem; border: 1px solid #fcd34d; border-radius: 0.5rem; font-size: 0.8125rem; background: ${palette.warningSoft}; color: ${palette.warning}; margin-bottom: 1rem;`;

const SectionTitle = styled.div`font-size: 0.8125rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${palette.textSubtle}; margin-bottom: 0.75rem;`;
const MemberRow = styled.div`display: flex; align-items: center; justify-content: space-between; padding: 0.625rem 0; border-bottom: 1px solid ${palette.border}; &:last-child { border-bottom: none; }`;
const MemberInfo = styled.div`display: flex; flex-direction: column; gap: 0.125rem;`;
const MemberName = styled.div`font-size: 0.875rem; font-weight: 600; color: ${palette.text};`;
const MemberMeta = styled.div`font-size: 0.75rem; color: ${palette.textSubtle};`;
const EmptyNote = styled.div`text-align: center; padding: 1.5rem; color: ${palette.textSubtle}; font-size: 0.875rem;`;
const AddMemberBox = styled.div`background: ${palette.bg}; border: 1px solid ${palette.border}; border-radius: 0.5rem; padding: 1rem; margin-top: 1rem;`;
const RadioRow = styled.div`display: flex; gap: 1.25rem; margin-bottom: 0.75rem;`;
const RadioLabel = styled.label`display: flex; align-items: center; gap: 0.375rem; font-size: 0.875rem; font-weight: 600; color: ${palette.text}; cursor: pointer;`;
const InlineRow = styled.div`display: flex; gap: 0.5rem; align-items: flex-end;`;
const SearchResultsDropdown = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 0.25rem; max-height: 12rem; overflow-y: auto;`;
const SearchResultItem = styled.button`width: 100%; text-align: left; padding: 0.5rem 0.875rem; border: none; background: transparent; cursor: pointer; font-size: 0.875rem; color: ${palette.text}; &:hover { background: ${palette.bg}; }`;
const SearchResultMeta = styled.div`font-size: 0.75rem; color: ${palette.textSubtle};`;

type ModalMode = 'create' | 'edit' | 'delete' | 'members' | null;

interface FormState {
  name: string;
  type: MarketingListType;
  description: string;
  size: string;
}

const DEFAULT_FORM: FormState = { name: '', type: 'STATIC', description: '', size: '0' };
const PAGE_SIZE = 25;

export default function AdminMarketingListsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typeFilter, setTypeFilter] = useState<MarketingListType | ''>('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MarketingList[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initializingDefaults, setInitializingDefaults] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<MarketingList | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [removeMemberError, setRemoveMemberError] = useState('');

  // Member management state
  const [members, setMembers] = useState<MarketingListMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addMemberType, setAddMemberType] = useState<'PARTNER' | 'USER'>('PARTNER');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<(UserSearchResult | PartnerSearchResult)[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [selectedMemberPayload, setSelectedMemberPayload] = useState<{ userId?: string; partnerId?: string } | null>(null);
  const [addMemberError, setAddMemberError] = useState('');
  const [addMemberSaving, setAddMemberSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminMarketingService
      .listLists({ page, limit: PAGE_SIZE, search: debouncedSearch, type: typeFilter })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, typeFilter]);

  useEffect(() => { load(); }, [load]);

  // Debounce the list search so we don't fire an API call on every keystroke
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [search]);

  // Escape key closes any open modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modal) closeModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modal]);

  // Debounced member search
  useEffect(() => {
    if (!memberSearchQuery.trim()) {
      setMemberSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setMemberSearching(true);
      try {
        const results = addMemberType === 'USER'
          ? await adminMarketingService.searchUsers(memberSearchQuery)
          : await adminMarketingService.searchPartners(memberSearchQuery);
        setMemberSearchResults(results);
      } finally {
        setMemberSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearchQuery, addMemberType]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('bg-BG', { day: '2-digit', month: 'short', year: 'numeric' });

  const openCreate = () => {
    setSelected(null);
    setForm(DEFAULT_FORM);
    setModal('create');
  };

  const openEdit = (row: MarketingList) => {
    setSelected(row);
    setForm({ name: row.name, type: row.type, description: row.description, size: String(row.size) });
    setModal('edit');
  };

  const openDelete = (row: MarketingList) => {
    setSelected(row);
    setModal('delete');
  };

  const openMembers = async (row: MarketingList) => {
    setSelected(row);
    setMembers([]);
    setMemberSearchQuery('');
    setMemberSearchResults([]);
    setSelectedMemberPayload(null);
    setAddMemberType('PARTNER');
    setAddMemberError('');
    setModal('members');
    setMembersLoading(true);
    try {
      const data = await adminMarketingService.getListMembers(row.id);
      setMembers(data);
    } finally {
      setMembersLoading(false);
    }
  };

  const closeModal = () => {
    setModal(null);
    setSelected(null);
    setSaveError('');
    setDeleteError('');
    setRemoveMemberError('');
    setMemberSearchQuery('');
    setMemberSearchResults([]);
    setSelectedMemberPayload(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        name: form.name,
        type: form.type,
        description: form.description,
        size: form.type === 'STATIC' ? (parseInt(form.size) || 0) : 0,
      };
      if (modal === 'create') {
        await adminMarketingService.createList(payload);
      } else if (modal === 'edit' && selected) {
        await adminMarketingService.updateList(selected.id, payload);
      }
      closeModal();
      load();
    } catch (err: unknown) {
      setSaveError((err as any)?.response?.data?.error ?? (err as { message?: string })?.message ?? 'Неуспешно запазване. Опитайте отново.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminMarketingService.deleteList(selected.id);
      closeModal();
      load();
    } catch (err: unknown) {
      setDeleteError((err as any)?.response?.data?.error ?? (err as { message?: string })?.message ?? 'Неуспешно изтриване. Опитайте отново.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectMemberSuggestion = (result: UserSearchResult | PartnerSearchResult) => {
    if (addMemberType === 'USER') {
      const u = result as UserSearchResult;
      setSelectedMemberPayload({ userId: u.id });
      setMemberSearchQuery([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email);
    } else {
      const p = result as PartnerSearchResult;
      setSelectedMemberPayload({ partnerId: p.id });
      setMemberSearchQuery(p.businessName);
    }
    setMemberSearchResults([]);
  };

  const handleAddMember = async () => {
    if (!selected || !selectedMemberPayload) return;
    setAddMemberSaving(true);
    setAddMemberError('');
    try {
      const member = await adminMarketingService.addListMember(selected.id, selectedMemberPayload);
      setMembers((prev) => [member, ...prev]);
      setMemberSearchQuery('');
      setSelectedMemberPayload(null);
      load();
    } catch (err: unknown) {
      setAddMemberError((err as any)?.response?.data?.error ?? (err as { message?: string })?.message ?? 'Неуспешно добавяне. Проверете данните.');
    } finally {
      setAddMemberSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selected) return;
    setRemovingId(memberId);
    setRemoveMemberError('');
    try {
      await adminMarketingService.removeListMember(selected.id, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      load();
    } catch (err: unknown) {
      setRemoveMemberError((err as any)?.response?.data?.error ?? (err as { message?: string })?.message ?? 'Неуспешно премахване. Опитайте отново.');
    } finally {
      setRemovingId(null);
    }
  };

  const [initFeedback, setInitFeedback] = useState('');

  const handleInitializeDefaults = async () => {
    setInitializingDefaults(true);
    setInitFeedback('');
    try {
      const result = await adminMarketingService.ensureDefaultLists();
      const created = result.results.filter((r) => r.action === 'created').length;
      const ok = result.results.filter((r) => r.action !== 'created').length;
      setInitFeedback(
        created > 0
          ? `Създадени ${created} нови сегмента, ${ok} вече съществуваха. Броят на членовете е преизчислен.`
          : `Всички ${ok} задължителни сегмента вече съществуваха. Броят на членовете е преизчислен.`
      );
      load();
      // Auto-clear feedback after 6 s — long enough to read, short enough not to clutter the page
      setTimeout(() => setInitFeedback(''), 6000);
    } finally {
      setInitializingDefaults(false);
    }
  };

  const memberDisplayName = (m: MarketingListMember): string => {
    if (m.memberType === 'USER' && m.user) {
      const name = [m.user.firstName, m.user.lastName].filter(Boolean).join(' ');
      return name || m.user.email;
    }
    if (m.partner) return m.partner.businessName;
    return m.userId ?? m.partnerId ?? m.id;
  };

  const memberSubline = (m: MarketingListMember): string => {
    if (m.memberType === 'USER' && m.user) return m.user.email;
    if (m.partner?.email) return m.partner.email;
    return '';
  };

  // GAP 4: surface whom each list targets so the operator picks the right
  // segment when composing a campaign. Maps backend's audienceKind enum to
  // a coloured pill with a Bulgarian label.
  const renderAudienceKind = (kind: MarketingList['audienceKind']) => {
    if (!kind || kind === 'EMPTY') {
      return <span style={{ fontSize: '0.7rem', color: palette.textSubtle, fontStyle: 'italic' }}>празен</span>;
    }
    const config: Record<string, { label: string; bg: string; fg: string }> = {
      SUBSCRIBERS: { label: 'абонати',    bg: palette.infoSoft,    fg: palette.info },
      PARTNERS:    { label: 'партньори',  bg: '#f3e8de',           fg: '#c96442' },
      MIXED:       { label: 'смесена',    bg: palette.warningSoft, fg: palette.warning },
    };
    // Fallback for any future audienceKind the backend may add — render as a
    // neutral pill instead of crashing on `c.label`.
    const c = config[kind] ?? { label: String(kind).toLowerCase(), bg: palette.border, fg: palette.textMuted };
    return (
      <span style={{
        display: 'inline-flex', fontSize: '0.65rem', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.04em',
        borderRadius: '0.25rem', padding: '0.1rem 0.4rem',
        background: c.bg, color: c.fg,
      }}>
        {c.label}
      </span>
    );
  };

  const columns: ColumnDef<MarketingList>[] = [
    {
      key: 'name',
      header: 'Списък',
      render: (row) => (
        <span>
          <PrimaryLine>{row.name}</PrimaryLine>
          <MetaLine>{row.description}</MetaLine>
        </span>
      ),
    },
    {
      key: 'audienceKind',
      header: 'Аудитория',
      render: (row) => renderAudienceKind(row.audienceKind),
    },
    {
      key: 'type',
      header: 'Тип',
      render: (row) => <TypePill $type={row.type}>{row.type}</TypePill>,
    },
    {
      key: 'size',
      header: 'Членове',
      render: (row) => (
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
          {row.size.toLocaleString('bg-BG')}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Последна промяна',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.updatedAt)}</span>
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

  const isDynamicOrSegment = selected?.type === 'DYNAMIC' || selected?.type === 'SEGMENT';

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Маркетинг</Eyebrow>
          <PageTitle>
            Аудитория — Списъци
            {total > 0 && <TotalBadge>{total}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Сегменти и списъци с контакти, използвани в кампаниите</PageSubtitle>
        </TitleBlock>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <SecondaryBtn
            onClick={handleInitializeDefaults}
            disabled={initializingDefaults}
            title="Създава или обновява 7 системни сегмента: Premium абонати, Basic абонати, всички активни абонати, неактивни 90+ дни, имейл съгласие, активни партньори и потенциални партньори. Преизчислява броя на членовете веднага."
          >
            {initializingDefaults ? 'Инициализира се…' : 'Инициализирай задължителните сегменти'}
          </SecondaryBtn>
          <PrimaryBtn onClick={openCreate}>+ Нов списък</PrimaryBtn>
        </div>
      </PageHeader>

      {initFeedback && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: palette.successSoft, border: `1px solid #86efac`, borderRadius: '0.5rem', fontSize: '0.875rem', color: palette.success, fontWeight: 500 }}>
          {initFeedback}
        </div>
      )}

      <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: palette.infoSoft, border: `1px solid #93c5fd`, borderRadius: '0.5rem', fontSize: '0.8125rem', color: palette.info }}>
        <strong>Тип на списъка:</strong>{' '}
        <strong>СТАТИЧЕН</strong> — фиксирана снимка, ръчно управление на членовете.{' '}
        <strong>ДИНАМИЧЕН</strong> и <strong>СЕГМЕНТ</strong> — броят се преизчислява автоматично всяка нощ в 02:30 (или веднага при натискане на „Инициализирай задължителните сегменти“).
      </div>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Търси списъци…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as MarketingListType | ''); setPage(1); }}>
            <option value="">Всички типове</option>
            <option value="STATIC">Статичен</option>
            <option value="DYNAMIC">Динамичен</option>
            <option value="SEGMENT">Сегмент</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={items}
          rowKey={(row) => row.id}
          loading={loading}
          emptyMessage="Няма намерени списъци"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={total}
          onPageChange={setPage}
          rowActions={[
            { label: 'Членове', onClick: openMembers },
            { label: 'Редактирай', onClick: openEdit },
            { label: 'Изтрий', onClick: openDelete },
          ]}
        />
      </Card>

      {/* ── Създай / Редактирай ──────────────────────────────────────────── */}
      {(modal === 'create' || modal === 'edit') && (
        <Overlay onClick={closeModal}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{modal === 'create' ? 'Нов списък' : 'Редактирай списък'}</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {saveError && <ErrorBanner>{saveError}</ErrorBanner>}
              <FormGroup>
                <Label>Наименование *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="напр. Premium абонати"
                  autoFocus
                />
              </FormGroup>
              <FormGroup>
                <Label>Тип *</Label>
                <ModalSelect
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as MarketingListType }))}
                >
                  <option value="STATIC">Статичен — фиксирана снимка на контакти</option>
                  <option value="DYNAMIC">Динамичен — автоматично обновяване по правила</option>
                  <option value="SEGMENT">Сегмент — дефиниран по атрибути на потребителите</option>
                </ModalSelect>
              </FormGroup>
              <FormGroup>
                <Label>Описание</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Опишете кои са в списъка и как се поддържа…"
                  rows={3}
                />
              </FormGroup>
              {form.type === 'STATIC' && (
                <FormGroup>
                  <Label>Брой членове</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.size}
                    onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                    placeholder="0"
                  />
                  <HintText>Бройката се поддържа автоматично при добавяне/премахване на членове.</HintText>
                </FormGroup>
              )}
              {(form.type === 'DYNAMIC' || form.type === 'SEGMENT') && (
                <WarnBanner>
                  Бройката на членовете за <strong>{form.type}</strong> списъци се изчислява автоматично нощем от планировчика. Не е необходимо да я въвеждате ръчно.
                </WarnBanner>
              )}
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Отказ</GhostBtn>
              <PrimaryBtn onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Запазва се…' : modal === 'create' ? 'Създай списък' : 'Запази промените'}
              </PrimaryBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Потвърждение за изтриване ────────────────────────────────────── */}
      {modal === 'delete' && selected && (
        <Overlay onClick={closeModal}>
          <ModalBox style={{ maxWidth: '26rem' }} onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Изтрий списък?</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              {deleteError && <ErrorBanner>{deleteError}</ErrorBanner>}
              <ConfirmText>Ще изтриете <strong>{selected.name}</strong>.</ConfirmText>
              <ConfirmSub>Всички членове ще бъдат премахнати. Списъкът не може да се изтрие, ако се използва в активна кампания. Действието е необратимо.</ConfirmSub>
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Отказ</GhostBtn>
              <DangerBtn onClick={handleDelete} disabled={saving}>
                {saving ? 'Изтрива се…' : 'Изтрий списък'}
              </DangerBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Управление на членове ────────────────────────────────────────── */}
      {modal === 'members' && selected && (
        <Overlay onClick={closeModal}>
          <WideModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Членове — {selected.name}</ModalTitle>
                <div style={{ fontSize: '0.8125rem', color: palette.textSubtle, marginTop: '0.2rem' }}>
                  {members.length} член{members.length !== 1 ? 'а' : ''}
                  <TypePill $type={selected.type} style={{ marginLeft: '0.5rem' }}>{selected.type}</TypePill>
                </div>
              </div>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>

              {isDynamicOrSegment && (
                <WarnBanner>
                  Това е <strong>{selected.type}</strong> списък. Членовете се управляват автоматично по правила — ръчното добавяне е само за изключения и може да бъде презаписано при следващата синхронизация.
                </WarnBanner>
              )}

              {/* ── Добавяне на член ── */}
              <SectionTitle>Добавяне на член</SectionTitle>
              <AddMemberBox>
                <RadioRow>
                  <RadioLabel>
                    <input
                      type="radio"
                      name="addMemberType"
                      value="PARTNER"
                      checked={addMemberType === 'PARTNER'}
                      onChange={() => { setAddMemberType('PARTNER'); setMemberSearchQuery(''); setMemberSearchResults([]); setSelectedMemberPayload(null); setAddMemberError(''); }}
                    />
                    Партньор
                  </RadioLabel>
                  <RadioLabel>
                    <input
                      type="radio"
                      name="addMemberType"
                      value="USER"
                      checked={addMemberType === 'USER'}
                      onChange={() => { setAddMemberType('USER'); setMemberSearchQuery(''); setMemberSearchResults([]); setSelectedMemberPayload(null); setAddMemberError(''); }}
                    />
                    Абонат
                  </RadioLabel>
                </RadioRow>
                {addMemberError && <ErrorBanner>{addMemberError}</ErrorBanner>}
                <div style={{ position: 'relative' }}>
                  <InlineRow>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <Input
                        value={memberSearchQuery}
                        onChange={(e) => { setMemberSearchQuery(e.target.value); setSelectedMemberPayload(null); setAddMemberError(''); }}
                        placeholder={addMemberType === 'PARTNER' ? 'Търси по бизнес име или имейл…' : 'Търси по имейл, име или фамилия…'}
                        onKeyDown={(e) => { if (e.key === 'Enter' && selectedMemberPayload) handleAddMember(); }}
                      />
                      {memberSearchResults.length > 0 && (
                        <SearchResultsDropdown style={{ position: 'absolute', width: '100%', zIndex: 10 }}>
                          {memberSearchResults.map((r) => (
                            <SearchResultItem key={r.id} onClick={() => handleSelectMemberSuggestion(r)}>
                              {addMemberType === 'USER'
                                ? (() => { const u = r as UserSearchResult; return (<><div>{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}</div><SearchResultMeta>{u.email}</SearchResultMeta></>); })()
                                : (() => { const p = r as PartnerSearchResult; return (<><div>{p.businessName}</div><SearchResultMeta>{p.email ?? ''} — {p.status}</SearchResultMeta></>); })()
                              }
                            </SearchResultItem>
                          ))}
                          {memberSearching && <SearchResultItem as="div" style={{ cursor: 'default', color: palette.textSubtle }}>Търси се…</SearchResultItem>}
                        </SearchResultsDropdown>
                      )}
                    </div>
                    <PrimaryBtn
                      onClick={handleAddMember}
                      disabled={addMemberSaving || !selectedMemberPayload}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {addMemberSaving ? 'Добавя се…' : 'Добави'}
                    </PrimaryBtn>
                  </InlineRow>
                </div>
                <HintText style={{ marginTop: '0.375rem' }}>
                  {selectedMemberPayload
                    ? '✓ Избран — натиснете Добави, за да потвърдите.'
                    : `Потърсете ${addMemberType === 'PARTNER' ? 'партньор' : 'абонат'} по име или имейл, след което го изберете от падащото меню.`}
                </HintText>
              </AddMemberBox>

              {/* ── Текущи членове ── */}
              <SectionTitle style={{ marginTop: '1.5rem' }}>Текущи членове</SectionTitle>
              {removeMemberError && <ErrorBanner style={{ marginBottom: '0.75rem' }}>{removeMemberError}</ErrorBanner>}
              {membersLoading ? (
                <EmptyNote>Зарежда се…</EmptyNote>
              ) : members.length === 0 ? (
                <EmptyNote>Няма членове. Добавете партньори или абонати по-горе.</EmptyNote>
              ) : (
                <div style={{ maxHeight: '22rem', overflowY: 'auto' }}>
                  {members.map((m) => (
                    <MemberRow key={m.id}>
                      <MemberInfo>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <MemberName>{memberDisplayName(m)}</MemberName>
                          <MemberTypePill $type={m.memberType}>{m.memberType}</MemberTypePill>
                        </div>
                        {memberSubline(m) && <MemberMeta>{memberSubline(m)}</MemberMeta>}
                        <MemberMeta>Добавен {new Date(m.addedAt).toLocaleDateString('bg-BG', { day: '2-digit', month: 'short', year: 'numeric' })}</MemberMeta>
                      </MemberInfo>
                      <SmIconBtn
                        onClick={() => handleRemoveMember(m.id)}
                        disabled={removingId === m.id}
                        title="Премахни от списъка"
                      >
                        {removingId === m.id ? '…' : 'Премахни'}
                      </SmIconBtn>
                    </MemberRow>
                  ))}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal}>Затвори</GhostBtn>
            </ModalFooter>
          </WideModalBox>
        </Overlay>
      )}
    </PageShell>
  );
}
