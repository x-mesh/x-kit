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
ok "Installed dispatcher: $DEST"

# --- PATH check ---
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  warn "$BIN_DIR is not on PATH."
  warn "Add to your shell profile:"
  warn "  export PATH=\"$BIN_DIR:\$PATH\""
fi

# --- Install marketplace plugins ---
# Expectation: `curl | bash` should install everything, not just the wrapper.
if command -v claude >/dev/null 2>&1; then
  info "Installing x-kit plugins via claude CLI..."

  # Register marketplace (idempotent; quiet on already-registered)
  claude plugin marketplace add x-mesh/x-kit >/dev/null 2>&1 || true

  MARKETPLACE_JSON=""
  if [ -f "$(dirname "$SRC_LOCAL")/../../.claude-plugin/marketplace.json" ]; then
    MARKETPLACE_JSON="$(cat "$(dirname "$SRC_LOCAL")/../../.claude-plugin/marketplace.json" 2>/dev/null || echo "")"
  fi
  if [ -z "$MARKETPLACE_JSON" ]; then
    MARKETPLACE_JSON="$(curl -fsSL "$REPO_URL/.claude-plugin/marketplace.json" 2>/dev/null || echo "")"
  fi

  PLUGINS=""
  if [ -n "$MARKETPLACE_JSON" ]; then
    PLUGINS="$(printf '%s' "$MARKETPLACE_JSON" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{const j=JSON.parse(s);console.log(j.plugins.map(p=>p.name).join(" "))}catch{}})' 2>/dev/null || echo "")"
  fi

  if [ -z "$PLUGINS" ]; then
    warn "Could not fetch plugin list. Install plugins manually:"
    warn "  claude plugin install x-kit@x-kit -s user"
  else
    for p in $PLUGINS; do
      info "  → $p"
      if ! claude plugin install "$p@x-kit" -s user >/dev/null 2>&1; then
        warn "    install failed (try manually: claude plugin install $p@x-kit -s user)"
      fi
    done
    ok "Plugins installed. Run /reload-plugins in Claude Code to activate."
  fi
else
  warn "claude CLI not on PATH — skipping plugin install."
  warn "Install inside Claude Code: /plugin install <name>@x-kit"
  warn "Available: x-kit, x-build, x-agent, x-op, x-solver, x-review, x-trace, x-memory, x-eval, x-probe, x-humble, x-dashboard"
fi

# --- Verify ---
if "$DEST" version >/dev/null 2>&1; then
  ok "x-kit CLI ready. Try: x-kit help"
  ok "Next: run 'x-kit init' to install global Skill-tracing hook into ~/.claude/"
else
  warn "Install completed but version check failed. Check 'x-kit which' for lib resolution."
fi
