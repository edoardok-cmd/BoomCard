import styled from 'styled-components';

export const StyledCard = styled.div`
  background: var(--color-background);
  border-radius: 2rem;
  padding: 2rem;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-soft);
  transition: all 400ms cubic-bezier(0.4, 0, 0.2, 1);
  color: var(--color-text-primary);

  /* Color mode: vibrant gradient cards */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #fff5e1 0%, #ffe4f1 50%, #e8f4ff 100%);
    border: 2px solid transparent;
    border-image: linear-gradient(135deg, #ff4500, #ff006e, #00d4ff, #b24bf3) 1;
    border-radius: 2rem;
    box-shadow:
      0 8px 35px -5px rgba(255, 69, 0, 0.3),
      0 10px 40px -5px rgba(255, 0, 110, 0.25),
      0 6px 30px -5px rgba(0, 212, 255, 0.2),
      0 4px 25px -5px rgba(178, 75, 243, 0.15);
    position: relative;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 2rem;
      padding: 2px;
      background: linear-gradient(135deg, #ff4500, #ff006e, #00d4ff, #b24bf3);
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
      opacity: 0.8;
    }
  }

  &:hover {
    box-shadow: var(--shadow-hover);
    transform: translateY(-4px);

    [data-theme="color"] & {
      box-shadow:
        0 15px 55px -5px rgba(255, 69, 0, 0.5),
        0 18px 60px -5px rgba(255, 0, 110, 0.4),
        0 12px 50px -5px rgba(0, 212, 255, 0.35),
        0 8px 45px -5px rgba(178, 75, 243, 0.3);
    }
  }

  @media (min-width: 768px) {
    padding: 2.5rem;
  }
`;