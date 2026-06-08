import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiService } from '../../services/api.service';

import { palette } from '../../styles/adminTheme';
// ── Types ─────────────────────────────────────────────────────────────────────

type PendingStatus = 'CREATED' | 'PAID' | 'COMPLETED' | 'EXPIRED' | 'FAILED';

interface PendingSub {
  id: string;
  email: string;
  status: PendingStatus;
  paidAt: string | null;
  tokenExpiresAt: string | null;
  expiresAt: string;
  completedAt: string | null;
  payseraOrderId: string | null;
  createdAt: string;
  plan: { displayName: string; displayNameBg: string } | null;
}

interface ListResponse {
  data: PendingSub[];
  total: number;
  page: number;
  limit: number;
}

// ── Styles ────────────────────────────────────────────────────────────────────


const Page = styled.div`
  min-height: 100vh;
  background: ${palette.bg};
  padding: 2rem 1.5rem 4rem;
`;

const Inner = styled.div`
  max-width: 1100px;
  margin: 0 auto;
`;

const Eyebrow = styled.p`
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${palette.accent};
  margin: 0 0 0.5rem;
`;

const PageTitle = styled.h1`
  font-size: 1.75rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 0.25rem;
`;

const PageSubtitle = styled.p`
  color: ${palette.textMuted};
  font-size: 0.9375rem;
  margin: 0 0 2rem;
`;

const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 10px;
  overflow: hidden;
`;

const CardHeader = styled.div`
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid ${palette.border};
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 6px;
  font-size: 0.875rem;
  color: ${palette.text};
  background: ${palette.bg};
  outline: none;
  &:focus { border-color: ${palette.accent}; }
`;

const StatusSelect = styled.select`
  padding: 0.5rem 0.875rem;
  border: 1px solid ${palette.border};
  border-radius: 6px;
  font-size: 0.875rem;
  color: ${palette.text};
  background: ${palette.bg};
  cursor: pointer;
  outline: none;
  &:focus { border-color: ${palette.accent}; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
`;

const Th = styled.th`
  text-align: left;
  padding: 0.75rem 1.25rem;
  color: ${palette.textMuted};
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-bottom: 1px solid ${palette.border};
  background: ${palette.bg};
`;

const Td = styled.td`
  padding: 0.875rem 1.25rem;
  color: ${palette.text};
  border-bottom: 1px solid ${palette.border};
  vertical-align: middle;
`;

const Tr = styled.tr`
  &:last-child td { border-bottom: none; }
  &:hover td { background: ${palette.bg}; }
`;

const StatusBadge = styled.span<{ $status: PendingStatus }>`
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${({ $status }) => ({
    PAID:      palette.successSoft,
    CREATED:   palette.infoSoft,
    COMPLETED: palette.successSoft,
    EXPIRED:   palette.warningSoft,
    FAILED:    palette.dangerSoft,
  }[$status] ?? palette.bg)};
  color: ${({ $status }) => ({
    PAID:      palette.success,
    CREATED:   palette.info,
    COMPLETED: palette.success,
    EXPIRED:   palette.warning,
    FAILED:    palette.danger,
  }[$status] ?? palette.text)};
`;

const ActionBtn = styled.button<{ $loading?: boolean }>`
  padding: 0.375rem 0.875rem;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1px solid ${palette.accent};
  background: ${palette.accentSoft};
  color: ${palette.accent};
  cursor: pointer;
  white-space: nowrap;
  opacity: ${({ $loading }) => $loading ? 0.6 : 1};
  pointer-events: ${({ $loading }) => $loading ? 'none' : 'auto'};
  &:hover { background: ${palette.accent}; color: ${palette.onAccent}; }
  &:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
`;

const ConfirmBox = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const ConfirmText = styled.span`
  font-size: 0.8125rem;
  color: ${palette.textMuted};
`;

const ConfirmBtn = styled(ActionBtn)`
  background: ${palette.accent};
  color: ${palette.onAccent};
  border-color: ${palette.accent};
`;

const CancelBtn = styled.button`
  padding: 0.375rem 0.875rem;
  border-radius: 6px;
  font-size: 0.8125rem;
  border: 1px solid ${palette.border};
  background: transparent;
  color: ${palette.textMuted};
  cursor: pointer;
  &:hover { background: ${palette.bg}; }
`;

const EmptyRow = styled.tr`
  td { padding: 2.5rem; text-align: center; color: ${palette.textMuted}; }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid ${palette.border};
  font-size: 0.875rem;
  color: ${palette.textMuted};
`;

const PageBtn = styled.button<{ $active?: boolean }>`
  padding: 0.25rem 0.625rem;
  border-radius: 4px;
  border: 1px solid ${({ $active }) => $active ? palette.accent : palette.border};
  background: ${({ $active }) => $active ? palette.accentSoft : 'transparent'};
  color: ${({ $active }) => $active ? palette.accent : palette.textMuted};
  cursor: pointer;
  font-size: 0.8125rem;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

// ── i18n ──────────────────────────────────────────────────────────────────────

const T = {
  eyebrow:       { bg: 'Абонати',                                              en: 'Subscribers' },
  title:         { bg: 'Незавършени регистрации',                              en: 'Incomplete Registrations' },
  subtitle:      { bg: 'Платени абонаменти без завършен профил.',              en: 'Paid subscriptions without a completed profile.' },
  searchPh:      { bg: 'Имейл или Paysera ID…',                               en: 'Email or Paysera order ID…' },
  allStatuses:   { bg: 'Всички статуси',                                       en: 'All statuses' },
  colEmail:      { bg: 'Имейл',                                                en: 'Email' },
  colPlan:       { bg: 'План',                                                  en: 'Plan' },
  colStatus:     { bg: 'Статус',                                               en: 'Status' },
  colPaidAt:     { bg: 'Платено',                                              en: 'Paid At' },
  colTokenExp:   { bg: 'Линк изтича',                                          en: 'Token Expires' },
  colActions:    { bg: 'Действия',                                             en: 'Actions' },
  resend:        { bg: 'Изпрати отново',                                       en: 'Resend link' },
  confirmPrompt: { bg: 'Изпрати профил-линк до',                              en: 'Send profile link to' },
  confirm:       { bg: 'Потвърди',                                             en: 'Confirm' },
  cancel:        { bg: 'Откажи',                                               en: 'Cancel' },
  sent:          { bg: 'Изпратено до',                                         en: 'Sent to' },
  empty:         { bg: 'Няма намерени незавършени регистрации.',               en: 'No incomplete registrations found.' },
  loading:       { bg: 'Зареждане…',                                           en: 'Loading…' },
};

function t(key: keyof typeof T, lang: 'bg' | 'en') {
  return T[key][lang];
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
}

function canResend(row: PendingSub) {
  return row.status === 'PAID' && !row.completedAt && new Date(row.expiresAt) > new Date();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPendingSubscriptionsPage() {
  const { language } = useLanguage();
  const lang = (language === 'bg' ? 'bg' : 'en') as 'bg' | 'en';

  const [query, setQuery]         = useState('');
  const [status, setStatus]       = useState<PendingStatus | ''>('');
  const [page, setPage]           = useState(1);
  const [data, setData]           = useState<PendingSub[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [sending, setSending]     = useState<string | null>(null);
  const [sentIds, setSentIds]     = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 20;

  async function fetchList(q: string, s: string, p: number) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (q.trim()) params.set('email', q.trim());
      if (s)       params.set('status', s);
      const res = await apiService.get<ListResponse>(`/admin/subscriptions/pending?${params}`);
      const body = (res as any)?.data ?? res;
      setData(body.data ?? []);
      setTotal(body.total ?? 0);
    } catch {
      toast.error(lang === 'bg' ? 'Грешка при зареждане' : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchList(query, status, page), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, page]);

  async function handleResend(row: PendingSub) {
    setSending(row.id);
    setConfirmId(null);
    try {
      await apiService.post(`/admin/subscriptions/pending/${row.id}/resend-token`, {});
      setSentIds(prev => new Set(prev).add(row.id));
      toast.success(`${t('sent', lang)} ${row.email}`);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? (lang === 'bg' ? 'Грешка' : 'Error');
      toast.error(msg);
    } finally {
      setSending(null);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <Page>
      <Inner>
        <Eyebrow>{t('eyebrow', lang)}</Eyebrow>
        <PageTitle>{t('title', lang)}</PageTitle>
        <PageSubtitle>{t('subtitle', lang)}</PageSubtitle>

        <Card>
          <CardHeader>
            <SearchInput
              placeholder={t('searchPh', lang)}
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
            />
            <StatusSelect
              value={status}
              onChange={e => { setStatus(e.target.value as PendingStatus | ''); setPage(1); }}
            >
              <option value="">{t('allStatuses', lang)}</option>
              {(['CREATED', 'PAID', 'COMPLETED', 'EXPIRED', 'FAILED'] as PendingStatus[]).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </StatusSelect>
          </CardHeader>

          <Table>
            <thead>
              <tr>
                <Th>{t('colEmail', lang)}</Th>
                <Th>{t('colPlan', lang)}</Th>
                <Th>{t('colStatus', lang)}</Th>
                <Th>{t('colPaidAt', lang)}</Th>
                <Th>{t('colTokenExp', lang)}</Th>
                <Th>{t('colActions', lang)}</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow><td colSpan={6}>{t('loading', lang)}</td></EmptyRow>
              ) : data.length === 0 ? (
                <EmptyRow><td colSpan={6}>{t('empty', lang)}</td></EmptyRow>
              ) : data.map(row => (
                <Tr key={row.id}>
                  <Td>{row.email}</Td>
                  <Td>
                    {lang === 'bg'
                      ? row.plan?.displayNameBg ?? row.plan?.displayName ?? '—'
                      : row.plan?.displayName ?? '—'}
                  </Td>
                  <Td><StatusBadge $status={row.status}>{row.status}</StatusBadge></Td>
                  <Td>{fmt(row.paidAt)}</Td>
                  <Td>{fmt(row.tokenExpiresAt)}</Td>
                  <Td>
                    {confirmId === row.id ? (
                      <ConfirmBox>
                        <ConfirmText>{t('confirmPrompt', lang)} {row.email}?</ConfirmText>
                        <ConfirmBtn
                          $loading={sending === row.id}
                          onClick={() => handleResend(row)}
                        >
                          {t('confirm', lang)}
                        </ConfirmBtn>
                        <CancelBtn onClick={() => setConfirmId(null)}>
                          {t('cancel', lang)}
                        </CancelBtn>
                      </ConfirmBox>
                    ) : (
                      <ActionBtn
                        disabled={!canResend(row) || sentIds.has(row.id)}
                        onClick={() => setConfirmId(row.id)}
                      >
                        {t('resend', lang)}
                      </ActionBtn>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          {totalPages > 1 && (
            <Pagination>
              <span>{total} total</span>
              <PageBtn disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</PageBtn>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <PageBtn key={p} $active={p === page} onClick={() => setPage(p)}>{p}</PageBtn>
              ))}
              <PageBtn disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</PageBtn>
            </Pagination>
          )}
        </Card>
      </Inner>
    </Page>
  );
}
