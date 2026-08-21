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

echo
echo "passed: $PASS   failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
echo "ALL TESTS PASSED"
