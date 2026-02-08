#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CANONICAL_PATH="${CLAWPAD_CANONICAL_INSTALLER_PATH:-$ROOT_DIR/public/install.sh}"
LIVE_URL="${CLAWPAD_INSTALLER_URL:-https://clawpad.io/install.sh}"

if [[ ! -f "$CANONICAL_PATH" ]]; then
  echo "Canonical installer not found: $CANONICAL_PATH" >&2
  exit 1
fi

TMP_FILE="$(mktemp)"
cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi
  shasum -a 256 "$1" | awk '{print $1}'
}

curl -fsSL "$LIVE_URL" -o "$TMP_FILE"

canonical_hash="$(hash_file "$CANONICAL_PATH")"
live_hash="$(hash_file "$TMP_FILE")"

if [[ "$canonical_hash" != "$live_hash" ]]; then
  echo "[installer-live] MISMATCH: live installer hash differs from canonical" >&2
  echo "canonical: $canonical_hash" >&2
  echo "live:      $live_hash" >&2
  exit 1
fi

echo "[installer-live] OK: live installer hash matches canonical"
