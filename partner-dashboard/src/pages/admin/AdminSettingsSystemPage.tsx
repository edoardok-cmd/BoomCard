import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminSettingsService, SystemSettingMeta } from '../../services/adminSettings.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  info: '#2563eb', infoSoft: '#dbeafe',
  danger: '#dc2626', dangerSoft: '#fee2e2',
  warning: '#b45309', warningSoft: '#fef3c7',
  success: '#4a7c59',
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

const TextArea = styled.textarea`
  width: 100%;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  box-sizing: border-box;
  outline: none;
  resize: vertical;
  min-height: 5rem;
  font-family: inherit;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
  &::placeholder { color: ${palette.textSubtle}; }
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0;
`;
const ToggleLabel = styled.div``;
const ToggleName = styled.span`font-size: 0.875rem; font-weight: 600; color: ${palette.text}; display: block;`;
const ToggleDesc = styled.span`font-size: 0.75rem; color: ${palette.textSubtle};`;

const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 2.5rem;
  height: 1.375rem;
  flex-shrink: 0;
`;
const ToggleInput = styled.input.attrs({ type: 'checkbox' })`
  opacity: 0; width: 0; height: 0;
  &:checked + span { background: ${palette.warning}; }
  &:checked + span::before { transform: translateX(1.125rem); }
`;
const ToggleSlider = styled.span`
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: ${palette.border};
  border-radius: 999px;
  transition: background 0.2s;
  &::before {
    content: '';
    position: absolute;
    height: 1rem; width: 1rem;
    left: 0.1875rem; bottom: 0.1875rem;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }
`;

const MaintenanceBanner = styled.div<{ $visible: boolean }>`
  display: ${({ $visible }) => ($visible ? 'block' : 'none')};
  padding: 0.875rem 1.25rem;
  background: ${palette.warningSoft};
  color: ${palette.warning};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  max-width: 100%;
`;

const SelectInput = styled.select`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  cursor: pointer;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
`;

const SubLabel = styled.p`
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${palette.textSubtle};
  margin: 0 0 0.75rem;
`;

const CardFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid ${palette.border};
`;

const AuditStamp = styled.p`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin: 0;
`;

// ── Confirmation modal for maintenance mode ──────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
`;

const ModalBox = styled.div`
  background: ${palette.surface};
  border-radius: 0.75rem;
  padding: 2rem;
  max-width: 28rem;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
`;

const ModalTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.warning};
  margin: 0 0 0.75rem;
`;

const ModalBody = styled.p`
  font-size: 0.9rem;
  color: ${palette.textMuted};
  line-height: 1.6;
  margin: 0 0 1.5rem;
`;

const ModalActions = styled.div`
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
`;

const CancelBtn = styled.button`
  padding: 0.5625rem 1.25rem;
  background: transparent;
  color: ${palette.textMuted};
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: ${palette.bg}; }
`;

const DangerBtn = styled.button`
  padding: 0.5625rem 1.25rem;
  background: ${palette.warning};
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { opacity: 0.9; }
`;

// ── Constants ────────────────────────────────────────────────────────────────

const TIMEZONES = [
  'Europe/Sofia',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Athens',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
];

const LANGUAGES = [
  { value: 'bg', label: 'Български (BG)' },
  { value: 'en', label: 'English (EN)' },
];

const CURRENCIES = [
  { value: 'BGN', label: 'BGN — Български лев' },
  { value: 'EUR', label: 'EUR — Евро' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Helpers ───────────────────────────────────────────────────────────────────

function latestMeta(
  keys: string[],
  meta: Record<string, SystemSettingMeta>,
): SystemSettingMeta | null {
  let latest: SystemSettingMeta | null = null;
  for (const k of keys) {
    const m = meta[k];
    if (!m) continue;
    if (!latest || m.updatedAt > latest.updatedAt) latest = m;
  }
  return latest;
}

function formatAuditStamp(m: SystemSettingMeta | null): string {
  if (!m) return '';
  const d = new Date(m.updatedAt);
  const date = d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
  const by = m.updatedByName ? ` от ${m.updatedByName}` : '';
  return `Последно обновено: ${date} ${time}${by}`;
}

// ── Shared mutation hook ──────────────────────────────────────────────────────

function useSystemSettingsMutation(successMsg: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Record<string, string>) =>
      adminSettingsService.saveSystemSettings(settings),
    onSuccess: () => {
      toast.success(successMsg);
      queryClient.invalidateQueries({ queryKey: ['admin-system-settings'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Грешка при запазване';
      toast.error(msg);
    },
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminSettingsSystemPage() {
  // ── Card 1: Лимити и прагове ─────────────────────────────────────────────
  const [maxFraud, setMaxFraud] = useState('60');
  const [corrWarn, setCorrWarn] = useState('30');
  const [dailyLimit, setDailyLimit] = useState('');
  const [maxCashback, setMaxCashback] = useState('');

  // ── Card 2: Контакт за поддръжка ─────────────────────────────────────────
  const [supportEmail, setSupportEmail] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [senderName, setSenderName] = useState('');

  // ── Card 3: Локализация ──────────────────────────────────────────────────
  const [language, setLanguage] = useState('bg');
  const [currency, setCurrency] = useState('BGN');
  const [timezone, setTimezone] = useState('Europe/Sofia');

  // ── Card 4: Режим на поддръжка ───────────────────────────────────────────
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  // Pending toggle value while awaiting confirmation
  const [pendingMaintenance, setPendingMaintenance] = useState<boolean | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-system-settings'],
    queryFn: () => adminSettingsService.getSystemSettings(),
  });

  const meta = data?.meta ?? {};

  useEffect(() => {
    if (!data?.data) return;
    if (data.data.max_fraud_score !== undefined)            setMaxFraud(data.data.max_fraud_score);
    if (data.data.correction_warning_threshold !== undefined) setCorrWarn(data.data.correction_warning_threshold);
    setDailyLimit(data.data.daily_scan_limit_default ?? '');
    setMaxCashback(data.data.max_cashback_per_month ?? '');
    setSupportEmail(data.data.support_email ?? '');
    setSupportPhone(data.data.support_phone ?? '');
    setReplyToEmail(data.data.reply_to_email ?? '');
    setFromEmail(data.data.from_email ?? '');
    setSenderName(data.data.sender_name ?? '');
    if (data.data.language !== undefined)  setLanguage(data.data.language);
    if (data.data.currency !== undefined)  setCurrency(data.data.currency);
    if (data.data.timezone !== undefined)  setTimezone(data.data.timezone);
    setMaintenanceMode(data.data.maintenance_mode === 'true');
    setMaintenanceMessage(data.data.maintenance_message ?? '');
  }, [data]);

  // ── Per-card mutations ────────────────────────────────────────────────────

  const limitsMutation       = useSystemSettingsMutation('Лимитите са запазени');
  const contactMutation      = useSystemSettingsMutation('Контактите са запазени');
  const localizationMutation = useSystemSettingsMutation('Локализацията е запазена');
  const maintenanceMutation  = useSystemSettingsMutation('Режимът на поддръжка е обновен');

  // ── Per-card save handlers ────────────────────────────────────────────────

  const saveLimits = () => {
    const fraud = parseInt(maxFraud, 10);
    if (!Number.isFinite(fraud) || !Number.isInteger(fraud) || fraud < 0 || fraud > 100) {
      toast.error('Макс. оценка за измама трябва да е цяло число между 0 и 100');
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
    limitsMutation.mutate({
      max_fraud_score: maxFraud,
      correction_warning_threshold: corrWarn,
      daily_scan_limit_default: dailyLimit,
      max_cashback_per_month: maxCashback,
    });
  };

  const saveContact = () => {
    if (supportEmail && !EMAIL_RE.test(supportEmail)) {
      toast.error('Имейлът за поддръжка трябва да е валиден адрес');
      return;
    }
    if (replyToEmail && !EMAIL_RE.test(replyToEmail)) {
      toast.error('Reply-To имейлът трябва да е валиден адрес');
      return;
    }
    if (fromEmail && !EMAIL_RE.test(fromEmail)) {
      toast.error('Изпращащият имейл трябва да е валиден адрес');
      return;
    }
    contactMutation.mutate({
      support_email: supportEmail,
      support_phone: supportPhone,
      reply_to_email: replyToEmail,
      from_email: fromEmail,
      sender_name: senderName,
    });
  };

  const saveLocalization = () => {
    localizationMutation.mutate({ language, currency, timezone });
  };

  // Maintenance save — explicit `enabled` avoids relying on stale maintenanceMode
  // closure value (React state updates are async; callers must pass the intended value).
  const commitMaintenance = (enabled: boolean) => {
    maintenanceMutation.mutate({
      maintenance_mode: String(enabled),
      maintenance_message: maintenanceMessage,
    });
  };

  const serverMaintenanceEnabled = data?.data?.maintenance_mode === 'true';

  // Toggle: enabling requires confirmation only when the server is currently OFF.
  // If the server is already ON and the user toggled OFF then back ON (local-only
  // revert), skip the modal — no server state change is happening.
  const handleMaintenanceToggle = (checked: boolean) => {
    if (checked) {
      if (!serverMaintenanceEnabled) {
        setPendingMaintenance(true);
      } else {
        setMaintenanceMode(true);
      }
    } else {
      setMaintenanceMode(false);
    }
  };

  const cancelMaintenance = () => {
    setPendingMaintenance(null);
  };

  // Save: show confirmation only when enabling for the first time (OFF→ON vs server).
  const saveMaintenance = () => {
    if (maintenanceMode && !serverMaintenanceEnabled) {
      setPendingMaintenance(true);
    } else {
      commitMaintenance(maintenanceMode);
    }
  };

  // Confirmed from modal: enable + persist in one step.
  const confirmAndSave = () => {
    setMaintenanceMode(true);
    setPendingMaintenance(null);
    commitMaintenance(true);
  };

  return (
    <PageShell>
      {/* Maintenance mode confirmation modal */}
      {pendingMaintenance !== null && (
        <Overlay>
          <ModalBox>
            <ModalTitle>⚠ Активиране на режим на поддръжка</ModalTitle>
            <ModalBody>
              Режимът на поддръжка ще блокира достъпа на <strong>всички потребители</strong> до
              мобилното приложение. Те ще видят съобщение за поддръжка и няма да могат да сканират
              бонове или да извършват транзакции.
              <br /><br />
              Сигурни ли сте, че искате да продължите?
            </ModalBody>
            <ModalActions>
              <CancelBtn onClick={cancelMaintenance}>Отказ</CancelBtn>
              <DangerBtn onClick={confirmAndSave} disabled={maintenanceMutation.isPending}>
                {maintenanceMutation.isPending ? 'Запазване…' : 'Да, активирай'}
              </DangerBtn>
            </ModalActions>
          </ModalBox>
        </Overlay>
      )}

      <PageHeader>
        <Eyebrow>Настройки</Eyebrow>
        <PageTitle>Системни настройки</PageTitle>
        <PageSubtitle>
          Глобални прагове за измами, лимити за сканиране, контакти за поддръжка, локализация и режим на поддръжка.
        </PageSubtitle>
      </PageHeader>

      <MaintenanceBanner $visible={maintenanceMode}>
        Системата е в режим на поддръжка — потребителите виждат съобщение за поддръжка и не могат да използват приложението.
      </MaintenanceBanner>

      <Grid>
        {/* ── Card 1: Лимити и прагове ──────────────────────────────────── */}
        <Card>
          <CardTitle>Лимити и прагове</CardTitle>
          <p style={{ fontSize: '0.8rem', color: palette.textSubtle, margin: '0 0 1.25rem', lineHeight: 1.5 }}>
            Глобални стойности по подразбиране. За правила на ниво партньор или потребител вижте{' '}
            <strong>Контрол → Лимити и правила</strong>. За изплащания вижте{' '}
            <Link to="/admin/settings/thresholds" style={{ color: palette.accent }}>Настройки → Прагове</Link>.{' '}
            За валидност на кешбек и оферти вижте{' '}
            <Link to="/admin/settings/validity" style={{ color: palette.accent }}>Настройки → Валидност</Link>.
          </p>
          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
          ) : (
            <FieldGroup>
              <SubLabel>Измами и сканиране</SubLabel>
              <div>
                <FieldLabel>Праг за оповестяване на измама (0–100)</FieldLabel>
                <NumberInput
                  type="number" min="0" max="100" step="1"
                  value={maxFraud}
                  onChange={(e) => setMaxFraud(e.target.value)}
                />
                <FieldHint>Бонове с оценка ≥ тази стойност задействат известие за измама до администраторите и собственика на партньора. Всички бонове отиват за ръчен преглед независимо от оценката. По подразбиране: 60.</FieldHint>
              </div>
              <div>
                <FieldLabel>Праг за предупреждение при корекция (0–100)</FieldLabel>
                <NumberInput
                  type="number" min="0" max="100" step="1"
                  value={corrWarn}
                  onChange={(e) => setCorrWarn(e.target.value)}
                />
                <FieldHint>
                  Ако преизчислената оценка за измама надвиши тази стойност след ръчна корекция на сума от администратор, се показва предупреждение. По подразбиране: 30.
                </FieldHint>
              </div>
              <div>
                <FieldLabel>Дневен лимит за сканиране (на потребител)</FieldLabel>
                <NumberInput
                  type="number" min="1"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder="без лимит"
                />
                <FieldHint>Макс. брой касови бележки на потребител на ден (глобално, не на обект). Оставете празно за без лимит.</FieldHint>
              </div>
              <div>
                <FieldLabel>Макс. кешбек за 30 дни ({currency === 'BGN' ? 'лв.' : '€'})</FieldLabel>
                <NumberInput
                  type="number" min="1"
                  value={maxCashback}
                  onChange={(e) => setMaxCashback(e.target.value)}
                  placeholder="без таван"
                />
                <FieldHint>
                  Таван на кешбек, който абонат може да спечели за последните 30 дни (плъзгащ прозорец). Оставете празно за без таван. Минимална стойност: 1 — стойност 0 не е позволена и ще блокира целия кешбек.
                </FieldHint>
              </div>
            </FieldGroup>
          )}
          <CardFooter>
            <AuditStamp>{formatAuditStamp(latestMeta(['max_fraud_score', 'correction_warning_threshold', 'daily_scan_limit_default', 'max_cashback_per_month'], meta))}</AuditStamp>
            <SaveBtn onClick={saveLimits} disabled={limitsMutation.isPending || isLoading}>
              {limitsMutation.isPending ? 'Запазване…' : 'Запази'}
            </SaveBtn>
          </CardFooter>
        </Card>

        {/* ── Card 2: Контакт за поддръжка ──────────────────────────────── */}
        <Card>
          <CardTitle>Контакт за поддръжка</CardTitle>
          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
          ) : (
            <FieldGroup>
              <div>
                <FieldLabel>Email за поддръжка</FieldLabel>
                <TextInput
                  type="email"
                  placeholder="office@boomcard.bg"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                />
                <FieldHint>Показва се в мобилното приложение и футъри на имейли.</FieldHint>
              </div>
              <div>
                <FieldLabel>Телефон за поддръжка</FieldLabel>
                <TextInput
                  type="tel"
                  placeholder="+359 2 …"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                />
                <FieldHint>Показва се на екрана за контакти в приложението.</FieldHint>
              </div>
              <div>
                <FieldLabel>Email за отговор (Reply-To)</FieldLabel>
                <TextInput
                  type="email"
                  placeholder="reply@boomcard.bg"
                  value={replyToEmail}
                  onChange={(e) => setReplyToEmail(e.target.value)}
                />
                <FieldHint>
                  Reply-To заглавка на системните имейли. При липса заглавката се пропуска — отговорите отиват към изпращащия адрес (From).
                </FieldHint>
              </div>
              <div>
                <FieldLabel>Изпращащ имейл (From)</FieldLabel>
                <TextInput
                  type="email"
                  placeholder="noreply@boomcard.bg"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                />
                <FieldHint>
                  Адресът в полето „От:" на всички системни имейли. При липса се използва адресът от SMTP конфигурацията на сървъра.
                </FieldHint>
              </div>
              <div>
                <FieldLabel>Изпращащо име (From Name)</FieldLabel>
                <TextInput
                  type="text"
                  placeholder="BoomCard"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                />
                <FieldHint>
                  Показваното име до имейл адреса, напр. „BoomCard &lt;noreply@boomcard.bg&gt;".
                </FieldHint>
              </div>
            </FieldGroup>
          )}
          <CardFooter>
            <AuditStamp>{formatAuditStamp(latestMeta(['support_email', 'support_phone', 'reply_to_email', 'from_email', 'sender_name'], meta))}</AuditStamp>
            <SaveBtn onClick={saveContact} disabled={contactMutation.isPending || isLoading}>
              {contactMutation.isPending ? 'Запазване…' : 'Запази'}
            </SaveBtn>
          </CardFooter>
        </Card>

        {/* ── Card 3: Локализация ───────────────────────────────────────── */}
        <Card>
          <CardTitle>Локализация</CardTitle>
          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
          ) : (
            <FieldGroup>
              <div>
                <FieldLabel>Език по подразбиране</FieldLabel>
                <SelectInput value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </SelectInput>
                <FieldHint>
                  Език по подразбиране за системни имейли и администраторски интерфейс при липса на потребителски предпочитания.
                </FieldHint>
              </div>
              <div>
                <FieldLabel>Валута</FieldLabel>
                <SelectInput value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </SelectInput>
                <FieldHint>Валута, показана в суми за изплащане, бонове и финансови отчети.</FieldHint>
              </div>
              <div>
                <FieldLabel>Часова зона</FieldLabel>
                <SelectInput value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </SelectInput>
                <FieldHint>
                  Използва се за показване на дати в администраторския интерфейс и за планиране на нощни задачи (напр. обновяване на динамичен списък).
                </FieldHint>
              </div>
            </FieldGroup>
          )}
          <CardFooter>
            <AuditStamp>{formatAuditStamp(latestMeta(['language', 'currency', 'timezone'], meta))}</AuditStamp>
            <SaveBtn onClick={saveLocalization} disabled={localizationMutation.isPending || isLoading}>
              {localizationMutation.isPending ? 'Запазване…' : 'Запази'}
            </SaveBtn>
          </CardFooter>
        </Card>

        {/* ── Card 4: Режим на поддръжка ───────────────────────────────── */}
        <Card style={{ borderColor: maintenanceMode ? palette.warning : palette.border }}>
          <CardTitle style={{ color: maintenanceMode ? palette.warning : palette.text }}>
            Режим на поддръжка
          </CardTitle>
          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
          ) : (
            <FieldGroup>
              <div>
                <ToggleRow>
                  <ToggleLabel>
                    <ToggleName style={{ color: maintenanceMode ? palette.warning : palette.text }}>
                      {maintenanceMode ? 'Активиран — потребителите виждат екран за поддръжка' : 'Деактивиран — системата работи нормално'}
                    </ToggleName>
                    <ToggleDesc>Спира достъпа до мобилното приложение и показва съобщение за поддръжка.</ToggleDesc>
                  </ToggleLabel>
                  <ToggleSwitch>
                    <ToggleInput
                      checked={maintenanceMode}
                      onChange={(e) => handleMaintenanceToggle(e.target.checked)}
                    />
                    <ToggleSlider />
                  </ToggleSwitch>
                </ToggleRow>
              </div>
              <div>
                <FieldLabel>Съобщение за поддръжка</FieldLabel>
                <TextArea
                  placeholder="напр. Системата се обновява. Очаквайте ни отново до 30 минути."
                  value={maintenanceMessage}
                  onChange={(e) => setMaintenanceMessage(e.target.value)}
                />
                <FieldHint>Показва се на потребителите, докато режимът на поддръжка е активен. Оставете празно за съобщение по подразбиране.</FieldHint>
              </div>
            </FieldGroup>
          )}
          <CardFooter>
            <AuditStamp>{formatAuditStamp(latestMeta(['maintenance_mode', 'maintenance_message'], meta))}</AuditStamp>
            <SaveBtn
              onClick={saveMaintenance}
              disabled={maintenanceMutation.isPending || isLoading}
            >
              {maintenanceMutation.isPending ? 'Запазване…' : 'Запази'}
            </SaveBtn>
          </CardFooter>
        </Card>
      </Grid>
    </PageShell>
  );
}
