import styled, { css, keyframes } from 'styled-components';

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const variantStyles = {
  primary: css`
    background-color: #000000;
    color: white;
    border: none;
    &:hover:not(:disabled) {
      background-color: #1f2937;
      box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.15);
    }
    &:active:not(:disabled) {
      transform: scale(0.95);
    }
  `,
  secondary: css`
    background-color: white;
    color: #000000;
    border: 1px solid #e5e7eb;
    &:hover:not(:disabled) {
      border-color: #000000;
      background-color: #f9fafb;
    }
    &:active:not(:disabled) {
      transform: scale(0.95);
    }
  `,
  outline: css`
    background-color: transparent;
    color: #000000;
    border: 1px solid #d1d5db;
    &:hover:not(:disabled) {
      background-color: #f9fafb;
      border-color: #000000;
    }
    &:active:not(:disabled) {
      transform: scale(0.95);
    }
  `,
  ghost: css`
    background-color: transparent;
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.3);
    &:hover:not(:disabled) {
      background-color: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.5);
    }
    &:active:not(:disabled) {
      transform: scale(0.95);
    }
  `,
  danger: css`
    background-color: #ef4444;
    color: white;
    border: none;
    &:hover:not(:disabled) {
      background-color: #dc2626;
      box-shadow: 0 10px 40px -10px rgba(239, 68, 68, 0.3);
    }
    &:active:not(:disabled) {
      transform: scale(0.95);
    }
  `
};

const sizeStyles = {
  small: css`
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;

    @media (max-width: 640px) {
      padding: 6px 12px;
      font-size: 13px;
    }
  `,
  medium: css`
    padding: 12px 24px;
    font-size: 16px;
    font-weight: 500;

    @media (max-width: 640px) {
      padding: 10px 18px;
      font-size: 15px;
    }
  `,
  large: css`
    padding: 16px 32px;
    font-size: 18px;
    font-weight: 600;

    @media (max-width: 640px) {
      padding: 14px 24px;
      font-size: 16px;
    }
  `
};

type VariantType = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type SizeType = 'small' | 'medium' | 'large';

export const StyledButton = styled.button<{ variant?: VariantType; size?: SizeType; $fullWidth?: boolean }>`
  border-radius: 9999px;
  cursor: pointer;
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  width: ${props => props.$fullWidth ? '100%' : 'auto'};

  ${props => variantStyles[props.variant || 'primary']}
  ${props => sizeStyles[props.size || 'medium']}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  &:focus-visible {
    outline: 2px solid #000000;
    outline-offset: 2px;
  }

  svg {
    animation: ${spin} 1s linear infinite;
  }
`;