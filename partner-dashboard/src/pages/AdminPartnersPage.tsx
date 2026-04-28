import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import {
  partnersService,
  OnboardPartnerPayload,
  PartnerLocationInput,
  PartnerStatus,
  Partner,
} from '../services/partners.service';
import { partnerTypesService } from '../services/partnerTypes.service';
import { toast } from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '../lib/auth/session';
import { bulkImportService } from '../services/bulkImport.service';
import { venuesService } from '../services/venues.service';
import axios from 'axios';
import { placesCategories, experiencesCategories, getCategoryName } from '../types/categories.types';
import { DISCOUNT_STEPS, snapToStep } from '../utils/discountSteps';

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

const FiltersBar = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 250px;
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
  transition: all 200ms;

  &:focus {
    outline: none;
    border-color: #dc2626;
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
  grid-template-columns: 3fr 1.5fr 1fr 1fr 1.5fr auto;
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
  grid-template-columns: 3fr 1.5fr 1fr 1fr 1.5fr auto;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
  align-items: center;

  &:hover {
    background: var(--color-background-secondary);
  }

  &:last-child {
    border-bottom: none;
  }
`;

const PartnerName = styled.div`
  font-weight: 600;
  color: var(--color-text-primary);
  font-size: 0.9375rem;
`;

const PartnerMeta = styled.div`
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
`;

const TypeBadge = styled.span<{ $color?: string }>`
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: inline-block;
  background: ${({ $color }) => $color || '#6b7280'};
  color: white;
`;

const StatusBadge = styled.span<{ $status: string }>`
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: inline-block;
  background: ${({ $status }) =>
    $status === 'ACTIVE' ? '#dcfce7' :
    $status === 'PENDING' ? '#fef3c7' :
    $status === 'SUSPENDED' ? '#fee2e2' : '#f3f4f6'};
  color: ${({ $status }) =>
    $status === 'ACTIVE' ? '#166534' :
    $status === 'PENDING' ? '#92400e' :
    $status === 'SUSPENDED' ? '#991b1b' : '#374151'};
`;

const DiscountBadge = styled.span`
  font-weight: 700;
  font-size: 1rem;
  color: #dc2626;
`;

const EditButton = styled.button`
  padding: 0.5rem 1rem;
  background: var(--color-background-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 200ms;

  &:hover {
    background: var(--color-border);
  }
`;

const QrButton = styled.button`
  padding: 0.5rem 0.75rem;
  background: var(--color-background-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #2563eb;
  cursor: pointer;
  transition: all 200ms;
  white-space: nowrap;

  &:hover {
    background: #dbeafe;
    border-color: #93c5fd;
  }
`;

const MenuButton = styled.button`
  padding: 0.5rem 0.75rem;
  background: var(--color-background-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #059669;
  cursor: pointer;
  transition: all 200ms;
  white-space: nowrap;

  &:hover {
    background: #d1fae5;
    border-color: #6ee7b7;
  }
`;

const VenueButton = styled.button`
  padding: 0.5rem 0.75rem;
  background: var(--color-background-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #7c3aed;
  cursor: pointer;
  transition: all 200ms;
  white-space: nowrap;

  &:hover {
    background: #ede9fe;
    border-color: #c4b5fd;
  }
`;

const EditVenueButton = styled.button`
  padding: 0.5rem 0.75rem;
  background: var(--color-background-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #0d9488;
  cursor: pointer;
  transition: all 200ms;
  white-space: nowrap;

  &:hover {
    background: #ccfbf1;
    border-color: #5eead4;
  }
`;

const ActionCell = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  color: var(--color-text-tertiary);
`;

// ─── Modal shared styles ──────────────────────────────────────────────────────

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
  max-width: 600px;
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

const FormDivider = styled.hr`
  border: none;
  border-top: 1px solid var(--color-border, #e5e7eb);
  margin: 1.25rem 0 1rem;
`;

const HelperText = styled.p`
  margin: 0.375rem 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-secondary, #6b7280);
  line-height: 1.4;
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

const Textarea = styled.textarea`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  transition: all 200ms;
  box-sizing: border-box;
  background: var(--color-background);
  color: var(--color-text-primary);
  resize: vertical;
  min-height: 80px;

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
  background: var(--color-background);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all 200ms;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }
`;

const FieldHint = styled.p`
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.375rem;
`;

const CategoryChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
`;

const CategoryChip = styled.button<{ $selected: boolean }>`
  padding: 0.375rem 0.875rem;
  border-radius: 999px;
  font-size: 0.875rem;
  cursor: pointer;
  border: 2px solid ${({ $selected }) => ($selected ? 'var(--color-primary, #6366f1)' : 'var(--color-border, #e5e7eb)')};
  background: ${({ $selected }) => ($selected ? 'var(--color-primary, #6366f1)' : 'transparent')};
  color: ${({ $selected }) => ($selected ? '#fff' : 'var(--color-text-primary)')};
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:hover {
    border-color: var(--color-primary, #6366f1);
  }
`;

const SubcategorySection = styled.div`
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const SubcategoryBlock = styled.div`
  padding: 0.625rem 0.75rem;
  background: var(--color-background-secondary, #f9fafb);
  border-radius: 0.75rem;
  border-left: 3px solid var(--color-border, #e5e7eb);

  [data-theme="dark"] & {
    background: #111827;
    border-left-color: #374151;
  }
`;

const SubcategoryBlockTitle = styled.div`
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const SubcategoryChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
`;

const SubcategoryChip = styled.button<{ $selected: boolean }>`
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
  font-size: 0.75rem;
  cursor: pointer;
  border: 1.5px solid ${({ $selected }) => ($selected ? 'var(--color-primary, #6366f1)' : 'var(--color-border, #e5e7eb)')};
  background: ${({ $selected }) => ($selected ? 'rgba(99, 102, 241, 0.1)' : 'transparent')};
  color: ${({ $selected }) => ($selected ? 'var(--color-primary, #6366f1)' : 'var(--color-text-secondary, #6b7280)')};
  font-weight: ${({ $selected }) => ($selected ? 500 : 400)};
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:hover {
    border-color: var(--color-primary, #6366f1);
  }
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
`;

const CancelButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: var(--color-background);
  color: var(--color-text-secondary);
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms;

  &:hover {
    border-color: var(--color-text-tertiary);
  }
`;

const SubmitButton = styled.button`
  padding: 0.75rem 1.75rem;
  background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
  color: white;
  border: none;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 200ms;

  &:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DangerButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: transparent;
  color: #dc2626;
  border: 2px solid #dc2626;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms;

  &:hover:not(:disabled) {
    background: #dc2626;
    color: white;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ─── Autocomplete ─────────────────────────────────────────────────────────────

const AutocompleteDropdown = styled.ul<{ $top: number; $left: number; $width: number }>`
  position: fixed;
  top: ${({ $top }) => $top}px;
  left: ${({ $left }) => $left}px;
  width: ${({ $width }) => $width}px;
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  list-style: none;
  margin: 0;
  padding: 0.25rem 0;
  z-index: 9999;
  max-height: 200px;
  overflow-y: auto;
`;

const AutocompleteItem = styled.li`
  padding: 0.625rem 1rem;
  cursor: pointer;
  font-size: 0.9375rem;
  color: var(--color-text-primary);
  transition: background 150ms;

  &:hover {
    background: var(--color-background-tertiary);
  }

  span {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin-left: 0.5rem;
  }
`;

// ─── Location Manager Styles ──────────────────────────────────────────────────

const LocationsSection = styled.div`
  grid-column: 1 / -1;
  border: 2px solid var(--color-border);
  border-radius: 0.875rem;
  overflow: hidden;
`;

const LocationsSectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border);
`;

const LocationsSectionTitle = styled.span`
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-text-secondary);
`;

const AddLocationButton = styled.button`
  padding: 0.375rem 0.875rem;
  background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 150ms;

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const LocationCard = styled.div`
  padding: 1rem;
  border-bottom: 1px solid var(--color-background-tertiary);
  display: flex;
  flex-direction: column;
  gap: 0.625rem;

  &:last-child {
    border-bottom: none;
  }
`;

const LocationCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const LocationIndex = styled.span`
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-tertiary);
`;

const RemoveLocationButton = styled.button`
  padding: 0.25rem 0.5rem;
  background: #fee2e2;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #dc2626;
  cursor: pointer;
  transition: background 150ms;

  &:hover {
    background: #fca5a5;
  }
`;

const LocationFieldRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const LocationFieldFull = styled.div`
  grid-column: 1 / -1;
  position: relative;
`;

const SmallLabel = styled.label`
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.25rem;
`;

const SmallInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1.5px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  transition: border-color 150ms;
  box-sizing: border-box;
  background: var(--color-background);
  color: var(--color-text-primary);

  &:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.08);
  }
`;

const LocationCoords = styled.div`
  font-size: 0.75rem;
  color: #10b981;
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const EmptyLocations = styled.div`
  padding: 1.25rem;
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 0.875rem;
`;

// ─── Constants ───────────────────────────────────────────────────────────────

const PARTNER_CATEGORIES = [
  ...placesCategories,
  ...experiencesCategories,
].map(cat => ({
  id: cat.id,
  label: cat.name.en,
  labelBg: cat.name.bg,
  subcategories: cat.subcategories.map(s => ({
    id: s.id,
    label: s.name.en,
    labelBg: s.name.bg,
  })),
}));

// ─── Legacy category migration ────────────────────────────────────────────────
// Maps old display-name strings (EN and BG) that were stored before canonical IDs
// were introduced, so the edit modal pre-populates correctly for existing partners.
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  // Old AdminPartnersPage string values (EN)
  'Restaurant': 'restaurants',
  'Cafe': 'cafes',
  'Beauty & Wellness': 'spa',
  'Sports & Fitness': 'spa',
  'Entertainment': 'clubs',
  'Travel': 'accommodation',
  // Old AdminPartnerOnboardingPage values (BG full names)
  'Ресторанти и храна': 'restaurants',
  'Настаняване': 'accommodation',
  'СПА и уелнес': 'spa',
  'Панорамни места': 'panoramic',
  'Клубове и нощен живот': 'clubs',
  'Кафенета, сладкарници и пекарни': 'cafes',
  'Гастрономични': 'gastronomic',
  'Исторически и културни': 'historical-cultural',
  'Активни и приключенски': 'active-adventure',
  'Екстремни': 'extreme',
  'Образователни и творчески': 'educational-creative',
  'Релакс и уелнес': 'relax-wellness',
  // Old PartnersPage SCREAMING_SNAKE_CASE values (pre-canonical-ID migration)
  'RESTAURANTS_FOOD': 'restaurants',
  'ACCOMMODATION': 'accommodation',
  'SPA_WELLNESS': 'spa',
  'PANORAMIC_PLACES': 'panoramic',
  'CLUBS_NIGHTLIFE': 'clubs',
  'CAFES_BAKERIES': 'cafes',
  'GASTRONOMIC': 'gastronomic',
  'HISTORICAL_CULTURAL': 'historical-cultural',
  'ACTIVE_ADVENTURE': 'active-adventure',
  'EXTREME': 'extreme',
  'EDUCATIONAL_CREATIVE': 'educational-creative',
  'RELAX_WELLNESS': 'relax-wellness',
  // Old RegisterPartnerPage business-type values (pre-canonical-ID migration)
  'RESTAURANT': 'restaurants',
  'HOTEL': 'accommodation',
  'SPA': 'spa',
  'WINERY': 'restaurants',
  'SPORTS': 'spa',
  'BEAUTY': 'spa',
  'SHOPPING': 'cafes',
  'TRAVEL': 'accommodation',
};

function migrateCategoryId(id: string): string {
  return LEGACY_CATEGORY_MAP[id] ?? id;
}

// ─── Category Picker ──────────────────────────────────────────────────────────
// Renders the parent-category pills and, below them, a subcategory block for
// each currently-selected parent. Parent and subcategory IDs share a single
// `selected` string[] (subs live alongside parents in Partner.categories).
interface CategoryPickerProps {
  selected: string[];
  onChange: React.Dispatch<React.SetStateAction<string[]>>;
  language: 'en' | 'bg';
}

const CategoryPicker: React.FC<CategoryPickerProps> = ({ selected, onChange, language }) => {
  const toggleParent = (id: string) => {
    onChange(prev => {
      if (prev.includes(id)) {
        const subIds = PARTNER_CATEGORIES.find(c => c.id === id)?.subcategories.map(s => s.id) ?? [];
        return prev.filter(c => c !== id && !subIds.includes(c));
      }
      return [...prev, id];
    });
  };

  const toggleSub = (subId: string) => {
    onChange(prev => prev.includes(subId) ? prev.filter(c => c !== subId) : [...prev, subId]);
  };

  const selectedParents = PARTNER_CATEGORIES.filter(c => selected.includes(c.id));

  return (
    <>
      <CategoryChips>
        {PARTNER_CATEGORIES.map(cat => (
          <CategoryChip
            key={cat.id}
            type="button"
            $selected={selected.includes(cat.id)}
            onClick={() => toggleParent(cat.id)}
          >
            {language === 'bg' ? cat.labelBg : cat.label}
          </CategoryChip>
        ))}
      </CategoryChips>
      {selectedParents.length > 0 && (
        <SubcategorySection>
          {selectedParents.map(cat => cat.subcategories.length > 0 && (
            <SubcategoryBlock key={cat.id}>
              <SubcategoryBlockTitle>
                {language === 'bg' ? cat.labelBg : cat.label}
              </SubcategoryBlockTitle>
              <SubcategoryChips>
                {cat.subcategories.map(sub => (
                  <SubcategoryChip
                    key={sub.id}
                    type="button"
                    $selected={selected.includes(sub.id)}
                    onClick={() => toggleSub(sub.id)}
                  >
                    {language === 'bg' ? sub.labelBg : sub.label}
                  </SubcategoryChip>
                ))}
              </SubcategoryChips>
            </SubcategoryBlock>
          ))}
        </SubcategorySection>
      )}
    </>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function effectiveRate(partner: Partner): number {
  return partner.effectiveDiscountRate
    ?? (partner.discountRate != null ? partner.discountRate : partner.partnerType?.maxDiscountRate ?? 0);
}

// ─── Address Autocomplete (Nominatim / OpenStreetMap) ─────────────────────────

interface NominatimResult {
  place_id: number;
  display_name: string;
  address: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    county?: string;
    country?: string;
  };
  lat: string;
  lon: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: { address: string; city: string; region: string; latitude: number; longitude: number }) => void;
  placeholder?: string;
  large?: boolean;
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({ value, onChange, onSelect, placeholder, large }) => {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const updatePos = useCallback(() => {
    if (wrapperRef.current) {
      const r = wrapperRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, []);

  useEffect(() => {
    if (open) updatePos();
  }, [open, suggestions, updatePos]);

  // Reposition on scroll/resize while open so fixed coords stay accurate
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open, updatePos]);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const inWrapper = wrapperRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inWrapper && !inDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  const search = useCallback((q: string) => {
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6&accept-language=bg,en`;
        const resp = await fetch(url, {
          signal: abortRef.current.signal,
          headers: { 'Accept-Language': 'bg,en' },
        });
        const data: NominatimResult[] = await resp.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {
        // aborted or network error
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    search(e.target.value);
  };

  const handleSelect = (item: NominatimResult) => {
    const a = item.address;
    const streetParts = [a.road, a.house_number].filter(Boolean);
    const street = streetParts.join(' ');
    const city = a.city || a.town || a.village || a.municipality || '';
    const region = a.state || a.county || '';
    onSelect({
      address: street || item.display_name.split(',')[0],
      city,
      region,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    });
    onChange(street || item.display_name.split(',')[0]);
    setSuggestions([]);
    setOpen(false);
  };

  const InputComponent = large ? Input : SmallInput;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <InputComponent
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => value.length >= 3 && suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder || 'Street address…'}
      />
      {loading && (
        <div style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#9ca3af' }}>
          ⟳
        </div>
      )}
      <AnimatePresence>
        {open && suggestions.length > 0 && dropdownPos.width > 0 && ReactDOM.createPortal(
          <AutocompleteDropdown ref={dropdownRef} $top={dropdownPos.top} $left={dropdownPos.left} $width={dropdownPos.width}>
            {suggestions.map(item => (
              <AutocompleteItem key={item.place_id} onPointerDown={() => handleSelect(item)}>
                {item.display_name}
              </AutocompleteItem>
            ))}
          </AutocompleteDropdown>,
          document.body
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Location Manager Component ───────────────────────────────────────────────

const MAX_LOCATIONS = 50;

interface LocationManagerProps {
  locations: PartnerLocationInput[];
  onChange: (locations: PartnerLocationInput[]) => void;
  language: string;
}

const LocationManager: React.FC<LocationManagerProps> = ({ locations, onChange, language }) => {
  const t = (en: string, bg: string) => language === 'bg' ? bg : en;

  const addLocation = () => {
    if (locations.length >= MAX_LOCATIONS) return;
    onChange([...locations, { name: '', address: '', city: '', region: '', phone: '', latitude: undefined, longitude: undefined }]);
  };

  const removeLocation = (index: number) => {
    onChange(locations.filter((_, i) => i !== index));
  };

  const updateLocation = (index: number, patch: Partial<PartnerLocationInput>) => {
    onChange(locations.map((loc, i) => i === index ? { ...loc, ...patch } : loc));
  };

  return (
    <LocationsSection>
      <LocationsSectionHeader>
        <LocationsSectionTitle>
          {t('Locations / Venues', 'Локации / Обекти')} ({locations.length}/{MAX_LOCATIONS})
        </LocationsSectionTitle>
        <AddLocationButton
          type="button"
          onClick={addLocation}
          disabled={locations.length >= MAX_LOCATIONS}
        >
          + {t('Add Location', 'Добави Локация')}
        </AddLocationButton>
      </LocationsSectionHeader>

      {locations.length === 0 ? (
        <EmptyLocations>
          {t('No locations added yet. Click "+ Add Location" to begin.', 'Няма добавени локации. Кликнете "+ Добави Локация" за начало.')}
        </EmptyLocations>
      ) : (
        locations.map((loc, i) => (
          <LocationCard key={i}>
            <LocationCardHeader>
              <LocationIndex>{t('Location', 'Локация')} #{i + 1}</LocationIndex>
              <RemoveLocationButton type="button" onClick={() => removeLocation(i)}>
                {t('Remove', 'Премахни')}
              </RemoveLocationButton>
            </LocationCardHeader>

            <LocationFieldRow>
              <div>
                <SmallLabel>{t('Name', 'Наименование')} *</SmallLabel>
                <SmallInput
                  type="text"
                  placeholder={t('e.g. Main Branch', 'напр. Главен Офис')}
                  value={loc.name}
                  onChange={e => updateLocation(i, { name: e.target.value })}
                  required
                />
              </div>
              <div>
                <SmallLabel>{t('Phone', 'Телефон')}</SmallLabel>
                <SmallInput
                  type="tel"
                  placeholder="+359…"
                  value={loc.phone || ''}
                  onChange={e => updateLocation(i, { phone: e.target.value })}
                />
              </div>
            </LocationFieldRow>

            <LocationFieldFull>
              <SmallLabel>{t('Street Address', 'Улица и номер')} * {t('(type 3+ letters for suggestions)', '(въведи 3+ букви за предложения)')}</SmallLabel>
              <AddressAutocomplete
                value={loc.address}
                onChange={val => updateLocation(i, { address: val })}
                onSelect={({ address, city, region, latitude, longitude }) =>
                  updateLocation(i, { address, city, region, latitude, longitude })
                }
                placeholder={t('e.g. Vitosha Blvd 1', 'напр. бул. Витоша 1')}
              />
              {loc.latitude !== undefined && loc.longitude !== undefined && (
                <LocationCoords>
                  ✓ {t('Coordinates set', 'Координатите са зададени')}: {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                </LocationCoords>
              )}
            </LocationFieldFull>

            <LocationFieldRow>
              <div>
                <SmallLabel>{t('City', 'Град')} *</SmallLabel>
                <SmallInput
                  type="text"
                  placeholder={t('Sofia', 'София')}
                  value={loc.city}
                  onChange={e => updateLocation(i, { city: e.target.value })}
                  required
                />
              </div>
              <div>
                <SmallLabel>{t('Region', 'Регион')}</SmallLabel>
                <SmallInput
                  type="text"
                  placeholder={t('Sofia Province', 'Софийска Област')}
                  value={loc.region || ''}
                  onChange={e => updateLocation(i, { region: e.target.value })}
                />
              </div>
            </LocationFieldRow>
          </LocationCard>
        ))
      )}
    </LocationsSection>
  );
};

// ─── Create Form ──────────────────────────────────────────────────────────────

const emptyCreate: Omit<OnboardPartnerPayload, 'category' | 'categories' | 'discountRate' | 'locations'> & { discountRate: string } = {
  email: '',
  businessName: '',
  businessNameBg: '',
  description: '',
  descriptionBg: '',
  partnerTypeId: '',
  discountRate: '',
  phone: '',
  website: '',
};

// ─── Edit Form ────────────────────────────────────────────────────────────────

interface EditForm {
  // Profile fields
  businessName: string;
  businessNameBg: string;
  description: string;
  descriptionBg: string;
  city: string;
  region: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  // Admin-only fields
  partnerTypeId: string;
  discountRate: string;
  status: PartnerStatus;
}

// ─── Page Component ───────────────────────────────────────────────────────────

const AdminPartnersPage: React.FC = () => {
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  // Table filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [createCategories, setCreateCategories] = useState<string[]>([]);
  const [createLocations, setCreateLocations] = useState<PartnerLocationInput[]>([]);

  // Edit modal
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [editForm, setEditForm] = useState<EditForm>({
    businessName: '', businessNameBg: '', description: '', descriptionBg: '',
    city: '', region: '', address: '', phone: '', email: '', website: '',
    partnerTypeId: '', discountRate: '', status: 'ACTIVE',
  });

  // Menu upload modal
  const [menuPartner, setMenuPartner] = useState<Partner | null>(null);
  const [menuVenueId, setMenuVenueId] = useState('');
  const [menuFiles, setMenuFiles] = useState<File[]>([]);
  const [menuUploading, setMenuUploading] = useState(false);
  const [menuDragging, setMenuDragging] = useState(false);
  const menuInputRef = useRef<HTMLInputElement>(null);

  // Pending changes review modal
  const [reviewPartner, setReviewPartner] = useState<Partner | null>(null);

  // Venue creation modal
  const [venuePartner, setVenuePartner] = useState<Partner | null>(null);
  const [venueForm, setVenueForm] = useState({ name: '', nameBg: '', address: '', city: '', region: '', phone: '', email: '', description: '', descriptionBg: '', latitude: undefined as number | undefined, longitude: undefined as number | undefined });
  const [venueSubmitting, setVenueSubmitting] = useState(false);

  // Venue edit modal
  const [editVenuePartner, setEditVenuePartner] = useState<Partner | null>(null);
  const [editVenueId, setEditVenueId] = useState<string>('');
  const [editVenueForm, setEditVenueForm] = useState({ name: '', nameBg: '', address: '', city: '', region: '', phone: '', email: '', description: '', descriptionBg: '', latitude: undefined as number | undefined, longitude: undefined as number | undefined });
  const [editVenueSubmitting, setEditVenueSubmitting] = useState(false);
  const [editVenueLoading, setEditVenueLoading] = useState(false);
  const [deleteVenueConfirm, setDeleteVenueConfirm] = useState(false);
  const [deletingVenue, setDeletingVenue] = useState(false);
  const [editVenueMenuUrl, setEditVenueMenuUrl] = useState('');
  const [editVenueOriginalMenuUrl, setEditVenueOriginalMenuUrl] = useState('');

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: partnerTypes = [] } = useQuery({
    queryKey: ['partner-types'],
    queryFn: () => partnerTypesService.getPartnerTypes(),
  });

  const { data: partnersData, isLoading } = useQuery({
    queryKey: ['admin-partners', search, statusFilter],
    queryFn: () => partnersService.getPartners({
      search: search || undefined,
      status: (statusFilter as 'new' | 'vip' | 'exclusive' | 'regular') || undefined,
      limit: 100,
    }),
  });

  const createMutation = useMutation({
    mutationFn: (data: OnboardPartnerPayload) => partnersService.onboardPartner(data),
    onSuccess: () => {
      toast.success(language === 'bg' ? 'Партньорът е създаден успешно' : 'Partner created successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
      setShowCreate(false);
      setCreateForm(emptyCreate);
      setCreateCategories([]);
      setCreateLocations([]);
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr?.response?.data?.error || (language === 'bg' ? 'Грешка при създаването' : 'Failed to create partner'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Partner> }) =>
      partnersService.updatePartner(id, data),
    onSuccess: () => {
      toast.success(language === 'bg' ? 'Партньорът е обновен' : 'Partner updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
      setEditingPartner(null);
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr?.response?.data?.error || (language === 'bg' ? 'Грешка при обновяването' : 'Failed to update partner'));
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => {
      const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
      const token = getAccessToken();
      return axios.post(`${baseURL}/partners/${id}/approve`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    },
    onSuccess: () => {
      toast.success(language === 'bg' ? 'Промените са одобрени' : 'Changes approved');
      queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
      setReviewPartner(null);
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr?.response?.data?.error || (language === 'bg' ? 'Грешка при одобряване' : 'Failed to approve changes'));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => {
      const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
      const token = getAccessToken();
      return axios.post(`${baseURL}/partners/${id}/reject`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    },
    onSuccess: () => {
      toast.success(language === 'bg' ? 'Промените са отхвърлени' : 'Changes rejected');
      queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
      setReviewPartner(null);
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr?.response?.data?.error || (language === 'bg' ? 'Грешка при отхвърляне' : 'Failed to reject changes'));
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCreateField = (field: keyof typeof createForm, value: string) => {
    setCreateForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-fill discountRate when partnerTypeId changes — snap to nearest valid step
      if (field === 'partnerTypeId') {
        const type = partnerTypes.find(t => t.id === value);
        if (type) next.discountRate = snapToStep(type.maxDiscountRate);
      }
      return next;
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.email || !createForm.businessName || createCategories.length === 0) return;
    // Validate locations: every added location must have name, address, and city
    for (const loc of createLocations) {
      if (!loc.name.trim() || !loc.address.trim() || !loc.city.trim()) {
        toast.error(language === 'bg'
          ? 'Всяка локация трябва да има наименование, адрес и град'
          : 'Each location must have a name, address, and city');
        return;
      }
    }
    const rate = parseFloat(createForm.discountRate);
    createMutation.mutate({
      ...createForm,
      category: createCategories[0],
      categories: createCategories,
      discountRate: isNaN(rate) ? undefined : rate,
      locations: createLocations.length > 0 ? createLocations : undefined,
    });
  };

  const openEdit = (partner: Partner) => {
    setEditingPartner(partner);
    const rawCategories = partner.categories?.length
      ? partner.categories
      : partner.category ? [partner.category] : [];
    setEditCategories(rawCategories.map(migrateCategoryId));
    setEditForm({
      businessName: partner.businessName || '',
      businessNameBg: partner.businessNameBg || '',
      description: partner.description || '',
      descriptionBg: partner.descriptionBg || '',
      city: partner.city || '',
      region: partner.region || '',
      address: partner.address || '',
      phone: partner.phone || '',
      email: partner.email || '',
      website: partner.website || '',
      partnerTypeId: partner.partnerTypeId || '',
      discountRate: snapToStep(effectiveRate(partner)),
      status: (String(partner.status).toUpperCase() as PartnerStatus) || 'ACTIVE',
    });
  };

  const handleEditTypeChange = (partnerTypeId: string) => {
    const type = partnerTypes.find(t => t.id === partnerTypeId);
    setEditForm(prev => ({
      ...prev,
      partnerTypeId,
      discountRate: type ? snapToStep(type.maxDiscountRate) : prev.discountRate,
    }));
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPartner) return;
    if (editCategories.length === 0) {
      toast.error(language === 'bg' ? 'Изберете поне една категория' : 'Select at least one category');
      return;
    }
    const rate = parseFloat(editForm.discountRate);
    updateMutation.mutate({
      id: editingPartner.id,
      data: {
        businessName: editForm.businessName || undefined,
        businessNameBg: editForm.businessNameBg || undefined,
        category: editCategories[0],
        categories: editCategories,
        description: editForm.description || undefined,
        descriptionBg: editForm.descriptionBg || undefined,
        city: editForm.city || undefined,
        region: editForm.region || undefined,
        address: editForm.address || undefined,
        phone: editForm.phone || undefined,
        email: editForm.email || undefined,
        website: editForm.website || undefined,
        partnerTypeId: editForm.partnerTypeId || undefined,
        discountRate: isNaN(rate) ? undefined : rate,
        status: editForm.status,
      },
    });
  };

  // ── QR Download ────────────────────────────────────────────────────────────

  const downloadQR = async (partner: Partner) => {
    try {
      const token = getAccessToken();
      const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
      const resp = await fetch(`${baseURL}/partners/${partner.id}/qr-code`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        toast.error(language === 'bg' ? 'Грешка при изтегляне на QR' : 'Failed to download QR code');
        return;
      }
      const svg = await resp.text();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (partner.businessName || 'partner').replace(/[^a-z0-9]/gi, '-').toLowerCase();
      a.download = `qr-${safeName}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(language === 'bg' ? 'Грешка при изтегляне на QR' : 'Failed to download QR code');
    }
  };

  // ── Venue creation ─────────────────────────────────────────────────────────

  const openVenueModal = (partner: Partner) => {
    setVenuePartner(partner);
    setVenueForm({
      name: partner.businessName || '',
      nameBg: '',
      address: partner.address || '',
      city: partner.city || '',
      region: partner.region || '',
      phone: partner.phone || '',
      email: partner.email || '',
      description: partner.description || '',
      descriptionBg: '',
      latitude: undefined,
      longitude: undefined,
    });
  };

  const handleVenueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venuePartner) return;
    setVenueSubmitting(true);
    try {
      const token = getAccessToken();
      const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
      const res = await fetch(`${baseURL}/venues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...venueForm, partnerId: venuePartner.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Грешка');
      toast.success(language === 'bg' ? `Обектът "${venueForm.name}" е създаден!` : `Venue "${venueForm.name}" created!`);
      setVenuePartner(null);
      queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Грешка при създаване на обект');
    } finally {
      setVenueSubmitting(false);
    }
  };

  // ── Venue edit ─────────────────────────────────────────────────────────────

  const loadEditVenue = async (venueId: string) => {
    setEditVenueId(venueId);
    setEditVenueLoading(true);
    setEditVenueForm({ name: '', nameBg: '', address: '', city: '', region: '', phone: '', email: '', description: '', descriptionBg: '', latitude: undefined, longitude: undefined });
    setDeleteVenueConfirm(false);
    try {
      const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
      const token = getAccessToken();
      const res = await fetch(`${baseURL}/venues/${venueId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load venue');
      const v = data.data ?? data;
      setEditVenueForm({
        name: v.name || '',
        nameBg: v.nameBg || '',
        address: v.address || '',
        city: v.city || '',
        region: v.region || '',
        phone: v.phone || '',
        email: v.email || '',
        description: v.description || '',
        descriptionBg: v.descriptionBg || '',
        latitude: v.latitude != null ? v.latitude : undefined,
        longitude: v.longitude != null ? v.longitude : undefined,
      });
      const loadedMenuUrl = v.menuUrl || '';
      setEditVenueMenuUrl(loadedMenuUrl);
      setEditVenueOriginalMenuUrl(loadedMenuUrl);
    } catch {
      // form stays empty; user can still fill in fields manually
    } finally {
      setEditVenueLoading(false);
    }
  };

  const openEditVenueModal = (partner: Partner) => {
    const venues = partner.venues ?? [];
    if (!venues.length) return;
    setEditVenuePartner(partner);
    loadEditVenue(venues[0].id);
  };

  const handleVenueEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVenueId) return;
    setEditVenueSubmitting(true);
    try {
      const token = getAccessToken();
      const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
      const res = await fetch(`${baseURL}/venues/${editVenueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(editVenueForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Грешка');
      const newMenuUrl = editVenueMenuUrl.trim();
      if (newMenuUrl !== editVenueOriginalMenuUrl) {
        if (newMenuUrl) {
          await venuesService.adminSetMenuUrl(editVenueId, newMenuUrl);
        } else {
          await venuesService.adminClearMenu(editVenueId);
        }
      }
      toast.success(language === 'bg' ? `Обектът "${editVenueForm.name}" е обновен!` : `Venue "${editVenueForm.name}" updated!`);
      setEditVenuePartner(null);
      queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Грешка при обновяване на обект');
    } finally {
      setEditVenueSubmitting(false);
    }
  };

  const handleVenueDelete = async () => {
    if (!editVenueId) return;
    setDeletingVenue(true);
    try {
      const token = getAccessToken();
      const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
      const res = await fetch(`${baseURL}/venues/${editVenueId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Грешка');
      toast.success(language === 'bg' ? `Обектът "${editVenueForm.name}" е изтрит!` : `Venue "${editVenueForm.name}" deleted!`);
      setEditVenuePartner(null);
      queryClient.invalidateQueries({ queryKey: ['admin-partners'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Грешка при изтриване на обект');
      setDeleteVenueConfirm(false);
    } finally {
      setDeletingVenue(false);
    }
  };

  // ── Menu upload ────────────────────────────────────────────────────────────

  const openMenuModal = (partner: Partner) => {
    setMenuPartner(partner);
    const venues = partner.venues ?? [];
    setMenuVenueId(venues.length === 1 ? venues[0].id : '');
    setMenuFiles([]);
  };

  const closeMenuModal = () => {
    setMenuPartner(null);
    setMenuVenueId('');
    setMenuFiles([]);
    setMenuDragging(false);
  };

  const handleMenuFiles = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    setMenuFiles(prev => [...prev, ...valid]);
  };

  const handleMenuDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setMenuDragging(false);
    handleMenuFiles(e.dataTransfer.files);
  };

  const handleMenuUpload = async () => {
    if (!menuVenueId || menuFiles.length === 0) return;
    setMenuUploading(true);
    try {
      const result = await bulkImportService.uploadVenueMenu(menuVenueId, menuFiles);
      toast.success(language === 'bg'
        ? `Качени ${result.uploaded} снимки на менюто`
        : `Uploaded ${result.uploaded} menu image(s)`);
      setMenuFiles([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (language === 'bg' ? 'Грешка при качване' : 'Upload failed'));
    } finally {
      setMenuUploading(false);
    }
  };

  const handleMenuClear = async () => {
    if (!menuVenueId) return;
    if (!window.confirm(language === 'bg'
      ? 'Сигурни ли сте, че искате да изтриете всички снимки на менюто?'
      : 'Are you sure you want to clear all menu images?')) return;
    setMenuUploading(true);
    try {
      await bulkImportService.clearVenueMenu(menuVenueId);
      toast.success(language === 'bg' ? 'Менюто е изчистено' : 'Menu cleared');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (language === 'bg' ? 'Грешка при изчистване' : 'Clear failed'));
    } finally {
      setMenuUploading(false);
    }
  };

  // ── Filtered data ──────────────────────────────────────────────────────────

  const partners = (partnersData?.data ?? []).filter(p =>
    !typeFilter || p.partnerTypeId === typeFilter,
  );

  const editTypeMax = partnerTypes.find(t => t.id === editForm.partnerTypeId)?.maxDiscountRate ?? 100;
  const createTypeMax = partnerTypes.find(t => t.id === createForm.partnerTypeId)?.maxDiscountRate ?? 100;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader>
        <div>
          <Title>{language === 'bg' ? 'Управление на Партньори' : 'Manage Partners'}</Title>
          <Subtitle>
            {language === 'bg'
              ? 'Създавайте и управлявайте партньорски профили и техните нива'
              : 'Create and manage partner profiles and their discount tiers'}
          </Subtitle>
        </div>
        <CreateButton onClick={() => setShowCreate(true)}>
          + {language === 'bg' ? 'Нов Партньор' : 'New Partner'}
        </CreateButton>
      </PageHeader>

      <FiltersBar>
        <SearchInput
          placeholder={language === 'bg' ? 'Търсене по име...' : 'Search by name...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <FilterSelect value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">{language === 'bg' ? 'Всички типове' : 'All types'}</option>
          {partnerTypes.map(t => (
            <option key={t.id} value={t.id}>{t.name} — max {t.maxDiscountRate}%</option>
          ))}
        </FilterSelect>
        <FilterSelect value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">{language === 'bg' ? 'Всички статуси' : 'All statuses'}</option>
          <option value="ACTIVE">{language === 'bg' ? 'Активен' : 'Active'}</option>
          <option value="PENDING">{language === 'bg' ? 'Чакащ' : 'Pending'}</option>
          <option value="SUSPENDED">{language === 'bg' ? 'Спрян' : 'Suspended'}</option>
        </FilterSelect>
      </FiltersBar>

      <Table>
        <TableHeader>
          <span>{language === 'bg' ? 'Партньор' : 'Partner'}</span>
          <span>{language === 'bg' ? 'Категория' : 'Category'}</span>
          <span>{language === 'bg' ? 'Ниво' : 'Tier'}</span>
          <span>{language === 'bg' ? 'Отстъпка' : 'Discount'}</span>
          <span>{language === 'bg' ? 'Статус' : 'Status'}</span>
          <span></span>
        </TableHeader>

        {isLoading ? (
          <EmptyState>{language === 'bg' ? 'Зареждане...' : 'Loading...'}</EmptyState>
        ) : partners.length === 0 ? (
          <EmptyState>{language === 'bg' ? 'Няма намерени партньори' : 'No partners found'}</EmptyState>
        ) : (
          partners.map((partner, i) => (
            <TableRow
              key={partner.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <div>
                <PartnerName>
                  {partner.businessName || partner.name}
                  {partner.pendingChanges && (
                    <span style={{
                      display: 'inline-block',
                      background: '#f59e0b',
                      color: '#fff',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '10px',
                      marginLeft: '6px',
                      verticalAlign: 'middle',
                    }}>
                      ПРОМЕНИ
                    </span>
                  )}
                </PartnerName>
                {(partner.businessNameBg || partner.nameBg) && (
                  <PartnerMeta>{partner.businessNameBg || partner.nameBg}</PartnerMeta>
                )}
                {partner.city && <PartnerMeta>{partner.city}</PartnerMeta>}
              </div>
              <span>{(() => {
                const catId = partner.categories?.length ? partner.categories[0] : partner.category;
                return catId ? getCategoryName(migrateCategoryId(catId), language) : '—';
              })()}</span>
              <span>
                {partner.partnerType ? (
                  <TypeBadge $color={partner.partnerType.color}>
                    {language === 'bg' ? (partner.partnerType.nameBg || partner.partnerType.name) : partner.partnerType.name}
                  </TypeBadge>
                ) : (
                  <TypeBadge>—</TypeBadge>
                )}
              </span>
              <DiscountBadge>{effectiveRate(partner)}%</DiscountBadge>
              <span>
                <StatusBadge $status={String(partner.status).toUpperCase()}>
                  {partner.status}
                </StatusBadge>
              </span>
              <ActionCell>
                <QrButton type="button" onClick={() => downloadQR(partner)} title={language === 'bg' ? 'Изтегли QR код (SVG)' : 'Download QR code (SVG)'}>
                  ↓ QR
                </QrButton>
                <VenueButton type="button" onClick={() => openVenueModal(partner)} title={language === 'bg' ? 'Създай нов обект' : 'Create venue'}>
                  {language === 'bg' ? '+ Обект' : '+ Venue'}
                </VenueButton>
                {partner.venues && partner.venues.length > 0 && (
                  <EditVenueButton type="button" onClick={() => openEditVenueModal(partner)} title={language === 'bg' ? 'Редактирай обект' : 'Edit venue'}>
                    {language === 'bg' ? '✎ Обект' : '✎ Venue'}
                  </EditVenueButton>
                )}
                <MenuButton type="button" onClick={() => openMenuModal(partner)} title={language === 'bg' ? 'Качи меню' : 'Upload menu'}>
                  {language === 'bg' ? 'Меню' : 'Menu'}
                </MenuButton>
                {partner.pendingChanges && (
                  <button
                    type="button"
                    onClick={() => setReviewPartner(partner)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: '#fef3c7',
                      border: '1px solid #f59e0b',
                      borderRadius: '0.5rem',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: '#92400e',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Преглед
                  </button>
                )}
                <EditButton onClick={() => openEdit(partner)}>
                  {language === 'bg' ? 'Редактирай' : 'Edit'}
                </EditButton>
              </ActionCell>
            </TableRow>
          ))
        )}
      </Table>

      {/* ── Menu Upload Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {menuPartner && (
          <Overlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => { if (e.target === e.currentTarget) closeMenuModal(); }}
          >
            <Modal
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
            >
              <ModalTitle>
                {language === 'bg' ? 'Меню на партньора' : 'Partner Menu'} — {menuPartner.businessName || menuPartner.name}
              </ModalTitle>

              {/* Venue selector */}
              {(menuPartner.venues ?? []).length === 0 ? (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem' }}>
                  {language === 'bg' ? 'Няма налични локации за този партньор.' : 'No venues found for this partner.'}
                </p>
              ) : (menuPartner.venues ?? []).length > 1 && (
                <FormField $full style={{ marginBottom: '1rem' }}>
                  <Label>{language === 'bg' ? 'Изберете локация' : 'Select venue'}</Label>
                  <Select
                    value={menuVenueId}
                    onChange={e => setMenuVenueId(e.target.value)}
                  >
                    <option value="">{language === 'bg' ? '— Изберете локация —' : '— Select a venue —'}</option>
                    {(menuPartner.venues ?? []).map(v => (
                      <option key={v.id} value={v.id}>{v.name}{v.city ? ` (${v.city})` : ''}</option>
                    ))}
                  </Select>
                </FormField>
              )}

              {/* Image drop zone */}
              {(menuPartner.venues ?? []).length > 0 && (
                <>
                  <div
                    style={{
                      border: `2px dashed ${menuDragging ? '#059669' : menuFiles.length > 0 ? '#10b981' : 'var(--color-border)'}`,
                      borderRadius: '0.75rem',
                      padding: '2rem',
                      textAlign: 'center',
                      background: menuDragging ? 'rgba(5,150,105,0.04)' : 'var(--color-background)',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, background 0.15s',
                      marginBottom: '1rem',
                    }}
                    onClick={() => menuInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setMenuDragging(true); }}
                    onDragLeave={() => setMenuDragging(false)}
                    onDrop={handleMenuDrop}
                  >
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                    {menuFiles.length > 0 ? (
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {menuFiles.length} {language === 'bg' ? 'снимки избрани' : 'image(s) selected'}
                      </p>
                    ) : (
                      <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                        {language === 'bg'
                          ? 'Плъзнете снимки тук или кликнете за да изберете'
                          : 'Drag & drop menu images here, or click to select'}
                      </p>
                    )}
                    <p style={{ margin: '0.5rem 0 0', color: 'var(--color-text-tertiary)', fontSize: '0.78rem' }}>
                      {language === 'bg' ? 'JPEG, PNG, WebP — до 20 файла, 20MB всеки' : 'JPEG, PNG, WebP — up to 20 files, 20MB each'}
                    </p>
                    <input
                      ref={menuInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      style={{ display: 'none' }}
                      onChange={e => handleMenuFiles(e.target.files)}
                    />
                  </div>

                  {menuFiles.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {menuFiles.map((f, i) => (
                        <li key={i} style={{ background: 'var(--color-background-secondary)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '0.25rem 0.6rem', fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {f.name}
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0, fontSize: '0.9rem', lineHeight: 1 }}
                            onClick={() => setMenuFiles(prev => prev.filter((_, idx) => idx !== i))}
                          >✕</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              <ModalFooter>
                <CancelButton type="button" onClick={closeMenuModal}>
                  {language === 'bg' ? 'Затвори' : 'Close'}
                </CancelButton>
                {(menuPartner.venues ?? []).length > 0 && (
                  <>
                    <CancelButton
                      type="button"
                      disabled={!menuVenueId || menuUploading}
                      onClick={handleMenuClear}
                      style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                    >
                      {language === 'bg' ? 'Изчисти меню' : 'Clear menu'}
                    </CancelButton>
                    <SubmitButton
                      type="button"
                      disabled={!menuVenueId || menuFiles.length === 0 || menuUploading}
                      onClick={handleMenuUpload}
                    >
                      {menuUploading
                        ? (language === 'bg' ? 'Качване...' : 'Uploading...')
                        : (language === 'bg' ? 'Качи снимки' : 'Upload images')}
                    </SubmitButton>
                  </>
                )}
              </ModalFooter>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ── Create Partner Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreate && (
          <Overlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => { if (e.target === e.currentTarget) { setShowCreate(false); setCreateForm(emptyCreate); setCreateCategories([]); setCreateLocations([]); } }}
          >
            <Modal
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
            >
              <ModalTitle>{language === 'bg' ? 'Създай Нов Партньор' : 'Create New Partner'}</ModalTitle>

              <form onSubmit={handleCreateSubmit}>
                <FormGrid>
                  <FormField $full>
                    <Label>
                      {language === 'bg' ? 'Имейл (акаунт на партньора)' : 'Email (partner account)'} <Required>*</Required>
                    </Label>
                    <Input
                      type="email"
                      value={createForm.email}
                      onChange={e => handleCreateField('email', e.target.value)}
                      required
                    />
                    <FieldHint>
                      {language === 'bg'
                        ? 'Ако потребителят не съществува, ще бъде създаден автоматично с роля PARTNER'
                        : 'If the user does not exist, they will be created automatically with the PARTNER role'}
                    </FieldHint>
                  </FormField>

                  <FormField>
                    <Label>
                      {language === 'bg' ? 'Бизнес Название' : 'Business Name'} <Required>*</Required>
                    </Label>
                    <Input
                      type="text"
                      value={createForm.businessName}
                      onChange={e => handleCreateField('businessName', e.target.value)}
                      required
                    />
                  </FormField>

                  <FormField>
                    <Label>{language === 'bg' ? 'Название (БГ)' : 'Business Name (BG)'}</Label>
                    <Input
                      type="text"
                      value={createForm.businessNameBg}
                      onChange={e => handleCreateField('businessNameBg', e.target.value)}
                    />
                  </FormField>

                  <FormField $full>
                    <Label>
                      {language === 'bg' ? 'Категории' : 'Categories'} <Required>*</Required>
                    </Label>
                    <CategoryPicker
                      selected={createCategories}
                      onChange={setCreateCategories}
                      language={language}
                    />
                    {createCategories.length > 0 && (
                      <FieldHint>
                        {language === 'bg'
                          ? `Избрано: ${createCategories.map(id => getCategoryName(id, 'bg')).join(', ')}`
                          : `Selected: ${createCategories.map(id => getCategoryName(id, 'en')).join(', ')}`}
                      </FieldHint>
                    )}
                  </FormField>

                  <FormField>
                    <Label>
                      {language === 'bg' ? 'Тип Партньор' : 'Partner Type'} <Required>*</Required>
                    </Label>
                    <Select
                      value={createForm.partnerTypeId}
                      onChange={e => handleCreateField('partnerTypeId', e.target.value)}
                      required
                    >
                      <option value="">{language === 'bg' ? 'Изберете тип' : 'Select type'}</option>
                      {partnerTypes.filter(t => t.isActive).map(t => (
                        <option key={t.id} value={t.id}>
                          {language === 'bg' ? (t.nameBg || t.name) : t.name} — max {t.maxDiscountRate}%
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField>
                    <Label>
                      {language === 'bg' ? 'Отстъпка (%)' : 'Discount Rate (%)'} <Required>*</Required>
                    </Label>
                    <Select
                      value={createForm.discountRate}
                      onChange={e => handleCreateField('discountRate', e.target.value)}
                      required
                    >
                      <option value="">{language === 'bg' ? 'Изберете отстъпка' : 'Select discount'}</option>
                      {DISCOUNT_STEPS.filter(s => s <= createTypeMax).map(s => (
                        <option key={s} value={String(s)}>{s}%</option>
                      ))}
                    </Select>
                    <FieldHint>
                      {language === 'bg'
                        ? `Макс. за избрания тип: ${createTypeMax}%`
                        : `Max for selected type: ${createTypeMax}%`}
                    </FieldHint>
                  </FormField>

                  <FormField>
                    <Label>{language === 'bg' ? 'Телефон' : 'Phone'}</Label>
                    <Input type="tel" value={createForm.phone} onChange={e => handleCreateField('phone', e.target.value)} />
                  </FormField>

                  <FormField $full>
                    <Label>{language === 'bg' ? 'Уебсайт' : 'Website'}</Label>
                    <Input type="url" placeholder="https://" value={createForm.website} onChange={e => handleCreateField('website', e.target.value)} />
                  </FormField>

                  <FormField $full>
                    <Label>{language === 'bg' ? 'Описание (EN)' : 'Description (EN)'}</Label>
                    <Textarea
                      value={createForm.description}
                      onChange={e => handleCreateField('description', e.target.value)}
                      placeholder={language === 'bg' ? 'Кратко описание на бизнеса...' : 'Short business description...'}
                    />
                  </FormField>

                  <FormField $full>
                    <Label>{language === 'bg' ? 'Описание (БГ)' : 'Description (BG)'}</Label>
                    <Textarea
                      value={createForm.descriptionBg}
                      onChange={e => handleCreateField('descriptionBg', e.target.value)}
                      placeholder={language === 'bg' ? 'Кратко описание на бизнеса на български...' : 'Short business description in Bulgarian...'}
                    />
                  </FormField>

                  <FormField $full>
                    <LocationManager
                      locations={createLocations}
                      onChange={setCreateLocations}
                      language={language}
                    />
                    <FieldHint>
                      {language === 'bg'
                        ? `Добавете до ${MAX_LOCATIONS} локации/обекта. Въведете поне 3 букви от улицата за автодовършване.`
                        : `Add up to ${MAX_LOCATIONS} locations/venues. Type 3+ street letters for address autocomplete.`}
                    </FieldHint>
                  </FormField>
                </FormGrid>

                <ModalFooter>
                  <CancelButton type="button" onClick={() => { setShowCreate(false); setCreateForm(emptyCreate); setCreateCategories([]); setCreateLocations([]); }}>
                    {language === 'bg' ? 'Отказ' : 'Cancel'}
                  </CancelButton>
                  <SubmitButton type="submit" disabled={!createForm.email || createCategories.length === 0 || createMutation.isPending}>
                    {createMutation.isPending
                      ? (language === 'bg' ? 'Създаване...' : 'Creating...')
                      : (language === 'bg' ? 'Създай Партньор' : 'Create Partner')}
                  </SubmitButton>
                </ModalFooter>
              </form>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ── Edit Partner Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {editingPartner && (
          <Overlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => { if (e.target === e.currentTarget) setEditingPartner(null); }}
          >
            <Modal
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
            >
              <ModalTitle>
                {language === 'bg' ? 'Редактирай Партньор' : 'Edit Partner'}: {editingPartner.businessName || editingPartner.name}
              </ModalTitle>

              <form onSubmit={handleEditSubmit}>
                {/* ── Profile fields ── */}
                <FormGrid>
                  <FormField>
                    <Label>{language === 'bg' ? 'Бизнес Название' : 'Business Name'} <Required>*</Required></Label>
                    <Input
                      type="text"
                      value={editForm.businessName}
                      onChange={e => setEditForm(prev => ({ ...prev, businessName: e.target.value }))}
                      required
                    />
                  </FormField>

                  <FormField>
                    <Label>{language === 'bg' ? 'Название (БГ)' : 'Business Name (BG)'}</Label>
                    <Input
                      type="text"
                      value={editForm.businessNameBg}
                      onChange={e => setEditForm(prev => ({ ...prev, businessNameBg: e.target.value }))}
                    />
                  </FormField>

                  <FormField $full>
                    <Label>{language === 'bg' ? 'Категории' : 'Categories'} <Required>*</Required></Label>
                    <CategoryPicker
                      selected={editCategories}
                      onChange={setEditCategories}
                      language={language}
                    />
                    {editCategories.length > 0 && (
                      <FieldHint>
                        {language === 'bg'
                          ? `Избрано: ${editCategories.map(id => getCategoryName(id, 'bg')).join(', ')}`
                          : `Selected: ${editCategories.map(id => getCategoryName(id, 'en')).join(', ')}`}
                      </FieldHint>
                    )}
                  </FormField>

                  <FormField>
                    <Label>{language === 'bg' ? 'Град' : 'City'}</Label>
                    <Input
                      type="text"
                      value={editForm.city}
                      onChange={e => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                    />
                  </FormField>

                  <FormField>
                    <Label>{language === 'bg' ? 'Регион' : 'Region'}</Label>
                    <Input
                      type="text"
                      value={editForm.region}
                      onChange={e => setEditForm(prev => ({ ...prev, region: e.target.value }))}
                    />
                  </FormField>

                  <FormField $full>
                    <Label>{language === 'bg' ? 'Адрес' : 'Address'}</Label>
                    <Input
                      type="text"
                      value={editForm.address}
                      onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                    />
                  </FormField>

                  <FormField>
                    <Label>{language === 'bg' ? 'Телефон' : 'Phone'}</Label>
                    <Input
                      type="tel"
                      value={editForm.phone}
                      onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </FormField>

                  <FormField>
                    <Label>{language === 'bg' ? 'Имейл' : 'Email'}</Label>
                    <Input
                      type="email"
                      value={editForm.email}
                      onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </FormField>

                  <FormField $full>
                    <Label>{language === 'bg' ? 'Уебсайт' : 'Website'}</Label>
                    <Input
                      type="url"
                      placeholder="https://"
                      value={editForm.website}
                      onChange={e => setEditForm(prev => ({ ...prev, website: e.target.value }))}
                    />
                  </FormField>

                  <FormField $full>
                    <Label>{language === 'bg' ? 'Описание (EN)' : 'Description (EN)'}</Label>
                    <Textarea
                      value={editForm.description}
                      onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder={language === 'bg' ? 'Кратко описание...' : 'Short description...'}
                    />
                  </FormField>

                  <FormField $full>
                    <Label>{language === 'bg' ? 'Описание (БГ)' : 'Description (BG)'}</Label>
                    <Textarea
                      value={editForm.descriptionBg}
                      onChange={e => setEditForm(prev => ({ ...prev, descriptionBg: e.target.value }))}
                      placeholder={language === 'bg' ? 'Кратко описание на български...' : 'Short description in Bulgarian...'}
                    />
                  </FormField>
                </FormGrid>

                {/* ── Admin fields ── */}
                <FormGrid style={{ marginTop: '1.25rem' }}>
                  <FormField>
                    <Label>{language === 'bg' ? 'Тип Партньор' : 'Partner Type'}</Label>
                    <Select
                      value={editForm.partnerTypeId}
                      onChange={e => handleEditTypeChange(e.target.value)}
                    >
                      <option value="">{language === 'bg' ? 'Изберете тип' : 'Select type'}</option>
                      {partnerTypes.filter(t => t.isActive).map(t => (
                        <option key={t.id} value={t.id}>
                          {language === 'bg' ? (t.nameBg || t.name) : t.name} — max {t.maxDiscountRate}%
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField>
                    <Label>{language === 'bg' ? 'Отстъпка (%)' : 'Discount Rate (%)'}</Label>
                    <Select
                      value={editForm.discountRate}
                      onChange={e => setEditForm(prev => ({ ...prev, discountRate: e.target.value }))}
                    >
                      <option value="">{language === 'bg' ? 'Изберете отстъпка' : 'Select discount'}</option>
                      {DISCOUNT_STEPS.filter(s => s <= editTypeMax).map(s => (
                        <option key={s} value={String(s)}>{s}%</option>
                      ))}
                    </Select>
                    <FieldHint>
                      {language === 'bg'
                        ? `Макс. за избрания тип: ${editTypeMax}%`
                        : `Max for selected type: ${editTypeMax}%`}
                    </FieldHint>
                  </FormField>

                  <FormField $full>
                    <Label>{language === 'bg' ? 'Статус' : 'Status'}</Label>
                    <Select
                      value={editForm.status}
                      onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value as PartnerStatus }))}
                    >
                      <option value="ACTIVE">{language === 'bg' ? 'Активен' : 'Active'}</option>
                      <option value="PENDING">{language === 'bg' ? 'Чакащ одобрение' : 'Pending'}</option>
                      <option value="SUSPENDED">{language === 'bg' ? 'Спрян' : 'Suspended'}</option>
                      <option value="INACTIVE">{language === 'bg' ? 'Неактивен' : 'Inactive'}</option>
                    </Select>
                  </FormField>
                </FormGrid>

                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--color-background-secondary)', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
                      {language === 'bg' ? 'QR Код на партньора' : 'Partner QR Code'}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                      {language === 'bg' ? 'Уникален SVG вектор файл за печат и дигитална употреба' : 'Unique vector SVG file for print and digital use'}
                    </div>
                  </div>
                  <QrButton type="button" onClick={() => editingPartner && downloadQR(editingPartner)}>
                    {language === 'bg' ? '↓ Изтегли QR (SVG)' : '↓ Download QR (SVG)'}
                  </QrButton>
                </div>

                <ModalFooter>
                  <CancelButton type="button" onClick={() => setEditingPartner(null)}>
                    {language === 'bg' ? 'Отказ' : 'Cancel'}
                  </CancelButton>
                  <SubmitButton type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending
                      ? (language === 'bg' ? 'Запазване...' : 'Saving...')
                      : (language === 'bg' ? 'Запази промените' : 'Save Changes')}
                  </SubmitButton>
                </ModalFooter>
              </form>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ── Pending Changes Review Modal ──────────────────────────────────── */}
      <AnimatePresence>
        {reviewPartner && (
          <Overlay
            key="review-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => { if (e.target === e.currentTarget) setReviewPartner(null); }}
          >
            <Modal
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '700px' }}
            >
              <ModalTitle>
                Промени за преглед — {reviewPartner.businessName || reviewPartner.name}
              </ModalTitle>

              {(() => {
                const fieldLabels: Record<string, string> = {
                  businessName: 'Иmе',
                  businessNameBg: 'Иmе (БГ)',
                  category: 'Категория',
                  description: 'Описание',
                  descriptionBg: 'Описание (БГ)',
                  city: 'Град',
                  region: 'Регион',
                  address: 'Адрес',
                  phone: 'Телефон',
                  email: 'Имейл',
                  website: 'Уебсайт',
                  openingHours: 'Работно врeмe',
                  features: 'Харaктеристики',
                  amenities: 'Удобства',
                };
                const pending = reviewPartner.pendingChanges as Record<string, unknown>;
                const changedKeys = Object.keys(pending);
                if (changedKeys.length === 0) {
                  return <p style={{ color: 'var(--color-text-secondary)' }}>Няма полета за преглед.</p>;
                }
                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-background-secondary)' }}>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Поле</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Текущо</th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', width: '2rem' }}></th>
                        <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Предложено</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changedKeys.map(key => {
                        const label = fieldLabels[key] || key;
                        const currentVal = String((reviewPartner as unknown as Record<string, unknown>)[key] ?? '—');
                        const pendingVal = String(pending[key] ?? '—');
                        return (
                          <tr key={key} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</td>
                            <td style={{ padding: '0.625rem 0.75rem', color: '#dc2626', textDecoration: 'line-through', maxWidth: '180px', wordBreak: 'break-word' }}>{currentVal}</td>
                            <td style={{ padding: '0.625rem 0.25rem', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>→</td>
                            <td style={{ padding: '0.625rem 0.75rem', color: '#059669', fontWeight: 600, maxWidth: '180px', wordBreak: 'break-word' }}>{pendingVal}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}

              <ModalFooter>
                <CancelButton type="button" onClick={() => setReviewPartner(null)}>
                  Затвори
                </CancelButton>
                <CancelButton
                  type="button"
                  onClick={() => rejectMutation.mutate(reviewPartner.id)}
                  disabled={rejectMutation.isPending || approveMutation.isPending}
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                >
                  {rejectMutation.isPending ? 'Отхвърляне...' : 'Откажи промените'}
                </CancelButton>
                <SubmitButton
                  type="button"
                  onClick={() => approveMutation.mutate(reviewPartner.id)}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}
                >
                  {approveMutation.isPending ? 'Одобряване...' : 'Одобри'}
                </SubmitButton>
              </ModalFooter>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ── Venue Creation Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {venuePartner && (
          <Overlay
            key="venue-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setVenuePartner(null)}
          >
            <Modal
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <ModalTitle>
                {language === 'bg' ? '+ Нов Обект' : '+ New Venue'} — {venuePartner.businessName}
              </ModalTitle>
              <form onSubmit={handleVenueSubmit}>
                <FormGrid>
                  <FormField $full>
                    <Label>{language === 'bg' ? 'Име на обекта' : 'Venue name'}<Required>*</Required></Label>
                    <Input
                      value={venueForm.name}
                      onChange={e => setVenueForm(f => ({ ...f, name: e.target.value }))}
                      placeholder={language === 'bg' ? 'напр. Ресторант Дива — Лозенец' : 'e.g. Main Branch'}
                      required
                    />
                  </FormField>
                  <FormField $full>
                    <Label>{language === 'bg' ? 'Име на обекта (БГ)' : 'Venue name (BG)'}</Label>
                    <Input
                      value={venueForm.nameBg}
                      onChange={e => setVenueForm(f => ({ ...f, nameBg: e.target.value }))}
                      placeholder={language === 'bg' ? 'напр. Ресторант Дива' : 'e.g. Ресторант Дива'}
                    />
                  </FormField>
                  <FormField $full>
                    <Label>{language === 'bg' ? 'Адрес' : 'Address'}<Required>*</Required></Label>
                    <AddressAutocomplete
                      large
                      value={venueForm.address}
                      onChange={val => setVenueForm(f => ({ ...f, address: val, latitude: undefined, longitude: undefined }))}
                      onSelect={({ address, city, region, latitude, longitude }) =>
                        setVenueForm(f => ({ ...f, address, city, region, latitude, longitude }))
                      }
                      placeholder={language === 'bg' ? 'напр. бул. Черни връх 45' : 'e.g. 45 Main St'}
                    />
                    {venueForm.latitude !== undefined && venueForm.longitude !== undefined && (
                      <LocationCoords>
                        ✓ {language === 'bg' ? 'Координатите са зададени' : 'Coordinates set'}: {venueForm.latitude.toFixed(5)}, {venueForm.longitude.toFixed(5)}
                      </LocationCoords>
                    )}
                  </FormField>
                  <FormField>
                    <Label>{language === 'bg' ? 'Град' : 'City'}<Required>*</Required></Label>
                    <Input
                      value={venueForm.city}
                      onChange={e => setVenueForm(f => ({ ...f, city: e.target.value }))}
                      placeholder={language === 'bg' ? 'напр. София' : 'e.g. Sofia'}
                      required
                    />
                  </FormField>
                  <FormField>
                    <Label>{language === 'bg' ? 'Квартал / Район' : 'Region'}</Label>
                    <Input
                      value={venueForm.region}
                      onChange={e => setVenueForm(f => ({ ...f, region: e.target.value }))}
                      placeholder={language === 'bg' ? 'напр. Лозенец' : 'e.g. Downtown'}
                    />
                  </FormField>
                  <FormField>
                    <Label>{language === 'bg' ? 'Телефон' : 'Phone'}</Label>
                    <Input
                      value={venueForm.phone}
                      onChange={e => setVenueForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="+359 88 ..."
                    />
                  </FormField>
                  <FormField>
                    <Label>{language === 'bg' ? 'Имейл' : 'Email'}</Label>
                    <Input
                      type="email"
                      value={venueForm.email}
                      onChange={e => setVenueForm(f => ({ ...f, email: e.target.value }))}
                      placeholder={language === 'bg' ? 'напр. info@ресторант.bg' : 'e.g. info@venue.com'}
                    />
                  </FormField>
                  <FormField $full>
                    <Label>{language === 'bg' ? 'Описание' : 'Description'}</Label>
                    <Input
                      as="textarea"
                      value={venueForm.description}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setVenueForm(f => ({ ...f, description: e.target.value }))}
                      placeholder={language === 'bg' ? 'Кратко описание на обекта...' : 'Short venue description...'}
                      style={{ minHeight: '80px', resize: 'vertical' }}
                    />
                  </FormField>
                  <FormField $full>
                    <Label>{language === 'bg' ? 'Описание (БГ)' : 'Description (BG)'}</Label>
                    <Input
                      as="textarea"
                      value={venueForm.descriptionBg}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setVenueForm(f => ({ ...f, descriptionBg: e.target.value }))}
                      placeholder={language === 'bg' ? 'Кратко описание на обекта на български...' : 'Short venue description in Bulgarian...'}
                      style={{ minHeight: '80px', resize: 'vertical' }}
                    />
                  </FormField>
                </FormGrid>
                <ModalFooter>
                  <CancelButton type="button" onClick={() => setVenuePartner(null)}>
                    {language === 'bg' ? 'Отказ' : 'Cancel'}
                  </CancelButton>
                  <SubmitButton type="submit" disabled={venueSubmitting}>
                    {venueSubmitting
                      ? (language === 'bg' ? 'Създаване...' : 'Creating...')
                      : (language === 'bg' ? '+ Създай Обект' : '+ Create Venue')}
                  </SubmitButton>
                </ModalFooter>
              </form>
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>

      {/* ── Venue Edit Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {editVenuePartner && (
          <Overlay
            key="edit-venue-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditVenuePartner(null)}
          >
            <Modal
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <ModalTitle>
                {language === 'bg' ? 'Редактирай Обект' : 'Edit Venue'} — {editVenuePartner.businessName}
              </ModalTitle>
              {editVenuePartner.venues && editVenuePartner.venues.length > 1 && (
                <FormField $full style={{ marginBottom: '1rem' }}>
                  <Label>{language === 'bg' ? 'Избери обект' : 'Select venue'}</Label>
                  <Select value={editVenueId} onChange={e => loadEditVenue(e.target.value)}>
                    {editVenuePartner.venues.map(v => (
                      <option key={v.id} value={v.id}>{v.name}{v.city ? ` — ${v.city}` : ''}</option>
                    ))}
                  </Select>
                </FormField>
              )}
              {editVenueLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
                  {language === 'bg' ? 'Зареждане...' : 'Loading...'}
                </div>
              ) : (
                <form onSubmit={handleVenueEditSubmit}>
                  <FormGrid>
                    <FormField $full>
                      <Label>{language === 'bg' ? 'Име на обекта' : 'Venue name'}<Required>*</Required></Label>
                      <Input
                        value={editVenueForm.name}
                        onChange={e => setEditVenueForm(f => ({ ...f, name: e.target.value }))}
                        placeholder={language === 'bg' ? 'напр. Ресторант Дива — Лозенец' : 'e.g. Main Branch'}
                        required
                      />
                    </FormField>
                    <FormField $full>
                      <Label>{language === 'bg' ? 'Име на обекта (БГ)' : 'Venue name (BG)'}</Label>
                      <Input
                        value={editVenueForm.nameBg}
                        onChange={e => setEditVenueForm(f => ({ ...f, nameBg: e.target.value }))}
                        placeholder={language === 'bg' ? 'напр. Ресторант Дива' : 'e.g. Ресторант Дива'}
                      />
                    </FormField>
                    <FormField $full>
                      <Label>{language === 'bg' ? 'Адрес' : 'Address'}<Required>*</Required></Label>
                      <AddressAutocomplete
                        value={editVenueForm.address}
                        onChange={val => setEditVenueForm(f => ({ ...f, address: val, latitude: undefined, longitude: undefined }))}
                        onSelect={({ address, city, region, latitude, longitude }) =>
                          setEditVenueForm(f => ({ ...f, address, city, region, latitude, longitude }))
                        }
                        placeholder={language === 'bg' ? 'напр. бул. Черни връх 45' : 'e.g. 45 Main St'}
                      />
                      {editVenueForm.latitude !== undefined && editVenueForm.longitude !== undefined && (
                        <LocationCoords>
                          ✓ {language === 'bg' ? 'Координатите са зададени' : 'Coordinates set'}: {editVenueForm.latitude.toFixed(5)}, {editVenueForm.longitude.toFixed(5)}
                        </LocationCoords>
                      )}
                    </FormField>
                    <FormField>
                      <Label>{language === 'bg' ? 'Град' : 'City'}<Required>*</Required></Label>
                      <Input
                        value={editVenueForm.city}
                        onChange={e => setEditVenueForm(f => ({ ...f, city: e.target.value }))}
                        placeholder={language === 'bg' ? 'напр. София' : 'e.g. Sofia'}
                        required
                      />
                    </FormField>
                    <FormField>
                      <Label>{language === 'bg' ? 'Квартал / Район' : 'Region'}</Label>
                      <Input
                        value={editVenueForm.region}
                        onChange={e => setEditVenueForm(f => ({ ...f, region: e.target.value }))}
                        placeholder={language === 'bg' ? 'напр. Лозенец' : 'e.g. Downtown'}
                      />
                    </FormField>
                    <FormField>
                      <Label>{language === 'bg' ? 'Телефон' : 'Phone'}</Label>
                      <Input
                        value={editVenueForm.phone}
                        onChange={e => setEditVenueForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="+359 88 ..."
                      />
                    </FormField>
                    <FormField>
                      <Label>{language === 'bg' ? 'Имейл' : 'Email'}</Label>
                      <Input
                        type="email"
                        value={editVenueForm.email}
                        onChange={e => setEditVenueForm(f => ({ ...f, email: e.target.value }))}
                        placeholder={language === 'bg' ? 'напр. info@ресторант.bg' : 'e.g. info@venue.com'}
                      />
                    </FormField>
                    <FormField $full>
                      <Label>{language === 'bg' ? 'Описание' : 'Description'}</Label>
                      <Input
                        as="textarea"
                        value={editVenueForm.description}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditVenueForm(f => ({ ...f, description: e.target.value }))}
                        placeholder={language === 'bg' ? 'Кратко описание на обекта...' : 'Short venue description...'}
                        style={{ minHeight: '80px', resize: 'vertical' }}
                      />
                    </FormField>
                    <FormField $full>
                      <Label>{language === 'bg' ? 'Описание (БГ)' : 'Description (BG)'}</Label>
                      <Input
                        as="textarea"
                        value={editVenueForm.descriptionBg}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditVenueForm(f => ({ ...f, descriptionBg: e.target.value }))}
                        placeholder={language === 'bg' ? 'Кратко описание на обекта на български...' : 'Short venue description in Bulgarian...'}
                        style={{ minHeight: '80px', resize: 'vertical' }}
                      />
                    </FormField>
                  </FormGrid>
                  <FormDivider />
                  <FormField $full>
                    <Label>{language === 'bg' ? 'Линк към менюто (директна промяна)' : 'Menu URL (admin override)'}</Label>
                    <Input
                      type="url"
                      value={editVenueMenuUrl}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditVenueMenuUrl(e.target.value)}
                      placeholder="https://venue.com/menu.pdf"
                      disabled={editVenueSubmitting}
                    />
                    <HelperText>
                      {language === 'bg'
                        ? 'Задава директно живия URL — заобикаля прегледа. Остави празно за да запазиш текущото.'
                        : 'Directly sets the live menu URL — bypasses review. Leave blank to keep current.'}
                    </HelperText>
                  </FormField>
                  <ModalFooter style={{ justifyContent: 'space-between' }}>
                    <div>
                      {!deleteVenueConfirm ? (
                        <DangerButton type="button" onClick={() => setDeleteVenueConfirm(true)} disabled={deletingVenue}>
                          {language === 'bg' ? 'Изтрий обекта' : 'Delete venue'}
                        </DangerButton>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '0.9rem', color: '#dc2626', fontWeight: 600 }}>
                            {language === 'bg' ? 'Сигурен ли си?' : 'Are you sure?'}
                          </span>
                          <DangerButton type="button" onClick={handleVenueDelete} disabled={deletingVenue}>
                            {deletingVenue
                              ? (language === 'bg' ? 'Изтриване...' : 'Deleting...')
                              : (language === 'bg' ? 'Да, изтрий' : 'Yes, delete')}
                          </DangerButton>
                          <CancelButton type="button" onClick={() => setDeleteVenueConfirm(false)} disabled={deletingVenue}>
                            {language === 'bg' ? 'Отказ' : 'Cancel'}
                          </CancelButton>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <CancelButton type="button" onClick={() => setEditVenuePartner(null)}>
                        {language === 'bg' ? 'Отказ' : 'Cancel'}
                      </CancelButton>
                      <SubmitButton type="submit" disabled={editVenueSubmitting}>
                        {editVenueSubmitting
                          ? (language === 'bg' ? 'Запазване...' : 'Saving...')
                          : (language === 'bg' ? 'Запази промените' : 'Save Changes')}
                      </SubmitButton>
                    </div>
                  </ModalFooter>
                </form>
              )}
            </Modal>
          </Overlay>
        )}
      </AnimatePresence>
    </PageContainer>
  );
};

export default AdminPartnersPage;
