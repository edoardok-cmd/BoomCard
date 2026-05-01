import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminSettingsService } from '../../services/adminSettings.service';

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

export default function AdminSettingsSystemPage() {
  const queryClient = useQueryClient();
  const [maxFraud, setMaxFraud] = useState('80');
  const [autoApprove, setAutoApprove] = useState('10');
  const [dailyLimit, setDailyLimit] = useState('');
  const [maxCashback, setMaxCashback] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [language, setLanguage] = useState('bg');
  const [currency, setCurrency] = useState('BGN');
  const [timezone, setTimezone] = useState('Europe/Sofia');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-system-settings'],
    queryFn: () => adminSettingsService.getSystemSettings(),
  });

  useEffect(() => {
    if (!data?.data) return;
    if (data.data.max_fraud_score)        setMaxFraud(data.data.max_fraud_score);
    if (data.data.auto_approve_threshold) setAutoApprove(data.data.auto_approve_threshold);
    if (data.data.daily_scan_limit_default) setDailyLimit(data.data.daily_scan_limit_default);
    if (data.data.max_cashback_per_month) setMaxCashback(data.data.max_cashback_per_month);
    if (data.data.support_email)          setSupportEmail(data.data.support_email);
    if (data.data.support_phone)          setSupportPhone(data.data.support_phone);
    if (data.data.reply_to_email)         setReplyToEmail(data.data.reply_to_email);
    if (data.data.from_email)             setFromEmail(data.data.from_email);
    if (data.data.sender_name)            setSenderName(data.data.sender_name);
    if (data.data.language)               setLanguage(data.data.language);
    if (data.data.currency)               setCurrency(data.data.currency);
    if (data.data.timezone)               setTimezone(data.data.timezone);
    setMaintenanceMode(data.data.maintenance_mode === 'true');
    setMaintenanceMessage(data.data.maintenance_message ?? '');
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const settings: Record<string, string> = {
        max_fraud_score: maxFraud,
        auto_approve_threshold: autoApprove,
        support_email: supportEmail,
        support_phone: supportPhone,
        reply_to_email: replyToEmail,
        from_email: fromEmail,
        sender_name: senderName,
        language,
        currency,
        timezone,
        maintenance_mode: String(maintenanceMode),
        maintenance_message: maintenanceMessage,
      };
      if (dailyLimit) settings.daily_scan_limit_default = dailyLimit;
      if (maxCashback) settings.max_cashback_per_month = maxCashback;
      return adminSettingsService.saveSystemSettings(settings);
    },
    onSuccess: () => {
      toast.success('Системните настройки са запазени');
      queryClient.invalidateQueries({ queryKey: ['admin-system-settings'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Грешка при запазване';
      toast.error(msg);
    },
  });

  const handleSave = () => {
    const fraud = parseInt(maxFraud, 10);
    if (!Number.isFinite(fraud) || !Number.isInteger(fraud) || fraud < 0 || fraud > 100) {
      toast.error('Макс. оценка за измама трябва да е цяло число между 0 и 100');
      return;
    }
    const approve = parseFloat(autoApprove);
    if (!Number.isFinite(approve) || approve < 0 || approve > 100000) {
      toast.error('Прагът за автоматично одобрение трябва да е число между 0 и 100 000');
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
      if (!Number.isFinite(mc) || mc < 0) {
        toast.error('Макс. кешбек за 30 дни трябва да е число ≥ 0');
        return;
      }
    }
    saveMutation.mutate();
  };

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Настройки</Eyebrow>
        <PageTitle>Система</PageTitle>
        <PageSubtitle>
          Глобални прагове за измами, лимити за сканиране, контакти за поддръжка и локализация.
        </PageSubtitle>
      </PageHeader>

      <MaintenanceBanner $visible={maintenanceMode}>
        Системата е в режим на поддръжка — потребителите виждат съобщение за поддръжка и не могат да използват приложението.
      </MaintenanceBanner>

      <Grid>
        <Card>
          <CardTitle>Лимити за измами и сканиране</CardTitle>
          <p style={{ fontSize: '0.8rem', color: palette.textSubtle, margin: '0 0 1.25rem', lineHeight: 1.5 }}>
            Глобални стойности по подразбиране. За правила на ниво партньор или потребител вижте <strong>Контрол → Лимити и правила</strong>.
          </p>
          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
          ) : (
            <FieldGroup>
              <div>
                <FieldLabel>Макс. оценка за измама (0–100)</FieldLabel>
                <NumberInput
                  type="number" min="0" max="100" step="1"
                  value={maxFraud}
                  onChange={(e) => setMaxFraud(e.target.value)}
                />
                <FieldHint>Бонове с по-висока оценка се изпращат за РЪЧЕН ПРЕГЛЕД. По подразбиране: 80.</FieldHint>
              </div>
              <div>
                <FieldLabel>Праг за автоматично одобрение (лв.)</FieldLabel>
                <NumberInput
                  type="number" min="0" max="100000" step="0.01"
                  value={autoApprove}
                  onChange={(e) => setAutoApprove(e.target.value)}
                />
                <FieldHint>Бонове под тази сума се одобряват автоматично независимо от оценката. По подразбиране: 10.</FieldHint>
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
                <FieldLabel>Макс. кешбек за 30 дни (лв.)</FieldLabel>
                <NumberInput
                  type="number" min="0"
                  value={maxCashback}
                  onChange={(e) => setMaxCashback(e.target.value)}
                  placeholder="без таван"
                />
                <FieldHint>Таван на кешбек, който абонат може да спечели за последните 30 дни (плъзгащ прозорец). Оставете празно за без таван.</FieldHint>
              </div>
            </FieldGroup>
          )}
        </Card>

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
                  placeholder="support@boomcard.bg"
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
                  placeholder=""
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
                  placeholder=""
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
        </Card>

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
        </Card>
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
                      onChange={(e) => setMaintenanceMode(e.target.checked)}
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
        </Card>
      </Grid>

      <div style={{ marginTop: '1.5rem' }}>
        <SaveBtn onClick={handleSave} disabled={saveMutation.isPending || isLoading}>
          {saveMutation.isPending ? 'Запазване…' : 'Запази всички'}
        </SaveBtn>
      </div>
    </PageShell>
  );
}
