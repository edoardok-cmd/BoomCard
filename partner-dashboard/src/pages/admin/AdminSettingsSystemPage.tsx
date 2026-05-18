import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminSettingsService, SystemSettingHistoryRow } from '../../services/adminSettings.service';
import { latestMeta, formatAuditStamp, describeApiError } from '../../utils/systemSettingsAudit';

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
const ResetLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: ${palette.accent};
  cursor: pointer;
  margin-left: 0.375rem;
  &:hover { text-decoration: underline; }
`;
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

// ── Error panel for failed initial GET ──────────────────────────────────────
// Replaces the entire form Grid when the system-settings query errors. Without
// this, all three cards rendered with empty inputs and Save buttons enabled —
// clicking Запази would PUT empty strings and clobber server state.

const ErrorPanel = styled.div`
  background: ${palette.dangerSoft};
  border: 1px solid ${palette.danger};
  color: ${palette.danger};
  border-radius: 0.75rem;
  padding: 1.25rem 1.5rem;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
`;
const ErrorPanelText = styled.div`flex: 1;`;
const ErrorPanelTitle = styled.p`font-weight: 700; margin: 0 0 0.25rem;`;
const ErrorPanelDetail = styled.p`margin: 0; font-size: 0.8125rem; opacity: 0.85;`;
const RetryBtn = styled.button`
  padding: 0.5rem 1rem;
  background: ${palette.danger};
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  &:hover { opacity: 0.9; }
  &:disabled { opacity: 0.5; cursor: default; }
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

// ── History ───────────────────────────────────────────────────────────────────

const HistoryList = styled.div`display: flex; flex-direction: column; gap: 0.4rem; max-height: 16rem; overflow-y: auto; margin-top: 0.75rem;`;
const HistoryItem = styled.div`
  display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 0.5rem;
  padding: 0.5rem 0.625rem; border: 1px solid ${palette.border}; border-radius: 0.5rem;
  background: ${palette.bg}; font-size: 0.7875rem;
`;
const KeyBadge = styled.span`
  display: inline-block; padding: 0.08rem 0.4rem; border-radius: 0.2rem;
  font-size: 0.67rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  background: #f3e8de; color: #c96442; white-space: nowrap;
`;
const HistoryDate = styled.span`font-size: 0.7rem; color: ${palette.textSubtle}; white-space: nowrap;`;

const SYSTEM_KEY_LABELS: Record<string, string> = {
  office_email:          'Email партньори (office@)',
  support_email:         'Email поддръжка (support@)',
  support_phone:         'Телефон',
  partner_reply_to_email:'Reply-To за партньори',
  reply_to_email:        'Reply-To за абонати',
  from_email:            'From имейл',
  sender_name:           'Изпращач',
  language:              'Език',
  currency:              'Валута',
  timezone:              'Часова зона',
  date_format:           'Формат на дата',
  number_format:         'Формат на числа',
  maintenance_mode:      'Поддръжка',
  maintenance_message:   'Съобщение',
};

const CONTACT_KEYS      = ['office_email', 'support_email', 'support_phone', 'partner_reply_to_email', 'reply_to_email', 'from_email', 'sender_name'];
const LOCALIZATION_KEYS = ['language', 'currency', 'timezone', 'date_format', 'number_format'];
const MAINTENANCE_KEYS  = ['maintenance_mode', 'maintenance_message'];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('bg-BG', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function SystemHistoryRows({ rows, loading }: { rows: SystemSettingHistoryRow[]; loading: boolean }) {
  if (loading) return <p style={{ color: '#8c8678', fontSize: '0.8125rem', margin: '0.5rem 0 0' }}>Зареждане…</p>;
  if (rows.length === 0) return <p style={{ color: '#8c8678', fontSize: '0.8125rem', margin: '0.5rem 0 0' }}>Няма история.</p>;
  return (
    <HistoryList>
      {rows.map(row => (
        <HistoryItem key={row.id}>
          <div>
            <KeyBadge>{SYSTEM_KEY_LABELS[row.key] ?? row.key}</KeyBadge>
            <div style={{ marginTop: '0.25rem', color: '#141413', fontSize: '0.7875rem' }}>
              {row.oldValue !== null && row.oldValue !== ''
                ? <><span style={{ color: '#8c8678' }}>{row.oldValue || '—'}</span>{' → '}<strong>{row.newValue || '(изчистено)'}</strong></>
                : <strong>{row.newValue || '(изчистено)'}</strong>
              }
            </div>
            {row.changedByName && (
              <div style={{ fontSize: '0.7rem', color: '#8c8678', marginTop: '0.1rem' }}>от {row.changedByName}</div>
            )}
            {row.notes && (
              <div style={{ fontSize: '0.7rem', color: '#605a50', marginTop: '0.15rem', fontStyle: 'italic' }}>
                „{row.notes}"
              </div>
            )}
          </div>
          <HistoryDate>{fmtDate(row.createdAt)}</HistoryDate>
        </HistoryItem>
      ))}
    </HistoryList>
  );
}

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

// ── Shared mutation hook ──────────────────────────────────────────────────────

function useSystemSettingsMutation(successMsg: string, onSaved?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ settings, notes }: { settings: Record<string, string>; notes?: string }) =>
      adminSettingsService.saveSystemSettings(settings, notes),
    onSuccess: () => {
      toast.success(successMsg);
      onSaved?.();
      queryClient.invalidateQueries({ queryKey: ['admin-system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin-system-settings-history'] });
    },
    onError: (err: unknown) => {
      toast.error(describeApiError(err).message);
    },
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminSettingsSystemPage() {
  // ── Card 1: Контакт за поддръжка ─────────────────────────────────────────
  const [officeEmail, setOfficeEmail]                   = useState('');
  const [supportEmail, setSupportEmail]                 = useState('');
  const [supportPhone, setSupportPhone]                 = useState('');
  const [partnerReplyToEmail, setPartnerReplyToEmail]   = useState('');
  const [replyToEmail, setReplyToEmail]                 = useState('');
  const [fromEmail, setFromEmail]                       = useState('');
  const [senderName, setSenderName]                     = useState('');

  // ── Card 2: Локализация ──────────────────────────────────────────────────
  const [language, setLanguage]     = useState('bg');
  const [currency, setCurrency]     = useState('BGN');
  const [timezone, setTimezone]     = useState('Europe/Sofia');
  const [dateFormat, setDateFormat] = useState('DD.MM.YYYY');
  const [numberFormat, setNumberFormat] = useState('1 234,56');

  // ── Card 3: Режим на поддръжка ───────────────────────────────────────────
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  // ── Per-card notes (причина за промяната) ───────────────────────────────
  const [contactNotes, setContactNotes]           = useState('');
  const [localizationNotes, setLocalizationNotes] = useState('');
  const [maintenanceNotes, setMaintenanceNotes]   = useState('');

  // Pending toggle value while awaiting confirmation
  const [pendingMaintenance, setPendingMaintenance] = useState<boolean | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['admin-system-settings'],
    queryFn: () => adminSettingsService.getSystemSettings(),
  });

  const { data: contactHistoryData, isLoading: contactHistoryLoading } = useQuery({
    queryKey: ['admin-system-settings-history', 'contact'],
    queryFn: () => adminSettingsService.getSystemSettingsHistory(CONTACT_KEYS),
  });

  const { data: localizationHistoryData, isLoading: localizationHistoryLoading } = useQuery({
    queryKey: ['admin-system-settings-history', 'localization'],
    queryFn: () => adminSettingsService.getSystemSettingsHistory(LOCALIZATION_KEYS),
  });

  const { data: maintenanceHistoryData, isLoading: maintenanceHistoryLoading } = useQuery({
    queryKey: ['admin-system-settings-history', 'maintenance'],
    queryFn: () => adminSettingsService.getSystemSettingsHistory(MAINTENANCE_KEYS),
  });

  const meta = data?.meta ?? {};

  // Seed local form state from the server on first successful load only.
  // Subsequent refetches (per-card save invalidate) MUST NOT clobber edits in
  // sibling cards — each card has its own Save button and the user may have
  // edits queued in another card while one is being saved.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!data?.data || didInitRef.current) return;
    didInitRef.current = true;
    setOfficeEmail(data.data.office_email ?? '');
    setSupportEmail(data.data.support_email ?? '');
    setSupportPhone(data.data.support_phone ?? '');
    setPartnerReplyToEmail(data.data.partner_reply_to_email ?? '');
    setReplyToEmail(data.data.reply_to_email ?? '');
    setFromEmail(data.data.from_email ?? '');
    setSenderName(data.data.sender_name ?? '');
    if (data.data.language !== undefined)     setLanguage(data.data.language);
    if (data.data.currency !== undefined)     setCurrency(data.data.currency);
    if (data.data.timezone !== undefined)     setTimezone(data.data.timezone);
    if (data.data.date_format !== undefined)  setDateFormat(data.data.date_format);
    if (data.data.number_format !== undefined) setNumberFormat(data.data.number_format);
    setMaintenanceMode(data.data.maintenance_mode === 'true');
    setMaintenanceMessage(data.data.maintenance_message ?? '');
  }, [data]);

  // ── Per-card mutations ────────────────────────────────────────────────────

  const contactMutation      = useSystemSettingsMutation('Контактите са запазени',      () => setContactNotes(''));
  const localizationMutation = useSystemSettingsMutation('Локализацията е запазена',     () => setLocalizationNotes(''));
  const maintenanceMutation  = useSystemSettingsMutation('Режимът на поддръжка е обновен', () => setMaintenanceNotes(''));

  // ── Per-card save handlers ────────────────────────────────────────────────

  const saveContact = () => {
    const emailFields: [string, string][] = [
      ['office_email', officeEmail],
      ['support_email', supportEmail],
      ['partner_reply_to_email', partnerReplyToEmail],
      ['reply_to_email', replyToEmail],
      ['from_email', fromEmail],
    ];
    for (const [label, val] of emailFields) {
      if (val && !EMAIL_RE.test(val)) {
        toast.error(`${SYSTEM_KEY_LABELS[label] ?? label} трябва да е валиден имейл адрес`);
        return;
      }
    }
    contactMutation.mutate({
      settings: {
        office_email:           officeEmail,
        support_email:          supportEmail,
        support_phone:          supportPhone,
        partner_reply_to_email: partnerReplyToEmail,
        reply_to_email:         replyToEmail,
        from_email:             fromEmail,
        sender_name:            senderName,
      },
      notes: contactNotes || undefined,
    });
  };

  const saveLocalization = () => {
    localizationMutation.mutate({
      settings: { language, currency, timezone, date_format: dateFormat, number_format: numberFormat },
      notes: localizationNotes || undefined,
    });
  };

  // Maintenance save — explicit `enabled` avoids relying on stale maintenanceMode
  // closure value (React state updates are async; callers must pass the intended value).
  const commitMaintenance = (enabled: boolean) => {
    maintenanceMutation.mutate({
      settings: {
        maintenance_mode:    String(enabled),
        maintenance_message: maintenanceMessage,
      },
      notes: maintenanceNotes || undefined,
    });
  };

  const serverMaintenanceEnabled = data?.data?.maintenance_mode === 'true';

  const contactHistoryRows      = contactHistoryData?.data      ?? [];
  const localizationHistoryRows = localizationHistoryData?.data ?? [];
  const maintenanceHistoryRows  = maintenanceHistoryData?.data  ?? [];

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
          Системни имейли, локализация и режим на поддръжка.{' '}
          <Link
            to="/admin/control/rules"
            style={{ color: palette.textMuted, fontSize: '.8125rem', textDecoration: 'underline' }}
          >
            Глобални прагове и лимити →
          </Link>
        </PageSubtitle>
      </PageHeader>

      <MaintenanceBanner $visible={maintenanceMode}>
        Системата е в режим на поддръжка — потребителите виждат съобщение за поддръжка и не могат да използват приложението.
      </MaintenanceBanner>

      {isError ? (() => {
        const info = describeApiError(error);
        return (
          <ErrorPanel role="alert">
            <ErrorPanelText>
              <ErrorPanelTitle>
                Не можахме да заредим системните настройки
                {info.status ? ` (${info.status})` : ''}
              </ErrorPanelTitle>
              <ErrorPanelDetail>{info.message}</ErrorPanelDetail>
            </ErrorPanelText>
            <RetryBtn onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? 'Опит…' : 'Опитай отново'}
            </RetryBtn>
          </ErrorPanel>
        );
      })() : (
      <Grid>
        {/* ── Card 1: Контакт за поддръжка ──────────────────────────────── */}
        <Card>
          <CardTitle>Контакт за поддръжка</CardTitle>
          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
          ) : (
            <FieldGroup>
              <div>
                <FieldLabel>Email за партньори (office@)</FieldLabel>
                <TextInput
                  type="email"
                  placeholder="office@boomcard.bg"
                  value={officeEmail}
                  onChange={(e) => setOfficeEmail(e.target.value)}
                />
                <FieldHint>
                  Входящ адрес за партньорски заявки и кореспонденция. Използва се и като Reply-To в партньорски имейли.
                </FieldHint>
              </div>
              <div>
                <FieldLabel>Email за абонатска поддръжка (support@)</FieldLabel>
                <TextInput
                  type="email"
                  placeholder="support@boomcard.bg"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                />
                <FieldHint>Показва се в мобилното приложение и футъри на имейли. Входящ адрес за абонатска поддръжка.</FieldHint>
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
                <FieldLabel>Reply-To за партньорски имейли</FieldLabel>
                <TextInput
                  type="email"
                  placeholder="office@boomcard.bg"
                  value={partnerReplyToEmail}
                  onChange={(e) => setPartnerReplyToEmail(e.target.value)}
                />
                <FieldHint>
                  Reply-To заглавка за имейли изпратени до партньори. При липса се ползва стойността на office_email.
                </FieldHint>
              </div>
              <div>
                <FieldLabel>Reply-To за абонатски имейли</FieldLabel>
                <TextInput
                  type="email"
                  placeholder="support@boomcard.bg"
                  value={replyToEmail}
                  onChange={(e) => setReplyToEmail(e.target.value)}
                />
                <FieldHint>
                  Reply-To заглавка за имейли изпратени до абонати. При липса заглавката се пропуска.
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
                  {fromEmail !== 'noreply@boomcard.bg' && (
                    <ResetLink
                      type="button"
                      onClick={() => setFromEmail('noreply@boomcard.bg')}
                    >
                      Възстанови по подразбиране
                    </ResetLink>
                  )}
                </FieldHint>
              </div>
              <div>
                <FieldLabel>Изпращащо иМЕ (From Name)</FieldLabel>
                <TextInput
                  type="text"
                  placeholder="BoomCard"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                />
                <FieldHint>
                  Показваното иМЕ до имейл адреса, напр. „BoomCard &lt;noreply@boomcard.bg&gt;".
                </FieldHint>
              </div>
              <div>
                <FieldLabel>Причина за промяната (по желание)</FieldLabel>
                <TextInput
                  type="text"
                  placeholder="напр. Актуализиране на контактния имейл"
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                />
              </div>
            </FieldGroup>
          )}
          <CardFooter>
            <AuditStamp>{formatAuditStamp(latestMeta(['office_email', 'support_email', 'support_phone', 'partner_reply_to_email', 'reply_to_email', 'from_email', 'sender_name'], meta))}</AuditStamp>
            <SaveBtn onClick={saveContact} disabled={contactMutation.isPending || isLoading}>
              {contactMutation.isPending ? 'Запазване…' : 'Запази'}
            </SaveBtn>
          </CardFooter>
          <SystemHistoryRows rows={contactHistoryRows} loading={contactHistoryLoading} />
        </Card>

        {/* ── Card 2: Локализация ───────────────────────────────────────── */}
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
                  Използва се за крайните срокове на сканирания (06:00 следващата сутрин) и за показване на дати.
                </FieldHint>
              </div>
              <div>
                <FieldLabel>Формат на дата</FieldLabel>
                <SelectInput value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                  <option value="DD.MM.YYYY">DD.MM.YYYY (по подразбиране)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                </SelectInput>
                <FieldHint>Формат за показване на дати в интерфейса и експортирани отчети.</FieldHint>
              </div>
              <div>
                <FieldLabel>Формат на числа</FieldLabel>
                <SelectInput value={numberFormat} onChange={(e) => setNumberFormat(e.target.value)}>
                  <option value="1 234,56">1 234,56 — запетая като десетичен разделител (по подразбиране)</option>
                  <option value="1,234.56">1,234.56 — точка като десетичен разделител</option>
                </SelectInput>
                <FieldHint>Десетичен разделител за суми и проценти в отчети и потребителски интерфейс.</FieldHint>
              </div>
            </FieldGroup>
          )}
          <CardFooter>
            <AuditStamp>{formatAuditStamp(latestMeta(['language', 'currency', 'timezone', 'date_format', 'number_format'], meta))}</AuditStamp>
            <SaveBtn onClick={saveLocalization} disabled={localizationMutation.isPending || isLoading}>
              {localizationMutation.isPending ? 'Запазване…' : 'Запази'}
            </SaveBtn>
          </CardFooter>
          <SystemHistoryRows rows={localizationHistoryRows} loading={localizationHistoryLoading} />
        </Card>

        {/* ── Card 3: Режим на поддръжка ───────────────────────────────── */}
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
          <SystemHistoryRows rows={maintenanceHistoryRows} loading={maintenanceHistoryLoading} />
        </Card>
      </Grid>
      )}
    </PageShell>
  );
}
