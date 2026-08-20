import React, { useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/common/Button/Button';
import Card from '../components/common/Card/Card';
import { useEntities } from '../hooks/useOffers';
import { Entity } from '../types/entity.types';

const PageContainer = styled.div`
  min-height: 100vh;
  background: white;

  [data-theme="dark"] & {
    background: #0a0a0a;
  }
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
  padding: 6rem 0 4rem;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 50%;
    height: 100%;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 100%);
  }

  @media (max-width: 768px) {
    padding: 4rem 0 3rem;
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
  position: relative;
  z-index: 1;
`;

const HeroContent = styled.div`
  max-width: 700px;
  margin: 0 auto;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 4rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  line-height: 1.1;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.5rem;
  opacity: 0.9;
  line-height: 1.6;
  margin-bottom: 2.5rem;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const HeroButtons = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
`;

const MicroTrust = styled.p`
  font-size: 0.9rem;
  opacity: 0.7;
  margin: 0;
`;

const Section = styled.section`
  padding: 5rem 0;

  @media (max-width: 768px) {
    padding: 3rem 0;
  }
`;

const SectionTitle = styled.h2`
  font-size: 3rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 1rem;
  text-align: center;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const SectionSubtitle = styled.p`
  font-size: 1.25rem;
  color: #6b7280;
  text-align: center;
  max-width: 800px;
  margin: 0 auto 4rem;
  line-height: 1.7;

  [data-theme="dark"] & {
    color: #9ca3af;
  }

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const BenefitsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;
  margin-bottom: 3rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const BenefitCard = styled(motion.div)`
  text-align: center;
  display: flex;
  flex-direction: column;

  > div {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
`;

const BenefitImageContainer = styled.div<{ $imageUrl?: string }>`
  width: 100%;
  height: 200px;
  background: ${props => props.$imageUrl ? `url(${props.$imageUrl})` : '#f3f4f6'};
  background-size: cover;
  background-position: center;
  overflow: hidden;
  transition: all 300ms;
  border-radius: 0.75rem 0.75rem 0 0;

  ${BenefitCard}:hover & {
    transform: scale(1.05);
  }
`;

const BenefitContent = styled.div`
  padding: 2rem;
  flex: 1;
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const BenefitTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.75rem;
  min-height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const BenefitText = styled.p`
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.6;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const StatsSection = styled.div`
  background: #f9fafb;
  padding: 4rem 0;
  text-align: center;

  [data-theme="dark"] & {
    background: #111827;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 3rem;
  max-width: 1000px;
  margin: 0 auto;
`;

const StatCard = styled.div``;

const StatNumber = styled.div`
  font-size: 2.75rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
  line-height: 1;
  white-space: nowrap;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  @media (max-width: 768px) {
    font-size: 2rem;
  }

  @media (max-width: 480px) {
    font-size: 1.75rem;
  }
`;

const StatLabel = styled.div`
  font-size: 1rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const ProcessSection = styled(Section)`
  background: white;

  [data-theme="dark"] & {
    background: #0a0a0a;
  }
`;

const ProcessSteps = styled.div`
  max-width: 900px;
  margin: 0 auto;
`;

const ProcessStep = styled(motion.div)`
  display: flex;
  gap: 2rem;
  margin-bottom: 3rem;
  align-items: start;

  &:last-child {
    margin-bottom: 0;
  }

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
  }
`;

const StepNumber = styled.div`
  flex-shrink: 0;
  width: 3.5rem;
  height: 3.5rem;
  background: #000000;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;

  [data-theme="dark"] & {
    background: #f9fafb;
    color: #000000;
  }
`;

const StepContent = styled.div`
  flex: 1;
`;

const StepTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const StepText = styled.p`
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.7;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const CTASection = styled.div`
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
  padding: 5rem 0;
  text-align: center;

  @media (max-width: 768px) {
    padding: 3rem 0;
  }
`;

const CTATitle = styled.h2`
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  text-align: center;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const CTAText = styled.p`
  font-size: 1.25rem;
  opacity: 0.9;
  margin-bottom: 2.5rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.7;
  text-align: center;

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const FormSection = styled.div`
  max-width: 900px;
  margin: 0 auto;
  background: white;
  padding: 3rem;
  border-radius: 1rem;

  [data-theme="dark"] & {
    background: #1f2937;
  }

  @media (max-width: 768px) {
    padding: 2rem;
  }
`;

const FormTitle = styled.h3`
  font-size: 1.75rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1.5rem;
  text-align: center;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const LocationsSection = styled.div`
  padding: 4rem 0;
  background: #f9fafb;
  scroll-margin-top: 80px;

  [data-theme="dark"] & {
    background: #0a0a0a;
  }
`;


const LocationsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const LocationCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s, box-shadow 0.3s;
  cursor: pointer;

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);

    [data-theme="dark"] & {
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.5);
    }
  }
`;

const LocationImage = styled.div<{ $bgImage?: string }>`
  height: 200px;
  background-image: ${p => p.$bgImage ? `url(${p.$bgImage})` : 'none'};
  background-size: cover;
  background-position: center;
  position: relative;
`;

const LocationContent = styled.div`
  padding: 1.5rem;
`;

const LocationName = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const LocationAddress = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const GradientButton = styled.button`
  width: 100%;
  padding: 1.125rem 2rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: #1a1a1a;
  border: none;
  border-radius: 0.75rem;
  cursor: pointer;
  background: linear-gradient(135deg, #d4a843 0%, #c49b38 50%, #b8922f 100%);
  transition: all 300ms;
  box-shadow: 0 4px 20px rgba(212, 168, 67, 0.4);

  [data-theme="color"] & {
    background: linear-gradient(135deg, #e6b84d 0%, #d4a843 50%, #c49b38 100%);
    box-shadow: 0 6px 30px rgba(212, 168, 67, 0.5);
  }

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    background: linear-gradient(135deg, #e0b44d 0%, #d4a843 50%, #c49b38 100%);
    box-shadow: 0 8px 30px rgba(212, 168, 67, 0.55);

    [data-theme="color"] & {
      box-shadow: 0 8px 35px rgba(212, 168, 67, 0.6);
    }
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const FormMicroTrust = styled.p`
  font-size: 0.875rem;
  color: #9ca3af;
  text-align: center;
  margin-top: 1rem;
  margin-bottom: 0;

  [data-theme="dark"] & {
    color: #6b7280;
  }
`;

const ContactFallback = styled.div`
  text-align: center;
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.15);

  button {
    color: white !important;
    border-color: rgba(255, 255, 255, 0.5) !important;

    &:hover {
      border-color: white !important;
      background: rgba(255, 255, 255, 0.1) !important;
    }
  }
`;

const ContactQuestion = styled.p`
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 1rem;
`;


const PartnersPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, t } = useLanguage();
  const [benefitsRef, benefitsInView] = useInView({ threshold: 0.2, triggerOnce: true });
  const [processRef, processInView] = useInView({ threshold: 0.2, triggerOnce: true });
  // City filter removed - locations now shown as showcase

  // Handle scrolling to hash anchor on page load
  useEffect(() => {
    if (location.hash) {
      // Remove the # from the hash
      const id = location.hash.replace('#', '');
      // Wait for the page to render, then scroll to the element
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) {
          // Scroll to the element with smooth behavior and offset for header
          const headerOffset = 80; // Adjust this value based on your header height
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }, 100); // Small delay to ensure DOM is fully rendered
    }
  }, [location]);

  const benefits = [
    {
      icon: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=400&fit=crop',
      titleEn: 'More real customers',
      titleBg: 'Повече реални клиенти',
      textEn: 'BOOM Card users actively seek places with discounts. Your business appears in the app and attracts new visitors who are ready to spend.',
      textBg: 'Потребителите на BOOM Card активно търсят места с отстъпки. Вашият бизнес се показва в приложението и привлича нови посетители, готови да харчат.'
    },
    {
      icon: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&h=400&fit=crop',
      titleEn: 'Repeat visits and loyalty',
      titleBg: 'Повтаряеми посещения и лоялност',
      textEn: 'Discounts motivate customers to come back. Every visit builds a habit and turns a first-time guest into a regular.',
      textBg: 'Отстъпките мотивират клиентите да се връщат. Всяко посещение изгражда навик и превръща случайния гост в редовен.'
    },
    {
      icon: 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=400&h=400&fit=crop',
      titleEn: 'Easy discount management',
      titleBg: 'Лесно управление на отстъпките',
      textEn: 'You set the discount levels, the system handles the rest. No complex integrations or extra work for your staff.',
      textBg: 'Вие задавате нивата на отстъпки, системата се грижи за останалото. Без сложни интеграции или допълнителна работа за персонала.'
    },
    {
      icon: 'https://images.unsplash.com/photo-1633265486064-086b219458ec?w=400&h=400&fit=crop',
      titleEn: 'Secure and controlled platform',
      titleBg: 'Сигурна и контролирана платформа',
      textEn: 'Every visit is verified through QR code. You have full visibility over redeemed discounts and real statistics.',
      textBg: 'Всяко посещение се верифицира чрез QR код. Имате пълна видимост над използваните отстъпки и реални статистики.'
    }
  ];

  const steps = [
    {
      titleEn: 'Apply online',
      titleBg: 'Кандидатствате онлайн',
      textEn: 'Fill out a short form and our team will contact you within 2 working days.',
      textBg: 'Попълвате кратка форма, екипът се свързва с вас до 2 работни дни.'
    },
    {
      titleEn: 'Set up your profile',
      titleBg: 'Настройвате профила си',
      textEn: 'Set clear discounts and prepare for launch. Our team helps with every step.',
      textBg: 'Задавате ясни отстъпки и се подготвяте за старт. Нашият екип помага на всяка стъпка.'
    },
    {
      titleEn: 'Get approved',
      titleBg: 'Получавате одобрение',
      textEn: 'Our team reviews your profile and approves it before you go live. You\'ll be notified once you\'re ready to welcome customers.',
      textBg: 'Нашият екип преглежда профила ви и го одобрява преди да станете видими. Ще бъдете уведомени, когато сте готови да приемате клиенти.'
    },
    {
      titleEn: 'Welcome customers',
      titleBg: 'Приемате клиенти',
      textEn: 'Customers scan a QR code and you get real visits. Simple and transparent.',
      textBg: 'Клиентите сканират QR код и вие получавате реални посещения. Просто и прозрачно.'
    }
  ];

  // Cities filter removed - locations now shown as showcase

  const { data: venuesData, isLoading: venuesLoading, isError: venuesError } = useEntities({ limit: 6 });
  const venues: Entity[] = venuesData?.data ?? [];

  return (
    <PageContainer>
      <Hero>
        <Container>
          <HeroContent>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Title>
                {t('partners.title')}
              </Title>
              <Subtitle>
                {t('partners.subtitle')}
              </Subtitle>
              <HeroButtons>
                <a href="#application" style={{ textDecoration: 'none' }}>
                  <Button variant="golden" size="large">
                    {t('partners.applyNow')}
                  </Button>
                </a>
                <MicroTrust>{t('partners.microTrust')}</MicroTrust>
              </HeroButtons>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <StatsSection>
        <Container>
          <StatsGrid>
            <StatCard>
              <StatNumber>300+</StatNumber>
              <StatLabel>{t('partners.partnersCount')}</StatLabel>
            </StatCard>
            <StatCard>
              <StatNumber>5 000+</StatNumber>
              <StatLabel>{t('partners.activeUsers')}</StatLabel>
            </StatCard>
            <StatCard>
              <StatNumber>100 000+</StatNumber>
              <StatLabel>{t('partners.redeemedOffers')}</StatLabel>
            </StatCard>
            <StatCard>
              <StatNumber>95%</StatNumber>
              <StatLabel>{t('partners.satisfactionRate')}</StatLabel>
            </StatCard>
          </StatsGrid>
        </Container>
      </StatsSection>

      <Section ref={benefitsRef}>
        <Container>
          <SectionTitle>
            {t('partners.whyBoomCard')}
          </SectionTitle>
          <SectionSubtitle>
            {t('partners.benefitsSubtitle')}
          </SectionSubtitle>

          <BenefitsGrid>
            {benefits.map((benefit, index) => (
              <BenefitCard
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={benefitsInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card>
                  <BenefitImageContainer $imageUrl={benefit.icon} />
                  <BenefitContent>
                    <BenefitTitle>
                      {language === 'bg' ? benefit.titleBg : benefit.titleEn}
                    </BenefitTitle>
                    <BenefitText>
                      {language === 'bg' ? benefit.textBg : benefit.textEn}
                    </BenefitText>
                  </BenefitContent>
                </Card>
              </BenefitCard>
            ))}
          </BenefitsGrid>
        </Container>
      </Section>

      <ProcessSection ref={processRef} id="how-it-works">
        <Container>
          <SectionTitle>
            {t('partners.howItWorks')}
          </SectionTitle>
          <SectionSubtitle>
            {t('partners.stepsSubtitle')}
          </SectionSubtitle>

          <ProcessSteps>
            {steps.map((step, index) => (
              <ProcessStep
                key={index}
                initial={{ opacity: 0, x: -30 }}
                animate={processInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.2 }}
              >
                <StepNumber>{index + 1}</StepNumber>
                <StepContent>
                  <StepTitle>
                    {language === 'bg' ? step.titleBg : step.titleEn}
                  </StepTitle>
                  <StepText>
                    {language === 'bg' ? step.textBg : step.textEn}
                  </StepText>
                </StepContent>
              </ProcessStep>
            ))}
          </ProcessSteps>
        </Container>
      </ProcessSection>

      <LocationsSection id="locations">
        <Container>
          <SectionTitle>
            {t('partners.locationsTitle')}
          </SectionTitle>
          <SectionSubtitle>
            {t('partners.locationsSubtitle')}
          </SectionSubtitle>

          <LocationsGrid>
            {venuesLoading ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                {language === 'bg' ? 'Зареждане...' : 'Loading...'}
              </div>
            ) : venuesError ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                {language === 'bg' ? 'Неуспешно зареждане на локации. Моля, опитайте отново.' : 'Could not load locations. Please try again.'}
              </div>
            ) : venues.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                {language === 'bg' ? 'Няма налични локации' : 'No locations available'}
              </div>
            ) : (
              venues.map((entity, index) => (
                <Link key={entity.id} to={entity.path} style={{ textDecoration: 'none', display: 'block' }}>
                  <LocationCard
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                  >
                    <LocationImage
                      $bgImage={entity.images.hero}
                      role="img"
                      aria-label={(language === 'bg' ? entity.name.bg : entity.name.en) || entity.name.en}
                    />

                    <LocationContent>
                      <LocationName>{(language === 'bg' ? entity.name.bg : entity.name.en) || entity.name.en}</LocationName>
                      <LocationAddress>
                        {entity.location.city ?? entity.location.display} &middot; {(language === 'bg' ? entity.category.bg : entity.category.en) || entity.category.en}
                      </LocationAddress>
                    </LocationContent>
                  </LocationCard>
                </Link>
              ))
            )}
          </LocationsGrid>

          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link to="/venues" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="large">
                {t('partners.viewBoomPlaces')}
              </Button>
            </Link>
          </div>
        </Container>
      </LocationsSection>

      <CTASection id="application">
        <Container>
          <CTATitle>
            {t('partners.readyToStart')}
          </CTATitle>
          <CTAText>
            {t('partners.ctaText')}
          </CTAText>

          <FormSection>
            <FormTitle>
              {t('partners.partnershipApplication')}
            </FormTitle>
            <CTAText style={{ color: '#6b7280', marginBottom: '2rem' }}>
              {language === 'bg'
                ? 'Попълнете кратка форма за кандидатстване. Не е нужна парола — ще получите имейл с линк за активиране, чрез който ще зададете своята парола.'
                : 'Fill out a short application form. No password needed — you will receive an email with an activation link to set your own password.'}
            </CTAText>
            <GradientButton type="button" onClick={() => navigate('/register/partner')}>
              {language === 'bg' ? 'Кандидатствай като партньор' : 'Apply as a partner'}
            </GradientButton>
            <FormMicroTrust>
              {t('partners.formMicroTrust')}
            </FormMicroTrust>
          </FormSection>

          <ContactFallback>
            <ContactQuestion>{t('partners.contactQuestion')}</ContactQuestion>
            <Link to="/contact" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="large">
                {t('partners.contactUs')}
              </Button>
            </Link>
          </ContactFallback>
        </Container>
      </CTASection>
    </PageContainer>
  );
};

export default PartnersPage;
