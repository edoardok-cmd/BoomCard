import React from 'react';
import { StyledModal } from './Modal.styles';

export interface ModalProps {
  children?: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  children,
  className
}) => {
  return (
    <StyledModal className={className}>
      {children}
    </StyledModal>
  );
};

export default Modal;