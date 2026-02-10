#!/usr/bin/env bash
set -euo pipefail

# ClawPad install script (user-local)
# Usage: curl -fsSL https://clawpad.io/install.sh | bash

MIN_NODE_MAJOR=18
INSTALL_PREFIX="${CLAWPAD_PREFIX:-$HOME/.local}"
INSTALL_TIMEOUT_SECONDS="${CLAWPAD_INSTALL_TIMEOUT_SECONDS:-180}"

echo "ClawPad installer"
echo "[1/5] Checking Node.js..."

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

echo "[2/5] Preparing install prefix: ${INSTALL_PREFIX}"
mkdir -p "${INSTALL_PREFIX}/bin"

# Make npm quieter and avoid long post-install checks
export NPM_CONFIG_FUND=false
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_UPDATE_NOTIFIER=false
export NPM_CONFIG_PROGRESS=false

echo "[3/5] Installing ClawPad (this can take a minute)..."

# Install clawpad CLI into user prefix
install_args=(install -g clawpad --prefix "${INSTALL_PREFIX}")
install_exit=0

if command -v timeout >/dev/null 2>&1; then
  set +e
  timeout "${INSTALL_TIMEOUT_SECONDS}" npm "${install_args[@]}"
  install_exit=$?
  set -e
  if [ "${install_exit}" -eq 124 ]; then
    echo "Install timed out after ${INSTALL_TIMEOUT_SECONDS}s." >&2
    echo "Re-run with a longer timeout, for example:" >&2
    echo "  CLAWPAD_INSTALL_TIMEOUT_SECONDS=420 curl -fsSL https://clawpad.io/install.sh | bash" >&2
    exit 1
  fi
elif ! npm "${install_args[@]}"; then
  install_exit=$?
fi

if [ "${install_exit}" -ne 0 ]; then
  echo "Install failed (npm exit ${install_exit})." >&2
  echo "Try again with verbose logs:" >&2
  echo "  npm install -g clawpad --prefix \"${INSTALL_PREFIX}\" --loglevel verbose" >&2
  exit "${install_exit}"
fi

# Best-effort QMD install
echo "[4/5] Checking QMD (best-effort)"
if [ "${CLAWPAD_SKIP_QMD:-0}" = "1" ]; then
  echo "Skipping QMD install (CLAWPAD_SKIP_QMD=1)."
elif command -v qmd >/dev/null 2>&1; then
  echo "QMD already installed."
elif [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
  if brew install qmd; then
    echo "QMD installed with Homebrew."
  else
    echo "QMD install failed via Homebrew (continuing)." >&2
  fi
elif [ "$(uname -s)" = "Linux" ] && command -v curl >/dev/null 2>&1; then
  if curl -fsSL https://raw.githubusercontent.com/tobi/qmd/main/install.sh | bash; then
    echo "QMD installed from upstream installer."
  else
    echo "QMD install failed via upstream script (continuing)." >&2
  fi
else
  echo "QMD auto-install skipped: unsupported platform or missing installer dependency."
fi

if command -v qmd >/dev/null 2>&1; then
  echo "QMD ready: $(qmd --version 2>/dev/null || echo qmd)"
else
  echo "QMD unavailable. You can install it later for semantic search."
fi

# Add prefix bin to PATH if needed
echo "[5/5] Finalizing PATH setup"
if ! echo "$PATH" | grep -q "${INSTALL_PREFIX}/bin"; then
  if [ -f "$HOME/.bashrc" ]; then
    echo "export PATH=\"${INSTALL_PREFIX}/bin:\$PATH\"" >> "$HOME/.bashrc"
  fi
  if [ -f "$HOME/.zshrc" ]; then
    echo "export PATH=\"${INSTALL_PREFIX}/bin:\$PATH\"" >> "$HOME/.zshrc"
  fi
  export PATH="${INSTALL_PREFIX}/bin:$PATH"
fi

echo "ClawPad installed successfully. Run: clawpad"
echo "If the command isn't found, restart your shell or run: export PATH=\"${INSTALL_PREFIX}/bin:\$PATH\""
