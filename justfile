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
