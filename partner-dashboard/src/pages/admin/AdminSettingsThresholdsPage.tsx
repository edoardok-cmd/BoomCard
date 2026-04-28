import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminSettingsService, CashbackRate } from '../../services/adminSettings.service';

/* ─── Palette ─────────────────────────────────────────────────────────────── */
const palette = {
  bg: '#faf9f5',
  surface: '#ffffff',
  border: '#e8e5dc',
  text: '#141413',
  textMuted: '#605a50',
  textSubtle: '#8c8678',
  accent: '#c96442',
  accentSoft: '#f3e8de',
  success: '#4a7c59',
  successSoft: '#e6efe3',
  amber: '#92400e',
  amberSoft: '#fef3c7',
  info: '#2563eb',
  infoSoft: '#dbeafe',
};

/* ─── Layout ───────────────────────────────────────────────────────────────── */
const PageShell = styled.div`
  background: ${palette.bg};
  min-height: calc(100vh - 4rem);
  padding: 2rem 2.5rem;
`;
const PageHeader = styled.div`
  margin-bottom: 2rem;
`;
const Eyebrow = styled.p`
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${palette.textSubtle};
  margin-bottom: 0.25rem;
`;
const PageTitle = styled.h1`
  font-size: 1.75rem;
  font-weight: 800;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;
const PageSubtitle = styled.p`
  font-size: 0.9375rem;
  color: ${palette.textMuted};
  margin: 0;
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;
const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
`;
const CardTitle = styled.h2`
  font-size: 1rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;
const CardSubtitle = styled.p`
  font-size: 0.8125rem;
  color: ${palette.textMuted};
  margin: 0 0 1.25rem;
`;

/* ─── Rate table ─────────────────────────────────────────────────────────── */
const RateTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;
const Th = styled.th`
  text-align: left;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid ${palette.border};
`;
const Td = styled.td`
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid ${palette.border};
  font-size: 0.875rem;
  color: ${palette.textMuted};
  &:last-child { border-bottom: none; }
`;
const StepLabel = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.375rem;
  background: ${palette.accentSoft};
  color: ${palette.accent};
  font-size: 0.8125rem;
  font-weight: 700;
`;
const RateInput = styled.input`
  width: 5rem;
  padding: 0.375rem 0.625rem;
  border: 1px solid ${palette.border};
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  text-align: right;
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;
const NotesInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  box-sizing: border-box;
  outline: none;
  &:focus { border-color: ${palette.accent}; }
  &::placeholder { color: ${palette.textSubtle}; }
`;
const NotesRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
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

/* ─── History ─────────────────────────────────────────────────────────────── */
const HistoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  max-height: 22rem;
  overflow-y: auto;
`;
const HistoryRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  background: ${palette.bg};
`;
const HistoryStep = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 1.5rem;
  border-radius: 0.25rem;
  background: ${palette.amberSoft};
  color: ${palette.amber};
  font-size: 0.75rem;
  font-weight: 700;
`;
const HistoryRates = styled.div`
  flex: 1;
  font-size: 0.8125rem;
  color: ${palette.textMuted};
`;
const HistoryDate = styled.div`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  white-space: nowrap;
`;

const STEPS = [5, 10, 15, 20, 25];

type RateRow = { discountStep: number; basic: string; premium: string };

function rateFromServer(r: CashbackRate | null, step: number): RateRow {
  return {
    discountStep: step,
    basic: r ? String(r.basic) : '',
    premium: r ? String(r.premium) : '',
  };
}

export default function AdminSettingsThresholdsPage() {
  const queryClient = useQueryClient();

  const { data: ratesData, isLoading } = useQuery({
    queryKey: ['admin-cashback-rates'],
    queryFn: () => adminSettingsService.getCashbackRates(),
  });

  const { data: historyData } = useQuery({
    queryKey: ['admin-cashback-rates-history'],
    queryFn: () => adminSettingsService.getCashbackRateHistory(),
  });

  const [rows, setRows] = useState<RateRow[]>(
    STEPS.map((s) => ({ discountStep: s, basic: '', premium: '' }))
  );
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!ratesData?.data) return;
    setRows(
      STEPS.map((step, i) => rateFromServer(ratesData.data[i] ?? null, step))
    );
  }, [ratesData]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const rates = rows.map((r) => ({
        discountStep: r.discountStep,
        basic: parseFloat(r.basic) || 0,
        premium: parseFloat(r.premium) || 0,
      }));
      return adminSettingsService.saveCashbackRates(rates, notes || undefined);
    },
    onSuccess: () => {
      toast.success('Cashback rates saved');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-rates'] });
      queryClient.invalidateQueries({ queryKey: ['admin-cashback-rates-history'] });
    },
    onError: () => toast.error('Failed to save rates'),
  });

  const updateRow = (step: number, field: 'basic' | 'premium', val: string) => {
    setRows((prev) =>
      prev.map((r) => (r.discountStep === step ? { ...r, [field]: val } : r))
    );
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Settings</Eyebrow>
        <PageTitle>Cashback Rate Thresholds</PageTitle>
        <PageSubtitle>
          Set the cashback % subscribers earn per partner discount step. Changes are versioned and take effect immediately.
        </PageSubtitle>
      </PageHeader>

      <Grid>
        <Card>
          <CardTitle>Rate Matrix</CardTitle>
          <CardSubtitle>
            Each row corresponds to a partner discount step (5–25%). Enter the cashback % each card tier earns.
          </CardSubtitle>
          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Loading…</p>
          ) : (
            <>
              <RateTable>
                <thead>
                  <tr>
                    <Th>Discount step</Th>
                    <Th>Basic %</Th>
                    <Th>Premium %</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.discountStep}>
                      <Td><StepLabel>{row.discountStep}%</StepLabel></Td>
                      <Td>
                        <RateInput
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={row.basic}
                          onChange={(e) => updateRow(row.discountStep, 'basic', e.target.value)}
                        />
                      </Td>
                      <Td>
                        <RateInput
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={row.premium}
                          onChange={(e) => updateRow(row.discountStep, 'premium', e.target.value)}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </RateTable>
              <NotesRow>
                <NotesInput
                  placeholder="Optional: reason for this rate change…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <SaveBtn
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save rates'}
                </SaveBtn>
              </NotesRow>
            </>
          )}
        </Card>

        <Card>
          <CardTitle>Rate History</CardTitle>
          <CardSubtitle>Last 20 saved rate snapshots, newest first.</CardSubtitle>
          <HistoryList>
            {!historyData?.data?.length && (
              <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>No history yet.</p>
            )}
            {historyData?.data?.map((r) => (
              <HistoryRow key={r.id}>
                <HistoryStep>{r.discountStep}%</HistoryStep>
                <HistoryRates>
                  Basic <strong>{r.basic}%</strong> · Premium <strong>{r.premium}%</strong>
                  {r.notes && (
                    <div style={{ marginTop: '0.125rem', color: palette.textSubtle }}>{r.notes}</div>
                  )}
                </HistoryRates>
                <HistoryDate>{fmt(r.createdAt)}</HistoryDate>
              </HistoryRow>
            ))}
          </HistoryList>
        </Card>
      </Grid>
    </PageShell>
  );
}
