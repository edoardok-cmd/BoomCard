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
# Usage:  ./scripts/test-link-claude-reviews.sh
# Exit:   0 all pass, 1 otherwise.

set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/link-claude-reviews.sh"
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
cat > "$WORK/c11/hook.sh" <<HOOK
rm -f '$H11/ZZ-ONLY-impl-r1.md'
HOOK
OUT="$(AGENTX_REVIEWS_DIR="$H11" LINK_REVIEWS_TEST_HOOK="$WORK/c11/hook.sh" \
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

echo
echo "passed: $PASS   failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
echo "ALL TESTS PASSED"
