/**
 * Run an async `worker` over each item in `items` with at most `limit`
 * concurrent in-flight calls, returning a settled-result array in input
 * order. Equivalent in shape to `Promise.allSettled` but with a cap.
 *
 * Used by routes that fan out to a rate-limited external API (e.g. Paysera
 * B2C Transfer in /admin/payouts/bulk-approve) where an unbounded
 * `Promise.all` would risk exhausting the Prisma connection pool or
 * tripping the upstream provider's per-second rate limit.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (limit < 1) throw new Error('runWithConcurrency: limit must be >= 1');
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const runnerCount = Math.min(limit, items.length);
  const runners: Promise<void>[] = [];
  for (let r = 0; r < runnerCount; r++) {
    runners.push((async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        try {
          const value = await worker(items[i], i);
          results[i] = { status: 'fulfilled', value };
        } catch (reason) {
          results[i] = { status: 'rejected', reason };
        }
      }
    })());
  }
  await Promise.all(runners);
  return results;
}
