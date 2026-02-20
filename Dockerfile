# ==================================================
# yolomode: Debian + kitchen-sink dev tools + Claude Code + Codex
# ==================================================

# ---- Cargo base (shared by Rust tool stages) ----
# Alpine is fine here: cargo-binstall downloads statically-linked musl binaries
# that run on any Linux, including glibc systems like the Debian runtime below.
FROM alpine:3.23 AS cargo-base
RUN apk add --no-cache curl bash
RUN curl -L --proto '=https' --tlsv1.2 -sSf \
    https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
ENV PATH="/root/.cargo/bin:${PATH}"
ENV BINSTALL_DISABLE_TELEMETRY=true

# ---- Rust tools (BuildKit runs these in parallel) ----
FROM cargo-base AS tool-ripgrep
RUN cargo-binstall --no-confirm ripgrep

FROM cargo-base AS tool-fd
RUN cargo-binstall --no-confirm fd-find

FROM cargo-base AS tool-sd
RUN cargo-binstall --no-confirm sd

FROM cargo-base AS tool-starship
RUN cargo-binstall --no-confirm starship

FROM cargo-base AS tool-just
RUN cargo-binstall --no-confirm just

FROM cargo-base AS tool-xh
RUN cargo-binstall --no-confirm xh

FROM cargo-base AS tool-nu
RUN cargo-binstall --no-confirm nu

FROM cargo-base AS tool-bat
RUN cargo-binstall --no-confirm bat

# ---- agent-browser (node-based, own stage) ----
FROM bitnami/node:latest AS node

FROM node AS agent-browser-tools
ENV npm_config_prefix=/opt/agent-browser \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npm install -g agent-browser
# Download Playwright's own Chromium — tested against the exact agent-browser/Playwright version
RUN /opt/agent-browser/bin/agent-browser install

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
RUN mise use -g go
RUN mise use -g zig
RUN mise use -g rust
RUN mise use -g uv@latest
RUN mise use -g python@3.13

# ---- Claude Code (official native installer) ----
FROM bitnami/minideb:bookworm AS claude-install
RUN install_packages curl bash ca-certificates
ENV HOME=/opt/claude-home
RUN mkdir -p /opt/claude-home \
    && curl -fsSL https://claude.ai/install.sh | bash

# ---- Bun + Codex + dev tools ----
FROM bitnami/minideb:bookworm AS bun-tools
RUN install_packages curl bash ca-certificates unzip
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="$BUN_INSTALL/bin:$PATH"
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local/bun bash
RUN bun install -g @openai/codex
RUN bun install -g @biomejs/biome typescript

# ---- Final runtime ----
FROM bitnami/minideb:bookworm AS runtime

# Add mise and gh apt repos, then install all system packages
RUN install_packages gpg curl ca-certificates \
    && curl -fsSL https://mise.jdx.dev/gpg-key.pub | gpg --dearmor > /usr/share/keyrings/mise-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/mise-archive-keyring.gpg arch=$(dpkg --print-architecture)] https://mise.jdx.dev/deb stable main" > /etc/apt/sources.list.d/mise.list \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor > /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
RUN install_packages \
    git curl wget jq zsh bash micro \
    build-essential openssh-client openssl libssl-dev \
    pkg-config \
    libffi-dev \
    libsqlite3-dev \
    libxml2-dev libxslt1-dev \
    libpng-dev libjpeg-dev \
    libpq-dev \
    ca-certificates \
    git-lfs \
    patch rsync \
    gh mise \
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
ENV RUSTUP_HOME=/opt/rustup \
    CARGO_HOME=/home/yolo/.cargo \
    GOPATH=/home/yolo/go \
    UV_CACHE_DIR=/home/yolo/.cache/uv \
    UV_TOOL_BIN_DIR=/home/yolo/.local/bin \
    npm_config_prefix=/home/yolo/.local \
    npm_config_cache=/home/yolo/.cache/npm \
    PIP_CACHE_DIR=/home/yolo/.cache/pip \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
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
COPY --from=node /opt/bitnami/node /opt/bitnami/node
RUN ln -s /opt/bitnami/node/bin/node /usr/local/bin/node \
    && ln -s /opt/bitnami/node/bin/npm /usr/local/bin/npm \
    && ln -s /opt/bitnami/node/bin/npx /usr/local/bin/npx
COPY --from=agent-browser-tools /opt/agent-browser /opt/agent-browser
COPY --from=agent-browser-tools /opt/playwright /opt/playwright
COPY --from=claude-install /opt/claude-home/.local/share/claude /opt/claude
RUN ln -s /opt/claude/versions/$(ls /opt/claude/versions/) /usr/local/bin/claude
COPY --from=bun-tools /usr/local/bun /usr/local/bun
COPY --from=mise-tools /opt/mise /opt/mise
COPY --from=mise-tools /opt/rustup /opt/rustup
COPY --from=mise-tools /opt/cargo /opt/cargo

# Create non-root user
RUN groupadd -g 1000 yolo && useradd -u 1000 -g yolo -d /home/yolo -s /usr/local/bin/nu -m yolo
ENV HOME=/home/yolo
ENV CODEX_UNSAFE_ALLOW_NO_SANDBOX=1

# Shell setup (auto-detect TERM support, prefer xterm-256color when unavailable)
RUN printf '%s\n' \
    'if ! infocmp "$TERM" >/dev/null 2>&1; then export TERM=xterm-256color; fi' \
    'source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh' \
    'source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh' \
    'eval "$(starship init zsh)"' \
    '_ym_title() { printf "\033]0;ym-%s\007" "$HOST"; }' \
    'precmd_functions+=(_ym_title)' \
    'alias cc="claude --dangerously-skip-permissions"' \
    'alias co="codex --full-auto"' \
    >> /home/yolo/.zshrc \
    && printf '%s\n' \
    'if ! infocmp "$TERM" >/dev/null 2>&1; then export TERM=xterm-256color; fi' \
    'eval "$(starship init bash)"' \
    'alias cc="claude --dangerously-skip-permissions"' \
    'alias co="codex --yolo"' \
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
    'alias cc = claude --dangerously-skip-permissions' \
    'alias co = codex --full-auto' \
    'alias .. = cd ..' \
    >> /home/yolo/.config/nushell/config.nu \
    && chown -R yolo:yolo /home/yolo/.config/nushell /home/yolo/.local/share/nushell

# Make global bun dir writable for runtime package installs
RUN chown -R yolo:yolo /usr/local/bun
RUN mkdir -p /usr/local/share/npm-global && \
    chown -R yolo:yolo /usr/local/share
# Prepare writable directories owned by yolo user
COPY starship.toml /home/yolo/.config/starship.toml
RUN VERSION=$(ls /opt/claude/versions/) \
    && mkdir -p /home/yolo/.claude /home/yolo/.claude/skills /home/yolo/.codex \
       /home/yolo/.cargo/bin /home/yolo/go/bin \
       /home/yolo/.cache/uv /home/yolo/.cache/npm /home/yolo/.cache/pip \
       /home/yolo/.local/bin /home/yolo/.local/share/claude/versions \
    && ln -s /opt/claude/versions/$VERSION /home/yolo/.local/share/claude/versions/$VERSION \
    && ln -s /home/yolo/.local/share/claude/versions/$VERSION /home/yolo/.local/bin/claude \
    && chown -R yolo:yolo /home/yolo

# Entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
COPY ralph.sh /usr/local/bin/ralph
RUN chmod +x /usr/local/bin/ralph

USER yolo
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["nu"]
