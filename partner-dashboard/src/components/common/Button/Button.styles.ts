import styled, { css, keyframes } from 'styled-components';

const spin = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const gradientFlow = keyframes`
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
`;

const variantStyles = {
  primary: css`
    background: var(--color-primary);
    color: var(--color-secondary);
    border: none;
    font-weight: 600;
    box-shadow: var(--shadow-soft);

    /* Color mode: vibrant gradient overlay */
    [data-theme="color"] & {
      background: linear-gradient(135deg, #ff4500 0%, #ff006e 50%, #8b2fb8 100%);
      background-size: 200% 200%;
      animation: ${gradientFlow} 3s ease infinite;
      box-shadow:
        0 6px 30px -5px rgba(255, 69, 0, 0.6),
        0 8px 35px -5px rgba(255, 0, 110, 0.4),
        0 4px 25px -5px rgba(139, 47, 184, 0.3);
    }

    &:hover:not(:disabled) {
      background-color: var(--color-primary-hover);
      box-shadow: var(--shadow-hover);
      transform: translateY(-2px);

      [data-theme="color"] & {
        animation-duration: 1.5s;
        box-shadow:
          0 12px 50px -5px rgba(255, 69, 0, 0.8),
          0 14px 55px -5px rgba(255, 0, 110, 0.6),
          0 8px 45px -5px rgba(139, 47, 184, 0.5);
      }
    }
    &:active:not(:disabled) {
      transform: scale(0.97);
    }
  `,
  secondary: css`
    background: var(--color-background);
    color: var(--color-text-primary);
    border: 2px solid var(--color-border);
    font-weight: 600;

    [data-theme="color"] & {
      background: linear-gradient(135deg, #fff5e1 0%, #ffe4f1 100%);
      border: 2px solid #ff94d6;
      color: #1a0a2e;
      box-shadow:
        0 4px 20px -3px rgba(255, 148, 214, 0.4),
        0 2px 15px -3px rgba(178, 75, 243, 0.3);
    }

    &:hover:not(:disabled) {
      border-color: var(--color-primary);
      background: var(--color-background-secondary);
      box-shadow: var(--shadow-soft);
      transform: translateY(-2px);

      [data-theme="color"] & {
        background: linear-gradient(135deg, #ffd6a5 0%, #ffb5d5 100%);
        border-color: #ff006e;
      }
    }
    &:active:not(:disabled) {
      transform: scale(0.97);
    }
  `,
  outline: css`
    background-color: transparent;
    color: var(--color-text-primary);
    border: 2px solid var(--color-border);
    font-weight: 500;

    [data-theme="color"] & {
      border: 2px solid #ff4500;
      color: #8b2fb8;
    }

    &:hover:not(:disabled) {
      background: var(--color-background-secondary);
      border-color: var(--color-primary);
      transform: translateY(-2px);

      [data-theme="color"] & {
        background: linear-gradient(135deg, rgba(255, 69, 0, 0.1) 0%, rgba(255, 0, 110, 0.1) 100%);
        border-color: #ff006e;
      }
    }
    &:active:not(:disabled) {
      transform: scale(0.97);
    }
  `,
  ghost: css`
    background-color: transparent;
    color: var(--color-text-secondary);
    border: 1px solid transparent;

    [data-theme="color"] & {
      color: #8b2fb8;
      font-weight: 600;
    }

    &:hover:not(:disabled) {
      background: var(--color-background-tertiary);
      border-color: var(--color-border);
      transform: translateY(-1px);

      [data-theme="color"] & {
        background: linear-gradient(135deg, rgba(255, 69, 0, 0.15) 0%, rgba(139, 47, 184, 0.15) 100%);
        border-color: #ff94d6;
      }
    }
    &:active:not(:disabled) {
      transform: scale(0.97);
    }
  `,
  danger: css`
    background-color: var(--color-error);
    color: white;
    border: none;
    font-weight: 600;
    box-shadow: var(--shadow-soft);

    [data-theme="color"] & {
      background: linear-gradient(135deg, #ff0066 0%, #ff4500 100%);
      box-shadow:
        0 6px 30px -5px rgba(255, 0, 102, 0.6),
        0 8px 35px -5px rgba(255, 69, 0, 0.4);
    }

    &:hover:not(:disabled) {
      background-color: #dc2626;
      box-shadow: var(--shadow-hover);
      transform: translateY(-2px);
    }
    &:active:not(:disabled) {
      transform: scale(0.97);
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
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  svg {
    animation: ${spin} 1s linear infinite;
  }
`;