# yolomode

Run Claude Code or Codex inside disposable Alpine containers. Each session gets its own copy of your repo. If the agent wrecks the git history or deletes half the codebase, your host machine never knows.

Sessions run in parallel. Launch five at once, each working a different problem, then cherry-pick the results.

## Prerequisites

- Docker or OrbStack
- [Bun](https://bun.sh) (for building from source)
- Claude Code authenticated on your Mac (`claude login`)
- Codex authenticated on your Mac (`codex login`), if using Codex

## Install

```
git clone <repo-url> && cd yolomode
just build && just install
```

This compiles the CLI to a single binary and copies it to `/usr/local/bin/yolomode`.

## Usage

### Build the Docker image

```
yolomode build
```

First build pulls Alpine, installs mise (python, go, zig, rust), Bun, Claude Code, Codex, ripgrep, fd, sd, starship, and the usual build tools. Takes a few minutes. Subsequent builds hit cache.

### Start a session

```
yolomode run
```

This creates a named container (e.g., `swift-fox`), copies your repo into it (respecting `.gitignore`), injects credentials for both Claude and Codex, and drops you into a zsh shell.

From there, install deps, poke around, and launch whichever agent you want:

```
claude --dangerously-skip-permissions
codex --full-auto
```

### Reattach to a session

```
yolomode attach swift-fox
```

The container keeps its state after exit. Pick up where you left off.

### List sessions

```
yolomode ls
```

### Review changes

```
yolomode diff swift-fox
```

Shows a unified diff of all changes made inside the session compared to the original repo. Pipe to a file or use for review before applying.

### Apply changes

```
yolomode apply swift-fox
```

Creates a new git branch (`yolomode/swift-fox`), applies the session's diff as a commit, then switches back to your original branch. Your working tree must be clean.

### Extract full working tree

```
yolomode sync swift-fox
```

Copies the container's entire `/work` directory to `.yolomode/swift-fox/` on the host. Useful when you want to inspect beyond just the diff.

### Cleanup

```
yolomode rm swift-fox     # remove one session
yolomode rm --all         # remove all stopped sessions
```

### Force rebuild

```
yolomode build --no-cache
```

Builds from scratch, no cache. Use after bumping tool versions or modifying the Dockerfile.

## How isolation works

Your working directory is mounted read-only at `/src` inside the container. On first boot, the entrypoint copies everything (tracked and untracked files, excluding gitignored paths) into `/work`. The agent operates on that copy. The host filesystem is never written to.

## Authentication

Claude Code: OAuth tokens extracted from the macOS keychain and injected into the container.
Codex: `~/.codex/auth.json` read from disk and injected.
Both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are passed through from host env if set.

## What's in the box

Installed via mise: python 3.13, go, zig, rust, uv.
Installed via apk: node, git, curl, jq, zsh, build-base, openssh, github-cli.
Installed via Bun: Claude Code, Codex.
Installed via cargo-binstall: ripgrep, fd, sd, starship.
Your starship.toml is mounted into the container if it exists.

## Development

```
just dev run          # run CLI without compiling
just dev ls           # any command works
just build            # compile binary
just install          # compile + copy to /usr/local/bin
```
