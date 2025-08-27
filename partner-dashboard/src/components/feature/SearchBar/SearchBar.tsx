import React from 'react';
import { StyledSearchBar } from './SearchBar.styles';

export interface SearchBarProps {
  children?: React.ReactNode;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  children,
  className
}) => {
  return (
    <StyledSearchBar className={className}>
      {children}
    </StyledSearchBar>
  );
};

export default SearchBar;