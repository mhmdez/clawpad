#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INSTALLER_PATH="${CLAWPAD_INSTALLER_PATH:-$ROOT_DIR/public/install.sh}"

if [[ ! -f "$INSTALLER_PATH" ]]; then
  echo "Installer script not found: $INSTALLER_PATH" >&2
  exit 1
fi

TMP_ROOT="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

export HOME="$TMP_ROOT/home"
mkdir -p "$HOME"

export CLAWPAD_PREFIX="$TMP_ROOT/prefix"
export NPM_CONFIG_CACHE="$TMP_ROOT/npm-cache"
export NPM_CONFIG_USERCONFIG="$TMP_ROOT/npmrc"
export CLAWPAD_INSTALL_TIMEOUT_SECONDS="${CLAWPAD_INSTALL_TIMEOUT_SECONDS:-300}"

LOG_FILE="$TMP_ROOT/install.log"

echo "[installer-smoke] Running installer smoke test"
if ! bash "$INSTALLER_PATH" >"$LOG_FILE" 2>&1; then
  echo "[installer-smoke] Installer failed. Log output:" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

if ! grep -q "ClawPad installed successfully" "$LOG_FILE"; then
  echo "[installer-smoke] Success marker not found in installer output" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

if [[ ! -x "$CLAWPAD_PREFIX/bin/clawpad" ]]; then
  echo "[installer-smoke] Installed CLI binary missing: $CLAWPAD_PREFIX/bin/clawpad" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

if ! "$CLAWPAD_PREFIX/bin/clawpad" --help >/dev/null 2>&1; then
  echo "[installer-smoke] Installed CLI did not execute successfully" >&2
  exit 1
fi

echo "[installer-smoke] OK"
