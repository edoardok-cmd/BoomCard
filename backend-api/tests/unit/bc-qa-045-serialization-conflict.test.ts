/**
 * BC-QA-045 — executable pin for `isSerializationConflict`
 * (src/routes/adminAdmins.routes.ts).
 *
 * WHY THIS FILE EXISTS (AX-175). The predicate's JSDoc previously asserted, in
 * prose, that a PostgreSQL SQLSTATE 40001 serialization failure reaches the
 * route in a particular runtime shape, and cited a line number inside
 * `node_modules/@prisma/adapter-pg/dist/index.js` as the evidence. `node_modules`
 * is untracked and regenerated on every install, so that citation rots silently
 * on the next adapter bump and takes the claim's credibility with it. A claim
 * worth verifying belongs in a test, so the shapes are constructed and asserted
 * here instead.
 *
 * WHAT IS BEING PINNED. Under Prisma 7 + `@prisma/adapter-pg` a 40001 can arrive
 * in EITHER of two shapes, and which one you get is timing-dependent:
 *
 *   (a) STATEMENT-time conflict — the adapter's `DriverAdapterError` is passed
 *       through `rethrowAsUserFacing`, whose `getErrorCode` maps
 *       `TransactionWriteConflict -> 'P2034'`. The caller sees a
 *       PrismaClientKnownRequestError-shaped error carrying `code: 'P2034'`.
 *
 *   (b) COMMIT-time conflict — `commitTransaction` closes the transaction with
 *       no `rethrowAsUserFacing` wrapper, so the bare `DriverAdapterError`
 *       escapes: `name: 'DriverAdapterError'`, `message: 'TransactionWriteConflict'`
 *       (the Error superclass is given the payload's `kind` when the payload has
 *       no `message`), `cause: { kind: 'TransactionWriteConflict' }`, and NO
 *       `code` property at all.
 *
 * This is why the pre-BC-QA-045 `code === 'P2034'` check was PARTIAL rather than
 * dead: it matched (a) and silently dropped (b). Both must match, or the
 * last-active-SUPER_ADMIN TOCTOU guards answer an opaque 400 instead of 409
 * whenever the conflict happens to surface at commit time.
 *
 * The shapes below are constructed by hand rather than imported from the
 * vendored packages ON PURPOSE: this file is a statement about the CONTRACT the
 * route code relies on, so it must keep failing if the route's matcher narrows,
 * regardless of what any installed driver version happens to throw today.
 */

import { isSerializationConflict } from '../../src/routes/adminAdmins.routes';

/** Rebuilds the `DriverAdapterError` shape from @prisma/driver-adapter-utils. */
function makeDriverAdapterError(kind: string): Error {
  const payload = { kind };
  // The real class does `super(payload.message ?? payload.kind)` and assigns
  // `cause = payload`, with `name` fixed to 'DriverAdapterError'.
  const err = new Error(kind) as Error & { cause?: unknown };
  err.name = 'DriverAdapterError';
  err.cause = payload;
  return err;
}

/** Rebuilds the PrismaClientKnownRequestError shape (statement-time path). */
function makeKnownRequestError(code: string): Error {
  const err = new Error(
    '\nInvalid `prisma.user.update()` invocation:\n\n\nTransaction failed due to a write conflict or a deadlock. Please retry your transaction',
  ) as Error & { code?: string };
  err.name = 'PrismaClientKnownRequestError';
  err.code = code;
  return err;
}

describe('BC-QA-045 — isSerializationConflict recognises every 40001 shape', () => {
  it('(b) matches the bare commit-time DriverAdapterError (no `code` property)', () => {
    const err = makeDriverAdapterError('TransactionWriteConflict') as Error & { code?: unknown };

    // The precise gap the old matcher had: there is no `code` to read.
    expect(err.code).toBeUndefined();
    expect(isSerializationConflict(err)).toBe(true);
  });

  it('(a) matches the statement-time PrismaClientKnownRequestError with code P2034', () => {
    expect(isSerializationConflict(makeKnownRequestError('P2034'))).toBe(true);
  });

  it('matches a raw SQLSTATE 40001 that reaches us before Prisma maps it', () => {
    const err = new Error('could not serialize access due to read/write dependencies among transactions') as Error & { code?: string };
    err.code = '40001';
    expect(isSerializationConflict(err)).toBe(true);
  });

  // ── Arm-by-arm pinning ───────────────────────────────────────────────────
  //
  // The predicate has FOUR arms: `code === 'P2034'`, `code === '40001'`,
  // `cause.kind === 'TransactionWriteConflict'`, and the
  // `name === 'DriverAdapterError' && message === 'TransactionWriteConflict'`
  // pair. The first two are already isolated by the two cases above, which trip
  // exactly one arm each.
  //
  // The last two are NOT isolated by the composite `makeDriverAdapterError()`
  // shape, because a real DriverAdapterError carries BOTH `name`+`message` AND
  // `cause.kind` — so either arm alone satisfies it, and deleting either one
  // leaves the composite case green. That redundancy is deliberate belt-and-
  // braces against a future adapter version dropping one of the two properties,
  // but it means the composite case cannot tell you which arm is load-bearing.
  // These two cases each present a shape that only ONE of the pair can match, so
  // deleting either arm turns exactly one of them red.

  it('pins the `cause.kind` arm alone: adapter renamed, kind still present', () => {
    // A future adapter that renames the error class and/or changes the message
    // but keeps the structured `cause` payload. `name`/`message` cannot match.
    const err = new Error('Transaction failed due to a write conflict') as Error & { cause?: unknown };
    err.name = 'PrismaAdapterError';
    err.cause = { kind: 'TransactionWriteConflict' };
    expect(isSerializationConflict(err)).toBe(true);
  });

  it('pins the `name`+`message` arm alone: no `cause` payload at all', () => {
    // A shape carrying the adapter's class name and kind-as-message but no
    // structured cause, so the `cause.kind` arm has nothing to walk into.
    const err = new Error('TransactionWriteConflict');
    err.name = 'DriverAdapterError';
    expect((err as Error & { cause?: unknown }).cause).toBeUndefined();
    expect(isSerializationConflict(err)).toBe(true);
  });

  it('matches when the adapter error is nested inside a wrapper via `cause`', () => {
    const inner = makeDriverAdapterError('TransactionWriteConflict');
    const outer = new Error('Transaction failed') as Error & { cause?: unknown };
    outer.cause = inner;
    expect(isSerializationConflict(outer)).toBe(true);
  });

  it('does NOT match unrelated errors', () => {
    // A different Prisma error code.
    expect(isSerializationConflict(makeKnownRequestError('P2002'))).toBe(false);
    // A different driver-adapter kind.
    expect(isSerializationConflict(makeDriverAdapterError('TableDoesNotExist'))).toBe(false);
    // The guard sentinels this file's routes throw on purpose.
    expect(isSerializationConflict(new Error('GUARD_FAILED:Cannot deactivate the last active SUPER_ADMIN'))).toBe(false);
    // Non-error inputs must not throw.
    expect(isSerializationConflict(null)).toBe(false);
    expect(isSerializationConflict(undefined)).toBe(false);
    expect(isSerializationConflict('TransactionWriteConflict')).toBe(false);
  });

  it('terminates on a self-referential `cause` chain rather than looping forever', () => {
    const a = new Error('a') as Error & { cause?: unknown };
    const b = new Error('b') as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(isSerializationConflict(a)).toBe(false);
  });
});
