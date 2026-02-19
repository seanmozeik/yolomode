#!/usr/bin/env bash
# One-off: apply commits from a yolomode-sync'd local dir into the current repo.
# Usage: ./apply-local.sh <session-name>
#        ./apply-local.sh <path/to/dir>
set -euo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "usage: $0 <session-name-or-path>" >&2
  exit 1
fi

# Resolve source dir
if [ -d "$NAME" ]; then
  SRC="$NAME"
else
  SRC="$HOME/.yolomode/$NAME"
  if [ ! -d "$SRC" ]; then
    echo "error: no such directory: $SRC" >&2
    exit 1
  fi
fi

BASENAME=$(basename "$SRC")
BRANCH="yolomode/$BASENAME"

# Require clean host working tree (untracked files are fine)
DIRTY=$(git status --porcelain | grep -v "^??" || true)
if [ -n "$DIRTY" ]; then
  echo "error: working tree has uncommitted tracked changes — commit or stash first" >&2
  exit 1
fi

# Stage everything in the source repo so WIP shows up in the diff
git -C "$SRC" add -A

# Commits since yolomode-base (oldest first)
COMMITS=$(git -C "$SRC" log --reverse --format="%H" yolomode-base..HEAD 2>/dev/null || true)
COMMITS=$(echo "$COMMITS" | grep -v "^$" || true)

# Uncommitted WIP above HEAD
WIP=$(git -C "$SRC" diff --cached --full-index --binary HEAD)

if [ -z "$COMMITS" ] && [ -z "$(echo "$WIP" | tr -d '[:space:]')" ]; then
  echo "error: no changes to apply" >&2
  exit 1
fi

BASE=$(git rev-parse --abbrev-ref HEAD)
PATCH_DIR=$(mktemp -d)
WIP_FILE=$(mktemp)
COUNT=0

cleanup() { rm -rf "$PATCH_DIR" "$WIP_FILE"; }
trap cleanup EXIT

rollback() {
  git am --abort 2>/dev/null || true
  git checkout "$BASE" 2>/dev/null || true
  git branch -D "$BRANCH" 2>/dev/null || true
}

git checkout -b "$BRANCH"

if [ -n "$COMMITS" ]; then
  git -C "$SRC" format-patch --binary yolomode-base..HEAD -o "$PATCH_DIR/" >/dev/null
  git am --3way "$PATCH_DIR"/*.patch || { rollback; exit 1; }
  COUNT=$(echo "$COMMITS" | wc -l | tr -d ' ')
fi

if [ -n "$(echo "$WIP" | tr -d '[:space:]')" ]; then
  printf '%s' "$WIP" > "$WIP_FILE"
  git apply "$WIP_FILE" || { rollback; exit 1; }
  git add -A
  WIP_MSG=$([ -n "$COMMITS" ] && echo "yolomode: wip" || echo "yolomode: $BASENAME")
  git commit -m "$WIP_MSG"
  COUNT=$((COUNT + 1))
fi

git checkout "$BASE"
echo "✔ Branch created: $BRANCH ($COUNT commit(s))"
