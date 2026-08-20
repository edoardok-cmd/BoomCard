# Committed-artefact PII gate

**Why this exists.** This repository is **public**. On 2026-05-03,
`subscribers-all-snapshot.md` — a Playwright accessibility snapshot of the admin
Subscribers page — was committed to `master` carrying 9 real consumer mailboxes,
12 phone numbers, customer names and subscription payment state. It stayed
publicly fetchable for about three and a half months. Nothing objected, because
nothing gated what got committed.

A credential scanner would not have caught it: there was no API key, token or
password in the file. The leaking shape is a **debugging or snapshot artefact
carrying a cluster of production identities**.

## What the gate does

Two independent rules, either of which fails:

| Rule | Trips when |
|---|---|
| `content` | a file carries ≥3 distinct consumer-mailbox addresses, or ≥5 distinct phone numbers |
| `path` | a file matches a `snapshot` / `dump` / `export` / `backup` / `subscribers` / `customers` artefact shape |

The `content` rule is the load-bearing one — it catches real PII committed under
an innocuous filename, which the `path` rule alone would miss.

An address is **consumer** unless its domain is a known synthetic domain
(`example.com`, `test.local`, …), an RFC 2606 / 6761 reserved TLD
(`.test`, `.example`, `.invalid`, `.localhost`), a role mailbox (`noreply@…`),
a SQL `LIKE` pattern, or the company's own `boomcard.bg`. Domain matching is
**exact, never substring** — an earlier draft had `mail.com` on the safe list,
which substring-matched inside `gmail.com` and would have passed the very file
this gate exists to catch. `--selftest` pins that case and runs in CI.

Connection strings (`postgres://user:pass@host/db`) contain a `local@host` span
that looks exactly like an email. Those are suppressed by detecting the
`scheme://` prefix, not by blacklisting individual cloud host suffixes.

## Running it

```bash
npm run pii:scan            # whole tree
npm run pii:scan:staged     # staged files (what the pre-commit hook runs)
npm run pii:scan:selftest   # pin the classifier
node scripts/pii-scan.js --range origin/master...HEAD
```

## Where it runs

- **pre-commit** — `npm run hooks:install` once per clone (sets
  `core.hooksPath=.githooks`). Local, skippable, first line of defence.
- **CI** — `.github/workflows/pii-scan.yml`, on pull requests **and on direct
  pushes to `master`**. Master receives direct pushes today; that is how the
  snapshot arrived, so a PR-only check would not have caught it.

> **Not yet binding.** `master` currently has **no branch protection at all**.
> Until `pii-scan / scan` is added to the required status checks for `master`,
> this workflow reports but does not block. Doing so is a repo-settings change
> and is tracked as part of BC-QA-055.

## The baseline

`.pii-scan-allow.json` lists paths reviewed and judged clean, each with a
stated reason — mostly seed and demo fixtures full of invented venue business
contacts. It is a **path** list, not a pattern list: a new file under an
already-listed directory is still scanned, so the gate ratchets.

`subscribers-all-snapshot.md` is deliberately **not** in the baseline. The gate
keeps failing on it until the history purge lands.

## Bypass

```bash
PII_SCAN_BYPASS=1 git commit ...
```

Bypasses the local hook only — CI runs the same scan, so this defers a failure
rather than avoiding it. Never use it to ship real customer data.

## Adding a false positive to the baseline

1. Confirm it is genuinely not consumer data — for BoomCard, test the addresses
   against the production `User` table rather than eyeballing the shape.
2. If the domain is generically synthetic, add it to `SYNTHETIC_DOMAINS` in
   `scripts/pii-scan.js` so every file benefits.
3. Only if it is file-specific, add the path to `.pii-scan-allow.json` **with a
   reason**.
