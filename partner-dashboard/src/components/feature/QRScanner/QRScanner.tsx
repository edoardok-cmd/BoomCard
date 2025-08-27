import React from 'react';
import { StyledQRScanner } from './QRScanner.styles';

export interface QRScannerProps {
  children?: React.ReactNode;
  className?: string;
}

export const QRScanner: React.FC<QRScannerProps> = ({
  children,
  className
}) => {
  return (
    <StyledQRScanner className={className}>
      {children}
    </StyledQRScanner>
  );
};

export default QRScanner;