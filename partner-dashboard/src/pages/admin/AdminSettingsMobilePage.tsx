import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminSettingsService } from '../../services/adminSettings.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  warning: '#b5803a', warningSoft: '#f5ead2',
};

const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`margin-bottom: 2rem;`;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem; max-width: 36rem;`;
const CardTitle = styled.h2`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0 0 1.25rem;`;
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
const TextareaInput = styled.textarea`
  width: 100%;
  max-width: 28rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: ${palette.bg};
  color: ${palette.text};
  resize: vertical;
  min-height: 70px;
  box-sizing: border-box;
  outline: none;
  &:focus { border-color: ${palette.accent}; }
`;
const Toggle = styled.label`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  cursor: pointer;
  user-select: none;
`;
const ToggleInput = styled.input.attrs({ type: 'checkbox' })`
  width: 2.25rem;
  height: 1.25rem;
  cursor: pointer;
`;
const WarningBox = styled.div<{ $visible: boolean }>`
  padding: 0.75rem 1rem;
  background: ${palette.warningSoft};
  color: ${palette.warning};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  margin-bottom: 1.25rem;
  display: ${({ $visible }) => ($visible ? 'block' : 'none')};
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

export default function AdminSettingsMobilePage() {
  const queryClient = useQueryClient();
  const [minIos, setMinIos] = useState('');
  const [minAndroid, setMinAndroid] = useState('');
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-system-settings'],
    queryFn: () => adminSettingsService.getSystemSettings(),
  });

  useEffect(() => {
    if (!data?.data) return;
    if (data.data.min_ios_version) setMinIos(data.data.min_ios_version);
    if (data.data.min_android_version) setMinAndroid(data.data.min_android_version);
    setMaintenance(data.data.maintenance_mode === 'true');
    if (data.data.maintenance_message) setMaintenanceMsg(data.data.maintenance_message);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminSettingsService.saveSystemSettings({
        min_ios_version: minIos,
        min_android_version: minAndroid,
        maintenance_mode: String(maintenance),
        maintenance_message: maintenanceMsg,
      }),
    onSuccess: () => {
      toast.success('Mobile settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-system-settings'] });
    },
    onError: () => toast.error('Failed to save'),
  });

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Settings</Eyebrow>
        <PageTitle>Mobile App</PageTitle>
        <PageSubtitle>Minimum version requirements and maintenance mode for the BoomCard app.</PageSubtitle>
      </PageHeader>

      <Card>
        <WarningBox $visible={maintenance}>
          Maintenance mode is ON — users will see the maintenance message instead of the app.
        </WarningBox>
        <CardTitle>App Configuration</CardTitle>
        {isLoading ? (
          <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Loading…</p>
        ) : (
          <FieldGroup>
            <div>
              <FieldLabel>Minimum iOS version</FieldLabel>
              <TextInput
                placeholder="e.g. 2.1.0"
                value={minIos}
                onChange={(e) => setMinIos(e.target.value)}
              />
              <FieldHint>Users below this version are prompted to update before using the app.</FieldHint>
            </div>
            <div>
              <FieldLabel>Minimum Android version</FieldLabel>
              <TextInput
                placeholder="e.g. 2.1.0"
                value={minAndroid}
                onChange={(e) => setMinAndroid(e.target.value)}
              />
              <FieldHint>Same for Android. Leave blank to allow any version.</FieldHint>
            </div>
            <div>
              <FieldLabel>Maintenance mode</FieldLabel>
              <Toggle>
                <ToggleInput
                  checked={maintenance}
                  onChange={(e) => setMaintenance(e.target.checked)}
                />
                <span style={{ fontSize: '0.875rem', color: palette.textMuted }}>
                  {maintenance ? 'Enabled — app is in maintenance' : 'Disabled'}
                </span>
              </Toggle>
              <FieldHint>When enabled, the mobile app shows a maintenance screen.</FieldHint>
            </div>
            {maintenance && (
              <div>
                <FieldLabel>Maintenance message</FieldLabel>
                <TextareaInput
                  placeholder="We're down for scheduled maintenance. Back shortly!"
                  value={maintenanceMsg}
                  onChange={(e) => setMaintenanceMsg(e.target.value)}
                />
                <FieldHint>Shown to users while maintenance mode is active.</FieldHint>
              </div>
            )}
          </FieldGroup>
        )}
        <SaveBtn onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
          {saveMutation.isPending ? 'Saving…' : 'Save changes'}
        </SaveBtn>
      </Card>
    </PageShell>
  );
}
