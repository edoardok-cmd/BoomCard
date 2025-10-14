import React, { useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import { useOffers } from '../hooks/useOffers';
import { offersService } from '../services/offers.service';
import { toast } from 'react-hot-toast';

const PageContainer = styled.div`
  max-width: 90rem;
  margin: 0 auto;
  padding: 2rem 1rem;
  min-height: calc(100vh - 4rem);
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
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
  color: #6b7280;
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
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  font-size: 1rem;
  transition: all 200ms;

  &:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }
`;

const FilterSelect = styled.select`
  padding: 0.75rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  font-size: 1rem;
  background: white;
  cursor: pointer;
  transition: all 200ms;

  &:focus {
    outline: none;
    border-color: #dc2626;
  }
`;

const Table = styled.div`
  background: white;
  border-radius: 1.25rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  border: 1px solid #e5e7eb;
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: 3fr 2fr 1fr 1fr 1fr 1fr 1.5fr;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 700;
  font-size: 0.875rem;
  color: #374151;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  @media (max-width: 1024px) {
    grid-template-columns: 2fr 1.5fr 1fr 1fr 1.5fr;
    & > :nth-child(3),
    & > :nth-child(4) {
      display: none;
    }
  }
`;

const TableRow = styled(motion.div)`
  display: grid;
  grid-template-columns: 3fr 2fr 1fr 1fr 1fr 1fr 1.5fr;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  align-items: center;
  transition: all 200ms;

  &:hover {
    background: #f9fafb;
  }

  &:last-child {
    border-bottom: none;
  }

  @media (max-width: 1024px) {
    grid-template-columns: 2fr 1.5fr 1fr 1fr 1.5fr;
    & > :nth-child(3),
    & > :nth-child(4) {
      display: none;
    }
  }
`;

const OfferInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const OfferImage = styled.img`
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 0.5rem;
  border: 2px solid #e5e7eb;
`;

const OfferDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const OfferTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 0.25rem 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const OfferPartner = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
`;

const StatusBadge = styled.span<{ status: string }>`
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: inline-block;
  background: ${props => {
    switch (props.status) {
      case 'ACTIVE': return '#dcfce7';
      case 'DRAFT': return '#fef3c7';
      case 'PAUSED': return '#e0e7ff';
      case 'EXPIRED': return '#fee2e2';
      default: return '#f3f4f6';
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'ACTIVE': return '#166534';
      case 'DRAFT': return '#92400e';
      case 'PAUSED': return '#3730a3';
      case 'EXPIRED': return '#991b1b';
      default: return '#374151';
    }
  }};
`;

const DiscountBadge = styled.span`
  font-size: 1.125rem;
  font-weight: 700;
  color: #dc2626;
`;

const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 52px;
  height: 28px;
  cursor: pointer;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  span {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #e5e7eb;
    border-radius: 9999px;
    transition: all 300ms;

    &::before {
      content: '';
      position: absolute;
      height: 20px;
      width: 20px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      border-radius: 50%;
      transition: all 300ms;
    }
  }

  input:checked + span {
    background-color: #dc2626;
  }

  input:checked + span::before {
    transform: translateX(24px);
  }
`;

const OrderInput = styled.input`
  width: 60px;
  padding: 0.375rem 0.5rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  text-align: center;
  transition: all 200ms;

  &:focus {
    outline: none;
    border-color: #dc2626;
  }

  &:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
`;

const ActionButton = styled.button<{ variant?: 'primary' | 'secondary' }>`
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms;
  border: none;

  ${props => props.variant === 'primary' ? `
    background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
    color: white;

    &:hover {
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
      transform: translateY(-2px);
    }
  ` : `
    background: white;
    color: #374151;
    border: 2px solid #e5e7eb;

    &:hover {
      border-color: #dc2626;
      color: #dc2626;
    }
  `}
`;

const EmptyState = styled.div`
  padding: 4rem 2rem;
  text-align: center;
  color: #6b7280;
`;

const AdminOffersPage: React.FC = () => {
  const { language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [featuredFilter, setFeaturedFilter] = useState('all');

  const { data: offersData, refetch } = useOffers({
    limit: 100,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(featuredFilter === 'featured' && { featured: true }),
  });

  const offers = offersData?.data || [];

  // Filter by search term
  const filteredOffers = offers.filter(offer => {
    const matchesSearch = searchTerm === '' ||
      offer.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      offer.titleBg?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      offer.partner?.businessName?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  const handleToggleFeatured = async (offerId: string, currentFeatured: boolean) => {
    try {
      await offersService.toggleFeaturedStatus(offerId, !currentFeatured);
      toast.success(
        language === 'bg'
          ? (!currentFeatured ? 'Офертата е маркирана като топ' : 'Офертата е премахната от топ')
          : (!currentFeatured ? 'Offer marked as featured' : 'Offer removed from featured')
      );
      refetch();
    } catch (error) {
      toast.error(
        language === 'bg'
          ? 'Грешка при актуализиране на офертата'
          : 'Error updating offer'
      );
    }
  };

  const handleUpdateOrder = async (offerId: string, order: number) => {
    try {
      await offersService.updateFeaturedOrder(offerId, order);
      toast.success(
        language === 'bg'
          ? 'Редът е актуализиран'
          : 'Order updated'
      );
      refetch();
    } catch (error) {
      toast.error(
        language === 'bg'
          ? 'Грешка при актуализиране на реда'
          : 'Error updating order'
      );
    }
  };

  return (
    <PageContainer>
      <PageHeader>
        <Title>
          {language === 'bg' ? 'Управление на Топ Оферти' : 'Manage Top Offers'}
        </Title>
        <Subtitle>
          {language === 'bg'
            ? 'Маркирайте оферти като топ, подредете ги и управлявайте показването им'
            : 'Mark offers as featured, reorder them, and manage their display'}
        </Subtitle>
      </PageHeader>

      <FiltersBar>
        <SearchInput
          type="text"
          placeholder={language === 'bg' ? 'Търсене...' : 'Search...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <FilterSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">{language === 'bg' ? 'Всички статуси' : 'All Statuses'}</option>
          <option value="ACTIVE">{language === 'bg' ? 'Активни' : 'Active'}</option>
          <option value="DRAFT">{language === 'bg' ? 'Чернови' : 'Draft'}</option>
          <option value="PAUSED">{language === 'bg' ? 'На пауза' : 'Paused'}</option>
          <option value="EXPIRED">{language === 'bg' ? 'Изтекли' : 'Expired'}</option>
        </FilterSelect>

        <FilterSelect value={featuredFilter} onChange={(e) => setFeaturedFilter(e.target.value)}>
          <option value="all">{language === 'bg' ? 'Всички оферти' : 'All Offers'}</option>
          <option value="featured">{language === 'bg' ? 'Само топ оферти' : 'Featured Only'}</option>
        </FilterSelect>
      </FiltersBar>

      <Table>
        <TableHeader>
          <div>{language === 'bg' ? 'Оферта' : 'Offer'}</div>
          <div>{language === 'bg' ? 'Партньор' : 'Partner'}</div>
          <div>{language === 'bg' ? 'Статус' : 'Status'}</div>
          <div>{language === 'bg' ? 'Отстъпка' : 'Discount'}</div>
          <div>{language === 'bg' ? 'Топ Оферта' : 'Featured'}</div>
          <div>{language === 'bg' ? 'Ред' : 'Order'}</div>
          <div>{language === 'bg' ? 'Действия' : 'Actions'}</div>
        </TableHeader>

        {filteredOffers.length === 0 ? (
          <EmptyState>
            {language === 'bg' ? 'Не са намерени оферти' : 'No offers found'}
          </EmptyState>
        ) : (
          filteredOffers.map((offer, index) => (
            <TableRow
              key={offer.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <OfferInfo>
                <OfferImage
                  src={offer.image || offer.imageUrl || 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=200&h=200&fit=crop'}
                  alt={offer.title}
                />
                <OfferDetails>
                  <OfferTitle>{language === 'bg' ? offer.titleBg || offer.title : offer.title}</OfferTitle>
                  <OfferPartner>{language === 'bg' ? offer.categoryBg || offer.category : offer.category}</OfferPartner>
                </OfferDetails>
              </OfferInfo>

              <div>
                <OfferPartner>{offer.partner?.businessName || offer.partner?.businessNameBg || 'Unknown'}</OfferPartner>
              </div>

              <div>
                <StatusBadge status={offer.status || 'DRAFT'}>
                  {offer.status || 'Draft'}
                </StatusBadge>
              </div>

              <div>
                <DiscountBadge>{offer.discount || offer.discountPercent || 0}%</DiscountBadge>
              </div>

              <div>
                <ToggleSwitch>
                  <input
                    type="checkbox"
                    checked={offer.isFeatured || false}
                    onChange={() => handleToggleFeatured(offer.id, offer.isFeatured || false)}
                  />
                  <span></span>
                </ToggleSwitch>
              </div>

              <div>
                <OrderInput
                  type="number"
                  min="1"
                  value={offer.featuredOrder || ''}
                  placeholder="-"
                  disabled={!offer.isFeatured}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value) && value > 0) {
                      handleUpdateOrder(offer.id, value);
                    }
                  }}
                />
              </div>

              <ActionButtons>
                <ActionButton variant="secondary">
                  {language === 'bg' ? 'Преглед' : 'View'}
                </ActionButton>
              </ActionButtons>
            </TableRow>
          ))
        )}
      </Table>
    </PageContainer>
  );
};

export default AdminOffersPage;
