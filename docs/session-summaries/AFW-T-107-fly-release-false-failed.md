# AFW-T-107: `fly releases` misleading "failed" status on boomcard-api

**Status:** investigated, no fix applied (documented as a known edge case).

## Symptom

`fly releases -a boomcard-api` occasionally reports `Status: failed` for a release that actually
deployed cleanly — all machines end up on the correct image, health/DB checks pass, and no error
signal appears anywhere except this one status field.

Observed twice in a ~25-release window (roughly the CLI's default lookback; `fly releases` has no
pagination flag, so this is not a full-history claim):

| Version | CreatedAt | Status | Notes |
|---|---|---|---|
| v290 | 2026-07-20T20:41:32Z | `failed` | AFW-T-101 credential-rotation redeploy. Shares the exact same `ImageRef` as v289 (`deployment-01KY0E72NZ14QPT3FPTE8Q2EZ3`) — an **identical-image redeploy** ~1h45m after v289. |
| v279 | 2026-07-01T23:31:45Z | `failed` | Distinct `ImageRef` from its predecessor v280 — a genuine new-image deploy, unrelated to any credential-rotation work. |

Every other release in the window (v280–v303 as of 2026-08-20) shows `complete`, including many
where `fly status` currently shows `app`-group machines sitting `stopped` from routine
`auto_stop_machines` behavior — so ordinary post-deploy autostop does **not**, by itself, cause a
`failed` status. That rules out a generic "autostop race" as the mechanism.

## Root cause (v290) — identical-image redeploy

v290 was triggered by AFW-T-101 purely to roll rotated Neon credentials/env into running machines,
without a new image build — so its `ImageRef` is byte-identical to v289's. flyctl's release-status
convergence check appears to tally machines it expects to transition to a new
version/image against machines it actually observes transitioning. When the target image already
matches what's running, the expected-transition count can end up mismatched against the observed
(zero) transitions, and the deploy monitor times out waiting for a state change that was never
going to happen — reporting `failed` even though every machine was already correct.

This fits every signal AFW-T-101 gathered independently at the time: matching image digests across
all machines, clean autostop events (not crashes) in machine logs, a 0-failure Neon-side rotation,
and passing health/DB/runtime checks post-deploy.

**Confidence caveat:** this is inferred from a single correlated instance (the only
identical-image redeploy in the observed window is also the only one of that shape that failed).
It is plausible and consistent with all available evidence, but has not been confirmed by a
deliberate reproduction (a second identical-image redeploy). Reproducing it would mean issuing a
real redeploy against the live `boomcard-api` prod app purely to test a status-reporting theory —
that's an activation-gated action or a real deploy, so a reproduction attempt is deliberately not
included here. If this pattern recurs, this doc's theory should be reconfirmed.

## Root cause (v279) — undetermined

v279 was a genuine new-image deploy, not an identical-image redeploy, so it doesn't share v290's
mechanism. Fly's machine-event-log retention doesn't reach back to 2026-07-01 from this
investigation's vantage point (2026-08-20), and no contemporaneous health/digest evidence was
captured for it the way AFW-T-101 captured for v290. It's plausibly a separate instance of the same
broad "release-monitor false-failed" quirk class, but the specific trigger can't be pinned down with
currently available evidence.

## Why no fly.toml change

Two candidate config changes were considered and rejected as non-fixes for the identified
mechanism:

- **Raise `min_machines_running` to match machine count** — addresses autostop timing, which was
  ruled out as the cause.
- **Add an explicit `release_command`** (moving migrations out of the app process's start command)
  — shortens time-to-healthy, but doesn't touch the convergence-check's expected-vs-observed
  transition-count logic that an identical-image redeploy would still trip regardless.

Neither addresses the actual mechanism, so applying either would be a speculative change to shared
production deploy config. The mechanism, if the theory is correct, lives in flyctl/Fly platform
code, not this app's `fly.toml`.

## Guidance for future incident responders

If `fly releases` shows `failed` for a release that otherwise looks healthy, before treating it as
a real outage signal, check:

1. Do all machines share the same, correct image digest (`fly status` / `fly image show`)?
2. Do machine event logs show a clean autostop, not a crash, for any machine reported `stopped`?
3. **Was this release an identical-image redeploy** (compare its `ImageRef` in
   `fly releases -a boomcard-api -j` against the immediately preceding release)? If so, this
   known edge case is the leading explanation — don't page on it alone.
4. Do health endpoints / DB connectivity checks pass post-deploy?

If all four check out, the `failed` status can be treated as a reporting artifact rather than a
genuine failure.

## Follow-up

A deliberate reproduction test (a second identical-image redeploy against `boomcard-api`, observed
for the same false-`failed` pattern) would raise confidence in the v290 theory from "plausible,
single instance" to "confirmed," and a targeted look at whether v279 fits the same or a different
mechanism would close the remaining gap. Both require touching the live prod app's deploy pipeline
and are out of this investigation's bounded scope — filed as a follow-up (see task board).
