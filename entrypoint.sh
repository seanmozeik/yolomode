#!/bin/sh
set -e

# ---- Run setup as root ----

# Inject Claude Code credentials from host keychain (passed via CLAUDE_CREDENTIALS env)
if [ -n "${CLAUDE_CREDENTIALS:-}" ]; then
  mkdir -p /home/yolo/.claude
  echo "$CLAUDE_CREDENTIALS" > /home/yolo/.claude/.credentials.json
  chown -R yolo:yolo /home/yolo/.claude
  unset CLAUDE_CREDENTIALS
fi

# Inject Codex auth from host (passed via CODEX_AUTH env)
if [ -n "${CODEX_AUTH:-}" ]; then
  mkdir -p /home/yolo/.codex
  echo "$CODEX_AUTH" > /home/yolo/.codex/auth.json
  chown -R yolo:yolo /home/yolo/.codex
  unset CODEX_AUTH
fi

# On first start, copy source into writable work dir (respecting .gitignore)
if [ ! -f /work/.yolomode-initialized ] && [ -d /src ]; then
  if [ -d /src/.git ]; then
    # Copy tracked + untracked-but-not-ignored files, plus .git itself
    cd /src
    git ls-files -z --cached --others --exclude-standard \
      | tar -c --null -T - | tar -x -C /work
    cp -a /src/.git /work/.git
  else
    cp -a /src/. /work/
  fi
  touch /work/.yolomode-initialized
  chown -R yolo:yolo /work
fi

# ---- Drop to yolo user ----
cd /work
exec su-exec yolo "$@"
