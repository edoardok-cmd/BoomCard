import styled from 'styled-components';

export const StyledFooter = styled.footer`
  border-top: 1px solid var(--color-footer-border);
  padding: 3rem 0;
  margin-top: 4rem;
  background: var(--color-footer-bg);
  color: var(--color-footer-text);
  transition: background-color 0.3s ease, color 0.3s ease;

  /* Color mode - vibrant gradient footer */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 25%, #ab2567 50%, #ff006e 75%, #ff4500 100%);
    background-size: 300% 300%;
    animation: footerGradient 10s ease infinite;
    border-top: 3px solid transparent;
    border-image: linear-gradient(90deg, #ff4500, #ff006e, #00d4ff, #b24bf3) 1;
    box-shadow:
      inset 0 8px 40px -10px rgba(255, 0, 110, 0.3),
      inset 0 4px 30px -10px rgba(255, 69, 0, 0.2),
      0 -8px 40px -10px rgba(139, 47, 184, 0.2);
    position: relative;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg,
        transparent 0%,
        #ff4500 20%,
        #ff006e 40%,
        #00d4ff 60%,
        #b24bf3 80%,
        transparent 100%
      );
      opacity: 0.6;
    }
  }

  a {
    color: var(--color-footer-text);
    opacity: 0.8;
    transition: all 0.3s ease;

    &:hover {
      opacity: 1;

      [data-theme="color"] & {
        color: #00d4ff;
        text-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
      }
    }
  }

  @keyframes footerGradient {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
`;