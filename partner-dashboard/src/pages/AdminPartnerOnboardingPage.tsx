import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import Button from '../components/common/Button/Button';
import { apiService } from '../services/api.service';
import { PartnerType } from '../services/partnerTypes.service';
import toast from 'react-hot-toast';
import { placesCategories, experiencesCategories, getCategoryName } from '../types/categories.types';
import { DISCOUNT_STEPS, snapToStep } from '../utils/discountSteps';

// ─── Data ──────────────────────────────────────────────────────────────────

const BULGARIAN_CITIES = [
  'София', 'Пловдив', 'Варна', 'Бургас', 'Русе', 'Стара Загора', 'Плевен',
  'Велико Търново', 'Благоевград', 'Банско', 'Несебър', 'Созопол', 'Боровец',
  'Пампорово', 'Балчик', 'Albena', 'Свети Влас', 'Обзор', 'Приморско',
  'Хисаря', 'Троян', 'Ловеч', 'Шумен', 'Добрич', 'Силистра',
  'Монтана', 'Враца', 'Видин', 'Перник', 'Кюстендил', 'Смолян',
  'Пазарджик', 'Хасково', 'Кърджали', 'Ямбол', 'Сливен',
];

const CATEGORIES_WITH_SUBS = [
  ...placesCategories,
  ...experiencesCategories,
].map(cat => ({
  value: cat.id,
  label: cat.name.bg,
  subcategories: cat.subcategories.map(sub => ({ value: sub.id, label: sub.name.bg })),
}));

const PARTNERSHIP_TYPES_FALLBACK = ['BASIC', 'STANDARD', 'GOLD', 'VIP', 'PREMIUM', 'EXCLUSIVE'];
const MARKETING_VISIBILITY = ['Публична', 'Ограничена', 'Скрита'];
const CONTRACT_DURATIONS = ['6 месеца', '12 месеца', '24 месеца', 'Безсрочен'];
const PARTNER_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE'];

// ─── Types ─────────────────────────────────────────────────────────────────

interface CategoryEntry { category: string; subcategory: string; }

interface VenueEntry {
  name: string;
  address: string;
  city: string;
  region: string;
  phone: string;
  googleMapsLink: string;
  latitude: string;
  longitude: string;
}

interface FormData {
  // Step 1 – Business
  country: string;
  businessName: string;
  businessNameBg: string;
  legalName: string;
  vatNumber: string;
  city: string;
  region: string;
  address: string;
  googleMapsLink: string;
  latitude: string;
  longitude: string;
  totalVenues: string;
  boomVenues: string;
  description: string;
  highlights: string;
  additionalVenues: VenueEntry[];
  // Step 2 – Categories
  categoryEntries: CategoryEntry[];
  // Step 3 – Contacts
  ownerName: string;
  primaryContact: string;
  phone: string;
  email: string;
  secondaryContact: string;
  secondaryPhone: string;
  website: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  googleBusiness: string;
  menuLink: string;
  logoLink: string;
  photosLink: string;
  // Step 4 – Partnership
  discountRate: string;
  partnerTypeId: string;
  marketingVisibility: string;
  contractSigned: boolean;
  contractStartDate: string;
  contractDuration: string;
  onboardingDate: string;
  addedBy: string;
  status: string;
  internalNotes: string;
}

const INITIAL_FORM: FormData = {
  country: 'България',
  businessName: '',
  businessNameBg: '',
  legalName: '',
  vatNumber: '',
  city: '',
  region: '',
  address: '',
  googleMapsLink: '',
  latitude: '',
  longitude: '',
  totalVenues: '',
  boomVenues: '',
  description: '',
  highlights: '',
  additionalVenues: [],
  categoryEntries: [{ category: '', subcategory: '' }, { category: '', subcategory: '' }, { category: '', subcategory: '' }, { category: '', subcategory: '' }],
  ownerName: '',
  primaryContact: '',
  phone: '',
  email: '',
  secondaryContact: '',
  secondaryPhone: '',
  website: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  googleBusiness: '',
  menuLink: '',
  logoLink: '',
  photosLink: '',
  discountRate: '',
  partnerTypeId: '',
  marketingVisibility: 'Публична',
  contractSigned: false,
  contractStartDate: '',
  contractDuration: '12 месеца',
  onboardingDate: new Date().toISOString().split('T')[0],
  addedBy: '',
  status: 'PENDING',
  internalNotes: '',
};

// ─── Styled Components ──────────────────────────────────────────────────────

const PageWrapper = styled.div`
  min-height: 100vh;
  background: var(--color-background);
`;

const PageContainer = styled.div`
  max-width: 56rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
  @media (max-width: 768px) { padding: 1.5rem 1rem 3rem; }
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
  text-align: center;
`;

const PageTitle = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
`;

const PageSubtitle = styled.p`
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
`;

const StepperWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2.5rem;
  gap: 0;
  overflow-x: auto;
  padding: 0 0.5rem;
`;

const StepItem = styled.div<{ $active: boolean; $done: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  min-width: 4rem;
`;

const StepCircle = styled.div<{ $active: boolean; $done: boolean }>`
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 700;
  transition: all 0.25s;
  background: ${p => p.$done ? 'var(--color-accent)' : p.$active ? 'var(--color-primary)' : 'var(--color-background-tertiary)'};
  color: ${p => (p.$done || p.$active) ? '#fff' : 'var(--color-text-tertiary)'};
  border: 2px solid ${p => p.$done ? 'var(--color-accent)' : p.$active ? 'var(--color-primary)' : 'var(--color-border)'};
`;

const StepLabel = styled.span<{ $active: boolean; $done: boolean }>`
  font-size: 0.6875rem;
  text-align: center;
  color: ${p => (p.$active || p.$done) ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'};
  font-weight: ${p => p.$active ? '600' : '400'};
  white-space: nowrap;
`;

const StepConnector = styled.div<{ $done: boolean }>`
  flex: 1;
  height: 2px;
  min-width: 1.5rem;
  max-width: 3rem;
  background: ${p => p.$done ? 'var(--color-accent)' : 'var(--color-border)'};
  transition: background 0.25s;
  margin-bottom: 1.25rem;
`;

const FormCard = styled(motion.div)`
  background: var(--color-background-secondary);
  border-radius: 1rem;
  box-shadow: var(--shadow-soft);
  padding: 2rem;
  border: 1px solid var(--color-border);
  @media (max-width: 640px) { padding: 1.5rem 1rem; }
`;

const SectionHeader = styled.div`
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const SectionDesc = styled.p`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-top: 0.375rem;
`;

const SubSection = styled.div`
  padding: 1.25rem;
  background: var(--color-background-tertiary);
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  margin-bottom: 1.25rem;
`;

const SubSectionTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1rem;
`;

const FormGrid = styled.div<{ cols?: number }>`
  display: grid;
  grid-template-columns: ${p => p.cols === 3 ? 'repeat(3, 1fr)' : p.cols === 1 ? '1fr' : 'repeat(2, 1fr)'};
  gap: 1rem;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const FormGroup = styled.div<{ $span?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  ${p => p.$span ? 'grid-column: 1 / -1;' : ''}
`;

const Label = styled.label<{ $required?: boolean }>`
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  &::after { content: '${p => p.$required ? ' *' : ''}'; color: var(--color-error); }
`;

const inputBase = `
  width: 100%;
  padding: 0.65rem 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: border-color 0.2s, box-shadow 0.2s;
  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
  }
  &::placeholder { color: var(--color-text-tertiary); }
  [data-theme="dark"] & { background: var(--color-background-tertiary); }
`;

const Input = styled.input`${inputBase}`;
const Textarea = styled.textarea`${inputBase} resize: vertical; min-height: 5rem; font-family: inherit;`;
const Select = styled.select`
  ${inputBase}
  cursor: pointer;
  option { background: var(--color-background); }
`;

const CheckboxRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0;
`;

const CheckboxInput = styled.input`
  width: 1rem;
  height: 1rem;
  cursor: pointer;
`;

const CheckboxLabel = styled.label`
  font-size: 0.9375rem;
  color: var(--color-text-primary);
  cursor: pointer;
`;

const CategoryRow = styled.div`
  display: grid;
  grid-template-columns: auto 1fr 1fr;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-border);
  &:last-child { border-bottom: none; }
`;

const CategoryNum = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-tertiary);
  min-width: 1.5rem;
  text-align: center;
`;

const NavButtons = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2rem;
  gap: 1rem;
`;

const SummaryGrid = styled.div`
  display: grid;
  gap: 1.25rem;
`;

const SummarySection = styled.div`
  background: var(--color-background-tertiary);
  border-radius: 0.75rem;
  padding: 1.25rem;
  border: 1px solid var(--color-border);
`;

const SummarySectionTitle = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.075em;
  margin-bottom: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
`;

const SummaryRows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  font-size: 0.875rem;
`;

const SummaryKey = styled.span`
  color: var(--color-text-secondary);
  min-width: 10rem;
  flex-shrink: 0;
`;

const SummaryVal = styled.span`
  color: var(--color-text-primary);
  font-weight: 500;
  text-align: right;
  word-break: break-word;
`;

const RequiredNote = styled.p`
  font-size: 0.8125rem;
  color: var(--color-text-tertiary);
  margin-bottom: 1.5rem;
  text-align: right;
`;

// ─── Step icons (2-colour vectors) ──────────────────────────────────────────

const IconBuilding = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '3px' }}>
    <rect x="1.5" y="4.5" width="11" height="8.5" rx="0.75" stroke="currentColor" strokeWidth="1.25" />
    <rect x="1.5" y="4.5" width="11" height="3" rx="0.75" fill="currentColor" fillOpacity="0.18" />
    <rect x="3" y="6.75" width="2" height="1.75" rx="0.3" fill="var(--color-primary)" opacity="0.75" />
    <rect x="9" y="6.75" width="2" height="1.75" rx="0.3" fill="var(--color-primary)" opacity="0.75" />
    <rect x="5.5" y="9.5" width="3" height="3.5" rx="0.3" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const IconTag = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '3px' }}>
    <path d="M1.5 2.5a1 1 0 0 1 1-1h4.17a1 1 0 0 1 .707.293l4.83 4.83a1 1 0 0 1 0 1.414l-3.414 3.414a1 1 0 0 1-1.414 0L2.56 6.622A1 1 0 0 1 1.5 5.879V2.5Z" stroke="currentColor" strokeWidth="1.25" />
    <circle cx="4.25" cy="4.75" r="1" fill="var(--color-primary)" />
  </svg>
);

const IconPhone = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '3px' }}>
    <rect x="3.5" y="1" width="7" height="12" rx="1.25" stroke="currentColor" strokeWidth="1.25" />
    <rect x="4.5" y="2.5" width="5" height="6.5" rx="0.5" fill="var(--color-primary)" fillOpacity="0.18" />
    <circle cx="7" cy="11.25" r="0.65" fill="currentColor" />
  </svg>
);

const IconDocument = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '3px' }}>
    <path d="M2.5 1.5h6.25L11.5 4.75V12.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V1.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    <path d="M8.75 1.5L11.5 4.75H8.75V1.5Z" fill="var(--color-primary)" fillOpacity="0.25" />
    <path d="M4.5 7h5M4.5 9h3.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

const IconEye = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '3px' }}>
    <path d="M1 7s2.25-4.5 6-4.5S13 7 13 7s-2.25 4.5-6 4.5S1 7 1 7Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    <circle cx="7" cy="7" r="2" fill="var(--color-primary)" fillOpacity="0.85" />
    <circle cx="7" cy="7" r="0.75" fill="currentColor" fillOpacity="0.9" />
  </svg>
);

// ─── Component ──────────────────────────────────────────────────────────────

const STEPS: { label: string; icon: React.ReactNode }[] = [
  { label: 'Бизнес', icon: <IconBuilding /> },
  { label: 'Категории', icon: <IconTag /> },
  { label: 'Контакти', icon: <IconPhone /> },
  { label: 'Договор', icon: <IconDocument /> },
  { label: 'Преглед', icon: <IconEye /> },
];

const AdminPartnerOnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [partnerTypes, setPartnerTypes] = useState<PartnerType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    apiService.get<{ data: PartnerType[] }>('/admin/partner-types')
      .then(res => setPartnerTypes(res.data ?? []))
      .catch(() => {/* use fallback labels */});
  }, []);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'partnerTypeId') {
        const type = partnerTypes.find(pt => pt.id === value);
        const typeMax = type?.maxDiscountRate ?? 100;
        const currentRate = parseFloat(prev.discountRate);
        if (!isNaN(currentRate) && currentRate > typeMax) {
          next.discountRate = snapToStep(typeMax);
        }
      }
      return next;
    });
    if (errors[key]) setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
  };

  const setCatEntry = (index: number, field: 'category' | 'subcategory', value: string) => {
    setForm(prev => {
      const entries = [...prev.categoryEntries];
      entries[index] = { ...entries[index], [field]: value };
      if (field === 'category') entries[index].subcategory = '';
      return { ...prev, categoryEntries: entries };
    });
  };

  const addVenue = () => {
    setForm(prev => ({
      ...prev,
      additionalVenues: [...prev.additionalVenues, { name: '', address: '', city: '', region: '', phone: '', googleMapsLink: '', latitude: '', longitude: '' }],
    }));
  };

  const removeVenue = (index: number) => {
    setForm(prev => ({
      ...prev,
      additionalVenues: prev.additionalVenues.filter((_, i) => i !== index),
    }));
  };

  const setVenueField = (index: number, field: keyof VenueEntry, value: string) => {
    setForm(prev => {
      const venues = [...prev.additionalVenues];
      venues[index] = { ...venues[index], [field]: value };
      return { ...prev, additionalVenues: venues };
    });
  };

  const validate = (currentStep: number): boolean => {
    const e: Record<string, string> = {};
    if (currentStep === 0) {
      if (!form.businessName.trim()) e.businessName = 'Задължително поле';
      if (!form.city) e.city = 'Изберете град';
      if (!form.address.trim()) e.address = 'Задължително поле';
    }
    if (currentStep === 1) {
      const hasCat = form.categoryEntries.some(c => c.category);
      if (!hasCat) e.categories = 'Изберете поне 1 категория';
    }
    if (currentStep === 2) {
      if (!form.email.trim()) e.email = 'Задължително поле';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Невалиден имейл';
      if (!form.phone.trim()) e.phone = 'Задължително поле';
    }
    if (currentStep === 3) {
      if (!form.discountRate) e.discountRate = 'Задължително поле';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validate(step)) setStep(s => s + 1); };
  const back = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    if (!validate(3)) { setStep(3); return; }
    setSubmitting(true);
    try {
      const primaryCat = form.categoryEntries.find(c => c.category);
      // Flatten to canonical ID strings: include the category ID and subcategory ID (if selected)
      const allCategories = [...new Set(
        form.categoryEntries
          .filter(c => c.category)
          .flatMap(c => c.subcategory ? [c.category, c.subcategory] : [c.category])
      )];

      const payload = {
        email: form.email.toLowerCase(),
        businessName: form.businessName,
        businessNameBg: form.businessNameBg || undefined,
        legalName: form.legalName || undefined,
        vatNumber: form.vatNumber || undefined,
        country: form.country || 'България',
        city: form.city || undefined,
        region: form.region || undefined,
        address: form.address || undefined,
        googleMapsLink: form.googleMapsLink || undefined,
        totalVenues: form.totalVenues ? parseInt(form.totalVenues) : undefined,
        boomVenues: form.boomVenues ? parseInt(form.boomVenues) : undefined,
        description: form.description || undefined,
        highlights: form.highlights ? form.highlights.split(',').map(h => h.trim()).filter(Boolean) : undefined,
        locations: [
          {
            name: form.businessName,
            address: form.address,
            city: form.city,
            region: form.region || null,
            phone: form.phone || null,
            googleMapsLink: form.googleMapsLink || null,
            latitude: form.latitude ? parseFloat(form.latitude) : null,
            longitude: form.longitude ? parseFloat(form.longitude) : null,
          },
          ...form.additionalVenues
            .filter(v => v.name && v.address && v.city)
            .map(v => ({
              name: v.name,
              address: v.address,
              city: v.city,
              region: v.region || null,
              phone: v.phone || null,
              googleMapsLink: v.googleMapsLink || null,
              latitude: v.latitude ? parseFloat(v.latitude) : null,
              longitude: v.longitude ? parseFloat(v.longitude) : null,
            })),
        ],
        category: primaryCat?.category || 'restaurants',
        subcategory: primaryCat?.subcategory || undefined,
        categories: allCategories,
        ownerName: form.ownerName || undefined,
        primaryContact: form.primaryContact || undefined,
        phone: form.phone || undefined,
        secondaryContact: form.secondaryContact || undefined,
        secondaryPhone: form.secondaryPhone || undefined,
        website: form.website || undefined,
        instagram: form.instagram || undefined,
        facebook: form.facebook || undefined,
        tiktok: form.tiktok || undefined,
        googleBusiness: form.googleBusiness || undefined,
        menuLink: form.menuLink || undefined,
        logoLink: form.logoLink || undefined,
        photosLink: form.photosLink || undefined,
        discountRate: form.discountRate ? parseFloat(form.discountRate) : undefined,
        partnerTypeId: form.partnerTypeId || undefined,
        marketingVisibility: form.marketingVisibility || undefined,
        contractSigned: form.contractSigned,
        contractStartDate: form.contractStartDate || undefined,
        contractDuration: form.contractDuration || undefined,
        onboardingDate: form.onboardingDate || undefined,
        addedBy: form.addedBy || undefined,
        status: form.status || 'PENDING',
        internalNotes: form.internalNotes || undefined,
      };

      await apiService.post('/partners/onboard', payload);
      toast.success(`Партньорът "${form.businessName}" беше създаден успешно!`);
      navigate(`/admin/partners/active`);
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: string | { message?: string } } }; message?: string };
      const rawErr = axiosErr?.response?.data?.error;
      const msg = (typeof rawErr === 'string' ? rawErr : rawErr?.message) || axiosErr?.message || 'Грешка при създаване на партньор';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Step renders ───────────────────────────────────────────────────────

  const renderStep0 = () => (
    <>
      <SectionHeader>
        <SectionTitle>🏢 Бизнес и обекти</SectionTitle>
        <SectionDesc>Основните данни, които идентифицират партньора и обектите в платформата</SectionDesc>
      </SectionHeader>

      <SubSection>
        <SubSectionTitle>Основна информация</SubSectionTitle>
        <FormGrid>
          <FormGroup>
            <Label>Държава</Label>
            <Select value={form.country} onChange={e => set('country', e.target.value)}>
              <option value="България">България</option>
              <option value="Romania">Romania</option>
              <option value="Greece">Greece</option>
              <option value="Serbia">Serbia</option>
            </Select>
          </FormGroup>
          <FormGroup>
            <Label $required>Град</Label>
            <Select value={form.city} onChange={e => set('city', e.target.value)}>
              <option value="">— Изберете град —</option>
              {BULGARIAN_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            {errors.city && <span style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{errors.city}</span>}
          </FormGroup>
        </FormGrid>

        <FormGrid style={{ marginTop: '1rem' }}>
          <FormGroup>
            <Label $required>Име за показване в платформата</Label>
            <Input
              value={form.businessName}
              onChange={e => set('businessName', e.target.value)}
              placeholder="напр. Хотел Маринела"
            />
            {errors.businessName && <span style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{errors.businessName}</span>}
          </FormGroup>
          <FormGroup>
            <Label>Юридическо име на фирмата</Label>
            <Input
              value={form.legalName}
              onChange={e => set('legalName', e.target.value)}
              placeholder="напр. Маринела ЕООД"
            />
          </FormGroup>
        </FormGrid>

        <FormGrid style={{ marginTop: '1rem' }}>
          <FormGroup>
            <Label>ЕИК / ДДС номер</Label>
            <Input
              value={form.vatNumber}
              onChange={e => set('vatNumber', e.target.value)}
              placeholder="напр. BG123456789"
            />
          </FormGroup>
          <FormGroup>
            <Label>Регион / Квартал</Label>
            <Input
              value={form.region}
              onChange={e => set('region', e.target.value)}
              placeholder="напр. Лозенец"
            />
          </FormGroup>
        </FormGrid>

        <FormGrid style={{ marginTop: '1rem' }}>
          <FormGroup $span>
            <Label $required>Основен адрес</Label>
            <Input
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="напр. бул. Черни връх 100"
            />
            {errors.address && <span style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{errors.address}</span>}
          </FormGroup>
        </FormGrid>

        <FormGrid style={{ marginTop: '1rem' }}>
          <FormGroup $span>
            <Label>Google Maps линк</Label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Input
                type="url"
                value={form.googleMapsLink}
                onChange={e => set('googleMapsLink', e.target.value)}
                placeholder="https://maps.google.com/..."
                style={{ flex: 1 }}
              />
              <button
                type="button"
                title="Извлечи координати от линка"
                style={{ padding: '0 0.75rem', background: 'var(--color-background-secondary)', border: '2px solid var(--color-border)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}
                onClick={() => {
                  const match = form.googleMapsLink.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                  if (match) {
                    set('latitude', match[1]);
                    set('longitude', match[2]);
                  } else {
                    const match2 = form.googleMapsLink.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                    if (match2) { set('latitude', match2[1]); set('longitude', match2[2]); }
                    else toast.error('Не са намерени координати в линка');
                  }
                }}
              >
                📍 Извлечи
              </button>
            </div>
          </FormGroup>
        </FormGrid>

        <FormGrid style={{ marginTop: '1rem' }}>
          <FormGroup>
            <Label>Географска ширина (Latitude)</Label>
            <Input
              type="number"
              step="any"
              value={form.latitude}
              onChange={e => set('latitude', e.target.value)}
              placeholder="напр. 42.6977"
            />
          </FormGroup>
          <FormGroup>
            <Label>Географска дължина (Longitude)</Label>
            <Input
              type="number"
              step="any"
              value={form.longitude}
              onChange={e => set('longitude', e.target.value)}
              placeholder="напр. 23.3219"
            />
          </FormGroup>
        </FormGrid>

        <FormGrid cols={3} style={{ marginTop: '1rem' }}>
          <FormGroup>
            <Label>Брой обекти (общо)</Label>
            <Input
              type="number"
              min="1"
              value={form.totalVenues}
              onChange={e => set('totalVenues', e.target.value)}
              placeholder="напр. 3"
            />
          </FormGroup>
          <FormGroup>
            <Label>Обекти в BOOM Card</Label>
            <Input
              type="number"
              min="1"
              value={form.boomVenues}
              onChange={e => set('boomVenues', e.target.value)}
              placeholder="напр. 1"
            />
          </FormGroup>
        </FormGrid>
      </SubSection>

      <SubSection>
        <SubSectionTitle>Описание и локации</SubSectionTitle>
        <FormGroup style={{ marginBottom: '1rem' }}>
          <Label>Кратко описание за платформата</Label>
          <Textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Кратко описание, което ще се вижда от потребителите..."
            style={{ minHeight: '4rem' }}
          />
        </FormGroup>
        <FormGroup style={{ marginBottom: '1rem' }}>
          <Label>Ключови акценти</Label>
          <Input
            value={form.highlights}
            onChange={e => set('highlights', e.target.value)}
            placeholder="Например: гледка, жива музика, минерална вода, паркинг (разделени със запетая)"
          />
        </FormGroup>
        <FormGroup>
          <Label>Допълнителни обекти</Label>
          {form.additionalVenues.length === 0 && (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
              Основният адрес по-горе ще бъде регистриран като Обект 1. Добавете допълнителни обекти тук.
            </p>
          )}
          {form.additionalVenues.map((venue, i) => (
            <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: '0.75rem', padding: '1rem', marginBottom: '0.75rem', background: 'var(--color-background-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>Обект {i + 2}</span>
                <button type="button" onClick={() => removeVenue(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.875rem', fontWeight: 600 }}>× Премахни</button>
              </div>
              <FormGrid style={{ marginBottom: '0.5rem' }}>
                <FormGroup $span>
                  <Label $required>Име на обекта</Label>
                  <Input value={venue.name} onChange={e => setVenueField(i, 'name', e.target.value)} placeholder="напр. Ресторант Дива — Банско" />
                </FormGroup>
              </FormGrid>
              <FormGrid style={{ marginBottom: '0.5rem' }}>
                <FormGroup $span>
                  <Label $required>Адрес</Label>
                  <Input value={venue.address} onChange={e => setVenueField(i, 'address', e.target.value)} placeholder="напр. ул. Пирин 5" />
                </FormGroup>
              </FormGrid>
              <FormGrid style={{ marginBottom: '0.5rem' }}>
                <FormGroup>
                  <Label $required>Град</Label>
                  <Select value={venue.city} onChange={e => setVenueField(i, 'city', e.target.value)}>
                    <option value="">— Изберете —</option>
                    {BULGARIAN_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup>
                  <Label>Квартал / Район</Label>
                  <Input value={venue.region} onChange={e => setVenueField(i, 'region', e.target.value)} placeholder="напр. Центъра" />
                </FormGroup>
              </FormGrid>
              <FormGrid style={{ marginBottom: '0.5rem' }}>
                <FormGroup>
                  <Label>Телефон</Label>
                  <Input value={venue.phone} onChange={e => setVenueField(i, 'phone', e.target.value)} placeholder="+359 88..." />
                </FormGroup>
                <FormGroup>
                  <Label>Google Maps линк</Label>
                  <Input value={venue.googleMapsLink} onChange={e => setVenueField(i, 'googleMapsLink', e.target.value)} placeholder="https://maps.google.com/..." />
                </FormGroup>
              </FormGrid>
              <FormGrid style={{ marginBottom: '0.5rem' }}>
                <FormGroup>
                  <Label>Latitude</Label>
                  <Input type="number" step="any" value={venue.latitude} onChange={e => setVenueField(i, 'latitude', e.target.value)} placeholder="напр. 42.6977" />
                </FormGroup>
                <FormGroup>
                  <Label>Longitude</Label>
                  <Input type="number" step="any" value={venue.longitude} onChange={e => setVenueField(i, 'longitude', e.target.value)} placeholder="напр. 23.3219" />
                </FormGroup>
              </FormGrid>
            </div>
          ))}
          <button
            type="button"
            onClick={addVenue}
            style={{ padding: '0.625rem 1.25rem', background: 'none', border: '2px dashed var(--color-border)', borderRadius: '0.75rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', width: '100%', marginTop: '0.25rem' }}
          >
            + Добави обект
          </button>
        </FormGroup>
      </SubSection>
    </>
  );

  const renderStep1 = () => (
    <>
      <SectionHeader>
        <SectionTitle>🏷️ Категории и филтри</SectionTitle>
        <SectionDesc>Изборът тук управлява търсенията, филтрите и импорта към сайта</SectionDesc>
      </SectionHeader>

      {errors.categories && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-error)', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1rem', color: 'var(--color-error)', fontSize: '0.875rem' }}>
          {errors.categories}
        </div>
      )}

      <SubSection>
        <SubSectionTitle>Избор на категории (до 4)</SubSectionTitle>

        {[0, 1, 2, 3].map(i => {
          const entry = form.categoryEntries[i];
          const subs = CATEGORIES_WITH_SUBS.find(c => c.value === entry.category)?.subcategories ?? [];
          return (
            <CategoryRow key={i}>
              <CategoryNum>{i + 1}</CategoryNum>
              <Select
                value={entry.category}
                onChange={e => setCatEntry(i, 'category', e.target.value)}
              >
                <option value="">— Категория —</option>
                {CATEGORIES_WITH_SUBS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
              <Select
                value={entry.subcategory}
                onChange={e => setCatEntry(i, 'subcategory', e.target.value)}
                disabled={!entry.category}
              >
                <option value="">— Подкатегория —</option>
                {subs.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </CategoryRow>
          );
        })}
      </SubSection>

      {/* Auto-summary preview */}
      {form.categoryEntries.some(c => c.category) && (
        <SubSection style={{ background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.25)' }}>
          <SubSectionTitle>Автоматично обобщение</SubSectionTitle>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
            <strong>Категории: </strong>
            {form.categoryEntries.filter(c => c.category).map(c => getCategoryName(c.category, 'bg')).join(', ')}
          </div>
          {form.categoryEntries.some(c => c.subcategory) && (
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem', lineHeight: '1.6' }}>
              <strong>Подкатегории: </strong>
              {form.categoryEntries.filter(c => c.subcategory).map(c => getCategoryName(c.subcategory, 'bg')).join(', ')}
            </div>
          )}
        </SubSection>
      )}
    </>
  );

  const renderStep2 = () => (
    <>
      <SectionHeader>
        <SectionTitle>📞 Контакти и онлайн</SectionTitle>
        <SectionDesc>Контактите и линковете, необходими за комуникация, профил и визуализация</SectionDesc>
      </SectionHeader>

      <SubSection>
        <SubSectionTitle>Контакти</SubSectionTitle>
        <FormGrid>
          <FormGroup>
            <Label>Собственик / управител</Label>
            <Input
              value={form.ownerName}
              onChange={e => set('ownerName', e.target.value)}
              placeholder="Пълно име"
            />
          </FormGroup>
          <FormGroup>
            <Label>Основен контакт</Label>
            <Input
              value={form.primaryContact}
              onChange={e => set('primaryContact', e.target.value)}
              placeholder="Име на контактното лице"
            />
          </FormGroup>
        </FormGrid>

        <FormGrid style={{ marginTop: '1rem' }}>
          <FormGroup>
            <Label $required>Телефон</Label>
            <Input
              type="tel"
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="+359 88 888 8888"
            />
            {errors.phone && <span style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{errors.phone}</span>}
          </FormGroup>
          <FormGroup>
            <Label $required>Имейл</Label>
            <Input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="info@example.com"
            />
            {errors.email && <span style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{errors.email}</span>}
          </FormGroup>
        </FormGrid>

        <FormGrid style={{ marginTop: '1rem' }}>
          <FormGroup>
            <Label>Втори контакт</Label>
            <Input
              value={form.secondaryContact}
              onChange={e => set('secondaryContact', e.target.value)}
              placeholder="Име"
            />
          </FormGroup>
          <FormGroup>
            <Label>Втори телефон</Label>
            <Input
              type="tel"
              value={form.secondaryPhone}
              onChange={e => set('secondaryPhone', e.target.value)}
              placeholder="+359 88 888 8888"
            />
          </FormGroup>
        </FormGrid>
      </SubSection>

      <SubSection>
        <SubSectionTitle>Онлайн присъствие и медия</SubSectionTitle>
        <FormGrid>
          <FormGroup>
            <Label>Уебсайт</Label>
            <Input
              type="url"
              value={form.website}
              onChange={e => set('website', e.target.value)}
              placeholder="https://example.com"
            />
          </FormGroup>
          <FormGroup>
            <Label>Instagram</Label>
            <Input
              value={form.instagram}
              onChange={e => set('instagram', e.target.value)}
              placeholder="https://instagram.com/..."
            />
          </FormGroup>
          <FormGroup>
            <Label>Facebook</Label>
            <Input
              value={form.facebook}
              onChange={e => set('facebook', e.target.value)}
              placeholder="https://facebook.com/..."
            />
          </FormGroup>
          <FormGroup>
            <Label>TikTok</Label>
            <Input
              value={form.tiktok}
              onChange={e => set('tiktok', e.target.value)}
              placeholder="https://tiktok.com/@..."
            />
          </FormGroup>
          <FormGroup $span>
            <Label>Google Business Profile</Label>
            <Input
              value={form.googleBusiness}
              onChange={e => set('googleBusiness', e.target.value)}
              placeholder="https://maps.app.goo.gl/..."
            />
          </FormGroup>
        </FormGrid>

        <FormGrid style={{ marginTop: '1rem' }}>
          <FormGroup>
            <Label>Линк към меню</Label>
            <Input
              type="url"
              value={form.menuLink}
              onChange={e => set('menuLink', e.target.value)}
              placeholder="https://..."
            />
          </FormGroup>
          <FormGroup>
            <Label>Линк към лого</Label>
            <Input
              type="url"
              value={form.logoLink}
              onChange={e => set('logoLink', e.target.value)}
              placeholder="Google Drive / Dropbox линк"
            />
          </FormGroup>
          <FormGroup $span>
            <Label>Линк към снимки</Label>
            <Input
              type="url"
              value={form.photosLink}
              onChange={e => set('photosLink', e.target.value)}
              placeholder="Папка Drive или друг удобен линк"
            />
          </FormGroup>
        </FormGrid>
      </SubSection>
    </>
  );

  const renderStep3 = () => (
    <>
      <SectionHeader>
        <SectionTitle>📋 Партньорство и договор</SectionTitle>
        <SectionDesc>Търговските параметри, договорът и вътрешният статус на партньора</SectionDesc>
      </SectionHeader>

      <SubSection>
        <SubSectionTitle>Търговски параметри</SubSectionTitle>
        <FormGrid>
          <FormGroup>
            <Label $required>Partner Discount Pool (%)</Label>
            {(() => {
              const typeMax = partnerTypes.find(pt => pt.id === form.partnerTypeId)?.maxDiscountRate ?? 100;
              return (
                <Select
                  value={form.discountRate}
                  onChange={e => set('discountRate', e.target.value)}
                >
                  <option value="">— Изберете отстъпка —</option>
                  {DISCOUNT_STEPS.filter(s => s <= typeMax).map(s => (
                    <option key={s} value={String(s)}>{s}%</option>
                  ))}
                </Select>
              );
            })()}
            {errors.discountRate && <span style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{errors.discountRate}</span>}
          </FormGroup>
          <FormGroup>
            <Label>Тип партньорство</Label>
            <Select value={form.partnerTypeId} onChange={e => set('partnerTypeId', e.target.value)}>
              <option value="">— Изберете тип —</option>
              {partnerTypes.length > 0
                ? partnerTypes.map(pt => (
                    <option key={pt.id} value={pt.id}>{pt.nameBg || pt.name}</option>
                  ))
                : PARTNERSHIP_TYPES_FALLBACK.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))
              }
            </Select>
          </FormGroup>
          <FormGroup>
            <Label>Маркетингова видимост</Label>
            <Select value={form.marketingVisibility} onChange={e => set('marketingVisibility', e.target.value)}>
              {MARKETING_VISIBILITY.map(v => <option key={v} value={v}>{v}</option>)}
            </Select>
          </FormGroup>
          <FormGroup>
            <Label>Статус на партньора</Label>
            <Select value={form.status} onChange={e => set('status', e.target.value)}>
              {PARTNER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormGroup>
        </FormGrid>
      </SubSection>

      <SubSection>
        <SubSectionTitle>Договор и BOOM статус</SubSectionTitle>
        <CheckboxRow style={{ marginBottom: '1rem' }}>
          <CheckboxInput
            id="contractSigned"
            type="checkbox"
            checked={form.contractSigned}
            onChange={e => set('contractSigned', e.target.checked)}
          />
          <CheckboxLabel htmlFor="contractSigned">Договорът е подписан</CheckboxLabel>
        </CheckboxRow>

        <FormGrid>
          <FormGroup>
            <Label>Начална дата на договора</Label>
            <Input
              type="date"
              value={form.contractStartDate}
              onChange={e => set('contractStartDate', e.target.value)}
            />
          </FormGroup>
          <FormGroup>
            <Label>Срок на договора</Label>
            <Select value={form.contractDuration} onChange={e => set('contractDuration', e.target.value)}>
              {CONTRACT_DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </FormGroup>
          <FormGroup>
            <Label>Дата на onboarding</Label>
            <Input
              type="date"
              value={form.onboardingDate}
              onChange={e => set('onboardingDate', e.target.value)}
            />
          </FormGroup>
          <FormGroup>
            <Label>Добавен от</Label>
            <Input
              value={form.addedBy}
              onChange={e => set('addedBy', e.target.value)}
              placeholder="Име на служителя"
            />
          </FormGroup>
        </FormGrid>

        <FormGroup style={{ marginTop: '1rem' }}>
          <Label>Вътрешни бележки</Label>
          <Textarea
            value={form.internalNotes}
            onChange={e => set('internalNotes', e.target.value)}
            placeholder="Вътрешни бележки, видими само за BOOM екипа..."
          />
        </FormGroup>
      </SubSection>
    </>
  );

  const renderStep4 = () => {
    const activeCats = form.categoryEntries.filter(c => c.category);
    const selectedType = partnerTypes.find(pt => pt.id === form.partnerTypeId);
    return (
      <>
        <SectionHeader>
          <SectionTitle>✅ Преглед и потвърждение</SectionTitle>
          <SectionDesc>Проверете данните преди да създадете партньора</SectionDesc>
        </SectionHeader>

        <SummaryGrid>
          <SummarySection>
            <SummarySectionTitle>🏢 Бизнес</SummarySectionTitle>
            <SummaryRows>
              <SummaryRow><SummaryKey>Иmе в платформата</SummaryKey><SummaryVal>{form.businessName}</SummaryVal></SummaryRow>
              {form.legalName && <SummaryRow><SummaryKey>Юридическо иmе</SummaryKey><SummaryVal>{form.legalName}</SummaryVal></SummaryRow>}
              {form.vatNumber && <SummaryRow><SummaryKey>ЕИК / ДДС</SummaryKey><SummaryVal>{form.vatNumber}</SummaryVal></SummaryRow>}
              <SummaryRow><SummaryKey>Местоположение</SummaryKey><SummaryVal>{[form.city, form.address].filter(Boolean).join(', ')}</SummaryVal></SummaryRow>
              {form.googleMapsLink && <SummaryRow><SummaryKey>Google Maps</SummaryKey><SummaryVal>{form.googleMapsLink.slice(0, 50)}...</SummaryVal></SummaryRow>}
              {(form.latitude || form.longitude) && <SummaryRow><SummaryKey>GPS</SummaryKey><SummaryVal>{form.latitude}, {form.longitude}</SummaryVal></SummaryRow>}
              {form.description && <SummaryRow><SummaryKey>Описание</SummaryKey><SummaryVal>{form.description.slice(0, 100)}{form.description.length > 100 ? '...' : ''}</SummaryVal></SummaryRow>}
              {form.highlights && <SummaryRow><SummaryKey>Акценти</SummaryKey><SummaryVal>{form.highlights}</SummaryVal></SummaryRow>}
              {form.additionalVenues.length > 0 && (
                <SummaryRow>
                  <SummaryKey>Допълнителни обекти</SummaryKey>
                  <SummaryVal>{form.additionalVenues.length} обект(а): {form.additionalVenues.map(v => v.name || v.address).filter(Boolean).join(', ')}</SummaryVal>
                </SummaryRow>
              )}
            </SummaryRows>
          </SummarySection>

          <SummarySection>
            <SummarySectionTitle>🏷️ Категории</SummarySectionTitle>
            <SummaryRows>
              {activeCats.length > 0
                ? activeCats.map((c, i) => (
                    <SummaryRow key={i}>
                      <SummaryKey>Категория {i + 1}</SummaryKey>
                      <SummaryVal>{getCategoryName(c.category, 'bg')}{c.subcategory ? ` → ${getCategoryName(c.subcategory, 'bg')}` : ''}</SummaryVal>
                    </SummaryRow>
                  ))
                : <SummaryRow><SummaryKey>—</SummaryKey><SummaryVal>Не са избрани категории</SummaryVal></SummaryRow>
              }
            </SummaryRows>
          </SummarySection>

          <SummarySection>
            <SummarySectionTitle>📞 Контакти</SummarySectionTitle>
            <SummaryRows>
              <SummaryRow><SummaryKey>Имейл (акаунт)</SummaryKey><SummaryVal>{form.email}</SummaryVal></SummaryRow>
              <SummaryRow><SummaryKey>Телефон</SummaryKey><SummaryVal>{form.phone}</SummaryVal></SummaryRow>
              {form.ownerName && <SummaryRow><SummaryKey>Собственик</SummaryKey><SummaryVal>{form.ownerName}</SummaryVal></SummaryRow>}
              {form.website && <SummaryRow><SummaryKey>Уебсайт</SummaryKey><SummaryVal>{form.website}</SummaryVal></SummaryRow>}
              {form.instagram && <SummaryRow><SummaryKey>Instagram</SummaryKey><SummaryVal>{form.instagram}</SummaryVal></SummaryRow>}
            </SummaryRows>
          </SummarySection>

          <SummarySection>
            <SummarySectionTitle>📋 Партньорство</SummarySectionTitle>
            <SummaryRows>
              <SummaryRow><SummaryKey>Discount Pool</SummaryKey><SummaryVal>{form.discountRate}%</SummaryVal></SummaryRow>
              {(selectedType || form.partnerTypeId) && (
                <SummaryRow><SummaryKey>Тип партньорство</SummaryKey><SummaryVal>{selectedType?.nameBg || selectedType?.name || form.partnerTypeId}</SummaryVal></SummaryRow>
              )}
              <SummaryRow><SummaryKey>Видимост</SummaryKey><SummaryVal>{form.marketingVisibility}</SummaryVal></SummaryRow>
              <SummaryRow><SummaryKey>Статус</SummaryKey><SummaryVal>{form.status}</SummaryVal></SummaryRow>
              <SummaryRow><SummaryKey>Договор подписан</SummaryKey><SummaryVal>{form.contractSigned ? 'Да ✓' : 'Не'}</SummaryVal></SummaryRow>
              {form.contractDuration && <SummaryRow><SummaryKey>Срок</SummaryKey><SummaryVal>{form.contractDuration}</SummaryVal></SummaryRow>}
            </SummaryRows>
          </SummarySection>
        </SummaryGrid>

        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(59,130,246,0.08)', borderRadius: '0.5rem', border: '1px solid rgba(59,130,246,0.2)', fontSize: '0.875rem', color: 'var(--color-info)' }}>
          📧 Ще бъде създаден потребителски акаунт с имейл <strong>{form.email}</strong>. Партньорът може да зададе парола чрез "Забравена парола".
        </div>
      </>
    );
  };

  const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

  return (
    <PageWrapper>
      <PageContainer>
        <PageHeader>
          <PageTitle>🚀 Onboarding на партньор</PageTitle>
          <PageSubtitle>BOOM Card | Партньорски onboarding формуляр</PageSubtitle>
        </PageHeader>

        {/* Stepper */}
        <StepperWrapper>
          {STEPS.map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 && <StepConnector $done={step > i - 1} />}
              <StepItem $active={step === i} $done={step > i}>
                <StepCircle $active={step === i} $done={step > i}>
                  {step > i ? '✓' : i + 1}
                </StepCircle>
                <StepLabel $active={step === i} $done={step > i}>{s.icon} {s.label}</StepLabel>
              </StepItem>
            </React.Fragment>
          ))}
        </StepperWrapper>

        <FormCard
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          <RequiredNote>Полетата маркирани с * са задължителни</RequiredNote>
          {stepContent[step]()}

          <NavButtons>
            <div>
              {step > 0 && (
                <Button variant="secondary" onClick={back} disabled={submitting}>
                  ← Назад
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <Button
                variant="ghost"
                onClick={() => navigate('/admin/partners')}
                disabled={submitting}
              >
                Отказ
              </Button>
              {step < STEPS.length - 1 ? (
                <Button variant="primary" onClick={next}>
                  Напред →
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  isLoading={submitting}
                  disabled={submitting}
                >
                  ✓ Създай партньор
                </Button>
              )}
            </div>
          </NavButtons>
        </FormCard>
      </PageContainer>
    </PageWrapper>
  );
};

export default AdminPartnerOnboardingPage;
