import React from 'react';
import { StyledHeader } from './Header.styles';

export interface HeaderProps {
  children?: React.ReactNode;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  children,
  className
}) => {
  return (
    <StyledHeader className={className}>
      {children}
    </StyledHeader>
  );
};

export default Header;