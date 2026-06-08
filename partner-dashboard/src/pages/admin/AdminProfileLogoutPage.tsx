import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../../contexts/AuthContext';


import { palette } from '../../styles/adminTheme';
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
        <Icon>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={36} height={36}>
            <path d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
          </svg>
        </Icon>
        <Title>Излизане от акаунта</Title>
        <Body>Сигурни ли сте, че искате да излезете от администраторския панел?</Body>
        <Actions>
          <DangerButton onClick={handleLogout}>Изход</DangerButton>
          <SecondaryButton onClick={() => navigate('/admin/profile/my-data')}>Отказ</SecondaryButton>
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
  color: ${palette.danger};
  margin-bottom: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Spinner = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  border: 3px solid ${palette.border};
  border-top-color: ${palette.accent};
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
  color: ${palette.onAccent};
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
