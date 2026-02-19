#!/bin/sh
set -e

# Runs as yolo user (USER yolo in Dockerfile). No root, no su-exec.

# Copy Claude config from host mounts into home dir
if [ -d /host-claude/.claude ]; then
  cp -a /host-claude/.claude/. "$HOME/.claude/"
fi
if [ -f /host-claude/.claude.json ]; then
  cp /host-claude/.claude.json "$HOME/.claude.json"
fi
if [ -f /host-claude/.credentials.json ]; then
  mkdir -p "$HOME/.claude"
  cp /host-claude/.credentials.json "$HOME/.claude/.credentials.json"
fi

# Copy Codex auth from host mount
if [ -f /host-codex/auth.json ]; then
  mkdir -p "$HOME/.codex"
  cp /host-codex/auth.json "$HOME/.codex/auth.json"
fi

# On first start, copy source into writable work dir (respecting .gitignore)
if [ ! -f /work/.yolomode-initialized ] && [ -d /src ]; then
  if [ -d /src/.git ]; then
    git clone /src /work
    cd /src
    git ls-files --others --exclude-standard -z \
      | xargs -0 -I{} cp --parents "{}" /work/ 2>/dev/null || true
  else
    cp -a /src/. /work/
  fi
  touch /work/.yolomode-initialized
fi

cd /work
exec "$@"
