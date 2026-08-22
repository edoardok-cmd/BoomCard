#!/bin/bash
# >>> HELP START (the --help branch prints between these sentinels)
#
# BoomCard — Claude review-directory linker, leak detector and reconciler
#
# Agent review files (`<task-id>-impl-r<N>.md`, `<task-id>-task-r<N>.md`, ...)
# must all live in ONE directory: the Agent X harness reviews dir. That is the
# only place the completion gates read from — `finish-task.py`,
# `reconcile-task-status.py` and the dashboard's `reviewIndex.ts`.
#
# Reviewer subagents `cd` into a subproject to run tests, so a relative
# `.claude/reviews/` write from there lands in the SUBPROJECT, not the harness.
# Those files are then invisible to every verdict engine. That is exactly what
# happened before BC-QA-061: 80 review files (Jun 25 - Aug 10 2026) accumulated
# in `backend-api/.claude/reviews/` and `boomcard-mobile/.claude/reviews/` and
# were committed, because `.gitignore`'s `.claude/reviews` rule contains a slash
# and is therefore anchored to the repo ROOT only.
#
# The fix is a symlink at each location. The symlinks are absolute and
# machine-specific, so they are gitignored (`**/.claude/reviews`) and cannot be
# committed — this script recreates them in a fresh checkout and detects the
# leak if it re-opens.
#
# Usage:
#   ./scripts/link-claude-reviews.sh              # create/repair the symlinks
#   ./scripts/link-claude-reviews.sh --check      # verify only, create nothing
#   ./scripts/link-claude-reviews.sh --reconcile  # safely move leaked files to
#                                                 # the harness (never deletes)
#   AGENTX_REVIEWS_DIR=/path/to/reviews ./scripts/link-claude-reviews.sh
#
# Exit codes:
#   0  all links correct and no leak anywhere (idempotent no-op when correct)
#   1  usage error, or an unexpected object is in the way
#   2  LEAK DETECTED - a real `.claude/reviews` directory exists somewhere in
#      the repo, or a `.claude/reviews` symlink outside the managed set points
#      somewhere other than the harness, or --reconcile left files needing a
#      human decision. Never destructive.
#   3  harness reviews dir not found (distinct from 2 so a CI check can tell
#      "this machine has no harness" apart from "review files are leaking")
#   4  --check only: a managed link is missing or points somewhere else
#
# DETECTION IS REPO-WIDE, NOT A FIXED LIST (BC-QA-061-task-r1 F1). `.gitignore`
# now ignores `**/.claude/reviews` at EVERY nesting level, which removed the
# `git status` signal that made the original leak discoverable at all. So a
# hardcoded list of link paths would leave every other subproject strictly
# worse off than before. Leak DETECTION therefore scans the whole repo for real
# `.claude/reviews` directories; only LINK_PATHS below are auto-CREATED.
#
# DATA-SAFETY RULE (BC-QA-061-impl-r2 F5). Leaked review files are frequently
# the ONLY copy of a review document, and same-name-different-content
# collisions are common: of the 80 files recovered by BC-QA-061, 21 collided by
# name with a DIFFERENT document already in the harness. So nothing here ever
# deletes or overwrites, `--reconcile` classifies every file (recursively, not
# just `*.md`) before copying anything, and the removal command is printed ONLY
# after every single file has been verified byte-identical in the harness.
#
# <<< HELP END

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

# Locations that are auto-CREATED when absent: the repo root plus the
# subprojects agents actually cd into. Leak DETECTION is not limited to these
# (see discover_leaks) - a real reviews dir anywhere in the repo is a leak.
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
  -h|--help)    sed -n '/^# >>> HELP START/,/^# <<< HELP END/p' "$SELF" \
                  | sed -e '1d' -e '$d' -e 's/^# \{0,1\}//'; exit 0 ;;
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

# --- repo-wide leak discovery ----------------------------------------------
# A correctly-linked path is a SYMLINK, so `-type d` matches only real
# directories, i.e. exactly the leak set. `find` does not follow symlinks
# without -L, so this never descends into the harness itself. Prunes the usual
# heavy/irrelevant trees so --check stays fast enough for CI (~0.1s on this
# repo). Prints repo-relative paths, NUL-separated.
_find_reviews_paths() {  # $1 = find -type argument (d or l)
  find "$REPO_ROOT" \
    \( -name node_modules -o -name .git -o -name dist -o -name build \
       -o -name .next -o -name coverage -o -name vendor -o -name .venv \
       -o -name __pycache__ -o -name .terraform \) -prune -o \
    -type "$1" -path '*/.claude/reviews' -print0 2>/dev/null \
  | while IFS= read -r -d '' p; do printf '%s\0' "${p#"$REPO_ROOT"/}"; done
}

discover_leaks() { _find_reviews_paths d; }

# F6: a `.claude/reviews` SYMLINK that points somewhere other than the harness
# is just as much a leak - writes through it land outside the harness - but it
# is not `-type d`, so leak discovery cannot see it. Paths in LINK_PATHS are
# excluded here because the main loop already repairs those; this covers every
# OTHER location, where we only report (repointing could silently orphan files
# already written to the wrong target).
#
# F10(a): compare RESOLVED PHYSICAL paths, not link text. A relative symlink
# (`../../.claude/reviews`) or one crossing another symlinked parent can point
# at the harness while its readlink output differs from $REVIEWS_DIR verbatim.
# Comparing the raw text reported such a link as misdirected and exited 2 -- a
# false "writes land outside the harness" in the check recommended for CI.
_physical() {  # physical path of $1, or empty if it cannot be resolved
  ( cd "$1" 2>/dev/null && pwd -P ) || true
}
HARNESS_PHYS="$(_physical "$REVIEWS_DIR")"

discover_misdirected() {
  local phys
  while IFS= read -r -d '' rel; do
    phys="$(_physical "$REPO_ROOT/$rel")"
    # Empty phys = dangling or unreadable link; that is misdirected too.
    [ -n "$phys" ] && [ "$phys" = "$HARNESS_PHYS" ] && continue
    local known=1 k
    for k in "${LINK_PATHS[@]}"; do [ "$k" = "$rel" ] && known=0 && break; done
    [ "$known" -eq 0 ] && continue
    local shown; shown=$(cd "$REPO_ROOT" && readlink "$rel" 2>/dev/null || true)
    printf '%s\0' "$rel|${shown:-<unreadable>}"
  done < <(_find_reviews_paths l)
}

# --- gate grammar ----------------------------------------------------------
# Mirrors NAME_RE and REAUDIT_NAME_RE in the Agent X harness:
#   scripts/finish-task.py                        (authoritative)
#   dashboard/api/src/services/reviewIndex.ts     (must agree with it)
# Those are the copies that actually gate task completion; this is a read-only
# shell approximation used ONLY to decide which rename to RECOMMEND. If they
# drift, the worst case here is bad advice in the printed recipe, never a wrong
# gate outcome - the gate never consults this file. Re-check against
# finish-task.py if a rename recipe ever looks wrong.
#   NAME_RE:         <task>[-audit-r<N>]-(impl|task)-r<N>[<letters>][-<shard>].md
#   REAUDIT_NAME_RE: <task>-reaudit-r<N>[<letters>][-<shard>].md
# where <shard> is a SINGLE letter plus optional digits.
gate_parseable() {
  local n="$1"
  shopt -s nocasematch
  local rc=1
  if [[ "$n" =~ -(impl|task)-r[0-9]+[a-z]*(-[a-z][0-9]*)?\.md$ ]] \
  || [[ "$n" =~ -reaudit-r[0-9]+[a-z]*(-[a-z][0-9]*)?\.md$ ]]; then
    rc=0
  fi
  shopt -u nocasematch
  return $rc
}

# --- content index of the harness dir ---------------------------------------
# Classification is by CONTENT, not by name: a leaked file is "already
# represented" when a byte-identical copy exists ANYWHERE in the harness, under
# any name. That is what makes deletion provably safe, and it is what lets the
# operator converge - once they land a colliding document as `<base>-z.md`, the
# original is represented and stops being flagged. A name-only test would keep
# reporting it forever and the removal step could never be reached.
HASH_INDEX=""
# MUST NOT let its own last command decide the script's exit status. Under
# `set -e` an EXIT trap whose last command fails overrides the status with 1,
# which would make every successful run look like a failure to a CI check. This
# one therefore captures the real status first and re-exits with it explicitly.
# (An earlier version ended in `return 0`, which avoided the override but also
# discarded any status the trap itself might have clobbered.)
#
# KNOWN LIMITATION (BC-QA-061-task-r2 F7) - this does NOT fix the `set -u` case
# on /bin/bash 3.2, the system bash on macOS. Measured there:
#     explicit `exit 2`           -> trap sees 2   (correct)
#     `set -e` command failure    -> trap sees 1   (correct)
#     `set -u` unbound-var abort  -> trap sees 0   (WRONG - masked by 3.2)
# The masking happens before any handler runs, so no `$?` capture can recover
# it; `local` is not the culprit (a plain `rc=$?` behaves identically). bash
# 5.3.9 does not have the bug at all, with or without the capture. A real fix
# means running under bash >= 4 (shebang change) or restructuring the body into
# a subshell - both larger than this, and deliberately not done here. Net
# effect while it stands: a `set -u` abort can report exit 0, i.e. "no leak"
# over a crashed run. The test suite does catch the class: injecting an unbound
# variable here turned 8 of the 51 cases red when measured on 2026-08-22. Treat
# that figure as a dated observation, not an invariant - it moves with the suite.
cleanup_tmp() {
  local rc=$?
  [ -n "$HASH_INDEX" ] && rm -f "$HASH_INDEX"
  [ -n "${PROPOSED:-}" ] && rm -f "$PROPOSED"
  exit "$rc"
}
trap cleanup_tmp EXIT

_sha() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else sha256sum "$1" | awk '{print $1}'; fi
}

# build_hash_index [--force]. `--force` re-reads the harness from disk. The
# verification pass MUST force: the harness is shared and concurrently written
# (the reconcile hook and other agents' review saves land there), so a stale
# snapshot would let a file removed or replaced mid-run still look present.
build_hash_index() {
  if [ "${1:-}" = "--force" ]; then rm -f "$HASH_INDEX"; HASH_INDEX=""; fi
  [ -n "$HASH_INDEX" ] && return 0
  HASH_INDEX="$(mktemp)"
  while IFS= read -r -d '' h; do
    _sha "$h" >> "$HASH_INDEX"
  done < <(find "$REVIEWS_DIR" -maxdepth 1 -type f -print0)
  return 0
}

content_present() { grep -qxF "$(_sha "$1")" "$HASH_INDEX"; }

# --- rename proposal --------------------------------------------------------
# Picks a landing name for a leaked document that collides by name with a
# DIFFERENT harness document. Two constraints the naive `<base>-z.md` misses:
#   * `-z` preserves gate visibility ONLY when the resulting name still parses
#     under the gate grammar. `BC-ADMIN-SPEC-REAUDIT-A-r1-z.md` parses under
#     neither regex - 7 of the 9 files BC-QA-061 itself routed to an inert copy
#     were exactly that shape (BC-QA-061-task-r1 F3).
#   * Two leaked directories holding the same basename must not be handed the
#     same target, or pasting both overwrites the first (F4). PROPOSED tracks
#     every name already handed out in this run.
# Sets PROPOSED_TARGET rather than echoing, so it runs in THIS shell: a
# command substitution would put PROPOSED (the cross-directory dedup ledger)
# in a subshell and every call would start from an empty one, reinstating F4.
PROPOSED=""
PROPOSED_TARGET=""
propose_target() {
  # NB: separate `local` statements - a single `local a=.. b="${a%...}"`
  # expands every argument before any assignment, so `$a` is unset there and
  # `set -u` aborts the function. That failure is silent inside a `while read`
  # loop and made every collision fall through to the inert branch.
  local src_base="$1"
  local base="${src_base%.md}"
  local cand L
  [ -n "$PROPOSED" ] || PROPOSED="$(mktemp)"
  # Every safety guard below carries a trailing `GUARD:<id>` marker (written as
  # a comment on the guard's own line). The guard sweep in
  # test-link-claude-reviews.sh enumerates those markers from this file, refuses
  # to pass if any is unregistered, and proves each one load-bearing by mutating
  # it and requiring the suite to go red. Adding a guard here without registering
  # it turns the suite red by construction. See "Guard sweep" in that file.
  if [ "$base" != "$src_base" ]; then   # GUARD:shard-branch-requires-md
    for L in z y x w v u t s r q; do
      cand="$base-$L.md"
      # DO NOT "correct" this to `gate_parseable "$src_base"`. The question is
      # not whether the SOURCE parses -- it is whether the name we are about to
      # hand the operator parses. The two diverge exactly when the source is
      # ALREADY a shard: `foo-task-r1-z.md` parses, but `foo-task-r1-z-z.md`
      # does not (NAME_RE's shard group takes a SINGLE letter). Testing the
      # source there would advise `-z-z` and the operator would land a
      # gate-invisible document believing it visible -- F3's exact failure mode,
      # on a shape this repo's review trail contains several of (a cross-repo
      # count, not checkable from here). Round 1's fix text said "test the
      # basename", which reads like the source; it is the target.
      # Pinned by: "no -z-z advised for an already-sharded source".
      gate_parseable "$cand" || continue   # GUARD:shard-target-must-parse
      # Never propose a destination that already exists: the printed command is
      # a `cp`, so a taken name is an instruction to overwrite a review file --
      # the one thing the DATA-SAFETY RULE promises never to happen. Walks to
      # the next letter instead.
      # Pinned by: "did not propose an existing harness file as target".
      [ -e "$REVIEWS_DIR/$cand" ] && continue   # GUARD:shard-target-free-in-harness
      # Same name must not be handed out twice in one run (two leaked dirs
      # holding the same basename). Pinned by: "those two targets are distinct".
      grep -qxF "$cand" "$PROPOSED" && continue   # GUARD:shard-target-unused-this-run
      printf '%s\n' "$cand" >> "$PROPOSED"; PROPOSED_TARGET="$cand"; return 0
    done
  fi
  # Not gate-parseable under any shard letter (or not a .md at all): land it
  # inert. The document is preserved and readable by a human; it is simply not
  # a round the verdict engines will parse - which is the honest outcome for a
  # basename that was never gate-shaped to begin with.
  local n=0
  while :; do
    if [ "$n" -eq 0 ]; then cand="$base-boomcard-copy.md"; else cand="$base-boomcard-copy-$n.md"; fi
    [ "$base" = "$src_base" ] && { if [ "$n" -eq 0 ]; then cand="$src_base.boomcard-copy"; else cand="$src_base.boomcard-copy-$n"; fi; }
    n=$((n + 1))
    # The inert branch needs the SAME two guarantees as the shard branch, and
    # they are just as reachable: the harness already holds several
    # `-boomcard-copy.md` files, so a re-leak of one of those basenames lands
    # here. Kept as two separate single-line guards so the guard sweep can
    # mutate each independently.
    # Pinned by: "inert target does not overwrite an existing harness file".
    [ -e "$REVIEWS_DIR/$cand" ] && continue     # GUARD:inert-target-free-in-harness
    # Pinned by: "inert targets are distinct across two leaked dirs".
    grep -qxF "$cand" "$PROPOSED" && continue   # GUARD:inert-target-unused-this-run
    printf '%s\n' "$cand" >> "$PROPOSED"; PROPOSED_TARGET="$cand"; return 0
  done
}

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
  : > "$tmp/collide"; : > "$tmp/nested"

  while IFS= read -r -d '' f; do
    total=$((total + 1))
    local rel="${f#"$dir"/}"

    # Content already in the harness under SOME name -> safe to drop. Checked
    # first so a collision the operator has already landed converges.
    if content_present "$f"; then dup=$((dup + 1)); continue; fi

    if [[ "$rel" == */* ]]; then
      # Nested. The harness reviews dir is FLAT and the gate parses basenames,
      # so flattening would change what the file means. Never automatic.
      printf '%s\n' "$rel" >> "$tmp/nested"; nested=$((nested + 1)); continue
    fi
    if [ ! -e "$REVIEWS_DIR/$rel" ]; then
      cp -p "$f" "$REVIEWS_DIR/$rel"
      if cmp -s "$f" "$REVIEWS_DIR/$rel"; then
        copied=$((copied + 1)); _sha "$f" >> "$HASH_INDEX"
      else
        echo "ERROR: copy of $rel did not verify byte-identical. Aborting." >&2
        rm -rf "$tmp"; exit 1
      fi
    else
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
    echo "    Do NOT overwrite either side. Land the leaked copy as:"
    while IFS= read -r rel; do
      propose_target "$rel"; local target="$PROPOSED_TARGET"
      echo "      cp -p '$dir/$rel' \\"
      echo "            '$REVIEWS_DIR/$target'"
      if gate_parseable "$target"; then
        echo "        # '-<letter>' is a shard suffix: pick_latest groups this into the SAME"
        echo "        #  round as its sibling, so verdicts aggregate strictest-wins."
      elif gate_parseable "$rel"; then
        echo "        # '$rel' IS a review round, but it is already a shard, and a"
        echo "        #  second shard suffix does not parse (the shard group takes a"
        echo "        #  SINGLE letter). Landed as an inert copy - preserved and"
        echo "        #  readable, but no verdict engine will parse it. Landing it under"
        echo "        #  a name that does not parse would be worse: it would look"
        echo "        #  gate-visible while being invisible."
      else
        echo "        # '$rel' is not a review-round basename, so no suffix can make it"
        echo "        #  one. Landed as an inert copy - preserved and"
        echo "        #  readable, but no verdict engine will parse it. That is correct"
        echo "        #  here; do not rename it into a round shape it never had."
      fi
    done < "$tmp/collide"
    echo "    If a leaked copy IS a latest round and reads clean but would trip a"
    echo "    scan its sibling is grandfathered out of, land it inert instead"
    echo "    rather than demoting a task on a false signal."
  fi

  if [ "$nested" -gt 0 ]; then
    echo
    echo "    Nested files — the harness reviews dir is flat and the gate parses"
    echo "    basenames, so these need a deliberate destination:"
    while IFS= read -r rel; do echo "      $dir/$rel"; done < "$tmp/nested"
  fi

  RECONCILE_UNRESOLVED=$((collide + nested))
  rm -rf "$tmp"
}

# --- verify a leaked directory is fully represented in the harness ----------
# The last gate before any removal command is printed. Forces a FRESH index so
# a concurrent change to the shared harness between the copy phase and here is
# caught rather than masked by a stale snapshot.
fully_represented() {
  local dir="$1" missing=0
  build_hash_index --force
  while IFS= read -r -d '' f; do
    if ! content_present "$f"; then
      missing=$((missing + 1))
      echo "    NOT REPRESENTED: ${f#"$dir"/}" >&2
    fi
  done < <(find "$dir" -type f -print0)
  [ "$missing" -eq 0 ]
}

# --- discover leaks repo-wide ----------------------------------------------
leaked=()
while IFS= read -r -d '' rel; do
  leaked+=("$rel")
done < <(discover_leaks)

misdirected=()
while IFS= read -r -d '' entry; do
  misdirected+=("$entry")
done < <(discover_misdirected)

# F10(c): a misdirected link is an unresolved leak, so NO mode may report
# success while one exists - including --reconcile, which used to exit 0 after
# reconciling a directory leak even with a misdirected symlink still present.
# Called immediately before every success exit.
exit_if_misdirected() {
  [ ${#misdirected[@]} -gt 0 ] || return 0
  echo "MISDIRECTED REVIEW LINK(S) - review writes land outside the harness." >&2
  echo >&2
  echo "These paths are symlinks pointing somewhere other than the harness, so" >&2
  echo "files written through them are invisible to every verdict engine just as" >&2
  echo "a stray directory would be. They are NOT repointed automatically: their" >&2
  echo "current target may already hold review files that would be orphaned." >&2
  echo >&2
  for entry in "${misdirected[@]}"; do
    echo "  ${entry%%|*}  ->  ${entry##*|}" >&2
  done
  echo >&2
  echo "Move anything already written to those targets into the harness (the" >&2
  echo "reconciler does NOT do it for you - it only handles real directories)," >&2
  echo "then remove the symlink and re-run this script." >&2
  exit 2
}

is_leaked() {
  local needle="$1" l
  for l in ${leaked+"${leaked[@]}"}; do [ "$l" = "$needle" ] && return 0; done
  return 1
}

created=0; repaired=0; ok=0; wrong=0

for rel in "${LINK_PATHS[@]}"; do
  path="$REPO_ROOT/$rel"
  is_leaked "$rel" && continue   # reported below with every other leak

  # Something that is neither a symlink nor a directory (e.g. a regular file).
  if [ -e "$path" ] && [ ! -L "$path" ]; then
    echo "ERROR: $rel exists and is not a symlink or directory. Refusing to touch it." >&2
    exit 1
  fi

  if [ -L "$path" ]; then
    current="$(readlink "$path")"
    # F10(a), same class as discover_misdirected: compare RESOLVED paths. A
    # relative link that resolves to the harness is correct; comparing link
    # text would report it WRONG (exit 4 under --check) and needlessly relink.
    if [ -n "$(_physical "$path")" ] && [ "$(_physical "$path")" = "$HARNESS_PHYS" ]; then
      echo "  ok     $rel"; ok=$((ok + 1)); continue
    fi
    if [ "$MODE" = "check" ]; then
      echo "  WRONG  $rel  -> $current"; wrong=$((wrong + 1)); continue
    fi
    echo "  repair $rel"
    echo "           was -> $current"
    rm "$path"; ln -s "$REVIEWS_DIR" "$path"; repaired=$((repaired + 1)); continue
  fi

  if [ "$MODE" = "check" ]; then
    echo "  ABSENT $rel"; wrong=$((wrong + 1)); continue
  fi

  mkdir -p "$(dirname "$path")"
  ln -s "$REVIEWS_DIR" "$path"
  echo "  create $rel"; created=$((created + 1))
done

for rel in ${leaked+"${leaked[@]}"}; do
  count=$(find "$REPO_ROOT/$rel" -type f | wc -l | tr -d ' ')
  echo "  LEAK   $rel  (real directory, $count file(s))"
done
for entry in ${misdirected+"${misdirected[@]}"}; do
  echo "  WRONG  ${entry%%|*}  -> ${entry##*|}  (symlink, not the harness)"
done

echo

# --- leak handling ----------------------------------------------------------
if [ ${#leaked[@]} -gt 0 ]; then
  if [ "$MODE" = "reconcile" ]; then
    echo "RECONCILING - copying leaked files into the harness. Nothing is deleted."
    echo
    total_unresolved=0
    for rel in "${leaked[@]}"; do
      reconcile_dir "$REPO_ROOT/$rel" "$rel"
      total_unresolved=$((total_unresolved + RECONCILE_UNRESOLVED))
      echo
    done

    # TEST SEAM (test-link-claude-reviews.sh only). An interposition point is
    # needed HERE, between the copy phase and verification, because that is the
    # only window in which a concurrent harness write flips the safety verdict
    # -- which is precisely what `fully_represented` exists to catch. A
    # seam-free `--verify-only` flag would not do: it rebuilds the index by
    # construction and so cannot exercise the stale-index case at all.
    #
    # This is a CLOSED dispatcher, not an arbitrary-path executor: it performs
    # one of a fixed set of named actions on a path under the harness dir. No
    # caller-supplied code is ever executed.
    if [ -n "${LINK_REVIEWS_TEST_ACTION:-}" ]; then
      case "$LINK_REVIEWS_TEST_ACTION" in
        remove-harness-file)
          # Simulate another agent deleting a just-copied review file.
          [ -n "${LINK_REVIEWS_TEST_ARG:-}" ] \
            && rm -f "$REVIEWS_DIR/$(basename "$LINK_REVIEWS_TEST_ARG")"
          ;;
        corrupt-harness-file)
          # Simulate a just-copied file being replaced by different content.
          [ -n "${LINK_REVIEWS_TEST_ARG:-}" ] \
            && printf 'concurrently replaced\n' \
                 > "$REVIEWS_DIR/$(basename "$LINK_REVIEWS_TEST_ARG")"
          ;;
        *)
          echo "ERROR: unknown LINK_REVIEWS_TEST_ACTION '$LINK_REVIEWS_TEST_ACTION'" >&2
          exit 1
          ;;
      esac
    fi

    if [ "$total_unresolved" -gt 0 ]; then
      echo "$total_unresolved file(s) still need a decision (listed above)." >&2
      echo "NOT printing a removal command: following it now would destroy them." >&2
      echo "Resolve them, then re-run:  ${ENVPFX}$SELF --reconcile" >&2
      exit 2
    fi

    all_ok=1
    for rel in "${leaked[@]}"; do
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
    for rel in "${leaked[@]}"; do echo "  rm -rf '$REPO_ROOT/$rel'"; done
    echo "  ${ENVPFX}$SELF"
    echo
    exit_if_misdirected
    exit 0
  fi

  echo "LEAK DETECTED - review files are being written outside the harness." >&2
  echo >&2
  echo "These paths are real directories, so agent review files written there are" >&2
  echo "invisible to finish-task.py, reconcile-task-status.py and the dashboard." >&2
  echo "Nothing was modified." >&2
  echo >&2
  for rel in "${leaked[@]}"; do
    count=$(find "$REPO_ROOT/$rel" -type f | wc -l | tr -d ' ')
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
  exit_if_misdirected
  # F10(b): scoped, not categorical. The scan covers real directories and
  # symlinks named `.claude/reviews`, outside the pruned trees, in the forms
  # `_find_reviews_paths` recognises - not "nothing can possibly be stray".
  echo "CHECK PASSED: all $ok managed link(s) point at the harness reviews dir,"
  echo "and the repo-wide scan found no stray or misdirected .claude/reviews"
  echo "path outside the pruned trees (node_modules, .git, build output, ...)."
  exit 0
fi

exit_if_misdirected
echo "Summary: $ok already correct, $created created, $repaired repaired."
echo "All review writes through the managed paths now land in the harness."
exit 0
