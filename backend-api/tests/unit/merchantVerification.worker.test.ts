/**
 * Unit tests for the merchant-verification worker rate-limit backoff state machine.
 *
 * Strategy: mock BullMQ's Worker (and all external deps) so we can emit events
 * directly and drive the state machine with fake timers, never touching Redis,
 * the DB, or OCR.
 */

jest.mock('bullmq', () => {
  const EventEmitter = require('events');
  const MockWorker = class extends EventEmitter {
    pause = jest.fn().mockResolvedValue(undefined);
    resume = jest.fn();
    close = jest.fn();
  };
  return { Worker: MockWorker };
});

jest.mock('../../src/queues/redis', () => ({
  getRedisConnection: () => ({}), // non-null so worker starts
}));

jest.mock('../../src/queues/merchantVerification.queue', () => ({
  MERCHANT_VERIFICATION_QUEUE: 'merchant-verification',
}));

jest.mock('../../src/services/sticker.service', () => ({
  stickerService: { runMerchantVerification: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { EventEmitter } from 'events';
import {
  RATE_LIMIT_BACKOFF_BASE_MS,
  MAX_RATE_LIMIT_BACKOFF_MS,
  RATE_LIMIT_RESET_QUIET_MS,
} from '../../src/queues/merchantVerification.worker';
// Worker type imported only for reference in AnyEmitter construction — mock replaces implementation

// The mock Worker is actually an EventEmitter; cast to avoid BullMQ's
// strict typed-emit signatures so we can drive events freely in tests.
type AnyEmitter = EventEmitter & { pause: jest.Mock; resume: jest.Mock; close: jest.Mock };

function emitRateLimitError(worker: AnyEmitter): void {
  (worker as EventEmitter).emit('error', new Error('ERR max requests limit exceeded'));
}

function emitCompleted(worker: AnyEmitter): void {
  (worker as EventEmitter).emit('completed', { data: { scanId: 'test-123' } });
}

function emitClosing(worker: AnyEmitter): void {
  (worker as EventEmitter).emit('closing');
}

describe('merchantVerification worker — rate-limit backoff state machine', () => {
  let worker: AnyEmitter;

  beforeEach(() => {
    jest.useFakeTimers();
    // Reset module registry so each test gets a fresh closure (fresh state variables)
    jest.resetModules();
    // Re-apply mocks after resetModules
    jest.mock('bullmq', () => {
      const EventEmitter = require('events');
      const MockWorker = class extends EventEmitter {
        pause = jest.fn().mockResolvedValue(undefined);
        resume = jest.fn();
        close = jest.fn();
      };
      return { Worker: MockWorker };
    });
    jest.mock('../../src/queues/redis', () => ({
      getRedisConnection: () => ({}),
    }));
    jest.mock('../../src/queues/merchantVerification.queue', () => ({
      MERCHANT_VERIFICATION_QUEUE: 'merchant-verification',
    }));
    jest.mock('../../src/services/sticker.service', () => ({
      stickerService: { runMerchantVerification: jest.fn().mockResolvedValue(undefined) },
    }));
    jest.mock('../../src/utils/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));

    // Fresh require after module reset
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../src/queues/merchantVerification.worker');
    const result = mod.startMerchantVerificationWorker();
    worker = result as AnyEmitter;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  // ── Test 1: First rate-limit error ────────────────────────────────────────
  it('first rate-limit error: calls pause(), and schedules resumeTimer for 10 s', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logger: mockLog } = require('../../src/utils/logger');

    emitRateLimitError(worker);

    // pause() must have been called
    expect((worker as any).pause).toHaveBeenCalledWith(true);

    // The warn should mention "pausing worker for 10s"
    const warnCalls: string[] = mockLog.warn.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(warnCalls.some((m) => m.includes('pausing worker for 10s'))).toBe(true);

    // After base backoff the resume timer fires (resume() is called)
    jest.advanceTimersByTime(RATE_LIMIT_BACKOFF_BASE_MS);
    expect((worker as any).resume).toHaveBeenCalled();
  });

  // ── Test 2: Stacked error while paused cancels the first timer and arms a new one ──
  it('stacked rate-limit error while already paused cancels the first timer and arms a new timer with doubled delay', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logger: mockLog } = require('../../src/utils/logger');

    // Error #1: backoff base→2×base; isPaused=true, resumeTimer armed (base ms)
    emitRateLimitError(worker);
    expect((worker as any).pause).toHaveBeenCalledWith(true);

    // Advance only partially (half of base) — first timer still pending
    jest.advanceTimersByTime(RATE_LIMIT_BACKOFF_BASE_MS / 2);
    expect((worker as any).resume).not.toHaveBeenCalled();

    // Error #2 arrives while already paused: clearTimeout cancels first timer,
    // backoff doubles (2×base→4×base), and a NEW resumeTimer is armed at 2×base ms.
    emitRateLimitError(worker);

    // Confirm the warn for the second error mentions 20 s (the delay now in effect)
    const warnCalls: string[] = mockLog.warn.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(warnCalls.some((m) => m.includes('pausing worker for 20s'))).toBe(true);

    // Advance base ms more (1.5×base total from error #1, base from error #2) —
    // the first timer was cancelled so resume() must NOT have fired yet.
    jest.advanceTimersByTime(RATE_LIMIT_BACKOFF_BASE_MS);
    expect((worker as any).resume).not.toHaveBeenCalled();

    // Advance another base ms (2.5×base total, 2×base from error #2) — new timer fires.
    jest.advanceTimersByTime(RATE_LIMIT_BACKOFF_BASE_MS);
    expect((worker as any).resume).toHaveBeenCalledTimes(1);
  });

  // ── Test 3: completed event schedules backoff reset after 60 s ────────────
  it('after elevated backoff, completed event schedules a 60 s reset to base', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logger: mockLog } = require('../../src/utils/logger');

    emitRateLimitError(worker); // backoff = base→2×base
    // Let the resume timer fire so the worker is "running" again
    jest.advanceTimersByTime(RATE_LIMIT_BACKOFF_BASE_MS);

    // Clear calls so we can isolate the reset log
    mockLog.info.mockClear();

    // Emit completed — should schedule the quiet-period reset timer
    emitCompleted(worker);

    // Before quiet period ends: no reset yet
    jest.advanceTimersByTime(RATE_LIMIT_RESET_QUIET_MS - 1);
    const infoCallsBefore: string[] = mockLog.info.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(infoCallsBefore.some((m) => m.includes('reset to base'))).toBe(false);

    // After quiet period: reset fires
    jest.advanceTimersByTime(1);
    const infoCallsAfter: string[] = mockLog.info.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(infoCallsAfter.some((m) => m.includes('reset to base'))).toBe(true);
  });

  // ── Test 4: rate-limit error cancels pending reset ────────────────────────
  it('rate-limit error while reset timer is pending cancels that timer', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logger: mockLog } = require('../../src/utils/logger');

    emitRateLimitError(worker); // backoff base→2×base
    jest.advanceTimersByTime(RATE_LIMIT_BACKOFF_BASE_MS); // resume fires

    emitCompleted(worker); // starts quiet-period reset timer

    // Advance halfway through the quiet period — still within the reset window
    jest.advanceTimersByTime(RATE_LIMIT_RESET_QUIET_MS / 2);

    mockLog.info.mockClear();

    // New rate-limit error should cancel the pending reset timer
    emitRateLimitError(worker);

    // Advance well past the quiet period from the completed event — reset must NOT have fired
    jest.advanceTimersByTime(RATE_LIMIT_RESET_QUIET_MS + RATE_LIMIT_RESET_QUIET_MS / 2);
    const infoCalls: string[] = mockLog.info.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(infoCalls.some((m) => m.includes('reset to base'))).toBe(false);
  });

  // ── Test 5: completed while paused must NOT schedule backoff reset ────────
  it('completed event while paused does not schedule the quiet-period reset', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logger: mockLog } = require('../../src/utils/logger');

    // Elevate backoff: first error sets backoff 10→20 and pauses the worker.
    // The resume timer fires after 10 s; we only advance 9 s so the worker
    // remains paused for the duration of this test.
    emitRateLimitError(worker);
    expect((worker as any).pause).toHaveBeenCalledWith(true);

    // Advance just under base backoff — still paused, resume timer has not fired yet
    jest.advanceTimersByTime(RATE_LIMIT_BACKOFF_BASE_MS - 1_000);
    expect((worker as any).resume).not.toHaveBeenCalled();

    // While the worker is still paused, an in-flight job completes
    mockLog.info.mockClear();
    emitCompleted(worker);

    // Advance another 9 s (18 s total from error) — well past what would be
    // the 60 s quiet-period IF the timer had been (incorrectly) scheduled.
    // We stay just under the 10 s resume threshold to keep isPaused=true.
    // Actually we need 60 s of quiet-period to verify no reset fires, but
    // the resume timer fires at 10 s (1 s from now). Instead, cancel the
    // resume timer effect by checking BEFORE it fires (< 1 s remaining),
    // then verify no reset log appeared during the window we can observe.
    // The key assertion: no "reset to base" log was emitted yet.
    const infoCallsImmediate: string[] = mockLog.info.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(infoCallsImmediate.some((m) => m.includes('reset to base'))).toBe(false);

    // Advance past the quiet period from the completed event.
    // The resume fires at t=base ms (1 s from now in fake-timer terms), so
    // isPaused becomes false after that — but crucially no reset timer was
    // ever scheduled, so no reset fires even after the quiet period elapses.
    jest.advanceTimersByTime(RATE_LIMIT_RESET_QUIET_MS + 1_000);
    const infoCalls: string[] = mockLog.info.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(infoCalls.some((m) => m.includes('reset to base'))).toBe(false);
  });

  // ── Test 6: closing clears rateLimitResetTimer before it fires ───────────
  it('closing event clears rateLimitResetTimer so "reset to base" never fires', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logger: mockLog } = require('../../src/utils/logger');

    // Step 1: emit a rate-limit error → isPaused = true, resumeTimer armed (10 s).
    emitRateLimitError(worker);
    expect((worker as any).pause).toHaveBeenCalledWith(true);

    // Step 2: advance past base backoff → resumeTimer fires, isPaused = false, worker resumes.
    jest.advanceTimersByTime(RATE_LIMIT_BACKOFF_BASE_MS);
    expect((worker as any).resume).toHaveBeenCalledTimes(1);

    // Step 3: emit completed → scheduleRateLimitReset() is called (since !isPaused),
    // arming rateLimitResetTimer for 60 s.
    mockLog.info.mockClear();
    emitCompleted(worker);

    // Step 4: before 60 s elapses, emit closing → should clear rateLimitResetTimer.
    emitClosing(worker);

    // Step 5: advance well past the quiet period — the timer must NOT have fired.
    jest.advanceTimersByTime(RATE_LIMIT_RESET_QUIET_MS + 10_000);

    const infoCalls: string[] = mockLog.info.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(infoCalls.some((m) => m.includes('reset to base'))).toBe(false);
  });

  // ── Test 7: closing clears resumeTimer before it fires ───────────────────
  it('closing event clears resumeTimer so worker.resume() is never called', () => {
    // Step 1: emit a rate-limit error → isPaused = true, resumeTimer armed (10 s).
    emitRateLimitError(worker);
    expect((worker as any).pause).toHaveBeenCalledWith(true);

    // Step 2: emit closing BEFORE the 10 s resume timer elapses.
    emitClosing(worker);

    // Step 3: advance well past base backoff — resumeTimer must NOT have fired.
    jest.advanceTimersByTime(RATE_LIMIT_BACKOFF_BASE_MS * 2);
    expect((worker as any).resume).not.toHaveBeenCalled();
  });

  // ── Test 8: pause() failure reverts isPaused so the next error can retry ──
  it('pause() failure reverts isPaused so the next rate-limit error can call pause() again', async () => {
    // Make pause() reject on the first call only
    (worker as any).pause.mockRejectedValueOnce(new Error('pause error'));

    // First rate-limit error — pause() rejects
    emitRateLimitError(worker);
    expect((worker as any).pause).toHaveBeenCalledTimes(1);

    // Flush microtasks so the .catch handler inside the worker runs
    await Promise.resolve();

    // isPaused was reverted to false by the .catch, so a second error can call pause() again
    emitRateLimitError(worker);
    expect((worker as any).pause).toHaveBeenCalledTimes(2);
  });

  // ── Test 9: 'resumed' event resets isPaused so the next error can re-pause ─
  it("'resumed' event resets isPaused so the next rate-limit error can re-pause", () => {
    // Emit first rate-limit error → isPaused = true
    emitRateLimitError(worker);
    expect((worker as any).pause).toHaveBeenCalledTimes(1);

    // Emit 'resumed' → isPaused = false
    (worker as EventEmitter).emit('resumed');

    // Emit another rate-limit error → isPaused was false, so pause() should be called again
    emitRateLimitError(worker);
    expect((worker as any).pause).toHaveBeenCalledTimes(2);
  });

  // ── Test 10: MAX_RATE_LIMIT_BACKOFF_MS ceiling is enforced ───────────────
  it('backoff saturates at MAX_RATE_LIMIT_BACKOFF_MS and resume fires exactly once at the cap', async () => {
    // Backoff sequence (delay used for timer → next backoff value):
    //   Error 1: timer=10_000,  backoff→20_000
    //   Error 2: timer=20_000,  backoff→40_000
    //   Error 3: timer=40_000,  backoff→80_000
    //   Error 4: timer=80_000,  backoff→160_000
    //   Error 5: timer=160_000, backoff→320_000
    //   Error 6: timer=320_000, backoff→600_000 (capped, was 640_000)
    //   Error 7: timer=600_000 (capped) ← THIS is the timer that exercises Math.min
    // 7 consecutive rate-limit errors are needed so the LAST timer fires at exactly
    // MAX_RATE_LIMIT_BACKOFF_MS, proving the ceiling is enforced.
    const NUM_ERRORS_TO_CAP = 7;

    for (let i = 0; i < NUM_ERRORS_TO_CAP; i++) {
      emitRateLimitError(worker);
      // Flush microtasks so any async pause() resolution completes before the next error
      await Promise.resolve();
    }

    // The 7th error's resumeTimer is armed at exactly MAX_RATE_LIMIT_BACKOFF_MS.
    // resume() must not have fired yet.
    expect((worker as any).resume).not.toHaveBeenCalled();

    // Advance to 1 ms before the cap — the ceiling timer must NOT have fired yet.
    jest.advanceTimersByTime(MAX_RATE_LIMIT_BACKOFF_MS - 1);
    expect((worker as any).resume).not.toHaveBeenCalled();

    // Advance the final 1 ms — fires exactly at the cap.
    jest.advanceTimersByTime(1);
    expect((worker as any).resume).toHaveBeenCalledTimes(1);

    // Advance another full cap period — no second timer should fire (the cap
    // does not re-arm another timer; only one resumeTimer is active at a time).
    jest.advanceTimersByTime(MAX_RATE_LIMIT_BACKOFF_MS);
    expect((worker as any).resume).toHaveBeenCalledTimes(1);
  });
});
