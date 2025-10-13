import React from 'react';
import { StyledButton } from './Button.styles';

export interface ButtonProps {
  children?: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'medium',
  onClick,
  disabled = false,
  type = 'button',
  isLoading = false,
}) => {
  return (
    <StyledButton
      className={className}
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled || isLoading}
      type={type}
    >
      {isLoading ? (
        <>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {children}
        </>
      ) : (
        children
      )}
    </StyledButton>
  );
};

export default Button;