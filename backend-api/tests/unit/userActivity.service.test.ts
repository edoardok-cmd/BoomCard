/**
 * Unit tests for the lastActivityAt touch helper (spec §4.1).
 * Verifies in-memory throttle and that USER role gating works as expected.
 */

jest.mock('../../src/lib/prisma', () => ({
  prisma: { user: { update: jest.fn() } },
}));

import { prisma } from '../../src/lib/prisma';
import { touchUserActivity, __resetUserActivityForTests } from '../../src/services/userActivity.service';

const update = (prisma.user.update as jest.Mock);

describe('touchUserActivity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetUserActivityForTests();
    // Resolve fast so our fire-and-forget promise doesn't trip Node's
    // unhandledRejection in the test runner.
    update.mockResolvedValue({});
    jest.useRealTimers();
  });

  it('writes lastActivityAt for USER role', async () => {
    touchUserActivity('user-1', 'USER');
    // Allow microtask queue to drain.
    await new Promise((r) => setImmediate(r));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({ lastActivityAt: expect.any(Date) }),
    }));
  });

  it('skips non-USER roles (admin / partner)', () => {
    touchUserActivity('admin-1', 'ADMIN');
    touchUserActivity('p-1', 'PARTNER');
    touchUserActivity('s-1', 'SUPER_ADMIN');
    expect(update).not.toHaveBeenCalled();
  });

  it('throttles to one write per 5 minutes per user', async () => {
    touchUserActivity('user-2', 'USER');
    await new Promise((r) => setImmediate(r));
    touchUserActivity('user-2', 'USER');
    touchUserActivity('user-2', 'USER');
    await new Promise((r) => setImmediate(r));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('throttles independently per user', async () => {
    touchUserActivity('user-3', 'USER');
    touchUserActivity('user-4', 'USER');
    await new Promise((r) => setImmediate(r));
    expect(update).toHaveBeenCalledTimes(2);
  });
});
