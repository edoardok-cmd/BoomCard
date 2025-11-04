import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate, useParams } from 'react-router-dom';
import { receiptsApiService } from '../services/receipts-api.service';
import { Receipt, ReceiptStatus, ReceiptItem } from '../types/receipt.types';
import {
  ArrowLeft,
  Save,
  Edit2,
  X,
  CheckCircle,
  XCircle,
  Clock,
  Store,
  Calendar,
  DollarSign,
  FileText,
  Package,
  Download,
  Mail,
  FileDown,
} from 'lucide-react';
import {
  exportReceiptToPDF,
  exportReceiptToJSON,
  exportReceiptsToCSV,
  shareReceiptViaEmail,
} from '../utils/receiptExport';
import { exportReceiptWithTemplate, TemplateType } from '../utils/receiptPDFTemplates';

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
      case ReceiptStatus.VALIDATED:
      case ReceiptStatus.CASHBACK_APPLIED:
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

const RawTextSection = styled.div`
  padding: 1.5rem;
  background: #f9fafb;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
`;

const RawText = styled.pre`
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  line-height: 1.6;
  max-height: 300px;
  overflow-y: auto;
`;

const ActionsBar = styled.div`
  display: flex;
  gap: 1rem;
  padding: 1.5rem 2rem;
  border-top: 2px solid #f3f4f6;
  background: #fafafa;
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

const EditForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const FormLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
`;

const FormInput = styled.input`
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;

  &:focus {
    outline: none;
    border-color: #000000;
  }
`;

const FormTextarea = styled.textarea`
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  min-height: 100px;
  font-family: 'Courier New', monospace;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: #000000;
  }
`;

const LoadingSpinner = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  font-size: 1.125rem;
  color: #6b7280;
`;

const ConfidenceBadge = styled.div<{ $confidence: number }>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: ${props => props.$confidence >= 70 ? 'rgba(209, 250, 229, 0.9)' : 'rgba(254, 243, 199, 0.9)'};
  color: ${props => props.$confidence >= 70 ? '#065f46' : '#92400e'};
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
`;

export const ReceiptDetailPage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    totalAmount: '',
    merchantName: '',
    date: '',
    rawText: '',
  });

  const t = {
    en: {
      back: 'Back to Receipts',
      edit: 'Edit Receipt',
      save: 'Save Changes',
      cancel: 'Cancel',
      totalAmount: 'Total Amount',
      date: 'Date',
      confidence: 'OCR Confidence',
      items: 'Receipt Items',
      rawText: 'Raw OCR Text',
      merchantName: 'Merchant Name',
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
      noItems: 'No items detected',
      loading: 'Loading receipt...',
      notFound: 'Receipt not found',
      editMode: 'Edit Mode',
      viewMode: 'View Mode',
      saveSuccess: 'Receipt updated successfully!',
      saveError: 'Failed to update receipt',
      exportPDF: 'Export PDF',
      exportJSON: 'Export JSON',
      shareEmail: 'Share via Email',
    },
    bg: {
      back: 'Назад към бележките',
      edit: 'Редактирай',
      save: 'Запази промените',
      cancel: 'Отказ',
      totalAmount: 'Обща сума',
      date: 'Дата',
      confidence: 'Точност на OCR',
      items: 'Артикули',
      rawText: 'Извлечен текст',
      merchantName: 'Търговец',
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
      noItems: 'Няма открити артикули',
      loading: 'Зареждане на бележка...',
      notFound: 'Бележката не е намерена',
      editMode: 'Режим на редактиране',
      viewMode: 'Режим на преглед',
      saveSuccess: 'Бележката е обновена успешно!',
      saveError: 'Неуспешно обновяване на бележката',
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
      const response = await receiptsApiService.getReceiptById(id!);
      if (response.success) {
        setReceipt(response.data);
        setFormData({
          totalAmount: response.data.totalAmount?.toString() || '',
          merchantName: response.data.merchantName || '',
          date: response.data.date ? new Date(response.data.date).toISOString().split('T')[0] : '',
          rawText: response.data.rawText || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch receipt:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (receipt) {
      setFormData({
        totalAmount: receipt.totalAmount?.toString() || '',
        merchantName: receipt.merchantName || '',
        date: receipt.date ? new Date(receipt.date).toISOString().split('T')[0] : '',
        rawText: receipt.rawText || '',
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    try {
      const response = await receiptsApiService.updateReceipt(id, {
        totalAmount: formData.totalAmount ? parseFloat(formData.totalAmount) : undefined,
        merchantName: formData.merchantName,
        date: formData.date,
        rawText: formData.rawText,
      });

      if (response.success) {
        setReceipt(response.data);
        setIsEditing(false);
        alert(content.saveSuccess);
      }
    } catch (error) {
      console.error('Failed to update receipt:', error);
      alert(content.saveError);
    }
  };

  const getStatusIcon = () => {
    if (!receipt) return null;
    switch (receipt.status) {
      case ReceiptStatus.VALIDATED:
      case ReceiptStatus.CASHBACK_APPLIED:
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
              {isEditing ? (
                <FormInput
                  type="text"
                  value={formData.merchantName}
                  onChange={(e) => setFormData({ ...formData, merchantName: e.target.value })}
                  style={{ color: 'white', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)' }}
                />
              ) : (
                receipt.merchantName || content.unknownMerchant
              )}
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
                {isEditing ? (
                  <FormInput
                    type="number"
                    step="0.01"
                    value={formData.totalAmount}
                    onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                    style={{ color: 'white', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)' }}
                  />
                ) : (
                  receipt.totalAmount !== null && receipt.totalAmount !== undefined
                    ? `${receipt.totalAmount.toFixed(2)} лв`
                    : '-'
                )}
              </InfoValue>
            </InfoItem>

            <InfoItem>
              <InfoLabel>{content.date}</InfoLabel>
              <InfoValue style={{ fontSize: '1.125rem' }}>
                {isEditing ? (
                  <FormInput
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    style={{ color: 'white', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)' }}
                  />
                ) : (
                  formatDate(receipt.date)
                )}
              </InfoValue>
            </InfoItem>

            <InfoItem>
              <InfoLabel>{content.confidence}</InfoLabel>
              <ConfidenceBadge $confidence={receipt.confidence ?? receipt.ocrConfidence}>
                {(receipt.confidence ?? receipt.ocrConfidence).toFixed(0)}%
              </ConfidenceBadge>
            </InfoItem>
          </HeaderInfo>
        </ReceiptHeader>

        <ReceiptBody>
          {receipt.items && receipt.items.length > 0 && (
            <Section>
              <SectionTitle>
                <Package />
                {content.items}
              </SectionTitle>
              <ItemsList>
                {receipt.items.map((item, index) => (
                  <ItemRow key={index}>
                    <ItemName>{item.name}</ItemName>
                    {item.price !== undefined && <ItemPrice>{item.price.toFixed(2)} лв</ItemPrice>}
                  </ItemRow>
                ))}
              </ItemsList>
            </Section>
          )}

          <Section>
            <SectionTitle>
              <FileText />
              {content.rawText}
            </SectionTitle>
            <RawTextSection>
              {isEditing ? (
                <FormTextarea
                  value={formData.rawText}
                  onChange={(e) => setFormData({ ...formData, rawText: e.target.value })}
                />
              ) : (
                <RawText>{receipt.rawText}</RawText>
              )}
            </RawTextSection>
          </Section>
        </ReceiptBody>

        <ActionsBar>
          {receipt.status === ReceiptStatus.PENDING && (
            <>
              {isEditing ? (
                <>
                  <ActionButton $variant="primary" onClick={handleSave}>
                    <Save />
                    {content.save}
                  </ActionButton>
                  <ActionButton $variant="secondary" onClick={handleCancel}>
                    <X />
                    {content.cancel}
                  </ActionButton>
                </>
              ) : (
                <ActionButton $variant="primary" onClick={handleEdit}>
                  <Edit2 />
                  {content.edit}
                </ActionButton>
              )}
            </>
          )}

          {/* Export buttons available for all receipts */}
          {!isEditing && (
            <>
              <ActionButton $variant="secondary" onClick={() => exportReceiptToPDF(receipt)}>
                <FileDown />
                {content.exportPDF}
              </ActionButton>
              <ActionButton $variant="secondary" onClick={() => exportReceiptToJSON(receipt, `receipt-${receipt.id}.json`)}>
                <Download />
                {content.exportJSON}
              </ActionButton>
              <ActionButton $variant="secondary" onClick={() => shareReceiptViaEmail(receipt)}>
                <Mail />
                {content.shareEmail}
              </ActionButton>
            </>
          )}
        </ActionsBar>
      </ReceiptContainer>
    </PageContainer>
  );
};

export default ReceiptDetailPage;
