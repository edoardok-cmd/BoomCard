import { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  adminHelpService,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  TicketUser,
} from '../../services/adminHelp.service';
import { adminAdminsService } from '../../services/adminAdmins.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  warning: '#b5803a', warningSoft: '#f5ead2',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  info: '#2563eb', infoSoft: '#dbeafe',
  adminBubble: '#f0f4ff', userBubble: '#f5f4f0',
};

const copy = {
  en: {
    loading: 'Loading ticket…',
    loadError: 'Failed to load ticket',
    status: 'Status',
    priority: 'Priority',
    assignedTo: 'Assigned to',
    unassigned: 'Unassigned',
    assignToMe: 'Assign to me',
    originalMessage: 'Original message',
    noReplies: 'No replies yet — be the first to respond.',
    replyPlaceholder: 'Write your reply…',
    send: 'Send reply',
    sending: 'Sending…',
    replied: 'Reply sent',
    replyError: 'Failed to send reply',
    assignedOk: 'Ticket assigned',
    unassignedOk: 'Ticket unassigned',
    assignError: 'Failed to assign ticket',
    statusUpdated: 'Status updated',
    statusError: 'Failed to update status',
    priorityUpdated: 'Priority updated',
    priorityError: 'Failed to update priority',
    admin: 'Admin',
    user: 'Submitter',
    close: '✕',
    ticketClosed: 'This ticket is closed — replies are disabled.',
    opened: 'Opened',
    statuses: {
      NEW: 'Open', OPEN: 'Open', IN_REVIEW: 'In Review', WAITING: 'Waiting for reply', RESOLVED: 'Resolved', CLOSED: 'Closed', REJECTED: 'Rejected',
    } as Record<TicketStatus, string>,
    priorities: {
      LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent',
    } as Record<TicketPriority, string>,
    categories: {
      CASHBACK: 'Cashback', ACCOUNT: 'Account', PAYMENT: 'Payment', TECHNICAL: 'Technical', OTHER: 'Other',
    } as Record<TicketCategory, string>,
  },
  bg: {
    loading: 'Зареждане…',
    loadError: 'Грешка при зареждане',
    status: 'Статус',
    priority: 'Приоритет',
    assignedTo: 'Назначена на',
    unassigned: 'Неназначена',
    assignToMe: 'Вземи заявката',
    originalMessage: 'Оригинално съобщение',
    noReplies: 'Няма отговори — бъдете първи.',
    replyPlaceholder: 'Напишете отговор…',
    send: 'Изпрати',
    sending: 'Изпращане…',
    replied: 'Отговорът е изпратен',
    replyError: 'Грешка при изпращане',
    assignedOk: 'Заявката е назначена',
    unassignedOk: 'Назначаването е премахнато',
    assignError: 'Грешка при назначаване',
    statusUpdated: 'Статусът е обновен',
    statusError: 'Грешка при обновяване на статуса',
    priorityUpdated: 'Приоритетът е обновен',
    priorityError: 'Грешка при обновяване на приоритета',
    admin: 'Администратор',
    user: 'Подател',
    close: '✕',
    ticketClosed: 'Заявката е затворена — отговорите са забранени.',
    opened: 'Подадена',
    statuses: {
      NEW: 'Отворена', OPEN: 'Отворена', IN_REVIEW: 'В преглед', WAITING: 'Чака отговор', RESOLVED: 'Решена', CLOSED: 'Затворена', REJECTED: 'Отказана',
    } as Record<TicketStatus, string>,
    priorities: {
      LOW: 'Нисък', MEDIUM: 'Среден', HIGH: 'Висок', URGENT: 'Спешен',
    } as Record<TicketPriority, string>,
    categories: {
      CASHBACK: 'Кешбек', ACCOUNT: 'Акаунт', PAYMENT: 'Плащане', TECHNICAL: 'Техническо', OTHER: 'Друго',
    } as Record<TicketCategory, string>,
  },
};

function extractApiError(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
  );
}

function displayName(u: TicketUser | null | undefined): string {
  if (!u) return '—';
  const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return name || u.email;
}

function fmtDate(iso: string, locale = 'bg-BG'): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface Props {
  ticketId: string | null;
  onClose: () => void;
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

export default function TicketDrawer({ ticketId, onClose }: Props) {
  const { language } = useLanguage();
  const { user: currentUser } = useAuth();
  const t = copy[language as keyof typeof copy] ?? copy.en;
  const qc = useQueryClient();
  const [replyBody, setReplyBody] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ticketId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ticketId, onClose]);

  const { data: ticketData, isLoading: ticketLoading, isError: ticketError } = useQuery({
    queryKey: ['admin-help-ticket', ticketId],
    queryFn: () => adminHelpService.getOne(ticketId!),
    enabled: !!ticketId,
    staleTime: 20_000,
  });

  const { data: repliesData, isLoading: repliesLoading } = useQuery({
    queryKey: ['admin-help-replies', ticketId],
    queryFn: () => adminHelpService.getReplies(ticketId!),
    enabled: !!ticketId,
    refetchInterval: 30_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-help-ticket', ticketId] });
    qc.invalidateQueries({ queryKey: ['admin-help-replies', ticketId] });
    qc.invalidateQueries({ queryKey: ['admin-help-all'] });
    qc.invalidateQueries({ queryKey: ['admin-help-mine'] });
    qc.invalidateQueries({ queryKey: ['admin-help-new-count'] });
  };

  const replyMutation = useMutation({
    mutationFn: (body: string) => adminHelpService.sendReply(ticketId!, body),
    onSuccess: () => {
      toast.success(t.replied);
      setReplyBody('');
      invalidateAll();
    },
    onError: (err) => toast.error(extractApiError(err, t.replyError)),
  });

  const statusMutation = useMutation({
    mutationFn: (status: TicketStatus) => adminHelpService.update(ticketId!, { status }),
    onSuccess: () => { toast.success(t.statusUpdated); invalidateAll(); },
    onError: (err) => toast.error(extractApiError(err, t.statusError)),
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: TicketPriority) => adminHelpService.update(ticketId!, { priority }),
    onSuccess: () => { toast.success(t.priorityUpdated); invalidateAll(); },
    onError: (err) => toast.error(extractApiError(err, t.priorityError)),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => adminHelpService.reject(ticketId!, reason),
    onSuccess: () => {
      toast.success(language === 'bg' ? 'Заявката е отказана' : 'Ticket rejected');
      setShowRejectInput(false);
      setRejectReason('');
      invalidateAll();
    },
    onError: (err) => toast.error(extractApiError(err, language === 'bg' ? 'Грешка при отказване' : 'Failed to reject ticket')),
  });

  const assignMutation = useMutation({
    // undefined  → self-assign (no body, backend defaults to caller)
    // null       → unassign   (sends { assigneeId: null })
    // "uuid"     → assign to that admin (SUPER_ADMIN only)
    mutationFn: (assigneeId: string | null | undefined) =>
      adminHelpService.assign(
        ticketId!,
        assigneeId !== undefined ? { assigneeId } : undefined,
      ),
    onSuccess: (_, assigneeId) => {
      toast.success(assigneeId === null ? t.unassignedOk : t.assignedOk);
      invalidateAll();
    },
    onError: (err) => toast.error(extractApiError(err, t.assignError)),
  });

  const { data: adminsData } = useQuery({
    queryKey: ['admin-users-for-assignment'],
    queryFn: () => adminAdminsService.list({ limit: 500 }),
    enabled: currentUser?.rawRole === 'SUPER_ADMIN' && !!ticketId,
    staleTime: 5 * 60_000,
  });

  const ticket = ticketData?.ticket;
  const replies = repliesData?.replies ?? [];

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [replies]);

  if (!ticketId) return null;

  const isClosed = ticket?.status === 'CLOSED' || ticket?.status === 'REJECTED';
  const busy = replyMutation.isPending;
  const isSuperAdmin = currentUser?.rawRole === 'SUPER_ADMIN';
  // isCreator: true when the current user submitted this ticket, regardless of role.
  // Used exclusively to hide the "Assign to me" button — the backend blocks self-assign
  // for all roles (no SUPER_ADMIN carve-out).
  const isCreator = !!ticket && ticket.user.id === currentUser?.id;
  // Creator-only: submitted the ticket but is not the current assignee (and not SUPER_ADMIN).
  // This mirrors the backend isCreatorOnly guard and determines which controls to restrict.
  const isCreatorOnly = !!ticket && !isSuperAdmin
    && ticket.user.id === currentUser?.id
    && ticket.assignee?.id !== currentUser?.id;

  return (
    <>
      <Overlay onClick={onClose} />
      <Panel>
        {/* Header */}
        <DrawerHeader>
          <HeaderTop>
            <BadgeRow>
              {ticket && (
                <>
                  <CategoryPill $cat={ticket.category}>{t.categories[ticket.category]}</CategoryPill>
                  <StatusPill $status={ticket.status}>{t.statuses[ticket.status]}</StatusPill>
                  <PriorityPill $priority={ticket.priority}>{t.priorities[ticket.priority]}</PriorityPill>
                </>
              )}
            </BadgeRow>
            <CloseBtn onClick={onClose} aria-label="close">{t.close}</CloseBtn>
          </HeaderTop>

          {ticketLoading && <LoadingText>{t.loading}</LoadingText>}
          {ticketError && <ErrorText>{t.loadError}</ErrorText>}

          {ticket && (
            <>
              <DrawerTitle>{ticket.subject}</DrawerTitle>
              <MetaGrid>
                <MetaItem>
                  <MetaLabel>{t.assignedTo}</MetaLabel>
                  <MetaValue>
                    {isSuperAdmin ? (
                      <AssignSelect
                        value={ticket.assignee?.id ?? ''}
                        onChange={(e) => {
                          // Empty string → unassign (null); UUID → assign to that admin.
                          assignMutation.mutate(e.target.value === '' ? null : e.target.value);
                        }}
                        // Keep disabled while the admins list is still loading to avoid a
                        // value-without-matching-option visual glitch and accidental selection.
                        disabled={assignMutation.isPending || !adminsData}
                        title={language === 'bg' ? 'Изберете отговорник' : 'Select assignee'}
                      >
                        <option value="">— {t.unassigned} —</option>
                        {!adminsData ? (
                          // While loading: keep a stable option for the current assignee so the
                          // select value always has a matching option and doesn't visually reset.
                          ticket.assignee && (
                            <option value={ticket.assignee.id}>{displayName(ticket.assignee)}</option>
                          )
                        ) : (
                          adminsData.admins
                            .filter((a) => a.id !== ticket.user.id)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {`${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || a.email}
                              </option>
                            ))
                        )}
                      </AssignSelect>
                    ) : (
                      <>
                        {ticket.assignee ? displayName(ticket.assignee) : (
                          <span style={{ color: palette.danger }}>{t.unassigned}</span>
                        )}
                        {!ticket.assignee && !isCreator && (
                          <AssignBtn
                            onClick={() => assignMutation.mutate(undefined)}
                            disabled={assignMutation.isPending}
                          >
                            {t.assignToMe}
                          </AssignBtn>
                        )}
                      </>
                    )}
                  </MetaValue>
                </MetaItem>
                <MetaItem>
                  <MetaLabel>{t.user}</MetaLabel>
                  <MetaValue>{displayName(ticket.user)}</MetaValue>
                  <MetaEmail>{ticket.user.email}</MetaEmail>
                </MetaItem>
                <MetaItem>
                  <MetaLabel>{t.opened}</MetaLabel>
                  <MetaValue style={{ fontSize: '0.8125rem' }}>{fmtDate(ticket.createdAt)}</MetaValue>
                </MetaItem>
                {(ticket as any).externalEmail && (
                  <MetaItem>
                    <MetaLabel>{language === 'bg' ? 'Имейл на подател' : 'Sender email'}</MetaLabel>
                    <MetaValue style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{(ticket as any).externalEmail}</MetaValue>
                  </MetaItem>
                )}
                {ticket.bounceCount > 0 && (
                  <MetaItem>
                    <MetaLabel>{language === 'bg' ? 'Bounce-и (30 дни)' : 'Bounces (30d)'}</MetaLabel>
                    <MetaValue style={{ fontSize: '0.8125rem', color: ticket.bounceCount >= 3 ? palette.danger : palette.warning }}>
                      {ticket.bounceCount}
                    </MetaValue>
                  </MetaItem>
                )}
              </MetaGrid>

              {/* Controls */}
              <ControlsRow>
                <ControlGroup>
                  <ControlLabel>{t.status}</ControlLabel>
                  <ControlSelect
                    value={ticket.status}
                    onChange={(e) => statusMutation.mutate(e.target.value as TicketStatus)}
                    disabled={statusMutation.isPending || isClosed}
                  >
                    {((['OPEN', 'IN_REVIEW', 'WAITING', 'RESOLVED', 'CLOSED'] as TicketStatus[])
                      // Always include the current status in the list so the select has a valid value,
                      // even for tickets that still carry the legacy NEW or REJECTED status.
                      // REJECTED is excluded from normal options — use the Reject button which
                      // enforces the required reason. Current status is always included as a fallback.
                      .concat(['NEW', 'REJECTED'].includes(ticket.status) ? [ticket.status as TicketStatus] : [])
                      .filter((s, i, arr) => arr.indexOf(s) === i) // dedupe
                      .filter((s) => !isCreatorOnly || s === ticket.status || s === 'RESOLVED')
                    ).map((s) => (
                      <option key={s} value={s}>{t.statuses[s]}</option>
                    ))}
                  </ControlSelect>
                  {isCreatorOnly && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
                    <ControlHint>{language === 'bg' ? 'Можете само да маркирате като решена' : 'You may only mark as resolved'}</ControlHint>
                  )}
                </ControlGroup>
                <ControlGroup>
                  <ControlLabel>{t.priority}</ControlLabel>
                  <ControlSelect
                    value={ticket.priority}
                    onChange={(e) => priorityMutation.mutate(e.target.value as TicketPriority)}
                    disabled={priorityMutation.isPending || isCreatorOnly || isClosed}
                    title={isCreatorOnly ? (language === 'bg' ? 'Само отговорникът може да променя приоритета' : 'Only the assignee can change the priority') : undefined}
                  >
                    {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as TicketPriority[]).map((p) => (
                      <option key={p} value={p}>{t.priorities[p]}</option>
                    ))}
                  </ControlSelect>
                </ControlGroup>
                {ticket && !isClosed && (isSuperAdmin || ticket.assignee?.id === currentUser?.id) && (
                  <ControlGroup style={{ marginLeft: 'auto' }}>
                    {showRejectInput ? (
                      <>
                        <input
                          type="text"
                          placeholder={language === 'bg' ? 'Причина за отказване…' : 'Rejection reason…'}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          style={{ padding: '0.3rem 0.5rem', border: '1px solid #e8e5dc', borderRadius: '0.375rem', fontSize: '0.8125rem', width: '14rem' }}
                        />
                        <RejectBtn
                          onClick={() => { if (rejectReason.trim().length >= 10) rejectMutation.mutate(rejectReason.trim()); }}
                          disabled={rejectMutation.isPending || rejectReason.trim().length < 10}
                        >
                          {rejectMutation.isPending ? (language === 'bg' ? 'Обработване…' : 'Processing…') : (language === 'bg' ? 'Потвърди' : 'Confirm')}
                        </RejectBtn>
                        <CancelBtn onClick={() => { setShowRejectInput(false); setRejectReason(''); }}>
                          {language === 'bg' ? 'Отказ' : 'Cancel'}
                        </CancelBtn>
                      </>
                    ) : (
                      <RejectBtn onClick={() => setShowRejectInput(true)}>
                        {language === 'bg' ? 'Откажи заявката' : 'Reject ticket'}
                      </RejectBtn>
                    )}
                  </ControlGroup>
                )}
              </ControlsRow>
            </>
          )}
        </DrawerHeader>

        {/* Thread */}
        <Thread ref={threadRef}>
          {ticket && (
            <Bubble $isAdmin={false}>
              <BubbleLabel>{t.user} · {displayName(ticket.user)} · {fmtDate(ticket.createdAt)}</BubbleLabel>
              <BubbleBody>{ticket.body}</BubbleBody>
            </Bubble>
          )}

          {repliesLoading && !repliesData && (
            <ThreadLoading>{t.loading}</ThreadLoading>
          )}

          {!repliesLoading && replies.length === 0 && ticket && (
            <EmptyReplies>{t.noReplies}</EmptyReplies>
          )}

          {replies.map((r) => (
            <Bubble key={r.id} $isAdmin={r.isAdmin}>
              <BubbleLabel>
                {r.isAdmin ? t.admin : t.user}
                {' · '}
                {displayName(r.author)}
                {' · '}
                {fmtDate(r.createdAt)}
              </BubbleLabel>
              <BubbleBody>{r.body}</BubbleBody>
            </Bubble>
          ))}
        </Thread>

        {/* Reply input — hidden only on load error; allow pre-typing during initial fetch */}
        <ReplyArea>
          {ticketError ? null : isClosed ? (
            <ClosedNote>
              {ticket?.status === 'REJECTED'
                ? (language === 'bg' ? 'Заявката е отказана — отговорите са забранени.' : 'This ticket is rejected — replies are disabled.')
                : t.ticketClosed}
            </ClosedNote>
          ) : (
            <>
              <ReplyTextarea
                placeholder={t.replyPlaceholder}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                disabled={busy}
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && replyBody.trim().length >= 10) {
                    e.preventDefault();
                    replyMutation.mutate(replyBody.trim());
                  }
                }}
              />
              <ReplyFooter>
                <ReplyHint>
                  {replyBody.trim().length === 0
                    ? (language === 'bg' ? 'Минимум 10 символа' : 'Min 10 chars')
                    : replyBody.trim().length < 10
                      ? (language === 'bg' ? `Минимум 10 символа (${replyBody.trim().length}/10)` : `Min 10 chars (${replyBody.trim().length}/10)`)
                      : `${isMac ? '⌘' : 'Ctrl+'}↵ ${language === 'bg' ? 'за изпращане' : 'to send'}`}
                </ReplyHint>
                <SendBtn
                  onClick={() => { if (replyBody.trim().length >= 10) replyMutation.mutate(replyBody.trim()); }}
                  disabled={busy || replyBody.trim().length < 10}
                >
                  {busy ? t.sending : t.send}
                </SendBtn>
              </ReplyFooter>
            </>
          )}
        </ReplyArea>
      </Panel>
    </>
  );
}

/* ── Animations ── */
const slideIn = keyframes`from { transform: translateX(100%); } to { transform: translateX(0); }`;
const fadeIn = keyframes`from { opacity: 0; } to { opacity: 0.4; }`;

/* ── Styled components ── */
const Overlay = styled.div`
  position: fixed; inset: 0; background: #000;
  opacity: 0.4; z-index: 200;
  animation: ${fadeIn} 0.2s ease;
`;

const Panel = styled.div`
  position: fixed; top: calc(var(--imp-banner-h, 0px) + 4rem); right: 0; bottom: 0;
  width: min(560px, 100vw);
  background: ${palette.surface};
  border-left: 1px solid ${palette.border};
  box-shadow: -4px 0 24px rgba(0,0,0,0.12);
  z-index: 201;
  display: flex; flex-direction: column;
  animation: ${slideIn} 0.22s cubic-bezier(0.22, 1, 0.36, 1);
`;

const DrawerHeader = styled.div`
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid ${palette.border};
  background: ${palette.bg};
  flex-shrink: 0;
`;

const HeaderTop = styled.div`display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;`;

const BadgeRow = styled.div`display: flex; gap: 0.375rem; flex-wrap: wrap; align-items: center;`;

const CloseBtn = styled.button`
  background: none; border: none; cursor: pointer; font-size: 1rem;
  color: ${palette.textMuted}; padding: 0.125rem 0.25rem; line-height: 1;
  border-radius: 0.25rem;
  &:hover { background: ${palette.border}; color: ${palette.text}; }
`;

const DrawerTitle = styled.h2`
  font-size: 1.0625rem; font-weight: 700; color: ${palette.text};
  margin: 0 0 0.875rem; line-height: 1.35;
`;

const pill = `display: inline-flex; align-items: center; font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em; border-radius: 0.375rem; padding: 0.2rem 0.5rem;`;

const CategoryPill = styled.span<{ $cat: TicketCategory }>`
  ${pill}
  background: ${({ $cat }) => ({
    CASHBACK: palette.successSoft, ACCOUNT: palette.infoSoft, PAYMENT: palette.dangerSoft,
    TECHNICAL: palette.warningSoft, OTHER: palette.border,
  }[$cat])};
  color: ${({ $cat }) => ({
    CASHBACK: palette.success, ACCOUNT: palette.info, PAYMENT: palette.danger,
    TECHNICAL: palette.warning, OTHER: palette.textMuted,
  }[$cat])};
`;

const StatusPill = styled.span<{ $status: TicketStatus }>`
  ${pill}
  background: ${({ $status }) => ({
    NEW: palette.dangerSoft, OPEN: palette.infoSoft, IN_REVIEW: palette.infoSoft,
    WAITING: palette.warningSoft, RESOLVED: palette.successSoft, CLOSED: palette.border,
    REJECTED: palette.dangerSoft,
  }[$status])};
  color: ${({ $status }) => ({
    NEW: palette.danger, OPEN: palette.info, IN_REVIEW: palette.info,
    WAITING: palette.warning, RESOLVED: palette.success, CLOSED: palette.textMuted,
    REJECTED: palette.danger,
  }[$status])};
`;

const PriorityPill = styled.span<{ $priority: TicketPriority }>`
  ${pill}
  background: ${({ $priority }) => ({
    URGENT: palette.dangerSoft, HIGH: palette.warningSoft, MEDIUM: palette.infoSoft, LOW: palette.border,
  }[$priority])};
  color: ${({ $priority }) => ({
    URGENT: palette.danger, HIGH: palette.warning, MEDIUM: palette.info, LOW: palette.textMuted,
  }[$priority])};
`;

const MetaGrid = styled.div`display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 0.875rem;`;

const MetaItem = styled.div``;
const MetaLabel = styled.div`font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const MetaValue = styled.div`font-size: 0.875rem; font-weight: 600; color: ${palette.text}; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;`;
const MetaEmail = styled.div`font-size: 0.75rem; color: ${palette.textMuted};`;

const AssignBtn = styled.button`
  font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem;
  border: 1px solid ${palette.accent}; border-radius: 0.375rem;
  background: ${palette.accentSoft}; color: ${palette.accent};
  cursor: pointer; white-space: nowrap;
  &:hover { background: ${palette.accent}; color: #fff; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const AssignSelect = styled.select`
  padding: 0.25rem 0.5rem; border: 1px solid ${palette.border}; border-radius: 0.375rem;
  font-size: 0.8125rem; background: ${palette.bg}; color: ${palette.text};
  cursor: pointer; outline: none; max-width: 14rem;
  &:focus { border-color: ${palette.accent}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ControlsRow = styled.div`display: flex; gap: 0.75rem; flex-wrap: wrap;`;
const ControlGroup = styled.div`display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;`;
const ControlLabel = styled.label`font-size: 0.75rem; font-weight: 600; color: ${palette.textSubtle};`;
const ControlHint = styled.span`font-size: 0.65rem; color: ${palette.textSubtle}; font-style: italic;`;
const ControlSelect = styled.select`
  padding: 0.3rem 0.5rem; border: 1px solid ${palette.border}; border-radius: 0.375rem;
  font-size: 0.8125rem; background: ${palette.surface}; color: ${palette.text};
  cursor: pointer; outline: none;
  &:focus { border-color: ${palette.accent}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const LoadingText = styled.p`color: ${palette.textMuted}; font-size: 0.875rem; margin: 0.5rem 0;`;
const ErrorText = styled.p`color: ${palette.danger}; font-size: 0.875rem; margin: 0.5rem 0;`;

/* Thread */
const Thread = styled.div`
  flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem;
  display: flex; flex-direction: column; gap: 0.875rem;
`;

const Bubble = styled.div<{ $isAdmin: boolean }>`
  background: ${({ $isAdmin }) => $isAdmin ? palette.adminBubble : palette.userBubble};
  border: 1px solid ${palette.border};
  border-radius: ${({ $isAdmin }) => $isAdmin ? '0.75rem 0.75rem 0 0.75rem' : '0.75rem 0.75rem 0.75rem 0'};
  padding: 0.75rem 1rem;
  align-self: ${({ $isAdmin }) => $isAdmin ? 'flex-end' : 'flex-start'};
  max-width: 90%;
`;

const BubbleLabel = styled.div`font-size: 0.6875rem; font-weight: 600; color: ${palette.textSubtle}; margin-bottom: 0.375rem; text-transform: uppercase; letter-spacing: 0.04em;`;
const BubbleBody = styled.div`font-size: 0.875rem; color: ${palette.text}; white-space: pre-wrap; line-height: 1.55;`;

const ThreadLoading = styled.div`text-align: center; color: ${palette.textSubtle}; font-size: 0.875rem; padding: 1rem;`;
const EmptyReplies = styled.div`text-align: center; color: ${palette.textSubtle}; font-size: 0.8125rem; padding: 1.5rem 0;`;

/* Reply */
const ReplyArea = styled.div`
  padding: 1rem 1.5rem; border-top: 1px solid ${palette.border}; flex-shrink: 0;
`;

const ReplyTextarea = styled.textarea`
  width: 100%; resize: none; box-sizing: border-box;
  padding: 0.625rem 0.875rem;
  border: 1px solid ${palette.border}; border-radius: 0.5rem;
  font-size: 0.875rem; font-family: inherit;
  background: ${palette.bg}; color: ${palette.text};
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
  &::placeholder { color: ${palette.textSubtle}; }
  &:disabled { opacity: 0.5; }
`;

const ReplyFooter = styled.div`display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;`;
const ReplyHint = styled.span`font-size: 0.75rem; color: ${palette.textSubtle};`;

const SendBtn = styled.button`
  padding: 0.5rem 1.125rem; border: none; border-radius: 0.5rem;
  background: ${palette.accent}; color: #fff; font-size: 0.875rem; font-weight: 600;
  cursor: pointer;
  &:hover:not(:disabled) { background: #b5522e; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ClosedNote = styled.p`
  text-align: center; font-size: 0.8125rem; color: ${palette.textMuted};
  margin: 0; padding: 0.5rem;
  background: ${palette.border}; border-radius: 0.5rem;
`;

const RejectBtn = styled.button`
  padding: 0.3rem 0.75rem; border: 1px solid ${palette.danger}; border-radius: 0.375rem;
  background: transparent; color: ${palette.danger}; font-size: 0.8rem; font-weight: 600;
  cursor: pointer; white-space: nowrap;
  &:hover:not(:disabled) { background: ${palette.dangerSoft}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const CancelBtn = styled.button`
  padding: 0.3rem 0.6rem; border: 1px solid ${palette.border}; border-radius: 0.375rem;
  background: transparent; color: ${palette.textMuted}; font-size: 0.8rem;
  cursor: pointer;
  &:hover { background: ${palette.border}; }
`;
