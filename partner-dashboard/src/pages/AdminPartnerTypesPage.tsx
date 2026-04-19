import React, { useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import {
  partnerTypesService,
  PartnerType,
  CreatePartnerTypePayload,
  PlanAccessRule,
  SubscriptionPlan,
} from '../services/partnerTypes.service';
import { toast } from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DISCOUNT_STEPS } from '../utils/discountSteps';

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
  white-space: nowrap;

  &:hover {
    opacity: 0.9;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
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
  grid-template-columns: 2.5fr 1fr 1fr 1.5fr 1fr 120px;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border);
  font-weight: 700;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const TableRow = styled(motion.div)`
  display: grid;
  grid-template-columns: 2.5fr 1fr 1fr 1.5fr 1fr 120px;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
  align-items: center;

  &:hover { background: var(--color-background-secondary); }
  &:last-child { border-bottom: none; }
`;

const TypeName = styled.div`
  font-weight: 600;
  color: var(--color-text-primary);
  font-size: 0.9375rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const TypeMeta = styled.div`
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
`;

const ColorSwatch = styled.div<{ color: string }>`
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: ${({ color }) => color};
  border: 2px solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
`;

const ActiveBadge = styled.span<{ $active: boolean }>`
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: inline-block;
  background: ${({ $active }) => ($active ? '#dcfce7' : '#f3f4f6')};
  color: ${({ $active }) => ($active ? '#166534' : '#6b7280')};
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const EditButton = styled.button`
  padding: 0.5rem 0.875rem;
  background: var(--color-background-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 200ms;

  &:hover { background: var(--color-border); }
`;

const DeleteButton = styled.button`
  padding: 0.5rem 0.875rem;
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #991b1b;
  cursor: pointer;
  transition: all 200ms;

  &:hover { background: #fecaca; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  color: var(--color-text-tertiary);
`;

// ─── Modal ────────────────────────────────────────────────────────────────────

const Overlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
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
  max-width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
`;

const ModalTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--color-text-primary);
  margin-bottom: 1.5rem;
`;

const Tabs = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--color-border);
  margin-bottom: 1.5rem;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 0.625rem 1.25rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${({ $active }) => ($active ? '#dc2626' : '#6b7280')};
  border-bottom: 2px solid ${({ $active }) => ($active ? '#dc2626' : 'transparent')};
  margin-bottom: -2px;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
  cursor: pointer;
  transition: all 200ms;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;

  @media (max-width: 480px) {
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

const Required = styled.span`
  color: #dc2626;
  margin-left: 0.25rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  transition: all 200ms;
  box-sizing: border-box;
  background: var(--color-background);
  color: var(--color-text-primary);

  &:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  transition: all 200ms;
  box-sizing: border-box;
  background: var(--color-background);
  color: var(--color-text-primary);
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  resize: vertical;
  min-height: 80px;
  transition: all 200ms;
  box-sizing: border-box;
  background: var(--color-background);
  color: var(--color-text-primary);

  &:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }
`;

const ColorRow = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: center;
`;

const ColorPreview = styled.div<{ color: string }>`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  background: ${({ color }) => color};
  border: 2px solid var(--color-border);
  flex-shrink: 0;
`;

const Toggle = styled.label`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  cursor: pointer;
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
`;

const ToggleInput = styled.input.attrs({ type: 'checkbox' })`
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

const CancelButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: var(--color-background-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
`;

const SaveButton = styled.button`
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

// ─── Plan Access Table ────────────────────────────────────────────────────────

const AccessTable = styled.div`
  border: 1px solid var(--color-border);
  border-radius: 0.875rem;
  overflow: hidden;
`;

const AccessRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
  padding: 1rem 1.25rem;
  align-items: center;
  border-bottom: 1px solid var(--color-border);

  &:last-child { border-bottom: none; }
  &:first-child {
    background: var(--color-background-secondary);
    font-weight: 700;
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary);
  }
`;

const PlanLabel = styled.span`
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--color-text-primary);
`;

const HintText = styled.p`
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.75rem;
`;

// ─── Types ────────────────────────────────────────────────────────────────────

const PLANS: SubscriptionPlan[] = ['LIGHT', 'BASIC', 'PREMIUM'];

interface AccessState {
  canView: boolean;
  canRedeem: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPartnerTypesPage() {
  useLanguage();
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState<PartnerType | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'access'>('details');

  // Form state
  const [form, setForm] = useState({
    name: '',
    nameBg: '',
    description: '',
    descriptionBg: '',
    maxDiscountRate: 10,
    color: '#6b7280',
    sortOrder: 0,
    isActive: true,
  });

  // Plan access state: plan → { canView, canRedeem }
  const [accessRules, setAccessRules] = useState<Record<SubscriptionPlan, AccessState>>({
    LIGHT: { canView: true, canRedeem: true },
    BASIC: { canView: true, canRedeem: true },
    PREMIUM: { canView: true, canRedeem: true },
  });

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: types = [], isLoading } = useQuery({
    queryKey: ['admin-partner-types'],
    queryFn: () => partnerTypesService.getPartnerTypes(),
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (payload: CreatePartnerTypePayload) => partnerTypesService.createPartnerType(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-partner-types'] });
      toast.success('Partner type created');
      closeModal();
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create partner type'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreatePartnerTypePayload> }) =>
      partnerTypesService.updatePartnerType(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-partner-types'] });
      toast.success('Partner type updated');
      closeModal();
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update partner type'),
  });

  const accessMutation = useMutation({
    mutationFn: ({ id, rules }: { id: string; rules: Omit<PlanAccessRule, 'id' | 'partnerTypeId'>[] }) =>
      partnerTypesService.setPlanAccess(id, rules),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-partner-types'] });
      toast.success('Access rules saved');
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save access rules'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => partnerTypesService.deletePartnerType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-partner-types'] });
      toast.success('Partner type deleted');
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to delete partner type'),
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingType(null);
    setForm({ name: '', nameBg: '', description: '', descriptionBg: '', maxDiscountRate: 10, color: '#6b7280', sortOrder: 0, isActive: true });
    setAccessRules({ LIGHT: { canView: true, canRedeem: true }, BASIC: { canView: true, canRedeem: true }, PREMIUM: { canView: true, canRedeem: true } });
    setActiveTab('details');
    setShowModal(true);
  }

  function openEdit(type: PartnerType) {
    setEditingType(type);
    setForm({
      name: type.name,
      nameBg: type.nameBg || '',
      description: type.description || '',
      descriptionBg: type.descriptionBg || '',
      maxDiscountRate: type.maxDiscountRate,
      color: type.color,
      sortOrder: type.sortOrder,
      isActive: type.isActive,
    });

    // Seed access state from existing planAccess
    const newRules: Record<SubscriptionPlan, AccessState> = {
      LIGHT: { canView: false, canRedeem: false },
      BASIC: { canView: false, canRedeem: false },
      PREMIUM: { canView: false, canRedeem: false },
    };
    if (type.planAccess) {
      for (const rule of type.planAccess) {
        if (rule.plan in newRules) {
          newRules[rule.plan as SubscriptionPlan] = { canView: rule.canView, canRedeem: rule.canRedeem };
        }
      }
    }
    setAccessRules(newRules);
    setActiveTab('details');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingType(null);
  }

  function handleSaveDetails() {
    if (!form.name.trim()) return toast.error('Name is required');
    const payload: CreatePartnerTypePayload = {
      name: form.name.trim(),
      nameBg: form.nameBg.trim() || undefined,
      description: form.description.trim() || undefined,
      descriptionBg: form.descriptionBg.trim() || undefined,
      maxDiscountRate: Number(form.maxDiscountRate),
      color: form.color,
      sortOrder: Number(form.sortOrder),
      isActive: form.isActive,
    };

    if (editingType) {
      updateMutation.mutate({ id: editingType.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleSaveAccess() {
    if (!editingType) return;
    const rules = PLANS.map(plan => ({ plan, ...accessRules[plan] }));
    const summary = rules
      .map(r => `${r.plan}: ${r.canRedeem ? 'view+redeem' : r.canView ? 'view only' : 'no access'}`)
      .join('\n');
    if (!window.confirm(`Replace plan access for "${editingType.name}" with:\n\n${summary}\n\nThis affects all subscribers immediately.`)) return;
    accessMutation.mutate({ id: editingType.id, rules });
  }

  function handleDelete(type: PartnerType) {
    if (!window.confirm(`Delete partner type "${type.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(type.id);
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader>
        <div>
          <Title>Partner Types</Title>
          <Subtitle>Define partner categories, their discount rate caps, and subscription plan access rules.</Subtitle>
        </div>
        <CreateButton onClick={openCreate}>+ Create Type</CreateButton>
      </PageHeader>

      <Table>
        <TableHeader>
          <span>Type</span>
          <span>Max Discount</span>
          <span>Color</span>
          <span>Plan Access</span>
          <span>Active</span>
          <span>Actions</span>
        </TableHeader>

        {isLoading ? (
          <EmptyState>Loading…</EmptyState>
        ) : types.length === 0 ? (
          <EmptyState>No partner types yet. Create one to get started.</EmptyState>
        ) : (
          types.map(type => (
            <TableRow
              key={type.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <TypeName>
                <ColorSwatch color={type.color} />
                <div>
                  <div>{type.name}{type.nameBg && type.nameBg !== type.name ? ` / ${type.nameBg}` : ''}</div>
                  {type.description && <TypeMeta>{type.description}</TypeMeta>}
                  <TypeMeta>{type._count?.partners ?? 0} partner(s)</TypeMeta>
                </div>
              </TypeName>

              <span style={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626' }}>
                {type.maxDiscountRate}%
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ColorSwatch color={type.color} />
                <code style={{ fontSize: '0.75rem', color: '#6b7280' }}>{type.color}</code>
              </div>

              <div style={{ fontSize: '0.8125rem', color: '#6b7280', lineHeight: 1.5 }}>
                {type.planAccess && type.planAccess.length > 0
                  ? type.planAccess.map(a => `${a.plan}${a.canRedeem ? '' : ' (view only)'}`).join(', ')
                  : 'No access configured'}
              </div>

              <ActiveBadge $active={type.isActive}>
                {type.isActive ? 'Active' : 'Inactive'}
              </ActiveBadge>

              <ActionButtons>
                <EditButton onClick={() => openEdit(type)}>Edit</EditButton>
                <DeleteButton onClick={() => handleDelete(type)}>Delete</DeleteButton>
              </ActionButtons>
            </TableRow>
          ))
        )}
      </Table>

      {/* ─── Modal ──────────────────────────────────────────────────────── */}
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
                {editingType ? `Edit "${editingType.name}"` : 'Create Partner Type'}
              </ModalTitle>

              {editingType && (
                <Tabs>
                  <Tab $active={activeTab === 'details'} onClick={() => setActiveTab('details')}>
                    Details
                  </Tab>
                  <Tab $active={activeTab === 'access'} onClick={() => setActiveTab('access')}>
                    Plan Access
                  </Tab>
                </Tabs>
              )}

              {/* ── Details Tab ── */}
              {activeTab === 'details' && (
                <FormGrid>
                  <FormField>
                    <Label>Name (EN)<Required>*</Required></Label>
                    <Input
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. GOLD"
                    />
                  </FormField>

                  <FormField>
                    <Label>Name (BG)</Label>
                    <Input
                      value={form.nameBg}
                      onChange={e => setForm(f => ({ ...f, nameBg: e.target.value }))}
                      placeholder="e.g. ЗЛАТО"
                    />
                  </FormField>

                  <FormField $full>
                    <Label>Description (EN)</Label>
                    <Textarea
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Short description of this partner tier"
                    />
                  </FormField>

                  <FormField $full>
                    <Label>Description (BG)</Label>
                    <Textarea
                      value={form.descriptionBg}
                      onChange={e => setForm(f => ({ ...f, descriptionBg: e.target.value }))}
                      placeholder="Кратко описание на това ниво"
                    />
                  </FormField>

                  <FormField>
                    <Label>Max Discount Rate (%)<Required>*</Required></Label>
                    <Select
                      value={form.maxDiscountRate}
                      onChange={e => setForm(f => ({ ...f, maxDiscountRate: Number(e.target.value) }))}
                    >
                      {DISCOUNT_STEPS.map(s => (
                        <option key={s} value={s}>{s}%</option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField>
                    <Label>Sort Order</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.sortOrder}
                      onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                    />
                  </FormField>

                  <FormField $full>
                    <Label>Badge Color (hex)</Label>
                    <ColorRow>
                      <Input
                        value={form.color}
                        onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                        placeholder="#6b7280"
                        style={{ flex: 1 }}
                      />
                      <ColorPreview color={form.color} />
                      <input
                        type="color"
                        value={form.color}
                        onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                        style={{ width: '2.5rem', height: '2.5rem', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}
                      />
                    </ColorRow>
                  </FormField>

                  <FormField $full>
                    <Toggle>
                      <ToggleInput
                        checked={form.isActive}
                        onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                      />
                      Active (partners can be assigned to this type)
                    </Toggle>
                  </FormField>
                </FormGrid>
              )}

              {/* ── Plan Access Tab ── */}
              {activeTab === 'access' && editingType && (
                <>
                  <AccessTable>
                    <AccessRow>
                      <span>Subscription Plan</span>
                      <span>Can View Offers</span>
                      <span>Can Redeem Offers</span>
                    </AccessRow>
                    {PLANS.map(plan => (
                      <AccessRow key={plan}>
                        <PlanLabel>{plan}</PlanLabel>
                        <Toggle>
                          <ToggleInput
                            checked={accessRules[plan].canView}
                            onChange={e =>
                              setAccessRules(r => ({ ...r, [plan]: { ...r[plan], canView: e.target.checked } }))
                            }
                          />
                        </Toggle>
                        <Toggle>
                          <ToggleInput
                            checked={accessRules[plan].canRedeem}
                            onChange={e =>
                              setAccessRules(r => ({ ...r, [plan]: { ...r[plan], canRedeem: e.target.checked } }))
                            }
                          />
                        </Toggle>
                      </AccessRow>
                    ))}
                  </AccessTable>
                  <HintText>
                    Controls which subscription plans can view and redeem offers from partners of this type.
                    Users without a subscription are treated as LIGHT plan.
                  </HintText>
                </>
              )}

              <ModalActions>
                <CancelButton onClick={closeModal}>Cancel</CancelButton>
                {activeTab === 'details' ? (
                  <SaveButton onClick={handleSaveDetails} disabled={isSaving}>
                    {isSaving ? 'Saving…' : editingType ? 'Save Changes' : 'Create Type'}
                  </SaveButton>
                ) : (
                  <SaveButton onClick={handleSaveAccess} disabled={accessMutation.isPending}>
                    {accessMutation.isPending ? 'Saving…' : 'Save Access Rules'}
                  </SaveButton>
                )}
              </ModalActions>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}
