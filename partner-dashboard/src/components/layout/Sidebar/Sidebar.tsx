import React from 'react';
import { StyledSidebar } from './Sidebar.styles';

export interface SidebarProps {
  children?: React.ReactNode;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  children,
  className
}) => {
  return (
    <StyledSidebar className={className}>
      {children}
    </StyledSidebar>
  );
};

export default Sidebar;