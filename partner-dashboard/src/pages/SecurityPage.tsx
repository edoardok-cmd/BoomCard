import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Shield, Lock, Eye, Server, FileCheck, Users, AlertTriangle, Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--color-background);
`;

const HeroSection = styled.section`
  padding: 6rem 2rem 4rem;
  text-align: center;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  color: white;
`;

const Title = styled(motion.h1)`
  font-size: 3.5rem;
  font-weight: 800;
  margin-bottom: 1.5rem;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const Subtitle = styled(motion.p)`
  font-size: 1.5rem;
  color: #d1d5db;
  max-width: 800px;
  margin: 0 auto;
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
  color: var(--color-text-primary);
`;

const SectionSubtitle = styled.p`
  font-size: 1.25rem;
  text-align: center;
  color: var(--color-text-secondary);
  margin-bottom: 4rem;
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 3rem;
`;

const Card = styled(motion.div)`
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  padding: 2rem;
  transition: all 0.3s;

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-hover);
    border-color: var(--color-text-primary);
  }
`;

const IconWrapper = styled.div<{ $color: string }>`
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

const CardTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: var(--color-text-primary);
`;

const CardDescription = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 2rem 0;
`;

const FeatureItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1rem;
  color: var(--color-text-secondary);
  font-size: 1rem;

  svg {
    flex-shrink: 0;
    margin-top: 0.125rem;
    color: var(--color-accent);
  }
`;

const CertificationsSection = styled(Section)`
  background: var(--color-background-secondary);
  margin-left: -2rem;
  margin-right: -2rem;
  padding: 5rem 2rem;
`;

const SecurityPage: React.FC = () => {
  const { language } = useLanguage();

  const features = [
    {
      icon: <Lock size={28} />,
      color: '#6366f1',
      titleEn: 'Data Encryption',
      titleBg: 'Криптиране на данни',
      descEn: 'All data is encrypted at rest and in transit using industry-standard AES-256 and TLS 1.3 encryption protocols.',
      descBg: 'Всички данни се криптират в покой и при предаване с индустриални стандарти AES-256 и TLS 1.3.',
    },
    {
      icon: <Shield size={28} />,
      color: '#10b981',
      titleEn: 'GDPR Compliance',
      titleBg: 'Съответствие с GDPR',
      descEn: 'We are fully compliant with GDPR and other data protection regulations to protect your privacy.',
      descBg: 'Пълно съответствие с GDPR и други регулации за защита на данните за опазване на вашата поверителност.',
    },
    {
      icon: <Eye size={28} />,
      color: '#f59e0b',
      titleEn: 'Privacy by Design',
      titleBg: 'Поверителност по проект',
      descEn: 'Privacy and security are built into every feature from the ground up, not added as an afterthought.',
      descBg: 'Поверителността и сигурността са вградени във всяка функция отначало, не като допълнение.',
    },
    {
      icon: <Server size={28} />,
      color: '#ef4444',
      titleEn: 'Secure Infrastructure',
      titleBg: 'Сигурна инфраструктура',
      descEn: 'Our infrastructure is hosted on enterprise-grade servers with 99.9% uptime guarantee and regular security audits.',
      descBg: 'Нашата инфраструктура е хоствана на корпоративни сървъри с 99.9% гаранция за работа и редовни одити.',
    },
    {
      icon: <FileCheck size={28} />,
      color: '#8b5cf6',
      titleEn: 'Regular Audits',
      titleBg: 'Редовни одити',
      descEn: 'We conduct regular security audits and penetration testing to identify and fix vulnerabilities.',
      descBg: 'Провеждаме редовни одити на сигурността и тестове за проникване за идентифициране и поправяне на уязвимости.',
    },
    {
      icon: <Users size={28} />,
      color: '#06b6d4',
      titleEn: 'Access Control',
      titleBg: 'Контрол на достъпа',
      descEn: 'Role-based access control and two-factor authentication ensure only authorized users can access sensitive data.',
      descBg: 'Контрол на достъпа на базата на роли и двуфакторна автентикация гарантират достъп само за оторизирани потребители.',
    },
  ];

  const certifications = [
    { en: 'ISO 27001 Certified', bg: 'Сертифициран ISO 27001' },
    { en: 'GDPR Compliant', bg: 'Съответствие с GDPR' },
    { en: 'PCI DSS Level 1', bg: 'PCI DSS Ниво 1' },
    { en: 'SOC 2 Type II', bg: 'SOC 2 Тип II' },
  ];

  return (
    <PageContainer>
      <HeroSection>
        <Title
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {language === 'bg' ? 'Сигурност и поверителност' : 'Security & Privacy'}
        </Title>
        <Subtitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {language === 'bg'
            ? 'Вашите данни са сигурни с нас. Използваме корпоративна сигурност за защита на вашата информация.'
            : 'Your data is safe with us. We use enterprise-grade security to protect your information.'}
        </Subtitle>
      </HeroSection>

      <Section>
        <SectionTitle>
          {language === 'bg' ? 'Как защитаваме вашите данни' : 'How We Protect Your Data'}
        </SectionTitle>
        <SectionSubtitle>
          {language === 'bg'
            ? 'Многослойна защита за максимална сигурност'
            : 'Multi-layered protection for maximum security'}
        </SectionSubtitle>

        <Grid>
          {features.map((feature, index) => (
            <Card
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <IconWrapper $color={feature.color}>
                {feature.icon}
              </IconWrapper>
              <CardTitle>
                {language === 'bg' ? feature.titleBg : feature.titleEn}
              </CardTitle>
              <CardDescription>
                {language === 'bg' ? feature.descBg : feature.descEn}
              </CardDescription>
            </Card>
          ))}
        </Grid>
      </Section>

      <CertificationsSection>
        <SectionTitle>
          {language === 'bg' ? 'Сертификации и съответствие' : 'Certifications & Compliance'}
        </SectionTitle>
        <FeatureList style={{ maxWidth: '600px', margin: '0 auto' }}>
          {certifications.map((cert, index) => (
            <FeatureItem key={index}>
              <Check size={20} />
              <span>{language === 'bg' ? cert.bg : cert.en}</span>
            </FeatureItem>
          ))}
        </FeatureList>
      </CertificationsSection>
    </PageContainer>
  );
};

export default SecurityPage;
