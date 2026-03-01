# Build the yolomode CLI binary
build:
  bun run build
  rm -f .*.bun-build

# Install to /usr/local/bin
install: build
  cp yolomode /usr/local/bin/yolomode
  @echo "Installed yolomode to /usr/local/bin/yolomode"

# Run in dev mode (no compile)
dev *args:
  bun run src/cli.ts {{args}}

# Build the Docker image (passes host gh auth token to avoid rate limiting)
docker-build *args:
  GITHUB_TOKEN=$(gh auth token) docker build --secret id=gh_token,env=GITHUB_TOKEN {{args}} .
