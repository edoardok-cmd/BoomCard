#!/bin/bash

# BoomCard — Claude review-directory linker, leak detector and reconciler
#
# Agent review files (`<task-id>-impl-r<N>.md`, `<task-id>-task-r<N>.md`, ...)
# must all live in ONE directory: the Agent X harness reviews dir. That is the
# only place the completion gates read from — `finish-task.py`,
# `reconcile-task-status.py` and the dashboard's `reviewIndex.ts`.
#
# Reviewer subagents `cd` into `backend-api/` or `boomcard-mobile/` to run tests,
# so a relative `.claude/reviews/` write from there lands in the SUBPROJECT, not
# the harness. Those files are then invisible to every verdict engine. That is
# exactly what happened before BC-QA-061: 80 review files (Jun 25 - Aug 10 2026)
# accumulated in `backend-api/.claude/reviews/` and `boomcard-mobile/.claude/
# reviews/` and were committed, because `.gitignore`'s `.claude/reviews` rule
# contains a slash and is therefore anchored to the repo ROOT only.
#
# The fix is a symlink at each of the three locations. The symlinks are absolute
# and machine-specific, so they are gitignored (`**/.claude/reviews`) and cannot
# be committed — this script is what recreates them in a fresh checkout, and
# what detects the leak if it ever re-opens.
#
# Usage:
#   ./scripts/link-claude-reviews.sh              # create/repair the symlinks
#   ./scripts/link-claude-reviews.sh --check      # verify only, create nothing
#   ./scripts/link-claude-reviews.sh --reconcile  # safely move leaked files to
#                                                 # the harness (never deletes)
#   AGENTX_REVIEWS_DIR=/path/to/reviews ./scripts/link-claude-reviews.sh
#
# Exit codes:
#   0  all three links correct (idempotent no-op when already correct)
#   1  usage error, or an unexpected object is in the way
#   2  LEAK DETECTED - a real directory exists where a symlink belongs, or
#      --reconcile left files that need a human decision. Never destructive.
#   3  harness reviews dir not found (distinct from 2 so a CI check can tell
#      "this machine has no harness" apart from "review files are leaking")
#   4  --check only: a link is missing or points somewhere else
#
# DATA-SAFETY RULE (BC-QA-061 F5). Leaked review files are frequently the ONLY
# copy of a review document, and same-name-different-content collisions are
# common: of the 80 files recovered by BC-QA-061, 21 collided by name with a
# DIFFERENT document already in the harness. So nothing here ever deletes or
# overwrites, `--reconcile` classifies every file (recursively, not just
# `*.md`) before copying anything, and the removal command is printed ONLY
# after every single file has been verified byte-identical in the harness.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELF="${BASH_SOURCE[0]}"

# Default is this machine's harness path; override with AGENTX_REVIEWS_DIR.
DEFAULT_REVIEWS_DIR="/Users/administrator/Documents/AI Projects/Agent X/.claude/reviews"
REVIEWS_DIR="${AGENTX_REVIEWS_DIR:-$DEFAULT_REVIEWS_DIR}"

# When the operator overrode the harness location, every command we PRINT must
# carry that override too - otherwise a pasted relink silently retargets the
# built-in default.
if [ -n "${AGENTX_REVIEWS_DIR:-}" ]; then
  ENVPFX="AGENTX_REVIEWS_DIR='$REVIEWS_DIR' "
else
  ENVPFX=""
fi

# The three locations an agent might write a relative `.claude/reviews/` path from.
LINK_PATHS=(
  ".claude/reviews"
  "backend-api/.claude/reviews"
  "boomcard-mobile/.claude/reviews"
)

MODE="link"
case "${1:-}" in
  "")           MODE="link" ;;
  --check)      MODE="check" ;;
  --reconcile)  MODE="reconcile" ;;
  -h|--help)    sed -n '3,45p' "$SELF"; exit 0 ;;
  *)            echo "ERROR: unknown argument '$1' (expected --check, --reconcile or nothing)" >&2; exit 1 ;;
esac

echo "BoomCard review-link bootstrap (mode: $MODE)"
echo "  repo root:    $REPO_ROOT"
echo "  harness dir:  $REVIEWS_DIR"
if [ -n "${AGENTX_REVIEWS_DIR:-}" ]; then
  echo "                (from AGENTX_REVIEWS_DIR)"
else
  echo "                (built-in default; set AGENTX_REVIEWS_DIR to override)"
fi
echo

# Fail loudly rather than creating a dangling symlink. Exit 3, not 1, so a CI
# check can distinguish "no harness on this machine" from "files are leaking".
if [ ! -d "$REVIEWS_DIR" ]; then
  echo "ERROR: harness reviews dir does not exist:" >&2
  echo "  $REVIEWS_DIR" >&2
  echo >&2
  echo "Refusing to create a dangling symlink. Set AGENTX_REVIEWS_DIR to the" >&2
  echo "Agent X harness reviews directory on this machine and re-run:" >&2
  echo "  AGENTX_REVIEWS_DIR=/path/to/'Agent X'/.claude/reviews $SELF" >&2
  exit 3
fi

# --- content index of the harness dir ---------------------------------------
# Classification is by CONTENT, not by name: a leaked file is "already
# represented" when a byte-identical copy exists ANYWHERE in the harness, under
# any name. That is what makes deletion provably safe, and it is what lets the
# operator converge — once they land a colliding document as `<base>-z.md`, the
# original is represented and stops being flagged. A name-only test would keep
# reporting it forever and the removal step could never be reached.
HASH_INDEX=""
# MUST end with an unconditional success. Under `set -e`, an EXIT trap whose
# last command fails overrides the script's exit status with 1 -- which would
# make every successful run look like a failure to a CI check.
cleanup_index() { [ -n "$HASH_INDEX" ] && rm -f "$HASH_INDEX"; return 0; }
trap cleanup_index EXIT

_sha() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else sha256sum "$1" | awk '{print $1}'; fi
}

build_hash_index() {
  [ -n "$HASH_INDEX" ] && return 0
  HASH_INDEX="$(mktemp)"
  while IFS= read -r -d '' h; do
    _sha "$h" >> "$HASH_INDEX"
  done < <(find "$REVIEWS_DIR" -maxdepth 1 -type f -print0)
}

content_present() { grep -qxF "$(_sha "$1")" "$HASH_INDEX"; }

# --- reconcile one leaked directory ----------------------------------------
# Classifies EVERY file under $1 (recursive), copies only the ones that cannot
# possibly lose data, and reports the rest. Never deletes, never overwrites.
# Sets RECONCILE_UNRESOLVED to the number of files still needing a decision.
RECONCILE_UNRESOLVED=0
reconcile_dir() {
  local dir="$1" rel_label="$2"
  local tmp; tmp="$(mktemp -d)"
  local copied=0 dup=0 collide=0 nested=0 total=0

  build_hash_index
  : > "$tmp/collide"; : > "$tmp/nested"; : > "$tmp/dup"; : > "$tmp/copied"

  while IFS= read -r -d '' f; do
    total=$((total + 1))
    local rel="${f#"$dir"/}"

    # Content already in the harness under SOME name -> safe to drop. Checked
    # first so a collision the operator has already landed as `-z` converges.
    if content_present "$f"; then
      printf '%s\n' "$rel" >> "$tmp/dup"; dup=$((dup + 1)); continue
    fi

    if [[ "$rel" == */* ]]; then
      # Nested. The harness reviews dir is FLAT and the gate parses basenames,
      # so flattening would change what the file means. Never automatic.
      printf '%s\n' "$rel" >> "$tmp/nested"; nested=$((nested + 1)); continue
    fi
    if [ ! -e "$REVIEWS_DIR/$rel" ]; then
      cp -p "$f" "$REVIEWS_DIR/$rel"
      if cmp -s "$f" "$REVIEWS_DIR/$rel"; then
        printf '%s\n' "$rel" >> "$tmp/copied"; copied=$((copied + 1))
        _sha "$f" >> "$HASH_INDEX"
      else
        echo "ERROR: copy of $rel did not verify byte-identical. Aborting." >&2
        rm -rf "$tmp"; exit 1
      fi
    else
      # Same basename, different content, and this content is nowhere in the
      # harness yet. Both documents matter.
      printf '%s\n' "$rel" >> "$tmp/collide"; collide=$((collide + 1))
    fi
  done < <(find "$dir" -type f -print0)

  echo "  $rel_label — $total file(s) examined (recursive):"
  echo "      $copied copied to the harness (no counterpart there)"
  echo "      $dup already present byte-identical in the harness (safe to drop)"
  echo "      $collide same name, DIFFERENT content (needs a decision)"
  echo "      $nested nested below the top level (needs a decision)"

  if [ "$collide" -gt 0 ]; then
    echo
    echo "    Same-name-different-document collisions — BOTH copies matter."
    echo "    Do NOT overwrite either side. Land the leaked copy under a name that"
    echo "    still parses to the same task and round by appending the '-z' shard"
    echo "    suffix, which pick_latest groups into the SAME round as its sibling"
    echo "    (verdicts then aggregate strictest-wins):"
    while IFS= read -r rel; do
      local base="${rel%.md}"
      if [ "$base" != "$rel" ]; then
        echo "      cp -p '$dir/$rel' '$REVIEWS_DIR/$base-z.md'"
      else
        echo "      cp -p '$dir/$rel' '$REVIEWS_DIR/$rel.boomcard-copy'   # not a review basename"
      fi
    done < "$tmp/collide"
    echo "    If a leaked copy is a LATEST round and reads clean but would trip a"
    echo "    scan its sibling is grandfathered out of, land it inert instead"
    echo "    (…-boomcard-copy.md) rather than demoting a task on a false signal."
  fi

  if [ "$nested" -gt 0 ]; then
    echo
    echo "    Nested files — the harness reviews dir is flat and the gate parses"
    echo "    basenames, so these need a deliberate destination:"
    while IFS= read -r rel; do
      echo "      $dir/$rel"
    done < "$tmp/nested"
  fi

  RECONCILE_UNRESOLVED=$((collide + nested))
  rm -rf "$tmp"
}

# --- verify a leaked directory is fully represented in the harness ----------
# Returns 0 only when EVERY file (recursive) has a byte-identical counterpart
# somewhere in the harness dir. This is the gate on printing any removal command.
fully_represented() {
  local dir="$1" missing=0
  build_hash_index
  while IFS= read -r -d '' f; do
    if ! content_present "$f"; then
      missing=$((missing + 1))
      echo "    NOT REPRESENTED: ${f#"$dir"/}" >&2
    fi
  done < <(find "$dir" -type f -print0)
  [ "$missing" -eq 0 ]
}

created=0; repaired=0; ok=0; wrong=0
leaked=()

for rel in "${LINK_PATHS[@]}"; do
  path="$REPO_ROOT/$rel"

  # A real directory here is the leak. Never clobber it - it may hold the only
  # copy of review files that no verdict engine can see.
  if [ -d "$path" ] && [ ! -L "$path" ]; then
    count=$(find "$path" -type f | wc -l | tr -d ' ')
    echo "  LEAK   $rel  (real directory, $count file(s))"
    leaked+=("$rel|$count")
    continue
  fi

  # Something that is neither a symlink nor a directory (e.g. a regular file).
  if [ -e "$path" ] && [ ! -L "$path" ]; then
    echo "ERROR: $rel exists and is not a symlink or directory. Refusing to touch it." >&2
    exit 1
  fi

  if [ -L "$path" ]; then
    current="$(readlink "$path")"
    if [ "$current" = "$REVIEWS_DIR" ]; then
      echo "  ok     $rel"
      ok=$((ok + 1))
      continue
    fi
    if [ "$MODE" = "check" ]; then
      echo "  WRONG  $rel  -> $current"
      wrong=$((wrong + 1))
      continue
    fi
    # Wrong target, or a dangling link - repoint it.
    echo "  repair $rel"
    echo "           was -> $current"
    rm "$path"
    ln -s "$REVIEWS_DIR" "$path"
    repaired=$((repaired + 1))
    continue
  fi

  if [ "$MODE" = "check" ]; then
    echo "  ABSENT $rel"
    wrong=$((wrong + 1))
    continue
  fi

  mkdir -p "$(dirname "$path")"
  ln -s "$REVIEWS_DIR" "$path"
  echo "  create $rel"
  created=$((created + 1))
done

echo

# --- leak handling ----------------------------------------------------------
if [ ${#leaked[@]} -gt 0 ]; then
  if [ "$MODE" = "reconcile" ]; then
    echo "RECONCILING - copying leaked files into the harness. Nothing is deleted."
    echo
    total_unresolved=0
    for entry in "${leaked[@]}"; do
      rel="${entry%%|*}"
      reconcile_dir "$REPO_ROOT/$rel" "$rel"
      total_unresolved=$((total_unresolved + RECONCILE_UNRESOLVED))
      echo
    done

    if [ "$total_unresolved" -gt 0 ]; then
      echo "$total_unresolved file(s) still need a decision (listed above)." >&2
      echo "NOT printing a removal command: following it now would destroy them." >&2
      echo "Resolve them, then re-run:  ${ENVPFX}$SELF --reconcile" >&2
      exit 2
    fi

    # Every file copied or already present. Verify byte-for-byte before saying so.
    all_ok=1
    for entry in "${leaked[@]}"; do
      rel="${entry%%|*}"
      if ! fully_represented "$REPO_ROOT/$rel"; then all_ok=0; fi
    done
    if [ "$all_ok" -ne 1 ]; then
      echo "Verification failed: some files are still not represented in the harness." >&2
      echo "NOT printing a removal command." >&2
      exit 2
    fi

    echo "VERIFIED: every leaked file now has a byte-identical counterpart in the"
    echo "harness. It is now safe to remove the leaked directories and relink:"
    echo
    for entry in "${leaked[@]}"; do
      rel="${entry%%|*}"
      echo "  rm -rf '$REPO_ROOT/$rel'"
    done
    echo "  ${ENVPFX}$SELF"
    exit 0
  fi

  # Detect-only reporting (default and --check modes).
  echo "LEAK DETECTED - review files are being written outside the harness." >&2
  echo >&2
  echo "These paths are real directories, so agent review files written there are" >&2
  echo "invisible to finish-task.py, reconcile-task-status.py and the dashboard." >&2
  echo "Nothing was modified." >&2
  echo >&2
  for entry in "${leaked[@]}"; do
    rel="${entry%%|*}"; count="${entry##*|}"
    echo "  $rel  ($count file(s), including any nested and non-.md files)" >&2
  done
  echo >&2
  echo "There is no safe one-line recipe: leaked files are often the only copy," >&2
  echo "and a same-name file already in the harness is frequently a DIFFERENT" >&2
  echo "document (21 of the 80 files recovered by BC-QA-061 were exactly that)." >&2
  echo "Any plain 'cp' either overwrites one side or silently skips it." >&2
  echo >&2
  echo "Run the reconciler instead. It classifies every file, copies only what" >&2
  echo "cannot lose data, never deletes, and prints the removal command only" >&2
  echo "once every file is verified present in the harness:" >&2
  echo >&2
  echo "  ${ENVPFX}$SELF --reconcile" >&2
  echo >&2
  echo "See CLAUDE.md ('Where review files go') for the full procedure." >&2
  exit 2
fi

if [ "$MODE" = "check" ]; then
  if [ "$wrong" -gt 0 ]; then
    echo "CHECK FAILED: $wrong link(s) missing or pointing elsewhere; $ok correct." >&2
    echo "Repair with:  ${ENVPFX}$SELF" >&2
    exit 4
  fi
  echo "CHECK PASSED: all ${#LINK_PATHS[@]} links point at the harness reviews dir."
  exit 0
fi

echo "Summary: $ok already correct, $created created, $repaired repaired."
echo "All review writes under this repo now land in the harness reviews dir."
exit 0
