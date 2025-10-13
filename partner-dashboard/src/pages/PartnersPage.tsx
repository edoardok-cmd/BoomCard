import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/common/Button/Button';
import Card from '../components/common/Card/Card';

const PageContainer = styled.div`
  min-height: 100vh;
  background: white;
`;

const Hero = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);
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
  gap: 1rem;
  flex-wrap: wrap;
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

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const BenefitsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
`;

const BenefitCard = styled(motion.div)`
  text-align: center;
  height: 100%;
  display: flex;
  flex-direction: column;
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
`;

const BenefitText = styled.p`
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.6;
`;

const StatsSection = styled.div`
  background: #f9fafb;
  padding: 4rem 0;
  text-align: center;
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
  font-size: 3.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
  line-height: 1;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const StatLabel = styled.div`
  font-size: 1rem;
  color: #6b7280;
`;

const ProcessSection = styled(Section)`
  background: white;
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
`;

const StepContent = styled.div`
  flex: 1;
`;

const StepTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const StepText = styled.p`
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.7;
`;

const CTASection = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);
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

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const FormSection = styled.div`
  max-width: 600px;
  margin: 0 auto;
  background: white;
  padding: 3rem;
  border-radius: 1rem;

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
`;

const FormGrid = styled.div`
  display: grid;
  gap: 1.25rem;
`;

const FormGroup = styled.div``;

const Label = styled.label`
  display: block;
  font-size: 0.9375rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.875rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #111827;
  transition: all 200ms;

  &:focus {
    outline: none;
    border-color: #000000;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.875rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #111827;
  background: white;
  cursor: pointer;
  transition: all 200ms;

  &:focus {
    outline: none;
    border-color: #000000;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 0.875rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #111827;
  min-height: 120px;
  resize: vertical;
  transition: all 200ms;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: #000000;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const PartnersPage: React.FC = () => {
  const { language, t } = useLanguage();
  const [benefitsRef, benefitsInView] = useInView({ threshold: 0.2, triggerOnce: true });
  const [processRef, processInView] = useInView({ threshold: 0.2, triggerOnce: true });

  const benefits = [
    {
      icon: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=400&fit=crop',
      titleEn: 'Increase Revenue',
      titleBg: 'Увеличете приходите',
      textEn: 'Reach thousands of new customers actively looking for deals',
      textBg: 'Достигнете хиляди нови клиенти, търсещи оферти'
    },
    {
      icon: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&h=400&fit=crop',
      titleEn: 'Build Loyalty',
      titleBg: 'Изградете лоялност',
      textEn: 'Turn first-time visitors into regular customers',
      textBg: 'Превърнете първоначалните посетители в редовни клиенти'
    },
    {
      icon: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=400&fit=crop',
      titleEn: 'Track Performance',
      titleBg: 'Проследявайте резултати',
      textEn: 'Real-time analytics and insights on your offers',
      textBg: 'Анализи и статистики в реално време'
    },
    {
      icon: 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=400&h=400&fit=crop',
      titleEn: 'Easy Management',
      titleBg: 'Лесно управление',
      textEn: 'Simple dashboard to manage all your offers',
      textBg: 'Прост интерфейс за управление на офертите'
    },
    {
      icon: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&h=400&fit=crop',
      titleEn: 'Targeted Marketing',
      titleBg: 'Таргетиран маркетинг',
      textEn: 'Reach the right customers at the right time',
      textBg: 'Достигнете правилните клиенти в правилното време'
    },
    {
      icon: 'https://images.unsplash.com/photo-1633265486064-086b219458ec?w=400&h=400&fit=crop',
      titleEn: 'Secure & Reliable',
      titleBg: 'Сигурно и надеждно',
      textEn: 'Bank-level security for all transactions',
      textBg: 'Сигурност на банково ниво за всички транзакции'
    }
  ];

  const steps = [
    {
      titleEn: 'Apply Online',
      titleBg: 'Кандидатствайте онлайн',
      textEn: 'Fill out our simple partnership form. We\'ll review your application within 24 hours.',
      textBg: 'Попълнете нашата проста форма. Ще прегледаме кандидатурата ви в рамките на 24 часа.'
    },
    {
      titleEn: 'Setup Your Profile',
      titleBg: 'Настройте профила си',
      textEn: 'Our team will help you create attractive offers and set up your partner dashboard.',
      textBg: 'Нашият екип ще ви помогне да създадете атрактивни оферти и да настроите вашия профил.'
    },
    {
      titleEn: 'Go Live',
      titleBg: 'Започнете',
      textEn: 'Start accepting customers with QR codes and watch your business grow!',
      textBg: 'Започнете да приемате клиенти с QR кодове и гледайте бизнеса си да расте!'
    }
  ];

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
                <Button variant="secondary" size="large">
                  {t('partners.applyNow')}
                </Button>
                <Button variant="ghost" size="large">
                  {t('partners.contactUs')}
                </Button>
              </HeroButtons>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <StatsSection>
        <Container>
          <StatsGrid>
            <StatCard>
              <StatNumber>500+</StatNumber>
              <StatLabel>{t('partners.partnersCount')}</StatLabel>
            </StatCard>
            <StatCard>
              <StatNumber>50K+</StatNumber>
              <StatLabel>{t('partners.activeUsers')}</StatLabel>
            </StatCard>
            <StatCard>
              <StatNumber>1M+</StatNumber>
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

      <ProcessSection ref={processRef}>
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

      <CTASection>
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
            <FormGrid>
              <FormGroup>
                <Label>{t('partners.businessName')}</Label>
                <Input type="text" placeholder={t('partners.businessNamePlaceholder')} />
              </FormGroup>

              <FormGroup>
                <Label>{t('partners.businessType')}</Label>
                <Select>
                  <option value="">{t('partners.selectOption')}</option>
                  <option value="restaurant">{t('partners.restaurant')}</option>
                  <option value="hotel">{t('partners.hotel')}</option>
                  <option value="spa">{t('partners.spa')}</option>
                  <option value="winery">{t('partners.winery')}</option>
                  <option value="other">{t('partners.other')}</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>{t('partners.email')}</Label>
                <Input type="email" placeholder="email@example.com" />
              </FormGroup>

              <FormGroup>
                <Label>{t('partners.phone')}</Label>
                <Input type="tel" placeholder="+359 ..." />
              </FormGroup>

              <FormGroup>
                <Label>{t('partners.location')}</Label>
                <Input type="text" placeholder={t('partners.cityPlaceholder')} />
              </FormGroup>

              <FormGroup>
                <Label>{t('partners.messageOptional')}</Label>
                <TextArea
                  placeholder={t('partners.messagePlaceholder')}
                />
              </FormGroup>

              <Button variant="primary" size="large">
                {t('partners.submitApplication')}
              </Button>
            </FormGrid>
          </FormSection>
        </Container>
      </CTASection>
    </PageContainer>
  );
};

export default PartnersPage;
