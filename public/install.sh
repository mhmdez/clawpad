#!/usr/bin/env bash
set -euo pipefail

# ClawPad install script (user-local)
# Usage: curl -fsSL https://clawpad.app/install.sh | bash

MIN_NODE_MAJOR=18
INSTALL_PREFIX="${CLAWPAD_PREFIX:-$HOME/.local}"

if ! command -v node >/dev/null 2>&1; then
  echo "ClawPad requires Node.js ${MIN_NODE_MAJOR}+." >&2
  echo "Install Node.js first, then re-run this script." >&2
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
if [ "${NODE_MAJOR}" -lt "${MIN_NODE_MAJOR}" ]; then
  echo "ClawPad requires Node.js ${MIN_NODE_MAJOR}+ (found v$(node -v))." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to install ClawPad." >&2
  exit 1
fi

mkdir -p "${INSTALL_PREFIX}/bin"

# Install clawpad CLI into user prefix
npm install -g clawpad --prefix "${INSTALL_PREFIX}"

# Add prefix bin to PATH if needed
if ! echo "$PATH" | grep -q "${INSTALL_PREFIX}/bin"; then
  if [ -f "$HOME/.bashrc" ]; then
    echo "export PATH=\"${INSTALL_PREFIX}/bin:\$PATH\"" >> "$HOME/.bashrc"
  fi
  if [ -f "$HOME/.zshrc" ]; then
    echo "export PATH=\"${INSTALL_PREFIX}/bin:\$PATH\"" >> "$HOME/.zshrc"
  fi
  export PATH="${INSTALL_PREFIX}/bin:$PATH"
fi

echo "ClawPad installed. Run: clawpad"
