import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminSettingsService } from '../../services/adminSettings.service';


import { palette } from '../../styles/adminTheme';
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

const WarnBox = styled.div`
  padding: 0.75rem 1rem;
  background: ${palette.dangerSoft};
  color: ${palette.danger};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  margin-top: 0.75rem;
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
const AmtInput = styled.input<{ $warn?: boolean }>`
  width: 5.5rem;
  padding: 0.4375rem 0.625rem;
  border: 1px solid ${({ $warn }) => ($warn ? palette.danger : palette.border)};
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
  color: ${palette.onAccent};
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
  grid-template-columns: minmax(5rem, max-content) 1fr auto;
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
  justify-self: start;
  white-space: nowrap;
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

// Overlay for low-threshold confirmation
const OverlayBackdrop = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
`;
const DialogBox = styled.div`
  background: ${palette.surface};
  border-radius: 0.75rem;
  padding: 1.5rem;
  max-width: 26rem;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
`;
const DialogTitle = styled.h3`font-size: 1rem; font-weight: 700; color: ${palette.danger}; margin: 0 0 0.5rem;`;
const DialogBody = styled.p`font-size: 0.875rem; color: ${palette.textMuted}; margin: 0 0 1.25rem;`;
const DialogActions = styled.div`display: flex; gap: 0.75rem; justify-content: flex-end;`;
const CancelBtn = styled.button`
  padding: 0.5rem 1rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  background: ${palette.surface};
  font-size: 0.875rem; cursor: pointer;
  &:hover { background: ${palette.bg}; }
`;
const ConfirmBtn = styled.button`
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.5rem;
  background: ${palette.danger};
  color: ${palette.onAccent};
  font-size: 0.875rem; font-weight: 600; cursor: pointer;
  &:hover { opacity: 0.9; }
`;

const PLANS = [
  { key: 'BASIC'   as const, name: 'Basic',              hint: 'Абонати с Basic план',              accent: palette.info, color: palette.info },
  { key: 'PREMIUM' as const, name: 'Premium месечен',    hint: 'Premium месечен абонамент',          accent: palette.accent, color: palette.accent },
  { key: 'LIGHT'   as const, name: 'Premium седмичен',   hint: 'Premium седмичен абонамент',         accent: palette.success, color: palette.success },
] as const;

type Plan = 'BASIC' | 'PREMIUM' | 'LIGHT';

// Correct seed values: BASIC 20 EUR, PREMIUM 15 EUR, LIGHT 10 EUR × 1.95583 BGN/EUR
const SEED_DEFAULTS: Record<Plan, string> = { BASIC: '39.12', PREMIUM: '29.34', LIGHT: '19.56' };

// Warn and require confirmation when any threshold drops below this floor
const LOW_THRESHOLD_FLOOR = 5;

export default function AdminSettingsThresholdsPage() {
  const queryClient = useQueryClient();
  const [amounts, setAmounts] = useState<Record<Plan, string>>(SEED_DEFAULTS);
  const [notes, setNotes] = useState('');
  const [pendingSave, setPendingSave] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-payout-thresholds'],
    queryFn: () => adminSettingsService.getPayoutThresholds(),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['admin-payout-thresholds-history'],
    queryFn: () => adminSettingsService.getPayoutThresholdsHistory(),
  });

  useEffect(() => {
    if (!data?.data) return;
    setAmounts({
      BASIC:   String(data.data.BASIC?.minAmount   ?? SEED_DEFAULTS.BASIC),
      PREMIUM: String(data.data.PREMIUM?.minAmount ?? SEED_DEFAULTS.PREMIUM),
      LIGHT:   String(data.data.LIGHT?.minAmount   ?? SEED_DEFAULTS.LIGHT),
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
      toast.success('Прагове за изплащане запазени');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['admin-payout-thresholds'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payout-thresholds-history'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Неуспешно запазване';
      toast.error(msg);
    },
  });

  const handleSaveClick = () => {
    const hasInvalid = PLANS.some((p) => {
      const val = parseFloat(amounts[p.key]);
      return isNaN(val) || val < 0;
    });
    if (hasInvalid) {
      toast.error('Всички прагове трябва да са валидни числа ≥ 0');
      return;
    }
    const hasLow = PLANS.some((p) => parseFloat(amounts[p.key]) < LOW_THRESHOLD_FLOOR);
    if (hasLow) {
      setPendingSave(true);
    } else {
      saveMutation.mutate();
    }
  };

  const doSave = () => {
    saveMutation.mutate();
    setPendingSave(false);
  };

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('bg-BG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

  const historyRows = historyData?.data ?? [];

  const lowPlans = PLANS.filter((p) => {
    const val = parseFloat(amounts[p.key]);
    return !isNaN(val) && val < LOW_THRESHOLD_FLOOR;
  });

  return (
    <PageShell>
      {pendingSave && (
        <OverlayBackdrop>
          <DialogBox>
            <DialogTitle>Много нисък праг</DialogTitle>
            <DialogBody>
              {lowPlans.map((p) => p.name).join(', ')} {lowPlans.length > 1 ? 'са зададени' : 'е зададен'} под {LOW_THRESHOLD_FLOOR} лв.
              Това ще позволи на абонатите да поискат изплащане почти веднага. Сигурни ли сте?
            </DialogBody>
            <DialogActions>
              <CancelBtn onClick={() => setPendingSave(false)}>Откажи</CancelBtn>
              <ConfirmBtn onClick={doSave} disabled={saveMutation.isPending}>Запази въпреки това</ConfirmBtn>
            </DialogActions>
          </DialogBox>
        </OverlayBackdrop>
      )}

      <PageHeader>
        <Eyebrow>Настройки</Eyebrow>
        <PageTitle>Прагове за изплащане</PageTitle>
        <PageSubtitle>
          Минимален изчистен кешбек баланс (лв.), необходим за изплащане, по абонаментен план.
        </PageSubtitle>
      </PageHeader>

      <InfoBox>
        Праговете се прилагат при подаване на заявка за изплащане. Абонати с изчистен баланс под
        прага на плана си не могат да въведат IBAN за плащане, докато не го достигнат. Промените
        влизат в сила незабавно за нови заявки.
      </InfoBox>

      <Grid>
        <Card>
          <CardTitle>Текущи прагове</CardTitle>
          <CardSubtitle>Редактирайте сумите и запазете. Всяко запазване е версионирано.</CardSubtitle>

          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
          ) : (
            <PlanGrid>
              {PLANS.map((plan) => {
                const val = parseFloat(amounts[plan.key]);
                const isLow = !isNaN(val) && val < LOW_THRESHOLD_FLOOR;
                return (
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
                        $warn={isLow}
                        value={amounts[plan.key]}
                        onChange={(e) =>
                          setAmounts((prev) => ({ ...prev, [plan.key]: e.target.value }))
                        }
                      />
                      {/* BC-QA-031 — DELIBERATELY still `лв.`, and NOT a missed
                          relabel. This surface's read and write paths disagree
                          about units after the branch's backend changes:
                            • GET  /api/admin/settings/payout-thresholds returns
                              `minAmount` through bgnToEur()   → EUR
                            • PUT  /api/admin/settings/payout-thresholds stores
                              the submitted number verbatim
                              (`minAmount: Math.round(amount * 100) / 100`) → BGN
                          The input is seeded from the GET value, so saving an
                          untouched form already rewrites each threshold at ~51%
                          of its previous value. Relabelling this to `€` would
                          make the label lie about the WRITE instead of the READ
                          and would not fix anything; converting in the frontend
                          would reintroduce exactly the dual-currency conversion
                          layer BC-QA-031 deleted. The fix belongs in
                          adminSettings.routes.ts (accept EUR and convert on the
                          way in, or stop converting on the way out) — reported
                          as a caveat on the BC-QA-031 r5-F1 fix pass.
                          SEED_DEFAULTS above (39.12 / 29.34 / 19.56) are the
                          BGN seed values, which is the other half of the same
                          incoherence. */}
                      <Currency>лв.</Currency>
                    </InputRow>
                  </PlanRow>
                );
              })}
            </PlanGrid>
          )}

          {lowPlans.length > 0 && (
            <WarnBox>
              Внимание: {lowPlans.map((p) => p.name).join(', ')} {lowPlans.length > 1 ? 'са под' : 'е под'} препоръчителния минимум
              от {LOW_THRESHOLD_FLOOR} лв. Абонатите ще могат да поискат изплащане почти веднага.
            </WarnBox>
          )}

          <NotesRow>
            <NotesInput
              placeholder="По желание: причина за промяната…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <SaveBtn onClick={handleSaveClick} disabled={saveMutation.isPending || isLoading}>
              {saveMutation.isPending ? 'Запазване…' : 'Запази'}
            </SaveBtn>
          </NotesRow>
        </Card>

        <Card>
          <CardTitle>Скорошни промени</CardTitle>
          <CardSubtitle>Пълна история на промените по план, от най-новото.</CardSubtitle>
          <HistoryList>
            {historyLoading && (
              <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
            )}
            {!historyLoading && historyRows.length === 0 && (
              <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Няма история.</p>
            )}
            {historyRows.map((row) => {
              const plan = PLANS.find((p) => p.key === row.plan);
              return (
                <HistoryItem key={row.id}>
                  <PlanBadge $color={plan?.color ?? palette.textMuted}>{plan?.name ?? row.plan}</PlanBadge>
                  <div style={{ color: palette.textMuted }}>
                    {/* BC-QA-031: GET /api/admin/settings/payout-thresholds/history
                        runs each stored `minAmount` through bgnToEur() before
                        responding (adminSettings.routes.ts), so every history row
                        is EUR. This is a read-only render of that converted value.
                        NOTE: the EDITOR above is deliberately still labelled `лв.` —
                        see the comment there; its write path is not EUR. */}
                    <strong style={{ color: palette.text }}>€{row.minAmount}</strong>
                    {row.notes && (
                      <div style={{ fontSize: '0.75rem', color: palette.textSubtle, marginTop: '0.125rem' }}>
                        {row.notes}
                      </div>
                    )}
                    {(row.createdByName || row.createdByEmail) && (
                      <div style={{ fontSize: '0.72rem', color: palette.textSubtle, marginTop: '0.1rem' }}>
                        от {row.createdByName || row.createdByEmail}
                      </div>
                    )}
                  </div>
                  <HistoryDate>{fmt(row.createdAt)}</HistoryDate>
                </HistoryItem>
              );
            })}
          </HistoryList>
        </Card>
      </Grid>
    </PageShell>
  );
}
