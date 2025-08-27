import React from 'react';
import { StyledInput } from './Input.styles';

export interface InputProps {
  children?: React.ReactNode;
  className?: string;
}

export const Input: React.FC<InputProps> = ({
  children,
  className
}) => {
  return (
    <StyledInput className={className}>
      {children}
    </StyledInput>
  );
};

export default Input;