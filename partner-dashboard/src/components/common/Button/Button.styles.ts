import styled, { css } from 'styled-components';

const variantStyles = {
  primary: css`
    background-color: #007bff;
    color: white;
    &:hover:not(:disabled) {
      background-color: #0056b3;
    }
  `,
  secondary: css`
    background-color: #6c757d;
    color: white;
    &:hover:not(:disabled) {
      background-color: #545b62;
    }
  `,
  danger: css`
    background-color: #dc3545;
    color: white;
    &:hover:not(:disabled) {
      background-color: #c82333;
    }
  `
};

const sizeStyles = {
  small: css`
    padding: 6px 12px;
    font-size: 14px;
  `,
  medium: css`
    padding: 8px 16px;
    font-size: 16px;
  `,
  large: css`
    padding: 12px 24px;
    font-size: 18px;
  `
};

export const StyledButton = styled.button<{ variant?: string; size?: string }>`
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
  
  ${props => variantStyles[props.variant || 'primary']}
  ${props => sizeStyles[props.size || 'medium']}
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;