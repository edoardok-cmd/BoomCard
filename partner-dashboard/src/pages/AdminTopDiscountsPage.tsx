import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import { offersService, CreateOfferData, OfferDetails } from '../services/offers.service';
import { partnersService, Partner } from '../services/partners.service';
import { toast } from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ─── Styled Components ────────────────────────────────────────────────────────

const PageContainer = styled.div`
  max-width: 90rem;
  margin: 0 auto;
  padding: 2rem 1rem;
  min-height: calc(100vh - 4rem);
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
`;

const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  font-size: 1.125rem;
  color: var(--color-text-secondary);
`;

const CreateButton = styled.button`
  padding: 0.875rem 1.75rem;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border: none;
  border-radius: 0.875rem;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 200ms;

  &:hover {
    opacity: 0.9;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
  }
`;

const FiltersBar = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 220px;
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 1rem;
  transition: all 200ms;
  background: var(--color-background);
  color: var(--color-text-primary);

  &:focus {
    outline: none;
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }
`;

const FilterSelect = styled.select`
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 1rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  cursor: pointer;
  min-width: 160px;

  &:focus {
    outline: none;
    border-color: #f59e0b;
  }
`;

const Table = styled.div`
  background: var(--color-background);
  border-radius: 1.25rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  border: 1px solid var(--color-border);
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: 2rem 2fr 1.5fr 1fr 1fr 1fr 130px;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border);
  font-weight: 700;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const TableRow = styled(motion.div)`
  display: grid;
  grid-template-columns: 2rem 2fr 1.5fr 1fr 1fr 1fr 130px;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
  align-items: center;

  &:hover { background: var(--color-background-secondary); }
  &:last-child { border-bottom: none; }
`;

const OfferTitle = styled.div`
  font-weight: 600;
  color: var(--color-text-primary);
  font-size: 0.9375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const OfferTitleBg = styled.div`
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PartnerCell = styled.div`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
`;

const DiscountText = styled.span`
  font-weight: 700;
  font-size: 1rem;
  color: #f59e0b;
`;

const StatusBadge = styled.span<{ $status: string }>`
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${({ $status }) =>
    $status === 'ACTIVE' ? '#dcfce7' :
    $status === 'DRAFT' ? '#f3f4f6' :
    $status === 'PAUSED' ? '#fef3c7' : '#fee2e2'};
  color: ${({ $status }) =>
    $status === 'ACTIVE' ? '#166534' :
    $status === 'DRAFT' ? '#374151' :
    $status === 'PAUSED' ? '#92400e' : '#991b1b'};
`;

const OrderBadge = styled.span`
  display: inline-block;
  padding: 0.2rem 0.5rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 0.375rem;
`;

const EditBtn = styled.button`
  padding: 0.375rem 0.75rem;
  background: var(--color-background-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  &:hover { background: var(--color-border); }
`;

const DeleteBtn = styled.button`
  padding: 0.375rem 0.75rem;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #991b1b;
  cursor: pointer;
  &:hover { background: #fecaca; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  color: var(--color-text-tertiary);
`;

const BulkBar = styled(motion.div)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.875rem 1.25rem;
  background: #fffbeb;
  border: 1.5px solid #fcd34d;
  border-radius: 0.875rem;
  margin-bottom: 1rem;
`;

const BulkCount = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #92400e;
`;

const BulkDeleteBtn = styled.button`
  padding: 0.5rem 1.25rem;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 0.625rem;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 150ms;

  &:hover:not(:disabled) { opacity: 0.85; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const RowCheckbox = styled.input.attrs({ type: 'checkbox' })`
  width: 1rem;
  height: 1rem;
  cursor: pointer;
  accent-color: #f59e0b;
`;

// ─── Modal ────────────────────────────────────────────────────────────────────

const Overlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

const Modal = styled(motion.div)`
  background: var(--color-background);
  border-radius: 1.5rem;
  padding: 2rem;
  width: 100%;
  max-width: 760px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
`;

const ModalTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 1.5rem;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const FormField = styled.div<{ $full?: boolean }>`
  grid-column: ${({ $full }) => ($full ? '1 / -1' : 'auto')};
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.375rem;
`;

const Req = styled.span`
  color: #dc2626;
  margin-left: 0.25rem;
`;

const Input = styled.input<{ $error?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid ${({ $error }) => ($error ? '#dc2626' : 'var(--color-border)')};
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  transition: border-color 200ms;
  box-sizing: border-box;
  background: var(--color-background);
  color: var(--color-text-primary);
  &:focus {
    outline: none;
    border-color: ${({ $error }) => ($error ? '#dc2626' : '#f59e0b')};
    box-shadow: 0 0 0 3px ${({ $error }) => ($error ? 'rgba(220,38,38,0.1)' : 'rgba(245,158,11,0.1)')};
  }
`;

const Textarea = styled.textarea<{ $error?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid ${({ $error }) => ($error ? '#dc2626' : 'var(--color-border)')};
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  resize: vertical;
  min-height: 80px;
  box-sizing: border-box;
  transition: border-color 200ms;
  background: var(--color-background);
  color: var(--color-text-primary);
  &:focus {
    outline: none;
    border-color: ${({ $error }) => ($error ? '#dc2626' : '#f59e0b')};
    box-shadow: 0 0 0 3px ${({ $error }) => ($error ? 'rgba(220,38,38,0.1)' : 'rgba(245,158,11,0.1)')};
  }
`;

const Select = styled.select<{ $error?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid ${({ $error }) => ($error ? '#dc2626' : 'var(--color-border)')};
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  cursor: pointer;
  box-sizing: border-box;
  &:focus {
    outline: none;
    border-color: ${({ $error }) => ($error ? '#dc2626' : '#f59e0b')};
  }
`;

const ErrorMsg = styled.p`
  color: #dc2626;
  font-size: 0.8125rem;
  margin-top: 0.25rem;
`;

const SectionDivider = styled.div`
  grid-column: 1 / -1;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
  margin-top: 0.25rem;
`;

const ImageUploadZone = styled.div<{ $isDragging?: boolean; $hasImage?: boolean; $error?: boolean }>`
  border: 2px dashed ${({ $error, $isDragging, $hasImage }) =>
    $error ? '#dc2626' :
    $isDragging ? '#f59e0b' :
    $hasImage ? '#d97706' :
    'var(--color-border)'};
  border-radius: 0.75rem;
  padding: 1.5rem;
  text-align: center;
  cursor: pointer;
  background: ${({ $isDragging }) => ($isDragging ? '#fffbeb' : 'var(--color-background)')};
  transition: all 200ms;
  margin-top: 0.5rem;

  &:hover {
    border-color: #f59e0b;
    background: #fffbeb;
  }
`;

const ImagePreview = styled.img`
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: 0.625rem;
  margin-bottom: 0.75rem;
`;

const ImageUploadText = styled.p`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0;
`;

const ImageUploadHint = styled.p`
  font-size: 0.75rem;
  color: var(--color-text-tertiary);
  margin: 0.25rem 0 0;
`;

const UploadingSpinner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #f59e0b;
`;

const TagsFilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const TagChip = styled.button<{ $active: boolean }>`
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  border: 2px solid ${({ $active }) => ($active ? '#f59e0b' : 'var(--color-border)')};
  background: ${({ $active }) => ($active ? '#fef3c7' : 'var(--color-background)')};
  color: ${({ $active }) => ($active ? '#92400e' : 'var(--color-text-secondary)')};
  transition: all 150ms;
`;

const TagInputWrapper = styled.div`
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  min-height: 3rem;
  cursor: text;
  transition: border-color 200ms;
  background: var(--color-background);
  &:focus-within { border-color: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,0.1); }
`;

const TagBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
`;

const TagRemoveBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: #92400e;
  padding: 0;
  font-size: 0.9rem;
  line-height: 1;
`;

const TagTextField = styled.input`
  border: none;
  outline: none;
  font-size: 0.9375rem;
  padding: 0.25rem 0.375rem;
  flex: 1;
  min-width: 100px;
  background: transparent;
`;

const ToggleLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  cursor: pointer;
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
`;

const ToggleBox = styled.input.attrs({ type: 'checkbox' })`
  width: 2.5rem;
  height: 1.5rem;
  appearance: none;
  background: #e5e7eb;
  border-radius: 9999px;
  position: relative;
  cursor: pointer;
  transition: background 200ms;
  flex-shrink: 0;

  &:checked { background: #f59e0b; }
  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 1.25rem;
    height: 1.25rem;
    background: white;
    border-radius: 50%;
    transition: transform 200ms;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  &:checked::after { transform: translateX(1rem); }
`;

const ModalActions = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
  justify-content: flex-end;
`;

const CancelBtn = styled.button`
  padding: 0.75rem 1.5rem;
  background: var(--color-background-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
`;

const SaveBtn = styled.button`
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border: none;
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 700;
  cursor: pointer;
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const OFFER_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED'] as const;

interface FormErrors {
  partnerId?: string;
  title?: string;
  titleBg?: string;
  description?: string;
  descriptionBg?: string;
  image?: string;
  discountPercent?: string;
  startDate?: string;
  endDate?: string;
  termsConditions?: string;
  termsConditionsBg?: string;
}

function buildEmptyForm() {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  return {
    partnerId: '',
    title: '',
    titleBg: '',
    description: '',
    descriptionBg: '',
    discountPercent: undefined as number | undefined,
    minPurchase: undefined as number | undefined,
    maxDiscount: undefined as number | undefined,
    termsConditions: '',
    termsConditionsBg: '',
    image: '',
    tags: [] as string[],
    startDate: now.toISOString().slice(0, 10),
    endDate: future.toISOString().slice(0, 10),
    usageLimit: undefined as number | undefined,
    featuredOrder: undefined as number | undefined,
    status: 'ACTIVE' as const,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminTopDiscountsPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editingOffer, setEditingOffer] = useState<OfferDetails | null>(null);
  const [form, setForm] = useState(buildEmptyForm());
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [filterSearch, setFilterSearch] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: offersData, isLoading } = useQuery({
    queryKey: ['admin-top-discounts', filterPartner, filterStatus, filterSearch, filterTags],
    queryFn: () =>
      offersService.getOffers({
        partnerId: filterPartner || undefined,
        status: filterStatus || undefined,
        search: filterSearch || undefined,
        tags: filterTags.length > 0 ? filterTags : undefined,
        featured: true,
        limit: 100,
      } as any),
  });

  const { data: partnersData } = useQuery({
    queryKey: ['admin-partners-select'],
    queryFn: async () => {
      const res = await partnersService.getPartners({ limit: 300 } as any);
      return (res as any).data ?? [];
    },
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ['offer-tags'],
    queryFn: () => offersService.getOfferTags(),
  });

  const allPartners: Partner[] = partnersData ?? [];
  const offers: OfferDetails[] = (offersData as any)?.data ?? [];

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (data: CreateOfferData) => {
      const offer = await offersService.createOffer(data);
      if (imageFile) {
        setIsUploadingImage(true);
        try {
          await offersService.uploadOfferImage(offer.id, imageFile);
        } finally {
          setIsUploadingImage(false);
        }
      }
      return offer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-top-discounts'] });
      queryClient.invalidateQueries({ queryKey: ['offer-tags'] });
      toast.success(language === 'bg' ? 'Топ отстъпката е създадена' : 'Top discount created');
      closeModal();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to create top discount'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateOfferData> }) => {
      const offer = await offersService.updateOffer(id, data);
      if (imageFile) {
        setIsUploadingImage(true);
        try {
          await offersService.uploadOfferImage(id, imageFile);
        } finally {
          setIsUploadingImage(false);
        }
      }
      return offer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-top-discounts'] });
      queryClient.invalidateQueries({ queryKey: ['offer-tags'] });
      toast.success(language === 'bg' ? 'Топ отстъпката е обновена' : 'Top discount updated');
      closeModal();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to update top discount'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => offersService.deleteOffer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-top-discounts'] });
      toast.success(language === 'bg' ? 'Офертата е изтрита' : 'Offer deleted');
    },
    onError: () => toast.error('Failed to delete offer'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => offersService.bulkDeleteOffers(ids),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin-top-discounts'] });
      toast.success(`${data.deleted} offer${data.deleted !== 1 ? 's' : ''} deleted`);
      setSelectedIds(new Set());
    },
    onError: () => toast.error('Bulk delete failed'),
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingOffer(null);
    setForm(buildEmptyForm());
    setFormErrors({});
    setSelectedTags([]);
    setTagInput('');
    setImageFile(null);
    setImagePreview('');
    setShowModal(true);
  }

  function openEdit(offer: OfferDetails) {
    setEditingOffer(offer);
    const o = offer as any;
    setForm({
      partnerId: o.partnerId || o.partner?.id || '',
      title: o.title || '',
      titleBg: o.titleBg || '',
      description: o.description || '',
      descriptionBg: o.descriptionBg || '',
      discountPercent: o.discountPercent,
      minPurchase: o.minPurchase,
      maxDiscount: o.maxDiscount,
      termsConditions: o.termsConditions || '',
      termsConditionsBg: o.termsConditionsBg || '',
      image: o.image || o.imageUrl || '',
      tags: o.tags || [],
      startDate: o.startDate ? new Date(o.startDate).toISOString().slice(0, 10) : '',
      endDate: o.endDate ? new Date(o.endDate).toISOString().slice(0, 10) : '',
      usageLimit: o.usageLimit || undefined,
      featuredOrder: o.featuredOrder || undefined,
      status: o.status || 'ACTIVE',
    });
    setFormErrors({});
    setSelectedTags(o.tags || []);
    setTagInput('');
    setImageFile(null);
    setImagePreview(o.image || o.imageUrl || '');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingOffer(null);
    setImageFile(null);
    setImagePreview('');
  }

  function handleImageSelect(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPG, PNG, WebP images are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setFormErrors(prev => ({ ...prev, image: undefined }));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageSelect(file);
  }

  function addTag(tag: string) {
    const clean = tag.trim().toLowerCase();
    if (!clean || selectedTags.includes(clean)) return;
    setSelectedTags(t => [...t, clean]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setSelectedTags(t => t.filter(x => x !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && selectedTags.length > 0) {
      setSelectedTags(t => t.slice(0, -1));
    }
  }

  function validate(): boolean {
    const errors: FormErrors = {};
    if (!form.partnerId) errors.partnerId = 'Required';
    if (!form.title.trim()) errors.title = 'Required';
    if (!form.titleBg.trim()) errors.titleBg = 'Required';
    if (!form.description.trim()) errors.description = 'Required';
    if (!form.descriptionBg.trim()) errors.descriptionBg = 'Required';
    if (!imageFile && !imagePreview) errors.image = 'An image is required';
    if (!form.discountPercent) {
      errors.discountPercent = 'Required';
    } else if (form.discountPercent < 1 || form.discountPercent > 100) {
      errors.discountPercent = 'Must be 1–100';
    }
    if (!form.startDate) errors.startDate = 'Required';
    if (!form.endDate) {
      errors.endDate = 'Required';
    } else if (form.startDate && form.endDate <= form.startDate) {
      errors.endDate = 'Must be after start date';
    }
    if (!form.termsConditions.trim()) errors.termsConditions = 'Required';
    if (!form.termsConditionsBg.trim()) errors.termsConditionsBg = 'Required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSave() {
    if (!validate()) return;

    const payload: CreateOfferData = {
      partnerId: form.partnerId,
      title: form.title,
      titleBg: form.titleBg,
      description: form.description,
      descriptionBg: form.descriptionBg,
      type: 'DISCOUNT',
      discountPercent: form.discountPercent,
      minPurchase: form.minPurchase,
      maxDiscount: form.maxDiscount,
      termsConditions: form.termsConditions,
      termsConditionsBg: form.termsConditionsBg,
      image: form.image || undefined,
      tags: selectedTags,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      usageLimit: form.usageLimit,
      isFeatured: true,
      featuredOrder: form.featuredOrder,
      status: form.status,
    };

    if (editingOffer) {
      updateMutation.mutate({ id: editingOffer.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(offer: OfferDetails) {
    if (!window.confirm(`Delete "${offer.title}"?`)) return;
    deleteMutation.mutate(offer.id);
  }

  function toggleFilterTag(tag: string) {
    setFilterTags(t => t.includes(tag) ? t.filter(x => x !== tag) : [...t, tag]);
  }

  function toggleSelectOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === offers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(offers.map(o => o.id)));
    }
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} offer${selectedIds.size !== 1 ? 's' : ''}?`)) return;
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader>
        <div>
          <Title>⭐ Топ Отстъпки</Title>
          <Subtitle>
            {language === 'bg'
              ? 'Управлявайте featured оферти — всички полета и снимка са задължителни.'
              : 'Manage featured "Top Discounts" — all fields and image are required.'}
          </Subtitle>
        </div>
        <CreateButton onClick={openCreate}>+ Нова Топ Отстъпка</CreateButton>
      </PageHeader>

      {/* Filters */}
      <FiltersBar>
        <SearchInput
          placeholder={language === 'bg' ? 'Търси оферти…' : 'Search offers…'}
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
        />
        <FilterSelect value={filterPartner} onChange={e => setFilterPartner(e.target.value)}>
          <option value="">{language === 'bg' ? 'Всички партньори' : 'All Partners'}</option>
          {allPartners.map(p => <option key={p.id} value={p.id}>{p.businessName}</option>)}
        </FilterSelect>
        <FilterSelect value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{language === 'bg' ? 'Всички статуси' : 'All Statuses'}</option>
          {OFFER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </FilterSelect>
      </FiltersBar>

      {allTags.length > 0 && (
        <TagsFilterRow>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b7280' }}>Tags:</span>
          {allTags.map(tag => (
            <TagChip key={tag} $active={filterTags.includes(tag)} onClick={() => toggleFilterTag(tag)}>
              {tag}
            </TagChip>
          ))}
        </TagsFilterRow>
      )}

      {/* Bulk bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <BulkBar initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <BulkCount>{selectedIds.size} selected</BulkCount>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setSelectedIds(new Set())}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: '#92400e', fontWeight: 600 }}
              >
                Clear
              </button>
              <BulkDeleteBtn onClick={handleBulkDelete} disabled={bulkDeleteMutation.isPending}>
                {bulkDeleteMutation.isPending ? 'Deleting…' : `Delete ${selectedIds.size}`}
              </BulkDeleteBtn>
            </div>
          </BulkBar>
        )}
      </AnimatePresence>

      {/* Table */}
      <Table>
        <TableHeader>
          <RowCheckbox
            checked={offers.length > 0 && selectedIds.size === offers.length}
            ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < offers.length; }}
            onChange={toggleSelectAll}
          />
          <span>{language === 'bg' ? 'Оферта' : 'Offer'}</span>
          <span>{language === 'bg' ? 'Партньор' : 'Partner'}</span>
          <span>{language === 'bg' ? 'Отстъпка' : 'Discount'}</span>
          <span>{language === 'bg' ? 'Статус' : 'Status'}</span>
          <span>{language === 'bg' ? 'Ред' : 'Order'}</span>
          <span>{language === 'bg' ? 'Действия' : 'Actions'}</span>
        </TableHeader>

        {isLoading ? (
          <EmptyState>Loading…</EmptyState>
        ) : offers.length === 0 ? (
          <EmptyState>
            {language === 'bg' ? 'Няма топ отстъпки.' : 'No top discounts yet.'}
          </EmptyState>
        ) : (
          offers.map(offer => {
            const o = offer as any;
            return (
              <TableRow key={offer.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <RowCheckbox
                  checked={selectedIds.has(offer.id)}
                  onChange={() => toggleSelectOne(offer.id)}
                />
                <div>
                  <OfferTitle title={offer.title}>{offer.title}</OfferTitle>
                  {o.titleBg && <OfferTitleBg>{o.titleBg}</OfferTitleBg>}
                </div>

                <PartnerCell>
                  {offer.partner?.businessName || offer.partner?.businessNameBg || '—'}
                  {offer.partner?.partnerType && (
                    <span style={{
                      display: 'inline-block', marginLeft: '0.375rem',
                      padding: '0.125rem 0.375rem', borderRadius: '9999px',
                      fontSize: '0.6875rem', fontWeight: 700,
                      background: offer.partner.partnerType.color + '22',
                      color: offer.partner.partnerType.color,
                      border: `1px solid ${offer.partner.partnerType.color}44`,
                    }}>
                      {offer.partner.partnerType.name}
                    </span>
                  )}
                </PartnerCell>

                <DiscountText>
                  {o.discountPercent ? `${o.discountPercent}%` : '—'}
                </DiscountText>

                <StatusBadge $status={o.status || 'DRAFT'}>{o.status || 'DRAFT'}</StatusBadge>

                <div>
                  {o.featuredOrder != null
                    ? <OrderBadge>#{o.featuredOrder}</OrderBadge>
                    : <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.8125rem' }}>—</span>}
                </div>

                <ActionButtons>
                  <EditBtn onClick={() => openEdit(offer)}>{language === 'bg' ? 'Редакция' : 'Edit'}</EditBtn>
                  <DeleteBtn onClick={() => handleDelete(offer)}>{language === 'bg' ? 'Изтрий' : 'Del'}</DeleteBtn>
                </ActionButtons>
              </TableRow>
            );
          })
        )}
      </Table>

      {/* ─── Create / Edit Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <Overlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && closeModal()}
          >
            <Modal
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <ModalTitle>
                {editingOffer
                  ? (language === 'bg' ? '✏️ Редактирай Топ Отстъпка' : '✏️ Edit Top Discount')
                  : (language === 'bg' ? '⭐ Нова Топ Отстъпка' : '⭐ Create Top Discount')}
              </ModalTitle>

              <FormGrid>
                {/* Partner */}
                <FormField $full>
                  <Label>{language === 'bg' ? 'Партньор' : 'Partner'}<Req>*</Req></Label>
                  <Select
                    value={form.partnerId}
                    onChange={e => { setForm(f => ({ ...f, partnerId: e.target.value })); setFormErrors(prev => ({ ...prev, partnerId: undefined })); }}
                    disabled={!!editingOffer}
                    $error={!!formErrors.partnerId}
                  >
                    <option value="">{language === 'bg' ? '— Изберете партньор —' : '— Select partner —'}</option>
                    {allPartners.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.businessName}{p.partnerType ? ` [${p.partnerType.name}]` : ''}
                      </option>
                    ))}
                  </Select>
                  {formErrors.partnerId && <ErrorMsg>{formErrors.partnerId}</ErrorMsg>}
                </FormField>

                {/* Titles */}
                <FormField>
                  <Label>Title (EN)<Req>*</Req></Label>
                  <Input
                    value={form.title}
                    onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setFormErrors(prev => ({ ...prev, title: undefined })); }}
                    placeholder="e.g. 20% off all spa treatments"
                    $error={!!formErrors.title}
                  />
                  {formErrors.title && <ErrorMsg>{formErrors.title}</ErrorMsg>}
                </FormField>
                <FormField>
                  <Label>Заглавие (BG)<Req>*</Req></Label>
                  <Input
                    value={form.titleBg}
                    onChange={e => { setForm(f => ({ ...f, titleBg: e.target.value })); setFormErrors(prev => ({ ...prev, titleBg: undefined })); }}
                    placeholder="напр. 20% отстъпка на спа"
                    $error={!!formErrors.titleBg}
                  />
                  {formErrors.titleBg && <ErrorMsg>{formErrors.titleBg}</ErrorMsg>}
                </FormField>

                {/* Descriptions */}
                <FormField $full>
                  <Label>Description (EN)<Req>*</Req></Label>
                  <Textarea
                    value={form.description}
                    onChange={e => { setForm(f => ({ ...f, description: e.target.value })); setFormErrors(prev => ({ ...prev, description: undefined })); }}
                    placeholder="Describe the offer in English"
                    $error={!!formErrors.description}
                  />
                  {formErrors.description && <ErrorMsg>{formErrors.description}</ErrorMsg>}
                </FormField>
                <FormField $full>
                  <Label>Описание (BG)<Req>*</Req></Label>
                  <Textarea
                    value={form.descriptionBg}
                    onChange={e => { setForm(f => ({ ...f, descriptionBg: e.target.value })); setFormErrors(prev => ({ ...prev, descriptionBg: undefined })); }}
                    placeholder="Опишете офертата на български"
                    $error={!!formErrors.descriptionBg}
                  />
                  {formErrors.descriptionBg && <ErrorMsg>{formErrors.descriptionBg}</ErrorMsg>}
                </FormField>

                {/* Image — required */}
                <FormField $full>
                  <Label>{language === 'bg' ? 'Снимка' : 'Image'}<Req>*</Req></Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }}
                  />
                  <ImageUploadZone
                    $isDragging={isDragging}
                    $hasImage={!!imagePreview}
                    $error={!!formErrors.image}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    {isUploadingImage ? (
                      <UploadingSpinner>Uploading image…</UploadingSpinner>
                    ) : imagePreview ? (
                      <>
                        <ImagePreview src={imagePreview} alt="preview" />
                        <ImageUploadText>
                          {language === 'bg' ? 'Кликнете за смяна на снимката' : 'Click to replace image'}
                        </ImageUploadText>
                      </>
                    ) : (
                      <>
                        <ImageUploadText>
                          {language === 'bg' ? '📷 Кликнете или пуснете снимка тук' : '📷 Click or drag & drop an image here'}
                        </ImageUploadText>
                        <ImageUploadHint>JPG, PNG, WebP · max 5MB</ImageUploadHint>
                      </>
                    )}
                  </ImageUploadZone>
                  {formErrors.image && <ErrorMsg>{formErrors.image}</ErrorMsg>}
                </FormField>

                {/* Discount & order */}
                <SectionDivider>{language === 'bg' ? 'Детайли на офертата' : 'Offer Details'}</SectionDivider>

                <FormField>
                  <Label>{language === 'bg' ? 'Отстъпка %' : 'Discount %'}<Req>*</Req></Label>
                  <Input
                    type="number" min={1} max={100} step={1}
                    value={form.discountPercent ?? ''}
                    onChange={e => { setForm(f => ({ ...f, discountPercent: e.target.value ? Number(e.target.value) : undefined })); setFormErrors(prev => ({ ...prev, discountPercent: undefined })); }}
                    placeholder="e.g. 20"
                    $error={!!formErrors.discountPercent}
                  />
                  {formErrors.discountPercent && <ErrorMsg>{formErrors.discountPercent}</ErrorMsg>}
                </FormField>

                <FormField>
                  <Label>{language === 'bg' ? 'Ред за показване' : 'Featured Order'}</Label>
                  <Input
                    type="number" min={1} step={1}
                    value={form.featuredOrder ?? ''}
                    onChange={e => setForm(f => ({ ...f, featuredOrder: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder={language === 'bg' ? 'напр. 1 = първи' : 'e.g. 1 = first'}
                  />
                </FormField>

                <FormField>
                  <Label>{language === 'bg' ? 'Мин. покупка' : 'Min. Purchase'}</Label>
                  <Input
                    type="number" min={0} step={0.01}
                    value={form.minPurchase ?? ''}
                    onChange={e => setForm(f => ({ ...f, minPurchase: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="e.g. 50.00"
                  />
                </FormField>

                <FormField>
                  <Label>{language === 'bg' ? 'Макс. отстъпка (cap)' : 'Max Discount Cap'}</Label>
                  <Input
                    type="number" min={0} step={0.01}
                    value={form.maxDiscount ?? ''}
                    onChange={e => setForm(f => ({ ...f, maxDiscount: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="e.g. 100.00"
                  />
                </FormField>

                {/* Dates */}
                <FormField>
                  <Label>{language === 'bg' ? 'Начална дата' : 'Start Date'}<Req>*</Req></Label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={e => { setForm(f => ({ ...f, startDate: e.target.value })); setFormErrors(prev => ({ ...prev, startDate: undefined })); }}
                    $error={!!formErrors.startDate}
                  />
                  {formErrors.startDate && <ErrorMsg>{formErrors.startDate}</ErrorMsg>}
                </FormField>
                <FormField>
                  <Label>{language === 'bg' ? 'Крайна дата' : 'End Date'}<Req>*</Req></Label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={e => { setForm(f => ({ ...f, endDate: e.target.value })); setFormErrors(prev => ({ ...prev, endDate: undefined })); }}
                    $error={!!formErrors.endDate}
                  />
                  {formErrors.endDate && <ErrorMsg>{formErrors.endDate}</ErrorMsg>}
                </FormField>

                <FormField>
                  <Label>{language === 'bg' ? 'Лимит използвания' : 'Usage Limit'}</Label>
                  <Input
                    type="number" min={1} step={1}
                    value={form.usageLimit ?? ''}
                    onChange={e => setForm(f => ({ ...f, usageLimit: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder={language === 'bg' ? 'Неограничен' : 'Unlimited'}
                  />
                </FormField>

                <FormField>
                  <Label>{language === 'bg' ? 'Статус' : 'Status'}</Label>
                  <Select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}
                  >
                    {OFFER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </FormField>

                {/* Tags */}
                <FormField $full>
                  <Label>Tags</Label>
                  <TagInputWrapper onClick={() => document.getElementById('top-discount-tag-field')?.focus()}>
                    {selectedTags.map(tag => (
                      <TagBadge key={tag}>
                        {tag}
                        <TagRemoveBtn type="button" onClick={() => removeTag(tag)}>×</TagRemoveBtn>
                      </TagBadge>
                    ))}
                    <TagTextField
                      id="top-discount-tag-field"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onBlur={() => tagInput && addTag(tagInput)}
                      placeholder={selectedTags.length === 0 ? 'Type a tag and press Enter…' : ''}
                    />
                  </TagInputWrapper>
                  {allTags.filter(t => !selectedTags.includes(t)).length > 0 && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                      {allTags.filter(t => !selectedTags.includes(t)).map(tag => (
                        <TagChip key={tag} $active={false} onClick={() => addTag(tag)} style={{ fontSize: '0.75rem' }}>
                          + {tag}
                        </TagChip>
                      ))}
                    </div>
                  )}
                </FormField>

                {/* Terms — both required */}
                <SectionDivider>{language === 'bg' ? 'Условия и наредби' : 'Terms & Conditions'}</SectionDivider>
                <FormField $full>
                  <Label>Terms & Conditions (EN)<Req>*</Req></Label>
                  <Textarea
                    value={form.termsConditions}
                    onChange={e => { setForm(f => ({ ...f, termsConditions: e.target.value })); setFormErrors(prev => ({ ...prev, termsConditions: undefined })); }}
                    placeholder="Terms and conditions in English"
                    $error={!!formErrors.termsConditions}
                  />
                  {formErrors.termsConditions && <ErrorMsg>{formErrors.termsConditions}</ErrorMsg>}
                </FormField>
                <FormField $full>
                  <Label>Условия (BG)<Req>*</Req></Label>
                  <Textarea
                    value={form.termsConditionsBg}
                    onChange={e => { setForm(f => ({ ...f, termsConditionsBg: e.target.value })); setFormErrors(prev => ({ ...prev, termsConditionsBg: undefined })); }}
                    placeholder="Условия и наредби на български"
                    $error={!!formErrors.termsConditionsBg}
                  />
                  {formErrors.termsConditionsBg && <ErrorMsg>{formErrors.termsConditionsBg}</ErrorMsg>}
                </FormField>
              </FormGrid>

              <ModalActions>
                <CancelBtn onClick={closeModal}>
                  {language === 'bg' ? 'Отказ' : 'Cancel'}
                </CancelBtn>
                <SaveBtn onClick={handleSave} disabled={isSaving || isUploadingImage}>
                  {isSaving || isUploadingImage
                    ? (language === 'bg' ? 'Запазване…' : 'Saving…')
                    : editingOffer
                      ? (language === 'bg' ? 'Запази промените' : 'Save Changes')
                      : (language === 'bg' ? 'Създай Топ Отстъпка' : 'Create Top Discount')}
                </SaveBtn>
              </ModalActions>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}
