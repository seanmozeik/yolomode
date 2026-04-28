# yolomode

Run Claude Code, Codex, or Pi Agent inside disposable containers. Each session gets its own copy of your repo. If the agent wrecks the git history or deletes half the codebase, your host machine never knows.

Sessions run in parallel. Launch five at once, each working a different problem, then cherry-pick the results.

## Prerequisites

- Docker or OrbStack
- [Bun](https://bun.sh) (for building from source)
- Claude Code authenticated on your Mac (`claude login`)
- Codex authenticated on your Mac (`codex login`), if using Codex
- Pi Agent authenticated/configured on your Mac (`pi`), if using Pi Agent

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

First build pulls Debian, installs mise (python, go, zig, rust), Bun, Claude Code, Codex, Pi Agent, RTK, `ddg`, ripgrep, fd, sd, starship, and the usual build tools. Takes a few minutes. Subsequent builds hit cache.

### Start a session

```
yolomode run
```

This creates a named container (e.g., `swift-fox`), copies your repo into it (respecting `.gitignore`), injects credentials/config for Claude, Codex, and Pi Agent, and drops you into a shell. The terminal window title is set to `ym-swift-fox` for easy tab identification.

From there, install deps, poke around, and launch whichever agent you want:

```
claude --dangerously-skip-permissions
codex --dangerously-bypass-approvals-and-sandbox
pi
```

#### Import files into a session

Pass one or more `--import` flags to copy host files or directories into `/tmp/imports/` inside the container (ephemeral — gone when the session ends):

```
yolomode run --import ~/Downloads/research.md --import ~/Downloads/data/
```

#### Publish dev server ports to host

Pass one or more `--port` flags on `run` to make container services reachable at `localhost` on the host:

```bash
# same host/container port
yolomode run --port 3000 --port 5173

# custom host -> container mapping
yolomode run --port 8080:3000
```

`--port` accepts either `CONTAINER_PORT` or `HOST_PORT:CONTAINER_PORT`, and binds to `127.0.0.1` only.

For already-running sessions, use `forward`:

```bash
# if exactly one running session
yolomode forward 3000

# pick a specific session
yolomode forward 3000 swift-fox
yolomode forward 8080:3000 swift-fox
```

If the requested localhost port is busy, yolomode picks the next available port automatically.

### Reattach to a session

```
yolomode attach swift-fox
```

The container keeps its state after exit. Pick up where you left off. You can also import files on attach:

```
yolomode attach swift-fox --import ~/Downloads/new-context.md
```

### List sessions

```
yolomode ls
```

Shows all sessions with their name, source project, status, and creation time. Sessions launched from the same directory show the same project name.

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

## Ralph: Autonomous PRD Loop

Ralph is an autonomous implementation loop built into yolomode. It repeatedly runs Claude Code or Codex against a `prd.json` file, picking the highest-priority incomplete story each iteration, implementing it, running quality checks, committing, and marking it done. The loop exits when all stories are complete.

### Running from the host

```
yolomode ralph claude swift-fox
yolomode ralph claude swift-fox --max 20
yolomode ralph claude swift-fox prd1.json prd2.json
yolomode ralph codex -- --model gpt-5-codex
yolomode ralph codex --max 20 -- --model gpt-5-codex
yolomode ralph pi -- --model lmstudio/qwen
```

This runs the loop from your host machine, targeting a named container. Output streams in real time. Defaults to 10 iterations. If only one session is running, the name is optional. Agent-specific flags can be passed after `--`.

### Running inside a container

The `ralph` command is also available on PATH inside every container:

```
ralph claude                         # reads ./prd.json, 10 iterations
ralph claude --max 20                # custom iteration limit
ralph claude prd1.json prd2.json     # two PRDs in parallel
ralph claude -- --model sonnet       # pass --model to the agent via --
ralph codex -- --model gpt-5-codex
ralph pi -- --model lmstudio/qwen
```

#### Parallel PRD loops

When running multiple PRD files in parallel, each loop's output is prefixed with the PRD filename stem (e.g., `[prd1]`, `[prd2]`). Running more than 3 simultaneous loops is not recommended — each loop spawns a full AI agent session.

### PRD format

Create a `prd.json` in your project root:

```json
{
  "name": "My Feature",
  "branchName": "ralph/my-feature",
  "description": "What this feature does",
  "stories": [
    {
      "id": "story-1",
      "title": "Add database schema",
      "description": "Create the users table with email and name columns",
      "priority": 1,
      "status": "pending",
      "acceptanceCriteria": [
        "Migration file exists",
        "Typecheck passes"
      ]
    }
  ]
}
```

## Shell Completions

Generate completion scripts for your shell:

```bash
# Bash — add to ~/.bashrc
eval "$(yolomode completions bash)"

# Zsh — add to ~/.zshrc
eval "$(yolomode completions zsh)"

# Fish — add to ~/.config/fish/config.fish
yolomode completions fish | source

# Nushell — save and source in config.nu
yolomode completions nu | save -f ~/.config/nushell/yolomode.nu
source ~/.config/nushell/yolomode.nu
```

Completions include all subcommands, flags, and dynamic session name completion (for attach, diff, apply, sync, rm, ralph).

### Aliases

If you alias `yolomode` (e.g. `alias ym=yolomode`), pass the alias name as an extra argument to register completions for it too:

```bash
# Bash
eval "$(yolomode completions bash ym)"

# Zsh
eval "$(yolomode completions zsh ym)"

# Fish
yolomode completions fish ym | source
```

Multiple aliases are supported: `yolomode completions zsh ym y`.

For Nushell, define the alias in `config.nu` yourself, then pass it when generating completions — it adds `export extern "ym <subcommand>"` blocks so tab completion works on the alias:

```nu
# config.nu
alias ym = yolomode

# generate completions (run once, then source)
yolomode completions nu ym | save -f ~/.config/nushell/yolomode.nu
source ~/.config/nushell/yolomode.nu
```

## Configuration

### Claude Code settings

Place a `settings.json` at `~/.config/yolomode/settings.json` (or `$XDG_CONFIG_HOME/yolomode/settings.json`) to inject Claude Code settings into every session. This file is copied into the container as `~/.claude/settings.json`.

### Codex settings

Place a `config.toml` at `~/.config/yolomode/config.toml` (or `$XDG_CONFIG_HOME/yolomode/config.toml`) to inject Codex settings into every session. This file is copied into the container as `~/.codex/config.toml`.

### Pi Agent settings

Yolomode copies `~/.pi/agent` into each session, including `settings.json`, `models.json`, `auth.json`, prompts, themes, tools, and the extension package list in `settings.json`. Session history is not copied. NPM packages listed as Pi extensions are copied from the host global npm root into the container's global npm root so Pi can load the same extensions without reinstalling them. Local model URLs such as `http://localhost:1234/v1` are rewritten to `http://host.docker.internal:1234/v1` so Pi Agent can reach host services from inside Docker.

### What gets mounted

| Host path | Container path | Notes |
|-----------|---------------|-------|
| `~/.claude/skills/` | `~/.claude/skills/` | Read-only, plus bundled ralph skill |
| `~/.claude/plugins/` | `~/.claude/plugins/` | Read-only |
| `~/.claude/CLAUDE.md` | `~/.claude/CLAUDE.md` | Read-only |
| `~/.claude/RTK.md` | `~/.claude/RTK.md` | Read-only, if present |
| `~/.codex/AGENTS.md` | `~/.codex/AGENTS.md` | Preprocessed so `@RTK.md` resolves in-container |
| `~/.codex/RTK.md` | `~/.codex/RTK.md` | Read-only, if present |
| `~/.config/yolomode/settings.json` | `~/.claude/settings.json` | Copied by entrypoint |
| `~/.config/yolomode/config.toml` | `~/.codex/config.toml` | Copied by entrypoint |
| `~/.pi/agent/` | `~/.pi/agent/` | Preprocessed; sessions omitted; local model URLs rewritten; RTK context added |
| Host global npm Pi extension packages | `~/.local/lib/node_modules/` | Copied from packages listed in `~/.pi/agent/settings.json` |
| `~/.config/starship.toml` | `~/.config/starship.toml` | Read-only |
| `~/.claude.json` | `~/.claude.json` | Preprocessed (installMethod stripped) |

## How isolation works

Your working directory is mounted read-only at `/src` inside the container. On first boot, the entrypoint copies everything (tracked and untracked files, excluding gitignored paths) into `/work`. The agent operates on that copy. The host filesystem is never written to.

## Environment parity

Container startup enforces a deterministic Codex environment by:
- Applying a fixed toolchain `PATH` in entrypoint and `/etc/profile.d/codex-env.sh`
- Running `mise reshim` to reconcile shims
- Running `/usr/local/bin/verify-codex-env.sh` and failing startup if required vars/tools are missing

You can run the verifier manually inside a session:

```sh
verify-codex-env.sh
```

## Authentication

Claude Code: OAuth tokens extracted from the macOS keychain and injected into the container.
Codex: `~/.codex/auth.json` read from disk and injected.
Pi Agent: `~/.pi/agent/auth.json` read from disk and injected.
Both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are passed through from host env if set.

## What's in the box

Installed via mise: python 3.13, go, zig, rust, uv.
Installed via apk: node, git, curl, jq, zsh, build-base, openssh, github-cli.
Installed via Bun: Claude Code, Codex, Pi Agent, ddg.
Installed from release binaries: RTK.
Installed via cargo-binstall: ripgrep, fd, sd, starship.
Your starship.toml is mounted into the container if it exists.

## Project structure

```
src/
  cli.ts          Entry point + command dispatcher
  constants.ts    Shared constants (image name, session name words)
  utils.ts        Shared utilities (docker helpers, arg parsing, output)
  cmd-run.ts      `run` command (session creation, mounts, credentials)
  cmd-apply.ts    `apply` command (patch extraction and git workflow)
  cmd-ralph.ts    `ralph` command (autonomous loop + text imports)
  completions.ts  Shell completion scripts (bash, zsh, fish, nushell)
Dockerfile        Multi-stage Debian build
entrypoint.sh     Container startup (credential copy, repo init)
ralph.sh          In-container autonomous loop script
```

## Development

```
just dev run          # run CLI without compiling
just dev ls           # any command works
just build            # compile binary
just install          # compile + copy to /usr/local/bin
```
