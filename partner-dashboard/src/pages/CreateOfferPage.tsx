import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Upload, X, Check, ArrowLeft, ArrowRight, AlertTriangle } from 'lucide-react';
import Button from '../components/common/Button/Button';
import { offersService } from '../services/offers.service';
import { apiService } from '../services/api.service';
import { DISCOUNT_STEPS } from '../utils/discountSteps';

/**
 * SPEC §8a — UNSPECIFIED FEATURE
 * Offer and menu management is NOT defined in the BoomCard partner spec
 * (07-partner-spec-extracted.md §8a). This page must not be accessible in
 * production without an approved product specification.
 *
 * Gate: set VITE_OFFER_MANAGEMENT_ENABLED=true to unlock this page in
 * non-production environments only.
 */
const OFFER_MANAGEMENT_ENABLED = import.meta.env.VITE_OFFER_MANAGEMENT_ENABLED === 'true';

const content = {
  en: {
    title: 'Create New Offer',
    step1: 'Basic Information',
    step2: 'Details & Images',
    step3: 'Terms & Preview',
    offerTitle: 'Offer Title',
    offerTitlePlaceholder: 'e.g., 20% Off All Main Courses',
    category: 'Category',
    selectCategory: 'Select a category',
    discount: 'Discount Percentage',
    description: 'Description',
    descriptionPlaceholder: 'Describe your offer in detail...',
    validFrom: 'Valid From',
    validUntil: 'Valid Until',
    maxRedemptions: 'Max Redemptions',
    maxRedemptionsPlaceholder: 'Leave empty for unlimited',
    terms: 'Terms & Conditions',
    termsPlaceholder: 'Enter terms and conditions...',
    uploadImages: 'Upload Images',
    dragDrop: 'Drag & drop images here, or click to select',
    supportedFormats: 'Supported: JPG, PNG, WebP (Max 5MB each)',
    preview: 'Preview',
    back: 'Back',
    next: 'Next',
    submit: 'Create Offer',
    cancel: 'Cancel',
    required: 'This field is required',
    invalidDate: 'End date must be after start date',
    success: 'Offer created successfully!',
    error: 'Failed to create offer. Please try again.',
    categories: {
      restaurants: 'Restaurants',
      hotels: 'Hotels',
      spas: 'Spas & Wellness',
      entertainment: 'Entertainment',
      sports: 'Sports & Fitness',
      beauty: 'Beauty & Hair',
      shopping: 'Shopping',
      travel: 'Travel & Tourism',
    },
  },
  bg: {
    title: 'Създаване на Нова Отстъпка',
    step1: 'Основна Информация',
    step2: 'Детайли и Снимки',
    step3: 'Условия и Преглед',
    offerTitle: 'Заглавие на Отстъпката',
    offerTitlePlaceholder: 'напр., 20% Отстъпка на Всички Основни Ястия',
    category: 'Категория',
    selectCategory: 'Изберете категория',
    discount: 'Процент Отстъпка',
    description: 'Описание',
    descriptionPlaceholder: 'Опишете отстъпката си подробно...',
    validFrom: 'Валидна От',
    validUntil: 'Валидна До',
    maxRedemptions: 'Макс. Използвания',
    maxRedemptionsPlaceholder: 'Оставете празно за неограничен',
    terms: 'Условия',
    termsPlaceholder: 'Въведете условията...',
    uploadImages: 'Качване на Снимки',
    dragDrop: 'Пуснете снимки тук или кликнете за избор',
    supportedFormats: 'Поддържани: JPG, PNG, WebP (Макс 5MB всяка)',
    preview: 'Преглед',
    back: 'Назад',
    next: 'Напред',
    submit: 'Създай Отстъпка',
    cancel: 'Отказ',
    required: 'Това поле е задължително',
    invalidDate: 'Крайната дата трябва да е след началната',
    success: 'Отстъпката е създадена успешно!',
    error: 'Неуспешно създаване. Моля опитайте отново.',
    categories: {
      restaurants: 'Ресторанти',
      hotels: 'Хотели',
      spas: 'СПА и Уелнес',
      entertainment: 'Забавления',
      sports: 'Спорт и Фитнес',
      beauty: 'Красота и Коса',
      shopping: 'Пазаруване',
      travel: 'Пътувания и Туризъм',
    },
  },
};

interface OfferFormData {
  title: string;
  category: string;
  discount: string;
  description: string;
  validFrom: string;
  validUntil: string;
  maxRedemptions: string;
  terms: string;
  images: File[];
}

const CreateOfferPage: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = content[language as keyof typeof content];
  // LOW-3 fix (r2u): isInactive is technically unreachable because App.tsx wraps
  // this route with <PartnerStatusRoute allowedStatuses={['Active']}>, which
  // redirects Inactive partners to /dashboard?status=inactive before this component
  // renders. The check is kept as defence-in-depth — it prevents button interaction
  // for edge-case sessions where the status gate is bypassed (e.g. stale React Query
  // cache) — but developers must NOT assume it provides primary enforcement.
  const { user } = useAuth();
  const isInactive = user?.partner_account_status === 'Inactive';

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);

  // LOW-1 fix: track object URLs so they can be revoked when images are removed
  // or the component unmounts, preventing memory leaks from repeated add/remove.
  const objectUrlsRef = React.useRef<Map<File, string>>(new Map());

  // Fetch the logged-in user's partner ID on mount
  useEffect(() => {
    apiService.get<{ success: boolean; data: { id: string } }>('/partners/me')
      .then(res => setPartnerId(res.data?.id ?? null))
      .catch(() => setPartnerId(null));
  }, []);

  // LOW-1 fix: revoke all tracked object URLs on unmount to prevent memory leaks.
  useEffect(() => {
    const urlMap = objectUrlsRef.current;
    return () => {
      urlMap.forEach(url => URL.revokeObjectURL(url));
      urlMap.clear();
    };
  }, []);

  const [formData, setFormData] = useState<OfferFormData>({
    title: '',
    category: '',
    discount: '',
    description: '',
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: '',
    maxRedemptions: '',
    terms: '',
    images: [],
  });

  const [errors, setErrors] = useState<Partial<Record<keyof OfferFormData, string>>>({});
  const [isDragging, setIsDragging] = useState(false);

  const handleInputChange = (field: keyof OfferFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<Record<keyof OfferFormData, string>> = {};

    if (step === 1) {
      if (!formData.title.trim()) newErrors.title = t.required;
      if (!formData.category) newErrors.category = t.required;
      if (!formData.discount) newErrors.discount = t.required;
    }

    if (step === 2) {
      if (!formData.description.trim()) newErrors.description = t.required;
      if (!formData.validFrom) newErrors.validFrom = t.required;
      if (!formData.validUntil) newErrors.validUntil = t.required;
      // LOW-1 fix (r2u): use Date objects so the comparison is explicit and
      // remains correct if the input format ever changes from ISO YYYY-MM-DD.
      if (formData.validFrom && formData.validUntil &&
          new Date(formData.validFrom) >= new Date(formData.validUntil)) {
        newErrors.validUntil = t.invalidDate;
      }
      // LOW-2 fix (r2u): reject offers backdated before today — a partner
      // could otherwise inflate apparent offer duration.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (formData.validFrom && new Date(formData.validFrom) < today) {
        newErrors.validFrom = language === 'bg'
          ? 'Началната дата не може да е в миналото'
          : 'Start date cannot be in the past';
      }
    }

    if (step === 3) {
      if (!formData.terms.trim()) newErrors.terms = t.required;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 3));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleImageUpload = (files: FileList | null) => {
    if (!files) return;

    const allFiles = Array.from(files);
    const validFiles = allFiles.filter(file => {
      const isValidType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB
      return isValidType && isValidSize;
    });

    const rejected = allFiles.length - validFiles.length;
    if (rejected > 0) {
      toast.error(
        language === 'bg'
          ? `${rejected} файл(а) са отхвърлени. Само JPG, PNG, WebP до 5MB.`
          : `${rejected} file(s) rejected. Only JPG, PNG, WebP up to 5MB allowed.`
      );
    }

    setFormData(prev => {
      const next = [...prev.images, ...validFiles].slice(0, 5);
      if (prev.images.length < 5 && next.length === 5 && validFiles.length > 0) {
        toast(language === 'bg' ? 'Максимум 5 снимки.' : 'Maximum 5 images allowed.', { icon: 'ℹ️' });
      }
      return { ...prev, images: next };
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleImageUpload(e.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    setFormData(prev => {
      // LOW-1 fix: revoke the object URL for the removed file to free memory.
      const file = prev.images[index];
      if (file) {
        const url = objectUrlsRef.current.get(file);
        if (url) {
          URL.revokeObjectURL(url);
          objectUrlsRef.current.delete(file);
        }
      }
      return { ...prev, images: prev.images.filter((_, i) => i !== index) };
    });
  };

  const handleSubmit = async () => {
    // MEDIUM-2 fix: validate all three steps before submitting, not just step 3.
    // handleNext validates each step during navigation, but a programmatic call to
    // handleSubmit (or future UI changes) could bypass those checks.
    // We collect errors across all steps in a single pass to avoid setErrors
    // being called three times in sequence (each call would overwrite the prior).
    const allErrors: Partial<Record<keyof OfferFormData, string>> = {};
    // Step 1
    if (!formData.title.trim()) allErrors.title = t.required;
    if (!formData.category) allErrors.category = t.required;
    if (!formData.discount) allErrors.discount = t.required;
    // Step 2
    if (!formData.description.trim()) allErrors.description = t.required;
    if (!formData.validFrom) allErrors.validFrom = t.required;
    if (!formData.validUntil) allErrors.validUntil = t.required;
    // LOW-1 fix (r2u): explicit Date comparison
    if (formData.validFrom && formData.validUntil &&
        new Date(formData.validFrom) >= new Date(formData.validUntil)) {
      allErrors.validUntil = t.invalidDate;
    }
    // LOW (backstop gap fix): mirror the step-2 backdated-start-date rule here.
    // validateStep(2) rejects a validFrom before today, but the consolidated
    // re-validation previously omitted it — so a programmatic/bypassed submit
    // could slip a backdated offer through. Re-check it so this defence-in-depth
    // path genuinely covers every rule the step-by-step path enforces.
    {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (formData.validFrom && new Date(formData.validFrom) < today) {
        allErrors.validFrom = language === 'bg'
          ? 'Началната дата не може да е в миналото'
          : 'Start date cannot be in the past';
      }
    }
    // Step 3
    if (!formData.terms.trim()) allErrors.terms = t.required;
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      return;
    }
    if (!partnerId) {
      toast.error(language === 'bg' ? 'Партньорският профил не е намерен.' : 'Partner profile not found.');
      return;
    }

    // LOW-2 fix: reject negative or zero maxRedemptions before sending to backend.
    const maxRedemptionsInt = formData.maxRedemptions ? parseInt(formData.maxRedemptions, 10) : undefined;
    if (maxRedemptionsInt !== undefined && (isNaN(maxRedemptionsInt) || maxRedemptionsInt < 1)) {
      toast.error(language === 'bg' ? 'Максималният брой използвания трябва да е поне 1.' : 'Max redemptions must be at least 1.');
      return;
    }

    // LOW-2 / MEDIUM-2 fix: also add radix to parseInt for discount.
    const discountInt = parseInt(formData.discount, 10);
    if (isNaN(discountInt)) {
      toast.error(language === 'bg' ? 'Изберете валидна отстъпка.' : 'Please select a valid discount.');
      return;
    }

    setIsSubmitting(true);
    try {
      const offer = await offersService.createOffer({
        partnerId,
        title: formData.title,
        description: formData.description,
        // MEDIUM-2 fix (review r2u): include category in the payload.
        // Previously this field was validated and previewed but silently dropped,
        // causing offers to be created without a category regardless of selection.
        category: formData.category,
        type: 'DISCOUNT',
        discountPercent: discountInt,
        startDate: formData.validFrom,
        endDate: formData.validUntil,
        usageLimit: maxRedemptionsInt,
        termsConditions: formData.terms,
        status: 'ACTIVE',
      });

      // Upload images sequentially after offer creation
      for (const file of formData.images) {
        try {
          await offersService.uploadOfferImage(offer.id, file);
        } catch {
          // Non-blocking: offer is created; warn about image failure
          toast.error(language === 'bg' ? 'Снимката не беше качена.' : 'Image upload failed — offer saved without image.');
        }
      }

      toast.success(t.success);
      navigate('/partners/offers');
    } catch {
      toast.error(t.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <StepIndicator>
      {[1, 2, 3].map(step => (
        <Step key={step} active={step === currentStep} completed={step < currentStep}>
          <StepNumber active={step === currentStep} completed={step < currentStep}>
            {step < currentStep ? <Check size={20} /> : step}
          </StepNumber>
          <StepLabel active={step === currentStep} completed={step < currentStep}>
            {step === 1 && t.step1}
            {step === 2 && t.step2}
            {step === 3 && t.step3}
          </StepLabel>
        </Step>
      ))}
    </StepIndicator>
  );

  const renderStep1 = () => (
    <StepContent
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <FormGroup>
        <Label>{t.offerTitle}</Label>
        {/* MEDIUM-1 fix (review r2u): add maxLength so unbounded strings cannot
            be submitted to the database if backend authorization is ever restored. */}
        <Input
          type="text"
          value={formData.title}
          onChange={e => handleInputChange('title', e.target.value)}
          placeholder={t.offerTitlePlaceholder}
          maxLength={200}
          error={!!errors.title}
        />
        {errors.title && <ErrorText>{errors.title}</ErrorText>}
      </FormGroup>

      <FormRow>
        <FormGroup>
          <Label>{t.category}</Label>
          <Select
            value={formData.category}
            onChange={e => handleInputChange('category', e.target.value)}
            error={!!errors.category}
          >
            <option value="">{t.selectCategory}</option>
            {Object.entries(t.categories).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          {errors.category && <ErrorText>{errors.category}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>{t.discount}</Label>
          <Select
            value={formData.discount}
            onChange={e => handleInputChange('discount', e.target.value)}
            error={!!errors.discount}
          >
            <option value="">—</option>
            {DISCOUNT_STEPS.map(s => (
              <option key={s} value={s}>{s}%</option>
            ))}
          </Select>
          {errors.discount && <ErrorText>{errors.discount}</ErrorText>}
        </FormGroup>
      </FormRow>
    </StepContent>
  );

  const renderStep2 = () => (
    <StepContent
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <FormGroup>
        <Label>{t.description}</Label>
        {/* MEDIUM-1 fix (review r2u): maxLength to prevent unbounded string submissions. */}
        <TextArea
          value={formData.description}
          onChange={e => handleInputChange('description', e.target.value)}
          placeholder={t.descriptionPlaceholder}
          rows={5}
          maxLength={2000}
          error={!!errors.description}
        />
        {errors.description && <ErrorText>{errors.description}</ErrorText>}
      </FormGroup>

      <FormRow>
        <FormGroup>
          <Label>{t.validFrom}</Label>
          <Input
            type="date"
            value={formData.validFrom}
            onChange={e => handleInputChange('validFrom', e.target.value)}
            error={!!errors.validFrom}
          />
          {errors.validFrom && <ErrorText>{errors.validFrom}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>{t.validUntil}</Label>
          <Input
            type="date"
            value={formData.validUntil}
            onChange={e => handleInputChange('validUntil', e.target.value)}
            error={!!errors.validUntil}
          />
          {errors.validUntil && <ErrorText>{errors.validUntil}</ErrorText>}
        </FormGroup>
      </FormRow>

      <FormGroup>
        <Label>{t.maxRedemptions}</Label>
        <Input
          type="number"
          min="1"
          value={formData.maxRedemptions}
          onChange={e => handleInputChange('maxRedemptions', e.target.value)}
          placeholder={t.maxRedemptionsPlaceholder}
        />
      </FormGroup>

      <FormGroup>
        <Label>{t.uploadImages}</Label>
        <UploadZone
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          isDragging={isDragging}
        >
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={e => handleImageUpload(e.target.files)}
            style={{ display: 'none' }}
            id="image-upload"
          />
          <label htmlFor="image-upload" style={{ cursor: 'pointer', textAlign: 'center' }}>
            <Upload size={32} style={{ margin: '0 auto 1rem' }} />
            <p>{t.dragDrop}</p>
            <small>{t.supportedFormats}</small>
          </label>
        </UploadZone>

        {formData.images.length > 0 && (
          <ImagePreviewGrid>
            {formData.images.map((file, index) => {
              // LOW-2 fix: use a stable key derived from file identity instead of
              // array index, so removing an image from the middle of the list does
              // not cause React to reuse DOM nodes for the wrong file.
              const stableKey = `${file.name}-${file.size}-${file.lastModified}`;
              return (
              <ImagePreview key={stableKey}>
                {/* LOW-1 fix: reuse cached object URL to avoid creating a new
                    one on every render and leaking the previous one. */}
                <img
                  src={(() => {
                    if (!objectUrlsRef.current.has(file)) {
                      objectUrlsRef.current.set(file, URL.createObjectURL(file));
                    }
                    return objectUrlsRef.current.get(file)!;
                  })()}
                  alt={`Preview ${index + 1}`}
                />
                <RemoveButton onClick={() => removeImage(index)}>
                  <X size={16} />
                </RemoveButton>
              </ImagePreview>
              );
            })}
          </ImagePreviewGrid>
        )}
      </FormGroup>
    </StepContent>
  );

  const renderStep3 = () => (
    <StepContent
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <FormGroup>
        <Label>{t.terms}</Label>
        {/* MEDIUM-1 fix (review r2u): maxLength to prevent unbounded string submissions. */}
        <TextArea
          value={formData.terms}
          onChange={e => handleInputChange('terms', e.target.value)}
          placeholder={t.termsPlaceholder}
          rows={6}
          maxLength={5000}
          error={!!errors.terms}
        />
        {errors.terms && <ErrorText>{errors.terms}</ErrorText>}
      </FormGroup>

      <PreviewSection>
        <PreviewTitle>{t.preview}</PreviewTitle>
        <PreviewCard>
          <PreviewHeader>
            <h3>{formData.title || 'Offer Title'}</h3>
            <DiscountBadge>{formData.discount || '0'}% OFF</DiscountBadge>
          </PreviewHeader>
          <PreviewCategory>
            {formData.category ? t.categories[formData.category as keyof typeof t.categories] : 'Category'}
          </PreviewCategory>
          <PreviewDescription>{formData.description || 'Description will appear here'}</PreviewDescription>
          <PreviewDates>
            Valid: {formData.validFrom} - {formData.validUntil || 'End date'}
          </PreviewDates>
          {formData.maxRedemptions && (
            <PreviewMax>Max {formData.maxRedemptions} redemptions</PreviewMax>
          )}
        </PreviewCard>
      </PreviewSection>
    </StepContent>
  );

  if (!OFFER_MANAGEMENT_ENABLED) {
    return (
      <Container>
        <SpecBlockBanner>
          <AlertTriangle size={24} />
          <div>
            <SpecBlockTitle>
              {language === 'bg'
                ? 'Функцията не е налична'
                : 'Feature not available'}
            </SpecBlockTitle>
            <SpecBlockDesc>
              {language === 'bg'
                ? 'Управлението на отстъпки е в очакване на продуктова спецификация (spec §8a). Свържете се с продуктовия екип преди активиране.'
                : 'This feature is pending product specification (spec §8a). Contact the product team before enabling.'}
            </SpecBlockDesc>
          </div>
        </SpecBlockBanner>
      </Container>
    );
  }

  return (
    <Container>
      {/* Spec §8a warning banner — always visible while OFFER_MANAGEMENT_ENABLED is true */}
      <SpecWarningBanner>
        <AlertTriangle size={18} />
        <SpecWarningText>
          {language === 'bg'
            ? 'Тази функция е в очакване на продуктова спецификация (spec §8a). Свържете се с продуктовия екип преди активиране.'
            : 'This feature is pending product specification (spec §8a). Contact the product team before enabling.'}
        </SpecWarningText>
      </SpecWarningBanner>

      <Header>
        <BackButton onClick={() => navigate('/partners/offers')}>
          <ArrowLeft size={20} />
        </BackButton>
        <Title>{t.title}</Title>
      </Header>

      {renderStepIndicator()}

      <FormContainer>
        <AnimatePresence mode="wait">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </AnimatePresence>
      </FormContainer>

      <Actions>
        <Button variant="secondary" onClick={() => navigate('/partners/offers')}>
          {t.cancel}
        </Button>
        <ActionButtons>
          {currentStep > 1 && (
            <Button variant="secondary" onClick={handleBack}>
              <ArrowLeft size={18} /> {t.back}
            </Button>
          )}
          {currentStep < 3 ? (
            // MEDIUM-2 fix (r2u): Inactive partners have read-only access (§5.1, §11.2).
            // Disable Next on steps 1 and 2 so the UX accurately conveys read-only from start.
            <Button onClick={handleNext} disabled={isInactive}>
              {t.next} <ArrowRight size={18} />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting || isInactive}>
              <Check size={18} /> {isSubmitting ? '...' : t.submit}
            </Button>
          )}
        </ActionButtons>
      </Actions>
    </Container>
  );
};

const Container = styled.div`
  max-width: 1000px;
  margin: 0 auto;
  padding: 3rem 2rem;
  min-height: 100vh;
  background: linear-gradient(to bottom, #f9fafb 0%, #ffffff 100%);

  @media (max-width: 768px) {
    padding: 2rem 1rem;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 3rem;
  padding-bottom: 2rem;
  border-bottom: 2px solid #e5e7eb;
`;

const BackButton = styled.button`
  background: #ffffff;
  border: 2px solid #e5e7eb;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  &:hover {
    background: #111827;
    border-color: #111827;
    color: white;
    transform: translateX(-4px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
`;

const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #111827 0%, #374151 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.02em;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const StepIndicator = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 3rem;
  position: relative;
  padding: 0 2rem;

  &::before {
    content: '';
    position: absolute;
    top: 24px;
    left: calc(2rem + 24px);
    right: calc(2rem + 24px);
    height: 3px;
    background: linear-gradient(to right, #e5e7eb 0%, #e5e7eb 100%);
    z-index: 0;
    border-radius: 10px;
  }

  @media (max-width: 768px) {
    padding: 0 1rem;
  }
`;

const Step = styled.div<{ active: boolean; completed: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  position: relative;
  z-index: 1;
  flex: 1;
`;

const StepNumber = styled.div<{ active?: boolean; completed?: boolean }>`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: ${props =>
    props.completed
      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
      : props.active
      ? 'linear-gradient(135deg, #111827 0%, #374151 100%)'
      : '#f3f4f6'};
  color: ${props => (props.completed || props.active ? 'white' : '#9ca3af')};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.125rem;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: ${props =>
    props.completed || props.active ? '0 4px 12px rgba(0, 0, 0, 0.15)' : 'none'};
  border: 3px solid ${props => (props.completed || props.active ? 'white' : '#e5e7eb')};

  ${Step}:hover & {
    transform: scale(1.05);
  }
`;

const StepLabel = styled.span<{ active?: boolean; completed?: boolean }>`
  font-size: 0.875rem;
  font-weight: ${props => (props.active || props.completed ? '600' : '500')};
  color: ${props => (props.active || props.completed ? '#111827' : '#6b7280')};
  white-space: nowrap;
  text-align: center;
  transition: all 0.3s;

  @media (max-width: 768px) {
    font-size: 0.75rem;
  }
`;

const FormContainer = styled.div`
  background: white;
  border-radius: 1.5rem;
  padding: 3rem;
  box-shadow:
    0 20px 60px -15px rgba(0, 0, 0, 0.1),
    0 0 0 1px rgba(0, 0, 0, 0.05);
  min-height: 450px;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, #111827 0%, #374151 50%, #111827 100%);
    background-size: 200% 100%;
    animation: shimmer 3s infinite;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (max-width: 768px) {
    padding: 2rem 1.5rem;
  }
`;

const StepContent = styled(motion.div)``;

const FormGroup = styled.div`
  margin-bottom: 2rem;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
`;

const Label = styled.label`
  display: block;
  font-weight: 700;
  font-size: 0.9375rem;
  color: #111827;
  margin-bottom: 0.75rem;
  letter-spacing: -0.01em;
`;

const Input = styled.input<{ error?: boolean }>`
  width: 100%;
  padding: 0.875rem 1.125rem;
  border: 2px solid ${props => (props.error ? '#ef4444' : '#e5e7eb')};
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 500;
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  background: ${props => (props.error ? '#fef2f2' : '#ffffff')};
  color: #111827;
  letter-spacing: -0.01em;

  &::placeholder {
    color: #9ca3af;
    font-weight: 400;
  }

  &:hover {
    border-color: ${props => (props.error ? '#ef4444' : '#d1d5db')};
  }

  &:focus {
    outline: none;
    border-color: ${props => (props.error ? '#ef4444' : '#6366f1')};
    box-shadow: ${props =>
      props.error
        ? '0 0 0 4px rgba(239, 68, 68, 0.1)'
        : '0 0 0 4px rgba(99, 102, 241, 0.1)'};
    background: #ffffff;
  }

  &:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const Select = styled.select<{ error?: boolean }>`
  width: 100%;
  padding: 0.875rem 1.125rem;
  border: 2px solid ${props => (props.error ? '#ef4444' : '#e5e7eb')};
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 500;
  background: ${props => (props.error ? '#fef2f2' : '#ffffff')};
  color: #111827;
  cursor: pointer;
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  letter-spacing: -0.01em;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.875rem center;
  padding-right: 2.75rem;

  &:hover {
    border-color: ${props => (props.error ? '#ef4444' : '#d1d5db')};
  }

  &:focus {
    outline: none;
    border-color: ${props => (props.error ? '#ef4444' : '#6366f1')};
    box-shadow: ${props =>
      props.error
        ? '0 0 0 4px rgba(239, 68, 68, 0.1)'
        : '0 0 0 4px rgba(99, 102, 241, 0.1)'};
    background-color: #ffffff;
  }

  &:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
    opacity: 0.6;
  }

  option {
    font-weight: 500;
    padding: 0.5rem;
  }
`;

const TextArea = styled.textarea<{ error?: boolean }>`
  width: 100%;
  padding: 0.875rem 1.125rem;
  border: 2px solid ${props => (props.error ? '#ef4444' : '#e5e7eb')};
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 500;
  font-family: inherit;
  resize: vertical;
  min-height: 120px;
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  background: ${props => (props.error ? '#fef2f2' : '#ffffff')};
  color: #111827;
  line-height: 1.6;
  letter-spacing: -0.01em;

  &::placeholder {
    color: #9ca3af;
    font-weight: 400;
  }

  &:hover {
    border-color: ${props => (props.error ? '#ef4444' : '#d1d5db')};
  }

  &:focus {
    outline: none;
    border-color: ${props => (props.error ? '#ef4444' : '#6366f1')};
    box-shadow: ${props =>
      props.error
        ? '0 0 0 4px rgba(239, 68, 68, 0.1)'
        : '0 0 0 4px rgba(99, 102, 241, 0.1)'};
    background: #ffffff;
  }

  &:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const ErrorText = styled.span`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: #ef4444;
  font-size: 0.875rem;
  font-weight: 500;
  margin-top: 0.5rem;
  animation: slideIn 200ms ease-out;

  &::before {
    content: '⚠';
    font-size: 1rem;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const UploadZone = styled.div<{ isDragging: boolean }>`
  border: 3px dashed ${props => (props.isDragging ? '#6366f1' : '#d1d5db')};
  border-radius: 1rem;
  padding: 3rem 2rem;
  text-align: center;
  background: ${props =>
    props.isDragging
      ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)'
      : 'linear-gradient(to bottom, #ffffff 0%, #fafbfc 100%)'};
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, rgba(99, 102, 241, 0.1) 0%, transparent 70%);
    opacity: ${props => (props.isDragging ? '1' : '0')};
    transition: opacity 300ms;
  }

  &:hover {
    border-color: #6366f1;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.03) 0%, rgba(168, 85, 247, 0.03) 100%);
    transform: scale(1.01);
  }

  svg {
    color: #6b7280;
    transition: all 300ms;
  }

  &:hover svg {
    color: #6366f1;
    transform: translateY(-4px);
  }

  p {
    margin: 0.75rem 0;
    color: #111827;
    font-weight: 600;
    font-size: 1rem;
  }

  small {
    color: #6b7280;
    font-size: 0.875rem;
    font-weight: 500;
  }
`;

const ImagePreviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
`;

const ImagePreview = styled.div`
  position: relative;
  aspect-ratio: 1;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 2px solid var(--gray-200);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const RemoveButton = styled.button`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.9);
    transform: scale(1.1);
  }
`;

const PreviewSection = styled.div`
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 2px solid var(--gray-200);
`;

const PreviewTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--text-primary);
`;

const PreviewCard = styled.div`
  background: var(--gray-50);
  border-radius: 0.75rem;
  padding: 1.5rem;
  border: 1px solid var(--gray-200);
`;

const PreviewHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 0.5rem;

  h3 {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }
`;

const DiscountBadge = styled.div`
  background: var(--success);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 2rem;
  font-weight: 700;
  font-size: 0.875rem;
`;

const PreviewCategory = styled.div`
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-bottom: 1rem;
`;

const PreviewDescription = styled.p`
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: 1rem;
`;

const PreviewDates = styled.div`
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
`;

const PreviewMax = styled.div`
  color: var(--text-secondary);
  font-size: 0.875rem;
`;

const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2rem;
  gap: 1rem;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 1rem;
`;

// Spec §8a — shown when VITE_OFFER_MANAGEMENT_ENABLED is not set; blocks the
// entire page and instructs operators to contact the product team.
const SpecBlockBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 2rem;
  background: #fef3c7;
  border: 2px solid #f59e0b;
  border-radius: 1rem;
  margin-top: 2rem;

  svg {
    color: #b45309;
    flex-shrink: 0;
    margin-top: 2px;
  }
`;

const SpecBlockTitle = styled.p`
  font-size: 1rem;
  font-weight: 700;
  color: #92400e;
  margin: 0 0 0.375rem;
`;

const SpecBlockDesc = styled.p`
  font-size: 0.875rem;
  color: #92400e;
  line-height: 1.5;
  margin: 0;
`;

// Spec §8a warning banner — visible when the flag is enabled (non-production
// use) to remind operators the feature lacks an approved product spec.
const SpecWarningBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1.25rem;
  background: #fef3c7;
  border: 2px solid #f59e0b;
  border-radius: 0.75rem;
  margin-bottom: 1.5rem;

  svg {
    color: #b45309;
    flex-shrink: 0;
    margin-top: 2px;
  }
`;

const SpecWarningText = styled.p`
  font-size: 0.875rem;
  color: #92400e;
  line-height: 1.5;
  font-weight: 500;
  margin: 0;
`;

export default CreateOfferPage;
