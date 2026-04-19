import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Percent, History, Save, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  adminCashbackService,
  CashbackRateRow,
  CurrentCashbackRate,
} from '../services/adminCashback.service';
import { DISCOUNT_STEPS } from '../utils/discountSteps';

// Every rate snapshot must cover exactly these five discount steps; the
// backend rejects partial snapshots (see adminCashback.service.ts).
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

const Matrix = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 1px;
  background: var(--color-border);
  border-radius: 0.5rem;
  overflow: hidden;
`;

const Cell = styled.div<{ $header?: boolean }>`
  background: ${p => p.$header ? 'var(--color-background-secondary)' : 'var(--color-background)'};
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: ${p => p.$header ? 700 : 500};
  color: ${p => p.$header ? 'var(--color-text-secondary)' : 'var(--color-text-primary)'};
`;

const NumberInput = styled.input`
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: 0.375rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: 0.875rem;
  font-weight: 600;
  &:focus { outline: none; border-color: #000; }
`;

const SourceTag = styled.span<{ $db: boolean }>`
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  margin-left: 0.5rem;
  background: ${p => p.$db ? '#dbeafe' : '#fef3c7'};
  color: ${p => p.$db ? '#1e40af' : '#92400e'};
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
  th, td { padding: 0.625rem 0.875rem; text-align: left; border-bottom: 1px solid var(--color-border); }
  th { font-weight: 700; color: var(--color-text-secondary); text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; background: var(--color-background-secondary); }
  td { color: var(--color-text-primary); }
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
  title:        lang === 'bg' ? 'Кешбек ставки' : 'Cashback Rates',
  subtitle:     lang === 'bg'
    ? 'Управлявайте матрицата кешбек % на стъпка отстъпка. Всяка нова версия е самостоятелен снимък — всичките 5 стъпки са задължителни.'
    : 'Manage the cashback % matrix per discount step. Every new version is a self-contained snapshot — all 5 steps are required.',
  currentTitle: lang === 'bg' ? 'Текущи действащи ставки' : 'Currently effective rates',
  newTitle:     lang === 'bg' ? 'Нов снимък на ставките' : 'New rate snapshot',
  historyTitle: lang === 'bg' ? 'История' : 'History',
  step:         lang === 'bg' ? 'Стъпка' : 'Discount step',
  basic:        lang === 'bg' ? 'BASIC (%)' : 'BASIC (%)',
  premium:      lang === 'bg' ? 'LIGHT/PREMIUM (%)' : 'LIGHT/PREMIUM (%)',
  source:       lang === 'bg' ? 'Източник' : 'Source',
  effectiveFrom: lang === 'bg' ? 'В сила от' : 'Effective from',
  notes:        lang === 'bg' ? 'Бележки (незадължително)' : 'Notes (optional)',
  save:         lang === 'bg' ? 'Запази нова версия' : 'Save new snapshot',
  saved:        lang === 'bg' ? 'Ставките са записани' : 'Rates saved',
  tagDb:        lang === 'bg' ? 'БД' : 'DB',
  tagDefault:   lang === 'bg' ? 'по подразб.' : 'default',
  thDate:       lang === 'bg' ? 'Дата' : 'Date',
  thBy:         lang === 'bg' ? 'Автор' : 'By',
  thNotes:      lang === 'bg' ? 'Бележки' : 'Notes',
});

// ── Component ─────────────────────────────────────────────────────────

const emptyDraft = (): Record<number, { basic: string; premium: string }> =>
  Object.fromEntries(STEPS.map(s => [s, { basic: '', premium: '' }]));

const AdminCashbackRatesPage: React.FC = () => {
  const { language } = useLanguage();
  const tr = t(language as 'en' | 'bg');

  const [current, setCurrent] = useState<CurrentCashbackRate[]>([]);
  const [history, setHistory] = useState<CashbackRateRow[]>([]);
  const [draft, setDraft] = useState(emptyDraft());
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    const [cur, hist] = await Promise.all([
      adminCashbackService.getCurrentRates(),
      adminCashbackService.getRates(),
    ]);
    setCurrent(cur);
    setHistory(hist);
    // Seed the draft with the current effective values so admins edit, not retype.
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

  useEffect(() => { load().catch(e => setToast({ ok: false, msg: String(e?.message || e) })); }, [load]);

  const updateCell = (step: number, field: 'basic' | 'premium', value: string) => {
    setDraft(prev => ({ ...prev, [step]: { ...prev[step], [field]: value } }));
    setError(null);
  };

  const submit = async () => {
    setError(null);
    const rates: Array<{ discountStep: number; basic: number; premium: number }> = [];
    for (const step of STEPS) {
      const row = draft[step];
      const basic = parseFloat(row.basic);
      const premium = parseFloat(row.premium);
      if (!isFinite(basic) || !isFinite(premium)) {
        setError(`Step ${step}%: basic and premium must be numbers`);
        return;
      }
      if (basic < 0 || premium < 0 || basic > 100 || premium > 100) {
        setError(`Step ${step}%: values must be between 0 and 100`);
        return;
      }
      rates.push({ discountStep: step, basic, premium });
    }

    setSaving(true);
    try {
      await adminCashbackService.createRates({
        rates,
        effectiveFrom: effectiveFrom || undefined,
        notes: notes || undefined,
      });
      setToast({ ok: true, msg: tr.saved });
      setNotes('');
      setEffectiveFrom('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString() : '—';

  return (
    <Page>
      <Header>
        <Title><Percent size={24} /> {tr.title}</Title>
        <Subtitle>{tr.subtitle}</Subtitle>
      </Header>

      <Section>
        <SectionTitle>{tr.currentTitle}</SectionTitle>
        <Matrix>
          <Cell $header>{tr.step}</Cell>
          <Cell $header>{tr.basic}</Cell>
          <Cell $header>{tr.premium}</Cell>
          <Cell $header>{tr.source}</Cell>
          {STEPS.map(step => {
            const row = current.find(r => r.discountStep === step);
            const isDb = row?.source === 'db';
            return (
              <React.Fragment key={step}>
                <Cell>{step}%</Cell>
                <Cell>{row?.basic ?? '—'}%</Cell>
                <Cell>{row?.premium ?? '—'}%</Cell>
                <Cell>
                  <SourceTag $db={isDb}>{isDb ? tr.tagDb : tr.tagDefault}</SourceTag>
                  {row?.effectiveFrom ? <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginLeft: '0.5rem' }}>{fmtDate(row.effectiveFrom)}</span> : null}
                </Cell>
              </React.Fragment>
            );
          })}
        </Matrix>
      </Section>

      <Section>
        <SectionTitle>{tr.newTitle}</SectionTitle>
        <Matrix>
          <Cell $header>{tr.step}</Cell>
          <Cell $header>{tr.basic}</Cell>
          <Cell $header>{tr.premium}</Cell>
          <Cell $header>&nbsp;</Cell>
          {STEPS.map(step => (
            <React.Fragment key={step}>
              <Cell>{step}%</Cell>
              <Cell>
                <NumberInput
                  type="number" min={0} max={100} step={0.5}
                  value={draft[step]?.basic ?? ''}
                  onChange={e => updateCell(step, 'basic', e.target.value)}
                />
              </Cell>
              <Cell>
                <NumberInput
                  type="number" min={0} max={100} step={0.5}
                  value={draft[step]?.premium ?? ''}
                  onChange={e => updateCell(step, 'premium', e.target.value)}
                />
              </Cell>
              <Cell>&nbsp;</Cell>
            </React.Fragment>
          ))}
        </Matrix>

        <FormRow>
          <Field>
            <Label>{tr.effectiveFrom}</Label>
            <TextInput
              type="datetime-local"
              value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)}
            />
          </Field>
          <Field style={{ flex: 2 }}>
            <Label>{tr.notes}</Label>
            <TextInput
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={language === 'bg' ? 'напр. Q2 ревизия' : 'e.g. Q2 revision'}
            />
          </Field>
          <SaveBtn onClick={submit} disabled={saving}>
            <Save /> {tr.save}
          </SaveBtn>
        </FormRow>

        {error && <Error><AlertCircle /> {error}</Error>}
      </Section>

      <Section>
        <SectionTitle><History /> {tr.historyTitle}</SectionTitle>
        <HistoryTable>
          <thead>
            <tr>
              <th>{tr.thDate}</th>
              <th>{tr.step}</th>
              <th>{tr.basic}</th>
              <th>{tr.premium}</th>
              <th>{tr.thBy}</th>
              <th>{tr.thNotes}</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>—</td></tr>
            )}
            {history.map(row => (
              <tr key={row.id}>
                <td>{fmtDate(row.effectiveFrom)}</td>
                <td>{row.discountStep}%</td>
                <td>{row.basic}%</td>
                <td>{row.premium}%</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{row.createdBy?.slice(0, 8) ?? '—'}</td>
                <td>{row.notes ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </HistoryTable>
      </Section>

      {toast && <Toast $ok={toast.ok}>{toast.msg}</Toast>}
    </Page>
  );
};

export default AdminCashbackRatesPage;
