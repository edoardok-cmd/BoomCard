/**
 * ReceiptDetailPage — partner-facing receipt detail view.
 *
 * Spec §6, §11.3, §11.4, §12 rule 3:
 * - Partners have READ-ONLY access to receipts. Editing is reserved for admin.
 * - Internal fields (OCR confidence, raw OCR text, fraud score, cashback %)
 *   must never be rendered or exported. Uses PartnerReceipt type exclusively.
 * - Export functions operate on PartnerReceipt — no internal fields leak to the
 *   partner's filesystem.
 */

import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate, useParams } from 'react-router-dom';
import { receiptsApiService } from '../services/receipts-api.service';
import { PartnerReceipt, ReceiptStatus } from '../types/receipt.types';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Store,
  Package,
  Download,
  Mail,
  FileDown,
} from 'lucide-react';
import {
  exportPartnerReceiptToPDF,
  exportPartnerReceiptToJSON,
  sharePartnerReceiptViaEmail,
} from '../utils/receiptExport';
// MEDIUM-2 fix (r2t): use the shared currency formatter so amounts are displayed
// correctly during the BGN→EUR transition window and after it (spec §7.3 / Clash 12.1).
import { formatEUR } from '../utils/helpers';

const PageContainer = styled.div`
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: white;
  color: #111827;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 2rem;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const ReceiptContainer = styled.div`
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 1rem;
  overflow: hidden;
`;

const ReceiptHeader = styled.div`
  padding: 2rem;
  border-bottom: 2px solid #f3f4f6;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
`;

const HeaderTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
`;

const MerchantName = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const StatusBadge = styled.div<{ $status: ReceiptStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 9999px;
  font-size: 0.9375rem;
  font-weight: 600;
  background: ${props => {
    switch (props.$status) {
      // BC-QA-031-FOLLOWUP-4: was `case VALIDATED: case CASHBACK_APPLIED:`.
      // Neither status exists in the backend ReceiptStatus enum, so this success
      // branch was unreachable and an APPROVED receipt fell through to the amber
      // `default`. APPROVED is the real granted-cashback terminal state.
      //
      // Which member reaches which branch is pinned by
      // src/sweeps/receipt-status-rendering.sweep.test.tsx, which renders this
      // page once per ReceiptStatus member and reads the badge's computed
      // background, text colour and icon. Deleting this case turns it red.
      case ReceiptStatus.APPROVED:
        return 'rgba(209, 250, 229, 0.9)';
      case ReceiptStatus.REJECTED:
        return 'rgba(254, 226, 226, 0.9)';
      case ReceiptStatus.PENDING:
      default:
        return 'rgba(254, 243, 199, 0.9)';
    }
  }};
  color: ${props => {
    switch (props.$status) {
      case ReceiptStatus.APPROVED:
        return '#065f46';
      case ReceiptStatus.REJECTED:
        return '#991b1b';
      case ReceiptStatus.PENDING:
      default:
        return '#92400e';
    }
  }};
`;

const HeaderInfo = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const InfoLabel = styled.div`
  font-size: 0.875rem;
  opacity: 0.9;
  font-weight: 500;
`;

const InfoValue = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
`;

const ReceiptBody = styled.div`
  padding: 2rem;
`;

const Section = styled.div`
  margin-bottom: 2rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  svg {
    color: #6b7280;
  }
`;

const ItemsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const ItemRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
`;

const ItemName = styled.div`
  flex: 1;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #111827;
`;

const ItemPrice = styled.div`
  font-size: 1.125rem;
  font-weight: 700;
  color: #059669;
`;

const NoItemsText = styled.p`
  font-size: 0.9375rem;
  color: #6b7280;
`;

const ActionsBar = styled.div`
  display: flex;
  gap: 1rem;
  padding: 1.5rem 2rem;
  border-top: 2px solid #f3f4f6;
  background: #fafafa;
  flex-wrap: wrap;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
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
  font-size: 0.9375rem;
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
    width: 18px;
    height: 18px;
  }
`;

const LoadingSpinner = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  font-size: 1.125rem;
  color: #6b7280;
`;

export const ReceiptDetailPage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  // F1: use PartnerReceipt type — no internal fields in state
  const [receipt, setReceipt] = useState<PartnerReceipt | null>(null);
  const [loading, setLoading] = useState(true);

  const t = {
    en: {
      back: 'Back to Receipts',
      totalAmount: 'Total Amount',
      date: 'Date',
      items: 'Receipt Items',
      merchantName: 'Merchant',
      status: {
        [ReceiptStatus.PENDING]: 'Pending Review',
        [ReceiptStatus.PROCESSING]: 'Processing',
        [ReceiptStatus.VALIDATING]: 'Validating',
        [ReceiptStatus.APPROVED]: 'Approved',
        [ReceiptStatus.REJECTED]: 'Rejected',
        [ReceiptStatus.MANUAL_REVIEW]: 'Manual Review',
        [ReceiptStatus.EXPIRED]: 'Expired',
      },
      unknownMerchant: 'Unknown Merchant',
      noItems: 'No items detected',
      loading: 'Loading receipt...',
      notFound: 'Receipt not found',
      exportPDF: 'Export PDF',
      exportJSON: 'Export JSON',
      shareEmail: 'Share via Email',
    },
    bg: {
      back: 'Назад към бележките',
      totalAmount: 'Обща сума',
      date: 'Дата',
      items: 'Артикули',
      merchantName: 'Търговец',
      status: {
        [ReceiptStatus.PENDING]: 'Очаква преглед',
        [ReceiptStatus.PROCESSING]: 'Обработва се',
        [ReceiptStatus.VALIDATING]: 'Валидира се',
        [ReceiptStatus.APPROVED]: 'Одобрен',
        [ReceiptStatus.REJECTED]: 'Отхвърлен',
        [ReceiptStatus.MANUAL_REVIEW]: 'Ръчна проверка',
        [ReceiptStatus.EXPIRED]: 'Изтекъл',
      },
      unknownMerchant: 'Неизвестен търговец',
      noItems: 'Няма открити артикули',
      loading: 'Зареждане на бележка...',
      notFound: 'Бележката не е намерена',
      exportPDF: 'Експорт PDF',
      exportJSON: 'Експорт JSON',
      shareEmail: 'Сподели по имейл',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  useEffect(() => {
    if (id) {
      fetchReceipt();
    }
  }, [id]);

  const fetchReceipt = async () => {
    setLoading(true);
    try {
      // F1: cast the response data to PartnerReceipt — partner-safe fields only.
      // The API endpoint should return only PartnerReceipt fields; the cast
      // ensures our component state never binds internal-only fields.
      const response = await receiptsApiService.getReceiptById(id!);
      if (response.success) {
        // LOW-1 fix (r2t): use typed destructuring instead of `as unknown as
        // Record<string,unknown>`.  response.data is already typed PartnerReceipt
        // by the service call, so the cast was defeating the compile-time guarantee
        // and silently dropping any PartnerReceipt field added in the future.
        // Destructuring the typed value lets the compiler flag shape mismatches.
        const {
          id, transactionId, venueId, totalAmount, merchantName,
          receiptDate, date, items, imageUrl, cashbackAmount,
          status, rejectionReason, createdAt, updatedAt,
        } = response.data;
        setReceipt({
          id, transactionId, venueId, totalAmount, merchantName,
          receiptDate, date, items,
          imageUrl: imageUrl ?? '',
          cashbackAmount: cashbackAmount ?? 0,
          status, rejectionReason, createdAt, updatedAt,
        });
      }
    } catch (error) {
      console.error('Failed to fetch receipt:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = () => {
    if (!receipt) return null;
    switch (receipt.status) {
      // See StatusBadge above (BC-QA-031-FOLLOWUP-4) — APPROVED replaces two
      // statuses the backend never emits.
      case ReceiptStatus.APPROVED:
        return <CheckCircle size={20} />;
      case ReceiptStatus.REJECTED:
        return <XCircle size={20} />;
      case ReceiptStatus.PENDING:
      default:
        return <Clock size={20} />;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <PageContainer>
        <LoadingSpinner>{content.loading}</LoadingSpinner>
      </PageContainer>
    );
  }

  if (!receipt) {
    return (
      <PageContainer>
        <LoadingSpinner>{content.notFound}</LoadingSpinner>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <BackButton onClick={() => navigate('/receipts')}>
        <ArrowLeft />
        {content.back}
      </BackButton>

      <ReceiptContainer>
        <ReceiptHeader>
          <HeaderTop>
            <MerchantName>
              <Store />
              {receipt.merchantName || content.unknownMerchant}
            </MerchantName>
            <StatusBadge $status={receipt.status}>
              {getStatusIcon()}
              {content.status[receipt.status]}
            </StatusBadge>
          </HeaderTop>

          <HeaderInfo>
            <InfoItem>
              <InfoLabel>{content.totalAmount}</InfoLabel>
              <InfoValue>
                {receipt.totalAmount !== null && receipt.totalAmount !== undefined
                  ? formatEUR(receipt.totalAmount)
                  : '-'}
              </InfoValue>
            </InfoItem>

            <InfoItem>
              <InfoLabel>{content.date}</InfoLabel>
              <InfoValue style={{ fontSize: '1.125rem' }}>
                {formatDate(receipt.date ?? receipt.receiptDate)}
              </InfoValue>
            </InfoItem>
            {/* F2: OCR confidence field intentionally absent — internal-only per spec §11.3 */}
          </HeaderInfo>
        </ReceiptHeader>

        <ReceiptBody>
          {/* Receipt items — partner-visible representation of receipt contents */}
          <Section>
            <SectionTitle>
              <Package />
              {content.items}
            </SectionTitle>
            {receipt.items && receipt.items.length > 0 ? (
              <ItemsList>
                {receipt.items.map((item, index) => (
                  <ItemRow key={index}>
                    <ItemName>{item.name}</ItemName>
                    {item.price !== undefined && <ItemPrice>{formatEUR(item.price)}</ItemPrice>}
                  </ItemRow>
                ))}
              </ItemsList>
            ) : (
              <NoItemsText>{content.noItems}</NoItemsText>
            )}
          </Section>
          {/*
           * F3: Raw OCR text section intentionally removed.
           * ocrRawText / rawText is internal-only per spec §11.3.
           * The items list above is the appropriate partner-visible receipt content.
           */}
        </ReceiptBody>

        {/*
         * F6: Edit/save pathway intentionally absent.
         * Spec §6, §11.4, §12 rule 3: partners have read-only access to receipts.
         * Any correction must go through a Change Request via the Help system.
         * Export functions use PartnerReceipt — no internal fields exposed.
         */}
        <ActionsBar>
          <ActionButton $variant="secondary" onClick={() => exportPartnerReceiptToPDF(receipt)}>
            <FileDown />
            {content.exportPDF}
          </ActionButton>
          <ActionButton $variant="secondary" onClick={() => exportPartnerReceiptToJSON(receipt, `receipt-${receipt.id}.json`)}>
            <Download />
            {content.exportJSON}
          </ActionButton>
          <ActionButton $variant="secondary" onClick={() => sharePartnerReceiptViaEmail(receipt)}>
            <Mail />
            {content.shareEmail}
          </ActionButton>
        </ActionsBar>
      </ReceiptContainer>
    </PageContainer>
  );
};

export default ReceiptDetailPage;
