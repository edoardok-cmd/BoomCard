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
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 1.5rem; max-width: 36rem;`;
const CardTitle = styled.h2`font-size: 1rem; font-weight: 700; color: ${palette.text}; margin: 0 0 1.25rem;`;
const FieldGroup = styled.div`display: flex; flex-direction: column; gap: 1.25rem; margin-bottom: 1.5rem;`;
const FieldLabel = styled.label`font-size: 0.875rem; font-weight: 600; color: ${palette.textMuted}; display: block; margin-bottom: 0.375rem;`;
const FieldHint = styled.p`font-size: 0.8rem; color: ${palette.textSubtle}; margin: 0.25rem 0 0;`;
const NumberInput = styled.input`
  width: 8rem;
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
const InfoBox = styled.div`
  padding: 0.75rem 1rem;
  background: ${palette.infoSoft};
  color: ${palette.info};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  margin-bottom: 1.25rem;
`;

export default function AdminSettingsValidityPage() {
  const queryClient = useQueryClient();
  const [cashbackDays, setCashbackDays] = useState('60');
  const [offerDays, setOfferDays] = useState('90');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-system-settings'],
    queryFn: () => adminSettingsService.getSystemSettings(),
  });

  useEffect(() => {
    if (!data?.data) return;
    if (data.data.cashback_expiry_days !== undefined) setCashbackDays(data.data.cashback_expiry_days);
    if (data.data.offer_validity_days !== undefined) setOfferDays(data.data.offer_validity_days);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (values: { cashback_expiry_days: string; offer_validity_days: string }) =>
      adminSettingsService.saveSystemSettings(values),
    onSuccess: () => {
      toast.success('Настройките за валидност са запазени');
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
    const cb = Number(cashbackDays);
    const of = Number(offerDays);
    if (!Number.isInteger(cb) || cb < 1 || cb > 3650) {
      toast.error('Изтичане на кешбек трябва да е цяло число между 1 и 3650');
      return;
    }
    if (!Number.isInteger(of) || of < 1 || of > 3650) {
      toast.error('Валидност на оферта трябва да е цяло число между 1 и 3650');
      return;
    }
    saveMutation.mutate({ cashback_expiry_days: String(cb), offer_validity_days: String(of) });
  };

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Настройки</Eyebrow>
        <PageTitle>Валидност</PageTitle>
        <PageSubtitle>Конфигурирайте колко дни кешбекът и офертите остават валидни.</PageSubtitle>
      </PageHeader>

      <Card>
        <InfoBox>
          Промените важат само за новоспечелен кешбек и нови оферти — съществуващите записи не се влияят с обратна сила.
        </InfoBox>
        <CardTitle>Настройки за изтичане</CardTitle>
        {isLoading ? (
          <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Зареждане…</p>
        ) : (
          <FieldGroup>
            <div>
              <FieldLabel>Изтичане на кешбек (дни)</FieldLabel>
              <NumberInput
                type="number"
                min="1"
                max="3650"
                value={cashbackDays}
                onChange={(e) => setCashbackDays(e.target.value)}
              />
              <FieldHint>Колко дни след спечелване балансът изтича. По подразбиране: 60.</FieldHint>
            </div>
            <div>
              <FieldLabel>Валидност на оферта (дни)</FieldLabel>
              <NumberInput
                type="number"
                min="1"
                max="3650"
                value={offerDays}
                onChange={(e) => setOfferDays(e.target.value)}
              />
              <FieldHint>Стандартен прозорец на валидност за нови партньорски оферти. По подразбиране: 90.</FieldHint>
            </div>
          </FieldGroup>
        )}
        <SaveBtn onClick={handleSave} disabled={saveMutation.isPending || isLoading}>
          {saveMutation.isPending ? 'Запазване…' : 'Запази'}
        </SaveBtn>
      </Card>
    </PageShell>
  );
}
