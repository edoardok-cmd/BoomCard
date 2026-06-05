/**
 * detach — uniform dispatch for fire-and-forget side effects.
 *
 * Production paths across the codebase schedule detached work (audit writes,
 * notifications, emails) and intentionally do NOT await it, attaching only an
 * error handler so an unhandled rejection cannot crash the process:
 *
 *     writeAudit({ ... }).catch(err => logger.error('...', err));
 *
 * Functionally that is exactly what `detach(p, onError)` does. The ONLY
 * difference is test-environment bookkeeping:
 *
 *  • In production (NODE_ENV !== 'test') `detach` is a strict no-op wrapper
 *    around the original `.catch`: it attaches `onError` and returns. It
 *    retains NO reference to the promise, allocates nothing extra, and changes
 *    no scheduling, arguments, or error semantics. It is therefore provably
 *    identical to the inline `.catch(onError)` it replaces — see the production
 *    branch below: `p.catch(onError)` and return, nothing else runs.
 *
 *  • In test (NODE_ENV === 'test') the settled promise is also pushed onto a
 *    module-level registry so the jest harness can deterministically await ALL
 *    detached work (via `drainDetached`) before the next test sets up its mocks.
 *    This is what eliminates the cross-test mock-leakage flake: every piece of
 *    detached work is registered, so none of it can settle during a later,
 *    unrelated test and consume that test's `mockResolvedValueOnce` queues or
 *    inflate its call counts.
 *
 * The test branch is gated entirely behind the NODE_ENV check, so the registry
 * and its retained references never exist outside tests.
 */

const IS_TEST = process.env.NODE_ENV === 'test';

// Test-only registry of detached promises awaiting drain. Never populated in
// production (the push is behind the IS_TEST gate), so it retains nothing and
// cannot leak memory outside tests.
const registry: Promise<unknown>[] = [];

/**
 * Dispatch a detached (fire-and-forget) promise with an error handler.
 *
 * Behaviour is IDENTICAL to `p.catch(onError)` in production. In test, the
 * resulting settled promise is additionally registered for deterministic drain.
 *
 * @param p       the detached promise whose result is intentionally dropped
 * @param onError handler invoked with the rejection reason (same contract as
 *                the `.catch(onError)` it replaces)
 */
export function detach<T>(p: Promise<T>, onError: (e: unknown) => void): void {
  // Attach the error handler exactly as the original `.catch` did. `settled`
  // is a promise that always RESOLVES (never rejects) once `p` settles and
  // `onError` has run on rejection — so awaiting it in the harness can never
  // throw.
  const settled = p.catch(onError);

  if (IS_TEST) {
    registry.push(settled);
  }
  // Production: return immediately. No registry reference is held; this is a
  // strict no-op beyond the `.catch` above.
}

/**
 * Wrap a `setImmediate(async () => { ... })` block so its work is registered
 * for drain. The body runs on a real macrotask exactly as before; the returned
 * promise (which the harness can await) resolves when the body completes.
 *
 * Use this in place of a bare `setImmediate(async () => { ... })` whose promise
 * would otherwise be dropped. Behaviour is identical in production save for the
 * (test-only) registry bookkeeping inherited from `detach`.
 *
 * @param body    the async work to run on the next macrotask
 * @param onError handler invoked if `body` rejects
 */
export function detachImmediate(
  body: () => Promise<void>,
  onError: (e: unknown) => void,
): void {
  detach(
    new Promise<void>((resolve) => {
      setImmediate(() => {
        // Run the async body and resolve the outer promise when it settles.
        // Rejections propagate to `detach`'s `.catch(onError)`.
        body().then(resolve, (e) => {
          onError(e);
          resolve();
        });
      });
    }),
    onError,
  );
}

/**
 * Test-only helper: await every detached promise registered since the last
 * drain. A settling chain may itself schedule more detached work, so this loops
 * — splicing the registry and awaiting the batch — until the registry stays
 * empty across an iteration, with a hard cap to avoid an infinite loop on a
 * pathological self-rescheduling chain.
 *
 * No-op (resolves immediately) outside the test environment, where the registry
 * is never populated.
 */
export async function drainDetached(): Promise<void> {
  if (!IS_TEST) return;
  for (let i = 0; i < 50; i++) {
    if (registry.length === 0) return;
    const batch = registry.splice(0);
    await Promise.allSettled(batch);
  }
}

/** Test-only: number of pending registered promises (for diagnostics/asserts). */
export function _detachedRegistrySize(): number {
  return registry.length;
}
