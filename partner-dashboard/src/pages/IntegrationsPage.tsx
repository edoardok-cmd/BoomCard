import React, { useState } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/common/Card/Card';
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
    name: 'Stripe',
    category: 'Payments',
    description: 'Accept payments securely with Stripe. Support for cards, wallets, and local payment methods.',
    icon: '💳',
    features: ['Credit card processing', 'Subscription billing', 'Fraud protection'],
    connected: true,
    popular: true,
  },
  {
    id: '2',
    name: 'Google Analytics',
    category: 'Analytics',
    description: 'Track user behavior and gain insights into how customers interact with your offers.',
    icon: '📊',
    features: ['Real-time analytics', 'Custom reports', 'Event tracking'],
    connected: true,
    popular: true,
  },
  {
    id: '3',
    name: 'Mailchimp',
    category: 'Marketing',
    description: 'Send targeted email campaigns and newsletters to your customers.',
    icon: '📧',
    features: ['Email campaigns', 'Automation', 'Audience segmentation'],
    connected: false,
  },
  {
    id: '4',
    name: 'Zapier',
    category: 'Automation',
    description: 'Connect BoomCard with 5000+ apps to automate your workflows.',
    icon: '⚡',
    features: ['1000+ integrations', 'Custom workflows', 'Multi-step automation'],
    connected: false,
    popular: true,
  },
  {
    id: '5',
    name: 'Salesforce',
    category: 'CRM',
    description: 'Sync customer data with Salesforce for better relationship management.',
    icon: '☁️',
    features: ['Contact sync', 'Deal tracking', 'Custom fields'],
    connected: false,
  },
  {
    id: '6',
    name: 'Slack',
    category: 'Communication',
    description: 'Get real-time notifications about bookings and customer activity in Slack.',
    icon: '💬',
    features: ['Real-time alerts', 'Custom channels', 'Team collaboration'],
    connected: true,
  },
  {
    id: '7',
    name: 'QuickBooks',
    category: 'Accounting',
    description: 'Automatically sync transactions and invoices with QuickBooks.',
    icon: '💰',
    features: ['Invoice sync', 'Expense tracking', 'Financial reports'],
    connected: false,
  },
  {
    id: '8',
    name: 'Facebook Pixel',
    category: 'Marketing',
    description: 'Track conversions and build targeted audiences for Facebook ads.',
    icon: '📱',
    features: ['Conversion tracking', 'Retargeting', 'Custom audiences'],
    connected: false,
  },
];

const IntegrationsPage: React.FC = () => {
  const { language } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const t = {
    en: {
      title: 'Integrations',
      subtitle: 'Connect BoomCard with your favorite tools and services to streamline your workflow',
      allIntegrations: 'All Integrations',
      payments: 'Payments',
      analytics: 'Analytics',
      marketing: 'Marketing',
      automation: 'Automation',
      crm: 'CRM',
      communication: 'Communication',
      accounting: 'Accounting',
      connected: 'Connected',
      notConnected: 'Not Connected',
      connect: 'Connect',
      disconnect: 'Disconnect',
      configure: 'Configure',
      popular: 'Popular',
      learnMore: 'Learn More',
    },
    bg: {
      title: 'Интеграции',
      subtitle: 'Свържете BoomCard с любимите си инструменти и услуги за оптимизиране на работния процес',
      allIntegrations: 'Всички Интеграции',
      payments: 'Плащания',
      analytics: 'Анализи',
      marketing: 'Маркетинг',
      automation: 'Автоматизация',
      crm: 'CRM',
      communication: 'Комуникация',
      accounting: 'Счетоводство',
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
    { id: 'Payments', label: content.payments },
    { id: 'Analytics', label: content.analytics },
    { id: 'Marketing', label: content.marketing },
    { id: 'Automation', label: content.automation },
    { id: 'CRM', label: content.crm },
    { id: 'Communication', label: content.communication },
    { id: 'Accounting', label: content.accounting },
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
