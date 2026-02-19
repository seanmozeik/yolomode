#!/bin/sh
set -e

# Inject Claude Code credentials from host keychain (passed via CLAUDE_CREDENTIALS env)
if [ -n "${CLAUDE_CREDENTIALS:-}" ]; then
  mkdir -p /root/.claude
  echo "$CLAUDE_CREDENTIALS" > /root/.claude/.credentials.json
  unset CLAUDE_CREDENTIALS
fi

# On first start, copy the read-only mounted source into the writable work dir
if [ ! -f /work/.yolomode-initialized ]; then
  cp -a /src/. /work/
  touch /work/.yolomode-initialized
fi

cd /work
exec "$@"
