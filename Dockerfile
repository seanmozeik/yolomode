# ==================================================
# yolomode: Alpine + kitchen-sink dev tools + Claude Code + Codex
# ==================================================

# ---- Cargo base (shared by Rust tool stages) ----
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

# ---- Language runtimes via mise (each on its own layer for caching) ----
FROM alpine:3.23 AS mise-tools
RUN apk add --no-cache mise bash curl xz build-base linux-headers zlib-dev \
    libffi-dev openssl-dev readline-dev bzip2-dev sqlite-dev xz-dev
ENV MISE_DATA_DIR=/opt/mise MISE_CONFIG_DIR=/opt/mise/config \
    RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo XDG_DATA_HOME=/opt/mise
RUN mkdir -p /opt/mise /opt/rustup /opt/cargo
RUN mise use -g go
RUN mise use -g zig
RUN mise use -g rust
RUN mise use -g uv@latest
RUN mise use -g python@3.13

# ---- Bun + Claude Code + Codex (independent install, known path) ----
FROM alpine:3.23 AS bun-tools
RUN apk add --no-cache curl bash ca-certificates unzip libstdc++
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="$BUN_INSTALL/bin:$PATH"
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local/bun bash
RUN bun install -g @anthropic-ai/claude-code
RUN bun install -g @openai/codex

# ---- Final runtime ----
FROM alpine:3.23 AS runtime

# System packages (node via apk, other runtimes from mise)
RUN apk add --no-cache \
    git curl wget jq zsh bash \
    build-base openssh-client \
    nodejs npm \
    github-cli mise \
    libstdc++ \
    coreutils findutils grep

# Bun paths
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Mise/Rust paths
ENV MISE_DATA_DIR=/opt/mise \
    MISE_CONFIG_DIR=/opt/mise/config \
    RUSTUP_HOME=/opt/rustup \
    CARGO_HOME=/opt/cargo \
    PATH="/opt/mise/shims:/opt/cargo/bin:${PATH}"

# Copy tool binaries
COPY --from=tool-ripgrep /root/.cargo/bin/rg /usr/local/bin/
COPY --from=tool-fd /root/.cargo/bin/fd /usr/local/bin/
COPY --from=tool-sd /root/.cargo/bin/sd /usr/local/bin/
COPY --from=tool-starship /root/.cargo/bin/starship /usr/local/bin/
COPY --from=bun-tools /usr/local/bun /usr/local/bun
COPY --from=mise-tools /opt/mise /opt/mise
COPY --from=mise-tools /opt/rustup /opt/rustup
COPY --from=mise-tools /opt/cargo /opt/cargo

# Create non-root user
RUN addgroup -g 1000 yolo && adduser -u 1000 -G yolo -h /home/yolo -s /bin/zsh -D yolo
ENV HOME=/home/yolo

# Shell setup
RUN printf '%s\n' \
    'eval "$(starship init zsh)"' \
    'alias cc="claude --dangerously-skip-permissions"' \
    'alias co="codex --full-auto"' \
    >> /home/yolo/.zshrc \
    && printf '%s\n' \
    'eval "$(starship init bash)"' \
    'alias cc="claude --dangerously-skip-permissions"' \
    'alias co="codex --yolo"' \
    >> /home/yolo/.bashrc

# Prepare writable directories owned by yolo user
RUN mkdir -p /work /home/yolo/.claude /home/yolo/.codex /home/yolo/.cache \
    && chown -R yolo:yolo /work /home/yolo

# Entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER yolo
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["zsh"]
