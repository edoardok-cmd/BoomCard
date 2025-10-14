import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/common/Button/Button';
import Badge from '../components/common/Badge/Badge';
import { Check, X, Settings, ExternalLink, Loader } from 'lucide-react';
import {
  useIntegrationsOverview,
  useConnectIntegration,
  useDisconnectIntegration,
  useTestIntegration,
  useSyncIntegration,
} from '../hooks/useIntegrations';
import type { Integration as ApiIntegration, PartnerIntegration } from '../services/integrations.service';

const PageContainer = styled.div`
  min-height: 100vh;
  background: #f9fafb;
`;

const Hero = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);

  /* Vibrant mode - explosive gradient hero */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 25%, #ab2567 50%, #ff006e 75%, #ff4500 100%);
    background-size: 200% 200%;
    animation: heroGradientFlow 10s ease infinite;
    box-shadow:
      inset 0 -8px 40px -10px rgba(255, 69, 0, 0.3),
      inset 0 -4px 30px -10px rgba(255, 0, 110, 0.2);
  }

  @keyframes heroGradientFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
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

// Map API integration to display format with icon
const getIntegrationIcon = (name: string): string => {
  const iconMap: Record<string, string> = {
    'Barsy': '🖥️',
    'Poster POS': '💻',
    'iiko': '🍽️',
    'R-Keeper': '📊',
    'ePay.bg': '💳',
    'Borica': '🏦',
    'myPOS': '📱',
    'SumUp': '💰',
    'Stripe Terminal': '⚡',
    'Booking Systems': '📅',
  };
  return iconMap[name] || '🔌';
};

// Helper function to check if an integration is connected
const isIntegrationConnected = (
  integration: ApiIntegration,
  connectedIntegrations: PartnerIntegration[]
): boolean => {
  return connectedIntegrations.some(
    (pi) => pi.integrationId === integration.id && pi.status === 'active'
  );
};

const IntegrationsPage: React.FC = () => {
  const { language } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedIntegration, setSelectedIntegration] = useState<ApiIntegration | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'testing'>('disconnected');
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Fetch integrations data from API
  const { available, connected, isLoading } = useIntegrationsOverview(
    selectedCategory === 'all' ? undefined : selectedCategory,
    isAuthenticated
  );

  // Mutations
  const connectMutation = useConnectIntegration();
  const disconnectMutation = useDisconnectIntegration();
  const testMutation = useTestIntegration();

  // Handle connection with real API
  const handleConnect = async () => {
    if (!selectedIntegration) return;

    setConnectionStatus('testing');

    try {
      // Connect the integration
      await connectMutation.mutateAsync({
        integrationId: selectedIntegration.id,
        credentials: formData,
      });

      setConnectionStatus('connected');

      // Close modal after success
      setTimeout(() => {
        setIsModalOpen(false);
        setSelectedIntegration(null);
      }, 1500);
    } catch (error) {
      setConnectionStatus('disconnected');
    }
  };

  // Handle disconnect
  const handleDisconnect = async (partnerIntegrationId: string) => {
    if (!window.confirm('Are you sure you want to disconnect this integration?')) {
      return;
    }

    try {
      await disconnectMutation.mutateAsync(partnerIntegrationId);
      setIsModalOpen(false);
      setSelectedIntegration(null);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  // Handle test connection
  const handleTest = async (partnerIntegrationId: string) => {
    try {
      await testMutation.mutateAsync(partnerIntegrationId);
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const openIntegrationModal = (integration: ApiIntegration) => {
    setSelectedIntegration(integration);
    const isConnected = isIntegrationConnected(integration, connected);
    setConnectionStatus(isConnected ? 'connected' : 'disconnected');
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
      testingConnection: 'Testing connection...',
      successfullyConnected: 'Successfully connected!',
      select: 'Select...',
      webhookUrl: 'WEBHOOK URL',
      apiKeyHelp: 'Find your API key in your system settings',
      webhookHelp: 'Copy this URL to your system settings for automatic synchronization',
      needHelp: 'Need help setting this up?',
      needHelpDesc: 'Contact our team to activate this integration. We will help you with the setup.',
      manageIntegration: 'Manage Integration',
      configureConnection: 'Configure Connection',
      testConnection: 'Test Connection',
      cancel: 'Cancel',
      connect: 'Connect',
      connecting: 'Connecting...',
      connected: 'Connected',
      disconnect: 'Disconnect',
      reconnect: 'Reconnect',
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
      testingConnection: 'Тестване на връзката...',
      successfullyConnected: 'Успешно свързан!',
      select: 'Изберете...',
      webhookUrl: 'WEBHOOK URL',
      apiKeyHelp: 'Намерете вашия API ключ в настройките на системата',
      webhookHelp: 'Копирайте този URL в настройките на вашата система за автоматична синхронизация',
      needHelp: 'Нуждаете се от помощ за настройка?',
      needHelpDesc: 'Свържете се с нашия екип, за да активирате тази интеграция. Ще ви помогнем с настройката.',
      manageIntegration: 'Управление на интеграцията',
      configureConnection: 'Конфигуриране на връзката',
      testConnection: 'Тествай връзката',
      cancel: 'Отказ',
      connect: 'Свържи',
      connecting: 'Свързване...',
      connected: 'Свързан',
      disconnect: 'Прекъсни връзката',
      reconnect: 'Свържи отново',
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

  // Filter integrations based on selected category
  const filteredIntegrations = selectedCategory === 'all' ? available : available;

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

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <Loader size={48} className="animate-spin" style={{ margin: '0 auto', color: '#000' }} />
              <p style={{ marginTop: '1rem', color: '#6b7280' }}>Loading integrations...</p>
            </div>
          ) : (
            <IntegrationsGrid>
              {filteredIntegrations.map((integration, index) => {
                const isConnected = isIntegrationConnected(integration, connected);
                const icon = getIntegrationIcon(integration.name);

                return (
                  <IntegrationCard
                    key={integration.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                  >
                    <IntegrationHeader>
                      <IntegrationLogo>{icon}</IntegrationLogo>
                      {integration.isPopular && (
                        <Badge variant="warning">{content.popular}</Badge>
                      )}
                    </IntegrationHeader>

                    <IntegrationTitle>
                      {language === 'bg' ? integration.nameBg : integration.nameEn}
                    </IntegrationTitle>
                    <IntegrationCategory>
                      {language === 'bg' ? integration.categoryBg : integration.categoryEn}
                    </IntegrationCategory>
                    <IntegrationDescription>
                      {language === 'bg' ? integration.descriptionBg : integration.descriptionEn}
                    </IntegrationDescription>

                    <FeaturesList>
                      {(language === 'bg' ? integration.featuresBg : integration.featuresEn).slice(0, 3).map((feature, idx) => (
                        <FeatureItem key={idx}>{feature}</FeatureItem>
                      ))}
                    </FeaturesList>

                    <IntegrationFooter>
                      <IntegrationStatus $connected={isConnected}>
                        <StatusDot $connected={isConnected} />
                        {integration.status === 'available'
                          ? (isConnected ? content.connected : content.supported)
                          : integration.status === 'beta'
                          ? 'Beta'
                          : content.comingSoon}
                      </IntegrationStatus>

                      <Button
                        variant={integration.status === 'available' ? 'primary' : 'secondary'}
                        size="small"
                        onClick={() => openIntegrationModal(integration)}
                        disabled={integration.status === 'coming_soon'}
                      >
                        {integration.status === 'available' ? content.getStarted : content.contactUs}
                      </Button>
                    </IntegrationFooter>
                  </IntegrationCard>
                );
              })}
            </IntegrationsGrid>
          )}
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
                    {getIntegrationIcon(selectedIntegration.name)}{' '}
                    {language === 'bg' ? selectedIntegration.nameBg : selectedIntegration.nameEn}
                  </ModalTitle>
                  <ModalSubtitle>
                    {isIntegrationConnected(selectedIntegration, connected)
                      ? content.manageIntegration
                      : content.configureConnection}
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
                        {content.testingConnection}
                      </>
                    )}
                    {connectionStatus === 'connected' && (
                      <>
                        <Check />
                        {content.successfullyConnected}
                      </>
                    )}
                  </ConnectionStatus>
                )}

                {selectedIntegration.requiresCredentials && selectedIntegration.credentialsFields && (
                  <form onSubmit={(e) => { e.preventDefault(); handleConnect(); }}>
                    {selectedIntegration.credentialsFields.map((field) => (
                      <FormGroup key={field.name}>
                        <Label htmlFor={field.name}>
                          {language === 'bg' ? field.labelBg : field.labelEn}{' '}
                          {field.required && '*'}
                        </Label>
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
                        {field.name === 'apiKey' && (
                          <HelpText>
                            {content.apiKeyHelp}
                          </HelpText>
                        )}
                      </FormGroup>
                    ))}
                  </form>
                )}

                {selectedIntegration.documentationUrl && (
                  <WebhookBox>
                    <WebhookLabel>
                      Documentation
                    </WebhookLabel>
                    <a
                      href={selectedIntegration.documentationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#000', textDecoration: 'underline' }}
                    >
                      View integration documentation <ExternalLink size={14} style={{ display: 'inline' }} />
                    </a>
                  </WebhookBox>
                )}

                {!selectedIntegration.requiresCredentials && (
                  <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                    <p style={{ fontSize: '0.9375rem', color: '#6b7280', lineHeight: 1.6 }}>
                      {content.needHelpDesc}
                    </p>
                    <div style={{ marginTop: '1.5rem' }}>
                      <Button
                        variant="primary"
                        size="large"
                        onClick={() => window.open('mailto:support@boomcard.bg', '_blank')}
                      >
                        {content.contactUs}
                      </Button>
                    </div>
                  </div>
                )}
              </ModalBody>

              {selectedIntegration.requiresCredentials && (
                <ModalFooter>
                  <Button variant="ghost" size="medium" onClick={closeModal}>
                    {content.cancel}
                  </Button>
                  <Button
                    variant="primary"
                    size="medium"
                    onClick={handleConnect}
                    disabled={connectMutation.isPending || connectionStatus === 'connected'}
                  >
                    {connectMutation.isPending
                      ? content.connecting
                      : connectionStatus === 'connected'
                      ? content.connected
                      : content.connect}
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
