/**
 * Endpoint-contract sweep for receiptsApiService (BC-QA-031-FOLLOWUP-4).
 *
 * WHAT DEFECT CLASS THIS EXISTS FOR
 * ---------------------------------
 * A frontend response type that promises fields its endpoint never sends.
 * `tsc` cannot see this: the type is asserted at the `apiService.get<T>()` call
 * site, so whatever the server actually returns is cast to `T` unchecked. The
 * concrete instance this sweep was written for: `getUserStats()` requested
 * `GET /api/receipts/v2/stats/user` (`receiptService.getUserSubmissionStats` —
 * submission counters, no money, no `{ success, data }` envelope) while
 * declaring `ReceiptStatsResponse`, which promises `totalAmount`,
 * `averageAmount` and `totalReceipts`. Every one of those was `undefined` at
 * runtime.
 *
 * HOW IT CHECKS
 * -------------
 * Nothing here is mocked-to-match. The sweep reads the BACKEND SOURCE and
 * derives the real shape:
 *
 *   1. Call the frontend method with `apiService` mocked, and capture the URL
 *      it actually requests. (So repointing the method changes what is checked.)
 *   2. Parse `backend-api/src/server.ts` for `app.use(prefix, router)` mounts,
 *      in source order, and resolve the URL to the router file Express would
 *      pick — `/api/receipts/v2` is mounted before `/api/receipts`, and getting
 *      that order wrong is exactly how the original defect happened.
 *   3. Find the matching `router.<method>('<path>', …)` registration in that
 *      file, and require the handler to be a straight pass-through
 *      (`const result = await receiptService.X(…); res.json(result)`), so the
 *      service's return literal really is the wire shape.
 *   4. Parse that service method's `return { … }` object literal into a key
 *      tree.
 *   5. Assert every field the frontend TYPE declares is present in that tree.
 *
 * The declared shapes below are mirrored from the interfaces with
 * `satisfies Record<keyof T, …>`, so `tsc` fails if a field is added to or
 * removed from the interface without updating the mirror. That closes the other
 * half of the gap: the runtime check cannot drift away from the type it guards.
 *
 * SECOND CONTRACT: THE STATUS ENUM
 * --------------------------------
 * The same "the type promises something the backend never sends" class also
 * shows up one level down, in the VALUES a field can hold: the frontend
 * `ReceiptStatus` enum carried two members (`VALIDATED`, `CASHBACK_APPLIED`)
 * that exist nowhere in backend-api, and code filtering on them matched zero
 * rows for every user forever. `tsc` cannot see that either — both sides are
 * just strings. So this sweep also parses `enum ReceiptStatus` out of
 * `backend-api/prisma/schema.prisma` and asserts it equals the frontend enum,
 * member for member. BC-QA-031-FOLLOWUP-4 r2-F4: that correspondence used to be
 * asserted only in a JSDoc comment on the enum, and a comment cannot re-run
 * itself when someone edits one side.
 *
 * FAIL-LOUD, NEVER FAIL-OPEN
 * --------------------------
 * Every step throws with an explicit message when it cannot verify (backend
 * source missing, mount not found, route not registered, handler transforms the
 * result, more than one returned object literal, spread in the literal, Prisma
 * schema missing or its enum block written in a shape this parser does not
 * understand). A sweep that silently passes when it stopped understanding the
 * code is worth nothing, so "cannot verify" is a failure, not a skip.
 *
 * KNOWN COUPLING: this test reads `../../../backend-api/src` and
 * `../../../backend-api/prisma/schema.prisma`. It is a monorepo-only test and
 * will fail loudly in a frontend-only checkout — that is intended over skipping.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { ReceiptStatus } from '../types/receipt.types';
import type {
  ReceiptStats,
  ReceiptStatsResponse,
  ReceiptSubmissionStats,
} from '../types/receipt.types';

vi.mock('./api.service', () => ({
  apiService: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    getBlob: vi.fn(),
  },
}));

// Imported after vi.mock deliberately — vi.mock is hoisted above both, so
// receiptsApiService binds to the mocked apiService.
import { apiService } from './api.service';
import { receiptsApiService } from './receipts-api.service';

// ---------------------------------------------------------------------------
// Declared shapes — mirrors of the frontend types, pinned by `satisfies`.
// ---------------------------------------------------------------------------

type DeclaredShape = { [key: string]: true | DeclaredShape };

const DECLARED_RECEIPT_STATS = {
  totalReceipts: true,
  validatedReceipts: true,
  rejectedReceipts: true,
  pendingReceipts: true,
  totalAmount: true,
  averageAmount: true,
} satisfies Record<keyof ReceiptStats, true>;

// `true as const` because the `satisfies` target below supplies `unknown` as the
// contextual type for `success`, which would otherwise widen the literal to
// `boolean` and stop it fitting DeclaredShape.
const DECLARED_RECEIPT_STATS_RESPONSE = {
  success: true as const,
  data: DECLARED_RECEIPT_STATS,
} satisfies Record<keyof ReceiptStatsResponse, unknown>;

const DECLARED_RECEIPT_SUBMISSION_STATS = {
  submissionsToday: true,
  submissionsThisMonth: true,
  totalSubmissions: true,
  dailyLimit: true,
  monthlyLimit: true,
  remainingToday: true,
  remainingThisMonth: true,
} satisfies Record<keyof ReceiptSubmissionStats, true>;

// ---------------------------------------------------------------------------
// Backend source reader
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BACKEND_SRC = path.join(REPO_ROOT, 'backend-api', 'src');
const SERVER_FILE = path.join(BACKEND_SRC, 'server.ts');
const PRISMA_SCHEMA = path.join(REPO_ROOT, 'backend-api', 'prisma', 'schema.prisma');

/**
 * Members of a Prisma `enum <name> { … }` block, in declaration order.
 *
 * The block body is a flat list of bare identifiers, one per line, so this
 * needs no Prisma parser — but it must not degrade into "found nothing, so
 * nothing is wrong". Every shape it does not understand (schema absent, block
 * absent, unterminated block, a member line that is not a bare identifier —
 * e.g. one carrying an `@map(…)` attribute, or a nested block) throws, per this
 * file's fail-loud rule.
 */
function prismaEnumMembers(enumName: string): string[] {
  if (!fs.existsSync(PRISMA_SCHEMA)) {
    throw new Error(
      `[contract sweep] cannot verify: Prisma schema not found at ${PRISMA_SCHEMA}. ` +
        `This sweep derives the authoritative status list from backend-api/prisma and must ` +
        `run from a full monorepo checkout.`,
    );
  }
  const src = fs.readFileSync(PRISMA_SCHEMA, 'utf8');

  const header = new RegExp(`(?:^|\\n)[ \\t]*enum[ \\t]+${enumName}[ \\t]*\\{`).exec(src);
  if (!header) {
    throw new Error(
      `[contract sweep] cannot verify: no \`enum ${enumName} {\` block in ${PRISMA_SCHEMA}. ` +
        `Either the enum was renamed or removed on the backend — in which case the frontend ` +
        `enum of the same name is now describing nothing — or the schema's formatting changed ` +
        `and this parser needs updating.`,
    );
  }
  const bodyStart = header.index + header[0].length;
  const bodyEnd = src.indexOf('}', bodyStart);
  if (bodyEnd === -1) {
    throw new Error(
      `[contract sweep] cannot verify: \`enum ${enumName}\` in ${PRISMA_SCHEMA} is never closed.`,
    );
  }

  const members: string[] = [];
  for (const rawLine of src.slice(bodyStart, bodyEnd).split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(line)) {
      throw new Error(
        `[contract sweep] cannot verify: unexpected line ${JSON.stringify(line)} inside ` +
          `\`enum ${enumName}\` in ${PRISMA_SCHEMA}. This parser only understands a flat list ` +
          `of bare member names; attributes such as \`@map(…)\` mean the wire value differs ` +
          `from the member name and the comparison below would be wrong, so it refuses to ` +
          `guess.`,
      );
    }
    members.push(line);
  }
  if (members.length === 0) {
    throw new Error(
      `[contract sweep] cannot verify: \`enum ${enumName}\` in ${PRISMA_SCHEMA} parsed to zero ` +
        `members.`,
    );
  }
  return members;
}

/**
 * Wire shape: a Map of key → nested shape, or, for a scalar leaf, the source
 * text of the expression that produces it (so a check can assert *how* a value
 * is produced — e.g. that money goes through `bgnToEur()` — not merely that the
 * key exists).
 */
type ActualShape = Map<string, ActualShape | string>;

const sourceCache = new Map<string, ts.SourceFile>();

function sourceFile(absPath: string): ts.SourceFile {
  const cached = sourceCache.get(absPath);
  if (cached) return cached;
  if (!fs.existsSync(absPath)) {
    throw new Error(
      `[contract sweep] cannot verify: backend source not found at ${absPath}. ` +
        `This sweep reads backend-api/src to derive real endpoint shapes and must ` +
        `run from a full monorepo checkout.`,
    );
  }
  const sf = ts.createSourceFile(
    absPath,
    fs.readFileSync(absPath, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );
  sourceCache.set(absPath, sf);
  return sf;
}

/** Walk `node`'s subtree, without descending into nested function bodies. */
function walkShallow(node: ts.Node, visit: (n: ts.Node) => void): void {
  node.forEachChild(child => {
    if (
      ts.isFunctionDeclaration(child) ||
      ts.isFunctionExpression(child) ||
      ts.isArrowFunction(child) ||
      ts.isMethodDeclaration(child)
    ) {
      return;
    }
    visit(child);
    walkShallow(child, visit);
  });
}

/** Walk `node`'s entire subtree. */
function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  node.forEachChild(child => {
    visit(child);
    walk(child, visit);
  });
}

function resolveImport(fromFile: string, specifier: string): string {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `[contract sweep] cannot verify: could not resolve import '${specifier}' from ${fromFile}.`,
  );
}

interface Mount {
  prefix: string;
  routerFile: string;
}

/** `app.use('<prefix>', <routerIdent>)` mounts from server.ts, in source order. */
function readMounts(): Mount[] {
  const sf = sourceFile(SERVER_FILE);

  const importedFrom = new Map<string, string>();
  sf.statements.forEach(stmt => {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) return;
    const spec = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;
    if (clause?.name) importedFrom.set(clause.name.text, spec);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      clause.namedBindings.elements.forEach(el => importedFrom.set(el.name.text, spec));
    }
  });

  const mounts: Mount[] = [];
  walk(sf, node => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee)) return;
    if (!ts.isIdentifier(callee.expression) || callee.expression.text !== 'app') return;
    if (callee.name.text !== 'use') return;
    const [first, second] = node.arguments;
    if (!first || !ts.isStringLiteral(first)) return;
    if (!second || !ts.isIdentifier(second)) return;
    const spec = importedFrom.get(second.text);
    if (!spec || !spec.startsWith('.')) return;
    mounts.push({ prefix: first.text, routerFile: resolveImport(SERVER_FILE, spec) });
  });

  if (mounts.length === 0) {
    throw new Error(
      `[contract sweep] cannot verify: parsed 0 app.use(prefix, router) mounts from ${SERVER_FILE}. ` +
        `The mounting style changed and this sweep needs updating.`,
    );
  }
  return mounts;
}

function segments(p: string): string[] {
  return p.split('/').filter(Boolean);
}

function patternMatches(pattern: string, target: string): boolean {
  const pat = segments(pattern);
  const tgt = segments(target);
  if (pat.length !== tgt.length) return false;
  return pat.every((seg, i) => (seg.startsWith(':') ? tgt[i].length > 0 : seg === tgt[i]));
}

/**
 * Resolve a full URL path (e.g. `/api/receipts/stats`) the way Express would:
 * first mount whose prefix matches on a segment boundary, then first route in
 * that router file whose pattern matches the remainder.
 */
function resolveRoute(
  method: string,
  urlPath: string,
): { routerFile: string; routeCall: ts.CallExpression; mountPrefix: string; routePath: string } | null {
  for (const mount of readMounts()) {
    const prefixSegs = segments(mount.prefix);
    const urlSegs = segments(urlPath);
    if (prefixSegs.length > urlSegs.length) continue;
    if (!prefixSegs.every((seg, i) => seg === urlSegs[i])) continue;

    const remainder = `/${urlSegs.slice(prefixSegs.length).join('/')}`;
    const sf = sourceFile(mount.routerFile);

    let found: { routeCall: ts.CallExpression; routePath: string } | null = null;
    walk(sf, node => {
      if (found) return;
      if (!ts.isCallExpression(node)) return;
      const callee = node.expression;
      if (!ts.isPropertyAccessExpression(callee)) return;
      if (!ts.isIdentifier(callee.expression) || callee.expression.text !== 'router') return;
      if (callee.name.text.toLowerCase() !== method.toLowerCase()) return;
      const [first] = node.arguments;
      if (!first || !ts.isStringLiteral(first)) return;
      if (!patternMatches(first.text, remainder)) return;
      found = { routeCall: node, routePath: first.text };
    });

    // Express only falls through to a later mount when the router does not
    // handle the path; for these routers a non-match means 404, but keep
    // scanning so a shorter prefix mounted later still gets its chance.
    if (found) {
      const hit = found as { routeCall: ts.CallExpression; routePath: string };
      return {
        routerFile: mount.routerFile,
        routeCall: hit.routeCall,
        mountPrefix: mount.prefix,
        routePath: hit.routePath,
      };
    }
  }
  return null;
}

/**
 * The service method a route handler passes straight through to.
 * Throws unless the handler is `const x = await <service>.<m>(…); res.json(x)` —
 * anything else means the service return literal is not the wire shape and this
 * sweep must not pretend otherwise.
 */
function passthroughServiceCall(
  routeCall: ts.CallExpression,
  routerFile: string,
  label: string,
): { serviceIdent: string; methodName: string } {
  const jsonArgs: ts.Expression[] = [];
  walk(routeCall, node => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee)) return;
    if (!ts.isIdentifier(callee.expression) || callee.expression.text !== 'res') return;
    if (callee.name.text !== 'json') return;
    if (node.arguments[0]) jsonArgs.push(node.arguments[0]);
  });

  if (jsonArgs.length !== 1) {
    throw new Error(
      `[contract sweep] cannot verify ${label}: expected exactly one res.json(...) in the ` +
        `handler, found ${jsonArgs.length} (${routerFile}).`,
    );
  }
  const arg = jsonArgs[0];
  if (!ts.isIdentifier(arg)) {
    throw new Error(
      `[contract sweep] cannot verify ${label}: the handler responds with an inline ` +
        `expression rather than a variable holding the service result, so the service's ` +
        `return literal is not the wire shape (${routerFile}).`,
    );
  }

  let result: { serviceIdent: string; methodName: string } | null = null;
  walk(routeCall, node => {
    if (result) return;
    if (!ts.isVariableDeclaration(node)) return;
    if (!ts.isIdentifier(node.name) || node.name.text !== arg.text) return;
    let init: ts.Expression | undefined = node.initializer;
    if (init && ts.isAwaitExpression(init)) init = init.expression;
    if (!init || !ts.isCallExpression(init)) return;
    const callee = init.expression;
    if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression)) return;
    result = { serviceIdent: callee.expression.text, methodName: callee.name.text };
  });

  if (!result) {
    throw new Error(
      `[contract sweep] cannot verify ${label}: could not find ` +
        `\`const ${arg.text} = await <service>.<method>(...)\` in the handler (${routerFile}).`,
    );
  }
  return result;
}

function shapeFromObjectLiteral(obj: ts.ObjectLiteralExpression, label: string): ActualShape {
  const shape: ActualShape = new Map();
  obj.properties.forEach(prop => {
    if (ts.isSpreadAssignment(prop)) {
      throw new Error(
        `[contract sweep] cannot verify ${label}: the returned object literal contains a ` +
          `spread, so its key set is not statically knowable.`,
      );
    }
    const name = prop.name;
    if (!name || !(ts.isIdentifier(name) || ts.isStringLiteral(name))) return;
    const key = name.text;
    if (ts.isPropertyAssignment(prop)) {
      if (ts.isObjectLiteralExpression(prop.initializer)) {
        shape.set(key, shapeFromObjectLiteral(prop.initializer, label));
      } else {
        shape.set(key, prop.initializer.getText());
      }
    } else {
      // Shorthand (`{ totalReceipts }`) — the producing expression is the
      // identifier itself.
      shape.set(key, key);
    }
  });
  return shape;
}

/** Key tree of the single object literal a service method returns. */
function serviceMethodShape(serviceFile: string, methodName: string, label: string): ActualShape {
  const sf = sourceFile(serviceFile);

  let method: ts.MethodDeclaration | null = null;
  walk(sf, node => {
    if (method) return;
    if (!ts.isMethodDeclaration(node)) return;
    if (!ts.isIdentifier(node.name) || node.name.text !== methodName) return;
    method = node;
  });
  if (!method) {
    throw new Error(
      `[contract sweep] cannot verify ${label}: no method '${methodName}' in ${serviceFile}.`,
    );
  }
  const body = (method as ts.MethodDeclaration).body;
  if (!body) {
    throw new Error(`[contract sweep] cannot verify ${label}: '${methodName}' has no body.`);
  }

  const returned: ts.ObjectLiteralExpression[] = [];
  walkShallow(body, node => {
    if (!ts.isReturnStatement(node) || !node.expression) return;
    if (ts.isObjectLiteralExpression(node.expression)) returned.push(node.expression);
  });

  if (returned.length !== 1) {
    throw new Error(
      `[contract sweep] cannot verify ${label}: expected '${methodName}' to return exactly one ` +
        `object literal, found ${returned.length}. Either the method gained a branch this sweep ` +
        `cannot reason about, or it now returns a value built elsewhere.`,
    );
  }
  return shapeFromObjectLiteral(returned[0], label);
}

/** Fields the declared type promises that the endpoint does not emit. */
function missingFields(declared: DeclaredShape, actual: ActualShape, prefix = ''): string[] {
  const missing: string[] = [];
  for (const [key, value] of Object.entries(declared)) {
    const dotted = `${prefix}${key}`;
    if (!actual.has(key)) {
      missing.push(dotted);
      continue;
    }
    if (value !== true) {
      const nested = actual.get(key);
      if (typeof nested === 'string' || nested === undefined) {
        missing.push(`${dotted} (scalar on the wire, object in the type)`);
        continue;
      }
      missing.push(...missingFields(value, nested, `${dotted}.`));
    }
  }
  return missing;
}

/**
 * Mount path of the API, as a PATH ONLY — never an origin.
 *
 * `apiService` builds its axios baseURL from `VITE_API_BASE_URL || '/api'`, and
 * that value is legitimately absolute in the repo's own documented dev setup:
 * `partner-dashboard/.env.example` ships `VITE_API_BASE_URL=http://localhost:3025/api`
 * and WARP.md tells developers to copy it, so Vite loads it in test mode too.
 * Everything this sweep compares against — the `app.use(prefix, router)` mounts
 * in server.ts — is path-only, so the origin must be discarded before any
 * concatenation. Reducing through `new URL()` does that for both forms:
 *
 *   '/api'                        → '/api'
 *   'http://localhost:3025/api'   → '/api'
 *   'http://localhost:3025/api/'  → '/api'
 *
 * BC-QA-031-FOLLOWUP-4: this previously concatenated the raw value and
 * then collapsed repeated slashes, which turned an absolute base into
 * `http:/localhost:3025/api/receipts/stats` — first segment `http:`, matching no
 * mount — and made the sweep report that a live, 401-answering route "would
 * 404". A sweep that accuses the code falsely in the standard dev environment
 * gets muted, not fixed, which defeats the fail-loud design above.
 */
function mountPath(rawBase: string): string {
  return (
    new URL(
      rawBase,
      // Placeholder origin: only ever used to make a relative base parseable.
      // Its value cannot reach the result, because only `.pathname` is read.
      'http://contract-sweep.invalid',
    ).pathname
      // Trailing slash would survive into `/api//receipts/...` on a base like
      // `http://host/api/`; strip it so the join below is the only slash source.
      .replace(/\/+$/, '')
  );
}

/**
 * Full request path for a service call, from any shape of configured base.
 * Taken as a parameter rather than read from the environment so that the test
 * below can pin every configuration in one run, whatever this runner's own
 * `VITE_API_BASE_URL` happens to be.
 */
function joinApiPath(rawBase: string, requestedPath: string): string {
  // Both halves are paths by this point, so collapsing repeated slashes is safe
  // — there is no `scheme://` left for it to damage.
  return `${mountPath(rawBase)}/${requestedPath}`.replace(/\/{2,}/g, '/');
}

const RAW_API_BASE: string = import.meta.env.VITE_API_BASE_URL || '/api';

/** The URL a receiptsApiService method really requests, captured live. */
async function capturedUrl(invoke: () => Promise<unknown>): Promise<string> {
  const get = apiService.get as ReturnType<typeof vi.fn>;
  get.mockReset();
  get.mockResolvedValue(undefined);
  await invoke();
  expect(get, 'the method under test did not issue a GET through apiService').toHaveBeenCalled();
  const requested = get.mock.calls[0][0] as string;
  return joinApiPath(RAW_API_BASE, requested);
}

/** End-to-end: URL → mounted router → route → service method → wire shape. */
function wireShapeOf(method: string, urlPath: string): ActualShape {
  const route = resolveRoute(method, urlPath);
  if (!route) {
    throw new Error(
      `[contract sweep] ${method} ${urlPath} does not match ANY route registered on any router ` +
        `mounted in server.ts — the request would 404.`,
    );
  }
  const label = `${method} ${urlPath}`;
  const { serviceIdent, methodName } = passthroughServiceCall(route.routeCall, route.routerFile, label);
  const routerSf = sourceFile(route.routerFile);
  let serviceSpec: string | null = null;
  routerSf.statements.forEach(stmt => {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) return;
    const bindings = stmt.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      if (bindings.elements.some(el => el.name.text === serviceIdent)) {
        serviceSpec = stmt.moduleSpecifier.text;
      }
    }
    if (stmt.importClause?.name?.text === serviceIdent) serviceSpec = stmt.moduleSpecifier.text;
  });
  if (!serviceSpec) {
    throw new Error(
      `[contract sweep] cannot verify ${label}: '${serviceIdent}' is not imported in ${route.routerFile}.`,
    );
  }
  return serviceMethodShape(resolveImport(route.routerFile, serviceSpec), methodName, label);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('receiptsApiService endpoint contracts (BC-QA-031-FOLLOWUP-4)', () => {
  beforeAll(() => {
    // Fail here, once and clearly, rather than inside each assertion.
    expect(fs.existsSync(BACKEND_SRC), `backend source missing at ${BACKEND_SRC}`).toBe(true);
  });

  it('resolves a request to the same path whatever shape VITE_API_BASE_URL takes', () => {
    // BC-QA-031-FOLLOWUP-4. The sweep compares against the path-only
    // `app.use(prefix, router)` mounts in server.ts, so every deployment origin
    // must reduce to the same request path. `.env.example` ships the absolute
    // form; a plain `/api` is the fallback when no env file is present. Both,
    // and a trailing slash, must land on '/api/receipts/stats' — otherwise the
    // first path segment becomes 'http:' and every route lookup below reports a
    // 404 that is not real.
    //
    // These bases are passed in explicitly, so this holds no matter what the
    // runner's own environment is set to. It is what makes the assertions below
    // trustworthy in the setup WARP.md actually prescribes.
    for (const raw of [
      '/api',
      '/api/',
      'http://localhost:3025/api',
      'http://localhost:3025/api/',
      'https://api.boomcard.bg/api',
    ]) {
      expect(
        joinApiPath(raw, '/receipts/stats'),
        `with VITE_API_BASE_URL=${raw}, the sweep builds a URL that carries the deployment ` +
          `origin into the path it matches against server.ts's mounts.`,
      ).toBe('/api/receipts/stats');

      expect(
        resolveRoute('get', joinApiPath(raw, '/receipts/stats')),
        `with VITE_API_BASE_URL=${raw}, GET /receipts/stats does not resolve to a mounted route.`,
      ).not.toBeNull();
    }
  });

  it('the frontend ReceiptStatus enum mirrors enum ReceiptStatus in schema.prisma exactly', () => {
    // BC-QA-031-FOLLOWUP-4 r2-F4. This replaces a prose claim that used to sit
    // in receipt.types.ts's JSDoc ("Mirrors … exactly"). A comment cannot re-run
    // itself: the moment a member is added to the Prisma enum, or invented on
    // the frontend, the claim is silently false and nothing reports it. Two
    // invented members (VALIDATED, CASHBACK_APPLIED) reached shipped filter
    // expressions exactly that way and matched zero rows for every user
    // forever, which is the defect BC-QA-031-FOLLOWUP-4 fixed by hand. This
    // assertion is what catches the next one by machine.
    //
    // Scope note: this pins MEMBERSHIP only. That a member is actually handled
    // by the surfaces that branch on status, rather than falling through to
    // their `default` arm, is a separate guarantee and lives in
    // `src/sweeps/receipt-status-rendering.sweep.test.tsx`.
    const backend = prismaEnumMembers('ReceiptStatus');
    const frontendValues = Object.values(ReceiptStatus) as string[];
    const frontendNames = Object.keys(ReceiptStatus);

    expect(
      [...frontendValues].sort(),
      `the frontend ReceiptStatus enum no longer matches \`enum ReceiptStatus\` in ` +
        `backend-api/prisma/schema.prisma.\n` +
        `  frontend: ${frontendValues.join(', ')}\n` +
        `  backend:  ${backend.join(', ')}\n` +
        `A frontend-only member can never match a row (that is the BC-QA-031-FOLLOWUP-4 ` +
        `defect); a backend-only member is a state the UI cannot label or filter on. Add or ` +
        `remove it on both sides together.`,
    ).toEqual([...backend].sort());

    // The wire carries the VALUE, so the check above is the load-bearing one —
    // but a member whose name and value diverge (`VALIDATED = 'APPROVED'`)
    // would slip past it while making every `ReceiptStatus.X` reference in the
    // codebase mean something other than it reads as.
    //
    // This is a PER-MEMBER identity check (`value === name` for each entry), not
    // a comparison of the name list against the value list. Comparing the two
    // lists would miss a permutation: `APPROVED = 'REJECTED'` together with
    // `REJECTED = 'APPROVED'` leaves the two lists equal as sets, so a list
    // comparison stays green while `ReceiptStatus.APPROVED` sends 'REJECTED'
    // and the widget's cashback filter silently sums rejected receipts. The
    // check below is red for that swap and for every single-member divergence.
    const divergent = Object.entries(ReceiptStatus)
      .filter(([name, value]) => value !== name)
      .map(([name, value]) => `${name} = '${value}'`);

    expect(
      divergent,
      `the frontend ReceiptStatus enum has ${divergent.length} member(s) whose name differs ` +
        `from its string value, so \`ReceiptStatus.<name>\` no longer reads as the status it ` +
        `sends: ${divergent.join(', ')}.\n` +
        `  names:  ${frontendNames.join(', ')}\n` +
        `  values: ${frontendValues.join(', ')}\n` +
        `Every member must be spelled \`NAME = 'NAME'\`, because the mirror check above ` +
        `compares frontend VALUES against Prisma member NAMES.`,
    ).toEqual([]);
  });

  it('getUserStats() requests a route that actually exists', async () => {
    const url = await capturedUrl(() => receiptsApiService.getUserStats());
    const route = resolveRoute('get', url);
    expect(
      route,
      `getUserStats() requests GET ${url}, which matches no route on any router mounted in ` +
        `backend-api/src/server.ts — that request would 404.`,
    ).not.toBeNull();
  });

  it('getUserStats() requests an endpoint that emits every field ReceiptStatsResponse declares', async () => {
    const url = await capturedUrl(() => receiptsApiService.getUserStats());
    const shape = wireShapeOf('get', url);
    const missing = missingFields(DECLARED_RECEIPT_STATS_RESPONSE, shape);

    expect(
      missing,
      `ReceiptStatsResponse promises fields that GET ${url} does not send: ${missing.join(', ')}.\n` +
        `That endpoint emits: ${[...shape.keys()].join(', ')}.\n` +
        `Consumers read these off the response and call .toFixed(2) on them, so a missing money ` +
        `field is a runtime TypeError, not a cosmetic mismatch. Either point getUserStats() at ` +
        `GET /api/receipts/stats (receiptService.getUserReceiptStats), or make the handler emit ` +
        `what the type promises.`,
    ).toEqual([]);
  });

  it('the money fields it reads are EUR-converted at the source', async () => {
    // Guards the label, not just the presence: the widget renders these with a
    // '€' prefix. If the handler stops converting, the render becomes a mislabel
    // (the BC-QA-031 defect class) rather than a crash, which no shape check
    // would catch.
    const url = await capturedUrl(() => receiptsApiService.getUserStats());
    const shape = wireShapeOf('get', url);
    const data = shape.get('data');

    expect(
      typeof data === 'object',
      `GET ${url} has no 'data' object to read money out of; it emits ` +
        `${[...shape.keys()].join(', ')}.`,
    ).toBe(true);

    for (const field of ['totalAmount', 'averageAmount'] as const) {
      const producer = (data as ActualShape).get(field);
      expect(
        typeof producer === 'string' ? producer : '<not a scalar field>',
        `GET ${url} no longer runs ${field} through bgnToEur(); the '€' prefix the ` +
          `ReceiptAnalyticsWidget renders would then be a mislabel of a BGN figure.`,
      ).toMatch(/^bgnToEur\(/);
    }
  });

  it('the /v2 rate-limit endpoint is genuinely money-less — repointing there must fail', () => {
    // The defect this sweep exists for, asserted positively. This also proves
    // the machinery above has teeth: the same comparison that passes for
    // /api/receipts/stats reports concrete missing fields here.
    const shape = wireShapeOf('get', '/api/receipts/v2/stats/user');
    const missing = missingFields(DECLARED_RECEIPT_STATS_RESPONSE, shape);

    expect(missing).toEqual(
      expect.arrayContaining([
        'success',
        'data',
      ]),
    );
    expect([...shape.keys()]).not.toContain('totalAmount');
    expect([...shape.keys()]).not.toContain('averageAmount');
  });

  it('ReceiptSubmissionStats honestly describes GET /api/receipts/v2/stats/user', () => {
    const shape = wireShapeOf('get', '/api/receipts/v2/stats/user');
    expect(missingFields(DECLARED_RECEIPT_SUBMISSION_STATS, shape)).toEqual([]);
    // …and does not understate it either: an unlisted field means the type has
    // drifted behind the endpoint.
    expect([...shape.keys()].sort()).toEqual(
      Object.keys(DECLARED_RECEIPT_SUBMISSION_STATS).sort(),
    );
  });

  it('PINS an out-of-scope divergence (tracked as BC-QA-056): receipt.service.ts requests a route that does not exist', () => {
    // NOT fixed by BC-QA-031-FOLLOWUP-4 — the fix is a behaviour change to
    // cashback input, not a typing change. It is filed on the board as
    // **BC-QA-056**; this pin is that task's tripwire, and deleting the pin is
    // part of doing BC-QA-056.
    //
    // `partner-dashboard/src/services/receipt.service.ts` calls
    // apiService.get<UserSubmissionStats>('/receipts/stats/user') →
    // GET /api/receipts/stats/user. The v1 receipts router (mounted at
    // /api/receipts) has /stats but no /stats/user, and /:id matches one segment
    // only, so that request 404s and the method's catch always returns its
    // { submissionsToday: 0, submissionsThisMonth: 0, cardType: 'BASIC' }
    // fallback. Its `UserSubmissionStats` also declares `cardType`, which the
    // real /v2 handler does not emit — so simply repointing the URL would feed
    // `undefined` into calculateCashback({ cardType }).
    //
    // This test goes RED when that is fixed. That is deliberate: whoever fixes
    // it — under BC-QA-056 — should delete this pin and add the corrected call
    // to the enforced contracts above.
    const frontendSrc = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'receipt.service.ts'),
      'utf8',
    );
    expect(
      frontendSrc.includes(`'/receipts/stats/user'`),
      `receipt.service.ts no longer requests '/receipts/stats/user'. This is the tripwire for ` +
        `board task BC-QA-056. If the call was repointed at the real endpoint, delete this pin ` +
        `as part of BC-QA-056 and register the call in the enforced contracts above — and check ` +
        `that UserSubmissionStats no longer declares cardType, which getUserSubmissionStats() ` +
        `does not emit.`,
    ).toBe(true);

    expect(
      resolveRoute('get', '/api/receipts/stats/user'),
      `GET /api/receipts/stats/user now resolves to a route. The pinned 404 is fixed — update ` +
        `this test and receipt.service.ts together, under board task BC-QA-056.`,
    ).toBeNull();

    const realShape = wireShapeOf('get', '/api/receipts/v2/stats/user');
    expect([...realShape.keys()]).not.toContain('cardType');
  });
});
