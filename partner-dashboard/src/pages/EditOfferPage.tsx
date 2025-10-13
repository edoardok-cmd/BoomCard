import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { Upload, X, ArrowLeft, Save } from 'lucide-react';
import Button from '../components/common/Button/Button';

const content = {
  en: {
    title: 'Edit Offer',
    loading: 'Loading offer...',
    notFound: 'Offer not found',
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = content[language as keyof typeof content];

  const [isLoading, setIsLoading] = useState(true);
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
    // Mock API call to fetch offer data - replace with real API
    const fetchOffer = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 500));

        // Mock data
        const mockOffer = {
          id: id,
          title: '20% Off All Main Courses',
          category: 'restaurants',
          discount: '20',
          description: 'Enjoy 20% discount on all main courses at our restaurant.',
          validFrom: '2025-10-01',
          validUntil: '2025-12-31',
          maxRedemptions: '100',
          terms: 'Valid for dine-in only. Cannot be combined with other offers.',
          images: [
            'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400',
            'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400',
          ],
        };

        setFormData({
          title: mockOffer.title,
          category: mockOffer.category,
          discount: mockOffer.discount,
          description: mockOffer.description,
          validFrom: mockOffer.validFrom,
          validUntil: mockOffer.validUntil,
          maxRedemptions: mockOffer.maxRedemptions,
          terms: mockOffer.terms,
          existingImages: mockOffer.images,
          newImages: [],
        });

        setIsLoading(false);
      } catch {
        toast.error(t.notFound);
        navigate('/partners/offers');
      }
    };

    fetchOffer();
  }, [id, navigate, t.notFound]);

  const handleInputChange = (field: keyof OfferFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof OfferFormData, string>> = {};

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
    if (!formData.description.trim()) newErrors.description = t.required;
    if (!formData.validFrom) newErrors.validFrom = t.required;
    if (!formData.validUntil) newErrors.validUntil = t.required;
    if (formData.validFrom && formData.validUntil && formData.validFrom >= formData.validUntil) {
      newErrors.validUntil = t.invalidDate;
    }
    if (!formData.terms.trim()) newErrors.terms = t.required;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleImageUpload = (files: FileList | null) => {
    if (!files) return;

    const validFiles = Array.from(files).filter(file => {
      const isValidType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB
      return isValidType && isValidSize;
    });

    const totalImages = formData.existingImages.length + formData.newImages.length;
    const availableSlots = 5 - totalImages;

    setFormData(prev => ({
      ...prev,
      newImages: [...prev.newImages, ...validFiles].slice(0, availableSlots),
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
    if (!validateForm()) return;

    try {
      // Mock API call - replace with real API
      await new Promise(resolve => setTimeout(resolve, 1000));

      toast.success(t.success);
      navigate('/partners/offers');
    } catch {
      toast.error(t.error);
    }
  };

  if (isLoading) {
    return (
      <Container>
        <LoadingState>{t.loading}</LoadingState>
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

      <FormContainer>
        <FormGroup>
          <Label>{t.offerTitle}</Label>
          <Input
            type="text"
            value={formData.title}
            onChange={e => handleInputChange('title', e.target.value)}
            placeholder={t.offerTitlePlaceholder}
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
            <InputWithSuffix>
              <Input
                type="number"
                min="1"
                max="100"
                value={formData.discount}
                onChange={e => handleInputChange('discount', e.target.value)}
                error={!!errors.discount}
              />
              <Suffix>%</Suffix>
            </InputWithSuffix>
            {errors.discount && <ErrorText>{errors.discount}</ErrorText>}
          </FormGroup>
        </FormRow>

        <FormGroup>
          <Label>{t.description}</Label>
          <TextArea
            value={formData.description}
            onChange={e => handleInputChange('description', e.target.value)}
            placeholder={t.descriptionPlaceholder}
            rows={5}
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
          <Label>{t.terms}</Label>
          <TextArea
            value={formData.terms}
            onChange={e => handleInputChange('terms', e.target.value)}
            placeholder={t.termsPlaceholder}
            rows={6}
            error={!!errors.terms}
          />
          {errors.terms && <ErrorText>{errors.terms}</ErrorText>}
        </FormGroup>

        <FormGroup>
          <Label>{t.currentImages}</Label>
          {formData.existingImages.length > 0 && (
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
          )}
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

          {formData.newImages.length > 0 && (
            <ImagePreviewGrid>
              {formData.newImages.map((file, index) => (
                <ImagePreview key={`new-${index}`}>
                  <img src={URL.createObjectURL(file)} alt={`New ${index + 1}`} />
                  <RemoveButton onClick={() => removeNewImage(index)}>
                    <X size={16} />
                  </RemoveButton>
                  <NewBadge>NEW</NewBadge>
                </ImagePreview>
              ))}
            </ImagePreviewGrid>
          )}
        </FormGroup>
      </FormContainer>

      <Actions>
        <Button variant="secondary" onClick={() => navigate('/partners/offers')}>
          {t.cancel}
        </Button>
        <Button onClick={handleSubmit}>
          <Save size={18} /> {t.save}
        </Button>
      </Actions>
    </Container>
  );
};

const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-secondary);
  font-size: 1.125rem;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
`;

const BackButton = styled.button`
  background: var(--gray-100);
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--gray-200);
    transform: translateX(-2px);
  }
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
`;

const FormContainer = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

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
  color: var(--text-primary);
  margin-bottom: 0.5rem;
`;

const Input = styled.input<{ error?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid ${props => (props.error ? 'var(--error)' : 'var(--gray-200)')};
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: ${props => (props.error ? 'var(--error)' : 'var(--primary)')};
  }
`;

const Select = styled.select<{ error?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid ${props => (props.error ? 'var(--error)' : 'var(--gray-200)')};
  border-radius: 0.5rem;
  font-size: 1rem;
  background: white;
  cursor: pointer;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: ${props => (props.error ? 'var(--error)' : 'var(--primary)')};
  }
`;

const TextArea = styled.textarea<{ error?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid ${props => (props.error ? 'var(--error)' : 'var(--gray-200)')};
  border-radius: 0.5rem;
  font-size: 1rem;
  font-family: inherit;
  resize: vertical;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: ${props => (props.error ? 'var(--error)' : 'var(--primary)')};
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
  color: var(--text-secondary);
  font-weight: 600;
`;

const ErrorText = styled.span`
  display: block;
  color: var(--error);
  font-size: 0.875rem;
  margin-top: 0.25rem;
`;

const UploadZone = styled.div<{ isDragging: boolean }>`
  border: 2px dashed ${props => (props.isDragging ? 'var(--primary)' : 'var(--gray-300)')};
  border-radius: 0.5rem;
  padding: 2rem;
  text-align: center;
  background: ${props => (props.isDragging ? 'var(--gray-50)' : 'white')};
  transition: all 0.2s;
  cursor: pointer;

  &:hover {
    border-color: var(--primary);
    background: var(--gray-50);
  }

  svg {
    color: var(--text-secondary);
  }

  p {
    margin: 0.5rem 0;
    color: var(--text-primary);
    font-weight: 500;
  }

  small {
    color: var(--text-secondary);
    font-size: 0.875rem;
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
  z-index: 2;

  &:hover {
    background: rgba(0, 0, 0, 0.9);
    transform: scale(1.1);
  }
`;

const NewBadge = styled.div`
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  background: var(--success);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 700;
  z-index: 1;
`;

const Actions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2rem;
  gap: 1rem;
`;

export default EditOfferPage;
