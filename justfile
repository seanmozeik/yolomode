# Build the yolomode CLI binary
build:
  bun build --compile --minify --bytecode --format esm src/cli.ts --outfile yolomode

# Install to /usr/local/bin
install: build
  cp yolomode /usr/local/bin/yolomode
  @echo "Installed yolomode to /usr/local/bin/yolomode"

# Run in dev mode (no compile)
dev *args:
  bun run src/cli.ts {{args}}
