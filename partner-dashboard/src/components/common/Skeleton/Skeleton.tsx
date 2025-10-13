import React from 'react';
import styled, { keyframes } from 'styled-components';

const shimmer = keyframes`
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
`;

const StyledSkeleton = styled.div<{ height?: string; width?: string; rounded?: boolean }>`
  background: linear-gradient(
    90deg,
    #f3f4f6 0%,
    #e5e7eb 50%,
    #f3f4f6 100%
  );
  background-size: 1000px 100%;
  animation: ${shimmer} 2s infinite linear;
  border-radius: ${props => props.rounded ? '9999px' : '0.75rem'};
  height: ${props => props.height || '1rem'};
  width: ${props => props.width || '100%'};
`;

export interface SkeletonProps {
  height?: string;
  width?: string;
  rounded?: boolean;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  height,
  width,
  rounded = false,
  className
}) => {
  return (
    <StyledSkeleton
      height={height}
      width={width}
      rounded={rounded}
      className={className}
    />
  );
};

// Preset skeleton components
export const SkeletonText: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="space-y-3">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        height="1rem"
        width={i === lines - 1 ? '80%' : '100%'}
      />
    ))}
  </div>
);

export const SkeletonCard: React.FC = () => (
  <div className="card">
    <Skeleton height="200px" className="mb-4" />
    <Skeleton height="1.5rem" width="60%" className="mb-2" />
    <SkeletonText lines={2} />
  </div>
);

export const SkeletonAvatar: React.FC<{ size?: string }> = ({ size = '3rem' }) => (
  <Skeleton height={size} width={size} rounded />
);

export default Skeleton;
