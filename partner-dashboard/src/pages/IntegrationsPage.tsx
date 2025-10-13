import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/common/Button/Button';
import Badge from '../components/common/Badge/Badge';
import { Check, X, Settings, ExternalLink, Loader } from 'lucide-react';

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

const ModalOverlay = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
`;

const Modal = styled(motion.div)`
  background: white;
  border-radius: 1.5rem;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
`;

const ModalHeader = styled.div`
  padding: 2rem;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
`;

const ModalTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const ModalSubtitle = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
`;

const CloseButton = styled.button`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  border: none;
  background: #f3f4f6;
  color: #6b7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: #e5e7eb;
    color: #111827;
  }
`;

const ModalBody = styled.div`
  padding: 2rem;
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #000000;
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  background: white;
  cursor: pointer;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #000000;
  }
`;

const HelpText = styled.p`
  font-size: 0.8125rem;
  color: #6b7280;
  margin-top: 0.5rem;
`;

const ModalFooter = styled.div`
  padding: 1.5rem 2rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
`;

const ConnectionStatus = styled.div<{ $status: 'connected' | 'disconnected' | 'testing' }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  background: ${props => {
    if (props.$status === 'connected') return '#ecfdf5';
    if (props.$status === 'testing') return '#fef3c7';
    return '#fef2f2';
  }};
  color: ${props => {
    if (props.$status === 'connected') return '#047857';
    if (props.$status === 'testing') return '#b45309';
    return '#b91c1c';
  }};
  margin-bottom: 1.5rem;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const WebhookBox = styled.div`
  padding: 1rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  margin-top: 1.5rem;
`;

const WebhookLabel = styled.div`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
`;

const WebhookUrl = styled.code`
  display: block;
  padding: 0.75rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  color: #111827;
  word-break: break-all;
  font-family: 'Monaco', 'Courier New', monospace;
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
  requiresConfig?: boolean;
  configFields?: ConfigField[];
  webhookUrl?: string;
  lastSync?: Date;
}

interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'select';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

const mockIntegrations: Integration[] = [
  {
    id: '1',
    name: 'Barsy',
    category: 'POS Systems',
    description: 'If you use Barsy system for your cafe, bar, club, or restaurant, BoomCard integrates via Barsy API to automatically sync transaction data and track customer savings.',
    icon: '🖥️',
    features: ['HTTP API integration (JSON/XML)', 'Automatic data synchronization', 'Works with cafes, bars, clubs & restaurants'],
    connected: true,
    popular: true,
    requiresConfig: true,
    configFields: [
      { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Enter your Barsy API key' },
      { name: 'merchantId', label: 'Merchant ID', type: 'text', required: true, placeholder: 'Your merchant ID' },
      { name: 'environment', label: 'Environment', type: 'select', required: true, options: [
        { value: 'production', label: 'Production' },
        { value: 'sandbox', label: 'Sandbox (Testing)' }
      ]},
    ],
    webhookUrl: 'https://api.boomcard.bg/webhooks/barsy/YOUR_PARTNER_ID',
  },
  {
    id: '2',
    name: 'Poster POS',
    category: 'POS Systems',
    description: 'BoomCard seamlessly integrates with Poster POS to track customer purchases and calculate their savings automatically.',
    icon: '💻',
    features: ['Direct API integration', 'Instant payment recognition', 'Customer savings reports'],
    connected: true,
    popular: true,
    requiresConfig: true,
    configFields: [
      { name: 'apiKey', label: 'API Token', type: 'password', required: true, placeholder: 'Your Poster API token' },
      { name: 'accountName', label: 'Account Name', type: 'text', required: true, placeholder: 'yourname.joinposter.com' },
    ],
    webhookUrl: 'https://api.boomcard.bg/webhooks/poster/YOUR_PARTNER_ID',
  },
  {
    id: '3',
    name: 'iiko',
    category: 'POS Systems',
    description: 'Using iiko restaurant management? BoomCard can connect to track all BoomCard transactions at your restaurant.',
    icon: '🍽️',
    features: ['Full menu integration', 'Order-level tracking', 'Automated discount calculations'],
    connected: false,
  },
  {
    id: '4',
    name: 'R-Keeper',
    category: 'POS Systems',
    description: 'BoomCard works with R-Keeper to automatically record transactions and monitor customer savings across all your locations.',
    icon: '📊',
    features: ['Multi-location support', 'Transaction monitoring', 'Savings analytics dashboard'],
    connected: false,
  },
  {
    id: '5',
    name: 'ePay.bg',
    category: 'Payment Gateways',
    description: 'If you process online orders through ePay.bg, BoomCard can track digital transactions and apply discounts automatically.',
    icon: '💳',
    features: ['Online payment tracking', 'Secure API connection', 'Digital receipt matching'],
    connected: true,
    popular: true,
  },
  {
    id: '6',
    name: 'Borica',
    category: 'Payment Gateways',
    description: 'BoomCard integrates with Borica payment gateway to identify BoomCard users and track their purchases in real-time.',
    icon: '🏦',
    features: ['Bank-level security', 'Card recognition', 'Instant transaction sync'],
    connected: true,
  },
  {
    id: '7',
    name: 'myPOS',
    category: 'Payment Terminals',
    description: 'Using myPOS terminals? BoomCard can connect directly to recognize cardholders and fetch transaction data automatically.',
    icon: '📱',
    features: ['Terminal-level integration', 'QR & NFC support', 'No additional hardware needed'],
    connected: false,
  },
  {
    id: '8',
    name: 'SumUp',
    category: 'Payment Terminals',
    description: 'BoomCard works with SumUp card readers to automatically log transactions when BoomCard holders make purchases.',
    icon: '💰',
    features: ['Mobile terminal support', 'Automatic card detection', 'Cloud-based sync'],
    connected: false,
  },
  {
    id: '9',
    name: 'Stripe Terminal',
    category: 'Payment Terminals',
    description: 'If you use Stripe Terminal, BoomCard can integrate to track payments and calculate customer savings automatically.',
    icon: '⚡',
    features: ['Advanced API capabilities', 'Smart reader compatibility', 'Developer-friendly setup'],
    connected: false,
  },
  {
    id: '10',
    name: 'Booking Systems API',
    category: 'Reservation Systems',
    description: 'BoomCard connects to reservation platforms to link table bookings with payments, tracking the full customer journey.',
    icon: '📅',
    features: ['Reservation-to-payment linking', 'Customer identification', 'Visit frequency tracking'],
    connected: true,
  },
];

const IntegrationsPage: React.FC = () => {
  const { language } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'testing'>('disconnected');
  const [isConnecting, setIsConnecting] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Simulate connection testing
  const handleConnect = async () => {
    if (!selectedIntegration) return;

    setIsConnecting(true);
    setConnectionStatus('testing');

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));

    setConnectionStatus('connected');
    setIsConnecting(false);

    // Update integration status (in real app, this would save to backend)
    setTimeout(() => {
      setIsModalOpen(false);
      setSelectedIntegration(null);
    }, 1500);
  };

  const openIntegrationModal = (integration: Integration) => {
    setSelectedIntegration(integration);
    setConnectionStatus(integration.connected ? 'connected' : 'disconnected');
    setIsModalOpen(true);
    setFormData({});
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedIntegration(null), 300);
  };

  const t = {
    en: {
      title: 'Supported Payment Systems',
      subtitle: 'Check if your payment system is compatible with BoomCard. We automatically track transactions and calculate customer savings.',
      allIntegrations: 'All Systems',
      posSystems: 'POS Systems',
      paymentGateways: 'Payment Gateways',
      paymentTerminals: 'Payment Terminals',
      reservationSystems: 'Reservation Systems',
      supported: 'Supported',
      comingSoon: 'Coming Soon',
      getStarted: 'Get Started',
      contactUs: 'Contact Us',
      popular: 'Most Used',
      learnMore: 'Learn More',
      integrationsCount: 'payment systems supported',
    },
    bg: {
      title: 'Поддържани Платежни Системи',
      subtitle: 'Проверете дали вашата платежна система е съвместима с BoomCard. Ние автоматично проследяваме транзакциите и изчисляваме спестяванията на клиентите.',
      allIntegrations: 'Всички Системи',
      posSystems: 'POS Системи',
      paymentGateways: 'Платежни Портали',
      paymentTerminals: 'Платежни Терминали',
      reservationSystems: 'Резервационни Системи',
      supported: 'Поддържано',
      comingSoon: 'Очаквайте Скоро',
      getStarted: 'Започнете',
      contactUs: 'Свържете се с нас',
      popular: 'Най-Използвани',
      learnMore: 'Научи Повече',
      integrationsCount: 'поддържани платежни системи',
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
            {filteredIntegrations.length} {content.integrationsCount}
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
                    {integration.connected ? content.supported : content.comingSoon}
                  </IntegrationStatus>

                  <Button
                    variant={integration.connected ? 'primary' : 'secondary'}
                    size="small"
                    onClick={() => openIntegrationModal(integration)}
                  >
                    {integration.connected ? content.getStarted : content.contactUs}
                  </Button>
                </IntegrationFooter>
              </IntegrationCard>
            ))}
          </IntegrationsGrid>
        </Container>
      </ContentSection>

      {/* Integration Configuration Modal */}
      <AnimatePresence>
        {isModalOpen && selectedIntegration && (
          <ModalOverlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
          >
            <Modal
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <ModalHeader>
                <div>
                  <ModalTitle>
                    {selectedIntegration.icon} {selectedIntegration.name}
                  </ModalTitle>
                  <ModalSubtitle>
                    {selectedIntegration.connected
                      ? language === 'bg'
                        ? 'Управление на интеграцията'
                        : 'Manage Integration'
                      : language === 'bg'
                      ? 'Конфигуриране на връзката'
                      : 'Configure Connection'}
                  </ModalSubtitle>
                </div>
                <CloseButton onClick={closeModal}>
                  <X size={20} />
                </CloseButton>
              </ModalHeader>

              <ModalBody>
                {connectionStatus !== 'disconnected' && (
                  <ConnectionStatus $status={connectionStatus}>
                    {connectionStatus === 'testing' && (
                      <>
                        <Loader className="animate-spin" />
                        {language === 'bg' ? 'Тестване на връзката...' : 'Testing connection...'}
                      </>
                    )}
                    {connectionStatus === 'connected' && (
                      <>
                        <Check />
                        {language === 'bg' ? 'Успешно свързан!' : 'Successfully connected!'}
                      </>
                    )}
                  </ConnectionStatus>
                )}

                {selectedIntegration.configFields && (
                  <form onSubmit={(e) => { e.preventDefault(); handleConnect(); }}>
                    {selectedIntegration.configFields.map((field) => (
                      <FormGroup key={field.name}>
                        <Label htmlFor={field.name}>
                          {field.label} {field.required && '*'}
                        </Label>
                        {field.type === 'select' ? (
                          <Select
                            id={field.name}
                            value={formData[field.name] || ''}
                            onChange={(e) =>
                              setFormData({ ...formData, [field.name]: e.target.value })
                            }
                            required={field.required}
                          >
                            <option value="">
                              {language === 'bg' ? 'Изберете...' : 'Select...'}
                            </option>
                            {field.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Input
                            id={field.name}
                            type={field.type}
                            placeholder={field.placeholder}
                            value={formData[field.name] || ''}
                            onChange={(e) =>
                              setFormData({ ...formData, [field.name]: e.target.value })
                            }
                            required={field.required}
                          />
                        )}
                        {field.name === 'apiKey' && (
                          <HelpText>
                            {language === 'bg'
                              ? 'Намерете вашия API ключ в настройките на системата'
                              : 'Find your API key in your system settings'}
                          </HelpText>
                        )}
                      </FormGroup>
                    ))}
                  </form>
                )}

                {selectedIntegration.webhookUrl && (
                  <WebhookBox>
                    <WebhookLabel>
                      {language === 'bg' ? 'WEBHOOK URL' : 'WEBHOOK URL'}
                    </WebhookLabel>
                    <WebhookUrl>{selectedIntegration.webhookUrl}</WebhookUrl>
                    <HelpText style={{ marginTop: '0.75rem' }}>
                      {language === 'bg'
                        ? 'Копирайте този URL в настройките на вашата система за автоматична синхронизация'
                        : 'Copy this URL to your system settings for automatic synchronization'}
                    </HelpText>
                  </WebhookBox>
                )}

                {!selectedIntegration.configFields && (
                  <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                    <p style={{ fontSize: '0.9375rem', color: '#6b7280', lineHeight: 1.6 }}>
                      {language === 'bg'
                        ? 'Свържете се с нашия екип за активиране на тази интеграция. Ще ви помогнем със настройката.'
                        : 'Contact our team to activate this integration. We will help you with the setup.'}
                    </p>
                    <Button
                      variant="primary"
                      size="large"
                      style={{ marginTop: '1.5rem' }}
                      onClick={() => window.open('mailto:support@boomcard.bg', '_blank')}
                    >
                      {language === 'bg' ? 'Свържете се с нас' : 'Contact Us'}
                    </Button>
                  </div>
                )}
              </ModalBody>

              {selectedIntegration.configFields && (
                <ModalFooter>
                  <Button variant="ghost" size="medium" onClick={closeModal}>
                    {language === 'bg' ? 'Отказ' : 'Cancel'}
                  </Button>
                  <Button
                    variant="primary"
                    size="medium"
                    onClick={handleConnect}
                    disabled={isConnecting || connectionStatus === 'connected'}
                  >
                    {isConnecting
                      ? language === 'bg'
                        ? 'Свързване...'
                        : 'Connecting...'
                      : connectionStatus === 'connected'
                      ? language === 'bg'
                        ? 'Свързан'
                        : 'Connected'
                      : language === 'bg'
                      ? 'Свържи'
                      : 'Connect'}
                  </Button>
                </ModalFooter>
              )}
            </Modal>
          </ModalOverlay>
        )}
      </AnimatePresence>
    </PageContainer>
  );
};

export default IntegrationsPage;
