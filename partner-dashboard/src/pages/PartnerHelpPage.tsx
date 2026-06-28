/**
 * Partner Help — Spec §11.1 v1.1
 *
 * Allows partners to view their own tickets, submit new ones, and send
 * follow-up replies. Corresponds to the "Помощ > Нова заявка" and
 * "Помощ > Моите заявки" sections described in §11.1 for the partner panel.
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiService } from '../services/api.service';

// ── Types ──────────────────────────────────────────────────────────────────
// S1 fix (r2ae): CANCELLED added — backend canonical mapping includes it and
// isTerminal/STATUS_LABELS/statusColor must all handle it so the reply box
// closes and the badge renders correctly when a CANCELLED ticket arrives.
type TicketStatus = 'NEW' | 'OPEN' | 'IN_REVIEW' | 'WAITING' | 'RESOLVED' | 'CLOSED' | 'REJECTED' | 'CANCELLED';

interface PartnerTicket {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  // INFO-2 fix: `priority` is an internal triage field not shown to the partner.
  // Removed from the type so it is ignored even if the backend returns it.
  requestType: string;
  // `source` and `assignee` removed: the partner-safe list/detail projections in
  // partnerHelp.routes.ts (the `select` blocks) no longer return them — they are
  // internal admin fields (spec §11.3). Declaring them here was dead type surface.
  createdAt: string;
  updatedAt: string;
}

interface PartnerTicketFull extends PartnerTicket {
  body: string;
  // INFO-1 fix: `externalEmail` (email-ingested sender address) and
  // `reopenedAt` (internal audit timestamp) are not rendered and not
  // partner-visible per spec. Removed to minimise unnecessary field exposure.
}

interface PartnerReply {
  id: string;
  body: string;
  isAdmin: boolean;
  createdAt: string;
  // LOW-1 fix (r2ae): remove `author.id` from the partner-visible type.
  // `author.id` is an internal admin UUID (spec §11.3 — internal data must not
  // be surfaced). Even though it is not rendered today, it is present in the
  // deserialised object and accessible via browser devtools. The same
  // defence-in-depth approach was already applied to `assignee.id`.
  author: { firstName: string | null; lastName: string | null } | null;
}

// ── Palette ────────────────────────────────────────────────────────────────
const p = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', muted: '#605a50', subtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  warning: '#b5803a', warningSoft: '#f5ead2',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  info: '#2563eb', infoSoft: '#dbeafe',
  adminBubble: '#f0f4ff', userBubble: '#f5f4f0',
};

// ── Labels ─────────────────────────────────────────────────────────────────
// S1 fix (r2ae): CANCELLED added to STATUS_LABELS
const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: 'Нова', OPEN: 'В процес', IN_REVIEW: 'В процес', WAITING: 'Чака',
  RESOLVED: 'Затворена', CLOSED: 'Затворена', REJECTED: 'Затворена', CANCELLED: 'Отменена',
};

const CATEGORY_LABELS: Record<string, string> = {
  CASHBACK: 'Кешбек', ACCOUNT: 'Акаунт', PAYMENT: 'Плащане',
  TECHNICAL: 'Техническо', OTHER: 'Друго',
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  SUPPORT: 'Поддръжка', DATA_CHANGE: 'Промяна на данни',
  LOCATION_CHANGE: 'Промяна на локация', CONTRACT_CHANGE: 'Промяна на договор',
  DISPUTE: 'Спор', OTHER: 'Друго', CHANGE: 'Промяна',
};

const VALID_CATEGORIES = ['CASHBACK', 'ACCOUNT', 'PAYMENT', 'TECHNICAL', 'OTHER'] as const;
const VALID_REQUEST_TYPES = ['SUPPORT', 'DATA_CHANGE', 'LOCATION_CHANGE', 'CONTRACT_CHANGE', 'DISPUTE', 'OTHER'] as const;

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(iso: string) {
  return new Date(iso).toLocaleString('bg-BG', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function extractApiError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

// S1 fix (r2ae): CANCELLED added to isTerminal so the reply box closes for
// cancelled tickets (spec §10.4 canonical status includes CANCELLED as final).
// F1 fix: RESOLVED removed — backend intentionally allows replies on RESOLVED
// tickets and reopens them to OPEN on partner reply (partnerHelp.routes.ts:310).
function isTerminal(status: TicketStatus) {
  return status === 'CLOSED' || status === 'REJECTED' || status === 'CANCELLED';
}

// ── API calls ──────────────────────────────────────────────────────────────
const partnerHelpApi = {
  listTickets: (page: number) =>
    apiService.get('/partner/help/tickets', { page, limit: 20 }) as Promise<{
      success: boolean; data: { tickets: PartnerTicket[]; total: number; page: number; limit: number };
    }>,

  getTicket: (id: string) =>
    apiService.get(`/partner/help/tickets/${id}`) as Promise<{ success: boolean; data: PartnerTicketFull }>,

  getReplies: (id: string) =>
    apiService.get(`/partner/help/tickets/${id}/replies`) as Promise<{ success: boolean; data: PartnerReply[] }>,

  createTicket: (data: { subject: string; body: string; category: string; requestType: string }) =>
    apiService.post('/partner/help/ticket', data) as Promise<{ success: boolean; data: PartnerTicket }>,

  sendReply: (id: string, body: string) =>
    apiService.post(`/partner/help/tickets/${id}/reply`, { body }) as Promise<{ success: boolean; data: PartnerReply }>,
};

// ── Status Badge ───────────────────────────────────────────────────────────
// S1 fix (r2ae): CANCELLED case added so the badge renders with a meaningful
// colour rather than falling through to the default (which would show info-blue,
// the same as NEW/OPEN, misleading the partner into thinking the ticket is active).
function statusColor(status: TicketStatus): { bg: string; text: string } {
  switch (status) {
    case 'NEW':
    case 'OPEN':       return { bg: p.infoSoft, text: p.info };
    case 'IN_REVIEW':  return { bg: p.infoSoft, text: p.info };
    case 'WAITING':    return { bg: p.warningSoft, text: p.warning };
    case 'RESOLVED':
    case 'CLOSED':
    case 'REJECTED':
    case 'CANCELLED':  return { bg: p.border, text: p.subtle };
    default: {
      const _: never = status;
      return { bg: p.infoSoft, text: p.info };
    }
  }
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PartnerHelpPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [replyBody, setReplyBody] = useState('');

  // New ticket form state
  const [form, setForm] = useState({
    subject: '', body: '', category: 'OTHER', requestType: 'SUPPORT',
  });

  // LOW-5 fix: ProfilePage CTAs deep-link here with query params
  //   /partners/help?type=Change                       (Request data change)
  //   /partners/help?type=Change&subject=close-account (Request account closure)
  // Read those params on mount, open the "new ticket" view and prefill the form
  // so the CTA actually lands the partner on a pre-populated request form.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const type = searchParams.get('type');
    const subject = searchParams.get('subject');
    if (!type && !subject) return;

    setForm((f) => {
      const next = { ...f };
      // `type=Change` is a data-change request intent.
      if (type && type.toLowerCase() === 'change') {
        next.requestType = subject === 'close-account' ? 'CONTRACT_CHANGE' : 'DATA_CHANGE';
        next.category = 'ACCOUNT';
      }
      // Map the known subject shortcut to a prefilled subject line.
      if (subject === 'close-account') {
        next.subject = 'Заявка за закриване на акаунт';
        next.requestType = 'CONTRACT_CHANGE';
        next.category = 'ACCOUNT';
      }
      return next;
    });
    setView('new');

    // Clear the params so a later manual navigation to "list" / "new" is not
    // re-triggered, and a browser refresh doesn't re-prefill unexpectedly.
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['partner-help-tickets', page],
    queryFn: () => partnerHelpApi.listTickets(page),
    enabled: view === 'list',
  });

  const { data: ticketData, isLoading: ticketLoading } = useQuery({
    queryKey: ['partner-help-ticket', selectedId],
    queryFn: () => partnerHelpApi.getTicket(selectedId!),
    enabled: !!selectedId && view === 'detail',
    refetchInterval: 30_000,
  });

  const { data: repliesData, isLoading: repliesLoading } = useQuery({
    queryKey: ['partner-help-replies', selectedId],
    queryFn: () => partnerHelpApi.getReplies(selectedId!),
    enabled: !!selectedId && view === 'detail',
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: () => partnerHelpApi.createTicket(form),
    onSuccess: (res) => {
      toast.success('Заявката е подадена');
      qc.invalidateQueries({ queryKey: ['partner-help-tickets'] });
      setSelectedId(res.data.id);
      setView('detail');
      setForm({ subject: '', body: '', category: 'OTHER', requestType: 'SUPPORT' });
    },
    onError: (err) => toast.error(extractApiError(err, 'Грешка при подаване')),
  });

  const replyMutation = useMutation({
    mutationFn: () => partnerHelpApi.sendReply(selectedId!, replyBody.trim()),
    onSuccess: () => {
      toast.success('Отговорът е изпратен');
      setReplyBody('');
      qc.invalidateQueries({ queryKey: ['partner-help-replies', selectedId] });
      qc.invalidateQueries({ queryKey: ['partner-help-ticket', selectedId] });
      qc.invalidateQueries({ queryKey: ['partner-help-tickets'] });
    },
    onError: (err) => toast.error(extractApiError(err, 'Грешка при изпращане')),
  });

  const tickets = listData?.data.tickets ?? [];
  const total = listData?.data.total ?? 0;
  const ticket = ticketData?.data;
  const replies = repliesData?.data ?? [];

  const openDetail = (id: string) => { setSelectedId(id); setView('detail'); };

  // ── Render: New ticket form ─────────────────────────────────────────────
  if (view === 'new') {
    const valid = form.subject.trim().length >= 5 && form.body.trim().length >= 10;
    return (
      <Shell>
        <Header>
          <div>
            <Eyebrow>Помощ</Eyebrow>
            <Title>Нова заявка</Title>
          </div>
          <BackBtn onClick={() => setView('list')}>← Назад</BackBtn>
        </Header>
        <Card>
          <FormGroup>
            <FormLabel>Тема <Req>*</Req></FormLabel>
            <FormInput
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Кратко описание на проблема…"
              maxLength={200}
            />
            <FormHint>{form.subject.trim().length}/200</FormHint>
          </FormGroup>
          <FormGroup>
            <FormLabel>Тип заявка</FormLabel>
            <FormSelect value={form.requestType} onChange={(e) => setForm((f) => ({ ...f, requestType: e.target.value }))}>
              {VALID_REQUEST_TYPES.map((rt) => <option key={rt} value={rt}>{REQUEST_TYPE_LABELS[rt]}</option>)}
            </FormSelect>
          </FormGroup>
          <FormGroup>
            <FormLabel>Категория</FormLabel>
            <FormSelect value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {VALID_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </FormSelect>
          </FormGroup>
          <FormGroup>
            <FormLabel>Описание <Req>*</Req></FormLabel>
            <FormTextarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Подробно описание на заявката…"
              rows={6}
              maxLength={5000}
            />
            <FormHint>{form.body.trim().length}/5000 (минимум 10 символа)</FormHint>
          </FormGroup>
          <SubmitBtn
            onClick={() => { if (valid) createMutation.mutate(); }}
            disabled={!valid || createMutation.isPending}
          >
            {createMutation.isPending ? 'Изпращане…' : 'Подай заявка'}
          </SubmitBtn>
        </Card>
      </Shell>
    );
  }

  // ── Render: Ticket detail ───────────────────────────────────────────────
  if (view === 'detail' && selectedId) {
    const terminal = ticket ? isTerminal(ticket.status) : false;
    const sc = ticket ? statusColor(ticket.status) : { bg: p.border, text: p.subtle };

    return (
      <Shell>
        <Header>
          <div>
            <Eyebrow>Помощ</Eyebrow>
            <Title>{ticketLoading ? 'Зареждане…' : (ticket?.subject ?? 'Заявка')}</Title>
            {ticket && (
              <BadgeRow>
                <StatusBadge $bg={sc.bg} $color={sc.text}>{STATUS_LABELS[ticket.status]}</StatusBadge>
                <SmallLabel>{REQUEST_TYPE_LABELS[ticket.requestType] ?? ticket.requestType}</SmallLabel>
                <SmallLabel>Подадена {fmt(ticket.createdAt)}</SmallLabel>
              </BadgeRow>
            )}
          </div>
          <BackBtn onClick={() => setView('list')}>← Всички заявки</BackBtn>
        </Header>

        {ticket && (
          <Card style={{ marginBottom: '1rem' }}>
            <BubbleLabel>Вашето съобщение · {fmt(ticket.createdAt)}</BubbleLabel>
            <BubbleBody style={{ whiteSpace: 'pre-wrap' }}>{ticket.body}</BubbleBody>
          </Card>
        )}

        {repliesLoading && <Subtle>Зареждане на отговорите…</Subtle>}

        {replies.map((r) => (
          <Card key={r.id} style={{ marginBottom: '0.75rem', background: r.isAdmin ? p.adminBubble : p.userBubble }}>
            <BubbleLabel>
              {r.isAdmin ? 'Администратор' : 'Вие'} · {fmt(r.createdAt)}
            </BubbleLabel>
            <BubbleBody style={{ whiteSpace: 'pre-wrap' }}>{r.body}</BubbleBody>
          </Card>
        ))}

        {!repliesLoading && replies.length === 0 && ticket && (
          <Subtle style={{ padding: '1rem 0' }}>Все още няма отговори.</Subtle>
        )}

        {terminal ? (
          <ClosedNote>
            {ticket?.status === 'CANCELLED'
              ? 'Заявката е отменена — нови отговори не се приемат.'
              : 'Заявката е затворена — нови отговори не се приемат.'}
          </ClosedNote>
        ) : (
          <Card>
            <FormLabel>Добавете отговор</FormLabel>
            <FormTextarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Напишете вашия отговор…"
              rows={4}
              maxLength={5000}
              disabled={replyMutation.isPending}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
              <FormHint>{replyBody.trim().length < 10 ? `Минимум 10 символа (${replyBody.trim().length}/10)` : `${replyBody.trim().length}/5000`}</FormHint>
              <SubmitBtn
                onClick={() => { if (replyBody.trim().length >= 10) replyMutation.mutate(); }}
                disabled={replyBody.trim().length < 10 || replyMutation.isPending}
              >
                {replyMutation.isPending ? 'Изпращане…' : 'Изпрати'}
              </SubmitBtn>
            </div>
          </Card>
        )}
      </Shell>
    );
  }

  // ── Render: Ticket list ─────────────────────────────────────────────────
  return (
    <Shell>
      <Header>
        <div>
          <Eyebrow>Помощ</Eyebrow>
          <Title>Моите заявки {total > 0 && <CountBadge>{total}</CountBadge>}</Title>
          <Subtitle>Заявки, подадени от вас към екипа на BoomCard</Subtitle>
        </div>
        <NewBtn onClick={() => setView('new')}>+ Нова заявка</NewBtn>
      </Header>

      {listLoading && <Subtle>Зареждане…</Subtle>}

      {!listLoading && tickets.length === 0 && (
        <EmptyState>
          <p>Нямате подадени заявки.</p>
          <NewBtn onClick={() => setView('new')}>Подайте нова заявка</NewBtn>
        </EmptyState>
      )}

      {tickets.map((t) => {
        const sc = statusColor(t.status);
        return (
          <TicketRow key={t.id} onClick={() => openDetail(t.id)}>
            <TicketMain>
              <TicketSubject>{t.subject}</TicketSubject>
              <TicketMeta>
                {CATEGORY_LABELS[t.category] ?? t.category} · {fmt(t.createdAt)}
              </TicketMeta>
            </TicketMain>
            <TicketRight>
              <StatusBadge $bg={sc.bg} $color={sc.text}>{STATUS_LABELS[t.status]}</StatusBadge>
            </TicketRight>
          </TicketRow>
        );
      })}

      {total > 20 && (
        <Pagination>
          <PageBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>←</PageBtn>
          <span style={{ fontSize: '0.875rem', color: p.muted }}>{page}</span>
          <PageBtn onClick={() => setPage((pg) => pg + 1)} disabled={tickets.length < 20 || page * 20 >= total}>→</PageBtn>
        </Pagination>
      )}
    </Shell>
  );
}

// ── Styled components ──────────────────────────────────────────────────────
const Shell = styled.div`background: ${p.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const Header = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;`;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${p.subtle}; margin-bottom: 0.25rem;`;
const Title = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${p.text}; margin: 0 0 0.25rem;`;
const Subtitle = styled.p`font-size: 0.9375rem; color: ${p.muted}; margin: 0;`;
const Subtle = styled.p`color: ${p.subtle}; font-size: 0.875rem;`;
const Card = styled.div`background: ${p.surface}; border: 1px solid ${p.border}; border-radius: 0.75rem; padding: 1.25rem 1.5rem; margin-bottom: 1rem;`;
const BackBtn = styled.button`padding: 0.5rem 1rem; border: 1px solid ${p.border}; border-radius: 0.5rem; background: ${p.surface}; color: ${p.muted}; font-size: 0.875rem; cursor: pointer; white-space: nowrap; &:hover { background: ${p.border}; }`;
const NewBtn = styled.button`padding: 0.5625rem 1.125rem; border: none; border-radius: 0.5rem; background: ${p.accent}; color: #fff; font-size: 0.875rem; font-weight: 600; cursor: pointer; white-space: nowrap; &:hover { background: #b5522e; }`;
const SubmitBtn = styled.button`padding: 0.5rem 1.25rem; border: none; border-radius: 0.5rem; background: ${p.accent}; color: #fff; font-size: 0.875rem; font-weight: 600; cursor: pointer; &:hover:not(:disabled) { background: #b5522e; } &:disabled { opacity: 0.5; cursor: not-allowed; }`;

const FormGroup = styled.div`margin-bottom: 1rem;`;
const FormLabel = styled.label`display: block; font-size: 0.8125rem; font-weight: 600; color: ${p.muted}; margin-bottom: 0.35rem;`;
const Req = styled.span`color: ${p.danger};`;
const FormInput = styled.input`width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; border: 1px solid ${p.border}; border-radius: 0.5rem; font-size: 0.9rem; background: ${p.bg}; color: ${p.text}; outline: none; &:focus { border-color: ${p.accent}; }`;
const FormSelect = styled.select`width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; border: 1px solid ${p.border}; border-radius: 0.5rem; font-size: 0.9rem; background: ${p.bg}; color: ${p.text}; outline: none; cursor: pointer; &:focus { border-color: ${p.accent}; }`;
const FormTextarea = styled.textarea`width: 100%; box-sizing: border-box; resize: vertical; padding: 0.625rem 0.875rem; border: 1px solid ${p.border}; border-radius: 0.5rem; font-size: 0.875rem; font-family: inherit; background: ${p.bg}; color: ${p.text}; outline: none; &:focus { border-color: ${p.accent}; } &:disabled { opacity: 0.5; }`;
const FormHint = styled.p`font-size: 0.75rem; color: ${p.subtle}; margin: 0.2rem 0 0;`;

const TicketRow = styled.div`display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1rem 1.25rem; background: ${p.surface}; border: 1px solid ${p.border}; border-radius: 0.625rem; margin-bottom: 0.625rem; cursor: pointer; &:hover { border-color: ${p.accent}; background: ${p.accentSoft}; }`;
const TicketMain = styled.div`flex: 1; min-width: 0;`;
const TicketSubject = styled.div`font-weight: 600; color: ${p.text}; font-size: 0.9375rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
const TicketMeta = styled.div`font-size: 0.75rem; color: ${p.subtle}; margin-top: 0.2rem;`;
const TicketRight = styled.div`display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; flex-shrink: 0;`;

const StatusBadge = styled.span<{ $bg: string; $color: string }>`
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; border-radius: 0.375rem; padding: 0.125rem 0.5rem;
  background: ${({ $bg }) => $bg}; color: ${({ $color }) => $color};
`;

const BadgeRow = styled.div`display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-top: 0.5rem;`;
const SmallLabel = styled.span`font-size: 0.75rem; color: ${p.subtle};`;
const CountBadge = styled.span`display: inline-flex; align-items: center; justify-content: center; background: ${p.infoSoft}; color: ${p.info}; font-size: 0.75rem; font-weight: 700; border-radius: 9999px; padding: 0.125rem 0.6rem; margin-left: 0.5rem;`;

const BubbleLabel = styled.div`font-size: 0.6875rem; font-weight: 600; color: ${p.subtle}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.375rem;`;
const BubbleBody = styled.div`font-size: 0.875rem; color: ${p.text}; line-height: 1.55;`;

const ClosedNote = styled.div`text-align: center; font-size: 0.875rem; color: ${p.muted}; background: ${p.border}; border-radius: 0.5rem; padding: 1rem; margin-top: 0.5rem;`;

const EmptyState = styled.div`text-align: center; padding: 3rem 1rem; color: ${p.muted}; display: flex; flex-direction: column; align-items: center; gap: 1rem;`;

const Pagination = styled.div`display: flex; gap: 1rem; justify-content: center; align-items: center; margin-top: 1rem;`;
const PageBtn = styled.button`padding: 0.375rem 0.75rem; border: 1px solid ${p.border}; border-radius: 0.375rem; background: ${p.surface}; color: ${p.text}; cursor: pointer; &:disabled { opacity: 0.4; cursor: not-allowed; } &:hover:not(:disabled) { background: ${p.border}; }`;
