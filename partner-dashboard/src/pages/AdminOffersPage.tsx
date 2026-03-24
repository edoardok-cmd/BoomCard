import React, { useState } from 'react';
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
  background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
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
  background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
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
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
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
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
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
    border-color: #dc2626;
  }
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
  border: 2px solid ${({ $active }) => ($active ? '#dc2626' : 'var(--color-border)')};
  background: ${({ $active }) => ($active ? '#fee2e2' : 'var(--color-background)')};
  color: ${({ $active }) => ($active ? '#991b1b' : 'var(--color-text-secondary)')};
  transition: all 150ms;
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
  grid-template-columns: 2rem 2fr 1.5fr 1fr 1fr 1fr 1fr 1fr 130px;
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
  grid-template-columns: 2rem 2fr 1.5fr 1fr 1fr 1fr 1fr 1fr 130px;
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

const TypeBadge = styled.span`
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-weight: 600;
`;

const DiscountText = styled.span`
  font-weight: 700;
  font-size: 1rem;
  color: #dc2626;
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

const StarButton = styled.button<{ $active: boolean }>`
  font-size: 1.25rem;
  background: none;
  border: none;
  cursor: pointer;
  opacity: ${({ $active }) => ($active ? 1 : 0.25)};
  transition: opacity 150ms;

  &:hover { opacity: 0.7; }
`;

const TagsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
`;

const Tag = styled.span`
  padding: 0.125rem 0.5rem;
  background: var(--color-background-tertiary);
  border-radius: 9999px;
  font-size: 0.6875rem;
  color: var(--color-text-secondary);
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
  background: #fff7ed;
  border: 1.5px solid #fed7aa;
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
  accent-color: #dc2626;
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
  max-width: 720px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
`;

const ModalTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--color-text-primary);
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

const Input = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  transition: border-color 200ms;
  box-sizing: border-box;
  background: var(--color-background);
  color: var(--color-text-primary);
  &:focus { outline: none; border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.1); }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  resize: vertical;
  min-height: 80px;
  box-sizing: border-box;
  transition: border-color 200ms;
  background: var(--color-background);
  color: var(--color-text-primary);
  &:focus { outline: none; border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.1); }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  cursor: pointer;
  box-sizing: border-box;
  &:focus { outline: none; border-color: #dc2626; }
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

const ImagePreview = styled.img`
  width: 100%;
  height: 140px;
  object-fit: cover;
  border-radius: 0.75rem;
  border: 2px solid var(--color-border);
  margin-top: 0.5rem;
`;

const ImagePlaceholder = styled.div`
  width: 100%;
  height: 100px;
  border: 2px dashed var(--color-border);
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  font-size: 0.875rem;
  cursor: pointer;
  margin-top: 0.5rem;
  transition: border-color 200ms;
  &:hover { border-color: #dc2626; color: #dc2626; }
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
  &:focus-within { border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.1); }
`;

const TagBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
`;

const TagRemoveBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: #991b1b;
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

  &:checked { background: #dc2626; }
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
  background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
  color: white;
  border: none;
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 700;
  cursor: pointer;
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

// ─── Constants ────────────────────────────────────────────────────────────────

const OFFER_TYPES = ['DISCOUNT', 'CASHBACK', 'POINTS', 'BUNDLE', 'SEASONAL'] as const;
const OFFER_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED'] as const;

function buildEmptyForm(): Partial<CreateOfferData> {
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  return {
    partnerId: '',
    title: '',
    titleBg: '',
    description: '',
    descriptionBg: '',
    type: 'DISCOUNT',
    discountPercent: undefined,
    discountAmount: undefined,
    cashbackPercent: undefined,
    pointsMultiplier: undefined,
    minPurchase: undefined,
    maxDiscount: undefined,
    termsConditions: '',
    termsConditionsBg: '',
    image: '',
    tags: [],
    startDate: now.toISOString().slice(0, 10),
    endDate: future.toISOString().slice(0, 10),
    usageLimit: undefined,
    isFeatured: false,
    status: 'DRAFT',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminOffersPage() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editingOffer, setEditingOffer] = useState<OfferDetails | null>(null);
  const [form, setForm] = useState<Partial<CreateOfferData>>(buildEmptyForm());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter state
  const [filterSearch, setFilterSearch] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: offersData, isLoading } = useQuery({
    queryKey: ['admin-offers', filterPartner, filterStatus, filterSearch, filterTags],
    queryFn: () =>
      offersService.getOffers({
        partnerId: filterPartner || undefined,
        status: filterStatus || undefined,
        search: filterSearch || undefined,
        tags: filterTags.length > 0 ? filterTags : undefined,
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
    mutationFn: (data: CreateOfferData) => offersService.createOffer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer-tags'] });
      toast.success('Offer created');
      closeModal();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to create offer'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateOfferData> }) =>
      offersService.updateOffer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer-tags'] });
      toast.success('Offer updated');
      closeModal();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to update offer'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => offersService.deleteOffer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      toast.success('Offer deleted');
    },
    onError: () => toast.error('Failed to delete offer'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => offersService.bulkDeleteOffers(ids),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      toast.success(`${data.deleted} offer${data.deleted !== 1 ? 's' : ''} deleted`);
      setSelectedIds(new Set());
    },
    onError: () => toast.error('Bulk delete failed'),
  });

  const featuredMutation = useMutation({
    mutationFn: ({ id, isFeatured }: { id: string; isFeatured: boolean }) =>
      offersService.toggleFeaturedStatus(id, isFeatured),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-offers'] }),
    onError: () => toast.error('Failed to update featured status'),
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingOffer(null);
    setForm(buildEmptyForm());
    setSelectedTags([]);
    setTagInput('');
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
      type: o.type || 'DISCOUNT',
      discountPercent: o.discountPercent,
      discountAmount: o.discountAmount,
      cashbackPercent: o.cashbackPercent,
      pointsMultiplier: o.pointsMultiplier,
      minPurchase: o.minPurchase,
      maxDiscount: o.maxDiscount,
      termsConditions: o.termsConditions || '',
      termsConditionsBg: o.termsConditionsBg || '',
      image: o.image || o.imageUrl || '',
      tags: o.tags || [],
      startDate: o.startDate ? new Date(o.startDate).toISOString().slice(0, 10) : '',
      endDate: o.endDate ? new Date(o.endDate).toISOString().slice(0, 10) : '',
      usageLimit: o.usageLimit || undefined,
      isFeatured: o.isFeatured || false,
      status: o.status || 'DRAFT',
    });
    setSelectedTags(o.tags || []);
    setTagInput('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingOffer(null);
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

  function handleSave() {
    if (!form.partnerId) return toast.error('Please select a partner');
    if (!form.title?.trim()) return toast.error('Title (EN) is required');
    if (!form.description?.trim()) return toast.error('Description (EN) is required');
    if (!form.startDate) return toast.error('Start date is required');
    if (!form.endDate) return toast.error('End date is required');

    const payload: CreateOfferData = {
      ...(form as any),
      tags: selectedTags,
      startDate: new Date(form.startDate as string).toISOString(),
      endDate: new Date(form.endDate as string).toISOString(),
    };

    if (editingOffer) {
      updateMutation.mutate({ id: editingOffer.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(offer: OfferDetails) {
    if (!window.confirm(`Delete offer "${offer.title}"?`)) return;
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
    if (!window.confirm(`Delete ${selectedIds.size} selected offer${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader>
        <div>
          <Title>Manage Offers</Title>
          <Subtitle>Create and manage offers for all partners — bilingual titles, photos, tags, discounts, and access settings.</Subtitle>
        </div>
        <CreateButton onClick={openCreate}>+ Create Offer</CreateButton>
      </PageHeader>

      {/* Filters */}
      <FiltersBar>
        <SearchInput
          placeholder="Search offers…"
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
        />
        <FilterSelect value={filterPartner} onChange={e => setFilterPartner(e.target.value)}>
          <option value="">All Partners</option>
          {allPartners.map(p => <option key={p.id} value={p.id}>{p.businessName}</option>)}
        </FilterSelect>
        <FilterSelect value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
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

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <BulkBar
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <BulkCount>{selectedIds.size} offer{selectedIds.size !== 1 ? 's' : ''} selected</BulkCount>
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
          <span>Offer</span>
          <span>Partner</span>
          <span>Type</span>
          <span>Discount</span>
          <span>Status</span>
          <span>★</span>
          <span>Tags</span>
          <span>Actions</span>
        </TableHeader>

        {isLoading ? (
          <EmptyState>Loading…</EmptyState>
        ) : offers.length === 0 ? (
          <EmptyState>No offers match your filters.</EmptyState>
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

                <TypeBadge>{o.type || '—'}</TypeBadge>

                <DiscountText>
                  {o.discountPercent ? `${o.discountPercent}%` :
                   o.cashbackPercent ? `${o.cashbackPercent}% CB` :
                   o.discountAmount ? `${o.discountAmount} BGN` : '—'}
                </DiscountText>

                <StatusBadge $status={o.status || 'DRAFT'}>{o.status || 'DRAFT'}</StatusBadge>

                <StarButton
                  $active={offer.isFeatured || false}
                  onClick={() => featuredMutation.mutate({ id: offer.id, isFeatured: !offer.isFeatured })}
                  title={offer.isFeatured ? 'Remove from featured' : 'Mark as featured'}
                >
                  ★
                </StarButton>

                <TagsList>
                  {(offer.tags || []).map(tag => <Tag key={tag}>{tag}</Tag>)}
                </TagsList>

                <ActionButtons>
                  <EditBtn onClick={() => openEdit(offer)}>Edit</EditBtn>
                  <DeleteBtn onClick={() => handleDelete(offer)}>Del</DeleteBtn>
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
              <ModalTitle>{editingOffer ? 'Edit Offer' : 'Create Offer'}</ModalTitle>

              <FormGrid>
                {/* Partner */}
                <FormField $full>
                  <Label>Partner<Req>*</Req></Label>
                  <Select
                    value={form.partnerId || ''}
                    onChange={e => setForm(f => ({ ...f, partnerId: e.target.value }))}
                    disabled={!!editingOffer}
                  >
                    <option value="">— Select partner —</option>
                    {allPartners.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.businessName}{p.partnerType ? ` [${p.partnerType.name}]` : ''}
                      </option>
                    ))}
                  </Select>
                </FormField>

                {/* Titles */}
                <FormField>
                  <Label>Title (EN)<Req>*</Req></Label>
                  <Input
                    value={form.title || ''}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. 20% off all spa treatments"
                  />
                </FormField>
                <FormField>
                  <Label>Title (BG)</Label>
                  <Input
                    value={form.titleBg || ''}
                    onChange={e => setForm(f => ({ ...f, titleBg: e.target.value }))}
                    placeholder="Напр. 20% отстъпка на спа"
                  />
                </FormField>

                {/* Descriptions */}
                <FormField $full>
                  <Label>Description (EN)<Req>*</Req></Label>
                  <Textarea
                    value={form.description || ''}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Describe the offer in English"
                  />
                </FormField>
                <FormField $full>
                  <Label>Description (BG)</Label>
                  <Textarea
                    value={form.descriptionBg || ''}
                    onChange={e => setForm(f => ({ ...f, descriptionBg: e.target.value }))}
                    placeholder="Опишете офертата на български"
                  />
                </FormField>

                {/* Photo */}
                <FormField $full>
                  <Label>Photo URL</Label>
                  <Input
                    value={form.image || ''}
                    onChange={e => setForm(f => ({ ...f, image: e.target.value }))}
                    placeholder="https://…"
                  />
                  {form.image ? (
                    <ImagePreview src={form.image} alt="preview" />
                  ) : (
                    <ImagePlaceholder
                      onClick={() => {
                        const url = window.prompt('Enter image URL:');
                        if (url) setForm(f => ({ ...f, image: url }));
                      }}
                    >
                      Click to add image URL
                    </ImagePlaceholder>
                  )}
                </FormField>

                {/* Tags */}
                <FormField $full>
                  <Label>Tags</Label>
                  <TagInputWrapper onClick={() => document.getElementById('admin-tag-field')?.focus()}>
                    {selectedTags.map(tag => (
                      <TagBadge key={tag}>
                        {tag}
                        <TagRemoveBtn type="button" onClick={() => removeTag(tag)}>×</TagRemoveBtn>
                      </TagBadge>
                    ))}
                    <TagTextField
                      id="admin-tag-field"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onBlur={() => tagInput && addTag(tagInput)}
                      placeholder={selectedTags.length === 0 ? 'Type a tag and press Enter or comma…' : ''}
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

                {/* Offer type & status */}
                <SectionDivider>Offer Details</SectionDivider>

                <FormField>
                  <Label>Offer Type<Req>*</Req></Label>
                  <Select value={form.type || 'DISCOUNT'} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
                    {OFFER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </FormField>
                <FormField>
                  <Label>Status</Label>
                  <Select value={form.status || 'DRAFT'} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
                    {OFFER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </FormField>

                {/* Discount fields — conditional */}
                {(form.type === 'DISCOUNT' || form.type === 'SEASONAL' || form.type === 'BUNDLE') && (
                  <>
                    <FormField>
                      <Label>Discount %</Label>
                      <Input
                        type="number" min={0} max={100} step={0.5}
                        value={form.discountPercent ?? ''}
                        onChange={e => setForm(f => ({ ...f, discountPercent: e.target.value ? Number(e.target.value) : undefined }))}
                        placeholder="e.g. 20"
                      />
                    </FormField>
                    <FormField>
                      <Label>Fixed Discount Amount</Label>
                      <Input
                        type="number" min={0} step={0.01}
                        value={form.discountAmount ?? ''}
                        onChange={e => setForm(f => ({ ...f, discountAmount: e.target.value ? Number(e.target.value) : undefined }))}
                        placeholder="e.g. 15.00 BGN"
                      />
                    </FormField>
                  </>
                )}
                {form.type === 'CASHBACK' && (
                  <FormField>
                    <Label>Cashback %</Label>
                    <Input
                      type="number" min={0} max={100} step={0.5}
                      value={form.cashbackPercent ?? ''}
                      onChange={e => setForm(f => ({ ...f, cashbackPercent: e.target.value ? Number(e.target.value) : undefined }))}
                    />
                  </FormField>
                )}
                {form.type === 'POINTS' && (
                  <FormField>
                    <Label>Points Multiplier</Label>
                    <Input
                      type="number" min={1} step={0.5}
                      value={form.pointsMultiplier ?? ''}
                      onChange={e => setForm(f => ({ ...f, pointsMultiplier: e.target.value ? Number(e.target.value) : undefined }))}
                    />
                  </FormField>
                )}

                <FormField>
                  <Label>Min. Purchase</Label>
                  <Input
                    type="number" min={0} step={0.01}
                    value={form.minPurchase ?? ''}
                    onChange={e => setForm(f => ({ ...f, minPurchase: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="e.g. 50.00"
                  />
                </FormField>
                <FormField>
                  <Label>Max Discount Cap</Label>
                  <Input
                    type="number" min={0} step={0.01}
                    value={form.maxDiscount ?? ''}
                    onChange={e => setForm(f => ({ ...f, maxDiscount: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="e.g. 100.00"
                  />
                </FormField>

                {/* Dates */}
                <FormField>
                  <Label>Start Date<Req>*</Req></Label>
                  <Input
                    type="date"
                    value={form.startDate as string || ''}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  />
                </FormField>
                <FormField>
                  <Label>End Date<Req>*</Req></Label>
                  <Input
                    type="date"
                    value={form.endDate as string || ''}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  />
                </FormField>

                <FormField>
                  <Label>Usage Limit</Label>
                  <Input
                    type="number" min={1} step={1}
                    value={form.usageLimit ?? ''}
                    onChange={e => setForm(f => ({ ...f, usageLimit: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="Unlimited"
                  />
                </FormField>
                <FormField style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.25rem' }}>
                  <ToggleLabel>
                    <ToggleBox
                      checked={form.isFeatured || false}
                      onChange={e => setForm(f => ({ ...f, isFeatured: e.target.checked }))}
                    />
                    Mark as Featured
                  </ToggleLabel>
                </FormField>

                {/* Terms */}
                <SectionDivider>Terms & Conditions</SectionDivider>
                <FormField $full>
                  <Label>Terms & Conditions (EN)</Label>
                  <Textarea
                    value={form.termsConditions || ''}
                    onChange={e => setForm(f => ({ ...f, termsConditions: e.target.value }))}
                    placeholder="Any terms or conditions in English"
                  />
                </FormField>
                <FormField $full>
                  <Label>Terms & Conditions (BG)</Label>
                  <Textarea
                    value={form.termsConditionsBg || ''}
                    onChange={e => setForm(f => ({ ...f, termsConditionsBg: e.target.value }))}
                    placeholder="Условия и наредби на български"
                  />
                </FormField>
              </FormGrid>

              <ModalActions>
                <CancelBtn onClick={closeModal}>Cancel</CancelBtn>
                <SaveBtn onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving…' : editingOffer ? 'Save Changes' : 'Create Offer'}
                </SaveBtn>
              </ModalActions>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}
