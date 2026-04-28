import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminSettingsService } from '../../services/adminSettings.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  info: '#2563eb', infoSoft: '#dbeafe',
};

const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`margin-bottom: 2rem;`;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const Grid = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; @media (max-width: 900px) { grid-template-columns: 1fr; }`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const CardTitle = styled.h2`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0 0 1.25rem;`;
const FieldGroup = styled.div`display: flex; flex-direction: column; gap: 1.25rem; margin-bottom: 1.5rem;`;
const FieldLabel = styled.label`font-size: 0.875rem; font-weight: 600; color: ${palette.textMuted}; display: block; margin-bottom: 0.375rem;`;
const FieldHint = styled.p`font-size: 0.8rem; color: ${palette.textSubtle}; margin: 0.25rem 0 0;`;
const TextInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  box-sizing: border-box;
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;
const NumberInput = styled.input`
  width: 9rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;
const SaveBtn = styled.button`
  padding: 0.5625rem 1.25rem;
  background: ${palette.accent};
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

export default function AdminSettingsSystemPage() {
  const queryClient = useQueryClient();
  const [maxFraud, setMaxFraud] = useState('80');
  const [autoApprove, setAutoApprove] = useState('10');
  const [dailyLimit, setDailyLimit] = useState('');
  const [maxCashback, setMaxCashback] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportPhone, setSupportPhone] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-system-settings'],
    queryFn: () => adminSettingsService.getSystemSettings(),
  });

  useEffect(() => {
    if (!data?.data) return;
    if (data.data.max_fraud_score) setMaxFraud(data.data.max_fraud_score);
    if (data.data.auto_approve_threshold) setAutoApprove(data.data.auto_approve_threshold);
    if (data.data.daily_scan_limit_default) setDailyLimit(data.data.daily_scan_limit_default);
    if (data.data.max_cashback_per_month) setMaxCashback(data.data.max_cashback_per_month);
    if (data.data.support_email) setSupportEmail(data.data.support_email);
    if (data.data.support_phone) setSupportPhone(data.data.support_phone);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const settings: Record<string, string> = {
        max_fraud_score: maxFraud,
        auto_approve_threshold: autoApprove,
        support_email: supportEmail,
        support_phone: supportPhone,
      };
      if (dailyLimit) settings.daily_scan_limit_default = dailyLimit;
      if (maxCashback) settings.max_cashback_per_month = maxCashback;
      return adminSettingsService.saveSystemSettings(settings);
    },
    onSuccess: () => {
      toast.success('System settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-system-settings'] });
    },
    onError: () => toast.error('Failed to save'),
  });

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Settings</Eyebrow>
        <PageTitle>System</PageTitle>
        <PageSubtitle>Global fraud thresholds, scan limits, and support contact details.</PageSubtitle>
      </PageHeader>

      <Grid>
        <Card>
          <CardTitle>Fraud & Scan Limits</CardTitle>
          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Loading…</p>
          ) : (
            <FieldGroup>
              <div>
                <FieldLabel>Max fraud score (0–100)</FieldLabel>
                <NumberInput
                  type="number" min="0" max="100"
                  value={maxFraud}
                  onChange={(e) => setMaxFraud(e.target.value)}
                />
                <FieldHint>Receipts scoring above this are sent to MANUAL_REVIEW. Default: 80.</FieldHint>
              </div>
              <div>
                <FieldLabel>Auto-approve threshold (BGN)</FieldLabel>
                <NumberInput
                  type="number" min="0"
                  value={autoApprove}
                  onChange={(e) => setAutoApprove(e.target.value)}
                />
                <FieldHint>Receipts below this amount are auto-approved regardless of fraud score. Default: 10.</FieldHint>
              </div>
              <div>
                <FieldLabel>Daily scan limit (per venue)</FieldLabel>
                <NumberInput
                  type="number" min="1"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder="unlimited"
                />
                <FieldHint>Default max scans per user per venue per day. Leave blank for no limit.</FieldHint>
              </div>
              <div>
                <FieldLabel>Max cashback per month (BGN)</FieldLabel>
                <NumberInput
                  type="number" min="0"
                  value={maxCashback}
                  onChange={(e) => setMaxCashback(e.target.value)}
                  placeholder="unlimited"
                />
                <FieldHint>Cap on cashback a subscriber can earn in a calendar month. Leave blank for no limit.</FieldHint>
              </div>
            </FieldGroup>
          )}
        </Card>

        <Card>
          <CardTitle>Support Contact</CardTitle>
          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Loading…</p>
          ) : (
            <FieldGroup>
              <div>
                <FieldLabel>Support email</FieldLabel>
                <TextInput
                  type="email"
                  placeholder="support@boomcard.bg"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                />
                <FieldHint>Shown in mobile app and email footers.</FieldHint>
              </div>
              <div>
                <FieldLabel>Support phone</FieldLabel>
                <TextInput
                  type="tel"
                  placeholder="+359 2 …"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                />
                <FieldHint>Shown on the contact screen in the app.</FieldHint>
              </div>
            </FieldGroup>
          )}
        </Card>
      </Grid>

      <div style={{ marginTop: '1.5rem' }}>
        <SaveBtn onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
          {saveMutation.isPending ? 'Saving…' : 'Save all changes'}
        </SaveBtn>
      </div>
    </PageShell>
  );
}
