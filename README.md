# yolomode

Run Claude Code or Codex inside disposable Alpine containers. Each session gets its own copy of your repo. If the agent wrecks the git history or deletes half the codebase, your host machine never knows.

Sessions run in parallel. Launch five at once, each working a different problem, then cherry-pick the results.

## Prerequisites

- Docker or OrbStack
- [just](https://github.com/casey/just)
- Claude Code authenticated on your Mac (`claude login`)
- Codex authenticated on your Mac (`codex login`), if using Codex

## Build

```
just build
```

First build pulls Alpine, installs mise (python, go, zig, rust), Bun, Claude Code, Codex, ripgrep, fd, sd, starship, and the usual build tools. Takes a few minutes. Subsequent builds hit cache.

## Usage

### Start a session

```
just run
```

This creates a named container (e.g., `yolomode-swift-fox`), copies your repo into it (respecting `.gitignore`), injects credentials for both Claude and Codex, and drops you into a zsh shell.

From there, install deps, poke around, and launch whichever agent you want:

```
claude --dangerously-skip-permissions
codex --full-auto
```

### Reattach to a session

```
just attach yolomode-swift-fox
```

The container keeps its state after exit. Pick up where you left off.

### List sessions

```
just list
```

### Extract changes

```
just sync yolomode-swift-fox
```

Copies the container's working tree to `.yolomode/yolomode-swift-fox/` on the host. Review with `git diff`, apply with `git format-patch` and `git am`, or just copy files over.

### Shell access

```
just shell yolomode-swift-fox
```

Opens a zsh shell inside a running session.

### Cleanup

```
just clean yolomode-swift-fox    # remove one session
just clean-all                    # remove all stopped sessions
```

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

## Force rebuild

```
just rebuild
```

Builds from scratch, no cache. Use after bumping tool versions or modifying the Dockerfile.
