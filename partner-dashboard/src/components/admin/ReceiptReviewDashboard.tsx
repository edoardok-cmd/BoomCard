import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { receiptService, Receipt, ReceiptStatus, AdminReviewRequest } from '../../services/receipt.service';
import { useLanguage } from '../../contexts/LanguageContext';
import { CheckCircle, XCircle, AlertTriangle, Eye, Filter, Download } from 'lucide-react';
import toast from 'react-hot-toast';

// Styled Components
const DashboardContainer = styled.div`
  padding: 2rem;
  max-width: 1600px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
`;

const Stats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
`;

const StatCard = styled.div<{ $variant: 'pending' | 'approved' | 'rejected' | 'flagged' }>`
  padding: 1.5rem;
  border-radius: 0.75rem;
  background: ${props => {
    switch (props.$variant) {
      case 'pending': return 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)';
      case 'approved': return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      case 'rejected': return 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      case 'flagged': return 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
    }
  }};
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  opacity: 0.9;
  margin-bottom: 0.5rem;
`;

const StatValue = styled.div`
  font-size: 2rem;
  font-weight: 700;
`;

const FilterBar = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
`;

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 2px solid ${props => props.$active ? '#000' : '#e5e7eb'};
  background: ${props => props.$active ? '#000' : 'white'};
  color: ${props => props.$active ? 'white' : '#6b7280'};
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #000;
    transform: translateY(-1px);
  }
`;

const ActionButton = styled.button<{ $variant?: 'approve' | 'reject' }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
  border: none;
  background: ${props => {
    if (props.$variant === 'approve') return '#10b981';
    if (props.$variant === 'reject') return '#ef4444';
    return '#6b7280';
  }};
  color: white;
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
    transform: none;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const BulkActions = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
`;

const ReceiptList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const ReceiptCard = styled.div<{ $selected: boolean }>`
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 1.5rem;
  padding: 1.5rem;
  background: white;
  border: 2px solid ${props => props.$selected ? '#000' : '#e5e7eb'};
  border-radius: 0.75rem;
  transition: all 0.2s;

  &:hover {
    border-color: #000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }
`;

const Checkbox = styled.input`
  width: 20px;
  height: 20px;
  cursor: pointer;
`;

const ReceiptImage = styled.img`
  width: 150px;
  height: 150px;
  object-fit: cover;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.05);
  }
`;

const ReceiptInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const ReceiptHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: start;
`;

const MerchantName = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
`;

const StatusBadge = styled.div<{ $status: ReceiptStatus }>`
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
  background: ${props => {
    switch (props.$status) {
      case ReceiptStatus.PENDING: return '#fef3c7';
      case ReceiptStatus.APPROVED: return '#d1fae5';
      case ReceiptStatus.REJECTED: return '#fee2e2';
      case ReceiptStatus.MANUAL_REVIEW: return '#fed7aa';
      default: return '#f3f4f6';
    }
  }};
  color: ${props => {
    switch (props.$status) {
      case ReceiptStatus.PENDING: return '#92400e';
      case ReceiptStatus.APPROVED: return '#065f46';
      case ReceiptStatus.REJECTED: return '#991b1b';
      case ReceiptStatus.MANUAL_REVIEW: return '#9a3412';
      default: return '#1f2937';
    }
  }};
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
`;

const InfoItem = styled.div``;

const InfoLabel = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.25rem;
`;

const InfoValue = styled.div`
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
`;

const FraudScore = styled.div<{ $score: number }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 0.5rem;
  background: ${props => props.$score > 60 ? '#fee2e2' : props.$score > 30 ? '#fed7aa' : '#d1fae5'};
  color: ${props => props.$score > 60 ? '#991b1b' : props.$score > 30 ? '#9a3412' : '#065f46'};
  font-weight: 600;
`;

const FraudReasons = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
`;

const FraudTag = styled.span`
  padding: 0.25rem 0.5rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 0.25rem;
  font-size: 0.75rem;
`;

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  justify-content: center;
`;

const Modal = styled.div<{ $show: boolean }>`
  display: ${props => props.$show ? 'flex' : 'none'};
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.75);
  z-index: 1000;
  align-items: center;
  justify-content: center;
  padding: 2rem;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 1rem;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 2rem;
`;

const ModalImage = styled.img`
  width: 100%;
  border-radius: 0.5rem;
`;

const ModalActions = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-family: inherit;
  resize: vertical;
  min-height: 100px;
  margin-top: 1rem;

  &:focus {
    outline: none;
    border-color: #000;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: #000;
  }
`;

export const ReceiptReviewDashboard: React.FC = () => {
  const { language } = useLanguage();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [filter, setFilter] = useState<ReceiptStatus | 'ALL'>(ReceiptStatus.MANUAL_REVIEW);
  const [selectedReceipts, setSelectedReceipts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [verifiedAmount, setVerifiedAmount] = useState('');
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    flagged: 0,
  });

  const t = {
    en: {
      title: 'Receipt Review Dashboard',
      stats: {
        pending: 'Pending',
        approved: 'Approved',
        rejected: 'Rejected',
        flagged: 'Flagged',
      },
      filters: {
        all: 'All',
        manual: 'Manual Review',
        pending: 'Pending',
        approved: 'Approved',
        rejected: 'Rejected',
      },
      bulk: {
        selected: 'selected',
        approveAll: 'Approve All',
        rejectAll: 'Reject All',
      },
      receipt: {
        merchant: 'Merchant',
        amount: 'Amount',
        date: 'Date',
        cashback: 'Cashback',
        confidence: 'OCR Confidence',
        fraudScore: 'Fraud Score',
        submittedBy: 'Submitted By',
        view: 'View',
        approve: 'Approve',
        reject: 'Reject',
      },
      modal: {
        verifiedAmount: 'Verified Amount',
        notes: 'Review Notes',
        approve: 'Approve',
        reject: 'Reject',
        cancel: 'Cancel',
      },
    },
    bg: {
      title: 'Панел за проверка на касови бележки',
      stats: {
        pending: 'Изчакващи',
        approved: 'Одобрени',
        rejected: 'Отхвърлени',
        flagged: 'Маркирани',
      },
      filters: {
        all: 'Всички',
        manual: 'Ръчна проверка',
        pending: 'Изчакващи',
        approved: 'Одобрени',
        rejected: 'Отхвърлени',
      },
      bulk: {
        selected: 'избрани',
        approveAll: 'Одобри всички',
        rejectAll: 'Отхвърли всички',
      },
      receipt: {
        merchant: 'Търговец',
        amount: 'Сума',
        date: 'Дата',
        cashback: 'Кешбек',
        confidence: 'Увереност OCR',
        fraudScore: 'Риск',
        submittedBy: 'Подадена от',
        view: 'Преглед',
        approve: 'Одобри',
        reject: 'Отхвърли',
      },
      modal: {
        verifiedAmount: 'Потвърдена сума',
        notes: 'Бележки',
        approve: 'Одобри',
        reject: 'Отхвърли',
        cancel: 'Отказ',
      },
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  useEffect(() => {
    loadReceipts();
  }, [filter]);

  const loadReceipts = async () => {
    setLoading(true);
    try {
      const filters = filter === 'ALL' ? {} : { status: filter as ReceiptStatus };
      const data = await receiptService.getUserReceipts(filters);
      setReceipts(data);

      // Calculate stats
      const newStats = {
        pending: data.filter(r => r.status === ReceiptStatus.PENDING).length,
        approved: data.filter(r => r.status === ReceiptStatus.APPROVED).length,
        rejected: data.filter(r => r.status === ReceiptStatus.REJECTED).length,
        flagged: data.filter(r => r.status === ReceiptStatus.MANUAL_REVIEW).length,
      };
      setStats(newStats);
    } catch (error) {
      console.error('Error loading receipts:', error);
      toast.error('Failed to load receipts');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (receiptId: string, action: 'APPROVE' | 'REJECT') => {
    try {
      const request: AdminReviewRequest = {
        receiptId,
        action,
        verifiedAmount: verifiedAmount ? parseFloat(verifiedAmount) : undefined,
        notes: reviewNotes || undefined,
      };

      await receiptService.reviewReceipt(request);
      toast.success(`Receipt ${action.toLowerCase()}d successfully`);
      setSelectedReceipt(null);
      setReviewNotes('');
      setVerifiedAmount('');
      loadReceipts();
    } catch (error) {
      console.error('Error reviewing receipt:', error);
      toast.error('Failed to review receipt');
    }
  };

  const handleBulkApprove = async () => {
    if (selectedReceipts.size === 0) return;

    try {
      const result = await receiptService.bulkApprove(Array.from(selectedReceipts));
      toast.success(`Approved ${result.approved} receipts`);
      setSelectedReceipts(new Set());
      loadReceipts();
    } catch (error) {
      console.error('Error bulk approving:', error);
      toast.error('Failed to bulk approve');
    }
  };

  const handleBulkReject = async () => {
    if (selectedReceipts.size === 0) return;

    const reason = prompt('Rejection reason:');
    if (!reason) return;

    try {
      const result = await receiptService.bulkReject(Array.from(selectedReceipts), reason);
      toast.success(`Rejected ${result.rejected} receipts`);
      setSelectedReceipts(new Set());
      loadReceipts();
    } catch (error) {
      console.error('Error bulk rejecting:', error);
      toast.error('Failed to bulk reject');
    }
  };

  const toggleSelection = (receiptId: string) => {
    const newSelection = new Set(selectedReceipts);
    if (newSelection.has(receiptId)) {
      newSelection.delete(receiptId);
    } else {
      newSelection.add(receiptId);
    }
    setSelectedReceipts(newSelection);
  };

  return (
    <DashboardContainer>
      <Header>
        <Title>{content.title}</Title>
      </Header>

      <Stats>
        <StatCard $variant="pending">
          <StatLabel>{content.stats.pending}</StatLabel>
          <StatValue>{stats.pending}</StatValue>
        </StatCard>
        <StatCard $variant="approved">
          <StatLabel>{content.stats.approved}</StatLabel>
          <StatValue>{stats.approved}</StatValue>
        </StatCard>
        <StatCard $variant="rejected">
          <StatLabel>{content.stats.rejected}</StatLabel>
          <StatValue>{stats.rejected}</StatValue>
        </StatCard>
        <StatCard $variant="flagged">
          <StatLabel>{content.stats.flagged}</StatLabel>
          <StatValue>{stats.flagged}</StatValue>
        </StatCard>
      </Stats>

      <FilterBar>
        <FilterButton $active={filter === 'ALL'} onClick={() => setFilter('ALL')}>
          {content.filters.all}
        </FilterButton>
        <FilterButton $active={filter === ReceiptStatus.MANUAL_REVIEW} onClick={() => setFilter(ReceiptStatus.MANUAL_REVIEW)}>
          {content.filters.manual}
        </FilterButton>
        <FilterButton $active={filter === ReceiptStatus.PENDING} onClick={() => setFilter(ReceiptStatus.PENDING)}>
          {content.filters.pending}
        </FilterButton>
        <FilterButton $active={filter === ReceiptStatus.APPROVED} onClick={() => setFilter(ReceiptStatus.APPROVED)}>
          {content.filters.approved}
        </FilterButton>
        <FilterButton $active={filter === ReceiptStatus.REJECTED} onClick={() => setFilter(ReceiptStatus.REJECTED)}>
          {content.filters.rejected}
        </FilterButton>
      </FilterBar>

      {selectedReceipts.size > 0 && (
        <BulkActions>
          <span>{selectedReceipts.size} {content.bulk.selected}</span>
          <ActionButton $variant="approve" onClick={handleBulkApprove}>
            {content.bulk.approveAll}
          </ActionButton>
          <ActionButton $variant="reject" onClick={handleBulkReject}>
            {content.bulk.rejectAll}
          </ActionButton>
        </BulkActions>
      )}

      <ReceiptList>
        {receipts.map(receipt => (
          <ReceiptCard key={receipt.id} $selected={selectedReceipts.has(receipt.id)}>
            <Checkbox
              type="checkbox"
              checked={selectedReceipts.has(receipt.id)}
              onChange={() => toggleSelection(receipt.id)}
            />

            <ReceiptImage
              src={receipt.imageUrl}
              alt="Receipt"
              onClick={() => setSelectedReceipt(receipt)}
            />

            <ReceiptInfo>
              <ReceiptHeader>
                <MerchantName>{receipt.merchantName || 'Unknown Merchant'}</MerchantName>
                <StatusBadge $status={receipt.status}>{receipt.status}</StatusBadge>
              </ReceiptHeader>

              <InfoGrid>
                <InfoItem>
                  <InfoLabel>{content.receipt.amount}</InfoLabel>
                  <InfoValue>{receipt.totalAmount?.toFixed(2) || '-'} BGN</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>{content.receipt.cashback}</InfoLabel>
                  <InfoValue>{receipt.cashbackAmount.toFixed(2)} BGN</InfoValue>
                </InfoItem>
                <InfoItem>
                  <InfoLabel>{content.receipt.confidence}</InfoLabel>
                  <InfoValue>{receipt.ocrConfidence.toFixed(0)}%</InfoValue>
                </InfoItem>
              </InfoGrid>

              <FraudScore $score={receipt.fraudScore}>
                <AlertTriangle size={16} />
                {content.receipt.fraudScore}: {receipt.fraudScore.toFixed(0)}
              </FraudScore>

              {receipt.fraudReasons && (
                <FraudReasons>
                  {(Array.isArray(receipt.fraudReasons) ? receipt.fraudReasons : [receipt.fraudReasons]).map((reason: string, idx: number) => (
                    <FraudTag key={idx}>{reason}</FraudTag>
                  ))}
                </FraudReasons>
              )}
            </ReceiptInfo>

            <Actions>
              <ActionButton onClick={() => setSelectedReceipt(receipt)}>
                <Eye size={16} />
                {content.receipt.view}
              </ActionButton>
              <ActionButton $variant="approve" onClick={() => handleReview(receipt.id, 'APPROVE')}>
                <CheckCircle size={16} />
                {content.receipt.approve}
              </ActionButton>
              <ActionButton $variant="reject" onClick={() => handleReview(receipt.id, 'REJECT')}>
                <XCircle size={16} />
                {content.receipt.reject}
              </ActionButton>
            </Actions>
          </ReceiptCard>
        ))}
      </ReceiptList>

      <Modal $show={selectedReceipt !== null} onClick={() => setSelectedReceipt(null)}>
        <ModalContent onClick={(e) => e.stopPropagation()}>
          {selectedReceipt && (
            <>
              <ModalImage src={selectedReceipt.imageUrl} alt="Receipt" />

              <div style={{ marginTop: '1rem' }}>
                <InfoLabel>{content.modal.verifiedAmount}</InfoLabel>
                <Input
                  type="number"
                  step="0.01"
                  value={verifiedAmount}
                  onChange={(e) => setVerifiedAmount(e.target.value)}
                  placeholder={selectedReceipt.totalAmount?.toString() || ''}
                />
              </div>

              <div>
                <InfoLabel>{content.modal.notes}</InfoLabel>
                <TextArea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add review notes..."
                />
              </div>

              <ModalActions>
                <ActionButton $variant="approve" onClick={() => handleReview(selectedReceipt.id, 'APPROVE')}>
                  <CheckCircle size={16} />
                  {content.modal.approve}
                </ActionButton>
                <ActionButton $variant="reject" onClick={() => handleReview(selectedReceipt.id, 'REJECT')}>
                  <XCircle size={16} />
                  {content.modal.reject}
                </ActionButton>
                <ActionButton onClick={() => setSelectedReceipt(null)}>
                  {content.modal.cancel}
                </ActionButton>
              </ModalActions>
            </>
          )}
        </ModalContent>
      </Modal>
    </DashboardContainer>
  );
};

export default ReceiptReviewDashboard;
