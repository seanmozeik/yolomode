# yolomode Design

Run Claude Code in isolated Alpine containers via OrbStack/Docker on Mac. Each session gets its own copy of the codebase — if Claude nukes git history, the host is unaffected. Multiple sessions can run in parallel. Changes are extracted back via `docker cp`.

## Architecture

Single Dockerfile + Justfile + entrypoint script. No docker-compose.

## Session Model

Each `just run` creates a new **session** (a named Docker container):
1. Host CWD is mounted read-only at `/src`
2. Entrypoint copies `/src` to `/work` on first start
3. Claude Code runs in `/work` with full write access
4. Container persists after exit (no `--rm`) — session state is preserved
5. `just attach <id>` reattaches to an existing session
6. `just sync <id>` extracts `/work` to `.yolomode/<id>/` on host
7. `just clean <id>` removes the container

Session names are auto-generated (e.g., `yolomode-a3f8`).

## Dockerfile

Multi-stage Alpine build with parallel BuildKit stages.

**Tool stages (parallel)**:
- `cargo-base` — Alpine with cargo-binstall for fast Rust binary installs
- `tool-ripgrep` — rg via cargo-binstall
- `tool-fd` — fd via cargo-binstall
- `tool-bat` — bat via cargo-binstall (Alpine apk)
- `tool-sd` — sd via cargo-binstall
- `tool-starship` — starship via cargo-binstall
- `bun-tools` — Bun + Claude Code globally installed
- `mise-tools` — Go, Rust, Python 3, uv via mise

**Final stage**:
- Alpine base
- apk: git, curl, jq, zsh, build-base, openssh, gh
- COPY --from each tool stage
- Runs as root (containers are disposable)
- Starship prompt for zsh
- WORKDIR /work

## Entrypoint Script

```bash
#!/bin/sh
set -e

# Inject Claude Code credentials from host keychain (passed via env)
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

On first start: injects OAuth credentials from host keychain, copies read-only mounted CWD into /work. On subsequent starts (reattach): skips copy, uses existing /work state and cached credentials.

## Justfile

```
image := "yolomode"

# Build the Docker image
build:
  docker build -t {{image}} .

# Start a new session (auto-named)
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
  docker ps -a --filter "ancestor={{image}}" --format "table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}"

# Extract changes from a session to .yolomode/<id>/
sync id:
  mkdir -p .yolomode/{{id}}
  docker cp {{id}}:/work/. .yolomode/{{id}}/

# Shell into a running session
shell id:
  docker exec -it {{id}} zsh

# Remove a session
clean id:
  docker rm {{id}}

# Remove all stopped sessions
clean-all:
  docker rm $(docker ps -a --filter "ancestor={{image}}" --filter "status=exited" -q)

# Force rebuild
rebuild:
  docker build --no-cache -t {{image}} .
```

## Authentication

Two methods, checked in priority order by Claude Code:
1. **`ANTHROPIC_API_KEY` env var** — If set on host, passed through directly
2. **macOS Keychain extraction** — Justfile runs `security find-generic-password -s "Claude Code-credentials" -w` to extract OAuth tokens, passes them via `CLAUDE_CREDENTIALS` env var, entrypoint writes to `/root/.claude/.credentials.json` (Claude Code's plaintext credential path)

## Non-Goals

- Multiple AI agent support (Claude Code only)
- Multiple container runtime support (Docker/OrbStack only)
- Security hardening beyond basic container isolation
