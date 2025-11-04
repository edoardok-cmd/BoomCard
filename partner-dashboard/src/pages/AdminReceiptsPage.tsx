import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { receiptsApiService } from '../services/receipts-api.service';
import { Receipt, ReceiptStatus } from '../types/receipt.types';
import { CheckCircle, XCircle, DollarSign, Eye, FileText, Filter } from 'lucide-react';

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
  color: #111827;
  margin: 0 0 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  svg {
    color: #6b7280;
  }
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: #6b7280;
  margin: 0;
`;

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const StatCard = styled.div`
  background: white;
  padding: 1.5rem;
  border-radius: 1rem;
  border: 2px solid #e5e7eb;
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  font-weight: 600;
  margin-bottom: 0.5rem;
`;

const StatValue = styled.div`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
`;

const FiltersBar = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
`;

const FilterButton = styled.button<{ $active?: boolean }>`
  padding: 0.75rem 1.25rem;
  background: ${props => props.$active ? '#000000' : 'white'};
  color: ${props => props.$active ? 'white' : '#111827'};
  border: 2px solid ${props => props.$active ? '#000000' : '#e5e7eb'};
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`;

const ReceiptsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const ReceiptRow = styled.div`
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 1rem;
  padding: 1.5rem;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr auto;
  gap: 1.5rem;
  align-items: center;
  transition: all 0.2s;

  &:hover {
    border-color: #000000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  @media (max-width: 968px) {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
`;

const ReceiptInfo = styled.div``;

const ReceiptMerchant = styled.div`
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.25rem;
`;

const ReceiptMeta = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
`;

const ReceiptAmount = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  color: #059669;
`;

const ReceiptConfidence = styled.div<{ $confidence: number }>`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.$confidence >= 70 ? '#059669' : props.$confidence >= 50 ? '#f59e0b' : '#dc2626'};
`;

const ReceiptDate = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
`;

const ActionsGroup = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const ActionButton = styled.button<{ $variant?: 'approve' | 'reject' | 'cashback' | 'view' }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: ${props => {
    switch (props.$variant) {
      case 'approve': return '#10b981';
      case 'reject': return '#dc2626';
      case 'cashback': return '#3b82f6';
      case 'view': return 'white';
      default: return '#000000';
    }
  }};
  color: ${props => props.$variant === 'view' ? '#111827' : 'white'};
  border: 2px solid ${props => props.$variant === 'view' ? '#e5e7eb' : 'transparent'};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  max-width: 500px;
  width: 90%;
`;

const ModalTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 1.5rem 0;
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;

  &:focus {
    outline: none;
    border-color: #000000;
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  min-height: 100px;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: #000000;
  }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
`;

const LoadingSpinner = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  font-size: 1.125rem;
  color: #6b7280;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  background: white;
  border: 2px dashed #e5e7eb;
  border-radius: 1rem;

  h3 {
    font-size: 1.25rem;
    font-weight: 700;
    color: #111827;
    margin: 0 0 0.5rem 0;
  }

  p {
    font-size: 0.9375rem;
    color: #6b7280;
    margin: 0;
  }
`;

interface CashbackModal {
  receiptId: string;
  totalAmount: number;
}

export const AdminReceiptsPage: React.FC = () => {
  const { language } = useLanguage();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ReceiptStatus | 'all'>('all');
  const [rejectModal, setRejectModal] = useState<{ receiptId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [cashbackModal, setCashbackModal] = useState<CashbackModal | null>(null);
  const [cashbackAmount, setCashbackAmount] = useState('');

  const t = {
    en: {
      title: 'Receipt Review',
      subtitle: 'Validate and process submitted receipts',
      pending: 'Pending',
      validated: 'Validated',
      rejected: 'Rejected',
      all: 'All',
      approve: 'Approve',
      reject: 'Reject',
      cashback: 'Apply Cashback',
      view: 'View',
      loading: 'Loading receipts...',
      emptyTitle: 'No Receipts',
      emptyDescription: 'No receipts match the current filter',
      rejectTitle: 'Reject Receipt',
      rejectLabel: 'Rejection Reason',
      rejectPlaceholder: 'Enter reason for rejection...',
      cashbackTitle: 'Apply Cashback',
      cashbackLabel: 'Cashback Amount (BGN)',
      cancel: 'Cancel',
      confirm: 'Confirm',
      successApprove: 'Receipt approved',
      successReject: 'Receipt rejected',
      successCashback: 'Cashback applied',
      error: 'Operation failed',
    },
    bg: {
      title: 'Преглед на бележки',
      subtitle: 'Валидиране и обработка на подадени бележки',
      pending: 'Очакващи',
      validated: 'Валидирани',
      rejected: 'Отхвърлени',
      all: 'Всички',
      approve: 'Одобри',
      reject: 'Отхвърли',
      cashback: 'Приложи кешбек',
      view: 'Преглед',
      loading: 'Зареждане...',
      emptyTitle: 'Няма бележки',
      emptyDescription: 'Няма бележки съответстващи на филтъра',
      rejectTitle: 'Отхвърляне на бележка',
      rejectLabel: 'Причина за отхвърляне',
      rejectPlaceholder: 'Въведете причина...',
      cashbackTitle: 'Прилагане на кешбек',
      cashbackLabel: 'Сума кешбек (лв)',
      cancel: 'Отказ',
      confirm: 'Потвърди',
      successApprove: 'Бележката е одобрена',
      successReject: 'Бележката е отхвърлена',
      successCashback: 'Кешбекът е приложен',
      error: 'Грешка при операцията',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  useEffect(() => {
    fetchReceipts();
  }, [statusFilter]);

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const response = await receiptsApiService.getAllReceipts({
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: 100,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      if (response.success) {
        setReceipts(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch receipts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (receiptId: string) => {
    try {
      await receiptsApiService.validateReceipt(receiptId, true);
      alert(content.successApprove);
      fetchReceipts();
    } catch (error) {
      console.error('Failed to approve receipt:', error);
      alert(content.error);
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;

    try {
      await receiptsApiService.validateReceipt(rejectModal.receiptId, false, rejectReason);
      alert(content.successReject);
      setRejectModal(null);
      setRejectReason('');
      fetchReceipts();
    } catch (error) {
      console.error('Failed to reject receipt:', error);
      alert(content.error);
    }
  };

  const handleApplyCashback = async () => {
    if (!cashbackModal || !cashbackAmount) return;

    try {
      await receiptsApiService.applyCashback(cashbackModal.receiptId, parseFloat(cashbackAmount));
      alert(content.successCashback);
      setCashbackModal(null);
      setCashbackAmount('');
      fetchReceipts();
    } catch (error) {
      console.error('Failed to apply cashback:', error);
      alert(content.error);
    }
  };

  const getStats = () => {
    return {
      pending: receipts.filter(r => r.status === ReceiptStatus.PENDING).length,
      validated: receipts.filter(r => r.status === ReceiptStatus.VALIDATED).length,
      rejected: receipts.filter(r => r.status === ReceiptStatus.REJECTED).length,
    };
  };

  const stats = getStats();
  const filteredReceipts = statusFilter === 'all' ? receipts : receipts.filter(r => r.status === statusFilter);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <PageContainer>
      <PageHeader>
        <Title>
          <FileText />
          {content.title}
        </Title>
        <Subtitle>{content.subtitle}</Subtitle>
      </PageHeader>

      <StatsRow>
        <StatCard>
          <StatLabel>{content.pending}</StatLabel>
          <StatValue>{stats.pending}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>{content.validated}</StatLabel>
          <StatValue>{stats.validated}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>{content.rejected}</StatLabel>
          <StatValue>{stats.rejected}</StatValue>
        </StatCard>
      </StatsRow>

      <FiltersBar>
        <FilterButton $active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
          {content.all}
        </FilterButton>
        <FilterButton $active={statusFilter === ReceiptStatus.PENDING} onClick={() => setStatusFilter(ReceiptStatus.PENDING)}>
          {content.pending}
        </FilterButton>
        <FilterButton $active={statusFilter === ReceiptStatus.VALIDATED} onClick={() => setStatusFilter(ReceiptStatus.VALIDATED)}>
          {content.validated}
        </FilterButton>
        <FilterButton $active={statusFilter === ReceiptStatus.REJECTED} onClick={() => setStatusFilter(ReceiptStatus.REJECTED)}>
          {content.rejected}
        </FilterButton>
      </FiltersBar>

      {loading ? (
        <LoadingSpinner>{content.loading}</LoadingSpinner>
      ) : filteredReceipts.length === 0 ? (
        <EmptyState>
          <h3>{content.emptyTitle}</h3>
          <p>{content.emptyDescription}</p>
        </EmptyState>
      ) : (
        <ReceiptsList>
          {filteredReceipts.map((receipt) => (
            <ReceiptRow key={receipt.id}>
              <ReceiptInfo>
                <ReceiptMerchant>{receipt.merchantName || 'Unknown Merchant'}</ReceiptMerchant>
                <ReceiptMeta>
                  {receipt.user?.email} • {formatDate(receipt.createdAt)}
                </ReceiptMeta>
              </ReceiptInfo>

              <ReceiptAmount>
                {receipt.totalAmount !== null && receipt.totalAmount !== undefined
                  ? `${receipt.totalAmount.toFixed(2)} лв`
                  : '-'}
              </ReceiptAmount>

              <ReceiptConfidence $confidence={receipt.confidence ?? receipt.ocrConfidence}>
                {(receipt.confidence ?? receipt.ocrConfidence).toFixed(0)}% confidence
              </ReceiptConfidence>

              <ReceiptDate>
                {receipt.date ? formatDate(receipt.date) : '-'}
              </ReceiptDate>

              <ActionsGroup>
                {receipt.status === ReceiptStatus.PENDING && (
                  <>
                    <ActionButton $variant="approve" onClick={() => handleApprove(receipt.id)}>
                      <CheckCircle />
                      {content.approve}
                    </ActionButton>
                    <ActionButton $variant="reject" onClick={() => setRejectModal({ receiptId: receipt.id })}>
                      <XCircle />
                      {content.reject}
                    </ActionButton>
                  </>
                )}
                {receipt.status === ReceiptStatus.VALIDATED && receipt.totalAmount && (
                  <ActionButton
                    $variant="cashback"
                    onClick={() => setCashbackModal({ receiptId: receipt.id, totalAmount: receipt.totalAmount! })}
                  >
                    <DollarSign />
                    {content.cashback}
                  </ActionButton>
                )}
                <ActionButton $variant="view" onClick={() => window.open(`/receipts/${receipt.id}`, '_blank')}>
                  <Eye />
                  {content.view}
                </ActionButton>
              </ActionsGroup>
            </ReceiptRow>
          ))}
        </ReceiptsList>
      )}

      {rejectModal && (
        <Modal onClick={() => setRejectModal(null)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{content.rejectTitle}</ModalTitle>
            <FormGroup>
              <Label>{content.rejectLabel}</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={content.rejectPlaceholder}
              />
            </FormGroup>
            <ModalActions>
              <ActionButton $variant="view" onClick={() => setRejectModal(null)}>
                {content.cancel}
              </ActionButton>
              <ActionButton $variant="reject" onClick={handleReject} disabled={!rejectReason.trim()}>
                {content.confirm}
              </ActionButton>
            </ModalActions>
          </ModalContent>
        </Modal>
      )}

      {cashbackModal && (
        <Modal onClick={() => setCashbackModal(null)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>{content.cashbackTitle}</ModalTitle>
            <FormGroup>
              <Label>{content.cashbackLabel}</Label>
              <Input
                type="number"
                step="0.01"
                value={cashbackAmount}
                onChange={(e) => setCashbackAmount(e.target.value)}
                placeholder={(cashbackModal.totalAmount * 0.05).toFixed(2)}
              />
            </FormGroup>
            <ModalActions>
              <ActionButton $variant="view" onClick={() => setCashbackModal(null)}>
                {content.cancel}
              </ActionButton>
              <ActionButton $variant="cashback" onClick={handleApplyCashback} disabled={!cashbackAmount}>
                {content.confirm}
              </ActionButton>
            </ModalActions>
          </ModalContent>
        </Modal>
      )}
    </PageContainer>
  );
};

export default AdminReceiptsPage;
