/**
 * SubscriptionCancelPage
 * Displays when user cancels payment or payment fails at Paysera
 */

import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import Button from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import Header from '../components/layout/Header/Header';
import Footer from '../components/layout/Footer/Footer';

const PageWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
`;

const PageContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6rem 1rem 2rem;
`;

const Card = styled(motion.div)`
  width: 100%;
  max-width: 32rem;
  background: var(--color-background-secondary);
  border-radius: 1rem;
  box-shadow: var(--shadow-hover);
  padding: 3rem;
  border: 1px solid var(--color-border);
  text-align: center;

  @media (max-width: 640px) {
    padding: 2rem 1.5rem;
  }
`;

const IconContainer = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;
  background: rgba(239, 68, 68, 0.1);

  svg {
    width: 40px;
    height: 40px;
    color: #ef4444;
  }
`;

const Title = styled.h1`
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.75rem;
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin-bottom: 2rem;
  line-height: 1.6;
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const InfoBox = styled.div`
  background: #eff6ff;
  border: 1px solid #3b82f6;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 2rem;
  font-size: 0.875rem;
  color: #1e40af;
  text-align: left;

  [data-theme="dark"] & {
    background: rgba(59, 130, 246, 0.1);
    border-color: #3b82f6;
    color: #93c5fd;
  }
`;

const SubscriptionCancelPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <PageWrapper>
      <Header />
      <PageContainer>
        <Card
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <IconContainer>
            <XCircle />
          </IconContainer>

          <Title>
            {language === 'bg' ? 'Плащането е отменено' : 'Payment Cancelled'}
          </Title>
          <Subtitle>
            {language === 'bg'
              ? 'Вашето плащане беше отменено или не беше завършено. Не сте били таксувани.'
              : 'Your payment was cancelled or not completed. You have not been charged.'}
          </Subtitle>

          <InfoBox>
            {language === 'bg'
              ? 'Можете да опитате отново по всяко време. Ако имате въпроси или проблеми с плащането, моля свържете се с нашия екип за поддръжка.'
              : 'You can try again at any time. If you have questions or issues with payment, please contact our support team.'}
          </InfoBox>

          <ButtonContainer>
            <Link to="/pricing">
              <Button variant="primary" size="large" fullWidth>
                <RefreshCw size={18} style={{ marginRight: '0.5rem' }} />
                {language === 'bg' ? 'Опитай отново' : 'Try Again'}
              </Button>
            </Link>
            <Link to="/">
              <Button variant="secondary" size="large" fullWidth>
                <ArrowLeft size={18} style={{ marginRight: '0.5rem' }} />
                {language === 'bg' ? 'Към началната страница' : 'Back to Home'}
              </Button>
            </Link>
          </ButtonContainer>
        </Card>
      </PageContainer>
      <Footer />
    </PageWrapper>
  );
};

export default SubscriptionCancelPage;
