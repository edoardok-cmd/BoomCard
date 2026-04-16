import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { fraudAdminService } from '../services/fraudAdmin.service';
import { MerchantWhitelistEntry, WhitelistStatus } from '../types/fraud.types';
import { ShieldCheck, Plus, Search, Edit3 } from 'lucide-react';

// ── Styled Components ────────────────────────────────────────────────────────

const PageContainer = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
`;

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  svg { color: var(--color-text-secondary); }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 0.75rem;
`;

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const StatCard = styled.div<{ $accent?: string }>`
  background: var(--color-background);
  padding: 1.5rem;
  border-radius: 1rem;
  border: 2px solid ${p => p.$accent || 'var(--color-border)'};
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-weight: 600;
  margin-bottom: 0.5rem;
`;

const StatValue = styled.div`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
`;

const FilterBar = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  align-items: center;
`;

const FilterButton = styled.button<{ $active?: boolean }>`
  padding: 0.625rem 1.125rem;
  background: ${p => p.$active ? '#2563eb' : 'var(--color-background)'};
  color: ${p => p.$active ? '#fff' : 'var(--color-text-primary)'};
  border: 2px solid ${p => p.$active ? '#2563eb' : 'var(--color-border)'};
  border-radius: 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
`;

const SearchInput = styled.input`
  padding: 0.625rem 1rem 0.625rem 2.5rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  margin-left: auto;
  min-width: 220px;
  &:focus { outline: none; border-color: #2563eb; }
`;

const SearchWrapper = styled.div`
  position: relative;
  margin-left: auto;
  display: flex;
  align-items: center;
  svg {
    position: absolute;
    left: 0.75rem;
    color: var(--color-text-secondary);
    width: 16px;
    height: 16px;
    pointer-events: none;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: 1rem;
  overflow: hidden;
`;

const Th = styled.th`
  text-align: left;
  padding: 1rem 1.25rem;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 2px solid var(--color-border);
  background: var(--color-background);
`;

const Td = styled.td`
  padding: 1rem 1.25rem;
  font-size: 0.9375rem;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
`;

const StatusBadge = styled.span<{ $status: WhitelistStatus }>`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: ${p => {
    switch (p.$status) {
      case 'APPROVED': return '#d1fae5';
      case 'BLOCKED': return '#fee2e2';
      case 'PENDING': return '#fef3c7';
      default: return '#f3f4f6';
    }
  }};
  color: ${p => {
    switch (p.$status) {
      case 'APPROVED': return '#065f46';
      case 'BLOCKED': return '#991b1b';
      case 'PENDING': return '#92400e';
      default: return '#374151';
    }
  }};
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { border-color: #2563eb; color: #2563eb; }
  svg { width: 14px; height: 14px; }
`;

const AddButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { background: #1d4ed8; box-shadow: 0 4px 12px rgba(37,99,235,0.3); }
  svg { width: 16px; height: 16px; }
`;

const Modal = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 2rem;
  max-width: 480px;
  width: 90%;
`;

const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 1.25rem 0;
`;

const FormGroup = styled.div`
  margin-bottom: 1.25rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.375rem;
`;

const Input = styled.input`
  width: 100%; padding: 0.625rem; box-sizing: border-box;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  &:focus { outline: none; border-color: #2563eb; }
`;

const Select = styled.select`
  width: 100%; padding: 0.625rem; box-sizing: border-box;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  &:focus { outline: none; border-color: #2563eb; }
`;

const Textarea = styled.textarea`
  width: 100%; padding: 0.625rem; box-sizing: border-box;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9375rem; min-height: 90px; resize: vertical;
  background: var(--color-background);
  color: var(--color-text-primary);
  &:focus { outline: none; border-color: #2563eb; }
`;

const ModalActions = styled.div`
  display: flex; gap: 0.75rem; justify-content: flex-end;
`;

const CancelButton = styled.button`
  padding: 0.5rem 1rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { border-color: #000; }
`;

const SubmitButton = styled.button`
  padding: 0.5rem 1rem;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: #1d4ed8; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
`;

const EmptyState = styled.div`
  text-align: center; padding: 4rem 2rem;
  background: var(--color-background);
  border: 2px dashed var(--color-border);
  border-radius: 1rem;
  h3 { font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin: 0 0 0.5rem 0; }
  p { font-size: 0.9375rem; color: var(--color-text-secondary); margin: 0; }
`;

const Loading = styled.div`
  text-align: center; padding: 4rem 2rem;
  font-size: 1rem; color: var(--color-text-secondary);
`;

// ── Component ────────────────────────────────────────────────────────────────

type FilterType = 'all' | WhitelistStatus;

export const AdminMerchantWhitelistPage: React.FC = () => {
  const { language } = useLanguage();

  const [merchants, setMerchants] = useState<MerchantWhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editModal, setEditModal] = useState<MerchantWhitelistEntry | null>(null);
  const [notification, setNotification] = useState<{ msg: string; ok: boolean } | null>(null);

  // Add form state
  const [addName, setAddName] = useState('');
  const [addStatus, setAddStatus] = useState<WhitelistStatus>('APPROVED');
  const [addReason, setAddReason] = useState('');

  // Edit form state
  const [editStatus, setEditStatus] = useState<WhitelistStatus>('APPROVED');
  const [editReason, setEditReason] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const t = (en: string, bg: string) => language === 'bg' ? bg : en;

  const fetchMerchants = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fraudAdminService.getMerchantWhitelist();
      setMerchants(response?.data ?? []);
    } catch (err) {
      console.error('Failed to fetch merchant whitelist:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMerchants(); }, [fetchMerchants]);

  const notify = (msg: string, ok = true) => {
    setNotification({ msg, ok });
    setTimeout(() => setNotification(null), 3500);
  };

  // ── Filtering & search (client-side) ───────────────────────────────────────

  const filtered = merchants.filter(m => {
    if (filter !== 'all' && m.status !== filter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        m.merchantName.toLowerCase().includes(q) ||
        (m.taxId?.toLowerCase().includes(q)) ||
        (m.reason?.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = {
    total: merchants.length,
    approved: merchants.filter(m => m.status === 'APPROVED').length,
    blocked: merchants.filter(m => m.status === 'BLOCKED').length,
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!addName.trim()) return;
    setSubmitting(true);
    try {
      await fraudAdminService.addMerchant({
        merchantName: addName.trim(),
        status: addStatus,
        reason: addReason.trim() || undefined,
      });
      notify(t('Merchant added', 'Търговецът е добавен'));
      setShowAddModal(false);
      setAddName('');
      setAddStatus('APPROVED');
      setAddReason('');
      fetchMerchants();
    } catch (err: any) {
      notify(err?.response?.data?.message || err?.message || 'Failed', false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditOpen = (m: MerchantWhitelistEntry) => {
    setEditModal(m);
    setEditStatus(m.status);
    setEditReason('');
  };

  const handleEditSave = async () => {
    if (!editModal) return;
    setSubmitting(true);
    try {
      await fraudAdminService.updateMerchantStatus(
        editModal.id,
        editStatus,
        editReason.trim() || undefined,
      );
      notify(t('Status updated', 'Статусът е обновен'));
      setEditModal(null);
      fetchMerchants();
    } catch (err: any) {
      notify(err?.response?.data?.message || err?.message || 'Failed', false);
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      {notification && (
        <div style={{
          position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 2000,
          background: notification.ok ? '#10b981' : '#dc2626',
          color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '0.75rem',
          fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          {notification.msg}
        </div>
      )}

      <PageHeader>
        <Title><ShieldCheck />{t('Merchant Whitelist', 'Списък Търговци')}</Title>
        <HeaderActions>
          <AddButton onClick={() => setShowAddModal(true)}>
            <Plus />{t('Add Merchant', 'Добави търговец')}
          </AddButton>
        </HeaderActions>
      </PageHeader>

      <StatsRow>
        <StatCard $accent="var(--color-border)">
          <StatLabel>{t('Total', 'Общо')}</StatLabel>
          <StatValue>{stats.total}</StatValue>
        </StatCard>
        <StatCard $accent="#10b981">
          <StatLabel>{t('Approved', 'Одобрени')}</StatLabel>
          <StatValue>{stats.approved}</StatValue>
        </StatCard>
        <StatCard $accent="#dc2626">
          <StatLabel>{t('Blocked', 'Блокирани')}</StatLabel>
          <StatValue>{stats.blocked}</StatValue>
        </StatCard>
      </StatsRow>

      <FilterBar>
        {([
          { key: 'all' as FilterType, label: t('All', 'Всички') },
          { key: 'APPROVED' as FilterType, label: t('Approved', 'Одобрени') },
          { key: 'BLOCKED' as FilterType, label: t('Blocked', 'Блокирани') },
          { key: 'PENDING' as FilterType, label: t('Pending', 'Чакащи') },
        ]).map(f => (
          <FilterButton key={f.key} $active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </FilterButton>
        ))}
        <SearchWrapper>
          <Search />
          <SearchInput
            placeholder={t('Search merchants...', 'Търси търговци...')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </SearchWrapper>
      </FilterBar>

      {loading ? (
        <Loading>{t('Loading merchants...', 'Зареждане...')}</Loading>
      ) : filtered.length === 0 ? (
        <EmptyState>
          <h3>{t('No merchants found', 'Няма намерени търговци')}</h3>
          <p>{t('No merchants match the current filter', 'Няма търговци, отговарящи на филтъра')}</p>
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('Merchant Name', 'Име на търговец')}</Th>
              <Th>{t('Status', 'Статус')}</Th>
              <Th>{t('Tax ID', 'ЕИК')}</Th>
              <Th>{t('Reason', 'Причина')}</Th>
              <Th>{t('Date', 'Дата')}</Th>
              <Th>{t('Actions', 'Действия')}</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id}>
                <Td style={{ fontWeight: 600 }}>{m.merchantName}</Td>
                <Td>
                  <StatusBadge $status={m.status}>{m.status}</StatusBadge>
                </Td>
                <Td>{m.taxId || '—'}</Td>
                <Td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.reason || '—'}
                </Td>
                <Td>{fmt(m.createdAt)}</Td>
                <Td>
                  <ActionButton onClick={() => handleEditOpen(m)}>
                    <Edit3 />{t('Edit Status', 'Промени')}
                  </ActionButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {/* ── Add Merchant Modal ─────────────────────────────────────────────── */}
      {showAddModal && (
        <Modal onClick={() => setShowAddModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalTitle>{t('Add Merchant', 'Добави търговец')}</ModalTitle>
            <FormGroup>
              <Label>{t('Merchant Name', 'Име на търговец')}</Label>
              <Input
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder={t('Enter merchant name...', 'Въведете име на търговец...')}
              />
            </FormGroup>
            <FormGroup>
              <Label>{t('Status', 'Статус')}</Label>
              <Select value={addStatus} onChange={e => setAddStatus(e.target.value as WhitelistStatus)}>
                <option value="APPROVED">{t('Approved', 'Одобрен')}</option>
                <option value="BLOCKED">{t('Blocked', 'Блокиран')}</option>
                <option value="PENDING">{t('Pending', 'Чакащ')}</option>
              </Select>
            </FormGroup>
            <FormGroup>
              <Label>{t('Reason', 'Причина')}</Label>
              <Textarea
                value={addReason}
                onChange={e => setAddReason(e.target.value)}
                placeholder={t('Optional reason...', 'Причина (по избор)...')}
              />
            </FormGroup>
            <ModalActions>
              <CancelButton onClick={() => setShowAddModal(false)}>
                {t('Cancel', 'Отказ')}
              </CancelButton>
              <SubmitButton onClick={handleAdd} disabled={!addName.trim() || submitting}>
                {t('Add', 'Добави')}
              </SubmitButton>
            </ModalActions>
          </ModalContent>
        </Modal>
      )}

      {/* ── Edit Status Modal ──────────────────────────────────────────────── */}
      {editModal && (
        <Modal onClick={() => setEditModal(null)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalTitle>
              {t('Edit Status', 'Промяна на статус')}: {editModal.merchantName}
            </ModalTitle>
            <FormGroup>
              <Label>{t('New Status', 'Нов статус')}</Label>
              <Select value={editStatus} onChange={e => setEditStatus(e.target.value as WhitelistStatus)}>
                <option value="APPROVED">{t('Approved', 'Одобрен')}</option>
                <option value="BLOCKED">{t('Blocked', 'Блокиран')}</option>
                <option value="PENDING">{t('Pending', 'Чакащ')}</option>
              </Select>
            </FormGroup>
            <FormGroup>
              <Label>{t('Reason', 'Причина')}</Label>
              <Textarea
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
                placeholder={t('Reason for status change...', 'Причина за промяна на статуса...')}
              />
            </FormGroup>
            <ModalActions>
              <CancelButton onClick={() => setEditModal(null)}>
                {t('Cancel', 'Отказ')}
              </CancelButton>
              <SubmitButton onClick={handleEditSave} disabled={submitting}>
                {t('Save', 'Запази')}
              </SubmitButton>
            </ModalActions>
          </ModalContent>
        </Modal>
      )}
    </PageContainer>
  );
};

export default AdminMerchantWhitelistPage;
