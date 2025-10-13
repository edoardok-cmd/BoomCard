import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';

export type AlertVariant = 'success' | 'warning' | 'error' | 'info';

export interface AlertProps {
  children?: React.ReactNode;
  className?: string;
  variant?: AlertVariant;
  title?: string;
  onClose?: () => void;
}

const variantStyles = {
  success: {
    background: '#f0fdf4',
    border: '#86efac',
    color: '#166534',
    icon: '✓',
  },
  warning: {
    background: '#fffbeb',
    border: '#fcd34d',
    color: '#92400e',
    icon: '⚠',
  },
  error: {
    background: '#fef2f2',
    border: '#fca5a5',
    color: '#991b1b',
    icon: '✕',
  },
  info: {
    background: '#eff6ff',
    border: '#93c5fd',
    color: '#1e40af',
    icon: 'ℹ',
  },
};

const StyledAlert = styled(motion.div)<{ variant: AlertVariant }>`
  padding: 1rem 1.25rem;
  border-radius: 0.75rem;
  border: 1px solid;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;

  background: ${props => variantStyles[props.variant].background};
  border-color: ${props => variantStyles[props.variant].border};
  color: ${props => variantStyles[props.variant].color};
`;

const IconWrapper = styled.div`
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1rem;
`;

const Content = styled.div`
  flex: 1;
`;

const Title = styled.div`
  font-weight: 600;
  margin-bottom: 0.25rem;
`;

const CloseButton = styled.button`
  flex-shrink: 0;
  padding: 0.25rem;
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 200ms;
  color: currentColor;

  &:hover {
    opacity: 1;
  }
`;

export const Alert: React.FC<AlertProps> = ({
  children,
  className,
  variant = 'info',
  title,
  onClose,
}) => {
  return (
    <AnimatePresence>
      <StyledAlert
        variant={variant}
        className={className}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
      >
        <IconWrapper>{variantStyles[variant].icon}</IconWrapper>
        <Content>
          {title && <Title>{title}</Title>}
          <div>{children}</div>
        </Content>
        {onClose && (
          <CloseButton onClick={onClose} aria-label="Close alert">
            ✕
          </CloseButton>
        )}
      </StyledAlert>
    </AnimatePresence>
  );
};

export default Alert;