#!/usr/bin/env bash
set -euo pipefail

# x-sync installer — server or client mode
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/x-mesh/x-kit/main/x-sync/install.sh | bash -s server
#   curl -fsSL https://raw.githubusercontent.com/x-mesh/x-kit/main/x-sync/install.sh | bash -s client

MODE="${1:-}"
BIN_DIR="${XM_BIN_DIR:-$HOME/.local/bin}"
REPO_URL="https://raw.githubusercontent.com/x-mesh/x-kit/main"

info()  { printf '\033[0;34m[x-sync]\033[0m %s\n' "$1"; }
error() { printf '\033[0;31m[x-sync]\033[0m %s\n' "$1" >&2; }
ok()    { printf '\033[0;32m[x-sync]\033[0m %s\n' "$1"; }

ensure_bin_dir() {
  mkdir -p "$BIN_DIR"
  if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    info "Add to your shell profile:"
    info "  export PATH=\"$BIN_DIR:\$PATH\""
  fi
}

install_server() {
  info "Installing x-sync server..."

  # Check for bun
  if ! command -v bun &>/dev/null; then
    info "Bun not found. Installing..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
  fi

  ensure_bin_dir

  # Download server script
  local server_dir="$HOME/.local/share/x-sync"
  mkdir -p "$server_dir"
  curl -fsSL "$REPO_URL/x-sync/lib/x-sync-server.mjs" -o "$server_dir/x-sync-server.mjs"

  # Create wrapper
  cat > "$BIN_DIR/x-sync-server" << 'WRAPPER'
#!/usr/bin/env bash
exec bun "$HOME/.local/share/x-sync/x-sync-server.mjs" "$@"
WRAPPER
  chmod +x "$BIN_DIR/x-sync-server"

  ok "Installed: $BIN_DIR/x-sync-server"
  info ""
  info "Usage:"
  info "  XM_SYNC_API_KEY=secret x-sync-server"
  info "  XM_SYNC_API_KEY=secret x-sync-server --port 19842"
  info ""
  info "Or use Docker:"
  info "  docker run -d -p 19842:19842 -e XM_SYNC_API_KEY=secret ghcr.io/x-mesh/x-sync:latest"
}

install_client() {
  info "Installing x-sync client..."

  ensure_bin_dir

  # Download client scripts
  local lib_dir="$HOME/.local/share/x-sync"
  mkdir -p "$lib_dir"
  for f in sync-push.mjs sync-pull.mjs sync-config.mjs; do
    curl -fsSL "$REPO_URL/x-kit/lib/x-sync/$f" -o "$lib_dir/$f"
  done

  # Create unified CLI wrapper
  cat > "$BIN_DIR/x-sync" << 'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

LIB_DIR="$HOME/.local/share/x-sync"
CMD="${1:-help}"
shift 2>/dev/null || true

case "$CMD" in
  push)   exec node "$LIB_DIR/sync-push.mjs" "$@" ;;
  pull)   exec node "$LIB_DIR/sync-pull.mjs" "$@" ;;
  setup)
    read -rp "Server URL (e.g. http://vps:19842): " url
    read -rp "API Key: " key
    node -e "
      import { readSyncConfig, writeSyncConfig } from '$LIB_DIR/sync-config.mjs';
      const c = readSyncConfig();
      c.server_url = '$url'; c.api_key = '$key';
      writeSyncConfig(c);
      console.log('Saved to ~/.xm/sync.json');
      console.log('Machine ID:', c.machine_id);
    "
    ;;
  status)
    echo "=== Config ==="
    cat ~/.xm/sync.json 2>/dev/null || echo "Not configured (run: x-sync setup)"
    echo ""
    echo "=== Last Sync ==="
    cat .xm/.sync-state.json 2>/dev/null || echo "No sync history in this project"
    ;;
  *)
    echo "x-sync — Multi-machine .xm/ state sync"
    echo ""
    echo "Commands:"
    echo "  x-sync setup    Configure server URL and API key"
    echo "  x-sync push     Push .xm/ to sync server"
    echo "  x-sync pull     Pull from sync server"
    echo "  x-sync status   Show config and sync state"
    ;;
esac
WRAPPER
  chmod +x "$BIN_DIR/x-sync"

  ok "Installed: $BIN_DIR/x-sync"
  info ""
  info "Usage:"
  info "  x-sync setup     # configure server connection"
  info "  x-sync push      # push .xm/ state"
  info "  x-sync pull      # pull remote state"
}

case "$MODE" in
  server) install_server ;;
  client) install_client ;;
  *)
    echo "x-sync installer"
    echo ""
    echo "Usage:"
    echo "  bash install.sh server   # Install sync server (remote VPS)"
    echo "  bash install.sh client   # Install sync client (local machine)"
    exit 1
    ;;
esac
