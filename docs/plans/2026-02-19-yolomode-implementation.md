# yolomode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a containerized Claude Code runner with isolated sessions that can run in parallel and sync changes back to host.

**Architecture:** Dockerfile (multi-stage Alpine with kitchen-sink dev tools) + entrypoint.sh (copies CWD on first run) + Justfile (session management recipes). No docker-compose.

**Tech Stack:** Docker/OrbStack, Alpine Linux, Bun, mise, cargo-binstall, just

---

### Task 1: Entrypoint Script

**Files:**
- Create: `entrypoint.sh`

**Step 1: Write entrypoint.sh**

```bash
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
```

**Step 2: Commit**

```bash
git add entrypoint.sh
git commit -m "Add entrypoint script for CWD isolation"
```

---

### Task 2: Dockerfile — cargo-base and Rust tool stages

**Files:**
- Create: `Dockerfile`

**Step 1: Write the parallel tool stages**

Reference `/Users/sean/dev/brad/openclaw-container-setup/Dockerfile` for the cargo-binstall pattern.

```dockerfile
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
```

**Step 2: Commit**

```bash
git add Dockerfile
git commit -m "Add Dockerfile with cargo-base and Rust tool stages"
```

---

### Task 3: Dockerfile — Bun + Claude Code stage

**Files:**
- Modify: `Dockerfile`

**Step 1: Add the bun-tools stage**

Append after the Rust tool stages:

```dockerfile
# ---- Bun + Claude Code ----
FROM debian:bookworm-slim AS bun-tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl bash ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="$BUN_INSTALL/bin:$PATH"
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local/bun bash
RUN bun install -g @anthropic-ai/claude-code
```

**Step 2: Commit**

```bash
git add Dockerfile
git commit -m "Add Bun + Claude Code stage to Dockerfile"
```

---

### Task 4: Dockerfile — mise tools stage (Go, Rust, Python, uv)

**Files:**
- Modify: `Dockerfile`

**Step 1: Add the mise-tools stage**

```dockerfile
# ---- Language runtimes via mise ----
FROM docker.io/jdxcode/mise:latest AS mise-tools
RUN mkdir -p /opt/mise /opt/rustup /opt/cargo \
    && MISE_DATA_DIR=/opt/mise RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo XDG_DATA_HOME=/opt/mise \
       mise use -g go zig rust uv@latest python@3.13 && mise install
```

**Step 2: Commit**

```bash
git add Dockerfile
git commit -m "Add mise stage for Go, Zig, Rust, Python, uv"
```

---

### Task 5: Dockerfile — Final runtime stage

**Files:**
- Modify: `Dockerfile`

**Step 1: Add the final stage that assembles everything**

```dockerfile
# ---- Final runtime ----
FROM alpine:3.23 AS runtime

# System packages
RUN apk add --no-cache \
    git curl wget jq zsh bash \
    build-base openssh-client \
    python3 nodejs npm \
    github-cli \
    libstdc++ \
    coreutils findutils grep

# Mise/Rust paths
ENV MISE_DATA_DIR=/opt/mise \
    RUSTUP_HOME=/opt/rustup \
    CARGO_HOME=/opt/cargo \
    PATH="/opt/mise/shims:/opt/cargo/bin:${PATH}"

# Bun paths
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Copy tool binaries
COPY --from=tool-ripgrep /root/.cargo/bin/rg /usr/local/bin/
COPY --from=tool-fd /root/.cargo/bin/fd /usr/local/bin/
COPY --from=tool-sd /root/.cargo/bin/sd /usr/local/bin/
COPY --from=tool-starship /root/.cargo/bin/starship /usr/local/bin/
COPY --from=bun-tools /usr/local/bun /usr/local/bun
COPY --from=mise-tools /opt/mise /opt/mise
COPY --from=mise-tools /opt/rustup /opt/rustup
COPY --from=mise-tools /opt/cargo /opt/cargo

# Shell setup
RUN echo 'eval "$(starship init zsh)"' >> /root/.zshrc \
    && echo 'eval "$(starship init bash)"' >> /root/.bashrc

# Entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /work
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["claude", "--dangerously-skip-permissions"]
```

**Step 2: Commit**

```bash
git add Dockerfile
git commit -m "Add final runtime stage assembling all tools"
```

---

### Task 6: Justfile

**Files:**
- Create: `justfile`

**Step 1: Write the justfile with all session management recipes**

```just
image := "yolomode"

# Build the Docker image
build:
  docker build -t {{image}} .

# Start a new isolated session
run *args:
  #!/usr/bin/env bash
  set -euo pipefail
  id=$(head -c 4 /dev/urandom | xxd -p | head -c 4)
  name="yolomode-${id}"
  # Extract OAuth credentials from macOS keychain
  creds=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || true)
  echo "Starting session: $name"
  docker run -it \
    --name "$name" \
    -v "$PWD":/src:ro \
    -e ANTHROPIC_API_KEY \
    -e CLAUDE_CREDENTIALS="$creds" \
    {{image}} {{args}}
  echo ""
  echo "Session exited: $name"
  echo "  Reattach:  just attach $name"
  echo "  Extract:   just sync $name"
  echo "  Remove:    just clean $name"

# Attach to an existing session
attach id:
  docker start -ai {{id}}

# List all yolomode sessions
list:
  @docker ps -a --filter "ancestor={{image}}" \
    --format "table {{{{.Names}}}}\t{{{{.Status}}}}\t{{{{.CreatedAt}}}}"

# Extract changes from a session to .yolomode/<id>/
sync id:
  #!/usr/bin/env bash
  set -euo pipefail
  mkdir -p ".yolomode/{{id}}"
  docker cp "{{id}}":/work/. ".yolomode/{{id}}/"
  echo "Extracted to .yolomode/{{id}}/"

# Shell into a running session
shell id:
  docker exec -it -w /work {{id}} zsh

# Remove a session
clean id:
  docker rm {{id}}

# Remove all stopped yolomode sessions
clean-all:
  #!/usr/bin/env bash
  ids=$(docker ps -a --filter "ancestor={{image}}" --filter "status=exited" -q)
  if [ -n "$ids" ]; then
    docker rm $ids
    echo "Cleaned up stopped sessions"
  else
    echo "No stopped sessions to clean"
  fi

# Force rebuild with no cache
rebuild:
  docker build --no-cache -t {{image}} .
```

**Step 2: Commit**

```bash
git add justfile
git commit -m "Add justfile with session management recipes"
```

---

### Task 7: .gitignore

**Files:**
- Create: `.gitignore`

**Step 1: Write .gitignore**

```
.yolomode/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "Ignore .yolomode session output directory"
```

---

### Task 8: Build and smoke test

**Step 1: Build the image**

Run: `just build`
Expected: Docker image builds successfully with all stages completing.

**Step 2: Verify tools are present**

Run: `docker run --rm yolomode sh -c "claude --version && rg --version && fd --version && git --version && bun --version"`
Expected: All tools print version info.

**Step 3: Test session lifecycle**

```bash
# Start a session (will drop into claude, exit immediately with Ctrl+C)
just run
# Check it appears in list
just list
# Extract its state
just sync yolomode-<id>
# Verify .yolomode/<id>/ contains the repo files
ls .yolomode/yolomode-<id>/
# Clean up
just clean yolomode-<id>
```

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "Fix issues found during smoke test"
```
