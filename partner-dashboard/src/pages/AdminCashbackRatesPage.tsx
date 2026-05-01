import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Percent, History, Save, AlertCircle, Trash2, Check, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  adminCashbackService,
  CashbackRateRow,
  CurrentCashbackRate,
} from '../services/adminCashback.service';
import { DISCOUNT_STEPS } from '../utils/discountSteps';

const STEPS = DISCOUNT_STEPS;

// ── Styled ───────────────────────────────────────────────────────────
const Page = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 0.5rem 0;
  display: flex; align-items: center; gap: 0.75rem;
  svg { color: var(--color-text-secondary); }
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin: 0;
`;

const Section = styled.section`
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: 1rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
`;

const SectionTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 1rem 0;
  display: flex; align-items: center; gap: 0.5rem;
  svg { width: 18px; height: 18px; color: var(--color-text-secondary); }
`;

const Matrix = styled.div<{ $cols: string }>`
  display: grid;
  grid-template-columns: ${p => p.$cols};
  gap: 1px;
  background: var(--color-border);
  border-radius: 0.5rem;
  overflow: hidden;
`;

const Cell = styled.div<{ $header?: boolean; $muted?: boolean; $invalid?: boolean }>`
  background: ${p =>
    p.$header
      ? 'var(--color-background-secondary)'
      : p.$muted
        ? 'var(--color-background-secondary)'
        : 'var(--color-background)'};
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: ${p => p.$header ? 700 : 500};
  color: ${p =>
    p.$invalid
      ? '#dc2626'
      : p.$header || p.$muted
        ? 'var(--color-text-secondary)'
        : 'var(--color-text-primary)'};
  border: ${p => p.$invalid ? '2px solid #fca5a5' : 'none'};
  position: relative;
`;

const ColHint = styled.span`
  font-size: 0.65rem;
  font-weight: 400;
  color: var(--color-text-secondary);
  display: block;
  margin-top: 0.1rem;
  line-height: 1.2;
`;

const NumberInput = styled.input<{ $invalid?: boolean }>`
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 1.5px solid ${p => p.$invalid ? '#dc2626' : 'var(--color-border)'};
  border-radius: 0.375rem;
  background: ${p => p.$invalid ? '#fff1f2' : 'var(--color-background)'};
  color: ${p => p.$invalid ? '#dc2626' : 'var(--color-text-primary)'};
  font-size: 0.875rem;
  font-weight: 600;
  &:focus { outline: none; border-color: ${p => p.$invalid ? '#dc2626' : '#000'}; }
`;

const InvalidHint = styled.div`
  font-size: 0.65rem;
  color: #dc2626;
  margin-top: 0.2rem;
  font-weight: 600;
`;

const FormRow = styled.div`
  display: flex; gap: 0.75rem; align-items: flex-end;
  flex-wrap: wrap;
  margin-top: 1rem;
`;

const Field = styled.div`
  display: flex; flex-direction: column; gap: 0.25rem;
  flex: 1; min-width: 180px;
`;

const Label = styled.label`
  font-size: 0.75rem; font-weight: 600;
  color: var(--color-text-secondary);
`;

const FieldHint = styled.span`
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  font-weight: 400;
  margin-left: 0.3rem;
`;

const TextInput = styled.input`
  padding: 0.5rem 0.75rem;
  border: 1.5px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  &:focus { outline: none; border-color: #000; }
`;

const SaveBtn = styled.button`
  padding: 0.625rem 1.25rem;
  background: #10b981;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  display: flex; align-items: center; gap: 0.5rem;
  &:hover:not(:disabled) { filter: brightness(1.1); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  svg { width: 14px; height: 14px; }
`;

const ConfirmPanel = styled.div`
  margin-top: 1rem;
  border: 2px solid #10b981;
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  background: #f0fdf4;
`;

const ConfirmTitle = styled.p`
  margin: 0 0 0.75rem 0;
  font-weight: 700;
  font-size: 0.9rem;
  color: #065f46;
`;

const ConfirmMeta = styled.p`
  margin: 0 0 0.75rem 0;
  font-size: 0.8rem;
  color: #065f46;
`;

const ConfirmActions = styled.div`
  display: flex; gap: 0.5rem; margin-top: 0.75rem;
`;

const ConfirmBtn = styled.button`
  padding: 0.5rem 1rem;
  background: #10b981;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  display: flex; align-items: center; gap: 0.4rem;
  &:hover:not(:disabled) { filter: brightness(1.1); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  svg { width: 14px; height: 14px; }
`;

const CancelBtn = styled.button`
  padding: 0.5rem 1rem;
  background: transparent;
  color: #374151;
  border: 1.5px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  display: flex; align-items: center; gap: 0.4rem;
  &:hover { background: var(--color-background-secondary); }
  svg { width: 14px; height: 14px; }
`;

const Error = styled.div`
  background: #fee2e2; color: #991b1b;
  padding: 0.625rem 0.875rem; border-radius: 0.5rem;
  font-size: 0.85rem; font-weight: 600;
  display: flex; align-items: center; gap: 0.5rem;
  margin-top: 0.75rem;
  svg { width: 15px; height: 15px; }
`;

const HistoryTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  th, td {
    padding: 0.625rem 0.875rem;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }
  th {
    font-weight: 700;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    background: var(--color-background-secondary);
  }
  td { color: var(--color-text-primary); }
  .muted { color: var(--color-text-secondary); }
`;

const ScheduledBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  border-radius: 0.375rem;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  margin-left: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const DeleteSnapshotBtn = styled.button`
  margin-left: 0.75rem;
  padding: 0.15rem 0.5rem;
  background: transparent;
  color: #dc2626;
  border: 1px solid #fca5a5;
  border-radius: 0.375rem;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 0.25rem;
  &:hover { background: #fee2e2; }
  svg { width: 11px; height: 11px; }
`;

const Toast = styled.div<{ $ok: boolean }>`
  position: fixed; top: 1.5rem; right: 1.5rem; z-index: 2000;
  background: ${p => p.$ok ? '#10b981' : '#dc2626'};
  color: #fff;
  padding: 0.75rem 1.5rem;
  border-radius: 0.75rem;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
`;

// ── i18n ──────────────────────────────────────────────────────────────
const t = (lang: 'en' | 'bg') => ({
  title:            lang === 'bg' ? 'Кешбек ставки' : 'Cashback Rates',
  subtitle:         lang === 'bg'
    ? 'Управлявайте матрицата кешбек % на стъпка отстъпка. Всяка нова версия е самостоятелен снимък — всичките 5 стъпки са задължителни. Стойностите не могат да надвишават % на партньорската отстъпка за съответната стъпка.'
    : 'Manage the cashback % matrix per discount step. Every new version is a self-contained snapshot — all 5 steps are required. Values cannot exceed the partner discount % for that step.',
  currentTitle:     lang === 'bg' ? 'Текущи действащи ставки' : 'Currently effective rates',
  newTitle:         lang === 'bg' ? 'Нов снимък на ставките' : 'New rate snapshot',
  historyTitle:     lang === 'bg' ? 'История' : 'History',
  step:             lang === 'bg' ? 'Стъпка' : 'Discount step',
  basic:            'BASIC (%)',
  premium:          lang === 'bg' ? 'LIGHT / PREMIUM (%)' : 'LIGHT / PREMIUM (%)',
  premiumHint:      lang === 'bg' ? 'важи за абонати с LIGHT и PREMIUM план' : 'applies to subscribers on LIGHT and PREMIUM plans',
  marginBasic:      lang === 'bg' ? 'Марж BASIC (%)' : 'Margin BASIC (%)',
  marginPremium:    lang === 'bg' ? 'Марж LIGHT/PREMIUM (%)' : 'Margin LIGHT/PREMIUM (%)',
  effectiveFrom:    lang === 'bg' ? 'В сила от' : 'Effective from',
  effectiveHint:    lang === 'bg' ? '(по подразбиране: сега)' : '(defaults to now)',
  notes:            lang === 'bg' ? 'Бележки (незадължително)' : 'Notes (optional)',
  preview:          lang === 'bg' ? 'Преглед преди запис' : 'Preview before saving',
  confirmTitle:     lang === 'bg' ? 'Потвърждение на промяната' : 'Confirm change',
  confirmMsg:       (dt: string) =>
    lang === 'bg'
      ? `Ще запишете нов снимък на ставките в сила от ${dt}. Тази операция е необратима.`
      : `You are about to save a new rate snapshot effective from ${dt}. This action cannot be undone.`,
  confirmBtn:       lang === 'bg' ? 'Потвърди и запиши' : 'Confirm & save',
  cancelConfirm:    lang === 'bg' ? 'Назад' : 'Back',
  saved:            lang === 'bg' ? 'Ставките са записани' : 'Rates saved',
  scheduled:        lang === 'bg' ? 'Планирано' : 'Scheduled',
  cancelSnapshot:   lang === 'bg' ? 'Отмени' : 'Cancel',
  confirmDelete:    lang === 'bg'
    ? 'Сигурни ли сте, че искате да отмените този планиран снимък?'
    : 'Are you sure you want to cancel this scheduled snapshot?',
  snapshotDeleted:  lang === 'bg' ? 'Планираният снимък е отменен' : 'Scheduled snapshot cancelled',
  thEffective:      lang === 'bg' ? 'В сила от' : 'Effective from',
  thBy:             lang === 'bg' ? 'Автор' : 'By',
  thNotes:          lang === 'bg' ? 'Бележки' : 'Notes',
  mustBeNumbers:    (step: number) =>
    lang === 'bg'
      ? `Стъпка ${step}%: BASIC и LIGHT/PREMIUM трябва да са числа`
      : `Step ${step}%: BASIC and LIGHT/PREMIUM must be numbers`,
  outOfRange:       (step: number) =>
    lang === 'bg'
      ? `Стъпка ${step}%: стойностите не могат да са отрицателни`
      : `Step ${step}%: values must not be negative`,
  marginNegative:   (step: number) =>
    lang === 'bg'
      ? `Стъпка ${step}%: кешбекът не може да надвишава партньорската отстъпка (${step}%) — маржът би бил отрицателен`
      : `Step ${step}%: cashback cannot exceed the partner discount (${step}%) — margin would be negative`,
  exceedsCapInline: (step: number) =>
    lang === 'bg' ? `Макс. ${step}%` : `Max ${step}%`,
});

// ── Helpers ───────────────────────────────────────────────────────────

const nowLocal = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const emptyDraft = (): Record<number, { basic: string; premium: string }> =>
  Object.fromEntries(STEPS.map(s => [s, { basic: '', premium: '' }]));

const computeMargin = (step: number, cashback: string | number): string => {
  const cb = typeof cashback === 'string' ? parseFloat(cashback) : cashback;
  if (!isFinite(cb)) return '—';
  const m = Math.round((step - cb) * 10) / 10;
  return m >= 0 ? `${m}%` : `−${Math.abs(m)}%`;
};

const isFuture = (iso: string) => new Date(iso) > new Date();

// ── Component ─────────────────────────────────────────────────────────

const AdminCashbackRatesPage: React.FC = () => {
  const { language } = useLanguage();
  const tr = t(language as 'en' | 'bg');

  const [current, setCurrent] = useState<CurrentCashbackRate[]>([]);
  const [history, setHistory] = useState<CashbackRateRow[]>([]);
  const [draft, setDraft] = useState(emptyDraft());
  const [effectiveFrom, setEffectiveFrom] = useState(nowLocal);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  // Two-step save
  const [pendingPayload, setPendingPayload] = useState<{
    rates: Array<{ discountStep: number; basic: number; premium: number }>;
    effectiveFrom: string;
    notes: string;
    displayDate: string;
  } | null>(null);

  const load = useCallback(async () => {
    const [cur, hist] = await Promise.all([
      adminCashbackService.getCurrentRates(),
      adminCashbackService.getRates(),
    ]);
    setCurrent(cur);
    setHistory(hist);
    const seeded: Record<number, { basic: string; premium: string }> = {};
    for (const step of STEPS) {
      const row = cur.find(r => r.discountStep === step);
      seeded[step] = {
        basic: row ? String(row.basic) : '',
        premium: row ? String(row.premium) : '',
      };
    }
    setDraft(seeded);
  }, []);

  useEffect(() => {
    load().catch(e => setToast({ ok: false, msg: String(e?.message || e) }));
  }, [load]);

  const updateCell = (step: number, field: 'basic' | 'premium', value: string) => {
    setDraft(prev => ({ ...prev, [step]: { ...prev[step], [field]: value } }));
    setError(null);
    setPendingPayload(null);
  };

  // Per-cell validity: value entered is negative or exceeds the step cap
  const isCellInvalid = (step: number, field: 'basic' | 'premium'): boolean => {
    const raw = draft[step]?.[field] ?? '';
    if (raw === '') return false;
    const v = parseFloat(raw);
    return isFinite(v) && (v < 0 || v > step);
  };

  // Step 1: validate → show confirm panel
  const handlePreview = () => {
    setError(null);
    const rates: Array<{ discountStep: number; basic: number; premium: number }> = [];
    for (const step of STEPS) {
      const row = draft[step];
      const basic = parseFloat(row.basic);
      const premium = parseFloat(row.premium);
      if (!isFinite(basic) || !isFinite(premium)) {
        setError(tr.mustBeNumbers(step));
        return;
      }
      if (basic < 0 || premium < 0) {
        setError(tr.outOfRange(step));
        return;
      }
      if (basic > step || premium > step) {
        setError(tr.marginNegative(step));
        return;
      }
      rates.push({ discountStep: step, basic, premium });
    }

    const parsedEffective = effectiveFrom ? new Date(effectiveFrom) : null;
    const effectiveDate = parsedEffective && isFinite(parsedEffective.getTime())
      ? parsedEffective
      : new Date();

    setPendingPayload({
      rates,
      effectiveFrom: effectiveDate.toISOString(),
      notes,
      displayDate: effectiveDate.toLocaleString(),
    });
  };

  // Step 2: actually save
  const confirmSave = async () => {
    if (!pendingPayload) return;
    setSaving(true);
    try {
      await adminCashbackService.createRates({
        rates: pendingPayload.rates,
        effectiveFrom: pendingPayload.effectiveFrom,
        notes: pendingPayload.notes || undefined,
      });
      setToast({ ok: true, msg: tr.saved });
      setNotes('');
      setEffectiveFrom(nowLocal());
      setPendingPayload(null);
      await load();
    } catch (e) {
      const axiosErr = e as { response?: { data?: { error?: string } }; message?: string };
      setError(axiosErr?.response?.data?.error || axiosErr?.message || 'Failed to save');
      // keep pendingPayload so the confirm panel stays open and user can retry
    } finally {
      setSaving(false);
    }
  };

  const cancelPreview = () => {
    setPendingPayload(null);
    setError(null);
  };

  const handleDeleteSnapshot = async (effectiveFromISO: string) => {
    if (!window.confirm(tr.confirmDelete)) return;
    try {
      await adminCashbackService.deleteSnapshot(effectiveFromISO);
      setToast({ ok: true, msg: tr.snapshotDeleted });
      await load();
    } catch (e) {
      const axiosErr = e as { response?: { data?: { error?: string } }; message?: string };
      setToast({ ok: false, msg: axiosErr?.response?.data?.error || axiosErr?.message || 'Failed to cancel snapshot' });
    }
  };

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

  // 7-col grid: step | basic | premium | margin-basic | margin-premium | effective-from | author
  const currentCols = '0.7fr 0.9fr 1.1fr 1fr 1.1fr 1.8fr 1.2fr';
  // 5-col grid: step | basic input | margin-basic | premium input | margin-premium
  const editCols = '0.7fr 1fr 0.9fr 1.1fr 0.9fr';

  return (
    <Page>
      <Header>
        <Title><Percent size={24} /> {tr.title}</Title>
        <Subtitle>{tr.subtitle}</Subtitle>
      </Header>

      {/* ── Current effective rates ── */}
      <Section>
        <SectionTitle>{tr.currentTitle}</SectionTitle>
        <Matrix $cols={currentCols}>
          <Cell $header>{tr.step}</Cell>
          <Cell $header>{tr.basic}</Cell>
          <Cell $header>
            {tr.premium}
            <ColHint>{tr.premiumHint}</ColHint>
          </Cell>
          <Cell $header>{tr.marginBasic}</Cell>
          <Cell $header>{tr.marginPremium}</Cell>
          <Cell $header>{tr.effectiveFrom}</Cell>
          <Cell $header>{tr.thBy}</Cell>
          {STEPS.map(step => {
            const row = current.find(r => r.discountStep === step);
            return (
              <React.Fragment key={step}>
                <Cell>{step}%</Cell>
                <Cell>{row != null ? `${row.basic}%` : '—'}</Cell>
                <Cell>{row != null ? `${row.premium}%` : '—'}</Cell>
                <Cell $muted>{row != null ? computeMargin(step, row.basic) : '—'}</Cell>
                <Cell $muted>{row != null ? computeMargin(step, row.premium) : '—'}</Cell>
                <Cell $muted style={{ fontSize: '0.8rem' }}>{fmtDate(row?.effectiveFrom ?? null)}</Cell>
                <Cell $muted style={{ fontSize: '0.75rem' }}>
                  {row?.createdByName ?? row?.createdByEmail ?? (row?.createdBy ? row.createdBy.slice(0, 8) : '—')}
                </Cell>
              </React.Fragment>
            );
          })}
        </Matrix>
      </Section>

      {/* ── New rate snapshot form ── */}
      <Section>
        <SectionTitle>{tr.newTitle}</SectionTitle>
        <Matrix $cols={editCols}>
          <Cell $header>{tr.step}</Cell>
          <Cell $header>{tr.basic}</Cell>
          <Cell $header>{tr.marginBasic}</Cell>
          <Cell $header>
            {tr.premium}
            <ColHint>{tr.premiumHint}</ColHint>
          </Cell>
          <Cell $header>{tr.marginPremium}</Cell>
          {STEPS.map(step => {
            const basicInvalid = isCellInvalid(step, 'basic');
            const premiumInvalid = isCellInvalid(step, 'premium');
            return (
              <React.Fragment key={step}>
                <Cell>{step}%</Cell>
                <Cell>
                  <NumberInput
                    type="number" min={0} max={step} step={0.5}
                    $invalid={basicInvalid}
                    value={draft[step]?.basic ?? ''}
                    onChange={e => updateCell(step, 'basic', e.target.value)}
                  />
                  {basicInvalid && (
                    <InvalidHint>{tr.exceedsCapInline(step)}</InvalidHint>
                  )}
                </Cell>
                <Cell $muted $invalid={basicInvalid}>
                  {computeMargin(step, draft[step]?.basic ?? '')}
                </Cell>
                <Cell>
                  <NumberInput
                    type="number" min={0} max={step} step={0.5}
                    $invalid={premiumInvalid}
                    value={draft[step]?.premium ?? ''}
                    onChange={e => updateCell(step, 'premium', e.target.value)}
                  />
                  {premiumInvalid && (
                    <InvalidHint>{tr.exceedsCapInline(step)}</InvalidHint>
                  )}
                </Cell>
                <Cell $muted $invalid={premiumInvalid}>
                  {computeMargin(step, draft[step]?.premium ?? '')}
                </Cell>
              </React.Fragment>
            );
          })}
        </Matrix>

        <FormRow>
          <Field>
            <Label>
              {tr.effectiveFrom}
              <FieldHint>{tr.effectiveHint}</FieldHint>
            </Label>
            <TextInput
              type="datetime-local"
              value={effectiveFrom}
              onChange={e => { setEffectiveFrom(e.target.value); setPendingPayload(null); }}
            />
          </Field>
          <Field style={{ flex: 2 }}>
            <Label>{tr.notes}</Label>
            <TextInput
              value={notes}
              onChange={e => { setNotes(e.target.value); setPendingPayload(null); }}
              placeholder={language === 'bg' ? 'напр. Q2 ревизия' : 'e.g. Q2 revision'}
            />
          </Field>
          {!pendingPayload && (
            <SaveBtn onClick={handlePreview} disabled={saving}>
              <Save /> {tr.preview}
            </SaveBtn>
          )}
        </FormRow>

        {pendingPayload && (
          <ConfirmPanel>
            <ConfirmTitle>{tr.confirmTitle}</ConfirmTitle>
            <ConfirmMeta>{tr.confirmMsg(pendingPayload.displayDate)}</ConfirmMeta>
            <Matrix $cols={editCols} style={{ marginBottom: '0.25rem' }}>
              <Cell $header>{tr.step}</Cell>
              <Cell $header>{tr.basic}</Cell>
              <Cell $header>{tr.marginBasic}</Cell>
              <Cell $header>{tr.premium}</Cell>
              <Cell $header>{tr.marginPremium}</Cell>
              {pendingPayload.rates.map(r => (
                <React.Fragment key={r.discountStep}>
                  <Cell>{r.discountStep}%</Cell>
                  <Cell>{r.basic}%</Cell>
                  <Cell $muted>{computeMargin(r.discountStep, r.basic)}</Cell>
                  <Cell>{r.premium}%</Cell>
                  <Cell $muted>{computeMargin(r.discountStep, r.premium)}</Cell>
                </React.Fragment>
              ))}
            </Matrix>
            {pendingPayload.notes && (
              <ConfirmMeta style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>
                {pendingPayload.notes}
              </ConfirmMeta>
            )}
            <ConfirmActions>
              <ConfirmBtn onClick={confirmSave} disabled={saving}>
                <Check /> {tr.confirmBtn}
              </ConfirmBtn>
              <CancelBtn onClick={cancelPreview}>
                <X /> {tr.cancelConfirm}
              </CancelBtn>
            </ConfirmActions>
          </ConfirmPanel>
        )}

        {error && <Error><AlertCircle /> {error}</Error>}
      </Section>

      {/* ── History ── */}
      <Section>
        <SectionTitle><History /> {tr.historyTitle}</SectionTitle>
        <HistoryTable>
          <thead>
            <tr>
              {/* Author and Notes live in the group header row — not repeated per step */}
              <th>{tr.thEffective}</th>
              <th>{tr.step}</th>
              <th>{tr.basic}</th>
              <th>{tr.premium}</th>
              <th>{tr.marginBasic}</th>
              <th>{tr.marginPremium}</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>—</td>
              </tr>
            )}
            {(() => {
              // Group rows by effectiveFrom — all rows in one save share the same timestamp.
              const groups = new Map<string, typeof history>();
              for (const row of history) {
                const key = row.effectiveFrom ?? row.createdAt;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(row);
              }
              return [...groups.entries()].map(([key, rows]) => {
                const future = isFuture(key);
                return (
                  <React.Fragment key={key}>
                    <tr style={{ background: 'var(--color-background-secondary)' }}>
                      <td colSpan={6} style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-text-secondary)', padding: '0.5rem 0.875rem' }}>
                        {fmtDate(key)}
                        {future && (
                          <ScheduledBadge>{tr.scheduled}</ScheduledBadge>
                        )}
                        {rows[0].createdByName || rows[0].createdByEmail
                          ? <span style={{ fontWeight: 600, marginLeft: '0.75rem', color: 'var(--color-text-primary)' }}>
                              {rows[0].createdByName ?? rows[0].createdByEmail}
                            </span>
                          : <span style={{ marginLeft: '0.75rem', opacity: 0.4 }}>—</span>}
                        {rows[0].notes ? <span style={{ fontWeight: 400, marginLeft: '0.75rem' }}>{rows[0].notes}</span> : null}
                        {future && (
                          <DeleteSnapshotBtn onClick={() => handleDeleteSnapshot(key)}>
                            <Trash2 /> {tr.cancelSnapshot}
                          </DeleteSnapshotBtn>
                        )}
                      </td>
                    </tr>
                    {rows.map(row => (
                      <tr key={row.id}>
                        <td style={{ paddingLeft: '1.5rem', color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>↳</td>
                        <td>{row.discountStep}%</td>
                        <td>{row.basic}%</td>
                        <td>{row.premium}%</td>
                        <td className="muted">{computeMargin(row.discountStep, row.basic)}</td>
                        <td className="muted">{computeMargin(row.discountStep, row.premium)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              });
            })()}
          </tbody>
        </HistoryTable>
      </Section>

      {toast && <Toast $ok={toast.ok}>{toast.msg}</Toast>}
    </Page>
  );
};

export default AdminCashbackRatesPage;
