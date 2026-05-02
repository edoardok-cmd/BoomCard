import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { fraudAdminService } from '../services/fraudAdmin.service';
import { apiService } from '../services/api.service';
import { ReceiptTemplate } from '../types/fraud.types';
import { Upload, Trash2, ToggleLeft, ToggleRight, Image, X } from 'lucide-react';

// ─────────────────────── Types ───────────────────────

interface Venue {
  id: string;
  name: string;
  city?: string | null;
  partner?: { id: string; businessName: string } | null;
}

// ─────────────────────── Styled Components ───────────────────────

const PageContainer = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
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
  align-items: center;
`;

const VenueSelector = styled.select`
  padding: 0.625rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9rem;
  color: var(--color-text-primary);
  background: var(--color-background);
  min-width: 260px;
  cursor: pointer;
  transition: border-color 0.15s;
  &:hover { border-color: #667eea; }
  &:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.1); }
`;

const UploadButton = styled.button`
  padding: 0.625rem 1.25rem;
  background: #000;
  color: #fff;
  border: none;
  border-radius: 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.15s;
  &:hover { opacity: 0.85; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  &:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
`;

const TemplateGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  @media (max-width: 1100px) { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 700px)  { grid-template-columns: 1fr; }
`;

const TemplateCard = styled.div`
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: 1rem;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  &:hover { border-color: #667eea; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
`;

const CardImage = styled.div`
  width: 100%;
  height: 200px;
  background: #f3f4f6;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.2s;
  }
  &:hover img { transform: scale(1.03); }
`;

const CardBody = styled.div`
  padding: 1rem 1.25rem;
`;

const MerchantName = styled.div`
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.375rem;
`;

const Description = styled.div`
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-bottom: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const KeywordsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 0.625rem;
`;

const KeywordTag = styled.span`
  padding: 0.2rem 0.5rem;
  background: #eef2ff;
  color: #4338ca;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
`;

const ActiveBadge = styled.span<{ $active: boolean }>`
  display: inline-block;
  padding: 0.2rem 0.625rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  background: ${p => p.$active ? '#dcfce7' : '#f3f4f6'};
  color: ${p => p.$active ? '#15803d' : '#6b7280'};
`;

const MetaRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--color-text-tertiary, #9ca3af);
`;

const HashText = styled.span`
  font-family: monospace;
  font-size: 0.75rem;
  cursor: default;
`;

const CardActions = styled.div`
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--color-border);
`;

const ActionButton = styled.button<{ $danger?: boolean }>`
  flex: 1;
  padding: 0.5rem;
  border: 1px solid ${p => p.$danger ? '#fca5a5' : 'var(--color-border)'};
  border-radius: 0.5rem;
  background: ${p => p.$danger ? '#fef2f2' : 'var(--color-background)'};
  color: ${p => p.$danger ? '#dc2626' : 'var(--color-text-primary)'};
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  transition: all 0.15s;
  &:hover { opacity: 0.8; }
`;

const ModalOverlay = styled.div<{ $open: boolean }>`
  display: ${p => p.$open ? 'flex' : 'none'};
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 2000;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
`;

const ModalContent = styled.div`
  background: var(--color-background);
  border-radius: 1rem;
  max-width: 560px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: 2rem;
  position: relative;
`;

const ModalImageContent = styled.div`
  background: var(--color-background);
  border-radius: 1rem;
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
  padding: 1rem;
  position: relative;
  text-align: center;
  img { max-width: 100%; max-height: 80vh; border-radius: 0.5rem; }
`;

const ModalClose = styled.button`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  &:hover { color: var(--color-text-primary); }
`;

const ModalTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 1.5rem 0;
`;

const FormGroup = styled.div`
  margin-bottom: 1.25rem;
`;

const FormLabel = styled.label`
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.375rem;
`;

const FormInput = styled.input`
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9rem;
  color: var(--color-text-primary);
  background: var(--color-background);
  box-sizing: border-box;
  transition: border-color 0.15s;
  &:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.1); }
`;

const FormTextArea = styled.textarea`
  width: 100%;
  min-height: 80px;
  padding: 0.625rem 0.875rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9rem;
  color: var(--color-text-primary);
  background: var(--color-background);
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.15s;
  &:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.1); }
`;

const FileInput = styled.div`
  border: 2px dashed var(--color-border);
  border-radius: 0.75rem;
  padding: 1.5rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  &:hover { border-color: #667eea; }
  input { display: none; }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
`;

const SubmitButton = styled.button`
  flex: 1;
  padding: 0.75rem;
  background: #000;
  color: #fff;
  border: none;
  border-radius: 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const CancelButton = styled.button`
  flex: 1;
  padding: 0.75rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s;
  &:hover { border-color: #000; }
`;

const DangerButton = styled(SubmitButton)`
  background: #dc2626;
`;

const EmptyState = styled.div`
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: 1rem;
  padding: 4rem 2rem;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 1rem;
  svg { margin-bottom: 1rem; color: var(--color-text-tertiary, #9ca3af); }
`;

const LoadingBox = styled.div`
  display: flex;
  justify-content: center;
  padding: 4rem;
  color: var(--color-text-secondary);
  font-size: 1rem;
`;

// ─────────────────────── Component ───────────────────────

export const AdminReceiptTemplatesPage: React.FC = () => {
  const { language, t } = useLanguage();

  // Venues
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState('');

  // Templates
  const [templates, setTemplates] = useState<ReceiptTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReceiptTemplate | null>(null);

  // Upload form
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMerchant, setUploadMerchant] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadKeywords, setUploadKeywords] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load venues on mount ──
  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const res = await apiService.get<{ data: Venue[] }>('/admin/venues', { limit: 200 });
        setVenues(res.data ?? []);
      } catch (err) {
        console.error('Failed to load venues:', err);
        toast.error(t('common.error'));
      }
    };
    fetchVenues();
  }, []);

  // ── Load templates when venue changes ──
  useEffect(() => {
    if (!selectedVenueId) {
      setTemplates([]);
      return;
    }
    const fetchTemplates = async () => {
      setLoading(true);
      try {
        const res = await fraudAdminService.getTemplates(selectedVenueId);
        if (res.success) setTemplates(res.data);
      } catch (err) {
        console.error('Failed to load templates:', err);
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTemplates();
  }, [selectedVenueId]);

  // ── Toggle active/inactive ──
  const handleToggle = async (tpl: ReceiptTemplate) => {
    try {
      const res = await fraudAdminService.updateTemplate(selectedVenueId, tpl.id, {
        isActive: !tpl.isActive,
      });
      if (res.success) {
        setTemplates(prev => prev.map(t => t.id === tpl.id ? res.data : t));
      }
    } catch (err) {
      console.error('Failed to toggle template:', err);
      toast.error(t('common.error'));
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!selectedTemplate) return;
    try {
      await fraudAdminService.deleteTemplate(selectedVenueId, selectedTemplate.id);
      setTemplates(prev => prev.filter(t => t.id !== selectedTemplate.id));
      setShowDeleteModal(false);
      setSelectedTemplate(null);
    } catch (err) {
      console.error('Failed to delete template:', err);
      toast.error(t('common.error'));
    }
  };

  // ── Upload ──
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadMerchant.trim() || !selectedVenueId) return;

    const formData = new FormData();
    formData.append('image', uploadFile);
    formData.append('merchantName', uploadMerchant.trim());
    if (uploadDescription.trim()) {
      formData.append('description', uploadDescription.trim());
    }
    const keywords = uploadKeywords
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);
    formData.append('expectedKeywords', JSON.stringify(keywords));

    setUploading(true);
    try {
      const res = await fraudAdminService.createTemplate(selectedVenueId, formData);
      if (res.success) {
        setTemplates(prev => [res.data, ...prev]);
        resetUploadForm();
        setShowUploadModal(false);
      }
    } catch (err) {
      console.error('Failed to upload template:', err);
    } finally {
      setUploading(false);
    }
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadMerchant('');
    setUploadDescription('');
    setUploadKeywords('');
  };

  const openImagePreview = (tpl: ReceiptTemplate) => {
    setSelectedTemplate(tpl);
    setShowImageModal(true);
  };

  const openDeleteConfirm = (tpl: ReceiptTemplate) => {
    setSelectedTemplate(tpl);
    setShowDeleteModal(true);
  };

  // ─────────────────────── Render ───────────────────────

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader>
        <Title>
          <Image size={28} />
          {language === 'bg' ? 'Шаблони за Бележки' : 'Receipt Templates'}
        </Title>
        <HeaderActions>
          <VenueSelector
            value={selectedVenueId}
            onChange={e => setSelectedVenueId(e.target.value)}
          >
            <option value="">
              {language === 'bg' ? '-- Изберете обект --' : '-- Select venue --'}
            </option>
            {venues.map(v => (
              <option key={v.id} value={v.id}>{v.partner?.businessName ? `${v.partner.businessName} — ${v.name}` : v.name}{v.city ? `, ${v.city}` : ''}</option>
            ))}
          </VenueSelector>
          <UploadButton
            disabled={!selectedVenueId}
            onClick={() => setShowUploadModal(true)}
          >
            <Upload size={16} />
            {language === 'bg' ? 'Качи шаблон' : 'Upload Template'}
          </UploadButton>
        </HeaderActions>
      </PageHeader>

      {/* Content */}
      {!selectedVenueId ? (
        <EmptyState>
          <Image size={48} />
          <div>{language === 'bg' ? 'Изберете обект първо' : 'Select a venue first'}</div>
        </EmptyState>
      ) : loading ? (
        <LoadingBox>
          {language === 'bg' ? 'Зареждане...' : 'Loading...'}
        </LoadingBox>
      ) : templates.length === 0 ? (
        <EmptyState>
          <Image size={48} />
          <div>
            {language === 'bg'
              ? 'Няма шаблони за този обект'
              : 'No templates for this venue'}
          </div>
        </EmptyState>
      ) : (
        <TemplateGrid>
          {templates.map(tpl => (
            <TemplateCard key={tpl.id}>
              <CardImage onClick={() => openImagePreview(tpl)}>
                <img src={tpl.imageUrl} alt={tpl.merchantName} />
              </CardImage>
              <CardBody>
                <MerchantName>{tpl.merchantName}</MerchantName>
                {tpl.description && <Description title={tpl.description}>{tpl.description}</Description>}
                {tpl.expectedKeywords.length > 0 && (
                  <KeywordsRow>
                    {tpl.expectedKeywords.map((kw, i) => (
                      <KeywordTag key={i}>{kw}</KeywordTag>
                    ))}
                  </KeywordsRow>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <ActiveBadge $active={tpl.isActive}>
                    {tpl.isActive
                      ? (language === 'bg' ? 'Активен' : 'Active')
                      : (language === 'bg' ? 'Неактивен' : 'Inactive')}
                  </ActiveBadge>
                  <HashText title={tpl.perceptualHash}>
                    {tpl.perceptualHash.slice(0, 12)}...
                  </HashText>
                </div>
                <MetaRow>
                  <span>{new Date(tpl.createdAt).toLocaleDateString()}</span>
                </MetaRow>
              </CardBody>
              <CardActions>
                <ActionButton onClick={() => handleToggle(tpl)}>
                  {tpl.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                  {tpl.isActive
                    ? (language === 'bg' ? 'Деактивирай' : 'Deactivate')
                    : (language === 'bg' ? 'Активирай' : 'Activate')}
                </ActionButton>
                <ActionButton $danger onClick={() => openDeleteConfirm(tpl)}>
                  <Trash2 size={14} />
                  {language === 'bg' ? 'Изтрий' : 'Delete'}
                </ActionButton>
              </CardActions>
            </TemplateCard>
          ))}
        </TemplateGrid>
      )}

      {/* ── Upload Template Modal ── */}
      <ModalOverlay $open={showUploadModal} onClick={() => setShowUploadModal(false)}>
        <ModalContent onClick={e => e.stopPropagation()}>
          <ModalClose onClick={() => setShowUploadModal(false)}><X size={20} /></ModalClose>
          <ModalTitle>
            {language === 'bg' ? 'Качване на шаблон' : 'Upload Template'}
          </ModalTitle>
          <form onSubmit={handleUpload}>
            <FormGroup>
              <FormLabel>
                {language === 'bg' ? 'Изображение *' : 'Image *'}
              </FormLabel>
              <FileInput onClick={() => fileRef.current?.click()}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                />
                {uploadFile
                  ? uploadFile.name
                  : (language === 'bg' ? 'Натиснете за избор на файл' : 'Click to select file')}
              </FileInput>
            </FormGroup>

            <FormGroup>
              <FormLabel>
                {language === 'bg' ? 'Име на търговец *' : 'Merchant Name *'}
              </FormLabel>
              <FormInput
                type="text"
                value={uploadMerchant}
                onChange={e => setUploadMerchant(e.target.value)}
                placeholder={language === 'bg' ? 'напр. Ресторант Астория' : 'e.g. Restaurant Astoria'}
                required
              />
            </FormGroup>

            <FormGroup>
              <FormLabel>
                {language === 'bg' ? 'Вариации' : 'Variations'}
              </FormLabel>
              <FormTextArea
                value={uploadDescription}
                onChange={e => setUploadDescription(e.target.value)}
                placeholder={language === 'bg' ? 'Незадължителни вариации...' : 'Optional variations...'}
              />
            </FormGroup>

            <FormGroup>
              <FormLabel>
                {language === 'bg' ? 'Очаквани ключови думи (разделени със запетая)' : 'Expected Keywords (comma-separated)'}
              </FormLabel>
              <FormInput
                type="text"
                value={uploadKeywords}
                onChange={e => setUploadKeywords(e.target.value)}
                placeholder={language === 'bg' ? 'напр. КАСОВА БЕЛЕЖКА, ДДС, БУЛСТАТ' : 'e.g. RECEIPT, VAT, TOTAL'}
              />
            </FormGroup>

            <ModalActions>
              <SubmitButton type="submit" disabled={uploading || !uploadFile || !uploadMerchant.trim()}>
                {uploading
                  ? (language === 'bg' ? 'Качване...' : 'Uploading...')
                  : (language === 'bg' ? 'Качи' : 'Upload')}
              </SubmitButton>
              <CancelButton type="button" onClick={() => { setShowUploadModal(false); resetUploadForm(); }}>
                {language === 'bg' ? 'Отказ' : 'Cancel'}
              </CancelButton>
            </ModalActions>
          </form>
        </ModalContent>
      </ModalOverlay>

      {/* ── Image Preview Modal ── */}
      <ModalOverlay $open={showImageModal} onClick={() => setShowImageModal(false)}>
        <ModalImageContent onClick={e => e.stopPropagation()}>
          <ModalClose onClick={() => setShowImageModal(false)}><X size={20} /></ModalClose>
          {selectedTemplate && (
            <img src={selectedTemplate.imageUrl} alt={selectedTemplate.merchantName} />
          )}
        </ModalImageContent>
      </ModalOverlay>

      {/* ── Delete Confirmation Modal ── */}
      <ModalOverlay $open={showDeleteModal} onClick={() => setShowDeleteModal(false)}>
        <ModalContent onClick={e => e.stopPropagation()}>
          <ModalClose onClick={() => setShowDeleteModal(false)}><X size={20} /></ModalClose>
          <ModalTitle>
            {language === 'bg' ? 'Потвърждение за изтриване' : 'Confirm Delete'}
          </ModalTitle>
          <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 1rem' }}>
            {language === 'bg'
              ? `Сигурни ли сте, че искате да изтриете шаблона "${selectedTemplate?.merchantName}"?`
              : `Are you sure you want to delete the template "${selectedTemplate?.merchantName}"?`}
          </p>
          <ModalActions>
            <DangerButton onClick={handleDelete}>
              {language === 'bg' ? 'Изтрий' : 'Delete'}
            </DangerButton>
            <CancelButton onClick={() => { setShowDeleteModal(false); setSelectedTemplate(null); }}>
              {language === 'bg' ? 'Отказ' : 'Cancel'}
            </CancelButton>
          </ModalActions>
        </ModalContent>
      </ModalOverlay>
    </PageContainer>
  );
};

export default AdminReceiptTemplatesPage;
