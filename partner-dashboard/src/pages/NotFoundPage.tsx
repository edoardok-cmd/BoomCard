import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import Button from '../components/common/Button/Button';

const PageContainer = styled.div`
  min-height: calc(100vh - 4rem);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
`;

const Content = styled(motion.div)`
  text-align: center;
  max-width: 32rem;
`;

const ErrorCode = styled(motion.h1)`
  font-size: 8rem;
  font-weight: 900;
  color: #111827;
  line-height: 1;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #111827 0%, #6b7280 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;

  @media (max-width: 640px) {
    font-size: 6rem;
  }
`;

const Title = styled(motion.h2)`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 1rem;

  @media (max-width: 640px) {
    font-size: 1.5rem;
  }
`;

const Description = styled(motion.p)`
  font-size: 1.125rem;
  color: #6b7280;
  margin-bottom: 2.5rem;
  line-height: 1.6;

  @media (max-width: 640px) {
    font-size: 1rem;
  }
`;

const ButtonGroup = styled(motion.div)`
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
`;

const IllustrationContainer = styled(motion.div)`
  margin-bottom: 2rem;
  display: flex;
  justify-content: center;
`;

const Illustration = styled.svg`
  width: 16rem;
  height: 16rem;

  @media (max-width: 640px) {
    width: 12rem;
    height: 12rem;
  }
`;

const SuggestedLinks = styled(motion.div)`
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid #e5e7eb;
`;

const SuggestedTitle = styled.p`
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1rem;
`;

const LinksList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
`;

const SuggestedLink = styled(Link)`
  font-size: 0.9375rem;
  color: #111827;
  text-decoration: none;
  font-weight: 500;
  transition: color 200ms;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    color: #6b7280;
  }

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

interface NotFoundPageProps {
  language?: 'en' | 'bg';
}

const NotFoundPage: React.FC<NotFoundPageProps> = ({ language = 'en' }) => {
  const navigate = useNavigate();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <PageContainer>
      <Content
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <IllustrationContainer variants={itemVariants}>
          <Illustration viewBox="0 0 200 200" fill="none">
            {/* Map with pin illustration */}
            <motion.circle
              cx="100"
              cy="100"
              r="80"
              stroke="#e5e7eb"
              strokeWidth="2"
              fill="#f9fafb"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
            />
            <motion.path
              d="M100 60C88.954 60 80 68.954 80 80C80 91.046 88.954 100 100 100C111.046 100 120 91.046 120 80C120 68.954 111.046 60 100 60Z"
              fill="#111827"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
            />
            <motion.path
              d="M100 50L100 110"
              stroke="#111827"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            />
            <motion.circle
              cx="100"
              cy="110"
              r="4"
              fill="#111827"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.6, duration: 0.2 }}
            />
            {/* Question marks */}
            <motion.text
              x="60"
              y="140"
              fontSize="24"
              fill="#d1d5db"
              fontWeight="bold"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ delay: 0.8, duration: 2, repeat: Infinity }}
            >
              ?
            </motion.text>
            <motion.text
              x="130"
              y="140"
              fontSize="24"
              fill="#d1d5db"
              fontWeight="bold"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ delay: 1, duration: 2, repeat: Infinity }}
            >
              ?
            </motion.text>
          </Illustration>
        </IllustrationContainer>

        <ErrorCode variants={itemVariants}>404</ErrorCode>

        <Title variants={itemVariants}>
          {language === 'bg' ? 'Страницата не е намерена' : 'Page Not Found'}
        </Title>

        <Description variants={itemVariants}>
          {language === 'bg'
            ? 'Съжаляваме, но страницата, която търсите, не съществува или е била преместена. Моля, проверете URL адреса или се върнете към началната страница.'
            : "Sorry, the page you're looking for doesn't exist or has been moved. Please check the URL or return to the homepage."}
        </Description>

        <ButtonGroup variants={itemVariants}>
          <Button variant="primary" size="large" onClick={() => navigate('/')}>
            {language === 'bg' ? 'Към началната страница' : 'Go to Homepage'}
          </Button>
          <Button variant="ghost" size="large" onClick={() => navigate(-1)}>
            {language === 'bg' ? 'Назад' : 'Go Back'}
          </Button>
        </ButtonGroup>

        <SuggestedLinks variants={itemVariants}>
          <SuggestedTitle>
            {language === 'bg' ? 'Може да търсите' : 'You might be looking for'}
          </SuggestedTitle>
          <LinksList>
            <SuggestedLink to="/categories">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
              {language === 'bg' ? 'Разгледай категории' : 'Browse Categories'}
            </SuggestedLink>
            <SuggestedLink to="/top-offers">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
              {language === 'bg' ? 'ТОП оферти' : 'Top Offers'}
            </SuggestedLink>
            <SuggestedLink to="/search">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {language === 'bg' ? 'Търсене' : 'Search'}
            </SuggestedLink>
            <SuggestedLink to="/partners">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              {language === 'bg' ? 'Станете партньор' : 'Become a Partner'}
            </SuggestedLink>
          </LinksList>
        </SuggestedLinks>
      </Content>
    </PageContainer>
  );
};

export default NotFoundPage;
