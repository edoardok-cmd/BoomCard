import React from 'react';
import { StyledFooter } from './Footer.styles';

export interface FooterProps {
  children?: React.ReactNode;
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({
  children,
  className
}) => {
  return (
    <StyledFooter className={className}>
      {children}
    </StyledFooter>
  );
};

export default Footer;