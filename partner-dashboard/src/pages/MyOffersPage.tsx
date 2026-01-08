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
  TrendingUp,
  Calendar,
  Users,
  MoreVertical,
  ClipboardList,
} from 'lucide-react';
import Button from '../components/common/Button/Button';
import { useOffers, useDeleteOffer, useToggleOfferStatus } from '../hooks/useOffers';

const content = {
  en: {
    title: 'My Offers',
    createNew: 'Create New Offer',
    allOffers: 'All Offers',
    active: 'Active',
    inactive: 'Inactive',
    expiredFilter: 'Expired',
    search: 'Search offers...',
    noOffers: 'No offers found',
    createFirst: 'Create your first offer to get started',
    edit: 'Edit',
    delete: 'Delete',
    activate: 'Activate',
    deactivate: 'Deactivate',
    views: 'Views',
    redemptions: 'Redemptions',
    validUntil: 'Valid until',
    expired: 'Expired',
    confirmDelete: 'Are you sure you want to delete this offer?',
    deleted: 'Offer deleted successfully',
    activated: 'Offer activated successfully',
    deactivated: 'Offer deactivated successfully',
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
    title: 'Моите Оферти',
    createNew: 'Създай Нова Оферта',
    allOffers: 'Всички Оферти',
    active: 'Активни',
    inactive: 'Неактивни',
    expiredFilter: 'Изтекли',
    search: 'Търсене на оферти...',
    noOffers: 'Няма намерени оферти',
    createFirst: 'Създайте първата си оферта за да започнете',
    edit: 'Редактирай',
    delete: 'Изтрий',
    activate: 'Активирай',
    deactivate: 'Деактивирай',
    views: 'Прегледи',
    redemptions: 'Използвания',
    validUntil: 'Валидна до',
    expired: 'Изтекла',
    confirmDelete: 'Сигурни ли сте, че искате да изтриете тази оферта?',
    deleted: 'Офертата е изтрита успешно',
    activated: 'Офертата е активирана успешно',
    deactivated: 'Офертата е деактивирана успешно',
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
  views: number;
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

  // Fetch real offers data
  const { data: offersData, isLoading, refetch } = useOffers({
    partnerId: user?.id,
    limit: 100
  });
  const deleteMutation = useDeleteOffer();
  const toggleMutation = useToggleOfferStatus();

  // Transform API data to match component interface
  const offers: Offer[] = (offersData?.data || []).map(offer => ({
    id: offer.id,
    title: offer.title,
    category: offer.category,
    discount: offer.discount,
    description: offer.description,
    validFrom: offer.validFrom || new Date().toISOString(),
    validUntil: offer.validUntil || new Date().toISOString(),
    maxRedemptions: offer.maxRedemptions,
    currentRedemptions: offer.currentRedemptions || 0,
    views: offer.views || 0,
    isActive: offer.isActive ?? false,
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
      } catch (error) {
        toast.error('Failed to delete offer');
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
    } catch (error) {
      toast.error('Failed to update offer status');
    }
  };

  const stats = {
    total: offers.length,
    active: offers.filter(o => o.isActive && !isExpired(o.validUntil)).length,
    inactive: offers.filter(o => !o.isActive && !isExpired(o.validUntil)).length,
    expired: offers.filter(o => isExpired(o.validUntil)).length,
  };

  return (
    <Container>
      <Header>
        <HeaderContent>
          <Title>{t.title}</Title>
          <Button onClick={() => navigate('/partners/offers/new')}>
            <Plus size={18} /> {t.createNew}
          </Button>
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
          <EmptyText>{t.createFirst}</EmptyText>
          <Button onClick={() => navigate('/partners/offers/new')}>
            <Plus size={18} /> {t.createNew}
          </Button>
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
                  <TrendingUp size={16} />
                  <span>
                    {offer.views} {t.views}
                  </span>
                </StatItem>
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

export default MyOffersPage;
