import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  Smartphone,
  MapPin,
  Gift,
  TrendingUp,
  Users,
  BarChart3,
  Zap,
  Shield,
  Globe,
  ArrowRight
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const PageContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
`;

const HeroSection = styled.section`
  padding: 6rem 2rem 4rem;
  text-align: center;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  color: white;
`;

const HeroTitle = styled(motion.h1)`
  font-size: 3.5rem;
  font-weight: 800;
  margin-bottom: 1.5rem;
  line-height: 1.2;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const HeroSubtitle = styled(motion.p)`
  font-size: 1.5rem;
  color: #d1d5db;
  margin-bottom: 3rem;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;

  @media (max-width: 768px) {
    font-size: 1.25rem;
  }
`;

const CTAButtons = styled(motion.div)`
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
`;

const CTAButton = styled(Link)<{ $variant?: 'primary' | 'secondary' }>`
  padding: 1rem 2rem;
  border-radius: 9999px;
  font-size: 1.125rem;
  font-weight: 600;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.3s;
  background: ${props => props.$variant === 'secondary' ? 'transparent' : 'white'};
  color: ${props => props.$variant === 'secondary' ? 'white' : '#1a1a1a'};
  border: ${props => props.$variant === 'secondary' ? '2px solid white' : 'none'};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  }
`;

const Section = styled.section`
  padding: 5rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const SectionTitle = styled.h2`
  font-size: 2.5rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 1rem;
  color: #1a1a1a;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const SectionSubtitle = styled.p`
  font-size: 1.25rem;
  text-align: center;
  color: #6b7280;
  margin-bottom: 4rem;
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;
`;

const FeaturesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 3rem;
`;

const FeatureCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: all 0.3s;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
  }
`;

const FeatureIcon = styled.div<{ $color: string }>`
  width: 60px;
  height: 60px;
  border-radius: 1rem;
  background: ${props => props.$color};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
  color: white;
`;

const FeatureTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: #1a1a1a;
`;

const FeatureDescription = styled.p`
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.6;
`;

const StatsSection = styled.section`
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  padding: 5rem 2rem;
  color: white;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 3rem;
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
`;

const StatCard = styled(motion.div)`
  padding: 2rem;
`;

const StatNumber = styled.div`
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
`;

const StatLabel = styled.div`
  font-size: 1.125rem;
  opacity: 0.9;
`;

const ProductPage: React.FC = () => {
  const { t, language } = useLanguage();

  const features = [
    {
      icon: <Smartphone size={28} />,
      color: '#6366f1',
      titleEn: 'Mobile-First Experience',
      titleBg: 'Мобилно изживяване',
      descEn: 'Seamless mobile app for both customers and partners. Access offers, redeem rewards, and manage your business on the go.',
      descBg: 'Безпроблемно мобилно приложение за клиенти и партньори. Достъп до оферти, изкупуване на награди и управление на бизнеса в движение.',
    },
    {
      icon: <MapPin size={28} />,
      color: '#10b981',
      titleEn: 'Location-Based Offers',
      titleBg: 'Оферти по местоположение',
      descEn: 'Smart geolocation technology connects customers with nearby deals. Increase foot traffic with location-targeted promotions.',
      descBg: 'Интелигентна геолокационна технология свързва клиенти с близки оферти. Увеличете трафика с промоции по местоположение.',
    },
    {
      icon: <Gift size={28} />,
      color: '#f59e0b',
      titleEn: 'Rewards & Loyalty',
      titleBg: 'Награди и лоялност',
      descEn: 'Built-in loyalty program that keeps customers coming back. Earn points, unlock rewards, and build lasting relationships.',
      descBg: 'Вградена програма за лоялност, която връща клиентите. Печелете точки, отключвайте награди и изграждайте трайни отношения.',
    },
    {
      icon: <TrendingUp size={28} />,
      color: '#ef4444',
      titleEn: 'Real-Time Analytics',
      titleBg: 'Анализи в реално време',
      descEn: 'Track performance with detailed analytics dashboard. Monitor redemptions, revenue, and customer engagement metrics.',
      descBg: 'Проследявайте ефективността с подробно табло за анализи. Наблюдавайте изкупувания, приходи и ангажираност на клиентите.',
    },
    {
      icon: <Users size={28} />,
      color: '#8b5cf6',
      titleEn: 'Customer Insights',
      titleBg: 'Клиентски анализи',
      descEn: 'Understand your audience with powerful customer analytics. Make data-driven decisions to optimize your offers.',
      descBg: 'Разберете аудиторията си с мощни клиентски анализи. Вземайте решения на база данни за оптимизиране на офертите.',
    },
    {
      icon: <BarChart3 size={28} />,
      color: '#06b6d4',
      titleEn: 'Marketing Tools',
      titleBg: 'Маркетингови инструменти',
      descEn: 'Comprehensive suite of marketing tools to promote your business. Email campaigns, push notifications, and social sharing.',
      descBg: 'Цялостен набор от маркетингови инструменти за промотиране на бизнеса. Имейл кампании, известия и споделяне в социални мрежи.',
    },
    {
      icon: <Zap size={28} />,
      color: '#eab308',
      titleEn: 'Instant Activation',
      titleBg: 'Моментна активация',
      descEn: 'Get started in minutes with our quick setup process. No technical expertise required - just create and publish.',
      descBg: 'Започнете за минути с бързия ни процес на настройка. Не се изисква техническа експертиза - просто създайте и публикувайте.',
    },
    {
      icon: <Shield size={28} />,
      color: '#14b8a6',
      titleEn: 'Secure & Reliable',
      titleBg: 'Сигурност и надеждност',
      descEn: 'Bank-level security with encrypted transactions. 99.9% uptime guarantee ensures your business never stops.',
      descBg: 'Сигурност от банково ниво с криптирани транзакции. 99.9% време на работа гарантира, че бизнесът ви никога не спира.',
    },
    {
      icon: <Globe size={28} />,
      color: '#ec4899',
      titleEn: 'Multi-Language Support',
      titleBg: 'Многоезична поддръжка',
      descEn: 'Reach a global audience with built-in multi-language support. Currently available in English and Bulgarian.',
      descBg: 'Достигнете глобална аудитория с вградена многоезична поддръжка. В момента налично на английски и български.',
    },
  ];

  const stats = [
    { number: '10K+', labelEn: 'Active Users', labelBg: 'Активни потребители' },
    { number: '500+', labelEn: 'Partner Businesses', labelBg: 'Партньорски бизнеси' },
    { number: '50K+', labelEn: 'Offers Redeemed', labelBg: 'Изкупени оферти' },
    { number: '99.9%', labelEn: 'Uptime', labelBg: 'Време на работа' },
  ];

  return (
    <PageContainer>
      <HeroSection>
        <HeroTitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {language === 'bg'
            ? 'Платформата за дигитални оферти'
            : 'The Digital Offers Platform'}
        </HeroTitle>
        <HeroSubtitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {language === 'bg'
            ? 'Свържете вашия бизнес с хиляди клиенти. Увеличете продажбите с умни, базирани на местоположение оферти.'
            : 'Connect your business with thousands of customers. Boost sales with smart, location-based offers.'}
        </HeroSubtitle>
        <CTAButtons
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <CTAButton to="/register/partner" $variant="primary">
            {language === 'bg' ? 'Започнете безплатно' : 'Get Started Free'}
            <ArrowRight size={20} />
          </CTAButton>
          <CTAButton to="/pricing" $variant="secondary">
            {language === 'bg' ? 'Вижте ценообразуването' : 'View Pricing'}
          </CTAButton>
        </CTAButtons>
      </HeroSection>

      <Section>
        <SectionTitle>
          {language === 'bg' ? 'Всичко необходимо за успех' : 'Everything You Need to Succeed'}
        </SectionTitle>
        <SectionSubtitle>
          {language === 'bg'
            ? 'Мощни функции, проектирани да помогнат на вашия бизнес да расте и да процъфтява в дигиталната епоха.'
            : 'Powerful features designed to help your business grow and thrive in the digital age.'}
        </SectionSubtitle>

        <FeaturesGrid>
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <FeatureIcon $color={feature.color}>
                {feature.icon}
              </FeatureIcon>
              <FeatureTitle>
                {language === 'bg' ? feature.titleBg : feature.titleEn}
              </FeatureTitle>
              <FeatureDescription>
                {language === 'bg' ? feature.descBg : feature.descEn}
              </FeatureDescription>
            </FeatureCard>
          ))}
        </FeaturesGrid>
      </Section>

      <StatsSection>
        <SectionTitle style={{ color: 'white', marginBottom: '4rem' }}>
          {language === 'bg' ? 'Доверие от хиляди' : 'Trusted by Thousands'}
        </SectionTitle>
        <StatsGrid>
          {stats.map((stat, index) => (
            <StatCard
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <StatNumber>{stat.number}</StatNumber>
              <StatLabel>{language === 'bg' ? stat.labelBg : stat.labelEn}</StatLabel>
            </StatCard>
          ))}
        </StatsGrid>
      </StatsSection>

      <Section>
        <SectionTitle>
          {language === 'bg' ? 'Готови да започнете?' : 'Ready to Get Started?'}
        </SectionTitle>
        <SectionSubtitle>
          {language === 'bg'
            ? 'Присъединете се към стотици бизнеси, които вече растат с BoomCard.'
            : 'Join hundreds of businesses already growing with BoomCard.'}
        </SectionSubtitle>
        <CTAButtons
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <CTAButton to="/register/partner" $variant="primary">
            {language === 'bg' ? 'Създайте акаунт' : 'Create Account'}
            <ArrowRight size={20} />
          </CTAButton>
          <CTAButton to="/contact" $variant="secondary" style={{ color: '#1a1a1a', borderColor: '#1a1a1a' }}>
            {language === 'bg' ? 'Свържете се с нас' : 'Contact Sales'}
          </CTAButton>
        </CTAButtons>
      </Section>
    </PageContainer>
  );
};

export default ProductPage;
