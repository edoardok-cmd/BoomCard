import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  adminSettingsService,
  FraudRule,
} from '../../services/adminSettings.service';
import { latestMeta, formatAuditStamp, describeApiError } from '../../utils/systemSettingsAudit';

// Spec §7.4 — Контрол > Лимити и правила
// Дневен лимит, мин/макс сума, авто-одобрение, ръчна намеса от супер-админ.
// Backend CRUD at /api/admin/settings/fraud-rules.

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  warning: '#b5803a', warningSoft: '#f5ead2',
  info: '#2563eb', infoSoft: '#dbeafe',
  purple: '#7c3aed', purpleSoft: '#ede9fe',
};

const TIER_LABELS: Record<string, string> = {
  SYSTEM:       'Системно (глобално)',
  PARTNER_TYPE: 'Тип партньор',
  PARTNER:      'Партньор',
  USER:         'Потребител',
};
const TIER_COLORS: Record<string, { bg: string; color: string }> = {
  SYSTEM:       { bg: palette.infoSoft,   color: palette.info },
  PARTNER_TYPE: { bg: palette.purpleSoft, color: palette.purple },
  PARTNER:      { bg: palette.warningSoft,color: palette.warning },
  USER:         { bg: palette.accentSoft, color: palette.accent },
};

const PageShell = styled.div`background:${palette.bg};min-height:calc(100vh - 4rem);padding:2rem 2.5rem;`;
const PageHeader = styled.div`display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;gap:1rem;flex-wrap:wrap;`;
const TitleBlock = styled.div``;
const Eyebrow = styled.p`font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${palette.textSubtle};margin-bottom:.25rem;`;
const PageTitle = styled.h1`font-size:1.75rem;font-weight:800;color:${palette.text};margin:0 0 .25rem;`;
const PageSubtitle = styled.p`font-size:.9375rem;color:${palette.textMuted};margin:0;`;
const SectionTitle = styled.h2`font-size:1rem;font-weight:700;color:${palette.text};margin:0 0 .25rem;`;
const SectionSubtitle = styled.p`font-size:.8125rem;color:${palette.textMuted};margin:0 0 1rem;`;
const Card = styled.div`background:${palette.surface};border:1px solid ${palette.border};border-radius:.75rem;padding:1.5rem;margin-bottom:1.5rem;`;
const CardHeader = styled.div`display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;`;
const RuleGrid = styled.div`display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem;`;
const FieldCard = styled.div`background:${palette.bg};border:1px solid ${palette.border};border-radius:.625rem;padding:1rem;`;
const FieldLabel = styled.div`font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${palette.textSubtle};margin-bottom:.25rem;`;
const FieldValue = styled.div`font-size:1.25rem;font-weight:700;color:${palette.text};`;
const FieldDefault = styled.div`font-size:.72rem;color:${palette.textSubtle};margin-top:.125rem;`;
const TierBadge = styled.span<{ $tier: string }>`
  display:inline-flex;padding:.15rem .55rem;border-radius:9999px;font-size:.72rem;font-weight:700;
  background:${p => TIER_COLORS[p.$tier]?.bg ?? palette.bg};
  color:${p => TIER_COLORS[p.$tier]?.color ?? palette.textSubtle};
`;
const StatusDot = styled.span<{ $active: boolean }>`
  display:inline-block;width:.5rem;height:.5rem;border-radius:50%;
  background:${p => p.$active ? palette.success : palette.danger};
  margin-right:.35rem;
`;
const Row = styled.div`display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;`;
const Btn = styled.button<{ $variant?: 'primary' | 'danger' | 'ghost' | 'success' }>`
  padding:.45rem .9rem;border-radius:.5rem;font-size:.8125rem;font-weight:600;cursor:pointer;
  transition:opacity .15s;
  ${p => {
    if (p.$variant === 'primary')  return `border:1px solid ${palette.accent};background:${palette.accentSoft};color:${palette.accent};`;
    if (p.$variant === 'danger')   return `border:1px solid ${palette.danger};background:${palette.dangerSoft};color:${palette.danger};`;
    if (p.$variant === 'success')  return `border:1px solid ${palette.success};background:${palette.successSoft};color:${palette.success};`;
    return `border:1px solid ${palette.border};background:${palette.surface};color:${palette.text};`;
  }}
  &:hover{opacity:.8;}
  &:disabled{opacity:.5;cursor:not-allowed;}
`;
const FormGrid = styled.div`display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1rem;@media(max-width:640px){grid-template-columns:1fr;}`;
const FormField = styled.div`display:flex;flex-direction:column;gap:.25rem;`;
const FormLabel = styled.label`font-size:.8125rem;font-weight:600;color:${palette.textMuted};`;
const FormInput = styled.input`padding:.45rem .75rem;border:1px solid ${palette.border};border-radius:.5rem;font-size:.875rem;background:${palette.bg};color:${palette.text};outline:none;&:focus{border-color:${palette.accent};}`;
const FormTextarea = styled.textarea`padding:.45rem .75rem;border:1px solid ${palette.border};border-radius:.5rem;font-size:.875rem;background:${palette.bg};color:${palette.text};outline:none;resize:vertical;min-height:4rem;font-family:inherit;&:focus{border-color:${palette.accent};}`;
const FormSelect = styled.select`padding:.45rem .75rem;border:1px solid ${palette.border};border-radius:.5rem;font-size:.875rem;background:${palette.bg};color:${palette.text};outline:none;&:focus{border-color:${palette.accent};}`;
const Hint = styled.div`font-size:.72rem;color:${palette.textSubtle};`;
const OverrideRow = styled.div`
  display:flex;gap:.75rem;align-items:flex-start;padding:.75rem;
  border:1px solid ${palette.border};border-radius:.5rem;margin-bottom:.5rem;flex-wrap:wrap;
`;
const OverrideMeta = styled.div`flex:1;min-width:12rem;`;
const Divider = styled.div`border-top:1px solid ${palette.border};margin:1.25rem 0;`;
const EmptyState = styled.div`text-align:center;padding:2rem;color:${palette.textSubtle};font-size:.875rem;`;

// System-rule defaults (mirrors receipt.constants.ts for display purposes)
const DEFAULTS = {
  dailyScanLimit: 10,
  minTransactionValue: 1,
  maxTransactionValue: null as number | null,
  autoApproveThreshold: 30,
};

interface RuleFormState {
  dailyScanLimit: string;
  minTransactionValue: string;
  maxTransactionValue: string;
  autoApproveThreshold: string;
  notes: string;
}

function ruleToForm(rule: FraudRule | null): RuleFormState {
  return {
    dailyScanLimit:      rule?.dailyScanLimit       != null ? String(rule.dailyScanLimit)       : '',
    minTransactionValue: rule?.minTransactionValue  != null ? String(rule.minTransactionValue)  : '',
    maxTransactionValue: rule?.maxTransactionValue  != null ? String(rule.maxTransactionValue)  : '',
    autoApproveThreshold:rule?.autoApproveThreshold != null ? String(rule.autoApproveThreshold) : '',
    notes:               rule?.notes ?? '',
  };
}

function parseNum(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function OverrideFormSection({ systemRuleId }: { systemRuleId: string }) {
  const qc = useQueryClient();
  const { data: overridesData, isLoading } = useQuery({
    queryKey: ['fraud-rule-overrides', systemRuleId],
    queryFn: () => adminSettingsService.getFraudRuleOverrides(systemRuleId),
  });

  const [targetType, setTargetType] = useState<'user' | 'partner'>('user');
  const [targetId, setTargetId]     = useState('');
  const [field, setField]           = useState<'dailyScanLimit' | 'minTransactionValue' | 'maxTransactionValue' | 'autoApproveThreshold'>('dailyScanLimit');
  const [value, setValue]           = useState('');
  const [reason, setReason]         = useState('');
  const [expiresAt, setExpiresAt]   = useState('');

  const createMutation = useMutation({
    mutationFn: () => adminSettingsService.createFraudRuleOverride(systemRuleId, {
      targetType,
      targetId: targetId.trim(),
      override: { [field]: parseNum(value) },
      reason: reason.trim() || undefined,
      expiresAt: expiresAt || undefined,
    }),
    onSuccess: () => {
      toast.success('Наложено изключение');
      qc.invalidateQueries({ queryKey: ['fraud-rule-overrides', systemRuleId] });
      setTargetId(''); setValue(''); setReason(''); setExpiresAt('');
    },
    onError: () => toast.error('Грешка при записване на изключение'),
  });

  const deleteMutation = useMutation({
    mutationFn: (overId: string) => adminSettingsService.deleteFraudRuleOverride(systemRuleId, overId),
    onSuccess: () => {
      toast.success('Изключението е премахнато');
      qc.invalidateQueries({ queryKey: ['fraud-rule-overrides', systemRuleId] });
    },
    onError: () => toast.error('Грешка при изтриване'),
  });

  const overrides = overridesData?.data ?? [];

  return (
    <>
      <Divider />
      <SectionTitle>Ръчни изключения (Manual override)</SectionTitle>
      <SectionSubtitle>
        Позволява на администратор да наложи различни прагове за конкретен потребител или партньор.
      </SectionSubtitle>

      {isLoading ? (
        <EmptyState>Зареждане…</EmptyState>
      ) : overrides.length === 0 ? (
        <EmptyState>Няма активни изключения</EmptyState>
      ) : (
        overrides.map(ov => (
          <OverrideRow key={ov.id}>
            <OverrideMeta>
              <div style={{ fontWeight: 600, fontSize: '.875rem', color: palette.text }}>
                {ov.targetType === 'user' ? '👤 Потребител' : '🏢 Партньор'}: <code style={{ fontSize: '.8rem' }}>{ov.targetId.slice(0, 16)}…</code>
              </div>
              <div style={{ fontSize: '.75rem', color: palette.textSubtle, marginTop: '.2rem' }}>
                {Object.entries(ov.override).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                {ov.reason && ` — ${ov.reason}`}
                {ov.expiresAt && ` · изтича ${new Date(ov.expiresAt).toLocaleDateString('bg-BG')}`}
              </div>
            </OverrideMeta>
            <Btn
              $variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(ov.id)}
            >
              Премахни
            </Btn>
          </OverrideRow>
        ))
      )}

      <Divider />
      <SectionTitle style={{ marginBottom: '.5rem' }}>Ново изключение</SectionTitle>
      <FormGrid>
        <FormField>
          <FormLabel>Тип</FormLabel>
          <FormSelect value={targetType} onChange={e => setTargetType(e.target.value as 'user' | 'partner')}>
            <option value="user">Потребител</option>
            <option value="partner">Партньор</option>
          </FormSelect>
        </FormField>
        <FormField>
          <FormLabel>ID на {targetType === 'user' ? 'потребителя' : 'партньора'}</FormLabel>
          <FormInput placeholder="UUID…" value={targetId} onChange={e => setTargetId(e.target.value)} />
        </FormField>
        <FormField>
          <FormLabel>Праг</FormLabel>
          <FormSelect value={field} onChange={e => setField(e.target.value as typeof field)}>
            <option value="dailyScanLimit">Дневен лимит (бр.)</option>
            <option value="minTransactionValue">Минимална сума (лв.)</option>
            <option value="maxTransactionValue">Максимална сума (лв.)</option>
            <option value="autoApproveThreshold">Авто-одобрение (скор)</option>
          </FormSelect>
        </FormField>
        <FormField>
          <FormLabel>Стойност</FormLabel>
          <FormInput type="number" placeholder="0" value={value} onChange={e => setValue(e.target.value)} />
        </FormField>
        <FormField>
          <FormLabel>Причина (незадължително)</FormLabel>
          <FormInput placeholder="Причина за изключението…" value={reason} onChange={e => setReason(e.target.value)} />
        </FormField>
        <FormField>
          <FormLabel>Изтича на (незадължително)</FormLabel>
          <FormInput type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
          <Hint>Оставете празно за постоянно изключение</Hint>
        </FormField>
      </FormGrid>
      <Btn
        $variant="primary"
        disabled={!targetId.trim() || !value || createMutation.isPending}
        onClick={() => createMutation.mutate()}
      >
        {createMutation.isPending ? 'Записва…' : 'Добави изключение'}
      </Btn>
    </>
  );
}

// ── System-wide thresholds (formerly under Settings → System) ────────────────
// Spec §7.4 places global limits/thresholds in Контрол; spec §9 keeps Системни
// настройки to emails, locale, timezone, and maintenance mode only.

const AuditStamp = styled.p`font-size:.72rem;color:${palette.textSubtle};margin:0;`;
const ThresholdFooter = styled.div`
  display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;
  gap:.5rem;margin-top:1rem;padding-top:.875rem;border-top:1px solid ${palette.border};
`;

function GlobalThresholdsCard() {
  const qc = useQueryClient();
  const [maxFraud, setMaxFraud] = useState('60');
  const [corrWarn, setCorrWarn] = useState('30');
  const [dailyLimit, setDailyLimit] = useState('');
  const [maxCashback, setMaxCashback] = useState('');
  const [currency, setCurrency] = useState('BGN');

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['admin-system-settings'],
    queryFn: () => adminSettingsService.getSystemSettings(),
  });

  // Seed local form state from the server on first successful load only.
  // Subsequent refetches (e.g. post-save invalidate, or recovery from a 429
  // via "Опитай отново") MUST NOT overwrite the user's in-flight edits — the
  // refetch would otherwise silently revert any field the user touched after
  // clicking Save and before the new GET landed.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!data?.data || didInitRef.current) return;
    didInitRef.current = true;
    if (data.data.max_fraud_score !== undefined)              setMaxFraud(data.data.max_fraud_score);
    if (data.data.correction_warning_threshold !== undefined) setCorrWarn(data.data.correction_warning_threshold);
    setDailyLimit(data.data.daily_scan_limit_default ?? '');
    setMaxCashback(data.data.max_cashback_per_month ?? '');
    if (data.data.currency !== undefined)                     setCurrency(data.data.currency);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (settings: Record<string, string>) =>
      adminSettingsService.saveSystemSettings(settings),
    onSuccess: () => {
      toast.success('Лимитите са запазени');
      qc.invalidateQueries({ queryKey: ['admin-system-settings'] });
    },
    onError: (err: unknown) => {
      toast.error(describeApiError(err).message);
    },
  });

  const save = () => {
    const fraud = parseInt(maxFraud, 10);
    if (!Number.isFinite(fraud) || !Number.isInteger(fraud) || fraud < 0 || fraud > 100) {
      toast.error('Прагът за оповестяване на измама трябва да е цяло число между 0 и 100');
      return;
    }
    const warn = parseInt(corrWarn, 10);
    if (!Number.isFinite(warn) || !Number.isInteger(warn) || warn < 0 || warn > 100) {
      toast.error('Прагът за предупреждение трябва да е цяло число между 0 и 100');
      return;
    }
    if (dailyLimit) {
      const dl = parseInt(dailyLimit, 10);
      if (!Number.isFinite(dl) || dl < 1) {
        toast.error('Дневният лимит за сканиране трябва да е цяло число ≥ 1');
        return;
      }
    }
    if (maxCashback) {
      const mc = parseFloat(maxCashback);
      if (!Number.isFinite(mc) || mc < 1) {
        toast.error('Макс. кешбек за 30 дни трябва да е число ≥ 1. За без таван оставете полето празно.');
        return;
      }
    }
    // Always persist the integer thresholds. For clearable keys
    // (daily_scan_limit_default, max_cashback_per_month) only include them in
    // the payload when the user has set a value OR the server already had one
    // — otherwise an empty value would issue a no-op deleteMany on the backend.
    // Send '' explicitly only when the user is clearing a previously-set value.
    const payload: Record<string, string> = {
      max_fraud_score: maxFraud,
      correction_warning_threshold: corrWarn,
    };
    const serverDaily = data?.data?.daily_scan_limit_default;
    const serverCashback = data?.data?.max_cashback_per_month;
    if (dailyLimit !== '' || serverDaily !== undefined) {
      payload.daily_scan_limit_default = dailyLimit;
    }
    if (maxCashback !== '' || serverCashback !== undefined) {
      payload.max_cashback_per_month = maxCashback;
    }
    mutation.mutate(payload);
  };

  const meta = data?.meta ?? {};

  return (
    <Card>
      <CardHeader>
        <div>
          <SectionTitle>Глобални прагове и лимити</SectionTitle>
          <SectionSubtitle>
            Системни стойности по подразбиране за оценка на измама, сканиране и кешбек.
            За правила на ниво партньор/потребител използвайте секциите по-долу.
          </SectionSubtitle>
        </div>
      </CardHeader>

      {isLoading ? (
        <EmptyState>Зареждане…</EmptyState>
      ) : isError ? (
        (() => {
          const info = describeApiError(error);
          return (
            <div style={{
              background: palette.dangerSoft,
              color: palette.danger,
              border: `1px solid ${palette.danger}`,
              borderRadius: '.5rem',
              padding: '.75rem 1rem',
              fontSize: '.8125rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '.75rem',
            }} role="alert">
              <span>
                Не можахме да заредим лимитите{info.status ? ` (${info.status})` : ''}: {info.message}
              </span>
              <Btn $variant="danger" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Опит…' : 'Опитай отново'}
              </Btn>
            </div>
          );
        })()
      ) : (
        <>
          <FormGrid>
            <FormField>
              <FormLabel>Праг за оповестяване на измама (0–100)</FormLabel>
              <FormInput
                type="number" min="0" max="100" step="1"
                value={maxFraud}
                onChange={(e) => setMaxFraud(e.target.value)}
              />
              <Hint>
                Бонове с оценка ≥ тази стойност задействат известие за измама до администраторите и собственика на партньора. По подразбиране: 60.
              </Hint>
            </FormField>
            <FormField>
              <FormLabel>Праг за предупреждение при корекция (0–100)</FormLabel>
              <FormInput
                type="number" min="0" max="100" step="1"
                value={corrWarn}
                onChange={(e) => setCorrWarn(e.target.value)}
              />
              <Hint>
                Ако преизчислената оценка за измама надвиши тази стойност след ръчна корекция, се показва предупреждение. По подразбиране: 30.
              </Hint>
            </FormField>
            <FormField>
              <FormLabel>Дневен лимит за сканиране (на потребител)</FormLabel>
              <FormInput
                type="number" min="1"
                placeholder="без лимит"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
              />
              <Hint>
                Макс. брой касови бележки на потребител на ден (глобално). Оставете празно за без лимит.
              </Hint>
            </FormField>
            <FormField>
              <FormLabel>Макс. кешбек за 30 дни ({currency === 'BGN' ? 'лв.' : '€'})</FormLabel>
              <FormInput
                type="number" min="1"
                placeholder="без таван"
                value={maxCashback}
                onChange={(e) => setMaxCashback(e.target.value)}
              />
              <Hint>
                Таван на кешбек, който абонат може да спечели за последните 30 дни (плъзгащ прозорец). Оставете празно за без таван.
              </Hint>
            </FormField>
          </FormGrid>
          <ThresholdFooter>
            <AuditStamp>{formatAuditStamp(latestMeta(['max_fraud_score', 'correction_warning_threshold', 'daily_scan_limit_default', 'max_cashback_per_month'], meta))}</AuditStamp>
            <Row>
              <Link
                to="/admin/settings/system"
                style={{ fontSize: '.8125rem', color: palette.textMuted, textDecoration: 'underline' }}
              >
                Локализация и контакти →
              </Link>
              <Btn $variant="success" onClick={save} disabled={mutation.isPending || isLoading || isRefetching}>
                {mutation.isPending ? 'Записва…' : isRefetching ? 'Обновяване…' : 'Запази'}
              </Btn>
            </Row>
          </ThresholdFooter>
        </>
      )}
    </Card>
  );
}

export default function AdminControlRulesPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormState>(ruleToForm(null));
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['fraud-rules'],
    queryFn: () => adminSettingsService.getFraudRules(),
  });

  const rules = data?.data ?? [];
  // Active SYSTEM rule drives the primary display; inactive SYSTEM rules appear in the history block.
  const systemRule = rules.find(r => r.tier === 'SYSTEM' && r.isActive) ?? null;
  const otherRules = rules.filter(r => r.tier !== 'SYSTEM');

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof adminSettingsService.patchFraudRule>[1] }) =>
      adminSettingsService.patchFraudRule(id, patch),
    onSuccess: () => {
      toast.success('Правилото е записано');
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['fraud-rules'] });
    },
    onError: () => toast.error('Грешка при записване'),
  });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof adminSettingsService.createFraudRule>[0]) =>
      adminSettingsService.createFraudRule(body),
    onSuccess: () => {
      toast.success('Правилото е създадено');
      setShowCreate(false);
      setForm(ruleToForm(null));
      qc.invalidateQueries({ queryKey: ['fraud-rules'] });
    },
    onError: () => toast.error('Грешка при създаване'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => adminSettingsService.patchFraudRule(id, { isActive: false }),
    onSuccess: () => {
      toast.success('Правилото е деактивирано');
      qc.invalidateQueries({ queryKey: ['fraud-rules'] });
    },
    onError: () => toast.error('Грешка'),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => adminSettingsService.patchFraudRule(id, { isActive: true }),
    onSuccess: () => {
      toast.success('Правилото е активирано');
      qc.invalidateQueries({ queryKey: ['fraud-rules'] });
    },
    onError: () => toast.error('Грешка'),
  });

  const startEdit = (rule: FraudRule) => {
    setEditingId(rule.id);
    setForm(ruleToForm(rule));
  };

  const saveEdit = () => {
    if (!editingId) return;
    patchMutation.mutate({
      id: editingId,
      patch: {
        dailyScanLimit:       parseNum(form.dailyScanLimit),
        minTransactionValue:  parseNum(form.minTransactionValue),
        maxTransactionValue:  parseNum(form.maxTransactionValue),
        autoApproveThreshold: parseNum(form.autoApproveThreshold),
        notes: form.notes.trim() || null,
      },
    });
  };

  const handleCreate = () => {
    createMutation.mutate({
      tier: 'SYSTEM',
      dailyScanLimit:       parseNum(form.dailyScanLimit),
      minTransactionValue:  parseNum(form.minTransactionValue),
      maxTransactionValue:  parseNum(form.maxTransactionValue),
      autoApproveThreshold: parseNum(form.autoApproveThreshold),
      notes: form.notes.trim() || null,
    });
  };

  const f = (v: string, key: keyof RuleFormState) =>
    setForm(prev => ({ ...prev, [key]: v }));

  const RuleEditForm = ({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) => (
    <>
      <FormGrid>
        <FormField>
          <FormLabel>Дневен лимит (бр. транзакции)</FormLabel>
          <FormInput type="number" min="1" placeholder={`по подразбиране: ${DEFAULTS.dailyScanLimit}`}
            value={form.dailyScanLimit} onChange={e => f(e.target.value, 'dailyScanLimit')} />
          <Hint>Глобалното максимално число сканирания на ден на потребител</Hint>
        </FormField>
        <FormField>
          <FormLabel>Минимална сума (лв.)</FormLabel>
          <FormInput type="number" min="0" step="0.01" placeholder={`по подразбиране: ${DEFAULTS.minTransactionValue}`}
            value={form.minTransactionValue} onChange={e => f(e.target.value, 'minTransactionValue')} />
          <Hint>Бележки под тази сума се маркират като подозрителни</Hint>
        </FormField>
        <FormField>
          <FormLabel>Максимална сума (лв.)</FormLabel>
          <FormInput type="number" min="0" step="0.01" placeholder="без ограничение"
            value={form.maxTransactionValue} onChange={e => f(e.target.value, 'maxTransactionValue')} />
          <Hint>Бележки над тази сума получават допълнителни точки на риск</Hint>
        </FormField>
        <FormField>
          <FormLabel>Авто-одобрение (праг на скор)</FormLabel>
          <FormInput type="number" min="0" max="100" placeholder={`по подразбиране: ${DEFAULTS.autoApproveThreshold}`}
            value={form.autoApproveThreshold} onChange={e => f(e.target.value, 'autoApproveThreshold')} />
          <Hint>Скор ≤ тази стойност → авто-одобрение; 31–60 → преглед; 61+ → висок риск</Hint>
        </FormField>
        <FormField style={{ gridColumn: '1 / -1' }}>
          <FormLabel>Бележки</FormLabel>
          <FormTextarea placeholder="Защо се въвежда тази промяна…"
            value={form.notes} onChange={e => f(e.target.value, 'notes')} />
        </FormField>
      </FormGrid>
      <Row>
        <Btn $variant="success" onClick={onSave} disabled={saving}>
          {saving ? 'Записва…' : 'Запази'}
        </Btn>
        <Btn $variant="ghost" onClick={onCancel} disabled={saving}>Отказ</Btn>
      </Row>
    </>
  );

  if (isLoading) {
    return (
      <PageShell>
        <PageHeader><TitleBlock><Eyebrow>Контрол</Eyebrow><PageTitle>Лимити и правила</PageTitle></TitleBlock></PageHeader>
        <EmptyState>Зареждане…</EmptyState>
      </PageShell>
    );
  }

  // Computed after early-return so TypeScript's noUnusedLocals sees the usage
  const inactiveSystemRules = rules.filter(r => r.tier === 'SYSTEM' && !r.isActive);

  return (
    <PageShell>
      <PageHeader>
        <TitleBlock>
          <Eyebrow>Контрол</Eyebrow>
          <PageTitle>Лимити и правила</PageTitle>
          <PageSubtitle>
            Глобални прагове за измами и сканиране, авто-одобрение и ръчни изключения
          </PageSubtitle>
        </TitleBlock>
      </PageHeader>

      {/* Global system thresholds (max fraud score, correction warning, daily scan limit, max cashback per 30d) */}
      <GlobalThresholdsCard />

      {/* System (global) rule */}
      <Card>
        <CardHeader>
          <div>
            <SectionTitle>
              <TierBadge $tier="SYSTEM">SYSTEM</TierBadge>{' '}Системни прагове (глобални)
            </SectionTitle>
            <SectionSubtitle>
              Прилагат се за всички потребители и партньори, освен ако не е наложено изключение.
            </SectionSubtitle>
          </div>
          {systemRule && editingId !== systemRule.id && (
            <Row>
              <Btn $variant="primary" onClick={() => startEdit(systemRule)}>Редактирай</Btn>
              {systemRule.isActive && (
                <Btn $variant="danger" disabled={deactivateMutation.isPending}
                  onClick={() => deactivateMutation.mutate(systemRule.id)}>
                  Деактивирай
                </Btn>
              )}
            </Row>
          )}
        </CardHeader>

        {!systemRule && !showCreate && (
          <>
            <EmptyState>Няма активно системно правило. Използват се вградените константи.</EmptyState>
            <RuleGrid style={{ marginBottom: '1rem' }}>
              <FieldCard>
                <FieldLabel>Дневен лимит</FieldLabel>
                <FieldValue>{DEFAULTS.dailyScanLimit}</FieldValue>
                <FieldDefault>вградена константа</FieldDefault>
              </FieldCard>
              <FieldCard>
                <FieldLabel>Мин. сума</FieldLabel>
                <FieldValue>{DEFAULTS.minTransactionValue} лв.</FieldValue>
                <FieldDefault>вградена константа</FieldDefault>
              </FieldCard>
              <FieldCard>
                <FieldLabel>Макс. сума</FieldLabel>
                <FieldValue>—</FieldValue>
                <FieldDefault>без ограничение</FieldDefault>
              </FieldCard>
              <FieldCard>
                <FieldLabel>Авто-одобрение</FieldLabel>
                <FieldValue>≤ {DEFAULTS.autoApproveThreshold}</FieldValue>
                <FieldDefault>вградена константа</FieldDefault>
              </FieldCard>
            </RuleGrid>
            <Btn $variant="primary" onClick={() => { setForm(ruleToForm(null)); setShowCreate(true); }}>
              + Създай системно правило
            </Btn>
          </>
        )}

        {!systemRule && showCreate && (
          <RuleEditForm
            onSave={handleCreate}
            onCancel={() => setShowCreate(false)}
            saving={createMutation.isPending}
          />
        )}

        {systemRule && editingId !== systemRule.id && (
          <>
            <RuleGrid>
              <FieldCard>
                <FieldLabel>Дневен лимит</FieldLabel>
                <FieldValue>
                  {systemRule.dailyScanLimit ?? DEFAULTS.dailyScanLimit}
                  {systemRule.dailyScanLimit == null && <span style={{ fontSize: '.75rem', color: palette.textSubtle }}> (вградена)</span>}
                </FieldValue>
                <FieldDefault>бр. транзакции / ден</FieldDefault>
              </FieldCard>
              <FieldCard>
                <FieldLabel>Мин. сума</FieldLabel>
                <FieldValue>
                  {systemRule.minTransactionValue ?? DEFAULTS.minTransactionValue} лв.
                  {systemRule.minTransactionValue == null && <span style={{ fontSize: '.75rem', color: palette.textSubtle }}> (вградена)</span>}
                </FieldValue>
              </FieldCard>
              <FieldCard>
                <FieldLabel>Макс. сума</FieldLabel>
                <FieldValue>
                  {systemRule.maxTransactionValue != null ? `${systemRule.maxTransactionValue} лв.` : '—'}
                </FieldValue>
              </FieldCard>
              <FieldCard>
                <FieldLabel>Авто-одобрение (скор)</FieldLabel>
                <FieldValue>
                  ≤ {systemRule.autoApproveThreshold ?? DEFAULTS.autoApproveThreshold}
                  {systemRule.autoApproveThreshold == null && <span style={{ fontSize: '.75rem', color: palette.textSubtle }}> (вградена)</span>}
                </FieldValue>
                <FieldDefault>0–{systemRule.autoApproveThreshold ?? DEFAULTS.autoApproveThreshold}: авто · {(systemRule.autoApproveThreshold ?? DEFAULTS.autoApproveThreshold) + 1}–60: преглед · 61+: висок риск</FieldDefault>
              </FieldCard>
            </RuleGrid>
            {systemRule.notes && (
              <div style={{ marginTop: '1rem', fontSize: '.8125rem', color: palette.textMuted }}>
                <strong>Бележки:</strong> {systemRule.notes}
              </div>
            )}
            <div style={{ marginTop: '.75rem', fontSize: '.75rem', color: palette.textSubtle }}>
              <StatusDot $active={systemRule.isActive} />
              {systemRule.isActive ? 'Активно' : 'Деактивирано'} ·{' '}
              актуализирано {new Date(systemRule.updatedAt).toLocaleDateString('bg-BG')}
            </div>
          </>
        )}

        {systemRule && editingId === systemRule.id && (
          <RuleEditForm
            onSave={saveEdit}
            onCancel={() => setEditingId(null)}
            saving={patchMutation.isPending}
          />
        )}

        {/* Override section only makes sense when a SYSTEM rule exists */}
        {systemRule && <OverrideFormSection systemRuleId={systemRule.id} />}

        {/* Inactive SYSTEM rules — history, with option to reactivate */}
        {inactiveSystemRules.length > 0 && (
          <>
            <Divider />
            <SectionTitle>Неактивни системни правила</SectionTitle>
            <SectionSubtitle>Деактивирани версии — могат да бъдат повторно активирани.</SectionSubtitle>
            {inactiveSystemRules.map(rule => (
              <OverrideRow key={rule.id}>
                <OverrideMeta>
                  <div style={{ fontSize: '.75rem', color: palette.textMuted }}>
                    {[
                      rule.dailyScanLimit       != null && `Дн. лимит: ${rule.dailyScanLimit}`,
                      rule.minTransactionValue  != null && `Мин: ${rule.minTransactionValue} лв.`,
                      rule.maxTransactionValue  != null && `Макс: ${rule.maxTransactionValue} лв.`,
                      rule.autoApproveThreshold != null && `Авто-одобрение ≤ ${rule.autoApproveThreshold}`,
                    ].filter(Boolean).join(' · ') || 'Без специфични стойности'}
                  </div>
                  {rule.notes && <div style={{ fontSize: '.72rem', color: palette.textSubtle, marginTop: '.15rem' }}>{rule.notes}</div>}
                  <div style={{ fontSize: '.72rem', color: palette.textSubtle, marginTop: '.15rem' }}>
                    <StatusDot $active={false} />деактивирано · актуализирано {new Date(rule.updatedAt).toLocaleDateString('bg-BG')}
                  </div>
                </OverrideMeta>
                <Btn $variant="success" disabled={reactivateMutation.isPending}
                  onClick={() => reactivateMutation.mutate(rule.id)}>
                  Активирай
                </Btn>
              </OverrideRow>
            ))}
          </>
        )}
      </Card>

      {/* Other (non-SYSTEM) rules */}
      {otherRules.length > 0 && (
        <Card>
          <SectionTitle>Правила по партньор / потребител</SectionTitle>
          <SectionSubtitle>Специфични правила за отделни партньори или потребители. Могат да бъдат активирани/деактивирани от тук, но се създават и редактират само чрез API.</SectionSubtitle>
          {otherRules.map(rule => (
            <OverrideRow key={rule.id}>
              <OverrideMeta>
                <Row>
                  <TierBadge $tier={rule.tier}>{TIER_LABELS[rule.tier] ?? rule.tier}</TierBadge>
                  <StatusDot $active={rule.isActive} />
                  <span style={{ fontSize: '.75rem', color: palette.textSubtle }}>
                    {rule.targetId ? `ID: ${rule.targetId.slice(0, 12)}…` : '—'}
                  </span>
                </Row>
                <div style={{ fontSize: '.75rem', color: palette.textMuted, marginTop: '.3rem' }}>
                  {[
                    rule.dailyScanLimit       != null && `Дн. лимит: ${rule.dailyScanLimit}`,
                    rule.minTransactionValue  != null && `Мин: ${rule.minTransactionValue} лв.`,
                    rule.maxTransactionValue  != null && `Макс: ${rule.maxTransactionValue} лв.`,
                    rule.autoApproveThreshold != null && `Авто-одобрение ≤ ${rule.autoApproveThreshold}`,
                  ].filter(Boolean).join(' · ') || 'Без специфични стойности'}
                </div>
                {rule.notes && <div style={{ fontSize: '.72rem', color: palette.textSubtle, marginTop: '.15rem' }}>{rule.notes}</div>}
              </OverrideMeta>
              <Row>
                {rule.isActive ? (
                  <Btn $variant="danger" disabled={deactivateMutation.isPending || reactivateMutation.isPending}
                    onClick={() => deactivateMutation.mutate(rule.id)}>
                    Деактивирай
                  </Btn>
                ) : (
                  <Btn $variant="success" disabled={deactivateMutation.isPending || reactivateMutation.isPending}
                    onClick={() => reactivateMutation.mutate(rule.id)}>
                    Активирай
                  </Btn>
                )}
              </Row>
            </OverrideRow>
          ))}
        </Card>
      )}
    </PageShell>
  );
}
