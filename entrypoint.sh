#!/bin/sh
set -e

# Runs as yolo user (USER yolo in Dockerfile). No root, no su-exec.

# Use xterm-256color when the host TERM has no terminfo entry in Alpine
if [ -n "$TERM" ] && ! infocmp "$TERM" >/dev/null 2>&1; then
  export TERM=xterm-256color
fi

# Copy staged Claude auth files into home dir
# (settings, skills, plugins are bind-mounted directly by the CLI)
if [ -f /host-claude/.credentials.json ]; then
  cp /host-claude/.credentials.json "$HOME/.claude/.credentials.json"
fi
if [ -f /host-claude/.claude.json ]; then
  cp /host-claude/.claude.json "$HOME/.claude.json"
fi

# Copy Codex auth from host mount
if [ -f /host-codex/auth.json ]; then
  mkdir -p "$HOME/.codex"
  cp /host-codex/auth.json "$HOME/.codex/auth.json"
fi

# On first start, copy source into writable work dir (respecting .gitignore)
if [ ! -f "$HOME/.yolomode-initialized" ] && [ -d /src ]; then
  if [ -d /src/.git ]; then
    git clone /src /work
    git -C /work remote remove origin
    git -C /work tag yolomode-base
    cd /src
    git ls-files --others --exclude-standard -z \
      | xargs -0 -I{} cp --parents "{}" /work/ 2>/dev/null || true
  else
    cp -a /src/. /work/
  fi
  touch "$HOME/.yolomode-initialized"
fi

cd /work
exec "$@"
