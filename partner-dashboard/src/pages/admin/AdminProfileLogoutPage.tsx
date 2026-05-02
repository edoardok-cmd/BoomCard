import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../../contexts/AuthContext';

const palette = {
  bg: '#faf9f5',
  surface: '#ffffff',
  border: '#e8e5dc',
  text: '#141413',
  textMuted: '#605a50',
  accent: '#c96442',
  accentSoft: '#f3e8de',
  danger: '#b54327',
  dangerSoft: '#f4dcd2',
};

const AdminProfileLogoutPage: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    setLoggingOut(true);
    logout();
    navigate('/login', { replace: true });
  };

  if (loggingOut) {
    return (
      <Wrapper>
        <Spinner />
        <Title>Излизане…</Title>
        <Body>Излизате от администраторския панел.</Body>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Card>
        <Icon>⎋</Icon>
        <Title>Излизане от акаунта</Title>
        <Body>Сигурни ли сте, че искате да излезете от администраторския панел?</Body>
        <Actions>
          <DangerButton onClick={handleLogout}>Изход</DangerButton>
          <SecondaryButton onClick={() => navigate(-1)}>Отказ</SecondaryButton>
        </Actions>
      </Card>
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

const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.875rem;
  padding: 2.5rem 2rem;
  max-width: 24rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.06);
`;

const Icon = styled.div`
  font-size: 2rem;
  line-height: 1;
  margin-bottom: 0.25rem;
`;

const Spinner = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  border: 3px solid #e8e5dc;
  border-top-color: #c96442;
  border-radius: 50%;
  margin-bottom: 1rem;
  animation: spin 1s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const Title = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0;
`;

const Body = styled.p`
  font-size: 0.9375rem;
  color: ${palette.textMuted};
  max-width: 22rem;
  margin: 0;
  line-height: 1.5;
`;

const Actions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
  width: 100%;
  justify-content: center;
`;

const DangerButton = styled.button`
  background: ${palette.danger};
  color: white;
  border: 0;
  padding: 0.625rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: #903021; }
`;

const SecondaryButton = styled.button`
  background: ${palette.bg};
  color: ${palette.text};
  border: 1px solid ${palette.border};
  padding: 0.625rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: ${palette.accentSoft}; border-color: ${palette.accent}; }
`;

export default AdminProfileLogoutPage;
