#!/bin/bash

# BoomCard — Claude review-directory linker and leak detector
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
#   ./scripts/link-claude-reviews.sh          # create/repair the three symlinks
#   AGENTX_REVIEWS_DIR=/path/to/reviews ./scripts/link-claude-reviews.sh
#
# Exit codes:
#   0  all three links correct (idempotent no-op when already correct)
#   1  harness reviews dir not found, or an unexpected file is in the way
#   2  LEAK DETECTED - a real directory exists where a symlink belongs.
#      Nothing is modified; reconcile those files into the harness first.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Default is this machine's harness path; override with AGENTX_REVIEWS_DIR.
DEFAULT_REVIEWS_DIR="/Users/administrator/Documents/AI Projects/Agent X/.claude/reviews"
REVIEWS_DIR="${AGENTX_REVIEWS_DIR:-$DEFAULT_REVIEWS_DIR}"

# The three locations an agent might write a relative `.claude/reviews/` path from.
LINK_PATHS=(
  ".claude/reviews"
  "backend-api/.claude/reviews"
  "boomcard-mobile/.claude/reviews"
)

echo "BoomCard review-link bootstrap"
echo "  repo root:    $REPO_ROOT"
echo "  harness dir:  $REVIEWS_DIR"
if [ -n "${AGENTX_REVIEWS_DIR:-}" ]; then
  echo "                (from AGENTX_REVIEWS_DIR)"
else
  echo "                (built-in default; set AGENTX_REVIEWS_DIR to override)"
fi
echo

# Fail loudly rather than creating a dangling symlink.
if [ ! -d "$REVIEWS_DIR" ]; then
  echo "ERROR: harness reviews dir does not exist:" >&2
  echo "  $REVIEWS_DIR" >&2
  echo >&2
  echo "Refusing to create a dangling symlink. Set AGENTX_REVIEWS_DIR to the" >&2
  echo "Agent X harness reviews directory on this machine and re-run:" >&2
  echo "  AGENTX_REVIEWS_DIR=/path/to/'Agent X'/.claude/reviews $0" >&2
  exit 1
fi

created=0; repaired=0; ok=0
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
    # Wrong target, or a dangling link - repoint it.
    echo "  repair $rel"
    echo "           was -> $current"
    rm "$path"
    ln -s "$REVIEWS_DIR" "$path"
    repaired=$((repaired + 1))
    continue
  fi

  mkdir -p "$(dirname "$path")"
  ln -s "$REVIEWS_DIR" "$path"
  echo "  create $rel"
  created=$((created + 1))
done

echo
if [ ${#leaked[@]} -gt 0 ]; then
  echo "LEAK DETECTED - review files are being written outside the harness." >&2
  echo >&2
  echo "These paths are real directories, so agent review files written there are" >&2
  echo "invisible to finish-task.py, reconcile-task-status.py and the dashboard." >&2
  echo "Nothing was modified. Reconcile them into the harness BEFORE relinking," >&2
  echo "or the files are lost:" >&2
  echo >&2
  for entry in "${leaked[@]}"; do
    rel="${entry%%|*}"; count="${entry##*|}"
    echo "  # $rel ($count file(s))" >&2
    echo "  ls '$REPO_ROOT/$rel'                     # inspect" >&2
    echo "  cp -np '$REPO_ROOT/$rel/'*.md '$REVIEWS_DIR/'   # keep both; -n never overwrites" >&2
    echo "  # resolve any same-name-different-content collisions by hand, then:" >&2
    echo "  rm -rf '$REPO_ROOT/$rel' && '$0'" >&2
    echo >&2
  done
  echo "See CLAUDE.md ('Where review files go') for the full procedure." >&2
  exit 2
fi

echo "Summary: $ok already correct, $created created, $repaired repaired."
echo "All review writes under this repo now land in the harness reviews dir."
exit 0
