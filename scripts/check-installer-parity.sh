#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CANONICAL_PATH="${CLAWPAD_CANONICAL_INSTALLER_PATH:-$ROOT_DIR/public/install.sh}"
WEBSITE_PATH="${CLAWPAD_WEBSITE_INSTALLER_PATH:-/Users/mhmdez/Documents/ClawPad/website/public/install.sh}"
STRICT="${CLAWPAD_INSTALLER_PARITY_STRICT:-0}"

if [[ ! -f "$CANONICAL_PATH" ]]; then
  echo "Canonical installer not found: $CANONICAL_PATH" >&2
  exit 1
fi

if [[ ! -f "$WEBSITE_PATH" ]]; then
  if [[ "$STRICT" == "1" ]]; then
    echo "Website installer not found: $WEBSITE_PATH" >&2
    exit 1
  fi
  echo "[installer-parity] Skipped: website installer not found at $WEBSITE_PATH"
  exit 0
fi

if cmp -s "$CANONICAL_PATH" "$WEBSITE_PATH"; then
  echo "[installer-parity] OK: canonical installer matches website installer"
  exit 0
fi

echo "[installer-parity] MISMATCH: canonical installer differs from website installer" >&2
diff -u "$WEBSITE_PATH" "$CANONICAL_PATH" || true
exit 1
