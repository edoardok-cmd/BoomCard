/**
 * Partner-side QR / sticker view — spec §5.4 v1.1
 *
 * Read-only. Partners see per-venue sticker status (Активен / Неактивен /
 * В обработка) but cannot generate, edit, or deactivate codes. Source of
 * truth lives in admin; this view is a status mirror for partner self-check.
 */
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api.service';
import { useLanguage } from '../contexts/LanguageContext';

interface StickerRow {
  id: string;
  stickerId: string;
  status: string;
  displayStatus: string;
  locationType: string;
  location: { name: string; locationNumber: string } | null;
  lastScannedAt: string | null;
  totalScans: number;
}
interface VenueRow {
  id: string;
  name: string;
  address: string;
  city: string;
  venueStatus: string;
  stickerConfigActive: boolean;
  stickerConfigUpdatedAt: string | null;
  stickers: StickerRow[];
}
interface Resp {
  success: boolean;
  data: {
    partnerStatus: string;
    partnerActivated: boolean;
    readonlyNotice: string;
    venues: VenueRow[];
  };
}

const Page = styled.div`
  padding: 1.5rem;
  max-width: 64rem;
  margin: 0 auto;
`;
const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 0.5rem;
`;
const Subtitle = styled.p`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0 0 1.5rem;
`;
const Notice = styled.div`
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  font-size: 0.8125rem;
  color: var(--color-text-primary);
`;
const VenueCard = styled.section`
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1.25rem;
  margin-bottom: 1rem;
`;
const VenueHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.875rem;
`;
const VenueName = styled.div`
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
`;
const VenueMeta = styled.div`
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
`;
const Pill = styled.span<{ $tone: 'ok' | 'warn' | 'off' }>`
  display: inline-flex;
  padding: 0.2rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${(p) =>
    p.$tone === 'ok' ? 'rgba(34,197,94,0.12)' :
    p.$tone === 'warn' ? 'rgba(245,158,11,0.12)' :
    'rgba(239,68,68,0.12)'};
  color: ${(p) =>
    p.$tone === 'ok' ? '#16a34a' :
    p.$tone === 'warn' ? '#b5803a' :
    '#b54327'};
`;
const StickerRowEl = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-top: 1px solid var(--color-border);
  font-size: 0.8125rem;
`;
const EmptyVenue = styled.div`
  font-size: 0.8125rem;
  color: var(--color-text-tertiary);
  font-style: italic;
  padding: 0.5rem 0;
`;

function pillTone(displayStatus: string): 'ok' | 'warn' | 'off' {
  if (displayStatus === 'ACTIVE') return 'ok';
  if (displayStatus === 'PENDING') return 'warn';
  return 'off';
}
function statusLabel(s: string, isBg: boolean): string {
  switch (s) {
    case 'ACTIVE':   return isBg ? 'Активен' : 'Active';
    case 'PENDING':  return isBg ? 'В обработка' : 'Pending';
    case 'INACTIVE': return isBg ? 'Неактивен' : 'Inactive';
    case 'DAMAGED':  return isBg ? 'Повреден' : 'Damaged';
    case 'RETIRED':  return isBg ? 'Изтеглен' : 'Retired';
    default: return s;
  }
}

export default function PartnerStickersPage() {
  const { language } = useLanguage();
  const isBg = language !== 'en';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['partner-me-stickers'],
    queryFn: () => apiService.get<Resp>('/partners/me/stickers'),
    staleTime: 30_000,
  });

  if (isLoading) {
    return <Page><Subtitle>{isBg ? 'Зарежда…' : 'Loading…'}</Subtitle></Page>;
  }
  if (isError || !data?.data) {
    return <Page><Subtitle>{isBg ? 'Грешка при зареждане.' : 'Failed to load.'}</Subtitle></Page>;
  }
  const { partnerStatus, partnerActivated, readonlyNotice, venues } = data.data;
  const partnerOnline = partnerStatus === 'ACTIVE' && partnerActivated;

  return (
    <Page>
      <Title>{isBg ? 'QR кодове и локации' : 'QR codes & locations'}</Title>
      <Subtitle>
        {isBg
          ? 'Преглед на статуса на QR кодовете по локации. За промени, използвайте „Заяви промяна"  в Помощ.'
          : 'Read-only view of QR codes per venue. For changes, file a request via Help → "Request a change".'}
      </Subtitle>

      <Notice>
        <strong>{isBg ? 'Само за преглед: ' : 'Read-only: '}</strong>
        {readonlyNotice}
      </Notice>

      {!partnerOnline && (
        <Notice style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }}>
          <strong>⚠ </strong>
          {isBg
            ? `Партньорският Ви статус е ${partnerStatus}${partnerActivated ? '' : ' (неактивиран)'}. Всички QR кодове са деактивирани докато статусът се възстанови до „Активен".`
            : `Your partner status is ${partnerStatus}${partnerActivated ? '' : ' (not activated)'}. All QR codes are disabled until status returns to "Active".`}
        </Notice>
      )}

      {venues.length === 0 && (
        <EmptyVenue>{isBg ? 'Няма регистрирани локации.' : 'No venues registered.'}</EmptyVenue>
      )}

      {venues.map((v) => (
        <VenueCard key={v.id}>
          <VenueHeader>
            <div>
              <VenueName>{v.name}</VenueName>
              <VenueMeta>{[v.address, v.city].filter(Boolean).join(', ')}</VenueMeta>
            </div>
            <Pill $tone={v.stickerConfigActive ? 'ok' : 'warn'}>
              {v.stickerConfigActive
                ? (isBg ? 'Конфигурация активна' : 'Config active')
                : (isBg ? 'Конфигурация — в обработка' : 'Config pending')}
            </Pill>
          </VenueHeader>

          {v.stickers.length === 0 ? (
            <EmptyVenue>
              {isBg ? 'Все още няма генерирани QR кодове за тази локация.' : 'No QR codes generated for this venue yet.'}
            </EmptyVenue>
          ) : (
            v.stickers.map((s) => (
              <StickerRowEl key={s.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {s.location?.name ?? s.locationType}
                    {s.location?.locationNumber && (
                      <span style={{ marginLeft: '0.375rem', color: 'var(--color-text-secondary)' }}>
                        #{s.location.locationNumber}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                    {isBg ? 'Сканирания: ' : 'Scans: '}
                    {s.totalScans}
                  </div>
                </div>
                <Pill $tone={pillTone(s.displayStatus)}>
                  {statusLabel(s.displayStatus, isBg)}
                </Pill>
              </StickerRowEl>
            ))
          )}
        </VenueCard>
      ))}
    </Page>
  );
}
