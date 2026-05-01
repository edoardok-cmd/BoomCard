import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminSettingsService } from '../../services/adminSettings.service';

const palette = {
  bg: '#faf9f5',
  surface: '#ffffff',
  border: '#e8e5dc',
  text: '#141413',
  textMuted: '#605a50',
  textSubtle: '#8c8678',
  accent: '#c96442',
  accentSoft: '#f3e8de',
  info: '#2563eb',
  infoSoft: '#dbeafe',
  amber: '#92400e',
  amberSoft: '#fef3c7',
};

const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
`;
const PageHeader = styled.div`margin-bottom: 2rem;`;
const Eyebrow = styled.p`
  font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;
`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;

const InfoBox = styled.div`
  padding: 0.75rem 1rem;
  background: ${palette.infoSoft};
  color: ${palette.info};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  margin-bottom: 1.5rem;
  max-width: 50rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  max-width: 56rem;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
`;
const CardTitle = styled.h2`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0 0 0.25rem;`;
const CardSubtitle = styled.p`font-size: 0.8125rem; color: ${palette.textMuted}; margin: 0 0 1.25rem;`;

const PlanGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
`;

const PlanRow = styled.div<{ $accent: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border: 1px solid ${palette.border};
  border-left: 3px solid ${({ $accent }) => $accent};
  border-radius: 0.5rem;
  background: ${palette.bg};
`;
const PlanLabel = styled.div``;
const PlanName = styled.span<{ $color: string }>`
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: ${({ $color }) => $color};
  display: block;
`;
const PlanHint = styled.span`font-size: 0.75rem; color: ${palette.textSubtle};`;
const InputRow = styled.div`display: flex; align-items: center; gap: 0.375rem;`;
const AmtInput = styled.input`
  width: 5.5rem;
  padding: 0.4375rem 0.625rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 700;
  background: ${palette.surface};
  color: ${palette.text};
  text-align: right;
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;
const Currency = styled.span`font-size: 0.8125rem; font-weight: 600; color: ${palette.textSubtle};`;

const NotesRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.25rem;
`;
const NotesInput = styled.input`
  flex: 1;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  &:focus { border-color: ${palette.accent}; }
  &::placeholder { color: ${palette.textSubtle}; }
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
  white-space: nowrap;
  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const HistoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 22rem;
  overflow-y: auto;
`;
const HistoryItem = styled.div`
  display: grid;
  grid-template-columns: 5rem 1fr auto;
  align-items: start;
  gap: 0.625rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  background: ${palette.bg};
  font-size: 0.8125rem;
`;
const PlanBadge = styled.span<{ $color: string }>`
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: ${palette.amberSoft};
  color: ${({ $color }) => $color};
`;
const HistoryDate = styled.span`font-size: 0.75rem; color: ${palette.textSubtle}; white-space: nowrap;`;

const PLANS = [
  { key: 'BASIC'   as const, name: 'Basic',   hint: 'Basic plan subscribers', accent: '#2563eb', color: '#2563eb' },
  { key: 'PREMIUM' as const, name: 'Premium', hint: 'Premium (monthly/weekly)', accent: '#c96442', color: '#c96442' },
  { key: 'LIGHT'   as const, name: 'Light',   hint: 'Light (Paysera weekly)', accent: '#4a7c59', color: '#4a7c59' },
] as const;

type Plan = 'BASIC' | 'PREMIUM' | 'LIGHT';

export default function AdminSettingsThresholdsPage() {
  const queryClient = useQueryClient();
  const [amounts, setAmounts] = useState<Record<Plan, string>>({ BASIC: '39.10', PREMIUM: '19.56', LIGHT: '29.34' });
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-payout-thresholds'],
    queryFn: () => adminSettingsService.getPayoutThresholds(),
  });

  useEffect(() => {
    if (!data?.data) return;
    setAmounts({
      BASIC:   String(data.data.BASIC?.minAmount   ?? ''),
      PREMIUM: String(data.data.PREMIUM?.minAmount ?? ''),
      LIGHT:   String(data.data.LIGHT?.minAmount   ?? ''),
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminSettingsService.savePayoutThresholds(
        {
          BASIC:   parseFloat(amounts.BASIC),
          PREMIUM: parseFloat(amounts.PREMIUM),
          LIGHT:   parseFloat(amounts.LIGHT),
        },
        notes || undefined,
      ),
    onSuccess: () => {
      toast.success('Payout thresholds saved');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['admin-payout-thresholds'] });
    },
    onError: () => toast.error('Failed to save'),
  });

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

  // Flatten history from the response (each plan has its own updatedAt — build a simple audit list)
  const historyRows = data?.data
    ? PLANS.flatMap((p) => {
        const entry = data.data[p.key];
        if (!entry?.updatedAt) return [];
        return [{ plan: p.key, color: p.color, amount: entry.minAmount, notes: entry.notes, updatedAt: entry.updatedAt }];
      }).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    : [];

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Settings</Eyebrow>
        <PageTitle>Payout Thresholds</PageTitle>
        <PageSubtitle>
          Minimum cashback balance (BGN) a subscriber must reach before requesting a payout, per plan.
        </PageSubtitle>
      </PageHeader>

      <InfoBox>
        Thresholds are enforced at payout-request time. Subscribers whose cleared balance is below
        their plan's threshold cannot submit an IBAN for payment until it is met. Changes take
        effect immediately for new payout requests.
      </InfoBox>

      <Grid>
        <Card>
          <CardTitle>Current thresholds</CardTitle>
          <CardSubtitle>Edit amounts and save. Each save is versioned.</CardSubtitle>

          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Loading…</p>
          ) : (
            <PlanGrid>
              {PLANS.map((plan) => (
                <PlanRow key={plan.key} $accent={plan.accent}>
                  <PlanLabel>
                    <PlanName $color={plan.color}>{plan.name}</PlanName>
                    <PlanHint>{plan.hint}</PlanHint>
                  </PlanLabel>
                  <InputRow>
                    <AmtInput
                      type="number"
                      min="0"
                      max="10000"
                      step="0.01"
                      value={amounts[plan.key]}
                      onChange={(e) =>
                        setAmounts((prev) => ({ ...prev, [plan.key]: e.target.value }))
                      }
                    />
                    <Currency>BGN</Currency>
                  </InputRow>
                </PlanRow>
              ))}
            </PlanGrid>
          )}

          <NotesRow>
            <NotesInput
              placeholder="Optional: reason for this change…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <SaveBtn onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </SaveBtn>
          </NotesRow>
        </Card>

        <Card>
          <CardTitle>Recent changes</CardTitle>
          <CardSubtitle>Last saved threshold values per plan.</CardSubtitle>
          <HistoryList>
            {historyRows.length === 0 && (
              <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>No history yet.</p>
            )}
            {historyRows.map((row, i) => (
              <HistoryItem key={i}>
                <PlanBadge $color={row.color}>{row.plan}</PlanBadge>
                <div style={{ color: palette.textMuted }}>
                  <strong style={{ color: palette.text }}>{row.amount} BGN</strong>
                  {row.notes && (
                    <div style={{ fontSize: '0.75rem', color: palette.textSubtle, marginTop: '0.125rem' }}>
                      {row.notes}
                    </div>
                  )}
                </div>
                <HistoryDate>{fmt(row.updatedAt)}</HistoryDate>
              </HistoryItem>
            ))}
          </HistoryList>
        </Card>
      </Grid>
    </PageShell>
  );
}
