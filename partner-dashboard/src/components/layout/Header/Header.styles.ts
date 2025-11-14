import styled from 'styled-components';

export const StyledHeader = styled.header`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1020;
  width: 100%;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background-color: rgba(var(--foreground), 0.02);
  border-bottom: 1px solid var(--color-border);
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);

  /* Constrain content width on ultra-wide displays */
  > div {
    max-width: 100%;
  }

  @media (min-width: 2560px) {
    > div {
      max-width: 2400px;
      margin: 0 auto;
    }
  }

  /* Light mode */
  [data-theme="light"] & {
    background-color: rgba(255, 255, 255, 0.7);
  }

  /* Dark mode */
  [data-theme="dark"] & {
    background-color: rgba(15, 23, 42, 0.7);
  }

  /* Color mode - vibrant gradient with glow */
  [data-theme="color"] & {
    background: linear-gradient(180deg,
      rgba(255, 249, 240, 0.7) 0%,
      rgba(255, 240, 248, 0.7) 50%,
      rgba(240, 248, 255, 0.7) 100%
    );
    border-bottom: 2px solid transparent;
    border-image: linear-gradient(90deg, #ff4500, #ff006e, #00d4ff) 1;
    box-shadow:
      0 4px 25px -3px rgba(255, 69, 0, 0.2),
      0 6px 30px -3px rgba(255, 0, 110, 0.15),
      0 4px 20px -3px rgba(0, 212, 255, 0.1);
  }

  &.scrolled {
    box-shadow: var(--shadow-soft);

    [data-theme="light"] & {
      background-color: rgba(255, 255, 255, 0.7);
    }

    [data-theme="dark"] & {
      background-color: rgba(15, 23, 42, 0.7);
    }

    [data-theme="color"] & {
      background: linear-gradient(180deg,
        rgba(255, 249, 240, 0.7) 0%,
        rgba(255, 240, 248, 0.7) 50%,
        rgba(240, 248, 255, 0.7) 100%
      );
      box-shadow:
        0 8px 40px -5px rgba(255, 69, 0, 0.35),
        0 10px 45px -5px rgba(255, 0, 110, 0.25),
        0 6px 35px -5px rgba(0, 212, 255, 0.2);
    }
  }
`;