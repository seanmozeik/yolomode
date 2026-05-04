#!/bin/sh
set -e

# Runs as yolo user (USER yolo in Dockerfile). No root, no su-exec.

# Lock PATH explicitly — prevents drift when Codex spawns non-interactive subshells
# that may source login files resetting PATH to system defaults.
export PATH="/opt/agent-browser/bin:/home/yolo/.cargo/bin:/home/yolo/go/bin:/home/yolo/.local/bin:/usr/local/bun/bin:/opt/mise/shims:/opt/cargo/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export RUSTUP_HOME=/home/yolo/.rustup
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/home/yolo/.cache/cargo-target/default}"
export RUSTC_WRAPPER=/usr/local/bin/sccache
export SCCACHE_DIR=/home/yolo/.cache/sccache
export SCCACHE_CACHE_SIZE=10G

if [ -z "$LIBCLANG_PATH" ]; then
  for dir in /usr/lib/llvm-*/lib; do
    if [ -d "$dir" ]; then
      export LIBCLANG_PATH="$dir"
      break
    fi
  done
fi

# Fall back only when the incoming TERM has no terminfo entry in the image.
if [ -n "$TERM" ] && ! infocmp "$TERM" >/dev/null 2>&1; then
  export TERM=xterm-256color
fi

mkdir -p \
  "$HOME/.cargo/bin" \
  "$HOME/.cargo/git" \
  "$HOME/.cargo/registry" \
  "$HOME/.rustup" \
  "$CARGO_TARGET_DIR" \
  "$HOME/.cache/sccache" \
  "$HOME/.cache/uv" \
  "$HOME/.cache/npm" \
  "$HOME/.cache/pip" \
  "$HOME/.local/bin" \
  "$HOME/go/bin"
sccache --start-server >/dev/null 2>&1 || true

# Seed a writable rustup home from the image's preinstalled toolchain so a
# mounted volume does not mask the working Rust installation.
if [ ! -e "$RUSTUP_HOME/settings.toml" ] && [ -d /opt/rustup ]; then
  rsync -a /opt/rustup/ "$RUSTUP_HOME"/
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

# Copy Pi Agent config from host mount. These are preprocessed by the CLI so
# host-local model URLs work from inside Docker.
if [ -d /host-pi/agent ]; then
  mkdir -p "$HOME/.pi/agent"
  for pi_file in settings.json models.json auth.json keybindings.json AGENTS.md CLAUDE.md RTK.md; do
    if [ -f "/host-pi/agent/$pi_file" ]; then
      cp "/host-pi/agent/$pi_file" "$HOME/.pi/agent/$pi_file"
    fi
  done
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

# Trust mise config in the working directory (suppresses interactive prompt)
mise trust --all >/dev/null 2>&1 || true
# Rebuild shims to avoid stale paths when tool configs change.
mise reshim >/dev/null 2>&1 || true

# Validate env parity for Codex-style command execution.
if ! /usr/local/bin/verify-codex-env.sh; then
  echo "FATAL: codex environment verification failed" >&2
  exit 1
fi

# Set terminal window title to session name (ym-<container-name>)
printf '\033]0;ym-%s\007' "$HOSTNAME"

exec "$@"
