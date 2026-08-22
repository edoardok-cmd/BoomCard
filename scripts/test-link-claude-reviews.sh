#!/bin/bash

# Tests for scripts/link-claude-reviews.sh
#
# That script is now this repo's only defence against the review-trail leak
# (BC-QA-061): the symlinks it manages are gitignored, so a regression here is
# invisible to `git status` and to every completion gate. These tests pin the
# behaviour that matters, above all the DATA-SAFETY rule -- following the
# script's printed output verbatim must never lose a review file.
#
# Fully self-contained: builds a throwaway repo and a throwaway harness under
# $TMPDIR for every case. Never touches the real repo or the real harness.
#
# Usage:  ./scripts/test-link-claude-reviews.sh          # cases + guard sweep
#         ./scripts/test-link-claude-reviews.sh --core   # cases only
# Exit:   0 all pass, 1 otherwise.
#
# `--core` exists so the guard sweep at the bottom can re-run the case suite
# against a MUTATED copy of the script without recursing into itself. The copy
# under test is selected with LINK_REVIEWS_SUITE_TARGET.

set -uo pipefail

CORE_ONLY=0
[ "${1:-}" = "--core" ] && CORE_ONLY=1

# Only the outermost invocation runs the marker-stripping self-check below; the
# nested run it spawns must not spawn another. Nothing else recurses: the sweep
# control and the per-guard mutant runs all use --core.
TOP_LEVEL=1
[ -n "${LINK_REVIEWS_SUITE_TARGET:-}" ] && TOP_LEVEL=0

SCRIPT="${LINK_REVIEWS_SUITE_TARGET:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/link-claude-reviews.sh}"
PASS=0; FAIL=0
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ok()   { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL  $1"; }
check() { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (expected $3, got $2)"; fi; }

# Build a fresh fake repo + fake harness. Echoes the repo root.
make_repo() {
  # NB: separate `local` statements - a single `local a=.. b="$a"` expands all
  # arguments before any assignment, so `$a` would be unset under `set -u`.
  local n="$1"
  local root="$WORK/$n/repo"
  local harn="$WORK/$n/harness"
  mkdir -p "$root/scripts" "$root/.claude" "$root/backend-api/.claude" \
           "$root/boomcard-mobile/.claude" "$harn"
  cp "$SCRIPT" "$root/scripts/"
  echo "$root"
}
harness_of() { echo "$WORK/$1/harness"; }

run() { # run <case> <args...> -> sets OUT and RC
  local n="$1"; shift
  OUT="$(AGENTX_REVIEWS_DIR="$(harness_of "$n")" "$WORK/$n/repo/scripts/link-claude-reviews.sh" "$@" 2>&1)"
  RC=$?
}

echo "test-link-claude-reviews.sh"
echo

# --- 1. creates all three links from nothing --------------------------------
make_repo c1 >/dev/null
run c1
check "creates three links from nothing" "$RC" "0"
for p in .claude/reviews backend-api/.claude/reviews boomcard-mobile/.claude/reviews; do
  [ -L "$WORK/c1/repo/$p" ] || bad "link not created: $p"
done

# --- 2. idempotent ----------------------------------------------------------
run c1
check "idempotent re-run" "$RC" "0"
case "$OUT" in *"3 already correct"*) ok "reports 3 already correct" ;;
               *) bad "expected '3 already correct'" ;; esac

# --- 3. repairs a wrong target ---------------------------------------------
rm "$WORK/c1/repo/boomcard-mobile/.claude/reviews"
ln -s /tmp "$WORK/c1/repo/boomcard-mobile/.claude/reviews"
run c1
check "repairs a wrong-target link" "$RC" "0"
[ "$(readlink "$WORK/c1/repo/boomcard-mobile/.claude/reviews")" = "$(harness_of c1)" ] \
  && ok "wrong target repointed" || bad "wrong target not repointed"

# --- 4. missing harness dir -> exit 3, no dangling link ---------------------
make_repo c4 >/dev/null
OUT="$(AGENTX_REVIEWS_DIR="$WORK/c4/nonexistent" "$WORK/c4/repo/scripts/link-claude-reviews.sh" 2>&1)"; RC=$?
check "missing harness dir exits 3" "$RC" "3"
[ -e "$WORK/c4/repo/backend-api/.claude/reviews" ] \
  && bad "created a link despite missing harness" || ok "no dangling link created"

# --- 5. --check does not create --------------------------------------------
make_repo c5 >/dev/null
run c5 --check
check "--check on unlinked repo exits 4" "$RC" "4"
[ -e "$WORK/c5/repo/backend-api/.claude/reviews" ] \
  && bad "--check created a link" || ok "--check created nothing"
run c5
run c5 --check
check "--check after linking exits 0" "$RC" "0"

# --- 6. leak detection is non-destructive and prints no rm -rf --------------
make_repo c6 >/dev/null
H6="$(harness_of c6)"; L6="$WORK/c6/repo/backend-api/.claude/reviews"
printf 'HARNESS VERSION\n' > "$H6/zz-sentinel.md"
mkdir -p "$L6/nested"
printf 'LEAKED VERSION - different content\n' > "$L6/zz-sentinel.md"   # name collision
printf 'unique\n'      > "$L6/ZZ-UNIQUE-impl-r1.md"
printf 'not markdown\n'> "$L6/ZZ-ledger.txt"                            # non-.md
printf 'nested\n'      > "$L6/nested/ZZ-NESTED-task-r1.md"              # nested
run c6
check "leak detected exits 2" "$RC" "2"
case "$OUT" in *"rm -rf"*) bad "printed a pasteable rm -rf before reconciling" ;;
               *) ok "no rm -rf printed on detect" ;; esac
case "$OUT" in *"4 file(s)"*) ok "counts all 4 files incl. nested and non-.md" ;;
               *) bad "did not count all 4 files" ;; esac
[ "$(find "$L6" -type f | wc -l | tr -d ' ')" = "4" ] \
  && ok "leak dir untouched by detection" || bad "detection modified the leak dir"

# --- 7. --reconcile is safe, converges, and loses nothing -------------------
# Snapshot every leaked file's content before touching anything.
find "$L6" -type f -exec shasum -a 256 {} \; | awk '{print $1}' | sort > "$WORK/c6-before.txt"

run c6 --reconcile
check "reconcile with unresolved items exits 2" "$RC" "2"
case "$OUT" in *"rm -rf"*) bad "printed rm -rf while items were unresolved" ;;
               *) ok "no rm -rf while unresolved" ;; esac
grep -q 'HARNESS VERSION' "$H6/zz-sentinel.md" \
  && ok "collision: harness copy not overwritten" || bad "harness copy was overwritten"
[ -f "$H6/ZZ-ledger.txt" ] && ok "non-.md file was transferred" || bad "non-.md file missed"

# Operator resolves the two flagged items exactly as the output instructs.
cp -p "$L6/zz-sentinel.md" "$H6/zz-sentinel-z.md"
cp -p "$L6/nested/ZZ-NESTED-task-r1.md" "$H6/ZZ-NESTED-task-r1.md"

run c6 --reconcile
check "reconcile converges to 0 once resolved" "$RC" "0"
case "$OUT" in *"rm -rf"*) ok "removal command printed only after verification" ;;
               *) bad "no removal command after full reconciliation" ;; esac

# Follow the printed removal verbatim, then prove nothing was lost.
rm -rf "$L6"
run c6
check "relink after removal" "$RC" "0"
find "$H6" -type f -exec shasum -a 256 {} \; | awk '{print $1}' | sort -u > "$WORK/c6-after.txt"
LOST="$(comm -23 "$WORK/c6-before.txt" "$WORK/c6-after.txt" | wc -l | tr -d ' ')"
check "ZERO files lost following printed output verbatim" "$LOST" "0"

# --- 8. a regular file in the way is refused --------------------------------
make_repo c8 >/dev/null
mkdir -p "$WORK/c8/repo/backend-api/.claude"
printf 'x\n' > "$WORK/c8/repo/backend-api/.claude/reviews"
run c8
check "regular file in the way exits 1" "$RC" "1"
[ -f "$WORK/c8/repo/backend-api/.claude/reviews" ] \
  && ok "regular file left intact" || bad "regular file was destroyed"

# --- 9. unknown argument ----------------------------------------------------
run c8 --bogus
check "unknown argument exits 1" "$RC" "1"

# --- 10. leak OUTSIDE the hardcoded LINK_PATHS is still detected ------------
# BC-QA-061-task-r1 F1: `.gitignore`'s `**/.claude/reviews` hides a stray dir
# from `git status` at EVERY level, so detection must not be a fixed list.
make_repo c10 >/dev/null
run c10                                     # establish the three links
mkdir -p "$WORK/c10/repo/partner-dashboard/.claude/reviews"
printf 'stray\n' > "$WORK/c10/repo/partner-dashboard/.claude/reviews/ZZ-FUTURE-LEAK-impl-r1.md"
run c10 --check
check "leak in an unlisted subproject fails --check" "$RC" "2"
case "$OUT" in *partner-dashboard*) ok "names the unlisted subproject" ;;
               *) bad "did not name the unlisted subproject" ;; esac
rm -rf "$WORK/c10/repo/partner-dashboard/.claude/reviews"
run c10 --check
check "--check exits 0 again once the stray is gone" "$RC" "0"

# --- 11. fully_represented() is load-bearing --------------------------------
# BC-QA-061-task-r1 F2: this is the last gate before the rm -rf recipe, and the
# only one that can catch a concurrent write to the shared harness between the
# copy phase and verification. Simulate exactly that via the test seam.
make_repo c11 >/dev/null
H11="$(harness_of c11)"; L11="$WORK/c11/repo/backend-api/.claude/reviews"
mkdir -p "$L11"
printf 'only copy of this review\n' > "$L11/ZZ-ONLY-impl-r1.md"
OUT="$(AGENTX_REVIEWS_DIR="$H11" \
       LINK_REVIEWS_TEST_ACTION=remove-harness-file \
       LINK_REVIEWS_TEST_ARG=ZZ-ONLY-impl-r1.md \
       "$WORK/c11/repo/scripts/link-claude-reviews.sh" --reconcile 2>&1)"; RC=$?
check "concurrent harness deletion blocks removal" "$RC" "2"
case "$OUT" in *"rm -rf"*) bad "printed rm -rf despite a missing harness copy" ;;
               *) ok "no rm -rf when a file is not represented" ;; esac
case "$OUT" in *"NOT REPRESENTED"*) ok "names the unrepresented file" ;;
               *) bad "did not report the unrepresented file" ;; esac
[ -f "$L11/ZZ-ONLY-impl-r1.md" ] && ok "leaked original still intact" \
                                 || bad "leaked original was destroyed"

# --- 12. rename advice matches the real gate grammar ------------------------
# BC-QA-061-task-r1 F3: `-z` preserves gate visibility ONLY if the resulting
# name parses. 7 of the 9 files BC-QA-061 routed to an inert copy were `.md`
# files the old code would have advised `-z` for.
make_repo c12 >/dev/null
H12="$(harness_of c12)"; L12="$WORK/c12/repo/backend-api/.claude/reviews"
mkdir -p "$L12"
printf 'harness A\n' > "$H12/BC-QA-023-task-r4.md"
printf 'leaked A\n'  > "$L12/BC-QA-023-task-r4.md"
printf 'harness B\n' > "$H12/BC-ADMIN-SPEC-REAUDIT-A-r1.md"
printf 'leaked B\n'  > "$L12/BC-ADMIN-SPEC-REAUDIT-A-r1.md"
run c12 --reconcile
case "$OUT" in *"BC-QA-023-task-r4-z.md"*) ok "gate-shaped name advised as -z shard" ;;
               *) bad "gate-shaped name not advised as -z" ;; esac
case "$OUT" in *"BC-ADMIN-SPEC-REAUDIT-A-r1-z.md"*)
                 bad "advised -z for a name the gate cannot parse" ;;
               *) ok "no -z advised for a non-gate-shaped name" ;; esac
case "$OUT" in *"BC-ADMIN-SPEC-REAUDIT-A-r1-boomcard-copy.md"*)
                 ok "non-gate-shaped name routed to an inert copy" ;;
               *) bad "non-gate-shaped name not routed to an inert copy" ;; esac

# --- 13. same basename in two leaked dirs gets distinct targets -------------
# BC-QA-061-task-r1 F4: identical targets meant pasting both overwrote the first.
make_repo c13 >/dev/null
H13="$(harness_of c13)"
mkdir -p "$WORK/c13/repo/backend-api/.claude/reviews" \
         "$WORK/c13/repo/boomcard-mobile/.claude/reviews"
printf 'harness\n' > "$H13/ZZ-X-impl-r1.md"
printf 'from backend\n' > "$WORK/c13/repo/backend-api/.claude/reviews/ZZ-X-impl-r1.md"
printf 'from mobile\n'  > "$WORK/c13/repo/boomcard-mobile/.claude/reviews/ZZ-X-impl-r1.md"
run c13 --reconcile
NTARGETS="$(printf '%s\n' "$OUT" | grep -c "$H13/ZZ-X-impl-r1-")"
NUNIQUE="$(printf '%s\n' "$OUT" | grep -o "ZZ-X-impl-r1-[a-z]\.md" | sort -u | wc -l | tr -d ' ')"
check "two dirs, same basename -> two targets" "$NTARGETS" "2"
check "those two targets are distinct" "$NUNIQUE" "2"

# --- 14. --help renders from the sentinel block -----------------------------
run c13 --help
check "--help exits 0" "$RC" "0"
case "$OUT" in *"Exit codes:"*) ok "--help includes the exit-code table" ;;
               *) bad "--help lost its content" ;; esac
case "$OUT" in *"set -euo"*) bad "--help spilled executable lines" ;;
               *) ok "--help contains no executable lines" ;; esac

# --- 15. the grammar check is against the TARGET, not the source ------------
# BC-QA-061-task-r2 F5(a). Source and target agree for most names, so this is
# the only shape that discriminates: an ALREADY-sharded source parses, but
# appending a second shard letter does not (the shard group takes ONE letter).
# Testing the source here - which is how round 1's fix text reads - would
# advise `-z-z` and land a gate-invisible document believing it visible.
make_repo c15 >/dev/null
H15="$(harness_of c15)"; L15="$WORK/c15/repo/backend-api/.claude/reviews"
mkdir -p "$L15"
printf 'harness shard\n' > "$H15/foo-task-r1-z.md"
printf 'leaked shard\n'  > "$L15/foo-task-r1-z.md"
run c15 --reconcile
case "$OUT" in *"foo-task-r1-z-z.md"*)
                 bad "advised -z-z for an already-sharded source" ;;
               *) ok "no -z-z advised for an already-sharded source" ;; esac
case "$OUT" in *"foo-task-r1-z-boomcard-copy.md"*)
                 ok "already-sharded source routed to an inert copy" ;;
               *) bad "already-sharded source not routed to an inert copy" ;; esac
case "$OUT" in *"already a shard"*) ok "explains WHY it is inert (not 'never a round')" ;;
               *) bad "gave the wrong reason for the inert landing" ;; esac

# --- 16. never propose a destination that already exists -------------------
# BC-QA-061-task-r2 F5(b). The printed command is a `cp`; a taken target is an
# instruction to overwrite a review file. Real case: the harness already holds
# BC-QA-023-task-r4-z.md, so a re-leak of BC-QA-023-task-r4.md hits this.
make_repo c16 >/dev/null
H16="$(harness_of c16)"; L16="$WORK/c16/repo/backend-api/.claude/reviews"
mkdir -p "$L16"
printf 'harness r4\n'       > "$H16/BC-QA-023-task-r4.md"
printf 'existing z shard\n' > "$H16/BC-QA-023-task-r4-z.md"   # -z slot taken
printf 'leaked r4\n'        > "$L16/BC-QA-023-task-r4.md"
run c16 --reconcile
case "$OUT" in *"BC-QA-023-task-r4-z.md'"*)
                 bad "proposed a target that already exists in the harness" ;;
               *) ok "did not propose an existing harness file as target" ;; esac
case "$OUT" in *"BC-QA-023-task-r4-y.md"*)
                 ok "walked to the next free shard letter" ;;
               *) bad "did not walk past the taken shard letter" ;; esac
grep -q 'existing z shard' "$H16/BC-QA-023-task-r4-z.md" \
  && ok "existing harness shard untouched" || bad "existing harness shard was modified"

# --- 17. a misdirected reviews SYMLINK outside LINK_PATHS is detected -------
# BC-QA-061-task-r2 F6: writes through it land outside the harness, but it is
# not -type d so leak discovery alone cannot see it.
make_repo c17 >/dev/null
run c17
mkdir -p "$WORK/c17/repo/partner-dashboard/.claude" "$WORK/c17/elsewhere"
ln -s "$WORK/c17/elsewhere" "$WORK/c17/repo/partner-dashboard/.claude/reviews"
run c17 --check
check "misdirected symlink fails --check" "$RC" "2"
case "$OUT" in *partner-dashboard*) ok "names the misdirected path" ;;
               *) bad "did not name the misdirected path" ;; esac
[ -L "$WORK/c17/repo/partner-dashboard/.claude/reviews" ] \
  && ok "misdirected symlink not silently repointed" \
  || bad "misdirected symlink was repointed, orphaning its target"

# --- 18. concurrent REPLACEMENT (not just deletion) also blocks removal -----
make_repo c18 >/dev/null
H18="$(harness_of c18)"; L18="$WORK/c18/repo/backend-api/.claude/reviews"
mkdir -p "$L18"
printf 'only copy\n' > "$L18/ZZ-REPL-impl-r1.md"
OUT="$(AGENTX_REVIEWS_DIR="$H18" \
       LINK_REVIEWS_TEST_ACTION=corrupt-harness-file \
       LINK_REVIEWS_TEST_ARG=ZZ-REPL-impl-r1.md \
       "$WORK/c18/repo/scripts/link-claude-reviews.sh" --reconcile 2>&1)"; RC=$?
check "concurrent harness replacement blocks removal" "$RC" "2"
case "$OUT" in *"rm -rf"*) bad "printed rm -rf despite replaced harness content" ;;
               *) ok "no rm -rf when harness content was replaced" ;; esac

# --- 19. the INERT branch must not overwrite an existing harness file -------
# BC-QA-061-task-r3 F9, same class as F5b but the other branch. Reachable: the
# harness holds several `-boomcard-copy.md` files already.
make_repo c19 >/dev/null
H19="$(harness_of c19)"; L19="$WORK/c19/repo/backend-api/.claude/reviews"
mkdir -p "$L19"
printf 'harness per-area\n'  > "$H19/BC-ADMIN-SPEC-REAUDIT-A-r1.md"
printf 'existing inert\n'    > "$H19/BC-ADMIN-SPEC-REAUDIT-A-r1-boomcard-copy.md"
printf 'leaked per-area\n'   > "$L19/BC-ADMIN-SPEC-REAUDIT-A-r1.md"
run c19 --reconcile
case "$OUT" in *"BC-ADMIN-SPEC-REAUDIT-A-r1-boomcard-copy.md'"*)
       bad "inert target does not overwrite an existing harness file" ;;
     *) ok "inert target does not overwrite an existing harness file" ;; esac
case "$OUT" in *"BC-ADMIN-SPEC-REAUDIT-A-r1-boomcard-copy-1.md"*)
       ok "inert branch walks to the next free suffix" ;;
     *) bad "inert branch walks to the next free suffix" ;; esac
grep -q 'existing inert' "$H19/BC-ADMIN-SPEC-REAUDIT-A-r1-boomcard-copy.md" \
  && ok "existing inert copy untouched" || bad "existing inert copy was modified"

# --- 20. inert targets are distinct across two leaked dirs ------------------
make_repo c20 >/dev/null
H20="$(harness_of c20)"
mkdir -p "$WORK/c20/repo/backend-api/.claude/reviews" \
         "$WORK/c20/repo/boomcard-mobile/.claude/reviews"
printf 'harness\n' > "$H20/ZZ-AREA-A-r1.md"
printf 'backend\n' > "$WORK/c20/repo/backend-api/.claude/reviews/ZZ-AREA-A-r1.md"
printf 'mobile\n'  > "$WORK/c20/repo/boomcard-mobile/.claude/reviews/ZZ-AREA-A-r1.md"
run c20 --reconcile
NIN="$(printf '%s\n' "$OUT" | grep -o 'ZZ-AREA-A-r1-boomcard-copy[^ ]*\.md' | sort -u | wc -l | tr -d ' ')"
check "inert targets are distinct across two leaked dirs" "$NIN" "2"

# --- 21. a RELATIVE link that resolves to the harness is not a leak ---------
# BC-QA-061-task-r3 F10(a): comparing link TEXT reported this as misdirected
# and exited 2, a false positive in the check recommended for CI.
make_repo c21 >/dev/null
run c21
mkdir -p "$WORK/c21/repo/partner-dashboard/.claude"
( cd "$WORK/c21/repo/partner-dashboard/.claude" \
  && ln -s ../../../harness reviews )
run c21 --check
check "relative link resolving to the harness is accepted" "$RC" "0"
case "$OUT" in *MISDIRECTED*) bad "false MISDIRECTED on a relative link" ;;
               *) ok "no false MISDIRECTED on a relative link" ;; esac

# --- 22. --reconcile must not report success while a link is misdirected ----
# BC-QA-061-task-r3 F10(c): it used to exit 0 after reconciling a directory
# leak even with a misdirected symlink still present.
make_repo c22 >/dev/null
H22="$(harness_of c22)"
mkdir -p "$WORK/c22/repo/backend-api/.claude/reviews" \
         "$WORK/c22/repo/partner-dashboard/.claude" "$WORK/c22/elsewhere"
printf 'unique\n' > "$WORK/c22/repo/backend-api/.claude/reviews/ZZ-OK-impl-r1.md"
ln -s "$WORK/c22/elsewhere" "$WORK/c22/repo/partner-dashboard/.claude/reviews"
run c22 --reconcile
check "reconcile does not exit 0 while a link is misdirected" "$RC" "2"
case "$OUT" in *MISDIRECTED*) ok "reconcile reports the misdirected link" ;;
               *) bad "reconcile did not report the misdirected link" ;; esac

# --- 23. a non-.md file is never renamed INTO a gate-parseable round --------
# Found by the guard sweep itself (guard `shard-branch-requires-md` reported
# not-load-bearing). The shard branch is gated on the name ending in `.md`.
# Without that gate, an extensionless `foo-task-r1` would be proposed as
# `foo-task-r1-z.md` -- inventing a review round out of a file that never was
# one, and landing it gate-visible. With it, the file lands inert.
make_repo c23 >/dev/null
H23="$(harness_of c23)"; L23="$WORK/c23/repo/backend-api/.claude/reviews"
mkdir -p "$L23"
printf 'harness\n' > "$H23/foo-task-r1"
printf 'leaked\n'  > "$L23/foo-task-r1"
run c23 --reconcile
case "$OUT" in *"foo-task-r1-z.md"*)
       bad "non-.md file renamed into a gate-parseable round" ;;
     *) ok "non-.md file not renamed into a gate-parseable round" ;; esac
case "$OUT" in *"foo-task-r1.boomcard-copy"*)
       ok "non-.md collision lands inert" ;;
     *) bad "non-.md collision did not land inert" ;; esac

# --- 24. F10(a) at the MANAGED-path site -----------------------------------
# Pinned at discover_misdirected already; this is the other comparison site.
# Pre-fix a relative managed link exited 4 from --check.
make_repo c24 >/dev/null
run c24
rm "$WORK/c24/repo/backend-api/.claude/reviews"
( cd "$WORK/c24/repo/backend-api/.claude" && ln -s ../../../harness reviews )
run c24 --check
check "relative MANAGED link resolving to the harness is accepted" "$RC" "0"

# --- 25. F10(c) in default (link) mode -------------------------------------
# Pinned for --check and --reconcile; this is the third success exit.
make_repo c25 >/dev/null
run c25
mkdir -p "$WORK/c25/repo/partner-dashboard/.claude" "$WORK/c25/elsewhere"
ln -s "$WORK/c25/elsewhere" "$WORK/c25/repo/partner-dashboard/.claude/reviews"
run c25
check "default mode does not exit 0 while a link is misdirected" "$RC" "2"

echo
echo "passed: $PASS   failed: $FAIL"

# --- Guard sweep ------------------------------------------------------------
# Closes the recurring finding-class behind F5a, F5b and F9: a safety guard in
# propose_target() that is behaviourally correct but that no test would notice
# the removal of. Three consecutive review rounds each found one more.
#
# WHAT THIS GUARANTEES. Every guard carrying a `GUARD:<id>` marker in
# propose_target() is mutated out, one at a time, and the whole --core suite is
# re-run against the mutated copy. If the suite still passes, that guard is not
# load-bearing in any test and the sweep FAILS, naming it. So a guard added
# tomorrow WITH a marker but WITHOUT a test turns this red by construction --
# no fourth hand-written finding required.
#
# WHAT IT DOES NOT GUARANTEE. It cannot see a guard added WITHOUT a marker.
# That gap is PARTLY covered by a deliberately dumb tripwire: the number of
# conditional constructs in the function is asserted against a recorded count,
# so an added conditional IN A RECOGNISED SHAPE -- marked or not -- turns the
# suite red and forces the author to either mark it (and get it swept) or bump
# the count knowing what they are opting out of.
#
# "Recognised shape" is exactly: `if` / `[` / `[[` / `test` tests, and the
# `cmd && continue|return|break|exit` / `cmd || ...` early-exit form. Anything
# else STILL ESCAPES SILENTLY -- a `case` statement, a `while` condition, a
# guard hidden inside a helper this function calls, or an early exit written
# with a bare `if` on the next line. Do not read the tripwire as "any new
# conditional is caught"; an earlier version of this comment said that, and it
# was false for the `&& continue` shape that 4 of the 6 shipped guards use
# (BC-QA-061-task-r4 F14). The tripwire is a change-detector over a known set
# of shapes, not semantic coverage: it proves someone looked, not that the new
# guard is tested.
#
# Why not the alternatives: a fixed table of mutants does not close the class
# (a fourth guard is simply absent from the table and nothing goes red); and a
# purely structural "every `[ ... ]` is exercised" check cannot distinguish a
# safety guard from name-selection or initialisation logic in the same
# function, so it would either miss guards or flag non-guards forever.
#
# TO ADD A GUARD: put `# GUARD:<id>` at the end of its line, add a test that
# fails without it, and bump EXPECTED_CONDITIONALS below.
if [ "$CORE_ONLY" -eq 0 ]; then
  echo
  echo "guard sweep (each guard mutated out; suite must go red)"
  EXPECTED_CONDITIONALS=9   # recount with the sweep after any edit; see "TO ADD A GUARD"

  fn_body() { sed -n '/^propose_target() {/,/^}/p' "$SCRIPT"; }

  GUARD_IDS="$(fn_body | grep -oE '# GUARD:[a-z-]+' | sed 's/# GUARD://')"
  NGUARDS="$(printf '%s\n' "$GUARD_IDS" | grep -c . || true)"
  if [ "$NGUARDS" -eq 0 ]; then
    # MUST be bad(), not a bare echo. With `echo` the sweep reported its own
    # disablement and the suite still exited 0 - the same failure mode as the
    # vacuous-mutant bug, one level up. Pinned by "sweep self-check fails the
    # suite when all markers are stripped".
    bad "no GUARD: markers found - the sweep is not actually sweeping"
  fi

  # Comments are removed first (whole-line and trailing), so a comment
  # containing " if " cannot move the count. Recognised shapes are the ones the
  # guards in this function actually use: `if`/`[`/`[[` tests, and the
  # `cmd && continue` / `cmd || continue` early-exit form, which is how 4 of the
  # 6 shipped guards are written and which the previous regex never matched.
  NCOND="$(fn_body \
    | sed -e '/^[[:space:]]*#/d' -e 's/[[:space:]]#[^{].*$//' \
    | grep -cE '(^|[[:space:];])(if |\[ |\[\[ |test )|(\|\||&&)[[:space:]]+(continue|return|break|exit)' \
    || true)"
  if [ "$NCOND" = "$EXPECTED_CONDITIONALS" ]; then
    ok "guard tripwire: $NCOND conditional constructs, as recorded"
  else
    bad "guard tripwire: $NCOND conditional constructs, expected $EXPECTED_CONDITIONALS (mark any new guard and bump EXPECTED_CONDITIONALS)"
  fi

  # CONTROL: the sweep is only meaningful if an UNMUTATED copy, run through the
  # exact same machinery, PASSES. Without this the sweep is vacuous -- an early
  # version wrote mutants as `mutant-<id>.sh`, but make_repo/run() invoke
  # `link-claude-reviews.sh` by name, so every mutant died with 127 and every
  # guard was reported load-bearing regardless of whether it was.
  mkdir -p "$WORK/control"
  cp "$SCRIPT" "$WORK/control/link-claude-reviews.sh"
  chmod +x "$WORK/control/link-claude-reviews.sh"
  if LINK_REVIEWS_SUITE_TARGET="$WORK/control/link-claude-reviews.sh" \
       bash "${BASH_SOURCE[0]}" --core >/dev/null 2>&1; then
    ok "sweep control: unmutated copy passes (sweep is not vacuous)"
  else
    bad "sweep control: unmutated copy FAILS - every 'load-bearing' result below is meaningless"
  fi

  # F13: the one sweep branch the sweep cannot exercise on itself. Strip every
  # marker (leaving all guard LOGIC intact) and require the suite to FAIL. It
  # used to print "FAIL no GUARD: markers found" via a bare echo and then exit
  # 0 -- the mechanism reporting its own disablement and passing anyway.
  if [ "$TOP_LEVEL" -eq 1 ]; then
    mkdir -p "$WORK/nomarkers"
    sed 's/[[:space:]]*# GUARD:[a-z-]*$//' "$SCRIPT" \
      > "$WORK/nomarkers/link-claude-reviews.sh"
    chmod +x "$WORK/nomarkers/link-claude-reviews.sh"
    if LINK_REVIEWS_SUITE_TARGET="$WORK/nomarkers/link-claude-reviews.sh" \
         bash "${BASH_SOURCE[0]}" >/dev/null 2>&1; then
      bad "sweep self-check: all markers stripped and the suite still exits 0"
    else
      ok "sweep self-check fails the suite when all markers are stripped"
    fi
  fi

  for gid in $GUARD_IDS; do
    mkdir -p "$WORK/mut-$gid"
    MUT="$WORK/mut-$gid/link-claude-reviews.sh"
    # Two generic mutations, chosen by the guard line's own shape:
    #   `... || continue` / `... && continue`  -> delete the line
    #   `if <cond>; then`                      -> replace <cond> with `true`
    awk -v id="$gid" '
      $0 ~ ("# GUARD:" id "$") {
        if ($0 ~ /(\|\||&&)[[:space:]]+continue/) { next }
        if ($0 ~ /^[[:space:]]*if .*; then/) {
          sub(/if .*; then/, "if true; then"); print; next
        }
        print "### UNMUTATABLE GUARD SHAPE"; print; next
      }
      { print }
    ' "$SCRIPT" > "$MUT"
    chmod +x "$MUT"
    if grep -q '^### UNMUTATABLE GUARD SHAPE' "$MUT"; then
      bad "guard '$gid' has a shape the sweep cannot mutate - extend the sweep"
      continue
    fi
    if cmp -s "$MUT" "$SCRIPT"; then
      bad "guard '$gid' mutation was a no-op - marker is not on the guard line"
      continue
    fi
    if LINK_REVIEWS_SUITE_TARGET="$MUT" bash "${BASH_SOURCE[0]}" --core >/dev/null 2>&1; then
      bad "guard '$gid' is NOT load-bearing: suite still passes without it"
    else
      ok "guard '$gid' is load-bearing (suite goes red without it)"
    fi
  done

  echo
  echo "passed: $PASS   failed: $FAIL   (guards swept: $NGUARDS)"
fi

[ "$FAIL" -eq 0 ] || exit 1
echo "ALL TESTS PASSED"
