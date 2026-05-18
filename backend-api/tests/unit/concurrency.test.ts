import { runWithConcurrency } from '../../src/utils/concurrency';

describe('runWithConcurrency', () => {
  it('returns settled results in input order, fulfilled values mixed with rejections', async () => {
    const out = await runWithConcurrency([1, 2, 3, 4], 2, async (n) => {
      if (n === 2) throw new Error('boom-2');
      if (n === 4) throw new Error('boom-4');
      return n * 10;
    });

    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ status: 'fulfilled', value: 10 });
    expect(out[1].status).toBe('rejected');
    expect((out[1] as PromiseRejectedResult).reason.message).toBe('boom-2');
    expect(out[2]).toEqual({ status: 'fulfilled', value: 30 });
    expect((out[3] as PromiseRejectedResult).reason.message).toBe('boom-4');
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await runWithConcurrency(items, 5, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      // Yield several microtasks so concurrent workers can stack up if the cap is broken.
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1); // sanity: parallelism is actually happening
  });

  it('processes every item exactly once', async () => {
    const seen = new Set<number>();
    const items = Array.from({ length: 50 }, (_, i) => i);
    await runWithConcurrency(items, 7, async (n) => {
      seen.add(n);
    });
    expect(seen.size).toBe(50);
  });

  it('handles empty input cleanly', async () => {
    const out = await runWithConcurrency([], 5, async () => 'never-called');
    expect(out).toEqual([]);
  });

  it('rejects when limit < 1', async () => {
    await expect(runWithConcurrency([1, 2], 0, async (n) => n)).rejects.toThrow(/limit must be >= 1/);
  });

  it('does not abandon work when a worker rejects', async () => {
    const completed: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      if (n === 2) throw new Error('fail');
      completed.push(n);
    });
    // All non-rejecting items still ran:
    expect(completed.sort()).toEqual([1, 3, 4, 5]);
  });
});
