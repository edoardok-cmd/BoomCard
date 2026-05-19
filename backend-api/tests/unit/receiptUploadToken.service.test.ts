/**
 * receiptUploadTokenService unit tests
 *
 * Security-critical service: binds server-computed receipt image fields
 * (hash, perceptualHash, livePhotoOk, imageUrl) to an opaque token so
 * the client cannot tamper with them between upload and submission.
 *
 * Key invariants:
 *   - issue() produces a 64-char hex token (32 random bytes) with 1-hour TTL
 *   - consume() uses updateMany for atomic TOCTOU-safe claim; returns null
 *     when claim fails (unknown token, wrong userId, expired, already consumed)
 *   - consume() returns the bound fields on success
 */

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma: any = {
  receiptUploadToken: {
    create: jest.fn(async () => ({})),
    updateMany: jest.fn(async () => ({ count: 0 })),
    findUnique: jest.fn(async () => null),
  },
};

jest.mock('../../src/lib/prisma', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
}));

import { receiptUploadTokenService } from '../../src/services/receiptUploadToken.service';

const TOKEN_TTL_MS = 60 * 60 * 1000;

beforeEach(() => jest.clearAllMocks());

// ─── issue ────────────────────────────────────────────────────────────────────

describe('receiptUploadTokenService.issue', () => {
  const baseParams = {
    userId: 'u-1',
    imageHash: 'abc123',
    perceptualHash: 'dhash-hex',
    livePhotoOk: true,
    imageUrl: 'https://cdn.example.com/image.jpg',
    imageKey: 'images/receipt.jpg',
  };

  it('returns a 64-char hex token', async () => {
    const result = await receiptUploadTokenService.issue(baseParams);
    expect(typeof result.token).toBe('string');
    expect(result.token).toHaveLength(64);
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('issues different tokens on each call', async () => {
    const r1 = await receiptUploadTokenService.issue(baseParams);
    const r2 = await receiptUploadTokenService.issue(baseParams);
    expect(r1.token).not.toBe(r2.token);
  });

  it('sets expiresAt approximately 1 hour from now', async () => {
    const before = Date.now();
    const result = await receiptUploadTokenService.issue(baseParams);
    const after = Date.now();
    const expiresMs = result.expiresAt.getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + TOKEN_TTL_MS);
    expect(expiresMs).toBeLessThanOrEqual(after + TOKEN_TTL_MS);
  });

  it('creates a DB row with all bound fields', async () => {
    await receiptUploadTokenService.issue(baseParams);
    expect(mockPrisma.receiptUploadToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u-1',
          imageHash: 'abc123',
          perceptualHash: 'dhash-hex',
          livePhotoOk: true,
          imageUrl: 'https://cdn.example.com/image.jpg',
          imageKey: 'images/receipt.jpg',
        }),
      }),
    );
  });

  it('stores null perceptualHash when not provided', async () => {
    await receiptUploadTokenService.issue({ ...baseParams, perceptualHash: null });
    expect(mockPrisma.receiptUploadToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ perceptualHash: null }) }),
    );
  });
});

// ─── consume — failure paths ──────────────────────────────────────────────────

describe('receiptUploadTokenService.consume — returns null on failure', () => {
  it('returns null when updateMany finds no matching row (unknown token)', async () => {
    mockPrisma.receiptUploadToken.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await receiptUploadTokenService.consume('bad-token', 'u-1');
    expect(result).toBeNull();
    expect(mockPrisma.receiptUploadToken.findUnique).not.toHaveBeenCalled();
  });

  it('does NOT read the row back when claim fails (no leak of state)', async () => {
    mockPrisma.receiptUploadToken.updateMany.mockResolvedValueOnce({ count: 0 });
    await receiptUploadTokenService.consume('bad-token', 'u-1');
    expect(mockPrisma.receiptUploadToken.findUnique).not.toHaveBeenCalled();
  });
});

// ─── consume — success path ───────────────────────────────────────────────────

describe('receiptUploadTokenService.consume — returns bound fields on success', () => {
  const storedRow = {
    token: 'a'.repeat(64),
    userId: 'u-1',
    imageHash: 'sha256abc',
    perceptualHash: 'dhash-xyz',
    livePhotoOk: true,
    imageUrl: 'https://cdn.example.com/r.jpg',
    imageKey: 'images/r.jpg',
    consumedAt: null,
    expiresAt: new Date(Date.now() + 10_000),
  };

  it('returns the bound fields when claim succeeds', async () => {
    mockPrisma.receiptUploadToken.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.receiptUploadToken.findUnique.mockResolvedValueOnce(storedRow);

    const result = await receiptUploadTokenService.consume(storedRow.token, 'u-1');
    expect(result).toEqual({
      imageHash: 'sha256abc',
      perceptualHash: 'dhash-xyz',
      livePhotoOk: true,
      imageUrl: 'https://cdn.example.com/r.jpg',
      imageKey: 'images/r.jpg',
    });
  });

  it('passes the correct WHERE guards to updateMany (userId + consumedAt null + expiry)', async () => {
    mockPrisma.receiptUploadToken.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.receiptUploadToken.findUnique.mockResolvedValueOnce(storedRow);

    await receiptUploadTokenService.consume('tok-1', 'u-42');

    const call = mockPrisma.receiptUploadToken.updateMany.mock.calls[0][0];
    expect(call.where.token).toBe('tok-1');
    expect(call.where.userId).toBe('u-42');
    expect(call.where.consumedAt).toBeNull();
    expect(call.where.expiresAt).toMatchObject({ gt: expect.any(Date) });
    expect(call.data.consumedAt).toBeInstanceOf(Date);
  });

  it('returns null when findUnique returns null after a successful claim (defensive path)', async () => {
    mockPrisma.receiptUploadToken.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.receiptUploadToken.findUnique.mockResolvedValueOnce(null);
    const result = await receiptUploadTokenService.consume('tok-1', 'u-1');
    expect(result).toBeNull();
  });

  it('returns null perceptualHash when the row has null', async () => {
    mockPrisma.receiptUploadToken.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.receiptUploadToken.findUnique.mockResolvedValueOnce({ ...storedRow, perceptualHash: null });
    const result = await receiptUploadTokenService.consume(storedRow.token, 'u-1');
    expect(result?.perceptualHash).toBeNull();
  });
});
