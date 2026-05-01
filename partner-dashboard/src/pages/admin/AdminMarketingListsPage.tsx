import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { DataTable, ColumnDef } from '../../components/admin/DataTable/DataTable';
import {
  adminMarketingService,
  MarketingList,
  MarketingListType,
  MarketingListMember,
} from '../../services/adminMarketing.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
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
const Input = styled.input`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 100%; box-sizing: border-box; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }`;
const Textarea = styled.textarea`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 100%; box-sizing: border-box; resize: vertical; &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }`;
const ModalSelect = styled.select`padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none; width: 100%; &:focus { border-color: ${palette.accent}; }`;
const HintText = styled.p`font-size: 0.75rem; color: ${palette.textSubtle}; margin: 0;`;
const ConfirmText = styled.p`font-size: 0.9375rem; color: ${palette.text}; margin: 0 0 0.5rem;`;
const ConfirmSub = styled.p`font-size: 0.8125rem; color: ${palette.textSubtle}; margin: 0;`;
const ErrorBanner = styled.div`padding: 0.5rem 0.875rem; border: 1px solid #f1c4b8; border-radius: 0.5rem; font-size: 0.8125rem; background: ${palette.dangerSoft}; color: ${palette.danger}; margin-bottom: 1rem;`;

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
  const [typeFilter, setTypeFilter] = useState<MarketingListType | ''>('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MarketingList[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<MarketingList | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  // Member management state
  const [members, setMembers] = useState<MarketingListMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addMemberType, setAddMemberType] = useState<'PARTNER' | 'USER'>('PARTNER');
  const [addMemberId, setAddMemberId] = useState('');
  const [addMemberError, setAddMemberError] = useState('');
  const [addMemberSaving, setAddMemberSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminMarketingService
      .listLists({ page, limit: PAGE_SIZE, search, type: typeFilter })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .finally(() => setLoading(false));
  }, [page, search, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

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
    setAddMemberId('');
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

  const closeModal = () => { setModal(null); setSelected(null); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        description: form.description,
        size: parseInt(form.size) || 0,
      };
      if (modal === 'create') {
        await adminMarketingService.createList(payload);
      } else if (modal === 'edit' && selected) {
        await adminMarketingService.updateList(selected.id, payload);
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
      await adminMarketingService.deleteList(selected.id);
      closeModal();
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!selected || !addMemberId.trim()) return;
    setAddMemberSaving(true);
    setAddMemberError('');
    try {
      const data = addMemberType === 'USER'
        ? { userId: addMemberId.trim() }
        : { partnerId: addMemberId.trim() };
      const member = await adminMarketingService.addListMember(selected.id, data);
      setMembers((prev) => [member, ...prev]);
      setAddMemberId('');
      // Refresh the list table so the size counter updates
      load();
    } catch (err: unknown) {
      setAddMemberError((err as any)?.response?.data?.error ?? (err as { message?: string })?.message ?? 'Could not add member. Check the ID and try again.');
    } finally {
      setAddMemberSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selected) return;
    setRemovingId(memberId);
    try {
      await adminMarketingService.removeListMember(selected.id, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      load();
    } finally {
      setRemovingId(null);
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

  const columns: ColumnDef<MarketingList>[] = [
    {
      key: 'name',
      header: 'List',
      render: (row) => (
        <span>
          <PrimaryLine>{row.name}</PrimaryLine>
          <MetaLine>{row.description}</MetaLine>
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => <TypePill $type={row.type}>{row.type}</TypePill>,
    },
    {
      key: 'size',
      header: 'Members',
      render: (row) => (
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: palette.text }}>
          {row.size.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Last updated',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.updatedAt)}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span style={{ fontSize: '0.8125rem', color: palette.textMuted }}>{fmt(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Marketing</Eyebrow>
          <PageTitle>
            Audience Lists
            {total > 0 && <TotalBadge>{total}</TotalBadge>}
          </PageTitle>
          <PageSubtitle>Subscriber segments and contact lists used in campaigns</PageSubtitle>
        </TitleBlock>
        <PrimaryBtn onClick={openCreate}>+ New List</PrimaryBtn>
      </PageHeader>

      <Card>
        <FilterRow>
          <SearchInput
            type="text"
            placeholder="Search lists…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as MarketingListType | ''); setPage(1); }}>
            <option value="">All types</option>
            <option value="STATIC">Static</option>
            <option value="DYNAMIC">Dynamic</option>
            <option value="SEGMENT">Segment</option>
          </Select>
        </FilterRow>

        <DataTable
          columns={columns}
          data={items}
          rowKey={(row) => row.id}
          loading={loading}
          emptyMessage="No lists found"
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={total}
          onPageChange={setPage}
          rowActions={[
            { label: 'Members', onClick: openMembers },
            { label: 'Edit', onClick: openEdit },
            { label: 'Delete', onClick: openDelete },
          ]}
        />
      </Card>

      {/* ── Create / Edit modal ──────────────────────────────────────────── */}
      {(modal === 'create' || modal === 'edit') && (
        <Overlay onClick={closeModal}>
          <ModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>{modal === 'create' ? 'New Audience List' : 'Edit List'}</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <FormGroup>
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Premium Card Holders"
                  autoFocus
                />
              </FormGroup>
              <FormGroup>
                <Label>Type *</Label>
                <ModalSelect
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as MarketingListType }))}
                >
                  <option value="STATIC">Static — fixed snapshot of contacts</option>
                  <option value="DYNAMIC">Dynamic — auto-updated by rules</option>
                  <option value="SEGMENT">Segment — defined by user attributes</option>
                </ModalSelect>
              </FormGroup>
              <FormGroup>
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe who is in this list and how it is maintained…"
                  rows={3}
                />
              </FormGroup>
              <FormGroup>
                <Label>Member count</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.size}
                  onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                  placeholder="0"
                />
                <HintText>For Dynamic and Segment lists this will be overwritten by the next sync.</HintText>
              </FormGroup>
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Cancel</GhostBtn>
              <PrimaryBtn onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving…' : modal === 'create' ? 'Create list' : 'Save changes'}
              </PrimaryBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Delete confirm ───────────────────────────────────────────────── */}
      {modal === 'delete' && selected && (
        <Overlay onClick={closeModal}>
          <ModalBox style={{ maxWidth: '26rem' }} onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Delete list?</ModalTitle>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>
              <ConfirmText>You are about to delete <strong>{selected.name}</strong>.</ConfirmText>
              <ConfirmSub>All member associations will also be deleted. This action cannot be undone.</ConfirmSub>
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal} disabled={saving}>Cancel</GhostBtn>
              <DangerBtn onClick={handleDelete} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete list'}
              </DangerBtn>
            </ModalFooter>
          </ModalBox>
        </Overlay>
      )}

      {/* ── Member management modal ──────────────────────────────────────── */}
      {modal === 'members' && selected && (
        <Overlay onClick={closeModal}>
          <WideModalBox onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <div>
                <ModalTitle>Members — {selected.name}</ModalTitle>
                <div style={{ fontSize: '0.8125rem', color: palette.textSubtle, marginTop: '0.2rem' }}>
                  {members.length} member{members.length !== 1 ? 's' : ''}
                  <TypePill $type={selected.type} style={{ marginLeft: '0.5rem' }}>{selected.type}</TypePill>
                </div>
              </div>
              <CloseBtn onClick={closeModal}>×</CloseBtn>
            </ModalHeader>
            <ModalBody>

              {/* ── Add member form ── */}
              <SectionTitle>Add member</SectionTitle>
              <AddMemberBox>
                <RadioRow>
                  <RadioLabel>
                    <input
                      type="radio"
                      name="addMemberType"
                      value="PARTNER"
                      checked={addMemberType === 'PARTNER'}
                      onChange={() => { setAddMemberType('PARTNER'); setAddMemberId(''); setAddMemberError(''); }}
                    />
                    Partner
                  </RadioLabel>
                  <RadioLabel>
                    <input
                      type="radio"
                      name="addMemberType"
                      value="USER"
                      checked={addMemberType === 'USER'}
                      onChange={() => { setAddMemberType('USER'); setAddMemberId(''); setAddMemberError(''); }}
                    />
                    User (subscriber)
                  </RadioLabel>
                </RadioRow>
                {addMemberError && <ErrorBanner>{addMemberError}</ErrorBanner>}
                <InlineRow>
                  <Input
                    value={addMemberId}
                    onChange={(e) => { setAddMemberId(e.target.value); setAddMemberError(''); }}
                    placeholder={addMemberType === 'PARTNER' ? 'Partner ID (UUID)' : 'User ID (UUID)'}
                    style={{ flex: 1 }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddMember(); }}
                  />
                  <PrimaryBtn
                    onClick={handleAddMember}
                    disabled={addMemberSaving || !addMemberId.trim()}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {addMemberSaving ? 'Adding…' : 'Add'}
                  </PrimaryBtn>
                </InlineRow>
                <HintText style={{ marginTop: '0.375rem' }}>
                  Paste the UUID of the {addMemberType === 'PARTNER' ? 'partner' : 'user'} to add to this list.
                </HintText>
              </AddMemberBox>

              {/* ── Member list ── */}
              <SectionTitle style={{ marginTop: '1.5rem' }}>Current members</SectionTitle>
              {membersLoading ? (
                <EmptyNote>Loading members…</EmptyNote>
              ) : members.length === 0 ? (
                <EmptyNote>No members yet. Add partners or users above.</EmptyNote>
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
                        <MemberMeta>Added {new Date(m.addedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</MemberMeta>
                      </MemberInfo>
                      <SmIconBtn
                        onClick={() => handleRemoveMember(m.id)}
                        disabled={removingId === m.id}
                        title="Remove from list"
                      >
                        {removingId === m.id ? '…' : 'Remove'}
                      </SmIconBtn>
                    </MemberRow>
                  ))}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <GhostBtn onClick={closeModal}>Close</GhostBtn>
            </ModalFooter>
          </WideModalBox>
        </Overlay>
      )}
    </PageShell>
  );
}
