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
    if (data.data.cashback_expiry_days) setCashbackDays(data.data.cashback_expiry_days);
    if (data.data.offer_validity_days) setOfferDays(data.data.offer_validity_days);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminSettingsService.saveSystemSettings({
        cashback_expiry_days: cashbackDays,
        offer_validity_days: offerDays,
      }),
    onSuccess: () => {
      toast.success('Validity settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-system-settings'] });
    },
    onError: () => toast.error('Failed to save'),
  });

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Settings</Eyebrow>
        <PageTitle>Validity Periods</PageTitle>
        <PageSubtitle>Configure how long cashback and offers remain valid.</PageSubtitle>
      </PageHeader>

      <Card>
        <InfoBox>
          Changes apply to newly earned cashback and new offers only — existing records are not retroactively affected.
        </InfoBox>
        <CardTitle>Expiry Settings</CardTitle>
        {isLoading ? (
          <p style={{ color: palette.textSubtle, fontSize: '0.875rem' }}>Loading…</p>
        ) : (
          <FieldGroup>
            <div>
              <FieldLabel>Cashback expiry (days)</FieldLabel>
              <NumberInput
                type="number"
                min="1"
                max="3650"
                value={cashbackDays}
                onChange={(e) => setCashbackDays(e.target.value)}
              />
              <FieldHint>How many days after earning cashback the balance expires. Default: 60.</FieldHint>
            </div>
            <div>
              <FieldLabel>Offer validity (days)</FieldLabel>
              <NumberInput
                type="number"
                min="1"
                max="3650"
                value={offerDays}
                onChange={(e) => setOfferDays(e.target.value)}
              />
              <FieldHint>Default validity window for new partner offers. Default: 90.</FieldHint>
            </div>
          </FieldGroup>
        )}
        <SaveBtn onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isLoading}>
          {saveMutation.isPending ? 'Saving…' : 'Save changes'}
        </SaveBtn>
      </Card>
    </PageShell>
  );
}
