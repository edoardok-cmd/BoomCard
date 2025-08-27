import React from 'react';
import { StyledAlert } from './Alert.styles';

export interface AlertProps {
  children?: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  children,
  className
}) => {
  return (
    <StyledAlert className={className}>
      {children}
    </StyledAlert>
  );
};

export default Alert;