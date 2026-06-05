import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock, XCircle, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { partnersService } from '../services/partners.service';
import { MenuStatus } from '../services/venues.service';

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
    // MEDIUM-1 fix: read-only notice for Inactive partners (spec §5.1)
    inactiveNotice: 'Your account is inactive. Menu submissions are read-only while your account status is not Active.',
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
    // MEDIUM-1 fix: read-only notice for Inactive partners (spec §5.1)
    inactiveNotice: 'Акаунтът Ви е неактивен. Подаването на менюта е само за четене докато статусът не е Активен.',
  },
};


const PartnerMenusPage: React.FC = () => {
  const { language } = useLanguage();
  const t = copy[language as keyof typeof copy] ?? copy.en;
  const [venues, setVenues] = useState<PartnerVenue[]>([]);
  const [loading, setLoading] = useState(true);
  // MEDIUM-1 fix: track partner status so Inactive partners get read-only access
  // per spec §5.1 / §11.2. Status is stored uppercased for consistent comparison.
  const [partnerStatus, setPartnerStatus] = useState<string | null>(null);

  const loadPartner = async () => {
    setLoading(true);
    try {
      const partner = await partnersService.getCurrentPartner();
      // MEDIUM-1 fix: capture the partner status before reading venues.
      setPartnerStatus((partner.status as string)?.toUpperCase() ?? null);
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

  // MEDIUM-1 fix: Inactive partners must have read-only access (spec §5.1, §11.2).
  // LOW-S2 fix (review r2ae): backend normalizes status to ACTIVE/INACTIVE/ARCHIVED
  // only — PAUSED and SUSPENDED are not valid backend values in the current schema.
  const isArchived = partnerStatus === 'ARCHIVED';
  // S2 fix (review r2ae): treat null status (API failure / unknown) as read-only.
  // The previous expression `partnerStatus !== null && partnerStatus !== 'ACTIVE'`
  // evaluated to `false` when partnerStatus was null, incorrectly allowing writes
  // for an unknown status.  Guard intent: only ACTIVE partners may submit/withdraw.
  const isReadOnly = partnerStatus !== 'ACTIVE';

  // F1 fix (review r2ae): handleSubmit and handleWithdraw removed.
  // The backend /venues/:id/menu/submit and /venues/:id/menu/withdraw endpoints are
  // authorize('ADMIN','SUPER_ADMIN') only — all partner calls return HTTP 403.
  // Spec §8a states menu management requires a separate product specification before
  // implementation.  The interactive UI is replaced with a contact-manager notice.

  if (loading) {
    return (
      <Container>
        <EmptyState>{t.loading}</EmptyState>
      </Container>
    );
  }

  // Finding 5 fix (review r2ae MEDIUM): Archived partners must have NO portal
  // access at all (spec §11.2 — zero access). Show a blocked state instead of
  // the read-only view that Inactive partners see.
  if (isArchived) {
    return (
      <Container>
        <div style={{
          padding: '1.25rem 1.5rem',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '0.75rem',
          color: '#991b1b',
          fontSize: '0.9375rem',
          lineHeight: 1.6,
        }}>
          {language === 'bg'
            ? 'Достъпът до партньорския портал е прекратен. За съдействие се свържете с office@boomcard.bg.'
            : 'Access to the partner portal has been revoked. Contact office@boomcard.bg for assistance.'}
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>{t.title}</Title>
        <Subtitle>{t.subtitle}</Subtitle>
      </Header>

      {/* MEDIUM-1 fix: show read-only banner for Inactive partners (§5.1). */}
      {isReadOnly && (
        <div style={{
          padding: '0.875rem 1rem',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '0.5rem',
          color: '#991b1b',
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
        }}>
          {t.inactiveNotice}
        </div>
      )}

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
                <MenuRow>
                  <RowLabel>{t.pendingReview}</RowLabel>
                  <ExternalLinkAnchor href={venue.pendingMenuUrl} target="_blank" rel="noopener noreferrer" muted>
                    <LinkIcon size={14} /> {venue.pendingMenuUrl}
                    <ExternalLink size={12} />
                  </ExternalLinkAnchor>
                </MenuRow>
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

              {/* F1 fix (review r2ae): the backend /venues/:id/menu/submit and
                  /venues/:id/menu/withdraw endpoints are authorize('ADMIN','SUPER_ADMIN')
                  only — partner-initiated submit/withdraw permanently 403s.
                  The spec §8a states menu management requires a separate product spec
                  before implementation.  Replace the broken submit/withdraw UI with a
                  read-only "contact your account manager" notice so partners are not
                  shown action buttons that will always fail silently. */}
              <ContactNotice>
                {language === 'bg'
                  ? 'За промени в менюто се свържете с вашия акаунт мениджър на office@boomcard.bg.'
                  : 'To update your menu, contact your account manager at office@boomcard.bg.'}
              </ContactNotice>
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


/* F1 fix (review r2ae): contact-manager notice replaces the broken submit/withdraw UI. */
const ContactNotice = styled.div`
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(59, 130, 246, 0.06);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #1e40af;
  line-height: 1.5;

  [data-theme="dark"] & {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.25);
    color: #93c5fd;
  }
`;
