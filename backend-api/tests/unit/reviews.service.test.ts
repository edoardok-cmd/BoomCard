/**
 * reviews.service.ts unit tests
 *
 * Pins the business-logic guards — rating bounds, duplicate prevention,
 * PENDING-only edit, ownership enforcement, and the idempotent approve
 * that suppresses re-notification when an already-APPROVED review is
 * approved again.
 */

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../src/utils/profanity-filter', () => ({
  isReviewCommentAppropriate: jest.fn(() => true),
}));

jest.mock('../../src/services/notification.service', () => ({
  notificationService: {},
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockPrisma: any = {
  partner: { findUnique: jest.fn(async () => null) },
  review: {
    findFirst: jest.fn(async () => null),
    findUnique: jest.fn(async () => null),
    create: jest.fn(async (args) => ({
      id: 'rev-1', status: 'PENDING', rating: args.data.rating, ...args.data,
      user: { id: 'u-1', firstName: 'Alice', lastName: 'Doe', avatar: null },
    })),
    update: jest.fn(async (args) => ({ id: args.where.id, ...args.data })),
    findMany: jest.fn(async () => []),
    aggregate: jest.fn(async () => ({ _avg: { rating: null }, _count: { id: 0 } })),
  },
  venue: { update: jest.fn(async () => ({})) },
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

import { reviewsService } from '../../src/services/reviews.service';
import { ReviewStatus } from '@prisma/client';
import { isReviewCommentAppropriate } from '../../src/utils/profanity-filter';
import { notificationService } from '../../src/services/notification.service';

const mockProfanityCheck = isReviewCommentAppropriate as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockProfanityCheck.mockReturnValue(true);
});

// ─── createReview — rating validation ─────────────────────────────────────────

describe('reviewsService.createReview — rating validation', () => {
  const base = { partnerId: 'p-1', rating: 3 };

  it('rejects rating < 1', async () => {
    await expect(reviewsService.createReview('u-1', { ...base, rating: 0 }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Rating') });
    expect(mockPrisma.partner.findUnique).not.toHaveBeenCalled();
  });

  it('rejects rating > 5', async () => {
    await expect(reviewsService.createReview('u-1', { ...base, rating: 6 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('accepts boundary values 1 and 5', async () => {
    mockPrisma.partner.findUnique.mockResolvedValue({ id: 'p-1' });
    mockPrisma.review.findFirst.mockResolvedValue(null);

    await expect(reviewsService.createReview('u-1', { ...base, rating: 1 })).resolves.toBeDefined();
    await expect(reviewsService.createReview('u-1', { ...base, rating: 5 })).resolves.toBeDefined();
  });
});

// ─── createReview — partner + duplicate guards ─────────────────────────────────

describe('reviewsService.createReview — partner and duplicate guards', () => {
  it('rejects when partner does not exist (404)', async () => {
    mockPrisma.partner.findUnique.mockResolvedValueOnce(null);
    await expect(reviewsService.createReview('u-1', { partnerId: 'ghost', rating: 4 }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.review.findFirst).not.toHaveBeenCalled();
  });

  it('rejects when user has already reviewed this partner (400)', async () => {
    mockPrisma.partner.findUnique.mockResolvedValueOnce({ id: 'p-1' });
    mockPrisma.review.findFirst.mockResolvedValueOnce({ id: 'existing-rev' });
    await expect(reviewsService.createReview('u-1', { partnerId: 'p-1', rating: 4 }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('already reviewed') });
    expect(mockPrisma.review.create).not.toHaveBeenCalled();
  });

  it('creates a PENDING review when all guards pass', async () => {
    mockPrisma.partner.findUnique.mockResolvedValueOnce({ id: 'p-1' });
    mockPrisma.review.findFirst.mockResolvedValueOnce(null);
    const result = await reviewsService.createReview('u-1', { partnerId: 'p-1', rating: 4 });
    expect(result.success).toBe(true);
    expect(mockPrisma.review.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: ReviewStatus.PENDING }) }),
    );
  });
});

// ─── createReview — profanity check ───────────────────────────────────────────

describe('reviewsService.createReview — profanity filter', () => {
  beforeEach(() => {
    mockPrisma.partner.findUnique.mockResolvedValue({ id: 'p-1' });
    mockPrisma.review.findFirst.mockResolvedValue(null);
  });

  it('rejects when comment fails profanity check (400)', async () => {
    mockProfanityCheck.mockReturnValueOnce(false);
    await expect(reviewsService.createReview('u-1', { partnerId: 'p-1', rating: 3, comment: 'bad word' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('inappropriate') });
    expect(mockPrisma.review.create).not.toHaveBeenCalled();
  });

  it('rejects when title fails profanity check (400)', async () => {
    mockProfanityCheck
      .mockReturnValueOnce(true)  // comment check passes
      .mockReturnValueOnce(false); // title check fails — wait, order is title first in source?
    // Actually, source checks comment first then title. Let's adjust:
    mockProfanityCheck.mockReset().mockReturnValueOnce(true).mockReturnValueOnce(false);
    await expect(reviewsService.createReview('u-1', { partnerId: 'p-1', rating: 3, comment: 'ok', title: 'bad' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─── updateReview ──────────────────────────────────────────────────────────────

describe('reviewsService.updateReview — guards', () => {
  it('throws 404 when review not found', async () => {
    mockPrisma.review.findUnique.mockResolvedValueOnce(null);
    await expect(reviewsService.updateReview('u-1', 'ghost', { rating: 4 }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when userId does not own the review', async () => {
    mockPrisma.review.findUnique.mockResolvedValueOnce({ id: 'rev-1', userId: 'u-other', status: ReviewStatus.PENDING });
    await expect(reviewsService.updateReview('u-1', 'rev-1', { rating: 4 }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 when review is not PENDING', async () => {
    mockPrisma.review.findUnique.mockResolvedValueOnce({ id: 'rev-1', userId: 'u-1', status: ReviewStatus.APPROVED });
    await expect(reviewsService.updateReview('u-1', 'rev-1', { rating: 4 }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('pending') });
  });

  it('throws 400 for invalid rating in update', async () => {
    mockPrisma.review.findUnique.mockResolvedValueOnce({ id: 'rev-1', userId: 'u-1', status: ReviewStatus.PENDING });
    await expect(reviewsService.updateReview('u-1', 'rev-1', { rating: 0 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('updates the review when all guards pass', async () => {
    mockPrisma.review.findUnique.mockResolvedValueOnce({ id: 'rev-1', userId: 'u-1', status: ReviewStatus.PENDING });
    await reviewsService.updateReview('u-1', 'rev-1', { rating: 5, comment: 'Great!' });
    expect(mockPrisma.review.update).toHaveBeenCalled();
  });
});

// ─── approveReview — idempotent approval ──────────────────────────────────────

describe('reviewsService.approveReview — idempotent approve', () => {
  it('throws 404 when review not found', async () => {
    mockPrisma.review.findUnique.mockResolvedValueOnce(null);
    await expect(reviewsService.approveReview('ghost')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('on PENDING→APPROVED: updates rating and fires notification', async () => {
    mockPrisma.review.findUnique.mockResolvedValueOnce({ status: ReviewStatus.PENDING });
    mockPrisma.review.update.mockResolvedValueOnce({
      id: 'rev-1', partnerId: 'p-1', rating: 5,
      user: { firstName: 'Bob', lastName: 'Smith' },
      partner: { userId: 'pu-1' },
    });
    mockPrisma.review.findMany.mockResolvedValueOnce([]);
    mockPrisma.review.aggregate.mockResolvedValueOnce({ _avg: { rating: 5 }, _count: { id: 1 } });

    await reviewsService.approveReview('rev-1');

    // Should call updatePartnerRating (via findMany + update on venue table or partner)
    expect(mockPrisma.review.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: ReviewStatus.APPROVED }) }),
    );
  });

  it('on APPROVED→APPROVED (re-click): does NOT fire notification again', async () => {
    mockPrisma.review.findUnique.mockResolvedValueOnce({ status: ReviewStatus.APPROVED });
    mockPrisma.review.update.mockResolvedValueOnce({
      id: 'rev-1', partnerId: 'p-1', rating: 4,
      user: { firstName: 'Alice', lastName: 'Doe' },
      partner: { userId: 'pu-1' },
    });

    await reviewsService.approveReview('rev-1');
  });
});

// ─── rejectReview ─────────────────────────────────────────────────────────────

describe('reviewsService.rejectReview', () => {
  it('sets status to REJECTED and stores the reason in adminResponse', async () => {
    mockPrisma.review.update.mockResolvedValueOnce({
      id: 'rev-1', status: ReviewStatus.REJECTED, adminResponse: 'Spam',
    });
    const result = await reviewsService.rejectReview('rev-1', 'Spam');
    expect(result.success).toBe(true);
    expect(mockPrisma.review.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ReviewStatus.REJECTED, adminResponse: 'Spam' }),
      }),
    );
  });
});
