import React from 'react';
import { StyledFilterPanel } from './FilterPanel.styles';

export interface FilterPanelProps {
  children?: React.ReactNode;
  className?: string;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  children,
  className
}) => {
  return (
    <StyledFilterPanel className={className}>
      {children}
    </StyledFilterPanel>
  );
};

export default FilterPanel;