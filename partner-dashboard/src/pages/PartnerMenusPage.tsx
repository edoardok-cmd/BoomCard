import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock, XCircle, ExternalLink, Link as LinkIcon } from 'lucide-react';
import Button from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { partnersService } from '../services/partners.service';
import { venuesService, MenuStatus } from '../services/venues.service';

interface PartnerVenue {
  id: string;
  name: string;
  city?: string;
  address?: string;
  menuUrl: string | null;
  pendingMenuUrl: string | null;
  menuStatus: MenuStatus;
  menuRejectionReason: string | null;
  menuSubmittedAt: string | null;
  menuReviewedAt: string | null;
}

const copy = {
  en: {
    title: 'Venue Menus',
    subtitle: 'Submit a link to each venue\'s menu. A BoomCard admin reviews every submission before it goes live.',
    empty: 'No venues yet. Contact support to add venues to your partner profile.',
    currentLive: 'Currently live',
    pendingReview: 'Pending admin review',
    rejected: 'Rejected',
    noMenu: 'No menu submitted yet',
    rejectionReason: 'Reason:',
    urlLabel: 'Menu URL',
    placeholder: 'https://your-venue.com/menu.pdf',
    submit: 'Submit for review',
    resubmit: 'Resubmit',
    replace: 'Replace menu',
    openLink: 'Open link',
    submitted: 'Menu submitted — awaiting admin approval',
    submitError: 'Could not submit menu',
    invalidUrl: 'Please enter a valid http(s) URL',
    loading: 'Loading…',
    withdraw: 'Withdraw submission',
    withdrawn: 'Submission withdrawn',
    withdrawError: 'Could not withdraw submission',
  },
  bg: {
    title: 'Менюта на обектите',
    subtitle: 'Въведете линк към менюто за всеки обект. Админ на BoomCard преглежда всяко подаване, преди да стане видимо.',
    empty: 'Все още нямате обекти. Свържете се с поддръжката.',
    currentLive: 'Видимо в момента',
    pendingReview: 'Изчаква преглед от админ',
    rejected: 'Отхвърлено',
    noMenu: 'Все още няма подадено меню',
    rejectionReason: 'Причина:',
    urlLabel: 'Линк към менюто',
    placeholder: 'https://example.bg/menu.pdf',
    submit: 'Подай за преглед',
    resubmit: 'Подай отново',
    replace: 'Замени менюто',
    openLink: 'Отвори линка',
    submitted: 'Менюто е подадено — изчаква одобрение',
    submitError: 'Грешка при подаване',
    invalidUrl: 'Моля въведете валиден http(s) URL',
    loading: 'Зареждане…',
    withdraw: 'Оттегли подаването',
    withdrawn: 'Подаването е оттеглено',
    withdrawError: 'Грешка при оттегляне',
  },
};

const isValidUrl = (raw: string): boolean => {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const PartnerMenusPage: React.FC = () => {
  const { language } = useLanguage();
  const t = copy[language as keyof typeof copy] ?? copy.en;
  const [venues, setVenues] = useState<PartnerVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const loadPartner = async () => {
    setLoading(true);
    try {
      const partner = await partnersService.getCurrentPartner();
      const partnerWithVenues = partner as typeof partner & { venues?: PartnerVenue[] };
      const v: PartnerVenue[] = Array.isArray(partnerWithVenues?.venues) ? partnerWithVenues.venues : [];
      setVenues(v);
    } catch {
      toast.error('Failed to load venues');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPartner();
  }, []);

  const handleSubmit = async (venueId: string) => {
    const url = (inputs[venueId] ?? '').trim();
    if (!isValidUrl(url)) {
      toast.error(t.invalidUrl);
      return;
    }
    setSaving(prev => ({ ...prev, [venueId]: true }));
    try {
      const updated = await venuesService.submitMenuUrl(venueId, url);
      setVenues(prev => prev.map(v => (v.id === venueId ? { ...v, ...updated } : v)));
      setInputs(prev => ({ ...prev, [venueId]: '' }));
      toast.success(t.submitted);
    } catch (err) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || t.submitError);
    } finally {
      setSaving(prev => ({ ...prev, [venueId]: false }));
    }
  };

  const handleWithdraw = async (venueId: string) => {
    setSaving(prev => ({ ...prev, [venueId]: true }));
    try {
      const updated = await venuesService.withdrawMenuSubmission(venueId);
      setVenues(prev => prev.map(v => (v.id === venueId ? { ...v, ...updated } : v)));
      toast.success(t.withdrawn);
    } catch (err) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || t.withdrawError);
    } finally {
      setSaving(prev => ({ ...prev, [venueId]: false }));
    }
  };

  if (loading) {
    return (
      <Container>
        <EmptyState>{t.loading}</EmptyState>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>{t.title}</Title>
        <Subtitle>{t.subtitle}</Subtitle>
      </Header>

      {venues.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <VenueList>
          {venues.map(venue => (
            <VenueCard key={venue.id}>
              <VenueHeader>
                <div>
                  <VenueName>{venue.name}</VenueName>
                  {(venue.city || venue.address) && (
                    <VenueLocation>
                      {[venue.address, venue.city].filter(Boolean).join(', ')}
                    </VenueLocation>
                  )}
                </div>
                <StatusBadge status={venue.menuStatus}>
                  {venue.menuStatus === 'APPROVED' && <><CheckCircle2 size={14} /> {t.currentLive}</>}
                  {venue.menuStatus === 'PENDING' && <><Clock size={14} /> {t.pendingReview}</>}
                  {venue.menuStatus === 'REJECTED' && <><XCircle size={14} /> {t.rejected}</>}
                  {venue.menuStatus === 'NONE' && <>{t.noMenu}</>}
                </StatusBadge>
              </VenueHeader>

              {venue.menuUrl && (
                <MenuRow>
                  <RowLabel>{t.currentLive}</RowLabel>
                  <ExternalLinkAnchor href={venue.menuUrl} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={14} /> {venue.menuUrl}
                    <ExternalLink size={12} />
                  </ExternalLinkAnchor>
                </MenuRow>
              )}

              {venue.menuStatus === 'PENDING' && venue.pendingMenuUrl && (
                <>
                  <MenuRow>
                    <RowLabel>{t.pendingReview}</RowLabel>
                    <ExternalLinkAnchor href={venue.pendingMenuUrl} target="_blank" rel="noopener noreferrer" muted>
                      <LinkIcon size={14} /> {venue.pendingMenuUrl}
                      <ExternalLink size={12} />
                    </ExternalLinkAnchor>
                  </MenuRow>
                  <MenuRow>
                    <Button
                      variant="secondary"
                      onClick={() => handleWithdraw(venue.id)}
                      disabled={!!saving[venue.id]}
                    >
                      {t.withdraw}
                    </Button>
                  </MenuRow>
                </>
              )}

              {venue.menuStatus === 'REJECTED' && venue.pendingMenuUrl && (
                <>
                  <MenuRow>
                    <RowLabel>{t.rejected}</RowLabel>
                    <ExternalLinkAnchor href={venue.pendingMenuUrl} target="_blank" rel="noopener noreferrer" muted>
                      <LinkIcon size={14} /> {venue.pendingMenuUrl}
                      <ExternalLink size={12} />
                    </ExternalLinkAnchor>
                  </MenuRow>
                  {venue.menuRejectionReason && (
                    <RejectionBox>
                      <strong>{t.rejectionReason}</strong> {venue.menuRejectionReason}
                    </RejectionBox>
                  )}
                </>
              )}

              <InputRow>
                <UrlInput
                  type="url"
                  placeholder={t.placeholder}
                  value={inputs[venue.id] ?? ''}
                  onChange={e => setInputs(prev => ({ ...prev, [venue.id]: e.target.value }))}
                  disabled={!!saving[venue.id]}
                />
                <Button
                  onClick={() => handleSubmit(venue.id)}
                  disabled={!!saving[venue.id] || !(inputs[venue.id] ?? '').trim()}
                >
                  {venue.menuStatus === 'REJECTED'
                    ? t.resubmit
                    : venue.menuUrl
                    ? t.replace
                    : t.submit}
                </Button>
              </InputRow>
            </VenueCard>
          ))}
        </VenueList>
      )}
    </Container>
  );
};

export default PartnerMenusPage;

const Container = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem;
  min-height: 100vh;
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 800;
  margin: 0 0 0.5rem;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const Subtitle = styled.p`
  margin: 0;
  color: #6b7280;
  line-height: 1.5;
  max-width: 720px;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const EmptyState = styled.div`
  padding: 3rem;
  text-align: center;
  color: #6b7280;
  background: white;
  border-radius: 1rem;
  border: 1px dashed #e5e7eb;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
    color: #9ca3af;
  }
`;

const VenueList = styled.div`
  display: grid;
  gap: 1.25rem;
`;

const VenueCard = styled.div`
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }
`;

const VenueHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;

  @media (max-width: 600px) {
    flex-direction: column;
  }
`;

const VenueName = styled.h3`
  margin: 0 0 0.25rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;

  [data-theme="dark"] & { color: #f9fafb; }
`;

const VenueLocation = styled.div`
  font-size: 0.875rem;
  color: #6b7280;

  [data-theme="dark"] & { color: #9ca3af; }
`;

const statusColors: Record<MenuStatus, { bg: string; fg: string; dbg: string; dfg: string }> = {
  APPROVED: { bg: '#d1fae5', fg: '#065f46', dbg: 'rgba(6,95,70,0.3)', dfg: '#6ee7b7' },
  PENDING:  { bg: '#fef3c7', fg: '#92400e', dbg: 'rgba(146,64,14,0.3)', dfg: '#fcd34d' },
  REJECTED: { bg: '#fee2e2', fg: '#991b1b', dbg: 'rgba(153,27,27,0.3)', dfg: '#fca5a5' },
  NONE:     { bg: '#f3f4f6', fg: '#4b5563', dbg: '#374151', dfg: '#d1d5db' },
};

const StatusBadge = styled.span<{ status: MenuStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
  background: ${p => statusColors[p.status].bg};
  color: ${p => statusColors[p.status].fg};

  [data-theme="dark"] & {
    background: ${p => statusColors[p.status].dbg};
    color: ${p => statusColors[p.status].dfg};
  }
`;

const MenuRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  font-size: 0.875rem;
  flex-wrap: wrap;
`;

const RowLabel = styled.span`
  font-weight: 600;
  color: #4b5563;
  min-width: 160px;

  [data-theme="dark"] & { color: #9ca3af; }
`;

const ExternalLinkAnchor = styled.a<{ muted?: boolean }>`
  color: ${p => (p.muted ? '#6b7280' : '#4f46e5')};
  text-decoration: none;
  word-break: break-all;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;

  &:hover { text-decoration: underline; }

  [data-theme="dark"] & {
    color: ${p => (p.muted ? '#9ca3af' : '#a5b4fc')};
  }
`;

const RejectionBox = styled.div`
  margin-top: 0.5rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;

  [data-theme="dark"] & {
    background: rgba(153,27,27,0.15);
    border-color: rgba(153,27,27,0.4);
    color: #fca5a5;
  }
`;

const InputRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;

  @media (max-width: 600px) {
    flex-direction: column;
  }
`;

const UrlInput = styled.input`
  flex: 1;
  padding: 0.625rem 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  background: white;
  color: #111827;

  &:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79,70,229,0.15);
  }

  [data-theme="dark"] & {
    background: #111827;
    border-color: #374151;
    color: #f9fafb;
  }
`;
