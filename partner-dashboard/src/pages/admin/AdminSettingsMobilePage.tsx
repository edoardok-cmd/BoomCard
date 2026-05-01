import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  adminSettingsService,
  MobileAppSettings,
  MobileErrorLogEntry,
} from '../../services/adminSettings.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  warning: '#b5803a', warningSoft: '#f5ead2',
  success: '#4a7c59', successSoft: '#e6efe3',
  info: '#2563eb', infoSoft: '#dbeafe',
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
  max-width: 60rem;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem;`;
const WideCard = styled(Card)`grid-column: 1 / -1;`;
const CardTitle = styled.h2`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0 0 0.25rem;`;
const CardSubtitle = styled.p`font-size: 0.8125rem; color: ${palette.textMuted}; margin: 0 0 1.25rem;`;
const FieldGroup = styled.div`display: flex; flex-direction: column; gap: 1.25rem; margin-bottom: 1.5rem;`;
const FieldLabel = styled.label`font-size: 0.875rem; font-weight: 600; color: ${palette.textMuted}; display: block; margin-bottom: 0.375rem;`;
const FieldHint = styled.p`font-size: 0.8rem; color: ${palette.textSubtle}; margin: 0.25rem 0 0;`;

const TextInput = styled.input`
  width: 100%;
  max-width: 18rem;
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

const UrlInput = styled(TextInput)`max-width: 28rem;`;

const Select = styled.select`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  outline: none;
  cursor: pointer;
  &:focus { border-color: ${palette.accent}; }
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0;
  border-bottom: 1px solid ${palette.border};
  &:last-child { border-bottom: none; }
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
  opacity: 0;
  width: 0;
  height: 0;
  &:checked + span { background: ${palette.success}; }
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
    height: 1rem;
    width: 1rem;
    left: 0.1875rem;
    bottom: 0.1875rem;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }
`;

const WarningBox = styled.div<{ $visible: boolean }>`
  padding: 0.75rem 1rem;
  background: ${palette.dangerSoft};
  color: ${palette.danger};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  margin-bottom: 1.25rem;
  display: ${({ $visible }) => ($visible ? 'block' : 'none')};
  font-weight: 600;
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

const DangerBtn = styled.button`
  padding: 0.5rem 1rem;
  background: transparent;
  color: ${palette.danger};
  border: 1px solid ${palette.danger};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: ${palette.dangerSoft}; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 0.125rem 0.625rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: ${({ $status }) =>
    $status === 'active' ? palette.successSoft :
    $status === 'maintenance' ? palette.warningSoft : palette.dangerSoft};
  color: ${({ $status }) =>
    $status === 'active' ? palette.success :
    $status === 'maintenance' ? palette.warning : palette.danger};
`;

const STATUS_LABEL: Record<string, string> = {
  active:      'Активен',
  maintenance: 'Поддръжка',
  deprecated:  'Остарял',
};

// Error log table styles
const ErrorTable = styled.table`width: 100%; border-collapse: collapse; font-size: 0.8125rem;`;
const ETh = styled.th`
  text-align: left; padding: 0.5rem 0.75rem;
  border-bottom: 2px solid ${palette.border};
  color: ${palette.textMuted}; font-weight: 600; white-space: nowrap;
`;
const ETd = styled.td`
  padding: 0.5rem 0.75rem; border-bottom: 1px solid ${palette.border};
  color: ${palette.text}; vertical-align: top;
`;
const MessageCell = styled.td`
  padding: 0.5rem 0.75rem; border-bottom: 1px solid ${palette.border};
  color: ${palette.text}; vertical-align: top;
  max-width: 22rem;
`;
const MessageText = styled.span<{ $expanded: boolean }>`
  display: block;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: ${({ $expanded }) => ($expanded ? 'unset' : '2')};
  word-break: break-word;
`;
const ExpandBtn = styled.button`
  background: none; border: none; padding: 0; margin-top: 0.2rem;
  font-size: 0.75rem; color: ${palette.accent}; cursor: pointer;
  &:hover { text-decoration: underline; }
`;

const PlatformChip = styled.span<{ $p: string }>`
  display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px;
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  background: ${({ $p }) => $p === 'ios' ? palette.infoSoft : $p === 'android' ? palette.successSoft : palette.warningSoft};
  color: ${({ $p }) => $p === 'ios' ? palette.info : $p === 'android' ? palette.success : palette.warning};
`;
const EmptyState = styled.p`color: ${palette.textSubtle}; font-size: 0.875rem; text-align: center; padding: 2rem 0; margin: 0;`;

// Modal for stack trace
const ModalOverlay = styled.div`
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 1rem;
`;
const ModalBox = styled.div`
  background: ${palette.surface}; border-radius: 0.75rem; padding: 1.5rem;
  max-width: 50rem; width: 100%; max-height: 80vh; overflow: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
`;
const ModalTitle = styled.h3`font-size: 0.9375rem; font-weight: 700; color: ${palette.text}; margin: 0 0 0.75rem;`;
const StackPre = styled.pre`
  font-size: 0.75rem; background: ${palette.bg}; padding: 1rem; border-radius: 0.5rem;
  overflow: auto; white-space: pre-wrap; word-break: break-word;
  color: ${palette.text}; border: 1px solid ${palette.border}; margin: 0 0 1rem;
  max-height: 50vh;
`;
const CloseBtn = styled.button`
  padding: 0.5rem 1rem; background: ${palette.border}; border: none;
  border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600;
  cursor: pointer; color: ${palette.textMuted};
  &:hover { background: #ddd; }
`;

type MobileState = {
  minIos: string;
  minAndroid: string;
  iosStatus: string;
  androidStatus: string;
  featureReceiptScan: boolean;
  featureStickerScan: boolean;
  featurePartnerMap: boolean;
  pushEnabled: boolean;
  pushVapidTopic: string;
  errorLogUrl: string;
};

const DEFAULT_STATE: MobileState = {
  minIos: '',
  minAndroid: '',
  iosStatus: 'active',
  androidStatus: 'active',
  featureReceiptScan: true,
  featureStickerScan: true,
  featurePartnerMap: true,
  pushEnabled: true,
  pushVapidTopic: '',
  errorLogUrl: '',
};

function settingsToState(data: MobileAppSettings): MobileState {
  return {
    minIos:              data['mobile_app.min_ios_version']         ?? '',
    minAndroid:          data['mobile_app.min_android_version']     ?? '',
    iosStatus:           data['mobile_app.ios_status']              ?? 'active',
    androidStatus:       data['mobile_app.android_status']          ?? 'active',
    featureReceiptScan:  data['mobile_app.feature_receipt_scan']    !== 'false',
    featureStickerScan:  data['mobile_app.feature_sticker_scan']    !== 'false',
    featurePartnerMap:   data['mobile_app.feature_partner_map']     !== 'false',
    pushEnabled:         data['mobile_app.push_notifications_enabled'] !== 'false',
    pushVapidTopic:      data['mobile_app.push_vapid_topic']        ?? '',
    errorLogUrl:         data['mobile_app.error_log_url']           ?? '',
  };
}

function stateToSettings(s: MobileState): Partial<Record<keyof MobileAppSettings, string>> {
  return {
    'mobile_app.min_ios_version':            s.minIos,
    'mobile_app.min_android_version':        s.minAndroid,
    'mobile_app.ios_status':                 s.iosStatus,
    'mobile_app.android_status':             s.androidStatus,
    'mobile_app.feature_receipt_scan':       String(s.featureReceiptScan),
    'mobile_app.feature_sticker_scan':       String(s.featureStickerScan),
    'mobile_app.feature_partner_map':        String(s.featurePartnerMap),
    'mobile_app.push_notifications_enabled': String(s.pushEnabled),
    'mobile_app.push_vapid_topic':           s.pushVapidTopic,
    'mobile_app.error_log_url':              s.errorLogUrl,
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('bg-BG', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

type StackModal = { message: string; stack: string } | null;

function ErrorRow({ e }: { e: MobileErrorLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [modal, setModal] = useState<StackModal>(null);

  return (
    <>
      <tr>
        <ETd><PlatformChip $p={e.platform}>{e.platform}</PlatformChip></ETd>
        <ETd>{e.appVersion ?? '—'}</ETd>
        <ETd style={{ color: palette.textMuted }}>{e.errorType}</ETd>
        <MessageCell>
          <MessageText $expanded={expanded}>{e.message}</MessageText>
          {e.message.length > 120 && (
            <ExpandBtn onClick={() => setExpanded(x => !x)}>
              {expanded ? 'Скрий' : 'Покажи всичко'}
            </ExpandBtn>
          )}
          {e.stack && (
            <ExpandBtn onClick={() => setModal({ message: e.message, stack: e.stack! })} style={{ marginLeft: expanded ? '0.5rem' : '0' }}>
              Stack →
            </ExpandBtn>
          )}
        </MessageCell>
        <ETd style={{ whiteSpace: 'nowrap', color: palette.textSubtle }}>{formatDate(e.createdAt)}</ETd>
      </tr>
      {modal && (
        <ModalOverlay onClick={() => setModal(null)}>
          <ModalBox onClick={ev => ev.stopPropagation()}>
            <ModalTitle>Stack Trace</ModalTitle>
            <p style={{ fontSize: '0.8125rem', color: palette.textMuted, marginBottom: '0.75rem' }}>{modal.message}</p>
            <StackPre>{modal.stack}</StackPre>
            <CloseBtn onClick={() => setModal(null)}>Затвори</CloseBtn>
          </ModalBox>
        </ModalOverlay>
      )}
    </>
  );
}

export default function AdminSettingsMobilePage() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<MobileState>(DEFAULT_STATE);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-mobile-app-settings'],
    queryFn: () => adminSettingsService.getMobileAppSettings(),
  });

  const { data: errorsData, isLoading: errorsLoading } = useQuery({
    queryKey: ['admin-mobile-error-logs'],
    queryFn: () => adminSettingsService.getMobileErrorLogs(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!data?.data) return;
    setState(settingsToState(data.data));
  }, [data]);

  const set = <K extends keyof MobileState>(key: K, value: MobileState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: () => adminSettingsService.saveMobileAppSettings(stateToSettings(state)),
    onSuccess: () => {
      toast.success('Настройките на мобилното приложение са запазени');
      queryClient.invalidateQueries({ queryKey: ['admin-mobile-app-settings'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Грешка при запазване';
      toast.error(msg);
    },
  });

  const clearErrorsMutation = useMutation({
    mutationFn: () => adminSettingsService.clearMobileErrorLogs(),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ['admin-mobile-error-logs'] });
    },
    onError: () => toast.error('Грешка при изчистване на лога'),
  });

  const anyMaintenance =
    state.iosStatus !== 'active' || state.androidStatus !== 'active';

  const errors: MobileErrorLogEntry[] = errorsData?.data ?? [];

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Настройки</Eyebrow>
        <PageTitle>Мобилно приложение</PageTitle>
        <PageSubtitle>
          Изисквания за версия, статус на платформата, превключватели на функции, push известия и лог на грешки.
        </PageSubtitle>
      </PageHeader>

      <WarningBox $visible={anyMaintenance}>
        Една или повече платформи са в режим на поддръжка или са остарели — потребителите им виждат екран за поддръжка.
      </WarningBox>

      {isLoading ? (
        <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
      ) : (
        <Grid>
          {/* ── Версии и статус ── */}
          <Card>
            <CardTitle>Версии и статус</CardTitle>
            <CardSubtitle>Минимални изисквани версии и достъпност на платформата.</CardSubtitle>
            <FieldGroup>
              <div>
                <FieldLabel>Минимална iOS версия</FieldLabel>
                <TextInput
                  placeholder="напр. 2.1.0"
                  value={state.minIos}
                  onChange={(e) => set('minIos', e.target.value)}
                />
                <FieldHint>Потребителите под тази версия се подканват да актуализират. Оставете празно за всякакви версии.</FieldHint>
              </div>
              <div>
                <FieldLabel>iOS статус</FieldLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Select value={state.iosStatus} onChange={(e) => set('iosStatus', e.target.value)}>
                    <option value="active">Активен</option>
                    <option value="maintenance">Поддръжка</option>
                    <option value="deprecated">Остарял</option>
                  </Select>
                  <StatusBadge $status={state.iosStatus}>
                    {STATUS_LABEL[state.iosStatus] ?? state.iosStatus}
                  </StatusBadge>
                </div>
              </div>
              <div>
                <FieldLabel>Минимална Android версия</FieldLabel>
                <TextInput
                  placeholder="напр. 2.1.0"
                  value={state.minAndroid}
                  onChange={(e) => set('minAndroid', e.target.value)}
                />
                <FieldHint>Потребителите под тази версия се подканват да актуализират. Оставете празно за всякакви версии.</FieldHint>
              </div>
              <div>
                <FieldLabel>Android статус</FieldLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Select value={state.androidStatus} onChange={(e) => set('androidStatus', e.target.value)}>
                    <option value="active">Активен</option>
                    <option value="maintenance">Поддръжка</option>
                    <option value="deprecated">Остарял</option>
                  </Select>
                  <StatusBadge $status={state.androidStatus}>
                    {STATUS_LABEL[state.androidStatus] ?? state.androidStatus}
                  </StatusBadge>
                </div>
              </div>
            </FieldGroup>
          </Card>

          {/* ── Превключватели на функции ── */}
          <Card>
            <CardTitle>Превключватели на функции</CardTitle>
            <CardSubtitle>Включете или изключете отделни функции в мобилното приложение.</CardSubtitle>
            <ToggleRow>
              <ToggleLabel>
                <ToggleName>Сканиране на касов бон</ToggleName>
                <ToggleDesc>Позволете на потребителите да сканират и качват касови бонове за кешбек.</ToggleDesc>
              </ToggleLabel>
              <ToggleSwitch>
                <ToggleInput
                  checked={state.featureReceiptScan}
                  onChange={(e) => set('featureReceiptScan', e.target.checked)}
                />
                <ToggleSlider />
              </ToggleSwitch>
            </ToggleRow>
            <ToggleRow>
              <ToggleLabel>
                <ToggleName>Сканиране на стикер</ToggleName>
                <ToggleDesc>Позволете на потребителите да сканират QR стикери на партньорски обекти.</ToggleDesc>
              </ToggleLabel>
              <ToggleSwitch>
                <ToggleInput
                  checked={state.featureStickerScan}
                  onChange={(e) => set('featureStickerScan', e.target.checked)}
                />
                <ToggleSlider />
              </ToggleSwitch>
            </ToggleRow>
            <ToggleRow>
              <ToggleLabel>
                <ToggleName>Карта на партньори</ToggleName>
                <ToggleDesc>Показвайте картата с близки партньорски обекти на BoomCard.</ToggleDesc>
              </ToggleLabel>
              <ToggleSwitch>
                <ToggleInput
                  checked={state.featurePartnerMap}
                  onChange={(e) => set('featurePartnerMap', e.target.checked)}
                />
                <ToggleSlider />
              </ToggleSwitch>
            </ToggleRow>
          </Card>

          {/* ── Push известия ── */}
          <Card>
            <CardTitle>Push известия</CardTitle>
            <CardSubtitle>Глобален превключвател за push известия.</CardSubtitle>
            <FieldGroup>
              <div>
                <FieldLabel>Push известия</FieldLabel>
                <ToggleRow style={{ padding: 0, border: 'none' }}>
                  <ToggleLabel>
                    <ToggleName style={{ fontSize: '0.8125rem' }}>
                      {state.pushEnabled ? 'Активирани — push е включен' : 'Деактивирани — няма да се изпращат push'}
                    </ToggleName>
                  </ToggleLabel>
                  <ToggleSwitch>
                    <ToggleInput
                      checked={state.pushEnabled}
                      onChange={(e) => set('pushEnabled', e.target.checked)}
                    />
                    <ToggleSlider />
                  </ToggleSwitch>
                </ToggleRow>
                <FieldHint>Деактивирането спира всички изходящи push известия в системата.</FieldHint>
              </div>
              <div>
                <FieldLabel>Web-push тема (VAPID)</FieldLabel>
                <TextInput
                  placeholder="напр. boomcard-notifications"
                  value={state.pushVapidTopic}
                  onChange={(e) => set('pushVapidTopic', e.target.value)}
                />
                <FieldHint>
                  Тема за VAPID заглавки при web-push известия (PWA / браузър). Не важи за нативни iOS/Android push — те използват APNS и FCM. Оставете празно за стандартното.
                </FieldHint>
              </div>
            </FieldGroup>
          </Card>

          {/* ── Лог на грешки — конфигурация ── */}
          <Card>
            <CardTitle>Лог на грешки — конфигурация</CardTitle>
            <CardSubtitle>
              При зададен URL приложението изпраща копие на всяка грешка и към посочената
              външна услуга (напр. Sentry, Datadog), допълнително към вградения лог по-долу.
              Оставете празно за само вграден лог.
            </CardSubtitle>
            <FieldGroup>
              <div>
                <FieldLabel>URL за лог на грешки (външна услуга)</FieldLabel>
                <UrlInput
                  type="url"
                  placeholder="https://errors.example.com/ingest"
                  value={state.errorLogUrl}
                  onChange={(e) => set('errorLogUrl', e.target.value)}
                />
                <FieldHint>
                  Приложението прочита този URL при стартиране и го използва за дублиращо препращане на грешки. Промяната влиза в сила при следващото стартиране на приложението.
                </FieldHint>
              </div>
            </FieldGroup>
          </Card>

          {/* ── Основни грешки — реален лог ── */}
          <WideCard>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div>
                <CardTitle style={{ marginBottom: '0.25rem' }}>Последни грешки от приложението</CardTitle>
                <CardSubtitle style={{ marginBottom: 0 }}>
                  Последните 50 грешки, докладвани директно от мобилното приложение. Обновява се автоматично на всяка минута.
                </CardSubtitle>
              </div>
              {errors.length > 0 && (
                <DangerBtn
                  onClick={() => {
                    if (confirm('Изчисти всички регистрирани грешки? Действието е необратимо.')) {
                      clearErrorsMutation.mutate();
                    }
                  }}
                  disabled={clearErrorsMutation.isPending}
                  style={{ flexShrink: 0, marginLeft: '1rem' }}
                >
                  {clearErrorsMutation.isPending ? 'Изчистване…' : 'Изчисти всички'}
                </DangerBtn>
              )}
            </div>
            {errorsLoading ? (
              <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
            ) : errors.length === 0 ? (
              <EmptyState>Няма регистрирани грешки.</EmptyState>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <ErrorTable>
                  <thead>
                    <tr>
                      <ETh>Платформа</ETh>
                      <ETh>Версия</ETh>
                      <ETh>Тип</ETh>
                      <ETh>Съобщение</ETh>
                      <ETh>Дата/час</ETh>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((e) => <ErrorRow key={e.id} e={e} />)}
                  </tbody>
                </ErrorTable>
              </div>
            )}
          </WideCard>
        </Grid>
      )}

      <div style={{ marginTop: '1.5rem', maxWidth: '60rem' }}>
        <SaveBtn onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
          {saveMutation.isPending ? 'Запазване…' : 'Запази всички'}
        </SaveBtn>
      </div>
    </PageShell>
  );
}
