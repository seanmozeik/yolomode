# ==================================================
# yolomode: Alpine + kitchen-sink dev tools + Claude Code
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

# ---- Language runtimes via mise (node, bun, python, go, zig, rust) ----
FROM docker.io/jdxcode/mise:latest AS mise-tools
RUN mkdir -p /opt/mise /opt/rustup /opt/cargo \
    && MISE_DATA_DIR=/opt/mise RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo XDG_DATA_HOME=/opt/mise \
       mise use -g node bun go zig rust uv@latest python@3.13 && mise install

# ---- Claude Code (installed via mise's bun) ----
FROM mise-tools AS bun-tools
ENV MISE_DATA_DIR=/opt/mise
ENV PATH="/opt/mise/shims:${PATH}"
RUN bun install -g @anthropic-ai/claude-code

# ---- Final runtime ----
FROM alpine:3.23 AS runtime

# System packages (runtimes come from mise, not apk)
RUN apk add --no-cache \
    git curl wget jq zsh bash \
    build-base openssh-client \
    github-cli \
    libstdc++ \
    coreutils findutils grep

# Mise/Rust paths
ENV MISE_DATA_DIR=/opt/mise \
    RUSTUP_HOME=/opt/rustup \
    CARGO_HOME=/opt/cargo \
    PATH="/opt/mise/shims:/opt/cargo/bin:${PATH}"

# Copy tool binaries
COPY --from=tool-ripgrep /root/.cargo/bin/rg /usr/local/bin/
COPY --from=tool-fd /root/.cargo/bin/fd /usr/local/bin/
COPY --from=tool-sd /root/.cargo/bin/sd /usr/local/bin/
COPY --from=tool-starship /root/.cargo/bin/starship /usr/local/bin/
COPY --from=bun-tools /opt/mise /opt/mise
COPY --from=bun-tools /opt/rustup /opt/rustup
COPY --from=bun-tools /opt/cargo /opt/cargo

# Shell setup
RUN echo 'eval "$(starship init zsh)"' >> /root/.zshrc \
    && echo 'eval "$(starship init bash)"' >> /root/.bashrc

# Entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /work
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["claude", "--dangerously-skip-permissions"]
