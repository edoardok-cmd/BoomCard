import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { Upload, X, Check, ArrowLeft, ArrowRight, Save } from 'lucide-react';
import Button from '../components/common/Button/Button';

const content = {
  en: {
    title: 'Edit Offer',
    loading: 'Loading offer...',
    notFound: 'Offer not found',
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
    currentImages: 'Current Images',
    preview: 'Preview',
    back: 'Back',
    next: 'Next',
    save: 'Save Changes',
    cancel: 'Cancel',
    required: 'This field is required',
    invalidDiscount: 'Discount must be between 1 and 100',
    invalidDate: 'End date must be after start date',
    success: 'Offer updated successfully!',
    error: 'Failed to update offer. Please try again.',
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
    title: 'Редактиране на Оферта',
    loading: 'Зареждане на оферта...',
    notFound: 'Офертата не е намерена',
    step1: 'Основна Информация',
    step2: 'Детайли и Снимки',
    step3: 'Условия и Преглед',
    offerTitle: 'Заглавие на Офертата',
    offerTitlePlaceholder: 'напр., 20% Отстъпка на Всички Основни Ястия',
    category: 'Категория',
    selectCategory: 'Изберете категория',
    discount: 'Процент Отстъпка',
    description: 'Описание',
    descriptionPlaceholder: 'Опишете офертата си подробно...',
    validFrom: 'Валидна От',
    validUntil: 'Валидна До',
    maxRedemptions: 'Макс. Използвания',
    maxRedemptionsPlaceholder: 'Оставете празно за неограничен',
    terms: 'Условия',
    termsPlaceholder: 'Въведете условията...',
    uploadImages: 'Качване на Снимки',
    dragDrop: 'Пуснете снимки тук или кликнете за избор',
    supportedFormats: 'Поддържани: JPG, PNG, WebP (Макс 5MB всяка)',
    currentImages: 'Текущи Снимки',
    preview: 'Преглед',
    back: 'Назад',
    next: 'Напред',
    save: 'Запази Промените',
    cancel: 'Отказ',
    required: 'Това поле е задължително',
    invalidDiscount: 'Отстъпката трябва да е между 1 и 100',
    invalidDate: 'Крайната дата трябва да е след началната',
    success: 'Офертата е обновена успешно!',
    error: 'Неуспешно обновяване. Моля опитайте отново.',
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
  existingImages: string[];
  newImages: File[];
}

const EditOfferPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const t = content[language as keyof typeof content];

  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<OfferFormData>({
    title: '',
    category: '',
    discount: '',
    description: '',
    validFrom: '',
    validUntil: '',
    maxRedemptions: '',
    terms: '',
    existingImages: [],
    newImages: [],
  });

  const [errors, setErrors] = useState<Partial<Record<keyof OfferFormData, string>>>({});
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    // Mock fetch offer data - replace with real API call
    const fetchOffer = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Mock data
        setFormData({
          title: '20% Off All Main Courses',
          category: 'restaurants',
          discount: '20',
          description: 'Enjoy 20% discount on all main courses at our restaurant.',
          validFrom: '2025-01-10',
          validUntil: '2025-12-31',
          maxRedemptions: '100',
          terms: 'Valid for dine-in only. Cannot be combined with other offers.',
          existingImages: [
            'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
          ],
          newImages: [],
        });

        setLoading(false);
      } catch (error) {
        toast.error(t.error);
        setLoading(false);
      }
    };

    fetchOffer();
  }, [id]);

  const handleInputChange = (field: keyof OfferFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<Record<keyof OfferFormData, string>> = {};

    if (step === 1) {
      if (!formData.title.trim()) newErrors.title = t.required;
      if (!formData.category) newErrors.category = t.required;
      if (!formData.discount) {
        newErrors.discount = t.required;
      } else {
        const discountNum = parseInt(formData.discount);
        if (isNaN(discountNum) || discountNum < 1 || discountNum > 100) {
          newErrors.discount = t.invalidDiscount;
        }
      }
    }

    if (step === 2) {
      if (!formData.description.trim()) newErrors.description = t.required;
      if (!formData.validFrom) newErrors.validFrom = t.required;
      if (!formData.validUntil) newErrors.validUntil = t.required;
      if (formData.validFrom && formData.validUntil && formData.validFrom >= formData.validUntil) {
        newErrors.validUntil = t.invalidDate;
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

    const validFiles = Array.from(files).filter(file => {
      const isValidType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB
      return isValidType && isValidSize;
    });

    setFormData(prev => ({
      ...prev,
      newImages: [...prev.newImages, ...validFiles].slice(0, 5 - prev.existingImages.length),
    }));
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

  const removeExistingImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      existingImages: prev.existingImages.filter((_, i) => i !== index),
    }));
  };

  const removeNewImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      newImages: prev.newImages.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) return;

    try {
      // Mock API call - replace with real API
      await new Promise(resolve => setTimeout(resolve, 1000));

      toast.success(t.success);
      navigate('/partners/offers');
    } catch {
      toast.error(t.error);
    }
  };

  const renderStepIndicator = () => (
    <StepIndicator>
      {[1, 2, 3].map(step => (
        <React.Fragment key={step}>
          <Step active={step === currentStep} completed={step < currentStep}>
            <StepNumber active={step === currentStep} completed={step < currentStep}>
              {step < currentStep ? <Check size={20} /> : step}
            </StepNumber>
            <StepLabel active={step === currentStep} completed={step < currentStep}>
              {step === 1 && t.step1}
              {step === 2 && t.step2}
              {step === 3 && t.step3}
            </StepLabel>
          </Step>
          {step < 3 && <StepConnector completed={step < currentStep} />}
        </React.Fragment>
      ))}
    </StepIndicator>
  );

  const renderStep1 = () => (
    <StepContent
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      <FormGroup>
        <Label>{t.offerTitle}</Label>
        <Input
          type="text"
          placeholder={t.offerTitlePlaceholder}
          value={formData.title}
          onChange={(e) => handleInputChange('title', e.target.value)}
          error={!!errors.title}
        />
        {errors.title && <ErrorText>{errors.title}</ErrorText>}
      </FormGroup>

      <FormRow>
        <FormGroup>
          <Label>{t.category}</Label>
          <Select
            value={formData.category}
            onChange={(e) => handleInputChange('category', e.target.value)}
            error={!!errors.category}
          >
            <option value="">{t.selectCategory}</option>
            {Object.entries(t.categories).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
          {errors.category && <ErrorText>{errors.category}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>{t.discount}</Label>
          <InputWithSuffix>
            <Input
              type="number"
              min="1"
              max="100"
              value={formData.discount}
              onChange={(e) => handleInputChange('discount', e.target.value)}
              error={!!errors.discount}
            />
            <Suffix>%</Suffix>
          </InputWithSuffix>
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
      transition={{ duration: 0.3 }}
    >
      <FormGroup>
        <Label>{t.description}</Label>
        <TextArea
          rows={4}
          placeholder={t.descriptionPlaceholder}
          value={formData.description}
          onChange={(e) => handleInputChange('description', e.target.value)}
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
            onChange={(e) => handleInputChange('validFrom', e.target.value)}
            error={!!errors.validFrom}
          />
          {errors.validFrom && <ErrorText>{errors.validFrom}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>{t.validUntil}</Label>
          <Input
            type="date"
            value={formData.validUntil}
            onChange={(e) => handleInputChange('validUntil', e.target.value)}
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
          placeholder={t.maxRedemptionsPlaceholder}
          value={formData.maxRedemptions}
          onChange={(e) => handleInputChange('maxRedemptions', e.target.value)}
        />
      </FormGroup>

      <FormGroup>
        <Label>{t.uploadImages}</Label>

        {formData.existingImages.length > 0 && (
          <>
            <CurrentImagesLabel>{t.currentImages}</CurrentImagesLabel>
            <ImagePreviewGrid>
              {formData.existingImages.map((url, index) => (
                <ImagePreview key={`existing-${index}`}>
                  <img src={url} alt={`Existing ${index + 1}`} />
                  <RemoveButton onClick={() => removeExistingImage(index)}>
                    <X size={16} />
                  </RemoveButton>
                </ImagePreview>
              ))}
            </ImagePreviewGrid>
          </>
        )}

        <UploadZone
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-upload')?.click()}
        >
          <Upload size={32} />
          <p>{t.dragDrop}</p>
          <span>{t.supportedFormats}</span>
          <input
            id="file-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => handleImageUpload(e.target.files)}
          />
        </UploadZone>

        {formData.newImages.length > 0 && (
          <ImagePreviewGrid>
            {formData.newImages.map((file, index) => (
              <ImagePreview key={`new-${index}`}>
                <img src={URL.createObjectURL(file)} alt={`New ${index + 1}`} />
                <RemoveButton onClick={() => removeNewImage(index)}>
                  <X size={16} />
                </RemoveButton>
              </ImagePreview>
            ))}
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
      transition={{ duration: 0.3 }}
    >
      <FormGroup>
        <Label>{t.terms}</Label>
        <TextArea
          rows={6}
          placeholder={t.termsPlaceholder}
          value={formData.terms}
          onChange={(e) => handleInputChange('terms', e.target.value)}
          error={!!errors.terms}
        />
        {errors.terms && <ErrorText>{errors.terms}</ErrorText>}
      </FormGroup>

      <PreviewSection>
        <PreviewTitle>{t.preview}</PreviewTitle>
        <PreviewCard>
          <PreviewHeader>
            <div>
              <h3>{formData.title}</h3>
              <PreviewCategory>{formData.category && t.categories[formData.category as keyof typeof t.categories]}</PreviewCategory>
            </div>
            <DiscountBadge>-{formData.discount}%</DiscountBadge>
          </PreviewHeader>
          <PreviewDescription>{formData.description}</PreviewDescription>
          <PreviewDates>
            <strong>{t.validFrom}:</strong> {formData.validFrom} | <strong>{t.validUntil}:</strong> {formData.validUntil}
          </PreviewDates>
          {formData.maxRedemptions && (
            <PreviewMax>
              <strong>{t.maxRedemptions}:</strong> {formData.maxRedemptions}
            </PreviewMax>
          )}
        </PreviewCard>
      </PreviewSection>
    </StepContent>
  );

  if (loading) {
    return (
      <Container>
        <LoadingContainer>
          <LoadingSpinner />
          <LoadingText>{t.loading}</LoadingText>
        </LoadingContainer>
      </Container>
    );
  }

  return (
    <Container>
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
              <ArrowLeft size={20} />
              {t.back}
            </Button>
          )}

          {currentStep < 3 ? (
            <Button variant="primary" onClick={handleNext}>
              {t.next}
              <ArrowRight size={20} />
            </Button>
          ) : (
            <Button variant="primary" onClick={handleSubmit}>
              <Save size={20} />
              {t.save}
            </Button>
          )}
        </ActionButtons>
      </Actions>
    </Container>
  );
};

// Styled Components
const Container = styled.div`
  min-height: 100vh;
  background: #f9fafb;
  padding: 2rem;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1rem;
`;

const LoadingSpinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid #e5e7eb;
  border-top-color: #000000;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.p`
  font-size: 1rem;
  color: #6b7280;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;

  @media (max-width: 768px) {
    margin-bottom: 1.5rem;
  }
`;

const BackButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  svg {
    color: #374151;
  }
`;

const Title = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const StepIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: 3rem;
  padding: 0 2rem;

  @media (max-width: 768px) {
    margin-bottom: 2rem;
    padding: 0 1rem;
  }
`;

const StepConnector = styled.div<{ completed: boolean }>`
  flex: 1;
  height: 2px;
  background: ${props => props.completed ? '#000000' : '#e5e7eb'};
  margin: 0 -1rem;
  transition: background 0.3s;
`;

const Step = styled.div<{ active: boolean; completed: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  position: relative;
  z-index: 1;
`;

const StepNumber = styled.div<{ active?: boolean; completed?: boolean }>`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: ${props => {
    if (props.completed) return '#000000';
    if (props.active) return '#000000';
    return 'white';
  }};
  color: ${props => {
    if (props.completed || props.active) return 'white';
    return '#9ca3af';
  }};
  border: 2px solid ${props => {
    if (props.completed) return '#000000';
    if (props.active) return '#000000';
    return '#e5e7eb';
  }};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1.125rem;
  transition: all 0.3s;

  @media (max-width: 768px) {
    width: 40px;
    height: 40px;
    font-size: 1rem;
  }
`;

const StepLabel = styled.span<{ active?: boolean; completed?: boolean }>`
  font-size: 0.875rem;
  font-weight: ${props => props.active ? '600' : '500'};
  color: ${props => {
    if (props.completed || props.active) return '#111827';
    return '#9ca3af';
  }};
  text-align: center;
  transition: all 0.3s;

  @media (max-width: 768px) {
    font-size: 0.75rem;
  }
`;

const FormContainer = styled.div`
  max-width: 800px;
  margin: 0 auto;
  background: white;
  border-radius: 1rem;
  padding: 2.5rem;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.05),
    0 4px 12px rgba(0, 0, 0, 0.03),
    0 0 0 1px rgba(0, 0, 0, 0.02);
  min-height: 400px;

  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const StepContent = styled(motion.div)``;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const Label = styled.label`
  display: block;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
`;

const Input = styled.input<{ error?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.error ? '#ef4444' : '#e5e7eb'};
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  transition: all 0.2s;
  background: ${props => props.error ? '#fef2f2' : 'white'};

  &:focus {
    outline: none;
    border-color: ${props => props.error ? '#ef4444' : '#000000'};
    box-shadow: 0 0 0 3px ${props => props.error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
  }

  &::placeholder {
    color: #9ca3af;
  }

  &:disabled {
    background: #f9fafb;
    cursor: not-allowed;
  }

  /* Remove arrows from number inputs */
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type='number'] {
    -moz-appearance: textfield;
  }
`;

const Select = styled.select<{ error?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.error ? '#ef4444' : '#e5e7eb'};
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  transition: all 0.2s;
  background: ${props => props.error ? '#fef2f2' : 'white'};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${props => props.error ? '#ef4444' : '#000000'};
    box-shadow: 0 0 0 3px ${props => props.error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
  }

  option {
    padding: 0.5rem;
  }
`;

const TextArea = styled.textarea<{ error?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid ${props => props.error ? '#ef4444' : '#e5e7eb'};
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  transition: all 0.2s;
  background: ${props => props.error ? '#fef2f2' : 'white'};
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;

  &:focus {
    outline: none;
    border-color: ${props => props.error ? '#ef4444' : '#000000'};
    box-shadow: 0 0 0 3px ${props => props.error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const InputWithSuffix = styled.div`
  position: relative;
`;

const Suffix = styled.span`
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7280;
  font-weight: 600;
  pointer-events: none;
`;

const ErrorText = styled.span`
  display: block;
  color: #ef4444;
  font-size: 0.8125rem;
  margin-top: 0.375rem;
`;

const CurrentImagesLabel = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  font-weight: 500;
  margin-bottom: 0.75rem;
`;

const UploadZone = styled.div<{ isDragging: boolean }>`
  border: 2px dashed ${props => props.isDragging ? '#000000' : '#d1d5db'};
  border-radius: 0.75rem;
  padding: 3rem 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: ${props => props.isDragging ? '#f9fafb' : 'white'};

  &:hover {
    border-color: #9ca3af;
    background: #f9fafb;
  }

  svg {
    color: #6b7280;
    margin-bottom: 1rem;
  }

  p {
    font-size: 0.9375rem;
    color: #374151;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  span {
    font-size: 0.8125rem;
    color: #9ca3af;
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
  border: 1px solid #e5e7eb;

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
  width: 24px;
  height: 24px;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.9);
  }

  svg {
    color: white;
  }
`;

const PreviewSection = styled.div`
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid #e5e7eb;
`;

const PreviewTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1rem;
`;

const PreviewCard = styled.div`
  background: #f9fafb;
  border-radius: 0.75rem;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
`;

const PreviewHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 1rem;

  h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
    margin: 0 0 0.25rem 0;
  }
`;

const DiscountBadge = styled.div`
  background: #000000;
  color: white;
  padding: 0.375rem 0.875rem;
  border-radius: 9999px;
  font-weight: 700;
  font-size: 1rem;
`;

const PreviewCategory = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
`;

const PreviewDescription = styled.p`
  color: #374151;
  font-size: 0.9375rem;
  line-height: 1.6;
  margin-bottom: 1rem;
`;

const PreviewDates = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.5rem;

  strong {
    color: #374151;
  }
`;

const PreviewMax = styled.div`
  font-size: 0.875rem;
  color: #6b7280;

  strong {
    color: #374151;
  }
`;

const Actions = styled.div`
  max-width: 800px;
  margin: 2rem auto 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 1rem;

  @media (max-width: 768px) {
    width: 100%;

    button {
      flex: 1;
    }
  }
`;

export default EditOfferPage;
