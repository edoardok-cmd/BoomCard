import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Percent, History, Save, AlertCircle, Trash2, Check, X, Calendar, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  adminCashbackService,
  CashbackRateRow,
  CurrentCashbackRate,
} from '../services/adminCashback.service';
import { DISCOUNT_STEPS } from '../utils/discountSteps';

const STEPS = DISCOUNT_STEPS;
const HISTORY_PAGE_SIZE = 5;

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

const SnapshotMeta = styled.p`
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  margin: -0.25rem 0 0.75rem 0;
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
  &:disabled { opacity: 0.5; cursor: not-allowed; background: var(--color-background-secondary); color: var(--color-text-primary); border-color: var(--color-border); }
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
  &:disabled { opacity: 0.5; cursor: not-allowed; background: var(--color-background-secondary); }
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

const ConfirmTitle = styled.h3`
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

// Fix #4: styled delete-confirm panel (replaces window.confirm)
const DeleteConfirmPanel = styled.div`
  margin-top: 0.5rem;
  border: 2px solid #dc2626;
  border-radius: 0.75rem;
  padding: 0.875rem 1.25rem;
  background: #fff1f2;
`;

const DeleteConfirmTitle = styled.h3`
  margin: 0 0 0.5rem 0;
  font-weight: 700;
  font-size: 0.875rem;
  color: #991b1b;
  display: flex; align-items: center; gap: 0.4rem;
  svg { width: 15px; height: 15px; }
`;

const DeleteConfirmActions = styled.div`
  display: flex; gap: 0.5rem; margin-top: 0.75rem;
`;

const DeleteConfirmBtn = styled.button`
  padding: 0.4rem 0.875rem;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  display: flex; align-items: center; gap: 0.35rem;
  &:hover:not(:disabled) { filter: brightness(1.1); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  svg { width: 13px; height: 13px; }
`;

const Error = styled.div`
  background: #fee2e2; color: #991b1b;
  padding: 0.625rem 0.875rem; border-radius: 0.5rem;
  font-size: 0.85rem; font-weight: 600;
  display: flex; align-items: center; gap: 0.5rem;
  margin-top: 0.75rem;
  svg { width: 15px; height: 15px; }
`;

// Fix #2 & #3: shared warning banner style
const WarningBanner = styled.div`
  background: #fffbeb;
  border: 1.5px solid #fbbf24;
  border-radius: 0.625rem;
  padding: 0.625rem 0.875rem;
  font-size: 0.825rem;
  font-weight: 500;
  color: #92400e;
  display: flex; align-items: flex-start; gap: 0.5rem;
  margin-bottom: 0.75rem;
  svg { width: 15px; height: 15px; flex-shrink: 0; margin-top: 0.1rem; }
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

const HistoryNotes = styled.span`
  font-weight: 400;
  font-style: italic;
  color: var(--color-text-secondary);
  margin-left: 0.75rem;
  font-size: 0.78rem;
`;

const ShowMoreRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  gap: 1rem;
`;

const ShowMoreBtn = styled.button`
  padding: 0.4rem 0.875rem;
  background: transparent;
  color: var(--color-text-secondary);
  border: 1.5px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: var(--color-background-secondary); }
`;

const HistoryCount = styled.span`
  font-size: 0.78rem;
  color: var(--color-text-secondary);
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
  title:            lang === 'bg' ? 'Проценти' : 'Percentages',
  subtitle:         (n: number) =>
    lang === 'bg'
      ? `Разпределение на кешбек % и марджин по стъпка на партньорска отстъпка. Всяка нова версия е самостоятелен снимък — всичките ${n} стъпки са задължителни. Стойностите не могат да надвишават % на партньорската отстъпка за съответната стъпка.`
      : `Distribution of cashback % and margin by partner discount step. Every new version is a self-contained snapshot — all ${n} steps are required. Values cannot exceed the partner discount % for that step.`,
  currentTitle:     lang === 'bg' ? 'Текущи действащи ставки' : 'Currently effective rates',
  newTitle:         lang === 'bg' ? 'Нов снимък на ставките' : 'New rate snapshot',
  historyTitle:     lang === 'bg' ? 'История' : 'History',
  step:             lang === 'bg' ? 'Стъпка' : 'Discount step',
  stepHint:         lang === 'bg' ? 'договорен % отстъпка на партньора' : "partner's contracted discount %",
  basic:            'BASIC (%)',
  // Fix #1: label now references the spec plan names (Premium седмичен / месечен)
  premium:          lang === 'bg' ? 'LIGHT / PREMIUM (%)' : 'LIGHT / PREMIUM (%)',
  premiumHint:      lang === 'bg'
    ? 'Premium седмичен (LIGHT) + Premium месечен (PREMIUM)'
    : 'Premium Weekly (LIGHT) + Premium Monthly (PREMIUM)',
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
  // Fix #4: delete confirmation strings for inline panel
  deleteConfirmTitle: lang === 'bg'
    ? 'Отмяна на планиран снимък'
    : 'Cancel scheduled snapshot',
  deleteConfirmMsg: (dt: string) =>
    lang === 'bg'
      ? `Сигурни ли сте, че искате да отмените снимъка, планиран за ${dt}?`
      : `Are you sure you want to cancel the snapshot scheduled for ${dt}?`,
  deleteConfirmBtn: lang === 'bg' ? 'Да, отмени' : 'Yes, cancel it',
  snapshotDeleted:  lang === 'bg' ? 'Планираният снимък е отменен' : 'Scheduled snapshot cancelled',
  thEffective:      lang === 'bg' ? 'В сила от' : 'Effective from',
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
  noChanges:        lang === 'bg'
    ? 'Ставките не са променени — стойностите са идентични с текущите действащи ставки'
    : 'No changes — values are identical to the currently effective rates',
  showMore:         lang === 'bg' ? 'Покажи повече' : 'Show more',
  showingCount:     (shown: number, total: number) =>
    lang === 'bg' ? `${shown} от ${total} снимки` : `${shown} of ${total} snapshots`,
  notesLabel:       lang === 'bg' ? 'Бележки' : 'Notes',
  notesPlaceholder: lang === 'bg' ? 'напр. Q2 ревизия' : 'e.g. Q2 revision',
  mixedSnapshots:   lang === 'bg' ? '(стъпките са от различни снимки)' : '(steps are from different snapshots)',
  // Fix #2: past-date warning
  backdatedWarning: lang === 'bg'
    ? 'Избраната дата е в миналото. Новият снимък ще бъде вмъкнат като backdated и ще стане текущ, ако е по-нов от всички съществуващи ставки. Уверете се, че това е желаното действие.'
    : 'The selected date is in the past. The new snapshot will be inserted as backdated and will become current if it is newer than all existing rates. Make sure this is intentional.',
  // Fix #3: upcoming scheduled change alert
  upcomingChangeAlert: (dt: string) =>
    lang === 'bg'
      ? `Предстояща промяна на ставките, планирана за ${dt}`
      : `Upcoming rate change scheduled for ${dt}`,
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
  return m >= 0 ? `${m}%` : `-${Math.abs(m)}%`;
};

const isFuture = (iso: string) => {
  const t = new Date(iso);
  t.setSeconds(0, 0);
  const now = new Date();
  now.setSeconds(0, 0);
  return t > now;
};

// Fix #2: true when the datetime-local value represents a time in the past.
// Round current time down to the minute to match the minute-precision of nowLocal(),
// so the default "now" value doesn't trigger a false-positive warning on page load.
const isPast = (localDatetimeValue: string): boolean => {
  if (!localDatetimeValue) return false;
  const d = new Date(localDatetimeValue);
  if (!isFinite(d.getTime())) return false;
  const now = new Date();
  now.setSeconds(0, 0);
  return d < now;
};

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
  const [historySnapshotsShown, setHistorySnapshotsShown] = useState(HISTORY_PAGE_SIZE);

  // Two-step save
  const [pendingPayload, setPendingPayload] = useState<{
    rates: Array<{ discountStep: number; basic: number; premium: number }>;
    effectiveFrom: string;
    notes: string;
    displayDate: string;
  } | null>(null);

  // Fix #4: inline delete-confirm state (replaces window.confirm)
  const [deletePending, setDeletePending] = useState<{ iso: string; displayDate: string } | null>(null);

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

  const currentSnapshotInfo = useMemo(() => {
    const withDate = current.filter(r => r.effectiveFrom != null);
    if (withDate.length === 0) return null;
    const sorted = [...withDate].sort(
      (a, b) => new Date(b.effectiveFrom!).getTime() - new Date(a.effectiveFrom!).getTime(),
    );
    const newest = sorted[0];
    const uniqueDates = new Set(withDate.map(r => r.effectiveFrom));
    return {
      date: new Date(newest.effectiveFrom!).toLocaleString(),
      author: newest.createdByName ?? newest.createdByEmail ?? null,
      mixed: uniqueDates.size > 1,
    };
  }, [current]);

  // Fix #3: derive future scheduled snapshots from history to show alert in Current Rates section
  const futureSnapshots = useMemo(() => {
    const groups = new Map<string, CashbackRateRow[]>();
    for (const row of history) {
      const key = row.effectiveFrom ?? row.createdAt;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return [...groups.entries()]
      .filter(([key]) => isFuture(key))
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime());
  }, [history]);

  const updateCell = (step: number, field: 'basic' | 'premium', value: string) => {
    setDraft(prev => ({ ...prev, [step]: { ...prev[step], [field]: value } }));
    setError(null);
  };

  const isCellInvalid = (step: number, field: 'basic' | 'premium'): boolean => {
    const raw = draft[step]?.[field] ?? '';
    if (raw === '') return false;
    const v = parseFloat(raw);
    return isFinite(v) && (v < 0 || v > step);
  };

  const handlePreview = () => {
    setError(null);

    const allStepsHaveCurrent = STEPS.every(step => current.find(r => r.discountStep === step));
    if (allStepsHaveCurrent) {
      const isUnchanged = STEPS.every(step => {
        const row = current.find(r => r.discountStep === step);
        if (!row) return false;
        const draftBasic = parseFloat(draft[step]?.basic ?? '');
        const draftPremium = parseFloat(draft[step]?.premium ?? '');
        return draftBasic === row.basic && draftPremium === row.premium;
      });
      if (isUnchanged) {
        setError(tr.noChanges);
        return;
      }
    }

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

  const confirmSave = async () => {
    if (!pendingPayload) return;
    setSaving(true);
    let saved = false;
    try {
      await adminCashbackService.createRates({
        rates: pendingPayload.rates,
        effectiveFrom: pendingPayload.effectiveFrom,
        notes: pendingPayload.notes || undefined,
      });
      saved = true;
    } catch (e) {
      const axiosErr = e as { response?: { data?: { error?: string } }; message?: string };
      setError(axiosErr?.response?.data?.error || axiosErr?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
    if (saved) {
      setToast({ ok: true, msg: tr.saved });
      setNotes('');
      setEffectiveFrom(nowLocal());
      setPendingPayload(null);
      await load().catch(() => console.warn('[CashbackRates] post-save reload failed — table may be stale'));
    }
  };

  const cancelPreview = () => {
    setPendingPayload(null);
    setError(null);
  };

  // Fix #4: two-step delete — first call sets deletePending, second (confirmDelete) does the API call
  const requestDeleteSnapshot = (effectiveFromISO: string) => {
    setDeletePending({ iso: effectiveFromISO, displayDate: new Date(effectiveFromISO).toLocaleString() });
  };

  const confirmDelete = async () => {
    if (!deletePending) return;
    const { iso } = deletePending;
    setDeletePending(null);
    try {
      await adminCashbackService.deleteSnapshot(iso);
    } catch (e) {
      const axiosErr = e as { response?: { data?: { error?: string } }; message?: string };
      setToast({ ok: false, msg: axiosErr?.response?.data?.error || axiosErr?.message || 'Failed to cancel snapshot' });
      return;
    }
    setHistory(prev => prev.filter(r => (r.effectiveFrom ?? r.createdAt) !== iso));
    setToast({ ok: true, msg: tr.snapshotDeleted });
    await load().catch(() => console.warn('[CashbackRates] post-delete reload failed — table may be stale'));
  };

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

  const stepCols = '0.7fr 1fr 0.9fr 1.1fr 0.9fr';

  return (
    <Page>
      <Header>
        <Title><Percent size={24} /> {tr.title}</Title>
        <Subtitle>{tr.subtitle(STEPS.length)}</Subtitle>
      </Header>

      {/* ── Current effective rates ── */}
      <Section>
        <SectionTitle>{tr.currentTitle}</SectionTitle>

        {/* Fix #3: upcoming scheduled change alert */}
        {futureSnapshots.map(([key]) => (
          <WarningBanner key={key}>
            <Calendar />
            {tr.upcomingChangeAlert(new Date(key).toLocaleString())}
          </WarningBanner>
        ))}

        {currentSnapshotInfo && (
          <SnapshotMeta>
            {tr.effectiveFrom}: {currentSnapshotInfo.date}
            {currentSnapshotInfo.author && (
              <> · <strong>{currentSnapshotInfo.author}</strong></>
            )}
            {currentSnapshotInfo.mixed && (
              <> · <em>{tr.mixedSnapshots}</em></>
            )}
          </SnapshotMeta>
        )}
        <Matrix $cols={stepCols}>
          <Cell $header>
            {tr.step}
            <ColHint>{tr.stepHint}</ColHint>
          </Cell>
          <Cell $header>{tr.basic}</Cell>
          <Cell $header>{tr.marginBasic}</Cell>
          <Cell $header>
            {tr.premium}
            {/* Fix #1: hint now references spec plan names */}
            <ColHint>{tr.premiumHint}</ColHint>
          </Cell>
          <Cell $header>{tr.marginPremium}</Cell>
          {STEPS.map(step => {
            const row = current.find(r => r.discountStep === step);
            const basicMarginNeg  = row != null && (step - row.basic)   < 0;
            const premiumMarginNeg = row != null && (step - row.premium) < 0;
            return (
              <React.Fragment key={step}>
                <Cell>{step}%</Cell>
                <Cell>{row != null ? `${row.basic}%` : '—'}</Cell>
                <Cell $muted $invalid={basicMarginNeg}>
                  {row != null ? computeMargin(step, row.basic) : '—'}
                </Cell>
                <Cell>{row != null ? `${row.premium}%` : '—'}</Cell>
                <Cell $muted $invalid={premiumMarginNeg}>
                  {row != null ? computeMargin(step, row.premium) : '—'}
                </Cell>
              </React.Fragment>
            );
          })}
        </Matrix>
      </Section>

      {/* ── New rate snapshot form ── */}
      <Section>
        <SectionTitle>{tr.newTitle}</SectionTitle>
        <Matrix $cols={stepCols}>
          <Cell $header>
            {tr.step}
            <ColHint>{tr.stepHint}</ColHint>
          </Cell>
          <Cell $header>{tr.basic}</Cell>
          <Cell $header>{tr.marginBasic}</Cell>
          <Cell $header>
            {tr.premium}
            <ColHint>{tr.premiumHint}</ColHint>
          </Cell>
          <Cell $header>{tr.marginPremium}</Cell>
          {STEPS.map(step => {
            const basicInvalid   = isCellInvalid(step, 'basic');
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
                    disabled={!!pendingPayload}
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
                    disabled={!!pendingPayload}
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
              disabled={!!pendingPayload}
            />
          </Field>
          <Field style={{ flex: 2 }}>
            <Label>{tr.notes}</Label>
            <TextInput
              value={notes}
              onChange={e => { setNotes(e.target.value); setPendingPayload(null); }}
              placeholder={tr.notesPlaceholder}
              disabled={!!pendingPayload}
            />
          </Field>
          {!pendingPayload && (
            <SaveBtn onClick={handlePreview} disabled={saving}>
              <Save /> {tr.preview}
            </SaveBtn>
          )}
        </FormRow>

        {/* Fix #2: backdated warning shown below the date input */}
        {!pendingPayload && isPast(effectiveFrom) && (
          <WarningBanner style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            <AlertTriangle />
            {tr.backdatedWarning}
          </WarningBanner>
        )}

        {pendingPayload && (
          <ConfirmPanel>
            <ConfirmTitle>
              {tr.confirmTitle}
              {isFuture(pendingPayload.effectiveFrom) && (
                <ScheduledBadge>{tr.scheduled}</ScheduledBadge>
              )}
            </ConfirmTitle>
            <ConfirmMeta>{tr.confirmMsg(pendingPayload.displayDate)}</ConfirmMeta>
            <Matrix $cols={stepCols} style={{ marginBottom: '0.25rem' }}>
              <Cell $header>
                {tr.step}
                <ColHint>{tr.stepHint}</ColHint>
              </Cell>
              <Cell $header>{tr.basic}</Cell>
              <Cell $header>{tr.marginBasic}</Cell>
              <Cell $header>
                {tr.premium}
                <ColHint>{tr.premiumHint}</ColHint>
              </Cell>
              <Cell $header>{tr.marginPremium}</Cell>
              {pendingPayload.rates.map(r => (
                <React.Fragment key={r.discountStep}>
                  <Cell>{r.discountStep}%</Cell>
                  <Cell>{r.basic}%</Cell>
                  <Cell $muted $invalid={r.basic > r.discountStep}>{computeMargin(r.discountStep, r.basic)}</Cell>
                  <Cell>{r.premium}%</Cell>
                  <Cell $muted $invalid={r.premium > r.discountStep}>{computeMargin(r.discountStep, r.premium)}</Cell>
                </React.Fragment>
              ))}
            </Matrix>
            {pendingPayload.notes && (
              <ConfirmMeta style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>
                <strong style={{ fontStyle: 'normal' }}>{tr.notesLabel}:</strong>{' '}{pendingPayload.notes}
              </ConfirmMeta>
            )}
            <ConfirmActions>
              <ConfirmBtn onClick={confirmSave} disabled={saving}>
                <Check /> {tr.confirmBtn}
              </ConfirmBtn>
              <CancelBtn onClick={cancelPreview} disabled={saving}>
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

        {/* Fix #4: inline delete-confirm panel rendered inside History section */}
        {deletePending && (
          <DeleteConfirmPanel>
            <DeleteConfirmTitle><AlertTriangle /> {tr.deleteConfirmTitle}</DeleteConfirmTitle>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.825rem', color: '#991b1b' }}>
              {tr.deleteConfirmMsg(deletePending.displayDate)}
            </p>
            <DeleteConfirmActions>
              <DeleteConfirmBtn onClick={confirmDelete}>
                <Trash2 /> {tr.deleteConfirmBtn}
              </DeleteConfirmBtn>
              <CancelBtn onClick={() => setDeletePending(null)}>
                <X /> {tr.cancelConfirm}
              </CancelBtn>
            </DeleteConfirmActions>
          </DeleteConfirmPanel>
        )}

        <HistoryTable>
          <thead>
            <tr>
              <th>{tr.thEffective}</th>
              <th>{tr.step}<ColHint>{tr.stepHint}</ColHint></th>
              <th>{tr.basic}</th>
              <th>{tr.marginBasic}</th>
              <th>{tr.premium}</th>
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
              const groups = new Map<string, typeof history>();
              for (const row of history) {
                const key = row.effectiveFrom ?? row.createdAt;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(row);
              }
              const allGroups = [...groups.entries()];
              const totalSnapshots = allGroups.length;
              const visibleGroups = allGroups.slice(0, historySnapshotsShown);

              return (
                <>
                  {visibleGroups.map(([key, rows]) => {
                    const future = isFuture(key);
                    return (
                      <React.Fragment key={key}>
                        <tr style={{ background: 'var(--color-background-secondary)' }}>
                          <td colSpan={6} style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--color-text-secondary)', padding: '0.5rem 0.875rem' }}>
                            {fmtDate(key)}
                            {future && (
                              <ScheduledBadge>{tr.scheduled}</ScheduledBadge>
                            )}
                            {/* Fix #6: · separator between date and author */}
                            {(rows[0].createdByName || rows[0].createdByEmail)
                              ? <><span style={{ margin: '0 0.35rem', opacity: 0.4 }}>·</span><span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                  {rows[0].createdByName ?? rows[0].createdByEmail}
                                </span></>
                              : <span style={{ marginLeft: '0.75rem', opacity: 0.4 }}>—</span>}
                            {rows[0].notes
                              ? <HistoryNotes><strong style={{ fontStyle: 'normal', fontWeight: 600 }}>{tr.notesLabel}:</strong>{' '}{rows[0].notes}</HistoryNotes>
                              : null}
                            {/* Fix #4: use requestDeleteSnapshot instead of window.confirm */}
                            {future && (
                              <DeleteSnapshotBtn onClick={() => requestDeleteSnapshot(key)}>
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
                            <td className="muted">{computeMargin(row.discountStep, row.basic)}</td>
                            <td>{row.premium}%</td>
                            <td className="muted">{computeMargin(row.discountStep, row.premium)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                  {totalSnapshots > HISTORY_PAGE_SIZE && (
                    <tr>
                      <td colSpan={6} style={{ padding: '0.75rem 0.875rem', borderBottom: 'none' }}>
                        <ShowMoreRow>
                          <HistoryCount>{tr.showingCount(Math.min(historySnapshotsShown, totalSnapshots), totalSnapshots)}</HistoryCount>
                          {historySnapshotsShown < totalSnapshots && (
                            <ShowMoreBtn onClick={() => setHistorySnapshotsShown(n => n + HISTORY_PAGE_SIZE)}>
                              {tr.showMore}
                            </ShowMoreBtn>
                          )}
                        </ShowMoreRow>
                      </td>
                    </tr>
                  )}
                </>
              );
            })()}
          </tbody>
        </HistoryTable>
      </Section>

      {toast && <Toast $ok={toast.ok}>{toast.msg}</Toast>}
    </Page>
  );
};

export default AdminCashbackRatesPage;
