# ==================================================
# yolomode: Debian + kitchen-sink dev tools + Claude Code + Codex
# ==================================================

# ---- Cargo base (shared by Rust tool stages) ----
# Alpine is fine here: cargo-binstall downloads statically-linked musl binaries
# that run on any Linux, including glibc systems like the Debian runtime below.
FROM alpine:3.23 AS cargo-base
RUN apk add --no-cache curl bash
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    curl -L --proto '=https' --tlsv1.2 -sSf \
    https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
ENV PATH="/root/.cargo/bin:${PATH}"
ENV BINSTALL_DISABLE_TELEMETRY=true

# ---- Rust tools (BuildKit runs these in parallel) ----
FROM cargo-base AS tool-ripgrep
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm ripgrep

FROM cargo-base AS tool-fd
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm fd-find

FROM cargo-base AS tool-sd
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm sd

FROM cargo-base AS tool-starship
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm starship

FROM cargo-base AS tool-just
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm just

FROM cargo-base AS tool-xh
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm xh

FROM cargo-base AS tool-nu
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm nu

FROM cargo-base AS tool-bat
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm bat

FROM cargo-base AS tool-delta
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm git-delta

FROM cargo-base AS tool-cargo-insta
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm cargo-insta

FROM cargo-base AS tool-cargo-nextest
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm cargo-nextest

FROM cargo-base AS tool-sccache
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm sccache

FROM cargo-base AS tool-bacon
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm bacon

FROM cargo-base AS tool-cargo-edit
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm cargo-edit

FROM cargo-base AS tool-cargo-llvm-cov
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm cargo-llvm-cov

FROM cargo-base AS tool-cargo-watch
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm cargo-watch

FROM cargo-base AS tool-lstr
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm lstr

FROM cargo-base AS tool-fresh
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    cargo-binstall --no-confirm fresh-editor

# ---- lazygit (direct GitHub release) ----
FROM alpine:3.23 AS tool-lazygit
RUN apk add --no-cache curl tar gzip
RUN LAZYGIT_VERSION=$(curl -s https://api.github.com/repos/jesseduffield/lazygit/releases/latest | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/') \
    && curl -Lo lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/download/v${LAZYGIT_VERSION}/lazygit_${LAZYGIT_VERSION}_linux_x86_64.tar.gz" \
    && tar xzf lazygit.tar.gz lazygit \
    && mv lazygit /usr/local/bin/

# ---- agent-browser (node-based, own stage) ----
FROM bitnami/node:latest AS node

FROM node AS agent-browser-tools
ENV npm_config_prefix=/opt/agent-browser
RUN npm install -g agent-browser

# ---- Language runtimes via mise (each on its own layer for caching) ----
FROM bitnami/minideb:bookworm AS mise-tools
RUN install_packages \
    bash curl xz-utils build-essential gpg ca-certificates \
    zlib1g-dev libffi-dev libssl-dev libreadline-dev libbz2-dev libsqlite3-dev liblzma-dev linux-libc-dev
RUN curl -fsSL https://mise.jdx.dev/gpg-key.pub | gpg --dearmor > /usr/share/keyrings/mise-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/mise-archive-keyring.gpg arch=$(dpkg --print-architecture)] https://mise.jdx.dev/deb stable main" > /etc/apt/sources.list.d/mise.list \
    && install_packages mise
ENV MISE_DATA_DIR=/opt/mise MISE_CONFIG_DIR=/opt/mise/config \
    RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo XDG_DATA_HOME=/opt/mise
RUN mkdir -p /opt/mise /opt/rustup /opt/cargo
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    mise use -g go
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    mise use -g zig
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    mise use -g rust
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    mise use -g uv@latest
RUN --mount=type=secret,id=gh_token \
    export GITHUB_TOKEN=$(cat /run/secrets/gh_token 2>/dev/null || true) && \
    mise use -g python@3.14

# ---- Claude Code (official native installer) ----
FROM bitnami/minideb:bookworm AS claude-install
RUN install_packages curl bash ca-certificates
ENV HOME=/opt/claude-home
RUN mkdir -p /opt/claude-home \
    && curl -fsSL https://claude.ai/install.sh | bash

# ---- Bun base (shared by bun tool stages) ----
FROM bitnami/minideb:bookworm AS bun-base
RUN install_packages curl bash ca-certificates unzip
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="$BUN_INSTALL/bin:$PATH"
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local/bun bash

# ---- Codex (own stage so --no-cache-filter can target it) ----
FROM bun-base AS codex-install
RUN bun install -g @openai/codex

# ---- Bun dev tools (cached normally) ----
FROM bun-base AS bun-tools
RUN bun install -g oxfmt oxlint oxlint-tsgolint typescript
RUN bun install -g portless
RUN bun install -g @seanmozeik/markdown-display
RUN bun install -g @seanmozeik/claudewatch
RUN bun install -g opencode-ai

# ---- Final runtime ----
FROM bitnami/minideb:bookworm AS runtime

# Add mise and gh apt repos, then install all system packages
RUN install_packages gpg curl ca-certificates \
    && curl -fsSL https://mise.jdx.dev/gpg-key.pub | gpg --dearmor > /usr/share/keyrings/mise-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/mise-archive-keyring.gpg arch=$(dpkg --print-architecture)] https://mise.jdx.dev/deb stable main" > /etc/apt/sources.list.d/mise.list \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor > /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
RUN install_packages \
    git curl wget jq zsh bash micro less \
    build-essential openssh-client openssl libssl-dev \
    clang lld \
    cmake ninja-build \
    mold \
    pkg-config \
    protobuf-compiler \
    libffi-dev \
    libclang-dev \
    libsqlite3-dev \
    libxml2-dev libxslt1-dev \
    libpng-dev libjpeg-dev \
    libpq-dev \
    musl-tools \
    ca-certificates \
    git-lfs \
    patch rsync \
    gh mise \
    ncurses-bin ncurses-term \
    libncurses5 \
    coreutils findutils grep \
    zsh-autosuggestions zsh-syntax-highlighting \
    chromium \
    fonts-liberation fonts-noto-color-emoji

# Pre-installed tool paths (read-only from build stages)
ENV BUN_INSTALL=/usr/local/bun
ENV MISE_DATA_DIR=/opt/mise \
    MISE_CONFIG_DIR=/opt/mise/config

# Writable package manager homes for runtime installs
ENV RUSTUP_HOME=/home/yolo/.rustup \
    CARGO_HOME=/home/yolo/.cargo \
    RUSTC_WRAPPER=/usr/local/bin/sccache \
    SCCACHE_DIR=/home/yolo/.cache/sccache \
    SCCACHE_CACHE_SIZE=10G \
    GOPATH=/home/yolo/go \
    UV_CACHE_DIR=/home/yolo/.cache/uv \
    UV_LINK_MODE=copy \
    UV_TOOL_BIN_DIR=/home/yolo/.local/bin \
    npm_config_prefix=/home/yolo/.local \
    npm_config_cache=/home/yolo/.cache/npm \
    PIP_CACHE_DIR=/home/yolo/.cache/pip \
    PATH="/opt/agent-browser/bin:/home/yolo/.cargo/bin:/home/yolo/go/bin:/home/yolo/.local/bin:$BUN_INSTALL/bin:/opt/mise/shims:/opt/cargo/bin:${PATH}"

# Copy tool binaries
COPY --from=tool-ripgrep /root/.cargo/bin/rg /usr/local/bin/
COPY --from=tool-fd /root/.cargo/bin/fd /usr/local/bin/
COPY --from=tool-sd /root/.cargo/bin/sd /usr/local/bin/
COPY --from=tool-starship /root/.cargo/bin/starship /usr/local/bin/
COPY --from=tool-just /root/.cargo/bin/just /usr/local/bin/
COPY --from=tool-xh /root/.cargo/bin/xh /usr/local/bin/
COPY --from=tool-nu /root/.cargo/bin/nu /usr/local/bin/
COPY --from=tool-bat /root/.cargo/bin/bat /usr/local/bin/
COPY --from=tool-delta /root/.cargo/bin/delta /usr/local/bin/
COPY --from=cargo-base /root/.cargo/bin/cargo-binstall /usr/local/bin/
COPY --from=tool-lazygit /usr/local/bin/lazygit /usr/local/bin/
COPY --from=tool-cargo-insta /root/.cargo/bin/cargo-insta /usr/local/bin/
COPY --from=tool-cargo-nextest /root/.cargo/bin/cargo-nextest /usr/local/bin/
COPY --from=tool-sccache /root/.cargo/bin/sccache /usr/local/bin/
COPY --from=tool-bacon /root/.cargo/bin/bacon /usr/local/bin/
COPY --from=tool-cargo-edit /root/.cargo/bin/cargo-add /usr/local/bin/
COPY --from=tool-cargo-edit /root/.cargo/bin/cargo-rm /usr/local/bin/
COPY --from=tool-cargo-edit /root/.cargo/bin/cargo-set-version /usr/local/bin/
COPY --from=tool-cargo-edit /root/.cargo/bin/cargo-upgrade /usr/local/bin/
COPY --from=tool-cargo-llvm-cov /root/.cargo/bin/cargo-llvm-cov /usr/local/bin/
COPY --from=tool-cargo-watch /root/.cargo/bin/cargo-watch /usr/local/bin/
COPY --from=tool-lstr /root/.cargo/bin/lstr /usr/local/bin/
COPY --from=tool-fresh /root/.cargo/bin/fresh /usr/local/bin/
COPY --from=node /opt/bitnami/node /opt/bitnami/node
RUN ln -s /opt/bitnami/node/bin/node /usr/local/bin/node \
    && ln -s /opt/bitnami/node/bin/npm /usr/local/bin/npm \
    && ln -s /opt/bitnami/node/bin/npx /usr/local/bin/npx
COPY --from=agent-browser-tools /opt/agent-browser /opt/agent-browser
COPY --from=claude-install /opt/claude-home/.local/share/claude /opt/claude
RUN ln -s /opt/claude/versions/$(ls /opt/claude/versions/) /usr/local/bin/claude
COPY --from=bun-tools /usr/local/bun /usr/local/bun
COPY --from=codex-install /usr/local/bun /usr/local/bun
COPY --from=mise-tools /opt/mise /opt/mise
COPY --from=mise-tools /opt/rustup /opt/rustup
COPY --from=mise-tools /opt/cargo /opt/cargo
COPY xterm-ghostty.terminfo /tmp/xterm-ghostty.terminfo
RUN mkdir -p /usr/share/terminfo \
    && tic -x -o /usr/share/terminfo /tmp/xterm-ghostty.terminfo \
    && rm /tmp/xterm-ghostty.terminfo

# Create non-root user
RUN groupadd -g 1000 yolo && useradd -u 1000 -g yolo -d /home/yolo -s /usr/local/bin/nu -m yolo
ENV HOME=/home/yolo
ENV CODEX_UNSAFE_ALLOW_NO_SANDBOX=1
# Default to truecolor — overridden at runtime by -e COLORTERM if host differs
ENV COLORTERM=truecolor
ENV PAGER=less

# Shell setup (keep host TERM when supported; fall back only for unknown entries)
RUN printf '%s\n' \
    'if [ -n "$TERM" ] && ! infocmp "$TERM" >/dev/null 2>&1; then export TERM=xterm-256color; fi' \
    'source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh' \
    'source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh' \
    'eval "$(starship init zsh)"' \
    '_ym_title() { printf "\033]0;ym-%s\007" "$HOST"; }' \
    'precmd_functions+=(_ym_title)' \
    'alias cc="claude"' \
    'alias co="codex"' \
    'alias cw="claudewatch"' \
    'alias lg="lazygit"' \
    >> /home/yolo/.zshrc \
    && printf '%s\n' \
    'if [ -n "$TERM" ] && ! infocmp "$TERM" >/dev/null 2>&1; then export TERM=xterm-256color; fi' \
    'eval "$(starship init bash)"' \
    'alias cc="claude"' \
    'alias co="codex"' \
    'alias cw="claudewatch"' \
    'alias lg="lazygit"' \
    >> /home/yolo/.bashrc

# Nu shell setup
# Starship goes in vendor/autoload — nu sources everything there automatically
RUN mkdir -p /home/yolo/.config/nushell \
        /home/yolo/.local/share/nushell/vendor/autoload \
    && starship init nu > /home/yolo/.local/share/nushell/vendor/autoload/starship.nu \
    && printf '%s\n' \
    '$env.config.show_banner = false' \
    '$env.EDITOR = "micro"' \
    '$env.VISUAL = "micro"' \
    'alias cc = claude' \
    'alias co = codex' \
    'alias cw = claudewatch' \
    'alias lg = lazygit' \
    'alias .. = cd ..' \
    >> /home/yolo/.config/nushell/config.nu \
    && cat <<'NUEOF' >> /home/yolo/.config/nushell/config.nu
def "nu-complete just" [] {
    (^just --dump --unstable --dump-format json | from json).recipes | transpose recipe data | flatten | where {|row| $row.private == false } | select recipe doc parameters | rename value description
}

# Just: A Command Runner
export extern "just" [
    ...recipe: string@"nu-complete just", # Recipe(s) to run, may be with argument(s)
]
NUEOF
RUN chown -R yolo:yolo /home/yolo/.config/nushell /home/yolo/.local/share/nushell

# Make global bun dir writable for runtime package installs
RUN chown -R yolo:yolo /usr/local/bun
RUN mkdir -p /usr/local/share/npm-global && \
    chown -R yolo:yolo /usr/local/share
# Prepare writable directories owned by yolo user
COPY starship.toml /home/yolo/.config/starship.toml
RUN VERSION=$(ls /opt/claude/versions/) \
    && mkdir -p /home/yolo/.claude /home/yolo/.claude/skills /home/yolo/.codex \
       /home/yolo/.cargo/bin /home/yolo/.cargo/git /home/yolo/.cargo/registry \
       /home/yolo/.rustup \
       /home/yolo/.cache/sccache /home/yolo/go/bin \
       /home/yolo/.cache/uv /home/yolo/.cache/npm /home/yolo/.cache/pip \
       /home/yolo/.local/bin /home/yolo/.local/share/claude/versions \
    && ln -s /opt/claude/versions/$VERSION /home/yolo/.local/share/claude/versions/$VERSION \
    && printf '%s\n' \
       '#!/bin/sh' \
       'export IS_SANDBOX=1' \
       'exec /usr/local/bin/claude --dangerously-skip-permissions "$@"' \
       > /home/yolo/.local/bin/claude \
    && chmod +x /home/yolo/.local/bin/claude \
    && printf '%s\n' \
       '#!/bin/sh' \
       'exec /usr/local/bun/bin/codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen "$@"' \
       > /home/yolo/.local/bin/codex \
    && chmod +x /home/yolo/.local/bin/codex
RUN cat <<'EOF' > /home/yolo/.cargo/config.toml
[build]
rustc-wrapper = "/usr/local/bin/sccache"

[target.x86_64-unknown-linux-gnu]
linker = "/usr/local/bin/cc-mold"

[target.aarch64-unknown-linux-gnu]
linker = "/usr/local/bin/cc-mold"

[profile.dev]
debug = 1

[profile.test]
debug = 1

[alias]
nt = "nextest run"
nw = "nextest run --workspace"
EOF
RUN chown -R yolo:yolo /home/yolo

RUN cat <<'EOF' >/usr/local/bin/cc-mold
#!/bin/sh
exec cc -fuse-ld=mold "$@"
EOF
RUN chmod +x /usr/local/bin/cc-mold

# Non-interactive/login-safe environment for Codex subprocesses.
RUN cat <<'EOF' >/etc/profile.d/codex-env.sh
#!/bin/sh
# Deterministic environment baseline for login/non-interactive shells.
export BUN_INSTALL=/usr/local/bun
export MISE_DATA_DIR=/opt/mise
export MISE_CONFIG_DIR=/opt/mise/config
export RUSTUP_HOME=/home/yolo/.rustup
export CARGO_HOME=/home/yolo/.cargo
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/home/yolo/.cache/cargo-target/default}"
export GOPATH=/home/yolo/go
export RUSTC_WRAPPER=/usr/local/bin/sccache
export SCCACHE_DIR=/home/yolo/.cache/sccache
export SCCACHE_CACHE_SIZE=10G
export UV_CACHE_DIR=/home/yolo/.cache/uv
export UV_LINK_MODE=copy
export UV_TOOL_BIN_DIR=/home/yolo/.local/bin
export npm_config_prefix=/home/yolo/.local
export npm_config_cache=/home/yolo/.cache/npm
export PIP_CACHE_DIR=/home/yolo/.cache/pip
export AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium

if [ -z "${LIBCLANG_PATH:-}" ]; then
  for dir in /usr/lib/llvm-*/lib; do
    if [ -d "$dir" ]; then
      export LIBCLANG_PATH="$dir"
      break
    fi
  done
fi

# Keep this in sync with Dockerfile + entrypoint for Codex parity.
export PATH="/opt/agent-browser/bin:/home/yolo/.cargo/bin:/home/yolo/go/bin:/home/yolo/.local/bin:/usr/local/bun/bin:/opt/mise/shims:/opt/cargo/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
EOF
RUN chmod 644 /etc/profile.d/codex-env.sh

# Ensure login shells load profile.d exports even without bash-specific rc files.
RUN printf '%s\n' \
    'if [ -f /etc/profile ]; then . /etc/profile; fi' \
    > /home/yolo/.profile \
    && chown yolo:yolo /home/yolo/.profile

# Runtime parity check helper.
RUN cat <<'EOF' >/usr/local/bin/verify-codex-env.sh
#!/usr/bin/env sh
set -eu

required_path_entries="
/opt/agent-browser/bin
/home/yolo/.cargo/bin
/home/yolo/go/bin
/home/yolo/.local/bin
/usr/local/bun/bin
/opt/mise/shims
/opt/cargo/bin
"

fail=0

for entry in $required_path_entries; do
  case ":$PATH:" in
    *":$entry:"*) ;;
    *)
      echo "ERROR: PATH missing required entry: $entry" >&2
      fail=1
      ;;
  esac
done

for var in HOME PATH MISE_DATA_DIR MISE_CONFIG_DIR CARGO_HOME CARGO_TARGET_DIR RUSTUP_HOME RUSTC_WRAPPER SCCACHE_DIR; do
  value="$(eval "printf '%s' \"\${$var:-}\"")"
  if [ -z "$value" ]; then
    echo "ERROR: required env var missing: $var" >&2
    fail=1
  fi
done

for bin in mise node uv codex claude cargo-binstall sccache cargo-nextest bacon cargo-watch cargo-add cargo-upgrade cargo-llvm-cov mold lld clang cmake ninja protoc; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: required command not found on PATH: $bin" >&2
    fail=1
  fi
done

# Cargo and rustc are expected from mise shims in this image.
for bin in cargo rustc; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: expected Rust tool missing on PATH: $bin" >&2
    fail=1
  fi
done

if ! sccache --show-stats >/dev/null 2>&1; then
  echo "ERROR: sccache is installed but not runnable" >&2
  fail=1
fi

if [ "${RUSTC_WRAPPER:-}" != "/usr/local/bin/sccache" ]; then
  echo "ERROR: RUSTC_WRAPPER is not configured for sccache" >&2
  fail=1
fi

if [ ! -f "$CARGO_HOME/config.toml" ]; then
  echo "ERROR: cargo config file missing: $CARGO_HOME/config.toml" >&2
  fail=1
elif ! grep -F 'rustc-wrapper = "/usr/local/bin/sccache"' "$CARGO_HOME/config.toml" >/dev/null 2>&1; then
  echo "ERROR: cargo config file is missing sccache rustc-wrapper" >&2
  fail=1
fi

if [ -f "$CARGO_HOME/config.toml" ] && ! grep -F 'linker = "/usr/local/bin/cc-mold"' "$CARGO_HOME/config.toml" >/dev/null 2>&1; then
  echo "ERROR: cargo config file is missing mold linker config" >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "codex env verification failed" >&2
  exit 1
fi

echo "codex env verification passed"
EOF
RUN chmod +x /usr/local/bin/verify-codex-env.sh

# Entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
COPY ralph.ts /usr/local/bin/ralph
RUN chmod +x /usr/local/bin/ralph

USER yolo
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["nu"]
