import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Briefcase, MapPin, Clock, ArrowRight } from 'lucide-react';
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
  margin-bottom: 3rem;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
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
  margin-bottom: 4rem;
  color: var(--color-text-primary);
`;

const JobsGrid = styled.div`
  display: grid;
  gap: 2rem;
`;

const JobCard = styled(motion.div)`
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

const JobHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 1rem;
`;

const JobTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
`;

const JobMeta = styled.div`
  display: flex;
  gap: 2rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-secondary);
  font-size: 0.9375rem;

  svg {
    flex-shrink: 0;
  }
`;

const JobDescription = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin-bottom: 1.5rem;
`;

const ApplyButton = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: var(--color-primary);
  color: var(--color-secondary);
  text-decoration: none;
  border-radius: 0.5rem;
  font-weight: 600;
  transition: all 0.3s;

  &:hover {
    background: var(--color-primary-hover);
    transform: translateX(4px);
  }
`;

const CareersPage: React.FC = () => {
  const { language } = useLanguage();

  const jobs = [
    {
      titleEn: 'Senior Full-Stack Developer',
      titleBg: 'Старши Full-Stack Разработчик',
      department: language === 'bg' ? 'Инженеринг' : 'Engineering',
      location: 'Sofia, Bulgaria / Remote',
      type: language === 'bg' ? 'Пълно работно време' : 'Full-time',
      descEn: 'Join our engineering team to build scalable solutions for our growing platform. Experience with React, Node.js, and TypeScript required.',
      descBg: 'Присъединете се към нашия инженерен екип за изграждане на мащабируеми решения за нарастващата ни платформа. Изисква се опит с React, Node.js и TypeScript.',
    },
    {
      titleEn: 'Product Designer',
      titleBg: 'Продуктов Дизайнер',
      department: language === 'bg' ? 'Дизайн' : 'Design',
      location: 'Sofia, Bulgaria',
      type: language === 'bg' ? 'Пълно работно време' : 'Full-time',
      descEn: 'Create beautiful and intuitive user experiences for our mobile and web applications. Strong portfolio and Figma expertise required.',
      descBg: 'Създавайте красиви и интуитивни потребителски изживявания за нашите мобилни и уеб приложения. Необходимо е силно портфолио и опит с Figma.',
    },
    {
      titleEn: 'Customer Success Manager',
      titleBg: 'Мениджър Успех на Клиенти',
      department: language === 'bg' ? 'Клиентски успех' : 'Customer Success',
      location: 'Sofia, Bulgaria',
      type: language === 'bg' ? 'Пълно работно време' : 'Full-time',
      descEn: 'Help our partner businesses succeed by providing exceptional support and guidance. Fluency in Bulgarian and English required.',
      descBg: 'Помогнете на нашите партньорски бизнеси да успеят, като предоставяте изключителна поддръжка и насоки. Изисква се свободно владеене на български и английски.',
    },
  ];

  return (
    <PageContainer>
      <HeroSection>
        <Title
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {language === 'bg' ? 'Присъединете се към нашия екип' : 'Join Our Team'}
        </Title>
        <Subtitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {language === 'bg'
            ? 'Помогнете ни да изградим бъдещето на дигиталните оферти'
            : 'Help us build the future of digital offers'}
        </Subtitle>
      </HeroSection>

      <Section>
        <SectionTitle>
          {language === 'bg' ? 'Отворени позиции' : 'Open Positions'}
        </SectionTitle>

        <JobsGrid>
          {jobs.map((job, index) => (
            <JobCard
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <JobHeader>
                <JobTitle>{language === 'bg' ? job.titleBg : job.titleEn}</JobTitle>
              </JobHeader>

              <JobMeta>
                <MetaItem>
                  <Briefcase size={18} />
                  {job.department}
                </MetaItem>
                <MetaItem>
                  <MapPin size={18} />
                  {job.location}
                </MetaItem>
                <MetaItem>
                  <Clock size={18} />
                  {job.type}
                </MetaItem>
              </JobMeta>

              <JobDescription>
                {language === 'bg' ? job.descBg : job.descEn}
              </JobDescription>

              <ApplyButton to="/contact">
                {language === 'bg' ? 'Кандидатствай сега' : 'Apply Now'}
                <ArrowRight size={18} />
              </ApplyButton>
            </JobCard>
          ))}
        </JobsGrid>
      </Section>
    </PageContainer>
  );
};

export default CareersPage;
