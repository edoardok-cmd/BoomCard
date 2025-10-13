import React, { useState } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/common/Button/Button';
import Badge from '../components/common/Badge/Badge';

const PageContainer = styled.div`
  min-height: 100vh;
  background: #f9fafb;
`;

const Hero = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);
  color: white;
  padding: 5rem 0 4rem;
  position: relative;

  @media (max-width: 768px) {
    padding: 3rem 0 2rem;
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
`;

const HeroContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 3.5rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  line-height: 1.1;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.25rem;
  opacity: 0.9;
  margin-bottom: 2.5rem;
  line-height: 1.6;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const ContentSection = styled.div`
  padding: 4rem 0;
`;

const SectionTitle = styled.h2`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 1rem;

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const SectionDescription = styled.p`
  font-size: 1.125rem;
  color: #6b7280;
  margin-bottom: 3rem;
  max-width: 800px;
`;

const IntegrationsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 2rem;
  margin-bottom: 4rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const IntegrationCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s, box-shadow 0.3s;
  cursor: pointer;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
  }
`;

const IntegrationHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
`;

const IntegrationLogo = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
`;

const IntegrationTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const IntegrationCategory = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1rem;
`;

const IntegrationDescription = styled.p`
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.6;
  margin-bottom: 1.5rem;
`;

const IntegrationFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;
`;

const IntegrationStatus = styled.div<{ $connected: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => props.$connected ? '#10b981' : '#6b7280'};
`;

const StatusDot = styled.div<{ $connected: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.$connected ? '#10b981' : '#d1d5db'};
`;

const FeaturesList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 1.5rem 0;
`;

const FeatureItem = styled.li`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.75rem;

  &::before {
    content: '✓';
    color: #10b981;
    font-weight: 700;
  }
`;

const CategoryFilter = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 3rem;
  justify-content: center;
`;

const FilterButton = styled.button<{ $active: boolean }>`
  padding: 0.75rem 1.5rem;
  border: 2px solid ${props => props.$active ? '#000000' : '#e5e7eb'};
  background: ${props => props.$active ? '#000000' : 'white'};
  color: ${props => props.$active ? 'white' : '#6b7280'};
  border-radius: 2rem;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #000000;
  }
`;

interface Integration {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  features: string[];
  connected: boolean;
  popular?: boolean;
}

const mockIntegrations: Integration[] = [
  {
    id: '1',
    name: 'Barsi',
    category: 'POS Systems',
    description: 'Integrate with Barsi POS to automatically track purchases and apply BoomCard discounts in real-time.',
    icon: '🖥️',
    features: ['Real-time transaction tracking', 'Automatic discount application', 'Purchase history sync'],
    connected: true,
    popular: true,
  },
  {
    id: '2',
    name: 'Poster POS',
    category: 'POS Systems',
    description: 'Connect with Poster POS for seamless payment processing and automatic savings calculation.',
    icon: '💻',
    features: ['Payment integration', 'Savings tracking', 'Customer identification'],
    connected: true,
    popular: true,
  },
  {
    id: '3',
    name: 'iiko',
    category: 'POS Systems',
    description: 'Integration with iiko restaurant management system for automatic discount tracking and reporting.',
    icon: '🍽️',
    features: ['Restaurant POS integration', 'Order tracking', 'Discount analytics'],
    connected: false,
  },
  {
    id: '4',
    name: 'R-Keeper',
    category: 'POS Systems',
    description: 'Connect with R-Keeper to track all BoomCard transactions and calculate savings automatically.',
    icon: '📊',
    features: ['Transaction monitoring', 'Savings calculation', 'Multi-location support'],
    connected: false,
  },
  {
    id: '5',
    name: 'ePay.bg',
    category: 'Payment Gateways',
    description: 'Integration with ePay payment gateway for secure online transactions and automatic savings tracking.',
    icon: '💳',
    features: ['Online payments', 'Transaction security', 'Instant savings reporting'],
    connected: true,
    popular: true,
  },
  {
    id: '6',
    name: 'Borica',
    category: 'Payment Gateways',
    description: 'Connect with Borica payment system for card processing and automated discount application.',
    icon: '🏦',
    features: ['Card payment processing', 'Bank integration', 'Real-time validation'],
    connected: true,
  },
  {
    id: '7',
    name: 'myPOS',
    category: 'Payment Terminals',
    description: 'Integrate with myPOS payment terminals to recognize BoomCard users and apply discounts at checkout.',
    icon: '📱',
    features: ['Terminal integration', 'QR code scanning', 'Instant discount application'],
    connected: false,
  },
  {
    id: '8',
    name: 'SumUp',
    category: 'Payment Terminals',
    description: 'Connect SumUp payment terminals for BoomCard recognition and automatic savings tracking.',
    icon: '💰',
    features: ['Mobile payments', 'Card reader integration', 'Transaction logging'],
    connected: false,
  },
  {
    id: '9',
    name: 'Stripe Terminal',
    category: 'Payment Terminals',
    description: 'Integrate Stripe Terminal for advanced payment processing with BoomCard discount automation.',
    icon: '⚡',
    features: ['Smart card readers', 'API integration', 'Real-time discount processing'],
    connected: false,
  },
  {
    id: '10',
    name: 'Booking Systems API',
    category: 'Reservation Systems',
    description: 'Connect with restaurant and venue booking systems to track reservations and apply loyalty discounts.',
    icon: '📅',
    features: ['Reservation tracking', 'Loyalty point integration', 'Automated rewards'],
    connected: true,
  },
];

const IntegrationsPage: React.FC = () => {
  const { language } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const t = {
    en: {
      title: 'Payment System Integrations',
      subtitle: 'Connect BoomCard with restaurant and venue payment systems to automatically track savings',
      allIntegrations: 'All Integrations',
      posSystems: 'POS Systems',
      paymentGateways: 'Payment Gateways',
      paymentTerminals: 'Payment Terminals',
      reservationSystems: 'Reservation Systems',
      connected: 'Connected',
      notConnected: 'Not Connected',
      connect: 'Connect',
      disconnect: 'Disconnect',
      configure: 'Configure',
      popular: 'Popular',
      learnMore: 'Learn More',
    },
    bg: {
      title: 'Интеграции с Платежни Системи',
      subtitle: 'Свържете BoomCard с платежните системи на ресторанти и заведения за автоматично проследяване на спестяванията',
      allIntegrations: 'Всички Интеграции',
      posSystems: 'POS Системи',
      paymentGateways: 'Платежни Портали',
      paymentTerminals: 'Платежни Терминали',
      reservationSystems: 'Резервационни Системи',
      connected: 'Свързано',
      notConnected: 'Не е свързано',
      connect: 'Свържи',
      disconnect: 'Прекъсни',
      configure: 'Настрой',
      popular: 'Популярни',
      learnMore: 'Научи Повече',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  const categories = [
    { id: 'all', label: content.allIntegrations },
    { id: 'POS Systems', label: content.posSystems },
    { id: 'Payment Gateways', label: content.paymentGateways },
    { id: 'Payment Terminals', label: content.paymentTerminals },
    { id: 'Reservation Systems', label: content.reservationSystems },
  ];

  const filteredIntegrations = selectedCategory === 'all'
    ? mockIntegrations
    : mockIntegrations.filter(int => int.category === selectedCategory);

  return (
    <PageContainer>
      <Hero>
        <Container>
          <HeroContent>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Title>{content.title}</Title>
              <Subtitle>{content.subtitle}</Subtitle>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <ContentSection>
        <Container>
          <CategoryFilter>
            {categories.map((category) => (
              <FilterButton
                key={category.id}
                $active={selectedCategory === category.id}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.label}
              </FilterButton>
            ))}
          </CategoryFilter>

          <SectionTitle>
            {selectedCategory === 'all' ? content.allIntegrations : categories.find(c => c.id === selectedCategory)?.label}
          </SectionTitle>
          <SectionDescription>
            {filteredIntegrations.length} integrations available
          </SectionDescription>

          <IntegrationsGrid>
            {filteredIntegrations.map((integration, index) => (
              <IntegrationCard
                key={integration.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <IntegrationHeader>
                  <IntegrationLogo>{integration.icon}</IntegrationLogo>
                  {integration.popular && (
                    <Badge variant="warning">{content.popular}</Badge>
                  )}
                </IntegrationHeader>

                <IntegrationTitle>{integration.name}</IntegrationTitle>
                <IntegrationCategory>{integration.category}</IntegrationCategory>
                <IntegrationDescription>
                  {integration.description}
                </IntegrationDescription>

                <FeaturesList>
                  {integration.features.map((feature, idx) => (
                    <FeatureItem key={idx}>{feature}</FeatureItem>
                  ))}
                </FeaturesList>

                <IntegrationFooter>
                  <IntegrationStatus $connected={integration.connected}>
                    <StatusDot $connected={integration.connected} />
                    {integration.connected ? content.connected : content.notConnected}
                  </IntegrationStatus>

                  <Button
                    variant={integration.connected ? 'secondary' : 'primary'}
                    size="small"
                  >
                    {integration.connected ? content.configure : content.connect}
                  </Button>
                </IntegrationFooter>
              </IntegrationCard>
            ))}
          </IntegrationsGrid>
        </Container>
      </ContentSection>
    </PageContainer>
  );
};

export default IntegrationsPage;
