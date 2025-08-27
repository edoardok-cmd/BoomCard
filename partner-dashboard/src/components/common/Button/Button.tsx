import React from 'react';
import { StyledButton } from './Button.styles';

export interface ButtonProps {
  children?: React.ReactNode;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className
}) => {
  return (
    <StyledButton className={className}>
      {children}
    </StyledButton>
  );
};

export default Button;