import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  Smartphone,
  MapPin,
  BarChart3,
  Users,
  Zap,
  Shield,
  CreditCard,
  Bell,
  QrCode,
  Globe,
  TrendingUp,
  Target,
  MessageSquare,
  Calendar,
  Settings,
  ArrowRight,
  Check
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const PageContainer = styled.div`
  min-height: 100vh;
  background: #ffffff;
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

const Section = styled.section`
  padding: 5rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const CategoryTitle = styled.h2`
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: #1a1a1a;
  text-align: center;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const CategorySubtitle = styled.p`
  font-size: 1.25rem;
  color: #6b7280;
  text-align: center;
  margin-bottom: 4rem;
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;
`;

const FeaturesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 2rem;
  margin-top: 3rem;
`;

const FeatureCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 2.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border: 1px solid #e5e7eb;
  transition: all 0.3s;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
    border-color: #1a1a1a;
  }
`;

const FeatureHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const FeatureIcon = styled.div<{ $color: string }>`
  width: 50px;
  height: 50px;
  border-radius: 0.75rem;
  background: ${props => props.$color};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
`;

const FeatureTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a1a1a;
`;

const FeatureDescription = styled.p`
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.6;
  margin-bottom: 1.5rem;
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const FeatureListItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  color: #4b5563;
  font-size: 0.9375rem;

  svg {
    flex-shrink: 0;
    margin-top: 0.125rem;
    color: #10b981;
  }
`;

const CTASection = styled.section`
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  padding: 5rem 2rem;
  text-align: center;
  color: white;
`;

const CTATitle = styled.h2`
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
`;

const CTASubtitle = styled.p`
  font-size: 1.25rem;
  margin-bottom: 2rem;
  opacity: 0.9;
`;

const CTAButton = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 2rem;
  background: white;
  color: #1a1a1a;
  text-decoration: none;
  border-radius: 9999px;
  font-size: 1.125rem;
  font-weight: 600;
  transition: all 0.3s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  }
`;

const FeaturesPage: React.FC = () => {
  const { language } = useLanguage();

  const coreFeatures = [
    {
      icon: <Smartphone size={24} />,
      color: '#6366f1',
      titleEn: 'Mobile-First Platform',
      titleBg: 'Мобилна платформа',
      descEn: 'Native mobile experience optimized for iOS and Android devices with offline capability.',
      descBg: 'Родно мобилно изживяване, оптимизирано за iOS и Android устройства с офлайн възможности.',
      features: [
        { en: 'Progressive Web App (PWA)', bg: 'Прогресивно уеб приложение (PWA)' },
        { en: 'Offline mode support', bg: 'Поддръжка на офлайн режим' },
        { en: 'Push notifications', bg: 'Push известия' },
        { en: 'Fast loading times', bg: 'Бързо зареждане' },
      ],
    },
    {
      icon: <MapPin size={24} />,
      color: '#10b981',
      titleEn: 'Location Intelligence',
      titleBg: 'Локационна интелигентност',
      descEn: 'Advanced geolocation features to connect customers with nearby offers in real-time.',
      descBg: 'Усъвършенствани геолокационни функции за свързване на клиенти с близки оферти в реално време.',
      features: [
        { en: 'GPS-based offer discovery', bg: 'Откриване на оферти чрез GPS' },
        { en: 'Radius-based targeting', bg: 'Таргетиране по радиус' },
        { en: 'Map view integration', bg: 'Интеграция с карти' },
        { en: 'Location-based notifications', bg: 'Известия по местоположение' },
      ],
    },
    {
      icon: <BarChart3 size={24} />,
      color: '#f59e0b',
      titleEn: 'Analytics Dashboard',
      titleBg: 'Табло за анализи',
      descEn: 'Comprehensive analytics to track performance, customer behavior, and ROI.',
      descBg: 'Цялостни анализи за проследяване на ефективност, поведение на клиенти и ROI.',
      features: [
        { en: 'Real-time metrics', bg: 'Метрики в реално време' },
        { en: 'Customer demographics', bg: 'Демография на клиентите' },
        { en: 'Conversion tracking', bg: 'Проследяване на конверсии' },
        { en: 'Revenue reports', bg: 'Отчети за приходи' },
      ],
    },
    {
      icon: <Users size={24} />,
      color: '#ef4444',
      titleEn: 'Customer Management',
      titleBg: 'Управление на клиенти',
      descEn: 'Powerful CRM tools to understand and engage with your customer base.',
      descBg: 'Мощни CRM инструменти за разбиране и ангажиране с клиентската база.',
      features: [
        { en: 'Customer profiles', bg: 'Профили на клиенти' },
        { en: 'Purchase history', bg: 'История на покупки' },
        { en: 'Segmentation tools', bg: 'Инструменти за сегментиране' },
        { en: 'Loyalty tracking', bg: 'Проследяване на лоялност' },
      ],
    },
    {
      icon: <Zap size={24} />,
      color: '#8b5cf6',
      titleEn: 'Quick Setup',
      titleBg: 'Бърза настройка',
      descEn: 'Get started in minutes with our intuitive onboarding process.',
      descBg: 'Започнете за минути с интуитивния ни процес на адаптиране.',
      features: [
        { en: 'Step-by-step wizard', bg: 'Стъпка по стъпка помощник' },
        { en: 'Pre-made templates', bg: 'Готови шаблони' },
        { en: 'Bulk import tools', bg: 'Инструменти за масово импортиране' },
        { en: 'Video tutorials', bg: 'Видео уроци' },
      ],
    },
    {
      icon: <QrCode size={24} />,
      color: '#06b6d4',
      titleEn: 'QR Code Integration',
      titleBg: 'QR код интеграция',
      descEn: 'Generate and manage QR codes for contactless offer redemption.',
      descBg: 'Генерирайте и управлявайте QR кодове за безконтактно изкупуване на оферти.',
      features: [
        { en: 'Dynamic QR codes', bg: 'Динамични QR кодове' },
        { en: 'Scan to redeem', bg: 'Сканирайте за изкупуване' },
        { en: 'Custom branding', bg: 'Персонализиран брандинг' },
        { en: 'Print-ready formats', bg: 'Формати за печат' },
      ],
    },
    {
      icon: <CreditCard size={24} />,
      color: '#14b8a6',
      titleEn: 'Payment Processing',
      titleBg: 'Обработка на плащания',
      descEn: 'Secure payment integration with multiple payment methods supported.',
      descBg: 'Сигурна интеграция на плащания с поддръжка на множество методи за плащане.',
      features: [
        { en: 'Credit/debit cards', bg: 'Кредитни/дебитни карти' },
        { en: 'Digital wallets', bg: 'Дигитални портфейли' },
        { en: 'POS integration', bg: 'POS интеграция' },
        { en: 'Automated invoicing', bg: 'Автоматизирано фактуриране' },
      ],
    },
    {
      icon: <Bell size={24} />,
      color: '#ec4899',
      titleEn: 'Notifications System',
      titleBg: 'Система за известия',
      descEn: 'Multi-channel notification system to keep customers engaged.',
      descBg: 'Многоканална система за известия за ангажиране на клиентите.',
      features: [
        { en: 'Push notifications', bg: 'Push известия' },
        { en: 'Email campaigns', bg: 'Имейл кампании' },
        { en: 'SMS alerts', bg: 'SMS съобщения' },
        { en: 'In-app messages', bg: 'Вътрешни съобщения' },
      ],
    },
    {
      icon: <Shield size={24} />,
      color: '#0ea5e9',
      titleEn: 'Security & Compliance',
      titleBg: 'Сигурност и съответствие',
      descEn: 'Enterprise-grade security with GDPR compliance and data encryption.',
      descBg: 'Корпоративна сигурност със съответствие с GDPR и криптиране на данни.',
      features: [
        { en: 'End-to-end encryption', bg: 'Криптиране от край до край' },
        { en: 'GDPR compliant', bg: 'Съответствие с GDPR' },
        { en: 'Two-factor authentication', bg: 'Двуфакторна автентикация' },
        { en: 'Regular security audits', bg: 'Редовни одити на сигурността' },
      ],
    },
    {
      icon: <Target size={24} />,
      color: '#f97316',
      titleEn: 'Marketing Automation',
      titleBg: 'Маркетингова автоматизация',
      descEn: 'Automated marketing campaigns to boost engagement and sales.',
      descBg: 'Автоматизирани маркетингови кампании за увеличаване на ангажираността и продажбите.',
      features: [
        { en: 'Email automation', bg: 'Имейл автоматизация' },
        { en: 'Campaign scheduling', bg: 'Планиране на кампании' },
        { en: 'A/B testing', bg: 'A/B тестване' },
        { en: 'Performance tracking', bg: 'Проследяване на ефективността' },
      ],
    },
    {
      icon: <MessageSquare size={24} />,
      color: '#84cc16',
      titleEn: 'Customer Support',
      titleBg: 'Клиентска поддръжка',
      descEn: 'Integrated customer support tools to provide excellent service.',
      descBg: 'Интегрирани инструменти за клиентска поддръжка за отлично обслужване.',
      features: [
        { en: 'Live chat support', bg: 'Поддръжка чрез чат на живо' },
        { en: 'Help center', bg: 'Център за помощ' },
        { en: 'Ticket system', bg: 'Система за тикети' },
        { en: '24/7 availability', bg: '24/7 наличност' },
      ],
    },
    {
      icon: <Settings size={24} />,
      color: '#6366f1',
      titleEn: 'Customization',
      titleBg: 'Персонализация',
      descEn: 'Extensive customization options to match your brand identity.',
      descBg: 'Обширни опции за персонализация за съответствие с идентичността на марката.',
      features: [
        { en: 'Custom branding', bg: 'Персонализиран брандинг' },
        { en: 'White-label options', bg: 'Опции за бяла етикетка' },
        { en: 'Theme customization', bg: 'Персонализация на тема' },
        { en: 'API access', bg: 'Достъп до API' },
      ],
    },
  ];

  return (
    <PageContainer>
      <HeroSection>
        <HeroTitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {language === 'bg' ? 'Всички функции' : 'All Features'}
        </HeroTitle>
        <HeroSubtitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {language === 'bg'
            ? 'Открийте цялостния набор от инструменти за развитие на вашия бизнес'
            : 'Discover the complete suite of tools to grow your business'}
        </HeroSubtitle>
      </HeroSection>

      <Section>
        <CategoryTitle>
          {language === 'bg' ? 'Основни функции' : 'Core Features'}
        </CategoryTitle>
        <CategorySubtitle>
          {language === 'bg'
            ? 'Всичко необходимо за управление и развитие на вашия бизнес'
            : 'Everything you need to manage and grow your business'}
        </CategorySubtitle>

        <FeaturesGrid>
          {coreFeatures.map((feature, index) => (
            <FeatureCard
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
            >
              <FeatureHeader>
                <FeatureIcon $color={feature.color}>
                  {feature.icon}
                </FeatureIcon>
                <FeatureTitle>
                  {language === 'bg' ? feature.titleBg : feature.titleEn}
                </FeatureTitle>
              </FeatureHeader>
              <FeatureDescription>
                {language === 'bg' ? feature.descBg : feature.descEn}
              </FeatureDescription>
              <FeatureList>
                {feature.features.map((item, i) => (
                  <FeatureListItem key={i}>
                    <Check size={18} />
                    <span>{language === 'bg' ? item.bg : item.en}</span>
                  </FeatureListItem>
                ))}
              </FeatureList>
            </FeatureCard>
          ))}
        </FeaturesGrid>
      </Section>

      <CTASection>
        <CTATitle>
          {language === 'bg' ? 'Готови да започнете?' : 'Ready to Get Started?'}
        </CTATitle>
        <CTASubtitle>
          {language === 'bg'
            ? 'Започнете безплатно и изпробвайте всички функции'
            : 'Start free and try all features'}
        </CTASubtitle>
        <CTAButton to="/register/partner">
          {language === 'bg' ? 'Създайте акаунт сега' : 'Create Account Now'}
          <ArrowRight size={20} />
        </CTAButton>
      </CTASection>
    </PageContainer>
  );
};

export default FeaturesPage;
