import styled from 'styled-components';

export const StyledHeader = styled.header`
  position: sticky;
  top: 0;
  z-index: 1020;
  width: 100%;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background-color: rgba(255, 255, 255, 0.8);
  border-bottom: 1px solid #f3f4f6;
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);

  &.scrolled {
    box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.1);
    background-color: rgba(255, 255, 255, 0.9);
  }
`;