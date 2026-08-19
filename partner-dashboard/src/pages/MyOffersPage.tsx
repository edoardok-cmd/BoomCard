import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
  Users,
  MoreVertical,
  ClipboardList,
  AlertTriangle,
} from 'lucide-react';
import Button from '../components/common/Button/Button';
import { useOffers, useDeleteOffer, useToggleOfferStatus } from '../hooks/useOffers';
import { useCurrentPartner } from '../hooks/usePartners';

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
    title: 'My Discounts',
    createNew: 'Create New Discount',
    allOffers: 'All Discounts',
    active: 'Active',
    inactive: 'Inactive',
    expiredFilter: 'Expired',
    search: 'Search discounts...',
    noOffers: 'No discounts found',
    createFirst: 'Create your first discount to get started',
    edit: 'Edit',
    delete: 'Delete',
    activate: 'Activate',
    deactivate: 'Deactivate',
    redemptions: 'Redemptions',
    validUntil: 'Valid until',
    expired: 'Expired',
    confirmDelete: 'Are you sure you want to delete this discount?',
    deleted: 'Discount deleted successfully',
    activated: 'Discount activated successfully',
    deactivated: 'Discount deactivated successfully',
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
    title: 'Моите Отстъпки',
    createNew: 'Създай Нова Отстъпка',
    allOffers: 'Всички Отстъпки',
    active: 'Активни',
    inactive: 'Неактивни',
    expiredFilter: 'Изтекли',
    search: 'Търсене на отстъпки...',
    noOffers: 'Няма намерени отстъпки',
    createFirst: 'Създайте първата си отстъпка за да започнете',
    edit: 'Редактирай',
    delete: 'Изтрий',
    activate: 'Активирай',
    deactivate: 'Деактивирай',
    redemptions: 'Използвания',
    validUntil: 'Валидна до',
    expired: 'Изтекла',
    confirmDelete: 'Сигурни ли сте, че искате да изтриете тази отстъпка?',
    deleted: 'Отстъпката е изтрита успешно',
    activated: 'Отстъпката е активирана успешно',
    deactivated: 'Отстъпката е деактивирана успешно',
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

interface Offer {
  id: string;
  title: string;
  category: string;
  discount: number;
  description: string;
  validFrom: string;
  validUntil: string;
  maxRedemptions?: number;
  currentRedemptions: number;
  isActive: boolean;
  createdAt: string;
}

const MyOffersPage: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { user } = useAuth();
  const t = content[language as keyof typeof content];

  // State declarations
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // MEDIUM-2 fix (r2w): canEditOffers is admin-only. Partner-role users never
  // reach the menu dropdown below, so a separate isInactivePartner guard inside
  // it is dead code and creates a false safety impression (spec §5.1, §11.2).
  // The guard has been removed; the comment documents the design intent instead.
  // If canEditOffers is ever extended to include active partners, add an explicit
  // isInactivePartner guard at that point.
  const canEditOffers = user?.role === 'admin';

  // Resolve the PARTNER id (not the user id). The backend
  // /offers/partner/:partnerId route expects the Partner record id, which is
  // distinct from the authenticated user's id. Source it from /partners/me via
  // useCurrentPartner — gated on the partner role so the query never fires for
  // non-partner accounts (mirrors DashboardPage). Passing user?.id here (the
  // previous behaviour) meant the partner-scoped list never filtered correctly.
  const isPartner = user?.role === 'partner';
  const { data: partnerData } = useCurrentPartner(isPartner);
  const partnerId = partnerData?.id;

  // Fetch real offers data. useOffers gates on a truthy partnerId, so the query
  // stays idle until the partner id resolves (avoids an unfiltered request).
  const { data: offersData, refetch } = useOffers({
    partnerId,
    limit: 100
  });
  const deleteMutation = useDeleteOffer();
  const toggleMutation = useToggleOfferStatus();

  // Transform API data to match component interface.
  // Field mapping aligned to the REAL backend offer shape (offers.routes.ts /
  // Prisma Offer): the list returns `status` (ACTIVE|DRAFT|INACTIVE|EXPIRED),
  // `startDate`/`endDate`, and `usageCount`/`usageLimit`. There is no `isActive`,
  // `validUntil`, `views`, `currentRedemptions` or `maxRedemptions` field — the
  // previous mapping read those phantom keys, so every offer rendered as
  // inactive + expired with zero redemptions. View tracking does not exist on
  // the backend, so the views stat has been removed entirely.
  const offers: Offer[] = (offersData?.data || []).map(offer => ({
    id: offer.id,
    title: offer.title,
    category: offer.category,
    discount: offer.discount,
    description: offer.description,
    validFrom: offer.startDate || offer.validFrom || new Date().toISOString(),
    validUntil: offer.endDate || offer.validUntil || new Date().toISOString(),
    maxRedemptions: offer.usageLimit ?? offer.maxRedemptions ?? undefined,
    currentRedemptions: offer.usageCount ?? offer.currentRedemptions ?? 0,
    isActive: offer.status === 'ACTIVE',
    createdAt: offer.createdAt || new Date().toISOString(),
  }));

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-menu-container]')) {
        setActiveMenu(null);
      }
    };

    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeMenu]);

  const isExpired = (date: string) => {
    return new Date(date) < new Date();
  };

  const filteredOffers = offers.filter(offer => {
    const matchesSearch = offer.title.toLowerCase().includes(searchQuery.toLowerCase());
    const expired = isExpired(offer.validUntil);

    if (filter === 'active') return matchesSearch && offer.isActive && !expired;
    if (filter === 'inactive') return matchesSearch && !offer.isActive && !expired;
    if (filter === 'expired') return matchesSearch && expired;
    return matchesSearch;
  });

  const handleDelete = async (id: string) => {
    if (window.confirm(t.confirmDelete)) {
      try {
        await deleteMutation.mutateAsync(id);
        toast.success(t.deleted);
        setActiveMenu(null);
        refetch(); // Refresh the list
      } catch {
        toast.error('Failed to delete discount');
      }
    }
  };

  const handleToggleActive = async (id: string) => {
    const offer = offers.find(o => o.id === id);
    if (!offer) return;

    try {
      await toggleMutation.mutateAsync({ id, isActive: !offer.isActive });
      toast.success(offer.isActive ? t.deactivated : t.activated);
      setActiveMenu(null);
      refetch(); // Refresh the list
    } catch {
      toast.error('Failed to update discount status');
    }
  };

  const stats = {
    total: offers.length,
    active: offers.filter(o => o.isActive && !isExpired(o.validUntil)).length,
    inactive: offers.filter(o => !o.isActive && !isExpired(o.validUntil)).length,
    expired: offers.filter(o => isExpired(o.validUntil)).length,
  };

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
        <HeaderContent>
          <Title>{t.title}</Title>
          {canEditOffers && (
            <Button onClick={() => navigate('/partners/offers/new')}>
              <Plus size={18} /> {t.createNew}
            </Button>
          )}
        </HeaderContent>
      </Header>

      <StatsGrid>
        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
        >
          <StatLabel>{t.allOffers}</StatLabel>
          <StatValue>{stats.total}</StatValue>
        </StatCard>
        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StatLabel>{t.active}</StatLabel>
          <StatValue color="var(--success)">{stats.active}</StatValue>
        </StatCard>
        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <StatLabel>{t.inactive}</StatLabel>
          <StatValue color="var(--warning)">{stats.inactive}</StatValue>
        </StatCard>
        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <StatLabel>{t.expiredFilter}</StatLabel>
          <StatValue color="var(--text-secondary)">{stats.expired}</StatValue>
        </StatCard>
      </StatsGrid>

      <Filters>
        <SearchInput
          type="text"
          placeholder={t.search}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <FilterButtons>
          <FilterButton
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            {t.allOffers}
          </FilterButton>
          <FilterButton
            active={filter === 'active'}
            onClick={() => setFilter('active')}
          >
            {t.active}
          </FilterButton>
          <FilterButton
            active={filter === 'inactive'}
            onClick={() => setFilter('inactive')}
          >
            {t.inactive}
          </FilterButton>
          <FilterButton
            active={filter === 'expired'}
            onClick={() => setFilter('expired')}
          >
            {t.expiredFilter}
          </FilterButton>
        </FilterButtons>
      </Filters>

      {filteredOffers.length === 0 ? (
        <EmptyState>
          <EmptyIcon><ClipboardList size={64} /></EmptyIcon>
          <EmptyTitle>{t.noOffers}</EmptyTitle>
          {canEditOffers && <EmptyText>{t.createFirst}</EmptyText>}
          {canEditOffers && (
            <Button onClick={() => navigate('/partners/offers/new')}>
              <Plus size={18} /> {t.createNew}
            </Button>
          )}
        </EmptyState>
      ) : (
        <OffersGrid>
          {filteredOffers.map((offer, index) => (
            <OfferCard
              key={offer.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <OfferHeader>
                <OfferStatus isActive={offer.isActive} expired={isExpired(offer.validUntil)}>
                  {isExpired(offer.validUntil)
                    ? t.expired
                    : offer.isActive
                    ? t.active
                    : t.inactive}
                </OfferStatus>
                {canEditOffers && (
                  <div style={{ position: 'relative' }} data-menu-container>
                    <MenuButton onClick={() => setActiveMenu(activeMenu === offer.id ? null : offer.id)}>
                      <MoreVertical size={18} />
                    </MenuButton>
                    <AnimatePresence>
                      {activeMenu === offer.id && (
                        <MenuDropdown
                          initial={{ opacity: 0, scale: 0.95, y: -8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -8 }}
                          transition={{ duration: 0.15 }}
                        >
                          {/* This dropdown is only rendered when canEditOffers === true
                              (i.e. user.role === 'admin'). Partner-role users cannot
                              reach it, so all items here are visible to admins only.
                              Spec §5.1, §11.2 compliance is enforced by the canEditOffers
                              gate, not by a redundant isInactivePartner check inside. */}
                          <MenuItem onClick={() => navigate(`/partners/offers/${offer.id}/edit`)}>
                            <Edit size={16} /> {t.edit}
                          </MenuItem>
                          <MenuItem onClick={() => handleToggleActive(offer.id)}>
                            {offer.isActive ? (
                              <>
                                <EyeOff size={16} /> {t.deactivate}
                              </>
                            ) : (
                              <>
                                <Eye size={16} /> {t.activate}
                              </>
                            )}
                          </MenuItem>
                          <MenuItem danger onClick={() => handleDelete(offer.id)}>
                            <Trash2 size={16} /> {t.delete}
                          </MenuItem>
                        </MenuDropdown>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </OfferHeader>

              <OfferTitle>{offer.title}</OfferTitle>
              <OfferCategory>
                {t.categories[offer.category as keyof typeof t.categories]}
              </OfferCategory>

              {offer.discount > 0 && (
                <DiscountBadge>{offer.discount}% OFF</DiscountBadge>
              )}

              <OfferDescription>{offer.description}</OfferDescription>

              <OfferStats>
                <StatItem>
                  <Users size={16} />
                  <span>
                    {offer.currentRedemptions}
                    {offer.maxRedemptions && `/${offer.maxRedemptions}`} {t.redemptions}
                  </span>
                </StatItem>
              </OfferStats>

              <OfferFooter>
                <OfferDate expired={isExpired(offer.validUntil)}>
                  <Calendar size={14} />
                  {isExpired(offer.validUntil) ? (
                    <span>{t.expired}</span>
                  ) : (
                    <span>
                      {t.validUntil} {offer.validUntil}
                    </span>
                  )}
                </OfferDate>
              </OfferFooter>
            </OfferCard>
          ))}
        </OffersGrid>
      )}
    </Container>
  );
};

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  min-height: 100vh;
  background: linear-gradient(to bottom, #fafbfc 0%, #ffffff 50%, #fafbfc 100%);

  [data-theme="dark"] & {
    background: linear-gradient(to bottom, #111827 0%, #0a0a0a 50%, #111827 100%);
  }
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const HeaderContent = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: 800;
  background: linear-gradient(135deg, #111827 0%, #4f46e5 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  letter-spacing: -0.03em;
  line-height: 1.2;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const StatCard = styled(motion.div)`
  background: linear-gradient(to bottom right, #ffffff 0%, #fafbfc 100%);
  border-radius: 1.5rem;
  padding: 2rem;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.06),
    0 16px 48px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;

  [data-theme="dark"] & {
    background: linear-gradient(to bottom right, #1f2937 0%, #374151 100%);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.3),
      0 8px 24px rgba(0, 0, 0, 0.2),
      0 16px 48px rgba(0, 0, 0, 0.15);
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #6366f1 0%, #a855f7 100%);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 400ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:hover {
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 12px 32px rgba(0, 0, 0, 0.1),
      0 24px 64px rgba(0, 0, 0, 0.08);
    transform: translateY(-4px);
    border-color: rgba(99, 102, 241, 0.2);

    [data-theme="dark"] & {
      box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.4),
        0 12px 32px rgba(0, 0, 0, 0.3),
        0 24px 64px rgba(0, 0, 0, 0.2);
      border-color: rgba(99, 102, 241, 0.4);
    }

    &::before {
      transform: scaleX(1);
    }
  }
`;

const StatLabel = styled.div`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.75rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const StatValue = styled.div<{ color?: string }>`
  font-size: 2.5rem;
  font-weight: 800;
  color: ${props => props.color || '#111827'};
  letter-spacing: -0.03em;
  line-height: 1.2;

  [data-theme="dark"] & {
    color: ${props => props.color || '#f9fafb'};
  }
`;

const Filters = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const SearchInput = styled.input`
  flex: 1;
  padding: 0.875rem 1.125rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  font-size: 1rem;
  font-weight: 500;
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  background: white;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
    color: #f9fafb;
  }
  color: #111827;
  letter-spacing: -0.01em;

  &::placeholder {
    color: #9ca3af;
    font-weight: 400;
  }

  &:hover {
    border-color: #d1d5db;

    [data-theme="dark"] & {
      border-color: #4b5563;
    }
  }

  &:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
    background: #ffffff;

    [data-theme="dark"] & {
      background: #1f2937;
    }
  }
`;

const FilterButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  background: white;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.3),
      0 4px 12px rgba(0, 0, 0, 0.2);
  }
  padding: 0.375rem;
  border-radius: 0.75rem;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 4px 12px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.06);
`;

const FilterButton = styled.button<{ active: boolean }>`
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 0.5rem;
  background: ${props =>
    props.active
      ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
      : 'transparent'};
  color: ${props => (props.active ? 'white' : '#6b7280')};
  font-weight: 600;
  font-size: 0.9375rem;
  cursor: pointer;
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  letter-spacing: -0.01em;

  [data-theme="dark"] & {
    color: ${props => (props.active ? 'white' : '#9ca3af')};
  }

  &:hover {
    background: ${props =>
      props.active
        ? 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)'
        : '#f3f4f6'};
    transform: ${props => (props.active ? 'scale(1.02)' : 'none')};

    [data-theme="dark"] & {
      background: ${props =>
        props.active
          ? 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)'
          : '#374151'};
    }
  }

  &:active {
    transform: scale(0.98);
  }
`;

const OffersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
`;

const OfferCard = styled(motion.div)`
  background: white;

  [data-theme="dark"] & {
    background: #1f2937;
  }
  border-radius: 1.5rem;
  padding: 2rem;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.06),
    0 16px 48px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.06);
  position: relative;
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 1.5rem;
    padding: 2px;
    background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 400ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:hover {
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 12px 32px rgba(0, 0, 0, 0.1),
      0 24px 64px rgba(0, 0, 0, 0.08);
    transform: translateY(-6px);
    border-color: rgba(99, 102, 241, 0.2);

    &::before {
      opacity: 1;
    }
  }
`;

const OfferHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

const OfferStatus = styled.div<{ isActive: boolean; expired: boolean }>`
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 2rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  background: ${props =>
    props.expired
      ? 'var(--gray-200)'
      : props.isActive
      ? 'var(--success-light)'
      : 'var(--warning-light)'};
  color: ${props =>
    props.expired
      ? 'var(--text-secondary)'
      : props.isActive
      ? 'var(--success)'
      : 'var(--warning)'};
`;

const MenuButton = styled.button`
  background: transparent;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.5rem;
  color: #6b7280;
  transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background: #f3f4f6;

    [data-theme="dark"] & {
      background: #111827;
    }
    color: #111827;
    border-color: #e5e7eb;
  }

  &:active {
    transform: scale(0.95);
  }
`;

const MenuDropdown = styled(motion.div)`
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  background: white;

  [data-theme="dark"] & {
    background: #1f2937;
  }
  border-radius: 0.75rem;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.12),
    0 8px 32px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  z-index: 100;
  min-width: 180px;
  border: 1px solid rgba(0, 0, 0, 0.06);

  /* Arrow pointer */
  &::before {
    content: '';
    position: absolute;
    top: -6px;
    right: 1rem;
    width: 12px;
    height: 12px;
    background: white;

  [data-theme="dark"] & {
    background: #1f2937;
  }
    border-left: 1px solid rgba(0, 0, 0, 0.06);
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    transform: rotate(45deg);
  }
`;

const MenuItem = styled.button<{ danger?: boolean }>`
  width: 100%;
  padding: 0.875rem 1.125rem;
  border: none;
  background: transparent;
  color: ${props => (props.danger ? '#ef4444' : '#111827')};
  text-align: left;
  cursor: pointer;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.9375rem;
  font-weight: 500;
  position: relative;

  &:hover {
    background: ${props => (props.danger ? '#fef2f2' : '#f9fafb')};
    color: ${props => (props.danger ? '#dc2626' : '#111827')};
    padding-left: 1.25rem;
  }

  &:active {
    transform: scale(0.98);
  }

  & + & {
    border-top: 1px solid #f3f4f6;
  }

  svg {
    flex-shrink: 0;
  }
`;

const OfferTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
`;

const OfferCategory = styled.div`
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
`;

const DiscountBadge = styled.div`
  display: inline-block;
  background: var(--success);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 2rem;
  font-weight: 700;
  font-size: 0.875rem;
  margin-bottom: 1rem;
`;

const OfferDescription = styled.p`
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: 1rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const OfferStats = styled.div`
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--gray-200);
`;

const StatItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary);

  svg {
    color: var(--text-secondary);
  }
`;

const OfferFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const OfferDate = styled.div<{ expired: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: ${props => (props.expired ? 'var(--error)' : 'var(--text-secondary)')};

  svg {
    color: ${props => (props.expired ? 'var(--error)' : 'var(--text-secondary)')};
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 2rem;
  background: white;

  [data-theme="dark"] & {
    background: #1f2937;
  }
  border-radius: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
  margin-bottom: 1rem;
`;

const EmptyTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
`;

const EmptyText = styled.p`
  color: var(--text-secondary);
  margin-bottom: 2rem;
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

// Spec §8a warning banner — visible when the flag is enabled (non-production).
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

export default MyOffersPage;
