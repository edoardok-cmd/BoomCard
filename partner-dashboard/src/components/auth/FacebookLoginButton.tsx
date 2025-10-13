import React, { useEffect } from 'react';
import styled from 'styled-components';
import { initFacebookSDK } from '../../config/oauth';

interface FacebookLoginButtonProps {
  onSuccess: (response: any) => void;
  onError: (error: any) => void;
  text?: string;
}

const StyledButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: #1877f2;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 200ms;

  &:hover {
    background: #1464d8;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(24, 119, 242, 0.3);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    background: #cccccc;
    cursor: not-allowed;
    transform: none;
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

export const FacebookLoginButton: React.FC<FacebookLoginButtonProps> = ({
  onSuccess,
  onError,
  text = 'Continue with Facebook',
}) => {
  const [isReady, setIsReady] = React.useState(false);

  useEffect(() => {
    initFacebookSDK().then(() => {
      setIsReady(true);
    });
  }, []);

  const handleFacebookLogin = () => {
    if (!(window as any).FB) {
      onError(new Error('Facebook SDK not loaded'));
      return;
    }

    (window as any).FB.login(
      (response: any) => {
        if (response.authResponse) {
          // Get user details
          (window as any).FB.api('/me', { fields: 'id,name,email,picture' }, (userInfo: any) => {
            onSuccess({
              ...response.authResponse,
              userInfo,
            });
          });
        } else {
          onError(new Error('Facebook login cancelled'));
        }
      },
      { scope: 'public_profile,email' }
    );
  };

  return (
    <StyledButton onClick={handleFacebookLogin} disabled={!isReady} type="button">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
      {text}
    </StyledButton>
  );
};

export default FacebookLoginButton;
