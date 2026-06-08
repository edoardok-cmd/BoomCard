import { useMemo } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { palette } from '../../styles/adminTheme';
import {
  adminAdminsService,
  AdminPermissionsResult,
  PermissionCategory,
} from '../../services/adminAdmins.service';
import { categoryLabel, permissionLabel } from './adminPermissionLabels';

// Per-permission resolved state for the tri-state control.
// 'inherited-on'  → granted by the role template (no override)
// 'inherited-off' → not granted by the template (no override)
// 'forced-on'     → per-user override allow=true (overrides template)
// 'forced-off'    → per-user override allow=false (overrides template)
type CellState = 'inherited-on' | 'inherited-off' | 'forced-on' | 'forced-off';

const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.5rem;
`;

const CardTitle = styled.h2`
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${palette.textSubtle};
  margin: 0 0 0.5rem;
`;

const CardHint = styled.p`
  font-size: 0.75rem;
  color: ${palette.textSubtle};
  margin: 0 0 1.25rem;
  line-height: 1.4;
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  margin-bottom: 1.25rem;
  font-size: 0.7rem;
  color: ${palette.textMuted};
`;

const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
`;

const Dot = styled.span<{ $kind: 'inherited' | 'on' | 'off' }>`
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  ${({ $kind }) =>
    $kind === 'on'
      ? `background: ${palette.success};`
      : $kind === 'off'
      ? `background: ${palette.danger};`
      : `background: ${palette.textSubtle};`}
`;

const CategoryBlock = styled.div`
  border: 1px solid ${palette.border};
  border-radius: 0.625rem;
  margin-bottom: 1rem;
  overflow: hidden;
`;

const CategoryHead = styled.div`
  background: ${palette.surfaceAlt};
  padding: 0.625rem 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${palette.text};
`;

const PermRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.625rem 1rem;
  border-top: 1px solid ${palette.border};
`;

const PermInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
`;

const PermLabel = styled.span`
  font-size: 0.8125rem;
  color: ${palette.text};
  font-weight: 500;
`;

const PermKey = styled.code`
  font-size: 0.65rem;
  color: ${palette.textSubtle};
  font-family: ui-monospace, monospace;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
`;

const StateBadge = styled.span<{ $state: CellState }>`
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  white-space: nowrap;
  ${({ $state }) => {
    switch ($state) {
      case 'forced-on':
        return `background: ${palette.successSoft}; color: ${palette.success};`;
      case 'forced-off':
        return `background: ${palette.dangerSoft}; color: ${palette.danger};`;
      case 'inherited-on':
        return `background: ${palette.surfaceAlt}; color: ${palette.success};`;
      default:
        return `background: ${palette.surfaceAlt}; color: ${palette.textMuted};`;
    }
  }}
`;

const SegBtnGroup = styled.div`
  display: inline-flex;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  overflow: hidden;
`;

const SegBtn = styled.button<{ $active: boolean; $tone: 'on' | 'off' }>`
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.3rem 0.65rem;
  border: none;
  cursor: pointer;
  background: ${({ $active, $tone }) =>
    !$active
      ? palette.surface
      : $tone === 'on'
      ? palette.successSoft
      : palette.dangerSoft};
  color: ${({ $active, $tone }) =>
    !$active
      ? palette.textMuted
      : $tone === 'on'
      ? palette.success
      : palette.danger};
  &:hover:not(:disabled) { background: ${palette.surfaceAlt}; }
  &:disabled { cursor: not-allowed; opacity: 0.6; }
  & + & { border-left: 1px solid ${palette.border}; }
`;

const ResetBtn = styled.button`
  font-size: 0.65rem;
  font-weight: 600;
  color: ${palette.accent};
  background: none;
  border: 1px solid ${palette.accent};
  border-radius: 0.375rem;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) { background: ${palette.accentSoft}; }
  &:disabled { cursor: not-allowed; opacity: 0.5; }
`;

const ImperBlock = styled.div`
  border: 1px solid ${palette.warningBorder};
  background: ${palette.warningSoft};
  border-radius: 0.625rem;
  padding: 1rem;
  margin-bottom: 1.25rem;
`;

const ImperTitle = styled.h3`
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${palette.warningText};
  margin: 0 0 0.75rem;
`;

const ImperRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
  & + & { border-top: 1px solid ${palette.warningBorder}; }
`;

const Toggle = styled.button<{ $on: boolean; $disabled?: boolean }>`
  position: relative;
  width: 2.5rem;
  height: 1.375rem;
  border-radius: 1rem;
  border: none;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  background: ${({ $on }) => ($on ? palette.success : palette.border)};
  opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};
  transition: background 120ms;
  flex-shrink: 0;
  &::after {
    content: '';
    position: absolute;
    top: 0.1875rem;
    left: ${({ $on }) => ($on ? '1.25rem' : '0.1875rem')};
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: ${palette.onAccent};
    transition: left 120ms;
  }
`;

interface Props {
  userId: string;
  email: string;
}

function cellState(
  key: string,
  roleAllowed: Set<string>,
  roleDenied: Set<string>,
  overrideMap: Map<string, boolean>,
): CellState {
  if (overrideMap.has(key)) {
    return overrideMap.get(key) ? 'forced-on' : 'forced-off';
  }
  // No override → follows the role template (role-deny wins over role-allow).
  if (roleDenied.has(key)) return 'inherited-off';
  return roleAllowed.has(key) ? 'inherited-on' : 'inherited-off';
}

export default function AdminPermissionsPanel({ userId, email }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ['admin-admin-permissions', userId];

  const { data, isLoading, error } = useQuery<AdminPermissionsResult>({
    queryKey,
    queryFn: () => adminAdminsService.getPermissions(userId),
    enabled: !!userId,
  });

  const mutation = useMutation({
    mutationFn: ({ key, allow }: { key: string; allow: boolean | null }) =>
      adminAdminsService.setPermissionOverride(userId, key, allow),
    onSuccess: () => {
      toast.success('Правата са обновени. Промяната влиза в сила при следващото влизане на администратора.');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Грешка при запис на правото';
      toast.error(msg);
    },
  });

  const roleAllowed = useMemo(() => new Set(data?.roleAllowed ?? []), [data]);
  const roleDenied = useMemo(() => new Set(data?.roleDenied ?? []), [data]);
  const overrideMap = useMemo(() => {
    const m = new Map<string, boolean>();
    (data?.overrides ?? []).forEach((o) => m.set(o.key, o.allow));
    return m;
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardTitle>Права и способности</CardTitle>
        <p style={{ color: palette.textMuted, fontSize: '0.875rem' }}>Зареждане…</p>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardTitle>Права и способности</CardTitle>
        <p style={{ color: palette.danger, fontSize: '0.875rem' }}>Грешка при зареждане на правата.</p>
      </Card>
    );
  }

  if (data.superAdminBypass) {
    return (
      <Card>
        <CardTitle>Права и способности</CardTitle>
        <CardHint>
          Този потребител е <strong>Супер администратор</strong> и има пълен достъп до всички
          способности по подразбиране. Индивидуални права не се прилагат.
        </CardHint>
      </Card>
    );
  }

  const pending = mutation.isPending;

  // Split catalog: impersonation handled separately as explicit toggles.
  const regularCategories: PermissionCategory[] = data.catalog.filter(
    (c) => c.category !== 'impersonation',
  );
  const imperPerms = data.catalog.find((c) => c.category === 'impersonation')?.permissions ?? [];

  const setOverride = (key: string, allow: boolean | null) => {
    if (pending) return;
    mutation.mutate({ key, allow });
  };

  return (
    <Card>
      <CardTitle>Права и способности</CardTitle>
      <CardHint>
        Шаблонът на ролята определя базовите права (наследени). Можете да добавите или премахнете
        отделни способности за <strong>{email}</strong> чрез индивидуални изключения, които имат
        приоритет пред шаблона. Натиснете <em>Към шаблона</em>, за да премахнете изключение.
      </CardHint>

      <Legend>
        <LegendItem><Dot $kind="inherited" /> Наследено от шаблона</LegendItem>
        <LegendItem><Dot $kind="on" /> Изрично включено (изключение)</LegendItem>
        <LegendItem><Dot $kind="off" /> Изрично изключено (изключение)</LegendItem>
      </Legend>

      {/* Impersonation — explicit toggles (spec §3.3.2) */}
      <ImperBlock>
        <ImperTitle>Представяне (impersonate)</ImperTitle>
        {imperPerms.map((p) => {
          const state = cellState(p.key, roleAllowed, roleDenied, overrideMap);
          const on = state === 'forced-on' || state === 'inherited-on';
          return (
            <ImperRow key={p.key}>
              <PermInfo>
                <PermLabel>{permissionLabel(p.key, p.label)}</PermLabel>
                <PermKey>{p.key}</PermKey>
              </PermInfo>
              <Toggle
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={permissionLabel(p.key, p.label)}
                $on={on}
                $disabled={pending}
                disabled={pending}
                onClick={() => setOverride(p.key, on ? null : true)}
              />
            </ImperRow>
          );
        })}
      </ImperBlock>

      {regularCategories.map((cat) => (
        <CategoryBlock key={cat.category}>
          <CategoryHead>{categoryLabel(cat.category)}</CategoryHead>
          {cat.permissions.map((p) => {
            const state = cellState(p.key, roleAllowed, roleDenied, overrideMap);
            const isOverride = state === 'forced-on' || state === 'forced-off';
            const on = state === 'forced-on' || state === 'inherited-on';
            return (
              <PermRow key={p.key}>
                <PermInfo>
                  <PermLabel>{permissionLabel(p.key, p.label)}</PermLabel>
                  <PermKey>{p.key}</PermKey>
                </PermInfo>
                <Controls>
                  <StateBadge $state={state}>
                    {state === 'forced-on'
                      ? 'Вкл.'
                      : state === 'forced-off'
                      ? 'Изкл.'
                      : on
                      ? 'Наследено · вкл.'
                      : 'Наследено · изкл.'}
                  </StateBadge>
                  <SegBtnGroup>
                    <SegBtn
                      type="button"
                      $tone="on"
                      $active={on}
                      disabled={pending}
                      onClick={() => setOverride(p.key, true)}
                    >
                      Вкл.
                    </SegBtn>
                    <SegBtn
                      type="button"
                      $tone="off"
                      $active={!on}
                      disabled={pending}
                      onClick={() => setOverride(p.key, false)}
                    >
                      Изкл.
                    </SegBtn>
                  </SegBtnGroup>
                  <ResetBtn
                    type="button"
                    disabled={pending || !isOverride}
                    title={isOverride ? 'Премахни изключението' : 'Няма изключение'}
                    onClick={() => setOverride(p.key, null)}
                  >
                    Към шаблона
                  </ResetBtn>
                </Controls>
              </PermRow>
            );
          })}
        </CategoryBlock>
      ))}
    </Card>
  );
}
