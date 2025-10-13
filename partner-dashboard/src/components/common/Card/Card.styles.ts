import styled from 'styled-components';

export const StyledCard = styled.div`
  background: white;
  border-radius: 2rem;
  padding: 2rem;
  border: 1px solid #f3f4f6;
  box-shadow: 0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04);
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }

  @media (min-width: 768px) {
    padding: 2.5rem;
  }
`;