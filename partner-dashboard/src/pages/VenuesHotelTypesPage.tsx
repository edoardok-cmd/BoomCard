import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';

const VenuesHotelTypesPage: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('hotels');
  const offers = data?.data || [];

  return (
    <GenericPage
      titleEn="Accommodation Types"
      titleBg="Типове Настаняване"
      subtitleEn="Find your perfect stay: Boutique hotels, Business accommodations, Resort properties, and Family-friendly venues"
      subtitleBg="Намерете перфектното си място: Бутик хотели, Бизнес настаняване, Курортни имоти и Семейни места"
      offers={offers}
      isLoading={isLoading}
    />
  );
};

export default VenuesHotelTypesPage;
