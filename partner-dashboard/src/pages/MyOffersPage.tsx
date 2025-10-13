import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
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
} from 'lucide-react';
import Button from '../components/common/Button/Button';

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
  const t = content[language as keyof typeof content];

  // Mock data - replace with real API call
  const [offers, setOffers] = useState<Offer[]>([
    {
      id: '1',
      title: '20% Off All Main Courses',
      category: 'restaurants',
      discount: 20,
      description: 'Enjoy 20% discount on all main courses',
      validFrom: '2025-10-01',
      validUntil: '2025-12-31',
      maxRedemptions: 100,
      currentRedemptions: 45,
      views: 1240,
      isActive: true,
      createdAt: '2025-09-15',
    },
    {
      id: '2',
      title: 'Free Dessert with Any Meal',
      category: 'restaurants',
      discount: 0,
      description: 'Get a free dessert when you order any main course',
      validFrom: '2025-10-01',
      validUntil: '2025-11-15',
      currentRedemptions: 23,
      views: 856,
      isActive: true,
      createdAt: '2025-09-20',
    },
    {
      id: '3',
      title: 'Summer Special - 30% Off',
      category: 'restaurants',
      discount: 30,
      description: 'Limited time summer special offer',
      validFrom: '2025-06-01',
      validUntil: '2025-08-31',
      currentRedemptions: 189,
      views: 2341,
      isActive: false,
      createdAt: '2025-05-25',
    },
  ]);

  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

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

  const handleDelete = (id: string) => {
    if (window.confirm(t.confirmDelete)) {
      setOffers(prev => prev.filter(offer => offer.id !== id));
      toast.success(t.deleted);
      setActiveMenu(null);
    }
  };

  const handleToggleActive = (id: string) => {
    setOffers(prev =>
      prev.map(offer =>
        offer.id === id ? { ...offer, isActive: !offer.isActive } : offer
      )
    );
    const offer = offers.find(o => o.id === id);
    toast.success(offer?.isActive ? t.deactivated : t.activated);
    setActiveMenu(null);
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
          <EmptyIcon>📋</EmptyIcon>
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
                <MenuButton onClick={() => setActiveMenu(activeMenu === offer.id ? null : offer.id)}>
                  <MoreVertical size={18} />
                </MenuButton>
                {activeMenu === offer.id && (
                  <MenuDropdown
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
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
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const StatCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
`;

const StatValue = styled.div<{ color?: string }>`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => props.color || 'var(--text-primary)'};
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
  padding: 0.75rem 1rem;
  border: 2px solid var(--gray-200);
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: var(--primary);
  }
`;

const FilterButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  background: white;
  padding: 0.25rem;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const FilterButton = styled.button<{ active: boolean }>`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  background: ${props => (props.active ? 'var(--primary)' : 'transparent')};
  color: ${props => (props.active ? 'white' : 'var(--text-secondary)')};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${props => (props.active ? 'var(--primary)' : 'var(--gray-100)')};
  }
`;

const OffersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 1.5rem;
`;

const OfferCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  position: relative;
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
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
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
  color: var(--text-secondary);
  transition: all 0.2s;

  &:hover {
    background: var(--gray-100);
    color: var(--text-primary);
  }
`;

const MenuDropdown = styled(motion.div)`
  position: absolute;
  top: 3rem;
  right: 1.5rem;
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  z-index: 10;
  min-width: 150px;
`;

const MenuItem = styled.button<{ danger?: boolean }>`
  width: 100%;
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  color: ${props => (props.danger ? 'var(--error)' : 'var(--text-primary)')};
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;

  &:hover {
    background: ${props => (props.danger ? 'var(--error-light)' : 'var(--gray-100)')};
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
