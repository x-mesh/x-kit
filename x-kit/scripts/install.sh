#!/usr/bin/env bash
# x-kit umbrella CLI installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/x-mesh/x-kit/main/x-kit/scripts/install.sh | bash
#   bash x-kit/scripts/install.sh             # local install from repo
#   X_KIT_BIN_DIR=~/bin bash install.sh       # custom bin dir

set -euo pipefail

BIN_DIR="${X_KIT_BIN_DIR:-$HOME/.local/bin}"
REPO_URL="https://raw.githubusercontent.com/x-mesh/x-kit/main"
SRC_LOCAL="$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")/x-kit"

info()  { printf '\033[0;34m[x-kit]\033[0m %s\n' "$1"; }
ok()    { printf '\033[0;32m[x-kit]\033[0m %s\n' "$1"; }
warn()  { printf '\033[0;33m[x-kit]\033[0m %s\n' "$1"; }
error() { printf '\033[0;31m[x-kit]\033[0m %s\n' "$1" >&2; }

# --- Preflight ---
command -v node >/dev/null || { error "node not found — install Node.js first"; exit 1; }
command -v bun  >/dev/null || warn  "bun not found — required for 'x-kit dashboard'. Install: curl -fsSL https://bun.sh/install | bash"

if [ ! -d "$HOME/.claude/plugins/cache/x-kit" ] && [ -z "${X_KIT_LIB:-}" ]; then
  warn "Claude plugin cache not found at ~/.claude/plugins/cache/x-kit"
  warn "Run: claude plugin install x-kit@x-kit  (or set X_KIT_LIB)"
fi

# --- Install dispatcher ---
mkdir -p "$BIN_DIR"
DEST="$BIN_DIR/x-kit"

if [ -f "$SRC_LOCAL" ]; then
  info "Local install from $SRC_LOCAL"
  cp "$SRC_LOCAL" "$DEST"
else
  info "Downloading dispatcher..."
  curl -fsSL "$REPO_URL/x-kit/scripts/x-kit" -o "$DEST"
fi
chmod +x "$DEST"
ok "Installed: $DEST"

# --- PATH check ---
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  warn "$BIN_DIR is not on PATH."
  warn "Add to your shell profile:"
  warn "  export PATH=\"$BIN_DIR:\$PATH\""
fi

# --- Verify ---
if "$DEST" version 2>/dev/null; then
  ok "x-kit CLI ready. Try: x-kit help"
  ok "Next: run 'x-kit init' to install global Skill-tracing hook into ~/.claude/"
else
  warn "Install completed but version check failed. Check 'x-kit which' for lib resolution."
fi
