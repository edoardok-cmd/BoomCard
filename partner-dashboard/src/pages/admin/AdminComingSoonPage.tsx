import React from 'react';
import styled from 'styled-components';
import { useLanguage } from '../../contexts/LanguageContext';

// Generic placeholder rendered for admin sub-pages not yet implemented.
// The CategoryShell tab bar + header still renders normally around this.
const AdminComingSoonPage: React.FC = () => {
  const { t } = useLanguage();
  return (
    <Wrapper>
      <Icon aria-hidden>🚧</Icon>
      <Title>{t('admin.comingSoon')}</Title>
      <Body>{t('admin.comingSoonDescription')}</Body>
    </Wrapper>
  );
};

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6rem 2rem;
  text-align: center;
`;

const Icon = styled.div`
  font-size: 3rem;
  margin-bottom: 1rem;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 0.5rem;
`;

const Body = styled.p`
  font-size: 0.9375rem;
  color: #6b7280;
  max-width: 28rem;
  margin: 0;
`;

export default AdminComingSoonPage;
