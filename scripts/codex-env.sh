#!/bin/sh
# Deterministic environment baseline for login/non-interactive shells.
export BUN_INSTALL=/usr/local/bun
export MISE_DATA_DIR=/opt/mise
export MISE_CONFIG_DIR=/opt/mise/config
export RUSTUP_HOME=/opt/rustup
export CARGO_HOME=/home/yolo/.cargo
export GOPATH=/home/yolo/go
export UV_CACHE_DIR=/home/yolo/.cache/uv
export UV_LINK_MODE=copy
export UV_TOOL_BIN_DIR=/home/yolo/.local/bin
export npm_config_prefix=/home/yolo/.local
export npm_config_cache=/home/yolo/.cache/npm
export PIP_CACHE_DIR=/home/yolo/.cache/pip
export PLAYWRIGHT_BROWSERS_PATH=/opt/playwright

# Keep this in sync with Dockerfile + entrypoint for Codex parity.
export PATH="/opt/agent-browser/bin:/home/yolo/.cargo/bin:/home/yolo/go/bin:/home/yolo/.local/bin:/usr/local/bun/bin:/opt/mise/shims:/opt/cargo/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
