import React from 'react';
import styled from 'styled-components';
import { FRAUD_REASON_LABELS } from '../../types/fraud.types';

interface FraudReasonTagProps {
  reason: string;
  language?: 'en' | 'bg';
}

const Tag = styled.span<{ $severity: 'low' | 'medium' | 'high' }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;

  ${({ $severity }) => {
    switch ($severity) {
      case 'high':
        return 'background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;';
      case 'medium':
        return 'background: #fffbeb; color: #92400e; border: 1px solid #fde68a;';
      case 'low':
        return 'background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;';
    }
  }}
`;

export default function FraudReasonTag({ reason, language = 'en' }: FraudReasonTagProps) {
  const info = FRAUD_REASON_LABELS[reason];

  if (!info) {
    return (
      <Tag $severity="medium" title={reason}>
        {reason}
      </Tag>
    );
  }

  const label = language === 'bg' ? info.labelBg : info.label;
  return (
    <Tag $severity={info.severity} title={reason}>
      {label}
    </Tag>
  );
}
