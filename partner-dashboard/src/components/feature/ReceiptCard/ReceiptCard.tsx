import React from 'react';
import styled from 'styled-components';
import { useLanguage } from '../../../contexts/LanguageContext';
import { Receipt, ReceiptStatus } from '../../../types/receipt.types';
import { CheckCircle, XCircle, Clock, DollarSign, Store, Calendar, Eye, Edit2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ReceiptCardProps {
  receipt: Receipt;
  onDelete?: (id: string) => void;
  showActions?: boolean;
}

const Card = styled.div`
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 1rem;
  padding: 1.5rem;
  transition: all 0.2s;
  cursor: pointer;

  &:hover {
    border-color: #000000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #f3f4f6;
`;

const MerchantInfo = styled.div`
  flex: 1;
`;

const MerchantName = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  svg {
    color: #6b7280;
  }
`;

const ReceiptDate = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const StatusBadge = styled.div<{ $status: ReceiptStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
  background: ${props => {
    switch (props.$status) {
      case ReceiptStatus.VALIDATED:
      case ReceiptStatus.CASHBACK_APPLIED:
        return '#d1fae5';
      case ReceiptStatus.REJECTED:
        return '#fee2e2';
      case ReceiptStatus.PENDING:
      default:
        return '#fef3c7';
    }
  }};
  color: ${props => {
    switch (props.$status) {
      case ReceiptStatus.VALIDATED:
      case ReceiptStatus.CASHBACK_APPLIED:
        return '#065f46';
      case ReceiptStatus.REJECTED:
        return '#991b1b';
      case ReceiptStatus.PENDING:
      default:
        return '#92400e';
    }
  }};

  svg {
    width: 16px;
    height: 16px;
  }
`;

const CardBody = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const InfoLabel = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const InfoValue = styled.div`
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
`;

const AmountValue = styled(InfoValue)`
  font-size: 1.5rem;
  color: #059669;
`;

const ConfidenceBar = styled.div`
  margin-top: 1rem;
`;

const ConfidenceLabel = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $confidence: number }>`
  width: ${props => props.$confidence}%;
  height: 100%;
  background: ${props => props.$confidence >= 70 ? '#10b981' : props.$confidence >= 50 ? '#f59e0b' : '#ef4444'};
  transition: width 0.3s ease;
`;

const CardActions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 2px solid #f3f4f6;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: ${props =>
    props.$variant === 'primary' ? '#000000' :
    props.$variant === 'danger' ? '#dc2626' :
    'white'
  };
  color: ${props =>
    props.$variant === 'primary' || props.$variant === 'danger' ? 'white' : '#111827'
  };
  border: 2px solid ${props =>
    props.$variant === 'primary' ? '#000000' :
    props.$variant === 'danger' ? '#dc2626' :
    '#d1d5db'
  };
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

export const ReceiptCard: React.FC<ReceiptCardProps> = ({
  receipt,
  onDelete,
  showActions = true
}) => {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const t = {
    en: {
      totalAmount: 'Total Amount',
      confidence: 'OCR Confidence',
      status: {
        [ReceiptStatus.PENDING]: 'Pending Review',
        [ReceiptStatus.PROCESSING]: 'Processing',
        [ReceiptStatus.VALIDATING]: 'Validating',
        [ReceiptStatus.VALIDATED]: 'Validated',
        [ReceiptStatus.APPROVED]: 'Approved',
        [ReceiptStatus.REJECTED]: 'Rejected',
        [ReceiptStatus.MANUAL_REVIEW]: 'Manual Review',
        [ReceiptStatus.CASHBACK_APPLIED]: 'Cashback Applied',
        [ReceiptStatus.EXPIRED]: 'Expired',
      },
      unknownMerchant: 'Unknown Merchant',
      view: 'View',
      edit: 'Edit',
      delete: 'Delete',
      createdOn: 'Uploaded',
    },
    bg: {
      totalAmount: 'Обща сума',
      confidence: 'Точност на OCR',
      status: {
        [ReceiptStatus.PENDING]: 'Очаква преглед',
        [ReceiptStatus.PROCESSING]: 'Обработва се',
        [ReceiptStatus.VALIDATING]: 'Валидира се',
        [ReceiptStatus.VALIDATED]: 'Валидиран',
        [ReceiptStatus.APPROVED]: 'Одобрен',
        [ReceiptStatus.REJECTED]: 'Отхвърлен',
        [ReceiptStatus.MANUAL_REVIEW]: 'Ръчна проверка',
        [ReceiptStatus.CASHBACK_APPLIED]: 'Кешбек приложен',
        [ReceiptStatus.EXPIRED]: 'Изтекъл',
      },
      unknownMerchant: 'Неизвестен търговец',
      view: 'Преглед',
      edit: 'Редактиране',
      delete: 'Изтриване',
      createdOn: 'Качен',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  const getStatusIcon = () => {
    switch (receipt.status) {
      case ReceiptStatus.VALIDATED:
      case ReceiptStatus.CASHBACK_APPLIED:
        return <CheckCircle />;
      case ReceiptStatus.REJECTED:
        return <XCircle />;
      case ReceiptStatus.PENDING:
      default:
        return <Clock />;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/receipts/${receipt.id}`);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/receipts/${receipt.id}/edit`);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && window.confirm(language === 'bg' ? 'Сигурни ли сте?' : 'Are you sure?')) {
      onDelete(receipt.id);
    }
  };

  return (
    <Card onClick={handleView}>
      <CardHeader>
        <MerchantInfo>
          <MerchantName>
            <Store size={20} />
            {receipt.merchantName || content.unknownMerchant}
          </MerchantName>
          <ReceiptDate>
            <Calendar size={14} />
            {receipt.date ? formatDate(receipt.date) : formatDate(receipt.createdAt)}
          </ReceiptDate>
        </MerchantInfo>
        <StatusBadge $status={receipt.status}>
          {getStatusIcon()}
          {content.status[receipt.status]}
        </StatusBadge>
      </CardHeader>

      <CardBody>
        {receipt.totalAmount !== null && receipt.totalAmount !== undefined && (
          <InfoItem>
            <InfoLabel>{content.totalAmount}</InfoLabel>
            <AmountValue>{receipt.totalAmount.toFixed(2)} лв</AmountValue>
          </InfoItem>
        )}

        <InfoItem>
          <InfoLabel>{content.createdOn}</InfoLabel>
          <InfoValue style={{ fontSize: '0.875rem' }}>{formatDate(receipt.createdAt)}</InfoValue>
        </InfoItem>
      </CardBody>

      <ConfidenceBar>
        <ConfidenceLabel>
          <span>{content.confidence}</span>
          <span>{(receipt.confidence ?? receipt.ocrConfidence).toFixed(0)}%</span>
        </ConfidenceLabel>
        <ProgressBar>
          <ProgressFill $confidence={receipt.confidence ?? receipt.ocrConfidence} />
        </ProgressBar>
      </ConfidenceBar>

      {showActions && (
        <CardActions>
          <ActionButton $variant="primary" onClick={handleView}>
            <Eye />
            {content.view}
          </ActionButton>
          {receipt.status === ReceiptStatus.PENDING && (
            <ActionButton $variant="secondary" onClick={handleEdit}>
              <Edit2 />
              {content.edit}
            </ActionButton>
          )}
          {(receipt.status === ReceiptStatus.PENDING || receipt.status === ReceiptStatus.REJECTED) && (
            <ActionButton $variant="danger" onClick={handleDelete}>
              <Trash2 />
              {content.delete}
            </ActionButton>
          )}
        </CardActions>
      )}
    </Card>
  );
};

export default ReceiptCard;
