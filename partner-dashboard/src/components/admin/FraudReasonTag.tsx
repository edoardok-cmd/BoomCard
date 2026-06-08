import styled from 'styled-components';
import { FRAUD_REASON_LABELS } from '../../types/fraud.types';
import { palette } from '../../styles/adminTheme';

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
        return `background: ${palette.dangerSoft}; color: ${palette.danger}; border: 1px solid ${palette.dangerBorder};`;
      case 'medium':
        return `background: ${palette.warningSoft}; color: ${palette.warning}; border: 1px solid ${palette.warningBorder};`;
      case 'low':
        return `background: ${palette.successSoft}; color: ${palette.success}; border: 1px solid ${palette.successBorder};`;
    }
  }}
`;

export default function FraudReasonTag({ reason, language = 'en' }: FraudReasonTagProps) {
  // Exact match first; fall back to prefix match for codes with payload suffixes
  // (e.g. "RAPID_SCANNING: 5 scans in 30 minutes" → looks up "RAPID_SCANNING").
  const info = FRAUD_REASON_LABELS[reason] ?? FRAUD_REASON_LABELS[reason.split(':')[0].trim()];

  if (!info) {
    return (
      <Tag $severity="medium" title={reason}>
        {reason}
      </Tag>
    );
  }

  const label = language === 'bg' ? info.labelBg : info.label;
  // For prefix codes, append the payload part so admins still see the detail.
  const suffix = !FRAUD_REASON_LABELS[reason] ? reason.split(':').slice(1).join(':').trim() : '';
  return (
    <Tag $severity={info.severity} title={reason}>
      {label}{suffix ? `: ${suffix}` : ''}
    </Tag>
  );
}
