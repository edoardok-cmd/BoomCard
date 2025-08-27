import React from 'react';
import { StyledCard } from './Card.styles';

export interface CardProps {
  children?: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  className
}) => {
  return (
    <StyledCard className={className}>
      {children}
    </StyledCard>
  );
};

export default Card;