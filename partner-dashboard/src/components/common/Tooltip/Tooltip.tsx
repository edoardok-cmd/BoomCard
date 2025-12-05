import React, { useState } from 'react';
import styled from 'styled-components';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const TooltipWrapper = styled.div`
  position: relative;
  display: inline-block;
`;

const TooltipContent = styled.div<{ $visible: boolean; $position: 'top' | 'bottom' | 'left' | 'right' }>`
  position: absolute;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 400;
  white-space: nowrap;
  z-index: 1000;
  pointer-events: none;
  opacity: ${props => props.$visible ? 1 : 0};
  visibility: ${props => props.$visible ? 'visible' : 'hidden'};
  transition: opacity 0.2s ease, visibility 0.2s ease;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);

  /* Position variants */
  ${props => {
    switch (props.$position) {
      case 'top':
        return `
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
        `;
      case 'bottom':
        return `
          top: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
        `;
      case 'left':
        return `
          right: calc(100% + 8px);
          top: 50%;
          transform: translateY(-50%);
        `;
      case 'right':
        return `
          left: calc(100% + 8px);
          top: 50%;
          transform: translateY(-50%);
        `;
      default:
        return `
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
        `;
    }
  }}

  /* Arrow */
  &::after {
    content: '';
    position: absolute;
    border: 6px solid transparent;

    ${props => {
      switch (props.$position) {
        case 'top':
          return `
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border-top-color: rgba(0, 0, 0, 0.9);
          `;
        case 'bottom':
          return `
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            border-bottom-color: rgba(0, 0, 0, 0.9);
          `;
        case 'left':
          return `
            left: 100%;
            top: 50%;
            transform: translateY(-50%);
            border-left-color: rgba(0, 0, 0, 0.9);
          `;
        case 'right':
          return `
            right: 100%;
            top: 50%;
            transform: translateY(-50%);
            border-right-color: rgba(0, 0, 0, 0.9);
          `;
        default:
          return `
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border-top-color: rgba(0, 0, 0, 0.9);
          `;
      }
    }}
  }

  /* Dark theme adjustments */
  [data-theme="dark"] & {
    background: rgba(255, 255, 255, 0.95);
    color: #111827;

    &::after {
      ${props => {
        switch (props.$position) {
          case 'top':
            return `border-top-color: rgba(255, 255, 255, 0.95);`;
          case 'bottom':
            return `border-bottom-color: rgba(255, 255, 255, 0.95);`;
          case 'left':
            return `border-left-color: rgba(255, 255, 255, 0.95);`;
          case 'right':
            return `border-right-color: rgba(255, 255, 255, 0.95);`;
          default:
            return `border-top-color: rgba(255, 255, 255, 0.95);`;
        }
      }}
    }
  }

  /* Vibrant theme adjustments */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%);
    color: white;
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);

    &::after {
      ${props => {
        switch (props.$position) {
          case 'top':
            return `border-top-color: #3b82f6;`;
          case 'bottom':
            return `border-bottom-color: #3b82f6;`;
          case 'left':
            return `border-left-color: #3b82f6;`;
          case 'right':
            return `border-right-color: #3b82f6;`;
          default:
            return `border-top-color: #3b82f6;`;
        }
      }}
    }
  }

  @media (max-width: 768px) {
    white-space: normal;
    max-width: 200px;
    font-size: 0.8125rem;
  }
`;

const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top' }) => {
  const [visible, setVisible] = useState(false);

  return (
    <TooltipWrapper
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onTouchStart={() => setVisible(true)}
      onTouchEnd={() => setTimeout(() => setVisible(false), 2000)}
    >
      {children}
      <TooltipContent $visible={visible} $position={position}>
        {content}
      </TooltipContent>
    </TooltipWrapper>
  );
};

export default Tooltip;
