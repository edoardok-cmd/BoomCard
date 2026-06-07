/**
 * BC-ADMIN-SPEC-CONFORM-FIX — unit coverage for the spec-conformance fixes.
 *
 * Covers the pure / deterministic surfaces of the fix set:
 *   M1/F2 — maskUserFacingPayoutStatus (RISK_HOLD + UNreversed FAILED → "Sent to
 *            payout"; reversed first-failure FAILED surfaces honestly)
 *   M3 — derivePartnerInactiveSubType (Пауза/Спрян/Onboarding sub_type metadata)
 *   M5 — inferRequestType (Support/Dispute/Change/Other classification)
 *   M6 — toCanonicalRequestStatus / withCanonicalRequestStatus
 *   H3 — buildPlusReplyTo / isPlusAddressingEnabled (plus-addressing gated OFF in v1.2)
 *
 * Prisma is mocked so importing the services (which pull ../lib/prisma at module
 * load) does not require a live DB. None of the functions under test touch the DB.
 */

const mockPrisma: any = new Proxy({}, { get: () => () => Promise.resolve(null) });

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

import { maskUserFacingPayoutStatus, maskUserFacingPayoutStatuses } from '../../src/services/wallet.service';
import { derivePartnerInactiveSubType } from '../../src/services/partner.service';
import { inferRequestType } from '../../src/services/ticketInbound.service';
import {
  toCanonicalRequestStatus,
  withCanonicalRequestStatus,
  buildPlusReplyTo,
  isPlusAddressingEnabled,
} from '../../src/services/ticketEmail.service';
import { WalletTransactionStatus, WalletTransactionType } from '@prisma/client';

// ─── M1: payout-status masking ───────────────────────────────────────────────

describe('M1 — maskUserFacingPayoutStatus', () => {
  it('masks a RISK_HOLD withdrawal as PROCESSING (Sent to payout)', () => {
    const out = maskUserFacingPayoutStatus({
      type: WalletTransactionType.WITHDRAWAL,
      status: WalletTransactionStatus.RISK_HOLD,
    });
    expect(out.status).toBe(WalletTransactionStatus.PROCESSING);
  });

  // F2 — spec §3.2/§3.7: a FIRST-failure FAILED withdrawal is reversed and the
  // user IS notified, so it must surface honestly alongside its reversal credit.
  it('does NOT mask a reversed first-failure FAILED withdrawal', () => {
    const out = maskUserFacingPayoutStatus(
      {
        id: 'wd-1',
        type: WalletTransactionType.WITHDRAWAL,
        status: WalletTransactionStatus.FAILED,
      },
      new Set(['wd-1']), // wd-1 has a paired reversal ADJUSTMENT → not masked
    );
    expect(out.status).toBe(WalletTransactionStatus.FAILED);
  });

  // F2 — only the rare UNreversed first-failure FAILED row is masked defensively.
  it('masks an UNreversed FAILED withdrawal as PROCESSING (no paired reversal)', () => {
    const out = maskUserFacingPayoutStatus(
      {
        id: 'wd-2',
        type: WalletTransactionType.WITHDRAWAL,
        status: WalletTransactionStatus.FAILED,
      },
      new Set(), // no reversal recorded for wd-2 → masked
    );
    expect(out.status).toBe(WalletTransactionStatus.PROCESSING);
  });

  it('masks a FAILED withdrawal when no reversal set is supplied (fail-safe default)', () => {
    const out = maskUserFacingPayoutStatus({
      id: 'wd-3',
      type: WalletTransactionType.WITHDRAWAL,
      status: WalletTransactionStatus.FAILED,
    });
    expect(out.status).toBe(WalletTransactionStatus.PROCESSING);
  });

  it('does NOT mask a COMPLETED withdrawal', () => {
    const out = maskUserFacingPayoutStatus({
      type: WalletTransactionType.WITHDRAWAL,
      status: WalletTransactionStatus.COMPLETED,
    });
    expect(out.status).toBe(WalletTransactionStatus.COMPLETED);
  });

  it('does NOT mask a FAILED non-withdrawal (e.g. TOP_UP)', () => {
    const out = maskUserFacingPayoutStatus({
      type: WalletTransactionType.TOP_UP,
      status: WalletTransactionStatus.FAILED,
    });
    expect(out.status).toBe(WalletTransactionStatus.FAILED);
  });

  it('preserves other fields on the transaction', () => {
    const tx = { type: WalletTransactionType.WITHDRAWAL, status: WalletTransactionStatus.RISK_HOLD, amount: 42 };
    const out = maskUserFacingPayoutStatus(tx);
    expect(out.amount).toBe(42);
  });

  // F2 — page-level helper: resolves reversals from the ADJUSTMENT rows in-page.
  describe('maskUserFacingPayoutStatuses (page-level)', () => {
    it('keeps a reversed first-failure FAILED visible next to its reversal credit, masks RISK_HOLD', () => {
      const page = [
        { id: 'wd-fail', type: WalletTransactionType.WITHDRAWAL, status: WalletTransactionStatus.FAILED, metadata: null },
        {
          id: 'adj-1',
          type: WalletTransactionType.ADJUSTMENT,
          status: WalletTransactionStatus.COMPLETED,
          metadata: JSON.stringify({ reversedWithdrawalId: 'wd-fail' }),
        },
        { id: 'wd-hold', type: WalletTransactionType.WITHDRAWAL, status: WalletTransactionStatus.RISK_HOLD, metadata: null },
      ];
      const out = maskUserFacingPayoutStatuses(page);
      // reversed first-failure FAILED stays FAILED (honest history)
      expect(out[0].status).toBe(WalletTransactionStatus.FAILED);
      // reversal credit untouched
      expect(out[1].status).toBe(WalletTransactionStatus.COMPLETED);
      // second-failure RISK_HOLD masked to "Sent to payout"
      expect(out[2].status).toBe(WalletTransactionStatus.PROCESSING);
    });

    it('masks an UNreversed FAILED withdrawal in a page with no matching reversal', () => {
      const page = [
        { id: 'wd-orphan', type: WalletTransactionType.WITHDRAWAL, status: WalletTransactionStatus.FAILED, metadata: null },
      ];
      const out = maskUserFacingPayoutStatuses(page);
      expect(out[0].status).toBe(WalletTransactionStatus.PROCESSING);
    });
  });
});

// ─── M3: partner Inactive sub_type metadata ──────────────────────────────────

describe('M3 — derivePartnerInactiveSubType', () => {
  it('maps PAUSED → VOLUNTARY_PAUSE (Пауза)', () => {
    expect(derivePartnerInactiveSubType({ status: 'PAUSED' })).toBe('VOLUNTARY_PAUSE');
  });

  it('maps SUSPENDED → ADMIN_SUSPENSION (Спрян)', () => {
    expect(derivePartnerInactiveSubType({ status: 'SUSPENDED' })).toBe('ADMIN_SUSPENSION');
  });

  it('maps PENDING → ONBOARDING_INACTIVE', () => {
    expect(derivePartnerInactiveSubType({ status: 'PENDING' })).toBe('ONBOARDING_INACTIVE');
  });

  it('derives INACTIVE sub_type from the statusReason marker', () => {
    expect(derivePartnerInactiveSubType({ status: 'INACTIVE', statusReason: 'VOLUNTARY_PAUSE: holiday' })).toBe('VOLUNTARY_PAUSE');
    expect(derivePartnerInactiveSubType({ status: 'INACTIVE', statusReason: 'ADMIN_SUSPENSION: chargebacks' })).toBe('ADMIN_SUSPENSION');
    expect(derivePartnerInactiveSubType({ status: 'INACTIVE', statusReason: 'ONBOARDING_INACTIVE' })).toBe('ONBOARDING_INACTIVE');
  });

  it('falls back to GENERIC_INACTIVE for a bare INACTIVE with no marker', () => {
    expect(derivePartnerInactiveSubType({ status: 'INACTIVE', statusReason: null })).toBe('GENERIC_INACTIVE');
  });

  it('returns null for ACTIVE / ARCHIVED (sub_type only applies within Inactive)', () => {
    expect(derivePartnerInactiveSubType({ status: 'ACTIVE' })).toBeNull();
    expect(derivePartnerInactiveSubType({ status: 'ARCHIVED' })).toBeNull();
  });
});

// ─── M5: inbound email type classification ───────────────────────────────────

describe('M5 — inferRequestType', () => {
  it('classifies a dispute (EN) as DISPUTE', () => {
    expect(inferRequestType({ subject: 'Chargeback on my last payment', text: '', to: 'office@boomcard.bg' })).toBe('DISPUTE');
  });

  it('classifies a dispute (BG) as DISPUTE', () => {
    expect(inferRequestType({ subject: 'Оспорвам начислената сума', text: '', to: 'support@boomcard.bg' })).toBe('DISPUTE');
  });

  it('classifies a change request as CHANGE', () => {
    expect(inferRequestType({ subject: 'Please update my IBAN', text: '', to: 'support@boomcard.bg' })).toBe('CHANGE');
    expect(inferRequestType({ subject: 'Промяна на адрес', text: '', to: 'office@boomcard.bg' })).toBe('CHANGE');
  });

  it('defaults a generic operational question to SUPPORT', () => {
    expect(inferRequestType({ subject: 'How do I scan a receipt?', text: '', to: 'support@boomcard.bg' })).toBe('SUPPORT');
  });

  it('classifies an empty email as OTHER', () => {
    expect(inferRequestType({ subject: '', text: '', to: 'office@boomcard.bg' })).toBe('OTHER');
  });

  it('lets DISPUTE win over CHANGE on overlap (higher mis-route cost)', () => {
    expect(inferRequestType({ subject: 'I want to dispute and also change my IBAN', text: '', to: 'support@boomcard.bg' })).toBe('DISPUTE');
  });

  it('reads the body when the subject is uninformative', () => {
    expect(inferRequestType({ subject: 'Hello', text: 'This is a complaint about a wrong charge', to: 'support@boomcard.bg' })).toBe('DISPUTE');
  });
});

// ─── M6: canonical request_status mapping ────────────────────────────────────

describe('M6 — toCanonicalRequestStatus', () => {
  const cases: Array<[string, string]> = [
    ['NEW', 'New'],
    ['OPEN', 'In Progress'],
    ['IN_REVIEW', 'In Progress'],
    ['WAITING', 'Waiting'],
    ['RESOLVED', 'Closed'],
    ['CLOSED', 'Closed'],
    // F4 — REJECTED maps to Closed (aligns with schema convention + partner surfaces)
    ['REJECTED', 'Closed'],
    ['CANCELLED', 'Cancelled'],
  ];
  it.each(cases)('maps %s → %s', (raw, canonical) => {
    expect(toCanonicalRequestStatus(raw)).toBe(canonical);
  });

  it('never leaks a non-canonical status', () => {
    const canonical = new Set(['New', 'In Progress', 'Waiting', 'Closed', 'Cancelled']);
    for (const raw of ['NEW', 'OPEN', 'IN_REVIEW', 'WAITING', 'RESOLVED', 'CLOSED', 'REJECTED', 'CANCELLED', 'WEIRD', null]) {
      expect(canonical.has(toCanonicalRequestStatus(raw as any))).toBe(true);
    }
  });

  it('withCanonicalRequestStatus adds requestStatus without dropping raw status', () => {
    const out = withCanonicalRequestStatus({ id: 't1', status: 'IN_REVIEW' });
    expect(out.status).toBe('IN_REVIEW');           // raw enum token preserved
    expect(out.requestStatus).toBe('In Progress');   // canonical added
  });
});

// ─── H3: plus-addressing gated OFF in v1.2 ───────────────────────────────────

describe('H3 — plus-addressing gated behind a feature flag (default OFF)', () => {
  const original = process.env.TICKET_PLUS_ADDRESSING_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.TICKET_PLUS_ADDRESSING_ENABLED;
    else process.env.TICKET_PLUS_ADDRESSING_ENABLED = original;
  });

  it('is disabled by default (v1.2)', () => {
    delete process.env.TICKET_PLUS_ADDRESSING_ENABLED;
    expect(isPlusAddressingEnabled()).toBe(false);
  });

  it('returns a PLAIN Reply-To (no +ref) when disabled', () => {
    delete process.env.TICKET_PLUS_ADDRESSING_ENABLED;
    expect(buildPlusReplyTo('abcdef12-3456-7890-abcd-ef1234567890', 'subscriber')).not.toContain('+');
    expect(buildPlusReplyTo('abcdef12-3456-7890-abcd-ef1234567890', 'partner')).not.toContain('+');
  });

  it('emits a plus-addressed Reply-To only when the v1.3 flag is explicitly on', () => {
    process.env.TICKET_PLUS_ADDRESSING_ENABLED = 'true';
    expect(isPlusAddressingEnabled()).toBe(true);
    expect(buildPlusReplyTo('abcdef12-3456-7890-abcd-ef1234567890', 'subscriber')).toContain('+');
  });
});
