import React from 'react';
import { StyledMap } from './Map.styles';

export interface MapProps {
  children?: React.ReactNode;
  className?: string;
}

export const Map: React.FC<MapProps> = ({
  children,
  className
}) => {
  return (
    <StyledMap className={className}>
      {children}
    </StyledMap>
  );
};

export default Map;