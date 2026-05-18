import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminSettingsService } from '../../services/adminSettings.service';
import { latestMeta, formatAuditStamp } from '../../utils/systemSettingsAudit';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  info: '#2563eb', infoSoft: '#dbeafe',
  amber: '#92400e', amberSoft: '#fef3c7',
};

const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`margin-bottom: 2rem;`;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  max-width: 56rem;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const CardTitle = styled.h2`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0 0 0.25rem;`;
const CardSubtitle = styled.p`font-size: 0.8125rem; color: ${palette.textMuted}; margin: 0 0 1.25rem;`;

const FieldGroup = styled.div`display: flex; flex-direction: column; gap: 1.25rem; margin-bottom: 1.5rem;`;
const FieldLabel = styled.label`font-size: 0.875rem; font-weight: 600; color: ${palette.textMuted}; display: block; margin-bottom: 0.375rem;`;
const FieldHint = styled.p`font-size: 0.8rem; color: ${palette.textSubtle}; margin: 0.25rem 0 0;`;
const ResetLink = styled.button`
  background: none; border: none; padding: 0; font-size: 0.8rem; font-weight: 600;
  color: ${palette.accent}; cursor: pointer; margin-left: 0.375rem;
  &:hover { text-decoration: underline; }
`;
const NumberInput = styled.input`
  width: 8rem; padding: 0.5rem 0.75rem; border: 1px solid ${palette.border};
  border-radius: 0.5rem; font-size: 0.875rem; background: ${palette.bg}; color: ${palette.text}; outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;
const NotesInput = styled.input`
  width: 100%; box-sizing: border-box; padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border}; border-radius: 0.5rem; font-size: 0.875rem;
  background: ${palette.bg}; color: ${palette.text}; outline: none;
  &:focus { border-color: ${palette.accent}; }
  &::placeholder { color: ${palette.textSubtle}; }
`;
const SaveBtn = styled.button`
  padding: 0.5625rem 1.25rem; background: ${palette.accent}; color: #fff; border: none;
  border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer;
  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: default; }
`;
const CardFooter = styled.div`
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
  gap: 0.5rem; margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid ${palette.border};
`;
const AuditStamp = styled.p`font-size: 0.75rem; color: ${palette.textSubtle}; margin: 0;`;
const InfoBox = styled.div`
  padding: 0.75rem 1rem; background: ${palette.infoSoft}; color: ${palette.info};
  border-radius: 0.5rem; font-size: 0.8125rem; margin-bottom: 1.25rem;
`;

// History
const HistoryList = styled.div`display: flex; flex-direction: column; gap: 0.5rem; max-height: 24rem; overflow-y: auto;`;
const HistoryItem = styled.div`
  display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 0.625rem;
  padding: 0.625rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem;
  background: ${palette.bg}; font-size: 0.8125rem;
`;
const KeyBadge = styled.span`
  display: inline-block; padding: 0.1rem 0.45rem; border-radius: 0.25rem;
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  background: ${palette.amberSoft}; color: ${palette.amber};
`;
const HistoryDate = styled.span`font-size: 0.75rem; color: ${palette.textSubtle}; white-space: nowrap;`;

const VALIDITY_KEY_LABELS: Record<string, string> = {
  cashback_expiry_days: 'Кешбек (дни)',
  offer_validity_days:  'Оферта (дни)',
};

const DEFAULT_CASHBACK_EXPIRY_DAYS = 60;
const DEFAULT_OFFER_VALIDITY_DAYS = 90;

const VALIDITY_KEYS = ['cashback_expiry_days', 'offer_validity_days'];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('bg-BG', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminSettingsValidityPage() {
  const queryClient = useQueryClient();
  const [cashbackDays, setCashbackDays] = useState(String(DEFAULT_CASHBACK_EXPIRY_DAYS));
  const [offerDays, setOfferDays] = useState(String(DEFAULT_OFFER_VALIDITY_DAYS));
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-system-settings'],
    queryFn: () => adminSettingsService.getSystemSettings(),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['admin-validity-history'],
    queryFn: () => adminSettingsService.getSystemSettingsHistory(VALIDITY_KEYS),
  });

  const meta = data?.meta ?? {};
  const auditStamp = formatAuditStamp(
    latestMeta(['cashback_expiry_days', 'offer_validity_days'], meta)
  );

  useEffect(() => {
    if (!data?.data) return;
    if (data.data.cashback_expiry_days !== undefined) setCashbackDays(data.data.cashback_expiry_days);
    if (data.data.offer_validity_days !== undefined) setOfferDays(data.data.offer_validity_days);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: ({ settings, notes }: { settings: { cashback_expiry_days: string; offer_validity_days: string }; notes: string }) =>
      adminSettingsService.saveSystemSettings(settings, notes),
    onSuccess: () => {
      toast.success('Настройките за валидност са запазени');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['admin-system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin-validity-history'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Грешка при запазване';
      toast.error(msg);
    },
  });

  const handleSave = () => {
    const cb = Number(cashbackDays);
    const of = Number(offerDays);
    if (!Number.isInteger(cb) || cb < 1 || cb > 3650) {
      toast.error('Изтичане на кешбек трябва да е цяло число между 1 и 3650');
      return;
    }
    if (!Number.isInteger(of) || of < 1 || of > 3650) {
      toast.error('Валидност на оферта трябва да е цяло число между 1 и 3650');
      return;
    }
    saveMutation.mutate({
      settings: { cashback_expiry_days: String(cb), offer_validity_days: String(of) },
      notes,
    });
  };

  // API now filters by VALIDITY_KEYS server-side; no client-side filter needed.
  const validityHistoryRows = historyData?.data ?? [];

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Настройки</Eyebrow>
        <PageTitle>Валидност</PageTitle>
        <PageSubtitle>Конфигурирайте колко дни кешбекът и офертите остават валидни.</PageSubtitle>
      </PageHeader>

      <Grid>
        <Card>
          <InfoBox>
            Промените важат само за новоспечелен кешбек и нови оферти — съществуващите записи не се влияят с обратна сила.
          </InfoBox>
          <CardTitle>Настройки за изтичане</CardTitle>
          <CardSubtitle>Всяко запазване е версионирано с преди и след.</CardSubtitle>
          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
          ) : (
            <FieldGroup>
              <div>
                <FieldLabel>Изтичане на кешбек (дни)</FieldLabel>
                <NumberInput
                  type="number" min="1" max="3650"
                  value={cashbackDays}
                  onChange={(e) => setCashbackDays(e.target.value)}
                />
                <FieldHint>
                  Колко дни след спечелване балансът изтича. Системно подразбиране: {DEFAULT_CASHBACK_EXPIRY_DAYS}.
                  {Number(cashbackDays) !== DEFAULT_CASHBACK_EXPIRY_DAYS && (
                    <ResetLink type="button" onClick={() => setCashbackDays(String(DEFAULT_CASHBACK_EXPIRY_DAYS))}>
                      Възстанови по подразбиране
                    </ResetLink>
                  )}
                </FieldHint>
              </div>
              <div>
                <FieldLabel>Валидност на оферта (дни)</FieldLabel>
                <NumberInput
                  type="number" min="1" max="3650"
                  value={offerDays}
                  onChange={(e) => setOfferDays(e.target.value)}
                />
                <FieldHint>
                  Стандартен прозорец на валидност за нови партньорски оферти. Системно подразбиране: {DEFAULT_OFFER_VALIDITY_DAYS}.
                  {Number(offerDays) !== DEFAULT_OFFER_VALIDITY_DAYS && (
                    <ResetLink type="button" onClick={() => setOfferDays(String(DEFAULT_OFFER_VALIDITY_DAYS))}>
                      Възстанови по подразбиране
                    </ResetLink>
                  )}
                </FieldHint>
              </div>
              <div>
                <FieldLabel htmlFor="validity-notes">Причина за промяната (по желание)</FieldLabel>
                <NotesInput
                  id="validity-notes"
                  placeholder="напр. Скъсяване на прозореца за по-бързо изтичане"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </FieldGroup>
          )}
          <CardFooter>
            <AuditStamp>{auditStamp}</AuditStamp>
            <SaveBtn onClick={handleSave} disabled={saveMutation.isPending || isLoading}>
              {saveMutation.isPending ? 'Запазване…' : 'Запази'}
            </SaveBtn>
          </CardFooter>
        </Card>

        <Card>
          <CardTitle>История на промените</CardTitle>
          <CardSubtitle>Пълна история с преди и след, от най-новото.</CardSubtitle>
          <HistoryList>
            {historyLoading && (
              <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
            )}
            {!historyLoading && validityHistoryRows.length === 0 && (
              <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Няма история.</p>
            )}
            {validityHistoryRows.map((row) => (
              <HistoryItem key={row.id}>
                <div>
                  <KeyBadge>{VALIDITY_KEY_LABELS[row.key] ?? row.key}</KeyBadge>
                  <div style={{ marginTop: '0.3rem', color: palette.text, fontSize: '0.8125rem' }}>
                    {row.oldValue !== null && row.oldValue !== ''
                      ? <><span style={{ color: palette.textSubtle }}>{row.oldValue}</span>{' → '}<strong>{row.newValue}</strong></>
                      : <strong>{row.newValue}</strong>
                    }
                    {' дни'}
                  </div>
                  {row.changedByName && (
                    <div style={{ fontSize: '0.72rem', color: palette.textSubtle, marginTop: '0.1rem' }}>
                      от {row.changedByName}
                    </div>
                  )}
                  {row.notes && (
                    <div style={{ fontSize: '0.72rem', color: palette.textMuted, marginTop: '0.2rem', fontStyle: 'italic' }}>
                      „{row.notes}"
                    </div>
                  )}
                </div>
                <HistoryDate>{fmtDate(row.createdAt)}</HistoryDate>
              </HistoryItem>
            ))}
          </HistoryList>
        </Card>
      </Grid>
    </PageShell>
  );
}
