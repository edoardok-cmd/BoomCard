import { prisma } from '../lib/prisma';
import { detach } from '../utils/detach';

// Spec §4.1 — "Последна активност" should reflect any meaningful action
// in the app, not just sign-in. We touch User.lastActivityAt from the auth
// middleware on every authenticated USER request, throttled in memory so a
// chatty mobile client doesn't write to the DB on every poll.
//
// The throttle map is bounded two ways so it never leaks under steady-state
// growth: (1) entries older than the throttle window are pruned opportunistically
// every PRUNE_INTERVAL_MS, since they no longer block writes; (2) if the map
// somehow exceeds MAX_ENTRIES (e.g. extreme burst), the oldest entries are
// evicted FIFO. Both bounds are per-process; in a multi-replica deploy each
// replica throttles independently (acceptable — total write rate stays bounded
// at instances × users / window).

const MIN_WRITE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const PRUNE_INTERVAL_MS = MIN_WRITE_INTERVAL_MS;
const MAX_ENTRIES = 50_000;

const lastWriteAt = new Map<string, number>();
let lastPruneAt = 0;

function pruneStale(now: number): void {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  for (const [userId, ts] of lastWriteAt) {
    if (now - ts >= MIN_WRITE_INTERVAL_MS) lastWriteAt.delete(userId);
  }
}

function evictIfOverCapacity(): void {
  if (lastWriteAt.size <= MAX_ENTRIES) return;
  // Map iteration order is insertion order — drop the oldest 10% so we don't
  // re-evict on every call once we hit the cap.
  const toDrop = Math.ceil(MAX_ENTRIES * 0.1);
  let dropped = 0;
  for (const userId of lastWriteAt.keys()) {
    if (dropped >= toDrop) break;
    lastWriteAt.delete(userId);
    dropped++;
  }
}

export function touchUserActivity(userId: string, role: string): void {
  if (role !== 'USER') return;
  const now = Date.now();
  pruneStale(now);
  const previous = lastWriteAt.get(userId);
  if (previous && now - previous < MIN_WRITE_INTERVAL_MS) return;
  lastWriteAt.set(userId, now);
  evictIfOverCapacity();

  // Fire-and-forget; failure here must never break the request.
  detach(
    prisma.user.update({
      where: { id: userId },
      data: { lastActivityAt: new Date(now) },
    }),
    () => {
      // Roll back the throttle so we retry on the next request.
      lastWriteAt.delete(userId);
    },
  );
}

// Test seam — reset both the map and the prune clock between tests.
export function __resetUserActivityForTests(): void {
  lastWriteAt.clear();
  lastPruneAt = 0;
}
