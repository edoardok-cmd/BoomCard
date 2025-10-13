import React from 'react';
import styled from 'styled-components';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
export type BadgeSize = 'small' | 'medium' | 'large';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  dot?: boolean;
}

const variantStyles = {
  default: {
    background: '#f3f4f6',
    color: '#374151',
  },
  success: {
    background: '#d1fae5',
    color: '#065f46',
  },
  warning: {
    background: '#fef3c7',
    color: '#92400e',
  },
  error: {
    background: '#fee2e2',
    color: '#991b1b',
  },
  info: {
    background: '#dbeafe',
    color: '#1e40af',
  },
};

const sizeStyles = {
  small: {
    padding: '2px 8px',
    fontSize: '0.75rem',
  },
  medium: {
    padding: '4px 12px',
    fontSize: '0.875rem',
  },
  large: {
    padding: '6px 16px',
    fontSize: '1rem',
  },
};

const StyledBadge = styled.span<{ variant: BadgeVariant; size: BadgeSize; dot?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  border-radius: 9999px;
  white-space: nowrap;
  transition: all 200ms ease;

  background: ${props => variantStyles[props.variant].background};
  color: ${props => variantStyles[props.variant].color};
  padding: ${props => sizeStyles[props.size].padding};
  font-size: ${props => sizeStyles[props.size].fontSize};

  ${props => props.dot && `
    &::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
  `}
`;

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'medium',
  className,
  dot = false,
}) => {
  return (
    <StyledBadge
      variant={variant}
      size={size}
      dot={dot}
      className={className}
    >
      {children}
    </StyledBadge>
  );
};

export default Badge;
