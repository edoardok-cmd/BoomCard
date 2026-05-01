import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminSettingsService, MobileAppSettings } from '../../services/adminSettings.service';

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

export default function AdminSettingsMobilePage() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<MobileState>(DEFAULT_STATE);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-mobile-app-settings'],
    queryFn: () => adminSettingsService.getMobileAppSettings(),
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
      toast.success('Mobile app settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-mobile-app-settings'] });
    },
    onError: () => toast.error('Failed to save'),
  });

  const anyMaintenance =
    state.iosStatus !== 'active' || state.androidStatus !== 'active';

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Settings</Eyebrow>
        <PageTitle>Mobile App</PageTitle>
        <PageSubtitle>
          Version requirements, platform status, feature toggles, push notifications, and error logging.
        </PageSubtitle>
      </PageHeader>

      <WarningBox $visible={anyMaintenance}>
        One or more platforms are in maintenance or deprecated status — users on those platforms will see a maintenance screen.
      </WarningBox>

      {isLoading ? (
        <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Loading…</p>
      ) : (
        <Grid>
          {/* ── Versions & Status ── */}
          <Card>
            <CardTitle>Versions & Status</CardTitle>
            <CardSubtitle>Minimum required versions and platform availability.</CardSubtitle>
            <FieldGroup>
              <div>
                <FieldLabel>Minimum iOS version</FieldLabel>
                <TextInput
                  placeholder="e.g. 2.1.0"
                  value={state.minIos}
                  onChange={(e) => set('minIos', e.target.value)}
                />
                <FieldHint>Users below this version are prompted to update before using the app.</FieldHint>
              </div>
              <div>
                <FieldLabel>iOS status</FieldLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Select value={state.iosStatus} onChange={(e) => set('iosStatus', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="deprecated">Deprecated</option>
                  </Select>
                  <StatusBadge $status={state.iosStatus}>{state.iosStatus}</StatusBadge>
                </div>
              </div>
              <div>
                <FieldLabel>Minimum Android version</FieldLabel>
                <TextInput
                  placeholder="e.g. 2.1.0"
                  value={state.minAndroid}
                  onChange={(e) => set('minAndroid', e.target.value)}
                />
                <FieldHint>Leave blank to allow any version.</FieldHint>
              </div>
              <div>
                <FieldLabel>Android status</FieldLabel>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Select value={state.androidStatus} onChange={(e) => set('androidStatus', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="deprecated">Deprecated</option>
                  </Select>
                  <StatusBadge $status={state.androidStatus}>{state.androidStatus}</StatusBadge>
                </div>
              </div>
            </FieldGroup>
          </Card>

          {/* ── Feature Toggles ── */}
          <Card>
            <CardTitle>Feature Toggles</CardTitle>
            <CardSubtitle>Enable or disable individual features in the mobile app.</CardSubtitle>
            <ToggleRow>
              <ToggleLabel>
                <ToggleName>Receipt scan</ToggleName>
                <ToggleDesc>Allow users to scan and upload receipts for cashback.</ToggleDesc>
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
                <ToggleName>Sticker scan</ToggleName>
                <ToggleDesc>Allow users to scan QR stickers at partner locations.</ToggleDesc>
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
                <ToggleName>Partner map</ToggleName>
                <ToggleDesc>Show the map of nearby BoomCard partner locations.</ToggleDesc>
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

          {/* ── Push Notifications ── */}
          <Card>
            <CardTitle>Push Notifications</CardTitle>
            <CardSubtitle>Global push toggle and VAPID configuration.</CardSubtitle>
            <FieldGroup>
              <div>
                <FieldLabel>Push notifications</FieldLabel>
                <ToggleRow style={{ padding: 0, border: 'none' }}>
                  <ToggleLabel>
                    <ToggleName style={{ fontSize: '0.8125rem' }}>
                      {state.pushEnabled ? 'Enabled — push is active' : 'Disabled — no push will be sent'}
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
                <FieldHint>Disabling stops all outbound push notifications system-wide.</FieldHint>
              </div>
              <div>
                <FieldLabel>VAPID topic</FieldLabel>
                <TextInput
                  placeholder="e.g. boomcard-notifications"
                  value={state.pushVapidTopic}
                  onChange={(e) => set('pushVapidTopic', e.target.value)}
                />
                <FieldHint>Topic name used for web-push VAPID headers. Leave blank for default.</FieldHint>
              </div>
            </FieldGroup>
          </Card>

          {/* ── Error Logging ── */}
          <Card>
            <CardTitle>Error Logging</CardTitle>
            <CardSubtitle>Endpoint where the mobile app ships client-side errors.</CardSubtitle>
            <FieldGroup>
              <div>
                <FieldLabel>Error log URL</FieldLabel>
                <UrlInput
                  type="url"
                  placeholder="https://errors.example.com/ingest"
                  value={state.errorLogUrl}
                  onChange={(e) => set('errorLogUrl', e.target.value)}
                />
                <FieldHint>
                  The app POSTs JSON error payloads to this URL. Leave blank to disable remote error
                  logging.
                </FieldHint>
              </div>
            </FieldGroup>
          </Card>
        </Grid>
      )}

      <div style={{ marginTop: '1.5rem', maxWidth: '60rem' }}>
        <SaveBtn onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
          {saveMutation.isPending ? 'Saving…' : 'Save all changes'}
        </SaveBtn>
      </div>
    </PageShell>
  );
}
