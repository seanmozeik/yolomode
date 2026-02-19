image := "yolomode"

# Build the Docker image
build:
  docker build -t {{image}} .

# Start a new isolated session (drops into zsh)
run:
  #!/usr/bin/env bash
  set -euo pipefail
  adjectives=(bold brave calm cool deft fast keen fond mild sharp slim snug warm wild wise swift quiet grand stark vivid)
  animals=(fox owl elk yak emu ape ram cod jay bee ant bat cat dog hen rat pig cow elk bug)
  adj=${adjectives[$((RANDOM % ${#adjectives[@]}))]}
  noun=${animals[$((RANDOM % ${#animals[@]}))]}
  name="yolomode-${adj}-${noun}"
  # Extract Claude Code OAuth credentials from macOS keychain
  claude_creds=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || true)
  # Extract Codex auth from ~/.codex/auth.json
  codex_auth=""
  if [ -f "$HOME/.codex/auth.json" ]; then
    codex_auth=$(cat "$HOME/.codex/auth.json")
  fi
  # Optional host mounts (read-only)
  optional_mounts=()
  starship_cfg="${XDG_CONFIG_HOME:-$HOME/.config}/starship.toml"
  if [ -f "$starship_cfg" ]; then
    optional_mounts+=(-v "$starship_cfg":/home/yolo/.config/starship.toml:ro)
  fi
  if [ -d "$HOME/.claude/skills" ]; then
    optional_mounts+=(-v "$HOME/.claude/skills":/home/yolo/.claude/skills:ro)
  fi
  if [ -d "$HOME/.claude/plugins" ]; then
    optional_mounts+=(-v "$HOME/.claude/plugins":/home/yolo/.claude/plugins:ro)
  fi
  echo "Starting session: $name"
  docker run -it \
    --name "$name" \
    -v "$PWD":/src:ro \
    "${optional_mounts[@]}" \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --tmpfs /tmp:nosuid,size=500m \
    -e ANTHROPIC_API_KEY \
    -e OPENAI_API_KEY \
    -e CLAUDE_CREDENTIALS="$claude_creds" \
    -e CODEX_AUTH="$codex_auth" \
    {{image}}
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
