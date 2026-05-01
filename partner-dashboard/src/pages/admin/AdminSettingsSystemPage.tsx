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
  { value: 'USD', label: 'USD — Щатски долар' },
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
  const [language, setLanguage] = useState('bg');
  const [currency, setCurrency] = useState('BGN');
  const [timezone, setTimezone] = useState('Europe/Sofia');

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
    if (data.data.language)               setLanguage(data.data.language);
    if (data.data.currency)               setCurrency(data.data.currency);
    if (data.data.timezone)               setTimezone(data.data.timezone);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const settings: Record<string, string> = {
        max_fraud_score: maxFraud,
        auto_approve_threshold: autoApprove,
        support_email: supportEmail,
        support_phone: supportPhone,
        reply_to_email: replyToEmail,
        language,
        currency,
        timezone,
      };
      if (dailyLimit) settings.daily_scan_limit_default = dailyLimit;
      if (maxCashback) settings.max_cashback_per_month = maxCashback;
      return adminSettingsService.saveSystemSettings(settings);
    },
    onSuccess: () => {
      toast.success('Системните настройки са запазени');
      queryClient.invalidateQueries({ queryKey: ['admin-system-settings'] });
    },
    onError: () => toast.error('Грешка при запазване'),
  });

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Настройки</Eyebrow>
        <PageTitle>Система</PageTitle>
        <PageSubtitle>
          Глобални прагове за измами, лимити за сканиране, контакти за поддръжка и локализация.
        </PageSubtitle>
      </PageHeader>

      <Grid>
        <Card>
          <CardTitle>Лимити за измами и сканиране</CardTitle>
          {isLoading ? (
            <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
          ) : (
            <FieldGroup>
              <div>
                <FieldLabel>Макс. оценка за измама (0–100)</FieldLabel>
                <NumberInput
                  type="number" min="0" max="100"
                  value={maxFraud}
                  onChange={(e) => setMaxFraud(e.target.value)}
                />
                <FieldHint>Бонове с по-висока оценка се изпращат за РЪЧЕН ПРЕГЛЕД. По подразбиране: 80.</FieldHint>
              </div>
              <div>
                <FieldLabel>Праг за автоматично одобрение (лв.)</FieldLabel>
                <NumberInput
                  type="number" min="0"
                  value={autoApprove}
                  onChange={(e) => setAutoApprove(e.target.value)}
                />
                <FieldHint>Бонове под тази сума се одобряват автоматично независимо от оценката. По подразбиране: 10.</FieldHint>
              </div>
              <div>
                <FieldLabel>Дневен лимит за сканиране (на обект)</FieldLabel>
                <NumberInput
                  type="number" min="1"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder="без лимит"
                />
                <FieldHint>Макс. брой сканирания на потребител на обект на ден. Оставете празно за без лимит.</FieldHint>
              </div>
              <div>
                <FieldLabel>Макс. кешбек на месец (лв.)</FieldLabel>
                <NumberInput
                  type="number" min="0"
                  value={maxCashback}
                  onChange={(e) => setMaxCashback(e.target.value)}
                  placeholder="без таван"
                />
                <FieldHint>Таван на кешбек, който абонат може да спечели за календарен месец. Оставете празно за без таван.</FieldHint>
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
                  placeholder="noreply@boomcard.bg"
                  value={replyToEmail}
                  onChange={(e) => setReplyToEmail(e.target.value)}
                />
                <FieldHint>
                  Използва се като Reply-To заглавка на всички системни имейли. Оставете празно за email за поддръжка.
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
      </Grid>

      <div style={{ marginTop: '1.5rem' }}>
        <SaveBtn onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
          {saveMutation.isPending ? 'Запазване…' : 'Запази всички'}
        </SaveBtn>
      </div>
    </PageShell>
  );
}
