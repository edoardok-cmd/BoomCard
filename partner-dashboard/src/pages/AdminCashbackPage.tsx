import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import {
  adminCashbackService,
  CashbackSummaryEntry,
} from '../services/adminCashback.service';
import {
  DollarSign, CheckCircle, Clock, AlertTriangle, Send, ExternalLink,
} from 'lucide-react';

// ─────────────────────── Styled Components ───────────────────────

const Page = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 0.5rem 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  svg { color: var(--color-text-secondary); }
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin: 0;
`;

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const StatCard = styled.div<{ $accent?: string }>`
  background: var(--color-background);
  padding: 1.5rem;
  border-radius: 1rem;
  border: 2px solid ${p => p.$accent || 'var(--color-border)'};
`;

const StatLabel = styled.div`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-weight: 600;
  margin-bottom: 0.5rem;
`;

const StatValue = styled.div`
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
`;

const Controls = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  align-items: center;
`;

const FilterBtn = styled.button<{ $active?: boolean }>`
  padding: 0.625rem 1.125rem;
  background: ${p => p.$active ? '#000' : 'var(--color-background)'};
  color: ${p => p.$active ? '#fff' : 'var(--color-text-primary)'};
  border: 2px solid ${p => p.$active ? '#000' : 'var(--color-border)'};
  border-radius: 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
`;

const MonthInput = styled.input`
  padding: 0.625rem 0.875rem;
  border: 2px solid var(--color-border);
  border-radius: 0.75rem;
  font-size: 0.9rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  cursor: pointer;
  &:focus { outline: none; border-color: #000; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: var(--color-background);
  border: 2px solid var(--color-border);
  border-radius: 1rem;
  overflow: hidden;
`;

const Th = styled.th`
  padding: 0.875rem 1rem;
  text-align: left;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--color-background);
  border-bottom: 2px solid var(--color-border);
`;

const Tr = styled.tr`
  &:not(:last-child) td { border-bottom: 1px solid var(--color-border); }
  &:hover td { background: rgba(0,0,0,0.02); }
`;

const Td = styled.td`
  padding: 1rem;
  font-size: 0.9rem;
  color: var(--color-text-primary);
  vertical-align: middle;
`;

const PartnerName = styled.div`
  font-weight: 700;
  color: var(--color-text-primary);
`;

const PartnerEmail = styled.div`
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  margin-top: 0.1rem;
`;

const AmountOwed = styled.div<{ $paid?: boolean }>`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${p => p.$paid ? '#059669' : '#dc2626'};
`;

const StatusChip = styled.span<{ $status: 'PENDING' | 'PAID' | 'OVERDUE' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: ${p =>
    p.$status === 'PAID' ? '#d1fae5' :
    p.$status === 'OVERDUE' ? '#fee2e2' : '#fef3c7'};
  color: ${p =>
    p.$status === 'PAID' ? '#065f46' :
    p.$status === 'OVERDUE' ? '#991b1b' : '#92400e'};
  svg { width: 12px; height: 12px; }
`;

const ActionsCell = styled.div`
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const Btn = styled.button<{ $variant?: 'paid' | 'remind' | 'view' }>`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.75rem;
  background: ${p =>
    p.$variant === 'paid' ? '#10b981' :
    p.$variant === 'remind' ? '#f59e0b' : 'var(--color-background)'};
  color: ${p => p.$variant === 'view' ? 'var(--color-text-primary)' : '#fff'};
  border: 2px solid ${p => p.$variant === 'view' ? 'var(--color-border)' : 'transparent'};
  border-radius: 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  &:hover:not(:disabled) { filter: brightness(1.1); box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  svg { width: 13px; height: 13px; }
`;

const Modal = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
`;

const ModalBox = styled.div`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 2rem;
  max-width: 440px;
  width: 90%;
`;

const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 0 1.25rem 0;
  color: var(--color-text-primary);
`;

const ModalActions = styled.div`
  display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.25rem;
`;

const TextArea = styled.textarea`
  width: 100%; box-sizing: border-box;
  padding: 0.625rem;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9rem; min-height: 80px; resize: vertical;
  background: var(--color-background);
  color: var(--color-text-primary);
  &:focus { outline: none; border-color: #000; }
`;

const LabelText = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.375rem;
`;

const Toast = styled.div<{ $ok: boolean }>`
  position: fixed; top: 1.5rem; right: 1.5rem; z-index: 2000;
  background: ${p => p.$ok ? '#10b981' : '#dc2626'};
  color: #fff;
  padding: 0.75rem 1.5rem;
  border-radius: 0.75rem;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
`;

const Empty = styled.div`
  text-align: center; padding: 4rem 2rem;
  background: var(--color-background);
  border: 2px dashed var(--color-border);
  border-radius: 1rem;
  color: var(--color-text-secondary);
`;

// ─────────────────────── Component ───────────────────────

type StatusFilter = 'ALL' | 'PENDING' | 'PAID' | 'OVERDUE';

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const AdminCashbackPage: React.FC = () => {
  const { language } = useLanguage();

  const [entries, setEntries] = useState<CashbackSummaryEntry[]>([]);
  const [stats, setStats] = useState({ pendingTotal: 0, paidThisMonth: 0, overdueCount: 0, activePartners: 0 });
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentMonth());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [paidModal, setPaidModal] = useState<CashbackSummaryEntry | null>(null);
  const [paidNotes, setPaidNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const t = {
    en: {
      title: 'Cashback Payments', subtitle: 'Track partner cashback obligations and payment status',
      all: 'All', pending: 'Pending', paid: 'Paid', overdue: 'Overdue',
      statOutstanding: 'Outstanding (BGN)', statPaid: 'Paid This Month (BGN)',
      statOverdue: 'Overdue Partners', statActive: 'Active Partners',
      partner: 'Partner', month: 'Month', receipts: 'Receipts',
      owed: 'Total Owed (BGN)', status: 'Status', paidOn: 'Paid On', actions: 'Actions',
      markPaid: 'Mark Paid', remind: 'Remind', viewReceipts: 'Receipts',
      paidTitle: 'Mark as Paid', notesLabel: 'Notes (optional)',
      notesPlaceholder: 'Payment reference, bank transfer details…',
      cancel: 'Cancel', confirm: 'Confirm',
      loading: 'Loading…', empty: 'No cashback activity for the selected filters',
      remindSuccess: 'Reminder sent', remindFail: 'Could not send reminder',
      paidSuccess: 'Marked as paid', paidFail: 'Could not mark as paid',
    },
    bg: {
      title: 'Плащания кешбек', subtitle: 'Проследявайте задълженията на партньорите за кешбек',
      all: 'Всички', pending: 'Чакащи', paid: 'Платени', overdue: 'Просрочени',
      statOutstanding: 'Дължимо (лв)', statPaid: 'Платено тази месец (лв)',
      statOverdue: 'Просрочени партньори', statActive: 'Активни партньори',
      partner: 'Партньор', month: 'Месец', receipts: 'Бележки',
      owed: 'Дължимо (лв)', status: 'Статус', paidOn: 'Платено на', actions: 'Действия',
      markPaid: 'Маркирай', remind: 'Напомни', viewReceipts: 'Бележки',
      paidTitle: 'Маркирай като платено', notesLabel: 'Бележки (по желание)',
      notesPlaceholder: 'Референция, банков превод…',
      cancel: 'Отказ', confirm: 'Потвърди',
      loading: 'Зареждане…', empty: 'Няма активност за избраните филтри',
      remindSuccess: 'Напомнянето е изпратено', remindFail: 'Грешка при изпращане',
      paidSuccess: 'Маркирано като платено', paidFail: 'Грешка при маркиране',
    },
  };
  const c = language === 'bg' ? t.bg : t.en;

  const notify = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, dashStats] = await Promise.all([
        adminCashbackService.getSummary({
          month,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
        }),
        adminCashbackService.getStats(),
      ]);
      setEntries(summary);
      setStats(dashStats);
    } catch (err) {
      console.error('Failed to load cashback data:', err);
    } finally {
      setLoading(false);
    }
  }, [month, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleMarkPaid = async () => {
    if (!paidModal) return;
    setBusy(paidModal.partnerId);
    try {
      await adminCashbackService.markPaid(paidModal.partnerId, paidModal.month, paidNotes || undefined);
      notify(c.paidSuccess);
      setPaidModal(null);
      setPaidNotes('');
      load();
    } catch {
      notify(c.paidFail, false);
    } finally {
      setBusy(null);
    }
  };

  const handleRemind = async (entry: CashbackSummaryEntry) => {
    setBusy(entry.partnerId + '-remind');
    try {
      await adminCashbackService.sendReminder(entry.partnerId, entry.month);
      notify(c.remindSuccess);
    } catch {
      notify(c.remindFail, false);
    } finally {
      setBusy(null);
    }
  };

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    }) : '—';

  const filters: StatusFilter[] = ['ALL', 'PENDING', 'OVERDUE', 'PAID'];

  return (
    <Page>
      {toast && <Toast $ok={toast.ok}>{toast.msg}</Toast>}

      <Header>
        <Title><DollarSign />{c.title}</Title>
        <Subtitle>{c.subtitle}</Subtitle>
      </Header>

      <StatsRow>
        <StatCard $accent="#dc2626">
          <StatLabel>{c.statOutstanding}</StatLabel>
          <StatValue>{stats.pendingTotal.toFixed(2)}</StatValue>
        </StatCard>
        <StatCard $accent="#10b981">
          <StatLabel>{c.statPaid}</StatLabel>
          <StatValue>{stats.paidThisMonth.toFixed(2)}</StatValue>
        </StatCard>
        <StatCard $accent="#f59e0b">
          <StatLabel>{c.statOverdue}</StatLabel>
          <StatValue>{stats.overdueCount}</StatValue>
        </StatCard>
        <StatCard $accent="#6366f1">
          <StatLabel>{c.statActive}</StatLabel>
          <StatValue>{stats.activePartners}</StatValue>
        </StatCard>
      </StatsRow>

      <Controls>
        {filters.map(f => (
          <FilterBtn key={f} $active={statusFilter === f} onClick={() => setStatusFilter(f)}>
            {f === 'ALL' ? c.all : f === 'PENDING' ? c.pending : f === 'PAID' ? c.paid : c.overdue}
          </FilterBtn>
        ))}
        <MonthInput
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
        />
      </Controls>

      {loading ? (
        <Empty>{c.loading}</Empty>
      ) : entries.length === 0 ? (
        <Empty>{c.empty}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{c.partner}</Th>
              <Th>{c.month}</Th>
              <Th>{c.receipts}</Th>
              <Th>{c.owed}</Th>
              <Th>{c.status}</Th>
              <Th>{c.paidOn}</Th>
              <Th>{c.actions}</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <Tr key={`${entry.partnerId}-${entry.month}`}>
                <Td>
                  <PartnerName>{entry.partnerName}</PartnerName>
                  {entry.partnerEmail && <PartnerEmail>{entry.partnerEmail}</PartnerEmail>}
                </Td>
                <Td>{entry.month}</Td>
                <Td>{entry.receiptCount}</Td>
                <Td>
                  <AmountOwed $paid={entry.paymentStatus === 'PAID'}>
                    {entry.totalOwed.toFixed(2)}
                  </AmountOwed>
                </Td>
                <Td>
                  <StatusChip $status={entry.paymentStatus}>
                    {entry.paymentStatus === 'PAID' && <CheckCircle />}
                    {entry.paymentStatus === 'OVERDUE' && <AlertTriangle />}
                    {entry.paymentStatus === 'PENDING' && <Clock />}
                    {entry.paymentStatus}
                  </StatusChip>
                </Td>
                <Td>{fmtDate(entry.paidAt)}</Td>
                <Td>
                  <ActionsCell>
                    {entry.paymentStatus !== 'PAID' && (
                      <>
                        <Btn
                          $variant="paid"
                          disabled={busy === entry.partnerId}
                          onClick={() => { setPaidModal(entry); setPaidNotes(''); }}
                        >
                          <CheckCircle />{c.markPaid}
                        </Btn>
                        <Btn
                          $variant="remind"
                          disabled={busy === `${entry.partnerId}-remind`}
                          onClick={() => handleRemind(entry)}
                        >
                          <Send />{c.remind}
                        </Btn>
                      </>
                    )}
                    <Btn
                      $variant="view"
                      as={Link as React.ElementType}
                      to={`/admin/receipts?venueId=${entry.partnerId}`}
                    >
                      <ExternalLink />{c.viewReceipts}
                    </Btn>
                  </ActionsCell>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {paidModal && (
        <Modal onClick={() => setPaidModal(null)}>
          <ModalBox onClick={e => e.stopPropagation()}>
            <ModalTitle>{c.paidTitle}</ModalTitle>
            <div style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              {paidModal.partnerName} — {paidModal.month} — {paidModal.totalOwed.toFixed(2)} BGN
            </div>
            <div style={{ marginTop: '1rem' }}>
              <LabelText>{c.notesLabel}</LabelText>
              <TextArea
                value={paidNotes}
                onChange={e => setPaidNotes(e.target.value)}
                placeholder={c.notesPlaceholder}
              />
            </div>
            <ModalActions>
              <Btn $variant="view" onClick={() => setPaidModal(null)}>{c.cancel}</Btn>
              <Btn $variant="paid" onClick={handleMarkPaid} disabled={busy === paidModal.partnerId}>
                {c.confirm}
              </Btn>
            </ModalActions>
          </ModalBox>
        </Modal>
      )}
    </Page>
  );
};

export default AdminCashbackPage;
