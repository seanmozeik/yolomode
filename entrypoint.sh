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
if [ -f /host-claude/settings.json ]; then
  cp /host-claude/settings.json "$HOME/.claude/settings.json"
fi

# Copy Codex auth from host mount
if [ -f /host-codex/auth.json ]; then
  mkdir -p "$HOME/.codex"
  cp /host-codex/auth.json "$HOME/.codex/auth.json"
fi
if [ -f /host-codex/config.toml ]; then
  mkdir -p "$HOME/.codex"
  cp /host-codex/config.toml "$HOME/.codex/config.toml"
fi

# Propagate host git identity into container's global config
if [ -n "$GIT_AUTHOR_NAME" ]; then
  git config --global user.name "$GIT_AUTHOR_NAME"
fi
if [ -n "$GIT_AUTHOR_EMAIL" ]; then
  git config --global user.email "$GIT_AUTHOR_EMAIL"
fi
# Avoid SSH host trust prompts in containers by preferring HTTPS for GitHub remotes.
git config --global --replace-all url."https://github.com/".insteadOf "git@github.com:"
git config --global --add url."https://github.com/".insteadOf "ssh://git@github.com/"

# On first start, copy source into writable work dir (respecting .gitignore)
WORKDIR="${PROJECT_DIR:-/home/yolo/project}"
if [ ! -f "$HOME/.yolomode-initialized" ] && [ -d /src ]; then
  mkdir -p "$WORKDIR"
  if [ -d /src/.git ]; then
    git clone /src "$WORKDIR"
    git -C "$WORKDIR" remote remove origin
    cd /src
    git ls-files --others --exclude-standard -z \
      | xargs -0 -I{} cp --parents "{}" "$WORKDIR/" 2>/dev/null || true
    git -C "$WORKDIR" add -A
    git -C "$WORKDIR" commit --allow-empty -m "yolomode: base snapshot" >/dev/null 2>&1 || true
    git -C "$WORKDIR" tag yolomode-base
  else
    cp -a /src/. "$WORKDIR/"
  fi
  touch "$HOME/.yolomode-initialized"
fi

cd "$WORKDIR"

# Set terminal window title to session name (ym-<container-name>)
printf '\033]0;ym-%s\007' "$HOSTNAME"

exec "$@"
