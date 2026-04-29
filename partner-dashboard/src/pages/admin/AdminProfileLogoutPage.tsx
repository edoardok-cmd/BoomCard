import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../../contexts/AuthContext';

const AdminProfileLogoutPage: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  return (
    <Wrapper>
      <Spinner />
      <Title>Signing out…</Title>
      <Body>You are being signed out of the admin panel.</Body>
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
  font-size: 1.25rem;
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

export default AdminProfileLogoutPage;
