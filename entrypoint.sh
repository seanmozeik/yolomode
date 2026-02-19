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
    # Clone the repo (gets tracked files + history, skips gitignored)
    git clone /src /work
    # Copy untracked-but-not-ignored files from source
    cd /src
    git ls-files --others --exclude-standard -z \
      | xargs -0 -I{} cp --parents "{}" /work/ 2>/dev/null || true
  else
    cp -a /src/. /work/
  fi
  touch /work/.yolomode-initialized
  chown -R yolo:yolo /work
fi

# ---- Drop to yolo user ----
cd /work
exec su-exec yolo "$@"
