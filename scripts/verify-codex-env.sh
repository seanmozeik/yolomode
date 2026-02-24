#!/usr/bin/env sh
set -eu

required_path_entries="
/opt/agent-browser/bin
/home/yolo/.cargo/bin
/home/yolo/go/bin
/home/yolo/.local/bin
/usr/local/bun/bin
/opt/mise/shims
/opt/cargo/bin
"

fail=0

for entry in $required_path_entries; do
  case ":$PATH:" in
    *":$entry:"*) ;;
    *)
      echo "ERROR: PATH missing required entry: $entry" >&2
      fail=1
      ;;
  esac
done

for var in HOME SHELL PATH MISE_DATA_DIR MISE_CONFIG_DIR CARGO_HOME RUSTUP_HOME; do
  value="$(eval "printf '%s' \"\${$var:-}\"")"
  if [ -z "$value" ]; then
    echo "ERROR: required env var missing: $var" >&2
    fail=1
  fi
done

for bin in mise node uv codex claude; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: required command not found on PATH: $bin" >&2
    fail=1
  fi
done

# Cargo and rustc are expected from mise shims in this image.
for bin in cargo rustc; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: expected Rust tool missing on PATH: $bin" >&2
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "codex env verification failed" >&2
  exit 1
fi

echo "codex env verification passed"
