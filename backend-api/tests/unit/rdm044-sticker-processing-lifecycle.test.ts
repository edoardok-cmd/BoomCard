/**
 * INV-RDM-044 — Sticker processing advances only PENDING→PROCESSING.
 *
 * The service method stickerService.markStickerProcessing must:
 *   - Accept only a PENDING source sticker and advance it to PROCESSING.
 *   - Reject any other source state (ACTIVE, PROCESSING, REPLACED, INACTIVE)
 *     with an error matching /must be in PENDING state/.
 *   - Reject a missing sticker with an error matching /not found/.
 *   - Never call prisma.sticker.update when the guard fires.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────
const stickerFindUnique = jest.fn() as jest.Mock;
const stickerUpdate = jest.fn() as jest.Mock;

const prismaMock: any = {
  sticker: {
    findUnique: (...a: any[]) => stickerFindUnique(...a),
    update: (...a: any[]) => stickerUpdate(...a),
  },
};

jest.mock('../../src/lib/prisma', () => ({ __esModule: true, default: prismaMock, prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/middleware/audit.middleware', () => ({ writeAudit: jest.fn(async () => {}) }));
jest.mock('../../src/utils/detach', () => ({ detach: jest.fn((p: Promise<any>) => p.catch(() => {})) }));

import { stickerService } from '../../src/services/sticker.service';

beforeEach(() => {
  stickerFindUnique.mockReset();
  stickerUpdate.mockReset();
});

// ── INV-RDM-044 ───────────────────────────────────────────────────────────────

describe('INV-RDM-044 — markStickerProcessing PENDING→PROCESSING guard', () => {
  it('happy path — PENDING sticker is advanced to PROCESSING', async () => {
    stickerFindUnique.mockResolvedValue({ id: 's1', status: 'PENDING' });
    stickerUpdate.mockResolvedValue({
      id: 's1',
      stickerId: 'STK-1',
      status: 'PROCESSING',
      printedAt: new Date(),
    });

    await expect(stickerService.markStickerProcessing('STK-1', 'admin-1')).resolves.not.toThrow();

    expect(stickerUpdate).toHaveBeenCalledTimes(1);
    const arg = stickerUpdate.mock.calls[0][0];
    expect(arg.data.status).toBe('PROCESSING');
    expect(arg.data.printedAt).toBeTruthy();
  });

  it('ACTIVE source state rejected — sticker already active', async () => {
    stickerFindUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE' });

    await expect(stickerService.markStickerProcessing('STK-1', 'admin-1')).rejects.toThrow(
      /must be in PENDING state/,
    );
    expect(stickerUpdate).not.toHaveBeenCalled();
  });

  it('PROCESSING source state rejected — sticker already in processing', async () => {
    stickerFindUnique.mockResolvedValue({ id: 's1', status: 'PROCESSING' });

    await expect(stickerService.markStickerProcessing('STK-1', 'admin-1')).rejects.toThrow(
      /must be in PENDING state/,
    );
    expect(stickerUpdate).not.toHaveBeenCalled();
  });

  it('REPLACED source state rejected — terminal state', async () => {
    stickerFindUnique.mockResolvedValue({ id: 's1', status: 'REPLACED' });

    await expect(stickerService.markStickerProcessing('STK-1', 'admin-1')).rejects.toThrow(
      /must be in PENDING state/,
    );
    expect(stickerUpdate).not.toHaveBeenCalled();
  });

  it('INACTIVE source state rejected', async () => {
    stickerFindUnique.mockResolvedValue({ id: 's1', status: 'INACTIVE' });

    await expect(stickerService.markStickerProcessing('STK-1', 'admin-1')).rejects.toThrow(
      /must be in PENDING state/,
    );
    expect(stickerUpdate).not.toHaveBeenCalled();
  });

  it('not found — sticker does not exist', async () => {
    stickerFindUnique.mockResolvedValue(null);

    await expect(stickerService.markStickerProcessing('STK-NOPE', 'admin-1')).rejects.toThrow(
      /not found/,
    );
    expect(stickerUpdate).not.toHaveBeenCalled();
  });
});
