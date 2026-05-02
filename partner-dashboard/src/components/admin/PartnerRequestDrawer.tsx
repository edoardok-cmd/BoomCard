import { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  adminPartnerRequestsService,
  PartnerDetail,
  PartnerNote,
  AuditEntry,
} from '../../services/adminPartnerRequests.service';
import { getCategoryName } from '../../types/categories.types';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  success: '#4a7c59', successSoft: '#e6efe3',
  warning: '#b5803a', warningSoft: '#f5ead2',
  danger: '#b54327', dangerSoft: '#f4dcd2',
  info: '#2563eb', infoSoft: '#dbeafe',
  teal: '#0f766e', tealSoft: '#ccfbf1',
};

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  'RESTAURANTS_FOOD': 'restaurants', 'ACCOMMODATION': 'accommodation',
  'SPA_WELLNESS': 'spa', 'PANORAMIC_PLACES': 'panoramic',
  'CLUBS_NIGHTLIFE': 'clubs', 'CAFES_BAKERIES': 'cafes',
  'GASTRONOMIC': 'gastronomic', 'HISTORICAL_CULTURAL': 'historical-cultural',
  'ACTIVE_ADVENTURE': 'active-adventure', 'EXTREME': 'extreme',
  'EDUCATIONAL_CREATIVE': 'educational-creative', 'RELAX_WELLNESS': 'relax-wellness',
  'RESTAURANT': 'restaurants', 'HOTEL': 'accommodation', 'SPA': 'spa',
  'WINERY': 'restaurants', 'Wineries': 'restaurants',
  'Spa': 'spa', 'Hotels': 'accommodation',
  'Experiences': 'gastronomic', 'Restaurants': 'restaurants', 'Wellness': 'spa',
};

const PIPELINE_LABELS: Record<string, { en: string; bg: string }> = {
  NOVA:         { en: 'New',           bg: 'Нова' },
  KOMUNIKACIYA: { en: 'Communication', bg: 'Комуникация' },
  DOGOVARYANE:  { en: 'Negotiation',   bg: 'Договаряне' },
  ONBOARDING:   { en: 'Onboarding',    bg: 'Онбординг' },
  ODOBRENA:     { en: 'Approved',      bg: 'Одобрена' },
  OTKAZANA:     { en: 'Rejected',      bg: 'Отказана' },
};

const NEXT_PIPELINE_STEP: Record<string, string> = {
  NOVA:         'KOMUNIKACIYA',
  KOMUNIKACIYA: 'DOGOVARYANE',
  DOGOVARYANE:  'ONBOARDING',
  ONBOARDING:   'ODOBRENA',
};

function displayName(u: { firstName?: string | null; lastName?: string | null; email: string } | null | undefined): string {
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

function fmtDateShort(iso: string, locale = 'bg-BG'): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

type Tab = 'details' | 'notes' | 'audit';

interface Props {
  partnerId: string | null;
  onClose: () => void;
  canWrite: boolean;
  onApproved?: () => void;
  onRejected?: () => void;
}

export default function PartnerRequestDrawer({ partnerId, onClose, canWrite, onApproved, onRejected }: Props) {
  const { language } = useLanguage();
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [noteBody, setNoteBody] = useState('');
  const [noteInternal, setNoteInternal] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const isEn = language === 'en';

  useEffect(() => {
    if (!partnerId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [partnerId, onClose]);

  // Reset tab when drawer opens for a different partner
  useEffect(() => {
    if (partnerId) { setActiveTab('details'); setShowReject(false); setNoteBody(''); }
  }, [partnerId]);

  const { data: detailData, isLoading, isError } = useQuery({
    queryKey: ['partner-request-detail', partnerId],
    queryFn: () => adminPartnerRequestsService.getDetail(partnerId!),
    enabled: !!partnerId,
    staleTime: 15_000,
  });

  const { data: notesData, isLoading: notesLoading } = useQuery({
    queryKey: ['partner-request-notes', partnerId],
    queryFn: () => adminPartnerRequestsService.getNotes(partnerId!),
    enabled: !!partnerId && activeTab === 'notes',
    staleTime: 10_000,
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['partner-request-audit', partnerId],
    queryFn: () => adminPartnerRequestsService.getAuditLog(partnerId!),
    enabled: !!partnerId && activeTab === 'audit',
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['partner-request-detail', partnerId] });
    qc.invalidateQueries({ queryKey: ['partner-request-notes', partnerId] });
    qc.invalidateQueries({ queryKey: ['partner-request-audit', partnerId] });
    qc.invalidateQueries({ queryKey: ['admin-partner-requests'] });
    qc.invalidateQueries({ queryKey: ['pipeline'] });
    qc.invalidateQueries({ queryKey: ['admin-alerts'] });
  };

  const approveMutation = useMutation({
    mutationFn: () => adminPartnerRequestsService.approve(partnerId!),
    onSuccess: () => {
      toast.success(isEn ? 'Partner approved' : 'Партньорът е одобрен');
      invalidate();
      onApproved?.();
      onClose();
    },
    onError: () => toast.error(isEn ? 'Error approving partner' : 'Грешка при одобряване'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => adminPartnerRequestsService.reject(partnerId!, rejectReason),
    onSuccess: () => {
      toast.success(isEn ? 'Request rejected' : 'Заявката е отхвърлена');
      setShowReject(false);
      invalidate();
      onRejected?.();
      onClose();
    },
    onError: () => toast.error(isEn ? 'Error rejecting request' : 'Грешка при отхвърляне'),
  });

  const advanceMutation = useMutation({
    mutationFn: (requestStatus: string) =>
      adminPartnerRequestsService.advancePipeline(partnerId!, requestStatus),
    onSuccess: () => {
      toast.success(isEn ? 'Status advanced' : 'Статусът е обновен');
      invalidate();
    },
    onError: () => toast.error(isEn ? 'Error updating status' : 'Грешка при обновяване'),
  });

  const assignMutation = useMutation({
    mutationFn: (adminId: string | null) =>
      adminPartnerRequestsService.assign(partnerId!, adminId),
    onSuccess: () => {
      toast.success(isEn ? 'Assigned' : 'Назначено');
      invalidate();
    },
    onError: () => toast.error(isEn ? 'Error assigning' : 'Грешка при назначаване'),
  });

  const addNoteMutation = useMutation({
    mutationFn: () => adminPartnerRequestsService.addNote(partnerId!, noteBody.trim(), noteInternal),
    onSuccess: () => {
      toast.success(isEn ? 'Note added' : 'Бележката е добавена');
      setNoteBody('');
      qc.invalidateQueries({ queryKey: ['partner-request-notes', partnerId] });
    },
    onError: () => toast.error(isEn ? 'Error adding note' : 'Грешка при добавяне'),
  });

  const partner: PartnerDetail | undefined = detailData?.partner;
  const notes: PartnerNote[] = notesData?.notes ?? [];
  const auditEntries: AuditEntry[] = auditData?.entries ?? [];

  const categoryId = partner?.category ? (LEGACY_CATEGORY_MAP[partner.category] ?? partner.category) : undefined;
  const categoryLabel = categoryId ? getCategoryName(categoryId, language as 'en' | 'bg') : '—';

  const pipelineStatus = partner?.requestStatus ?? 'NOVA';
  const pipelineLabel = PIPELINE_LABELS[pipelineStatus];
  const nextStep = NEXT_PIPELINE_STEP[pipelineStatus];

  const canApprove = canWrite && pipelineStatus === 'ONBOARDING';
  const canAdvance = canWrite && !!nextStep && pipelineStatus !== 'ODOBRENA' && pipelineStatus !== 'OTKAZANA';
  const canAssignSelf = canWrite && !partner?.assignedAdminId;
  const canUnassign = canWrite && !!partner?.assignedAdminId;

  if (!partnerId) return null;

  return (
    <>
      <Overlay onClick={onClose} />
      <Panel>
        {/* Header */}
        <DrawerHeader>
          <HeaderTop>
            <BadgeRow>
              {partner && (
                <>
                  <PipelineBadge $status={pipelineStatus}>
                    {isEn ? (pipelineLabel?.en ?? pipelineStatus) : (pipelineLabel?.bg ?? pipelineStatus)}
                  </PipelineBadge>
                  {categoryLabel && categoryLabel !== '—' && (
                    <CategoryBadge>{categoryLabel}</CategoryBadge>
                  )}
                </>
              )}
            </BadgeRow>
            <CloseBtn onClick={onClose} aria-label="close">✕</CloseBtn>
          </HeaderTop>

          {isLoading && <LoadingText>{isEn ? 'Loading…' : 'Зарежда…'}</LoadingText>}
          {isError && <ErrorText>{isEn ? 'Failed to load request' : 'Грешка при зареждане'}</ErrorText>}

          {partner && (
            <>
              <DrawerTitle>{partner.businessName}</DrawerTitle>
              <MetaGrid>
                <MetaItem>
                  <MetaLabel>{isEn ? 'Owner' : 'Отговорник'}</MetaLabel>
                  <MetaValue>
                    {partner.assignedAdmin ? (
                      <span>{displayName(partner.assignedAdmin)}</span>
                    ) : (
                      <span style={{ color: palette.textSubtle, fontStyle: 'italic', fontSize: '0.8125rem' }}>
                        {isEn ? 'Unassigned' : 'Не е назначен'}
                      </span>
                    )}
                  </MetaValue>
                  {canWrite && (
                    <AssignActions>
                      {canAssignSelf && (
                        <ActionLink
                          onClick={() => assignMutation.mutate(currentUser?.id ?? null)}
                          disabled={assignMutation.isPending}
                        >
                          {isEn ? 'Assign to me' : 'Вземи'}
                        </ActionLink>
                      )}
                      {canUnassign && (
                        <ActionLink
                          onClick={() => assignMutation.mutate(null)}
                          disabled={assignMutation.isPending}
                          $danger
                        >
                          {isEn ? 'Unassign' : 'Освободи'}
                        </ActionLink>
                      )}
                    </AssignActions>
                  )}
                </MetaItem>
                <MetaItem>
                  <MetaLabel>{isEn ? 'Contact' : 'Контакт'}</MetaLabel>
                  <MetaValue>{displayName(partner.user)}</MetaValue>
                  <MetaEmail>{partner.user.email}</MetaEmail>
                  {partner.phone && <MetaEmail>{partner.phone}</MetaEmail>}
                </MetaItem>
                <MetaItem>
                  <MetaLabel>{isEn ? 'Submitted' : 'Подадена'}</MetaLabel>
                  <MetaValue style={{ fontSize: '0.8125rem' }}>
                    {fmtDateShort(partner.joinedAt, isEn ? 'en-GB' : 'bg-BG')}
                  </MetaValue>
                </MetaItem>
              </MetaGrid>

              {/* Pipeline actions */}
              {canWrite && (
                <ActionsRow>
                  {canAdvance && (
                    <ActionBtn
                      onClick={() => advanceMutation.mutate(nextStep)}
                      disabled={advanceMutation.isPending}
                    >
                      {isEn ? `Advance → ${PIPELINE_LABELS[nextStep]?.en ?? nextStep}` : `Напред → ${PIPELINE_LABELS[nextStep]?.bg ?? nextStep}`}
                    </ActionBtn>
                  )}
                  {canApprove && (
                    <ActionBtn
                      $variant="success"
                      onClick={() => approveMutation.mutate()}
                      disabled={approveMutation.isPending}
                    >
                      {isEn ? 'Approve' : 'Одобри'}
                    </ActionBtn>
                  )}
                  {pipelineStatus !== 'ODOBRENA' && pipelineStatus !== 'OTKAZANA' && (
                    <ActionBtn
                      $variant="danger"
                      onClick={() => setShowReject(true)}
                      disabled={showReject}
                    >
                      {isEn ? 'Reject' : 'Откажи'}
                    </ActionBtn>
                  )}
                </ActionsRow>
              )}

              {/* Reject reason input */}
              {showReject && (
                <RejectBox>
                  <NoteTextarea
                    placeholder={isEn ? 'Rejection reason (required)…' : 'Причина за отказ (задължително)…'}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                  />
                  <RejectActions>
                    <ActionBtn
                      $variant="danger"
                      onClick={() => rejectMutation.mutate()}
                      disabled={rejectMutation.isPending || rejectReason.trim().length < 3}
                    >
                      {isEn ? 'Confirm rejection' : 'Потвърди отказа'}
                    </ActionBtn>
                    <CancelLink onClick={() => setShowReject(false)}>
                      {isEn ? 'Cancel' : 'Отказ'}
                    </CancelLink>
                  </RejectActions>
                </RejectBox>
              )}
            </>
          )}
        </DrawerHeader>

        {/* Tabs */}
        <TabRow>
          {(['details', 'notes', 'audit'] as Tab[]).map((tab) => (
            <TabBtn key={tab} $active={activeTab === tab} onClick={() => setActiveTab(tab)}>
              {tab === 'details' && (isEn ? 'Details' : 'Детайли')}
              {tab === 'notes' && (isEn ? 'Notes' : 'Бележки')}
              {tab === 'audit' && (isEn ? 'Audit log' : 'История')}
            </TabBtn>
          ))}
        </TabRow>

        {/* Tab content */}
        <Body>
          {/* ── Details tab ── */}
          {activeTab === 'details' && partner && (
            <FieldGrid>
              {partner.email && (
                <Field>
                  <FieldLabel>{isEn ? 'Email' : 'Имейл'}</FieldLabel>
                  <FieldValue><a href={`mailto:${partner.email}`}>{partner.email}</a></FieldValue>
                </Field>
              )}
              {partner.phone && (
                <Field>
                  <FieldLabel>{isEn ? 'Phone' : 'Телефон'}</FieldLabel>
                  <FieldValue>{partner.phone}</FieldValue>
                </Field>
              )}
              {(partner.address || partner.city) && (
                <Field>
                  <FieldLabel>{isEn ? 'Address' : 'Адрес'}</FieldLabel>
                  <FieldValue>
                    {partner.address}
                    {partner.address && partner.city && ', '}
                    {partner.city}
                    {partner.region && ` (${partner.region})`}
                  </FieldValue>
                </Field>
              )}
              {partner.website && (
                <Field>
                  <FieldLabel>{isEn ? 'Website' : 'Уебсайт'}</FieldLabel>
                  <FieldValue>
                    <a href={partner.website} target="_blank" rel="noopener noreferrer">{partner.website}</a>
                  </FieldValue>
                </Field>
              )}
              {partner.discountRate != null && (
                <Field>
                  <FieldLabel>{isEn ? 'Discount rate' : 'Отстъпка'}</FieldLabel>
                  <FieldValue>{partner.discountRate}%</FieldValue>
                </Field>
              )}
              {partner.description && (
                <Field $wide>
                  <FieldLabel>{isEn ? 'Description' : 'Описание'}</FieldLabel>
                  <FieldValue>{partner.description}</FieldValue>
                </Field>
              )}
              {partner.pendingChanges && (
                <Field $wide>
                  <FieldLabel>{isEn ? 'Pending profile changes' : 'Чакащи промени в профила'}</FieldLabel>
                  <PendingChangesBox>
                    {Object.entries(partner.pendingChanges as Record<string, unknown>).map(([k, v]) => (
                      <PendingRow key={k}>
                        <PendingKey>{k}</PendingKey>
                        <PendingVal>{String(v)}</PendingVal>
                      </PendingRow>
                    ))}
                  </PendingChangesBox>
                  {partner.pendingChangesAt && (
                    <FieldMeta>{isEn ? 'Submitted' : 'Подадени'}: {fmtDate(partner.pendingChangesAt, isEn ? 'en-GB' : 'bg-BG')}</FieldMeta>
                  )}
                </Field>
              )}
            </FieldGrid>
          )}

          {/* ── Notes tab ── */}
          {activeTab === 'notes' && (
            <>
              {notesLoading && <TabLoading>{isEn ? 'Loading notes…' : 'Зареждане…'}</TabLoading>}
              {!notesLoading && notes.length === 0 && (
                <EmptyState>{isEn ? 'No notes yet.' : 'Няма бележки.'}</EmptyState>
              )}
              <NotesList>
                {notes.map((note) => (
                  <NoteItem key={note.id} $internal={note.isInternal}>
                    <NoteMeta>
                      {displayName(note.author)} · {fmtDate(note.createdAt, isEn ? 'en-GB' : 'bg-BG')}
                      {note.isInternal && (
                        <InternalBadge>{isEn ? 'Internal' : 'Вътрешна'}</InternalBadge>
                      )}
                    </NoteMeta>
                    <NoteBody>{note.body}</NoteBody>
                  </NoteItem>
                ))}
              </NotesList>
              {canWrite && (
                <NoteForm>
                  <NoteTextarea
                    placeholder={isEn ? 'Add a note…' : 'Добави бележка…'}
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    rows={3}
                  />
                  <NoteFooter>
                    <InternalToggle>
                      <input
                        type="checkbox"
                        id="note-internal"
                        checked={noteInternal}
                        onChange={(e) => setNoteInternal(e.target.checked)}
                      />
                      <label htmlFor="note-internal">
                        {isEn ? 'Internal (admin only)' : 'Вътрешна (само за администратори)'}
                      </label>
                    </InternalToggle>
                    <ActionBtn
                      onClick={() => addNoteMutation.mutate()}
                      disabled={addNoteMutation.isPending || noteBody.trim().length < 2}
                    >
                      {isEn ? 'Add note' : 'Добави'}
                    </ActionBtn>
                  </NoteFooter>
                </NoteForm>
              )}
            </>
          )}

          {/* ── Audit tab ── */}
          {activeTab === 'audit' && (
            <>
              {auditLoading && <TabLoading>{isEn ? 'Loading audit log…' : 'Зареждане…'}</TabLoading>}
              {!auditLoading && auditEntries.length === 0 && (
                <EmptyState>{isEn ? 'No audit entries.' : 'Няма история.'}</EmptyState>
              )}
              <AuditList>
                {auditEntries.map((entry) => (
                  <AuditItem key={entry.id}>
                    <AuditMeta>
                      {displayName(entry.actor)} · {fmtDate(entry.createdAt, isEn ? 'en-GB' : 'bg-BG')}
                    </AuditMeta>
                    <AuditAction>{entry.action}</AuditAction>
                    {(entry.before || entry.after) && (
                      <AuditDiff>
                        {entry.before && <AuditBefore>{isEn ? 'Before' : 'До'}: {JSON.stringify(entry.before)}</AuditBefore>}
                        {entry.after && <AuditAfter>{isEn ? 'After' : 'След'}: {JSON.stringify(entry.after)}</AuditAfter>}
                      </AuditDiff>
                    )}
                  </AuditItem>
                ))}
              </AuditList>
            </>
          )}
        </Body>
      </Panel>
    </>
  );
}

/* ── Animations ── */
const slideIn = keyframes`from { transform: translateX(100%); } to { transform: translateX(0); }`;
const fadeIn  = keyframes`from { opacity: 0; } to { opacity: 0.4; }`;

/* ── Layout ── */
const Overlay = styled.div`
  position: fixed; inset: 0; background: #000;
  opacity: 0.4; z-index: 200;
  animation: ${fadeIn} 0.2s ease;
`;

const Panel = styled.div`
  position: fixed; top: calc(var(--imp-banner-h, 0px) + 4rem); right: 0; bottom: 0;
  width: min(580px, 100vw);
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

const pill = `display: inline-flex; align-items: center; font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em; border-radius: 0.375rem; padding: 0.2rem 0.5rem;`;

const PipelineBadge = styled.span<{ $status: string }>`
  ${pill}
  background: ${({ $status }) => ({
    NOVA:         palette.infoSoft,
    KOMUNIKACIYA: palette.warningSoft,
    DOGOVARYANE:  palette.warningSoft,
    ONBOARDING:   palette.tealSoft,
    ODOBRENA:     palette.successSoft,
    OTKAZANA:     palette.dangerSoft,
  }[$status] ?? palette.border)};
  color: ${({ $status }) => ({
    NOVA:         palette.info,
    KOMUNIKACIYA: palette.warning,
    DOGOVARYANE:  palette.warning,
    ONBOARDING:   palette.teal,
    ODOBRENA:     palette.success,
    OTKAZANA:     palette.danger,
  }[$status] ?? palette.textMuted)};
`;

const CategoryBadge = styled.span`
  ${pill}
  background: ${palette.accentSoft};
  color: ${palette.accent};
`;

const CloseBtn = styled.button`
  background: none; border: none; cursor: pointer; font-size: 1rem;
  color: ${palette.textMuted}; padding: 0.125rem 0.25rem; line-height: 1;
  border-radius: 0.25rem;
  &:hover { background: ${palette.border}; color: ${palette.text}; }
`;

const DrawerTitle = styled.h2`
  font-size: 1.125rem; font-weight: 800; color: ${palette.text};
  margin: 0 0 0.875rem; line-height: 1.35;
`;

const MetaGrid = styled.div`display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 0.875rem;`;
const MetaItem = styled.div``;
const MetaLabel = styled.div`font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const MetaValue = styled.div`font-size: 0.875rem; font-weight: 600; color: ${palette.text}; display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap;`;
const MetaEmail = styled.div`font-size: 0.75rem; color: ${palette.textMuted};`;

const AssignActions = styled.div`display: flex; gap: 0.375rem; margin-top: 0.25rem; flex-wrap: wrap;`;
const ActionLink = styled.button<{ $danger?: boolean }>`
  font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem;
  border: 1px solid ${p => p.$danger ? palette.danger : palette.accent};
  border-radius: 0.375rem;
  background: ${p => p.$danger ? palette.dangerSoft : palette.accentSoft};
  color: ${p => p.$danger ? palette.danger : palette.accent};
  cursor: pointer; white-space: nowrap;
  &:hover { background: ${p => p.$danger ? palette.danger : palette.accent}; color: #fff; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ActionsRow = styled.div`display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.25rem;`;
const ActionBtn = styled.button<{ $variant?: 'success' | 'danger' }>`
  padding: 0.375rem 0.875rem; border: none; border-radius: 0.5rem;
  font-size: 0.8125rem; font-weight: 600; cursor: pointer;
  background: ${p => p.$variant === 'success' ? palette.success : p.$variant === 'danger' ? palette.danger : palette.accent};
  color: #fff;
  &:hover:not(:disabled) { opacity: 0.88; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const RejectBox = styled.div`
  margin-top: 0.75rem; padding: 0.75rem; background: ${palette.dangerSoft};
  border: 1px solid ${palette.danger}; border-radius: 0.5rem;
`;
const RejectActions = styled.div`display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem;`;
const CancelLink = styled.button`
  background: none; border: none; cursor: pointer; color: ${palette.textMuted};
  font-size: 0.8125rem; text-decoration: underline; padding: 0;
  &:hover { color: ${palette.text}; }
`;

const LoadingText = styled.p`color: ${palette.textMuted}; font-size: 0.875rem; margin: 0.5rem 0;`;
const ErrorText = styled.p`color: ${palette.danger}; font-size: 0.875rem; margin: 0.5rem 0;`;

/* ── Tabs ── */
const TabRow = styled.div`
  display: flex; border-bottom: 2px solid ${palette.border};
  background: ${palette.bg}; flex-shrink: 0;
  padding: 0 1.5rem;
`;

const TabBtn = styled.button<{ $active: boolean }>`
  padding: 0.625rem 1rem; font-size: 0.875rem; font-weight: 600;
  background: none; border: none; cursor: pointer;
  color: ${p => p.$active ? palette.accent : palette.textMuted};
  border-bottom: 2px solid ${p => p.$active ? palette.accent : 'transparent'};
  margin-bottom: -2px;
  &:hover { color: ${palette.text}; }
`;

/* ── Body ── */
const Body = styled.div`flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem;`;

const TabLoading = styled.div`text-align: center; color: ${palette.textSubtle}; font-size: 0.875rem; padding: 1.5rem 0;`;
const EmptyState = styled.div`text-align: center; color: ${palette.textSubtle}; font-size: 0.8125rem; padding: 1.5rem 0;`;

/* ── Details ── */
const FieldGrid = styled.div`display: flex; flex-direction: column; gap: 0.75rem;`;
const Field = styled.div<{ $wide?: boolean }>``;
const FieldLabel = styled.div`font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: ${palette.textSubtle}; margin-bottom: 0.2rem;`;
const FieldValue = styled.div`font-size: 0.875rem; color: ${palette.text}; a { color: ${palette.accent}; text-decoration: none; &:hover { text-decoration: underline; } }`;
const FieldMeta = styled.div`font-size: 0.75rem; color: ${palette.textSubtle}; margin-top: 0.25rem;`;

const PendingChangesBox = styled.div`
  background: ${palette.warningSoft}; border: 1px solid ${palette.warning};
  border-radius: 0.375rem; padding: 0.5rem 0.75rem; margin-top: 0.25rem;
`;
const PendingRow = styled.div`display: flex; gap: 0.5rem; font-size: 0.8125rem; padding: 0.125rem 0;`;
const PendingKey = styled.span`font-weight: 600; color: ${palette.warning}; min-width: 120px;`;
const PendingVal = styled.span`color: ${palette.text};`;

/* ── Notes ── */
const NotesList = styled.div`display: flex; flex-direction: column; gap: 0.625rem; margin-bottom: 1rem;`;
const NoteItem = styled.div<{ $internal: boolean }>`
  border: 1px solid ${p => p.$internal ? palette.warningSoft : palette.border};
  background: ${p => p.$internal ? palette.warningSoft : palette.bg};
  border-radius: 0.5rem; padding: 0.625rem 0.875rem;
`;
const NoteMeta = styled.div`
  font-size: 0.6875rem; font-weight: 600; color: ${palette.textSubtle};
  text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.375rem;
  display: flex; align-items: center; gap: 0.5rem;
`;
const InternalBadge = styled.span`
  background: ${palette.warning}; color: #fff; font-size: 0.6rem;
  font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 0.25rem;
  text-transform: uppercase; letter-spacing: 0.06em;
`;
const NoteBody = styled.div`font-size: 0.875rem; color: ${palette.text}; white-space: pre-wrap; line-height: 1.5;`;

const NoteForm = styled.div`border-top: 1px solid ${palette.border}; padding-top: 1rem; margin-top: 0.5rem;`;
const NoteTextarea = styled.textarea`
  width: 100%; resize: none; box-sizing: border-box;
  padding: 0.625rem 0.875rem;
  border: 1px solid ${palette.border}; border-radius: 0.5rem;
  font-size: 0.875rem; font-family: inherit;
  background: ${palette.bg}; color: ${palette.text};
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
  &::placeholder { color: ${palette.textSubtle}; }
`;
const NoteFooter = styled.div`display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; flex-wrap: wrap; gap: 0.5rem;`;
const InternalToggle = styled.div`display: flex; align-items: center; gap: 0.375rem; font-size: 0.8125rem; color: ${palette.textMuted};`;

/* ── Audit ── */
const AuditList = styled.div`display: flex; flex-direction: column; gap: 0.5rem;`;
const AuditItem = styled.div`
  border: 1px solid ${palette.border}; border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
`;
const AuditMeta = styled.div`font-size: 0.6875rem; color: ${palette.textSubtle}; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem;`;
const AuditAction = styled.div`font-size: 0.875rem; font-weight: 600; color: ${palette.text};`;
const AuditDiff = styled.div`margin-top: 0.375rem; display: flex; flex-direction: column; gap: 0.2rem;`;
const AuditBefore = styled.div`font-size: 0.75rem; color: ${palette.danger}; word-break: break-all;`;
const AuditAfter = styled.div`font-size: 0.75rem; color: ${palette.success}; word-break: break-all;`;
