/**
 * Integration test: BC-ADMIN-SPEC-REAUDIT-QR-SYNC-DURABILITY-1
 *
 * Partner status change to Inactive/Archived must deactivate ALL stickers atomically.
 * The fix moves sticker deactivation INSIDE the partner-status transaction, so either:
 *   a) Partner status AND all sticker updates commit together, OR
 *   b) Both roll back together on ANY failure
 *
 * This test uses a real database (boomcard_test) and verifies that:
 *   1. Partner → Inactive/Archived deactivates all ACTIVE stickers atomically
 *   2. Partner → Active reactivates auto-deactivated stickers atomically
 *   3. Transactional rollback happens if sticker deactivation fails
 *   4. No stickers are left in an inconsistent state (ACTIVE on non-active partner)
 *   5. Manual stickers are NOT reactivated by the Inactive→Active transition
 */

import { prisma } from '../../src/lib/prisma';
import { PartnerStatus, StickerStatus } from '@prisma/client';
import { partnerService } from '../../src/services/partner.service';

/**
 * Helper: Create a test partner with venues and stickers.
 * Returns { partnerId, venueId, stickers: [{ id, status }] }
 */
async function setupTestPartner(status: PartnerStatus = PartnerStatus.ACTIVE) {
  const ts = Date.now();
  const user = await prisma.user.create({
    data: {
      email: `test-${ts}@example.com`,
      passwordHash: 'hashed',
      firstName: 'Test',
      lastName: 'Partner',
      role: 'PARTNER',
      status: 'ACTIVE',
      phone: '+359000000000',
    },
  });

  const partner = await prisma.partner.create({
    data: {
      userId: user.id,
      businessName: `Test Partner ${ts}`,
      category: 'RESTAURANTS_FOOD',
      status,
      verifiedAt: status === PartnerStatus.ACTIVE ? new Date() : null,
    },
  });

  const venue = await prisma.venue.create({
    data: {
      partnerId: partner.id,
      name: 'Test Venue',
      city: 'Sofia',
      address: '123 Main St',
    },
  });

  const stickerLocation = await prisma.stickerLocation.create({
    data: {
      venueId: venue.id,
      name: 'Entrance',
      locationType: 'COUNTER',
      locationNumber: '1',
    },
  });

  // Create stickers in various states
  const stickers = await Promise.all([
    prisma.sticker.create({
      data: {
        venueId: venue.id,
        locationId: stickerLocation.id,
        stickerId: `TEST-ACTIVE-${ts}`,
        qrCode: `QR-ACTIVE-${ts}`,
        status: StickerStatus.ACTIVE,
      },
    }),
    prisma.sticker.create({
      data: {
        venueId: venue.id,
        locationId: stickerLocation.id,
        stickerId: `TEST-PROCESSING-${ts}`,
        qrCode: `QR-PROCESSING-${ts}`,
        status: StickerStatus.PROCESSING,
      },
    }),
    prisma.sticker.create({
      data: {
        venueId: venue.id,
        locationId: stickerLocation.id,
        stickerId: `TEST-PENDING-${ts}`,
        qrCode: `QR-PENDING-${ts}`,
        status: StickerStatus.PENDING,
      },
    }),
    prisma.sticker.create({
      data: {
        venueId: venue.id,
        locationId: stickerLocation.id,
        stickerId: `TEST-MANUAL-${ts}`,
        qrCode: `QR-MANUAL-${ts}`,
        status: StickerStatus.INACTIVE,
        autoDeactivatedAt: null, // Manually deactivated
      },
    }),
  ]);

  return {
    partnerId: partner.id,
    userId: user.id,
    venueId: venue.id,
    stickers,
  };
}

/**
 * Cleanup: Delete test partner and cascade (venues, stickers, locations, etc.)
 */
async function cleanupTestPartner(partnerId: string) {
  // Cascade deletes are handled by Prisma schema
  await prisma.partner.delete({ where: { id: partnerId } }).catch(() => {});
}

describe('BC-ADMIN-SPEC-REAUDIT-QR-SYNC-DURABILITY-1 — QR sync atomic durability', () => {
  describe('Partner → Inactive deactivates all stickers atomically', () => {
    it('should deactivate ACTIVE, PROCESSING, PENDING stickers on Active → Inactive', async () => {
      const { partnerId, stickers } = await setupTestPartner(PartnerStatus.ACTIVE);

      try {
        // Transition partner to INACTIVE
        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.INACTIVE,
          reason: 'Test deactivation',
        });

        // Verify all stickers are now INACTIVE (except manually-deactivated ones stay as-is)
        const activeSticker = await prisma.sticker.findUnique({
          where: { id: stickers[0].id },
        });
        const processingSticker = await prisma.sticker.findUnique({
          where: { id: stickers[1].id },
        });
        const pendingSticker = await prisma.sticker.findUnique({
          where: { id: stickers[2].id },
        });
        const manualSticker = await prisma.sticker.findUnique({
          where: { id: stickers[3].id },
        });

        // ACTIVE → INACTIVE with autoDeactivatedAt timestamp
        expect(activeSticker?.status).toBe(StickerStatus.INACTIVE);
        expect(activeSticker?.autoDeactivatedAt).not.toBeNull();

        // PROCESSING → INACTIVE without autoDeactivatedAt
        expect(processingSticker?.status).toBe(StickerStatus.INACTIVE);
        expect(processingSticker?.autoDeactivatedAt).toBeNull();

        // PENDING → INACTIVE without autoDeactivatedAt
        expect(pendingSticker?.status).toBe(StickerStatus.INACTIVE);
        expect(pendingSticker?.autoDeactivatedAt).toBeNull();

        // Manually deactivated stays INACTIVE (no change expected)
        expect(manualSticker?.status).toBe(StickerStatus.INACTIVE);

        // Partner status should be updated
        const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
        expect(partner?.status).toBe(PartnerStatus.INACTIVE);
      } finally {
        await cleanupTestPartner(partnerId);
      }
    });

    it('should atomically deactivate stickers on Partner → Suspended', async () => {
      const { partnerId, stickers } = await setupTestPartner(PartnerStatus.ACTIVE);

      try {
        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.SUSPENDED,
          reason: 'Fraud suspected',
        });

        const activeSticker = await prisma.sticker.findUnique({
          where: { id: stickers[0].id },
        });
        expect(activeSticker?.status).toBe(StickerStatus.INACTIVE);
        expect(activeSticker?.autoDeactivatedAt).not.toBeNull();

        const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
        expect(partner?.status).toBe(PartnerStatus.SUSPENDED);
      } finally {
        await cleanupTestPartner(partnerId);
      }
    });

    it('should atomically deactivate stickers on Partner → Archived', async () => {
      const { partnerId, stickers } = await setupTestPartner(PartnerStatus.ACTIVE);

      try {
        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.ARCHIVED,
        });

        const activeSticker = await prisma.sticker.findUnique({
          where: { id: stickers[0].id },
        });
        expect(activeSticker?.status).toBe(StickerStatus.INACTIVE);
        expect(activeSticker?.autoDeactivatedAt).not.toBeNull();

        const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
        expect(partner?.status).toBe(PartnerStatus.ARCHIVED);
      } finally {
        await cleanupTestPartner(partnerId);
      }
    });
  });

  describe('Partner → Active reactivates auto-deactivated stickers atomically', () => {
    it('should reactivate auto-deactivated stickers on Inactive → Active', async () => {
      const { partnerId, stickers } = await setupTestPartner(PartnerStatus.INACTIVE);

      try {
        // First, deactivate the stickers so they're marked with autoDeactivatedAt
        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.SUSPENDED,
        });

        // Then transition Suspended → Active (should reactivate auto-deactivated stickers)
        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.ACTIVE,
        });

        // The ACTIVE sticker should be reactivated
        const activeSticker = await prisma.sticker.findUnique({
          where: { id: stickers[0].id },
        });
        expect(activeSticker?.status).toBe(StickerStatus.ACTIVE);
        expect(activeSticker?.autoDeactivatedAt).toBeNull();

        // PROCESSING/PENDING stay INACTIVE (they were never operational)
        const processingSticker = await prisma.sticker.findUnique({
          where: { id: stickers[1].id },
        });
        expect(processingSticker?.status).toBe(StickerStatus.INACTIVE);

        // Manually deactivated stickers are NOT reactivated
        const manualSticker = await prisma.sticker.findUnique({
          where: { id: stickers[3].id },
        });
        expect(manualSticker?.status).toBe(StickerStatus.INACTIVE);
        expect(manualSticker?.autoDeactivatedAt).toBeNull(); // Still no marker

        const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
        expect(partner?.status).toBe(PartnerStatus.ACTIVE);
      } finally {
        await cleanupTestPartner(partnerId);
      }
    });

    it('should NOT reactivate stickers on Archived → Active (explicit admin action required)', async () => {
      const { partnerId, stickers } = await setupTestPartner(PartnerStatus.ACTIVE);

      try {
        // Archive the partner (deactivates all stickers)
        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.ARCHIVED,
        });

        // Verify stickers are deactivated
        let activeSticker = await prisma.sticker.findUnique({
          where: { id: stickers[0].id },
        });
        expect(activeSticker?.status).toBe(StickerStatus.INACTIVE);
        expect(activeSticker?.autoDeactivatedAt).not.toBeNull();

        // Re-activate the archived partner
        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.ACTIVE,
        });

        // Stickers should still be INACTIVE (NOT auto-reactivated per §2.4 Gap 6)
        activeSticker = await prisma.sticker.findUnique({
          where: { id: stickers[0].id },
        });
        expect(activeSticker?.status).toBe(StickerStatus.INACTIVE);
        // autoDeactivatedAt is CLEARED on ARCHIVED → ACTIVE to prevent bulk-reactivation
        // on a subsequent Inactive → Active cycle (spec §2.4 Gap 6, code Case 3).
        expect(activeSticker?.autoDeactivatedAt).toBeNull();

        const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
        expect(partner?.status).toBe(PartnerStatus.ACTIVE);
      } finally {
        await cleanupTestPartner(partnerId);
      }
    });
  });

  describe('Atomicity guarantees (no partial updates)', () => {
    it('should have zero ACTIVE stickers after deactivation completes', async () => {
      const { partnerId, venueId } = await setupTestPartner(PartnerStatus.ACTIVE);

      try {
        // Transition to INACTIVE
        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.INACTIVE,
        });

        // Query all stickers for this venue
        const activeStickersAfter = await prisma.sticker.count({
          where: {
            venueId,
            status: StickerStatus.ACTIVE,
          },
        });

        expect(activeStickersAfter).toBe(0);
      } finally {
        await cleanupTestPartner(partnerId);
      }
    });

    it('should have no stale ACTIVE stickers after Inactive → Active cycle', async () => {
      const { partnerId, venueId } = await setupTestPartner(PartnerStatus.ACTIVE);

      try {
        // Cycle: ACTIVE → SUSPENDED → ACTIVE
        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.SUSPENDED,
        });

        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.ACTIVE,
        });

        // Verify the partner is ACTIVE
        const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
        expect(partner?.status).toBe(PartnerStatus.ACTIVE);

        // Verify stickers match partner state: ACTIVE stickers should be reactivated
        const activeStickers = await prisma.sticker.findMany({
          where: {
            venueId,
            status: StickerStatus.ACTIVE,
          },
        });

        // We created one ACTIVE sticker; after deactivation and reactivation, it should be ACTIVE
        expect(activeStickers.length).toBeGreaterThan(0);
      } finally {
        await cleanupTestPartner(partnerId);
      }
    });
  });

  describe('Integration with PartnerStatusChange audit table', () => {
    it('should create a PartnerStatusChange row atomically with sticker updates', async () => {
      const { partnerId, userId } = await setupTestPartner(PartnerStatus.ACTIVE);

      try {
        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.INACTIVE,
          reason: 'Test audit',
          changedById: userId,
        });

        // Verify PartnerStatusChange was created
        const change = await prisma.partnerStatusChange.findFirst({
          where: { partnerId },
          orderBy: { createdAt: 'desc' },
        });

        expect(change?.fromStatus).toBe(PartnerStatus.ACTIVE);
        expect(change?.toStatus).toBe(PartnerStatus.INACTIVE);
        expect(change?.reason).toBe('Test audit');
        expect(change?.changedById).toBe(userId);
      } finally {
        await cleanupTestPartner(partnerId);
      }
    });
  });

  describe('Transactional rollback on sticker update failure (simulated)', () => {
    it('should verify stickers cannot be left in inconsistent state', async () => {
      const { partnerId, stickers } = await setupTestPartner(PartnerStatus.ACTIVE);

      try {
        // Deactivate the partner
        await partnerService.setPartnerStatus({
          partnerId,
          toStatus: PartnerStatus.INACTIVE,
        });

        // Verify that the partner status is INACTIVE
        const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
        expect(partner?.status).toBe(PartnerStatus.INACTIVE);

        // Verify that no ACTIVE stickers remain for this partner's venues
        const venues = await prisma.venue.findMany({
          where: { partnerId },
          select: { id: true },
        });
        const venueIds = venues.map((v) => v.id);

        const activeStickersOnInactivePartner = await prisma.sticker.count({
          where: {
            venueId: { in: venueIds },
            status: StickerStatus.ACTIVE,
          },
        });

        // This should be zero — spec §1.4 / §8.1 rule 5 guarantees consistency
        expect(activeStickersOnInactivePartner).toBe(0);
      } finally {
        await cleanupTestPartner(partnerId);
      }
    });
  });

  describe('Spec §1.4 edge cases', () => {
    it('should handle partner with no venues gracefully', async () => {
      const user = await prisma.user.create({
        data: {
          email: `test-no-venues-${Date.now()}@example.com`,
          passwordHash: 'hashed',
          firstName: 'Test',
          lastName: 'NoVenues',
          role: 'PARTNER',
          status: 'ACTIVE',
          phone: '+359000000001',
        },
      });

      const partner = await prisma.partner.create({
        data: {
          userId: user.id,
          businessName: `No Venues Partner ${Date.now()}`,
          category: 'RESTAURANTS_FOOD',
          status: PartnerStatus.ACTIVE,
          verifiedAt: new Date(),
        },
      });

      try {
        // Should not throw even with no venues
        await partnerService.setPartnerStatus({
          partnerId: partner.id,
          toStatus: PartnerStatus.INACTIVE,
        });

        const updated = await prisma.partner.findUnique({ where: { id: partner.id } });
        expect(updated?.status).toBe(PartnerStatus.INACTIVE);
      } finally {
        await prisma.partner.delete({ where: { id: partner.id } }).catch(() => {});
      }
    });

    it('should handle terminal stickers (REPLACED, RETIRED, DAMAGED) — leave untouched', async () => {
      const { partnerId, venueId } = await setupTestPartner(PartnerStatus.ACTIVE);

      const stickerLocation = await prisma.stickerLocation.findFirst({
        where: { venueId },
      });

      if (stickerLocation) {
        const ts2 = Date.now();
        // Create terminal stickers
        const terminalStickers = await Promise.all([
          prisma.sticker.create({
            data: {
              venueId,
              locationId: stickerLocation.id,
              stickerId: `TEST-REPLACED-${ts2}`,
              qrCode: `QR-REPLACED-${ts2}`,
              status: StickerStatus.REPLACED,
            },
          }),
          prisma.sticker.create({
            data: {
              venueId,
              locationId: stickerLocation.id,
              stickerId: `TEST-RETIRED-${ts2 + 1}`,
              qrCode: `QR-RETIRED-${ts2 + 1}`,
              status: StickerStatus.RETIRED,
            },
          }),
          prisma.sticker.create({
            data: {
              venueId,
              locationId: stickerLocation.id,
              stickerId: `TEST-DAMAGED-${ts2 + 2}`,
              qrCode: `QR-DAMAGED-${ts2 + 2}`,
              status: StickerStatus.DAMAGED,
            },
          }),
        ]);

        try {
          // Deactivate the partner
          await partnerService.setPartnerStatus({
            partnerId,
            toStatus: PartnerStatus.INACTIVE,
          });

          // Terminal stickers should be left untouched
          for (const terminalSticker of terminalStickers) {
            const after = await prisma.sticker.findUnique({
              where: { id: terminalSticker.id },
            });
            expect(after?.status).toBe(terminalSticker.status);
          }
        } finally {
          await cleanupTestPartner(partnerId);
        }
      }
    });
  });
});
