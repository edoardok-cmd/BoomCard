import React from 'react';
import { StyledCard } from './Card.styles';

export interface CardProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  style
}) => {
  return (
    <StyledCard className={className} style={style}>
      {children}
    </StyledCard>
  );
};

export default Card;