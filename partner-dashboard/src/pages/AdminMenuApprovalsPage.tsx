import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle, ExternalLink, RefreshCw } from 'lucide-react';
import Button from '../components/common/Button/Button';
import { useLanguage } from '../contexts/LanguageContext';
import { venuesService, PendingMenuVenue } from '../services/venues.service';

const copy = {
  en: {
    title: 'Menu approvals',
    subtitle: 'Review partner-submitted menu URLs. Click the link to preview it, then approve or reject.',
    empty: 'No pending menu submissions.',
    refresh: 'Refresh',
    preview: 'Preview',
    approve: 'Approve',
    reject: 'Reject',
    reasonPlaceholder: 'Reason for rejection (visible to partner)',
    approved: 'Menu approved',
    rejected: 'Menu rejected',
    approveError: 'Could not approve menu',
    rejectError: 'Could not reject menu',
    needReason: 'Please enter a rejection reason',
    submittedAt: 'Submitted',
    partnerLabel: 'Partner',
    venueLabel: 'Venue',
    loading: 'Loading…',
    loadError: 'Failed to load pending menus',
    confirmApprove: (name: string) => `Approve menu for "${name}"? It will go live on the venue page immediately.`,
    confirmReject: (name: string) => `Reject menu for "${name}"? The partner will be notified with your reason.`,
  },
  bg: {
    title: 'Одобрение на менюта',
    subtitle: 'Прегледайте подадените от партньорите URL-и на менюта. Кликнете линка за преглед, след което одобрете или отхвърлете.',
    empty: 'Няма менюта за одобрение.',
    refresh: 'Опресни',
    preview: 'Преглед',
    approve: 'Одобри',
    reject: 'Отхвърли',
    reasonPlaceholder: 'Причина за отхвърляне (видима за партньора)',
    approved: 'Менюто е одобрено',
    rejected: 'Менюто е отхвърлено',
    approveError: 'Грешка при одобрение',
    rejectError: 'Грешка при отхвърляне',
    needReason: 'Моля въведете причина за отхвърляне',
    submittedAt: 'Подадено',
    partnerLabel: 'Партньор',
    venueLabel: 'Обект',
    loading: 'Зареждане…',
    loadError: 'Грешка при зареждане на менютата',
    confirmApprove: (name: string) => `Да одобрите ли менюто за "${name}"? То ще стане публично веднага.`,
    confirmReject: (name: string) => `Да отхвърлите ли менюто за "${name}"? Партньорът ще получи известие с вашата причина.`,
  },
};

const relativeLabels = {
  en: { now: 'just now', min: 'm ago', hour: 'h ago', day: 'd ago' },
  bg: { now: 'преди малко', min: 'мин. назад', hour: 'ч. назад', day: 'дни назад' },
};

const formatRelative = (iso: string | null, lang: string): string => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const l = relativeLabels[lang as keyof typeof relativeLabels] ?? relativeLabels.en;
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return l.now;
  if (mins < 60) return `${mins}${l.min}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}${l.hour}`;
  const days = Math.floor(hours / 24);
  return `${days}${l.day}`;
};

const AdminMenuApprovalsPage: React.FC = () => {
  const { language } = useLanguage();
  const t = copy[language as keyof typeof copy] ?? copy.en;
  const [items, setItems] = useState<PendingMenuVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const list = await venuesService.adminListPendingMenus();
      setItems(list);
    } catch {
      toast.error(t.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleApprove = async (venue: PendingMenuVenue) => {
    if (!window.confirm(t.confirmApprove(venue.name))) return;
    setBusy(prev => ({ ...prev, [venue.id]: true }));
    try {
      await venuesService.adminApproveMenu(venue.id, venue.pendingMenuUrl ?? undefined);
      setItems(prev => prev.filter(v => v.id !== venue.id));
      toast.success(t.approved);
    } catch (err) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
      const status = axiosErr?.response?.status;
      if (status === 409) {
        toast.error(axiosErr?.response?.data?.error || 'Pending URL changed — refreshing');
        await load();
        return;
      }
      toast.error(axiosErr?.response?.data?.error || t.approveError);
    } finally {
      setBusy(prev => ({ ...prev, [venue.id]: false }));
    }
  };

  const handleReject = async (venueId: string) => {
    const reason = (reasons[venueId] ?? '').trim();
    if (!reason) {
      toast.error(t.needReason);
      return;
    }
    const venue = items.find(v => v.id === venueId);
    if (!window.confirm(t.confirmReject(venue?.name ?? 'this venue'))) return;
    setBusy(prev => ({ ...prev, [venueId]: true }));
    try {
      await venuesService.adminRejectMenu(venueId, reason);
      setItems(prev => prev.filter(v => v.id !== venueId));
      toast.success(t.rejected);
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr?.response?.data?.error || t.rejectError);
    } finally {
      setBusy(prev => ({ ...prev, [venueId]: false }));
    }
  };

  return (
    <Container>
      <Header>
        <div>
          <Title>{t.title}</Title>
          <Subtitle>{t.subtitle}</Subtitle>
        </div>
        <Button variant="secondary" onClick={load}>
          <RefreshCw size={16} /> {t.refresh}
        </Button>
      </Header>

      {loading ? (
        <EmptyState>{t.loading}</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>{t.empty}</EmptyState>
      ) : (
        <List>
          {items.map(venue => (
            <Card key={venue.id}>
              <CardHeader>
                <div>
                  <Label>{t.partnerLabel}</Label>
                  <strong>{venue.partner?.businessName ?? '—'}</strong>
                </div>
                <div>
                  <Label>{t.venueLabel}</Label>
                  <strong>{venue.name}</strong>
                  {venue.city && <Location> · {venue.city}</Location>}
                </div>
                {venue.menuSubmittedAt && (
                  <Meta>
                    {t.submittedAt}: {formatRelative(venue.menuSubmittedAt, language)}
                    <MetaAbsolute>{new Date(venue.menuSubmittedAt).toLocaleString()}</MetaAbsolute>
                  </Meta>
                )}
              </CardHeader>

              <PreviewRow>
                <PreviewAnchor href={venue.pendingMenuUrl ?? '#'} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} /> {venue.pendingMenuUrl}
                </PreviewAnchor>
              </PreviewRow>

              <ActionRow>
                <Button onClick={() => handleApprove(venue)} disabled={!!busy[venue.id]}>
                  <CheckCircle2 size={16} /> {t.approve}
                </Button>
                <RejectWrap>
                  <ReasonInput
                    type="text"
                    placeholder={t.reasonPlaceholder}
                    value={reasons[venue.id] ?? ''}
                    onChange={e => setReasons(prev => ({ ...prev, [venue.id]: e.target.value }))}
                    disabled={!!busy[venue.id]}
                  />
                  <Button
                    variant="danger"
                    onClick={() => handleReject(venue.id)}
                    disabled={!!busy[venue.id] || !(reasons[venue.id] ?? '').trim()}
                  >
                    <XCircle size={16} /> {t.reject}
                  </Button>
                </RejectWrap>
              </ActionRow>
            </Card>
          ))}
        </List>
      )}
    </Container>
  );
};

export default AdminMenuApprovalsPage;

const Container = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 2rem;

  @media (max-width: 640px) {
    flex-direction: column;
  }
`;

const Title = styled.h1`
  margin: 0 0 0.5rem;
  font-size: 2rem;
  font-weight: 800;
  color: #111827;

  [data-theme="dark"] & { color: #f9fafb; }
`;

const Subtitle = styled.p`
  margin: 0;
  color: #6b7280;
  max-width: 720px;

  [data-theme="dark"] & { color: #9ca3af; }
`;

const EmptyState = styled.div`
  padding: 3rem;
  text-align: center;
  color: #6b7280;
  background: white;
  border: 1px dashed #e5e7eb;
  border-radius: 1rem;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
    color: #9ca3af;
  }
`;

const List = styled.div`
  display: grid;
  gap: 1.25rem;
`;

const Card = styled.div`
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

const CardHeader = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
`;

const Label = styled.div`
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  margin-bottom: 0.25rem;

  [data-theme="dark"] & { color: #9ca3af; }
`;

const Location = styled.span`
  color: #6b7280;

  [data-theme="dark"] & { color: #9ca3af; }
`;

const Meta = styled.div`
  font-size: 0.8125rem;
  color: #6b7280;
  align-self: end;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;

  [data-theme="dark"] & { color: #9ca3af; }
`;

const MetaAbsolute = styled.span`
  font-size: 0.75rem;
  color: #9ca3af;
`;

const PreviewRow = styled.div`
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  word-break: break-all;

  [data-theme="dark"] & {
    background: #111827;
    border-color: #374151;
  }
`;

const PreviewAnchor = styled.a`
  color: #4f46e5;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  text-decoration: none;

  &:hover { text-decoration: underline; }

  [data-theme="dark"] & { color: #a5b4fc; }
`;

const ActionRow = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: stretch;
  flex-wrap: wrap;
`;

const RejectWrap = styled.div`
  display: flex;
  gap: 0.5rem;
  flex: 1;
  min-width: 260px;
`;

const ReasonInput = styled.input`
  flex: 1;
  padding: 0.625rem 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  background: white;
  color: #111827;

  &:focus {
    outline: none;
    border-color: #ef4444;
    box-shadow: 0 0 0 3px rgba(239,68,68,0.15);
  }

  [data-theme="dark"] & {
    background: #111827;
    border-color: #374151;
    color: #f9fafb;
  }
`;
