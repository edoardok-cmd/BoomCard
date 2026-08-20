import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { receiptsApiService } from '../services/receipts-api.service';
import { Receipt, ReceiptStatus } from '../types/receipt.types';
import { CheckCircle, XCircle, Eye, FileText, AlertTriangle, Clock, Square, CheckSquare, Loader, Timer } from 'lucide-react';
import FraudReasonTag from '../components/admin/FraudReasonTag';

const PageContainer = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  svg { color: var(--color-text-secondary); }
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin: 0;
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

const FiltersBar = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  align-items: center;
`;

const FilterButton = styled.button<{ $active?: boolean }>`
  padding: 0.625rem 1.125rem;
  background: ${p => p.$active ? '#000' : 'var(--color-background)'};
  color: ${p => p.$active ? '#fff' : 'var(--color-text-primary)'};
  border: 2px solid ${p => p.$active ? '#000' : 'var(--color-border)'};
  border-radius: 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
`;

const ReceiptsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const ReceiptRow = styled.div<{ $selected?: boolean }>`
  background: var(--color-background);
  border: 2px solid ${p => p.$selected ? '#6366f1' : 'var(--color-border)'};
  border-radius: 1rem;
  padding: 1.25rem 1.5rem;
  display: grid;
  grid-template-columns: 2rem 2fr 1fr 1fr 1fr 1fr auto;
  gap: 1rem;
  align-items: center;
  transition: border-color 0.15s;
  &:hover { border-color: ${p => p.$selected ? '#6366f1' : '#000'}; }
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const ReceiptMerchant = styled.div`
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text-primary);
`;

const ReceiptMeta = styled.div`
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.2rem;
`;

const Amount = styled.div`
  font-size: 1.125rem;
  font-weight: 700;
  color: #059669;
`;

const Cashback = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #2563eb;
`;

const FraudScore = styled.div<{ $score: number }>`
  font-size: 0.875rem;
  font-weight: 700;
  color: ${p => p.$score <= 30 ? '#059669' : p.$score <= 60 ? '#d97706' : '#dc2626'};
`;

const StatusBadge = styled.span<{ $status: ReceiptStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: ${p => {
    switch (p.$status) {
      case ReceiptStatus.APPROVED: return '#d1fae5';
      case ReceiptStatus.REJECTED: return '#fee2e2';
      case ReceiptStatus.MANUAL_REVIEW: return '#ede9fe';
      case ReceiptStatus.PENDING: return '#fef3c7';
      case ReceiptStatus.PROCESSING: return '#dbeafe';
      case ReceiptStatus.VALIDATING: return '#e0e7ff';
      case ReceiptStatus.EXPIRED: return '#f3f4f6';
      default: return '#f3f4f6';
    }
  }};
  color: ${p => {
    switch (p.$status) {
      case ReceiptStatus.APPROVED: return '#065f46';
      case ReceiptStatus.REJECTED: return '#991b1b';
      case ReceiptStatus.MANUAL_REVIEW: return '#5b21b6';
      case ReceiptStatus.PENDING: return '#92400e';
      case ReceiptStatus.PROCESSING: return '#1d4ed8';
      case ReceiptStatus.VALIDATING: return '#3730a3';
      case ReceiptStatus.EXPIRED: return '#6b7280';
      default: return '#374151';
    }
  }};
`;

const ActionsGroup = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const ActionButton = styled.button<{ $variant?: 'approve' | 'reject' | 'view' }>`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  background: ${p => {
    switch (p.$variant) {
      case 'approve': return '#10b981';
      case 'reject': return '#dc2626';
      default: return 'var(--color-background)';
    }
  }};
  color: ${p => p.$variant === 'view' ? 'var(--color-text-primary)' : '#fff'};
  border: 2px solid ${p => p.$variant === 'view' ? 'var(--color-border)' : 'transparent'};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  &:hover:not(:disabled) { filter: brightness(1.1); box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  svg { width: 14px; height: 14px; }
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
  &:focus { outline: none; border-color: #000; }
`;

const Textarea = styled.textarea`
  width: 100%; padding: 0.625rem; box-sizing: border-box;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9375rem; min-height: 90px; resize: vertical;
  background: var(--color-background);
  color: var(--color-text-primary);
  &:focus { outline: none; border-color: #000; }
`;

const ModalActions = styled.div`
  display: flex; gap: 0.75rem; justify-content: flex-end;
`;

const ReceiptTableHeader = styled.div`
  display: grid;
  grid-template-columns: 2rem 2fr 1fr 1fr 1fr 1fr auto;
  gap: 1rem;
  align-items: center;
  padding: 0.5rem 1.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  @media (max-width: 900px) { display: none; }
`;

const BulkBar = styled.div`
  position: sticky;
  top: 1rem;
  z-index: 100;
  background: #1e293b;
  color: #fff;
  border-radius: 0.75rem;
  padding: 0.75rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  box-shadow: 0 4px 20px rgba(0,0,0,0.25);
`;

const BulkCount = styled.span`
  font-weight: 700;
  font-size: 0.9375rem;
  flex: 1;
`;

const BulkButton = styled.button<{ $variant: 'approve' | 'reject' | 'clear' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  background: ${p => p.$variant === 'approve' ? '#10b981' : p.$variant === 'reject' ? '#dc2626' : 'rgba(255,255,255,0.15)'};
  color: #fff;
  &:hover { filter: brightness(1.15); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  svg { width: 14px; height: 14px; }
`;

const CheckboxBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  &:hover { color: var(--color-text-primary); }
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

type FilterType = 'all' | ReceiptStatus;

export const AdminReceiptsPage: React.FC = () => {
  const { language } = useLanguage();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [rejectModal, setRejectModal] = useState<{ receiptId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ msg: string; ok: boolean | 'warn' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRejectModal, setBulkRejectModal] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const t = {
    en: {
      title: 'Receipt Review',
      subtitle: 'All receipts require admin review — approve to credit cashback to the user\'s wallet',
      pending: 'Pending', approved: 'Confirmed', rejected: 'Rejected',
      manualReview: 'Needs Review', all: 'All',
      processing: 'Processing', validating: 'Validating', expired: 'Expired',
      approve: 'Confirm', reject: 'Reject', view: 'View Image',
      loading: 'Loading receipts…',
      emptyTitle: 'No Receipts', emptyDesc: 'No receipts match the current filter',
      rejectTitle: 'Reject Receipt',
      rejectLabel: 'Rejection Reason *', rejectPlaceholder: 'Enter reason for rejection…',
      notesLabel: 'Admin Notes', notesPlaceholder: 'Optional internal notes…',
      cancel: 'Cancel', confirm: 'Confirm & Credit',
      statPending: 'Pending', statApproved: 'Confirmed',
      statReview: 'Needs Review', statRejected: 'Rejected',
      // BC-QA-031: receipt.service.ts `formatReceipt()` converts
      // totalAmount/cashbackAmount with bgnToEur() before GET
      // /api/receipts/admin/all responds, so this total is EUR.
      statCashback: 'Cashback Credited (EUR)',
      bulkApprove: 'Bulk Approve', bulkReject: 'Bulk Reject', clearSelection: 'Clear',
      bulkRejectTitle: 'Bulk Reject Receipts',
      bulkSelected: (n: number) => `${n} receipt${n === 1 ? '' : 's'} selected`,
    },
    bg: {
      title: 'Преглед на бележки',
      subtitle: 'Всички бележки изискват одобрение — потвърдете, за да кредитирате кешбек',
      pending: 'Чакащи', approved: 'Потвърдени', rejected: 'Отхвърлени',
      manualReview: 'За преглед', all: 'Всички',
      processing: 'Обработване', validating: 'Валидиране', expired: 'Изтекли',
      approve: 'Потвърди', reject: 'Отхвърли', view: 'Виж снимка',
      loading: 'Зареждане…',
      emptyTitle: 'Няма бележки', emptyDesc: 'Няма намерени бележки',
      rejectTitle: 'Отхвърляне',
      rejectLabel: 'Причина за отхвърляне *', rejectPlaceholder: 'Въведете причина…',
      notesLabel: 'Бележки', notesPlaceholder: 'Вътрешни бележки (по желание)…',
      cancel: 'Отказ', confirm: 'Потвърди и кредитирай',
      statPending: 'Чакащи', statApproved: 'Потвърдени',
      statReview: 'За преглед', statRejected: 'Отхвърлени',
      statCashback: 'Кредитиран кешбек (€)',
      bulkApprove: 'Масово одобрение', bulkReject: 'Масово отхвърляне', clearSelection: 'Изчисти',
      bulkRejectTitle: 'Масово отхвърляне',
      bulkSelected: (n: number) => `${n} бележк${n === 1 ? 'а' : 'и'} избран${n === 1 ? 'а' : 'и'}`,
    },
  };
  const c = language === 'bg' ? t.bg : t.en;

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const apiStatus = filter === 'all'
        ? undefined
        : filter as ReceiptStatus;
      const response = await receiptsApiService.getAllReceipts({
        status: apiStatus,
        limit: 200,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      const data: Receipt[] = response?.data ?? [];
      setReceipts(data);
    } catch (err) {
      console.error('Failed to fetch receipts:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  const notify = (msg: string, ok: boolean | 'warn' = true) => {
    setNotification({ msg, ok });
    setTimeout(() => setNotification(null), ok === 'warn' ? 6000 : 3500);
  };

  const handleApprove = async (receipt: Receipt) => {
    setProcessingId(receipt.id);
    try {
      const opts = { verifiedAmount: receipt.verifiedAmount ?? receipt.totalAmount };
      const result = await receiptsApiService.reviewReceipt(receipt.id, 'APPROVE', opts);
      setSelectedIds(prev => { const next = new Set(prev); next.delete(receipt.id); return next; });
      fetchReceipts();
      if (result?.fraudWarning) {
        notify(`⚠ Approved with fraud warning: ${result.fraudWarning}`, 'warn');
      } else {
        notify(`Approved: ${receipt.merchantName || receipt.id}`);
      }
    } catch (err) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      notify(axiosErr?.response?.data?.message || axiosErr?.message || 'Failed to approve', false);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setProcessingId(rejectModal.receiptId);
    try {
      await receiptsApiService.reviewReceipt(rejectModal.receiptId, 'REJECT', {
        rejectionReason: rejectReason,
        notes: rejectNotes || undefined,
      });
      notify('Receipt rejected');
      setSelectedIds(prev => { const next = new Set(prev); next.delete(rejectModal.receiptId); return next; });
      setRejectModal(null);
      setRejectReason('');
      setRejectNotes('');
      fetchReceipts();
    } catch (err) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      notify(axiosErr?.response?.data?.message || axiosErr?.message || 'Failed to reject', false);
    } finally {
      setProcessingId(null);
    }
  };

  const canAction = (r: Receipt) =>
    r.status === ReceiptStatus.PENDING ||
    r.status === ReceiptStatus.MANUAL_REVIEW;

  const actionableReceipts = receipts.filter(r => canAction(r));
  const allActionableSelected =
    actionableReceipts.length > 0 &&
    actionableReceipts.every(r => selectedIds.has(r.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allActionableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(actionableReceipts.map(r => r.id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const confirmMsg = language === 'bg'
      ? `Одобрете ${ids.length} касов(и) бележк(и)? Това ще кредитира кешбек и не може да се отмени.`
      : `Approve ${ids.length} receipt(s)? This credits cashback and cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    setBulkProcessing(true);
    try {
      await receiptsApiService.bulkApprove(ids);
      notify(`Approved ${ids.length} receipt(s)`);
      setSelectedIds(new Set());
      fetchReceipts();
    } catch (err) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      notify(axiosErr?.response?.data?.message || 'Bulk approve failed', false);
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkRejectConfirm = async () => {
    if (selectedIds.size === 0 || !bulkRejectReason.trim()) return;
    const ids = [...selectedIds];
    setBulkProcessing(true);
    try {
      await receiptsApiService.bulkReject(ids, bulkRejectReason);
      notify(`Rejected ${ids.length} receipt(s)`);
      setSelectedIds(new Set());
      setBulkRejectModal(false);
      setBulkRejectReason('');
      fetchReceipts();
    } catch (err) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      notify(axiosErr?.response?.data?.message || 'Bulk reject failed', false);
    } finally {
      setBulkProcessing(false);
    }
  };

  const stats = {
    pending: receipts.filter(r => r.status === ReceiptStatus.PENDING).length,
    approved: receipts.filter(r => r.status === ReceiptStatus.APPROVED).length,
    rejected: receipts.filter(r => r.status === ReceiptStatus.REJECTED).length,
    review: receipts.filter(r => r.status === ReceiptStatus.MANUAL_REVIEW).length,
    cashback: receipts
      .filter(r => r.status === ReceiptStatus.APPROVED)
      .reduce((sum, r) => sum + (r.cashbackAmount || 0), 0),
  };

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

  return (
    <PageContainer>
      {notification && (
        <div style={{
          position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 2000,
          background: notification.ok === 'warn' ? '#d97706' : notification.ok ? '#10b981' : '#dc2626',
          color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '0.75rem',
          fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          maxWidth: '28rem', lineHeight: 1.4,
        }}>
          {notification.msg}
        </div>
      )}

      <PageHeader>
        <Title><FileText />{c.title}</Title>
        <Subtitle>{c.subtitle}</Subtitle>
      </PageHeader>

      <StatsRow>
        <StatCard $accent="#f59e0b">
          <StatLabel>{c.statPending}</StatLabel>
          <StatValue>{stats.pending}</StatValue>
        </StatCard>
        <StatCard $accent="#8b5cf6">
          <StatLabel>{c.statReview}</StatLabel>
          <StatValue>{stats.review}</StatValue>
        </StatCard>
        <StatCard $accent="#10b981">
          <StatLabel>{c.statApproved}</StatLabel>
          <StatValue>{stats.approved}</StatValue>
        </StatCard>
        <StatCard $accent="#dc2626">
          <StatLabel>{c.statRejected}</StatLabel>
          <StatValue>{stats.rejected}</StatValue>
        </StatCard>
        <StatCard $accent="#2563eb">
          <StatLabel>{c.statCashback}</StatLabel>
          <StatValue>{stats.cashback.toFixed(2)}</StatValue>
        </StatCard>
      </StatsRow>

      <FiltersBar>
        {([
          'all',
          ReceiptStatus.PENDING,
          ReceiptStatus.MANUAL_REVIEW,
          ReceiptStatus.PROCESSING,
          ReceiptStatus.VALIDATING,
          ReceiptStatus.APPROVED,
          ReceiptStatus.REJECTED,
          ReceiptStatus.EXPIRED,
        ] as FilterType[]).map(s => (
          <FilterButton key={s} $active={filter === s} onClick={() => { setFilter(s); setSelectedIds(new Set()); }}>
            {s === 'all' ? c.all
              : s === ReceiptStatus.PENDING ? c.pending
              : s === ReceiptStatus.MANUAL_REVIEW ? c.manualReview
              : s === ReceiptStatus.PROCESSING ? c.processing
              : s === ReceiptStatus.VALIDATING ? c.validating
              : s === ReceiptStatus.APPROVED ? c.approved
              : s === ReceiptStatus.EXPIRED ? c.expired
              : c.rejected}
          </FilterButton>
        ))}
      </FiltersBar>

      {loading ? (
        <Loading>{c.loading}</Loading>
      ) : receipts.length === 0 ? (
        <EmptyState>
          <h3>{c.emptyTitle}</h3>
          <p>{c.emptyDesc}</p>
        </EmptyState>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <BulkBar>
              <BulkCount>{c.bulkSelected(selectedIds.size)}</BulkCount>
              <BulkButton $variant="approve" disabled={bulkProcessing} onClick={handleBulkApprove}>
                {bulkProcessing ? <Loader size={14} /> : <CheckCircle size={14} />}
                {c.bulkApprove}
              </BulkButton>
              <BulkButton $variant="reject" disabled={bulkProcessing} onClick={() => setBulkRejectModal(true)}>
                <XCircle size={14} />{c.bulkReject}
              </BulkButton>
              <BulkButton $variant="clear" disabled={bulkProcessing} onClick={() => setSelectedIds(new Set())}>{c.clearSelection}</BulkButton>
            </BulkBar>
          )}

          {actionableReceipts.length > 0 && (
            <ReceiptTableHeader>
              <CheckboxBtn onClick={toggleSelectAll} title="Select all actionable">
                {allActionableSelected
                  ? <CheckSquare size={16} color="#6366f1" />
                  : <Square size={16} />}
              </CheckboxBtn>
              <span>{language === 'bg' ? 'Бележка' : 'Receipt'}</span>
              <span>{language === 'bg' ? 'Сума' : 'Amount'}</span>
              <span>{language === 'bg' ? 'Кешбек' : 'Cashback'}</span>
              <span>{language === 'bg' ? 'Измама' : 'Fraud'}</span>
              <span>{language === 'bg' ? 'Статус' : 'Status'}</span>
              <span>{language === 'bg' ? 'Действия' : 'Actions'}</span>
            </ReceiptTableHeader>
          )}

          <ReceiptsList>
            {receipts.map(receipt => {
              const isSelected = selectedIds.has(receipt.id);
              const actionable = canAction(receipt);
              return (
                <ReceiptRow key={receipt.id} $selected={isSelected}>
                  <CheckboxBtn
                    onClick={() => actionable && toggleSelect(receipt.id)}
                    style={{ opacity: actionable ? 1 : 0.2, cursor: actionable ? 'pointer' : 'default' }}
                  >
                    {isSelected
                      ? <CheckSquare size={16} color="#6366f1" />
                      : <Square size={16} />}
                  </CheckboxBtn>

                  <div>
                    <ReceiptMerchant>{receipt.merchantName || '—'}</ReceiptMerchant>
                    <ReceiptMeta>
                      {receipt.user?.email} • {fmt(receipt.createdAt)}
                    </ReceiptMeta>
                  </div>

                  {/* BC-QA-031: both scalars arrive already converted to EUR —
                      receipt.service.ts `formatReceipt()` runs bgnToEur() over
                      Receipt.totalAmount and Receipt.cashbackAmount before
                      GET /api/receipts/admin/all responds. */}
                  <Amount>
                    {receipt.totalAmount != null ? `€${receipt.totalAmount.toFixed(2)}` : '—'}
                  </Amount>

                  <Cashback>
                    {receipt.cashbackAmount > 0
                      ? `€${receipt.cashbackAmount.toFixed(2)} (${(receipt.cashbackPercent || 0).toFixed(1)}%)`
                      : '—'}
                  </Cashback>

                  <div>
                    <FraudScore $score={receipt.fraudScore || 0}>
                      {receipt.fraudScore != null ? receipt.fraudScore.toFixed(0) : '—'}
                    </FraudScore>
                    {receipt.fraudReasons && (
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                        {(Array.isArray(receipt.fraudReasons) ? receipt.fraudReasons : [receipt.fraudReasons]).map((reason: string, idx: number) => (
                          <FraudReasonTag key={idx} reason={reason} language={language} />
                        ))}
                      </div>
                    )}
                  </div>

                  <StatusBadge $status={receipt.status}>
                    {receipt.status === ReceiptStatus.MANUAL_REVIEW && <AlertTriangle size={11} />}
                    {receipt.status === ReceiptStatus.PENDING && <Clock size={11} />}
                    {receipt.status === ReceiptStatus.APPROVED && <CheckCircle size={11} />}
                    {receipt.status === ReceiptStatus.REJECTED && <XCircle size={11} />}
                    {receipt.status === ReceiptStatus.PROCESSING && <Loader size={11} />}
                    {receipt.status === ReceiptStatus.VALIDATING && <Loader size={11} />}
                    {receipt.status === ReceiptStatus.EXPIRED && <Timer size={11} />}
                    {receipt.status.replace('_', ' ')}
                  </StatusBadge>

                  <ActionsGroup>
                    {actionable && (
                      <>
                        <ActionButton
                          $variant="approve"
                          disabled={processingId === receipt.id}
                          onClick={() => handleApprove(receipt)}
                        >
                          <CheckCircle />{c.approve}
                        </ActionButton>
                        <ActionButton
                          $variant="reject"
                          disabled={processingId === receipt.id}
                          onClick={() => setRejectModal({ receiptId: receipt.id })}
                        >
                          <XCircle />{c.reject}
                        </ActionButton>
                      </>
                    )}
                    {receipt.imageUrl && (
                      <ActionButton $variant="view" onClick={() => window.open(receipt.imageUrl, '_blank')}>
                        <Eye />{c.view}
                      </ActionButton>
                    )}
                  </ActionsGroup>
                </ReceiptRow>
              );
            })}
          </ReceiptsList>
        </>
      )}

      {rejectModal && (
        <Modal onClick={() => setRejectModal(null)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalTitle>{c.rejectTitle}</ModalTitle>
            <FormGroup>
              <Label>{c.rejectLabel}</Label>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder={c.rejectPlaceholder}
              />
            </FormGroup>
            <FormGroup>
              <Label>{c.notesLabel}</Label>
              <Input
                value={rejectNotes}
                onChange={e => setRejectNotes(e.target.value)}
                placeholder={c.notesPlaceholder}
              />
            </FormGroup>
            <ModalActions>
              <ActionButton $variant="view" onClick={() => setRejectModal(null)}>{c.cancel}</ActionButton>
              <ActionButton
                $variant="reject"
                onClick={handleRejectConfirm}
                disabled={!rejectReason.trim() || processingId !== null}
              >
                {c.confirm}
              </ActionButton>
            </ModalActions>
          </ModalContent>
        </Modal>
      )}
      {bulkRejectModal && (
        <Modal onClick={() => setBulkRejectModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalTitle>{c.bulkRejectTitle} ({selectedIds.size})</ModalTitle>
            <FormGroup>
              <Label>{c.rejectLabel}</Label>
              <Textarea
                value={bulkRejectReason}
                onChange={e => setBulkRejectReason(e.target.value)}
                placeholder={c.rejectPlaceholder}
              />
            </FormGroup>
            <ModalActions>
              <ActionButton $variant="view" onClick={() => setBulkRejectModal(false)}>{c.cancel}</ActionButton>
              <ActionButton
                $variant="reject"
                onClick={handleBulkRejectConfirm}
                disabled={!bulkRejectReason.trim() || bulkProcessing}
              >
                {c.confirm}
              </ActionButton>
            </ModalActions>
          </ModalContent>
        </Modal>
      )}
    </PageContainer>
  );
};

export default AdminReceiptsPage;
