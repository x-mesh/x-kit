---
name: x-sync
description: Multi-machine .xm/ state sync — server start/stop, push, pull, setup, status
---

<Purpose>
Sync .xm/ project state (traces, plans, build data) across multiple machines via a lightweight Bun HTTP server backed by SQLite.
</Purpose>

<Use_When>
- User says "sync", "push", "pull", "sync server", "동기화"
- User wants to share .xm/ state between machines
- User wants to start/stop the sync server
</Use_When>

<Do_Not_Use_When>
- Git push/pull (use git directly)
- File sync unrelated to .xm/ state (use rsync, etc.)
</Do_Not_Use_When>

# x-sync — Multi-Machine .xm/ Sync

Syncs .xm/ project state across machines. Server stores data in SQLite; clients push/pull via HTTP.

## Model Routing

| Subcommand | Model | Reason |
|------------|-------|--------|
| `status`, `server status` | **haiku** (Agent tool) | Read-only check |
| `push`, `pull` | **haiku** (Agent tool) | Script execution, no reasoning |
| `server start`, `server stop` | **haiku** (Agent tool) | Simple process management |
| `setup` (interactive) | main model | Requires AskUserQuestion |

## Arguments

User provided: `$ARGUMENTS`

## Routing

- Empty or `status` → [Mode: status]
- `setup` → [Mode: setup]
- `server start` → [Mode: server-start]
- `server stop` → [Mode: server-stop]
- `server status` → [Mode: server-status]
- `push` → [Mode: push]
- `pull` → [Mode: pull]

---

## Mode: setup

Interactive wizard to configure sync credentials.

**Step 1: Check current config**

```bash
cat ~/.xm/sync.json 2>/dev/null || echo '{"machine_id": null, "server_url": null, "api_key": null}'
```

**Step 2: Ask for server URL**

Use AskUserQuestion:
```
x-sync 서버 URL을 입력하세요 (예: http://my-server:19842):
```

**Step 3: Ask for API key**

Use AskUserQuestion:
```
API 키를 입력하세요 (서버의 XM_SYNC_API_KEY와 동일해야 합니다):
```

**Step 4: Write config**

```bash
node -e "
const { writeSyncConfig, readSyncConfig } = await import('$SKILL_BASE_DIR/../../lib/x-sync/sync-config.mjs');
const config = readSyncConfig();
config.server_url = '$SERVER_URL';
config.api_key = '$API_KEY';
writeSyncConfig(config);
console.log('✅ Sync configured:', JSON.stringify(config, null, 2));
"
```

Replace `$SERVER_URL` and `$API_KEY` with user-provided values.

**Step 5: Test connection**

```bash
curl -s -o /dev/null -w "%{http_code}" -H "X-Api-Key: $API_KEY" "$SERVER_URL/dashboard/health"
```

If 200 → `✅ 서버 연결 확인`. Otherwise → `❌ 서버 연결 실패 (HTTP $code)`.

---

## Mode: server-start

Start the sync server as a background process.

```bash
XM_SYNC_API_KEY="$API_KEY" nohup bun x-sync/lib/x-sync-server.mjs --port 19842 > /tmp/x-sync-server.log 2>&1 &
echo $! > /tmp/x-sync-server.pid
echo "✅ x-sync server started (PID: $(cat /tmp/x-sync-server.pid), port: 19842)"
```

Read the API key from `~/.xm/sync.json` if available. If no API key is set, warn:
```
⚠️ XM_SYNC_API_KEY가 설정되지 않았습니다. 서버가 인증 없이 열립니다.
```

The `--port` flag is optional. Default: 19842.

---

## Mode: server-stop

```bash
if [ -f /tmp/x-sync-server.pid ]; then
  kill $(cat /tmp/x-sync-server.pid) 2>/dev/null && echo "✅ x-sync server stopped" || echo "⚠️ Process already stopped"
  rm -f /tmp/x-sync-server.pid
else
  echo "⚠️ No PID file found. Server may not be running."
  # Try to find and kill by port
  lsof -ti:19842 | xargs kill 2>/dev/null && echo "✅ Killed process on port 19842" || echo "ℹ️ No process on port 19842"
fi
```

---

## Mode: server-status

Check if the server is running and healthy.

```bash
if [ -f /tmp/x-sync-server.pid ] && kill -0 $(cat /tmp/x-sync-server.pid) 2>/dev/null; then
  echo "✅ Server running (PID: $(cat /tmp/x-sync-server.pid))"
  curl -s http://localhost:19842/dashboard/health 2>/dev/null || echo "⚠️ Health check failed"
else
  echo "⚠️ Server not running"
fi
```

---

## Mode: push

Push local .xm/ state to the sync server.

```bash
node x-kit/lib/x-sync/sync-push.mjs
```

Optional: `--project PROJECT_ID` to override auto-detected project name.

Output example:
```
[x-sync push] 42 files from my-project (macbook-a1b2)
[x-sync push] accepted: 12, skipped: 30
```

If sync is not configured, show:
```
❌ x-sync 설정이 필요합니다. `/x-sync setup`을 먼저 실행하세요.
```

---

## Mode: pull

Pull remote .xm/ state from the sync server.

```bash
node x-kit/lib/x-sync/sync-pull.mjs
```

Optional flags:
- `--project PROJECT_ID` — override project name
- `--since TIMESTAMP` — pull only after this epoch timestamp

Output example:
```
[x-sync pull] project=my-project since=2026-04-06T10:00:00.000Z
[x-sync pull] 8 files written (3 skipped — own machine)
```

---

## Mode: status

Show sync configuration and last sync state.

```bash
echo "=== Sync Config ==="
cat ~/.xm/sync.json 2>/dev/null || echo "Not configured"
echo ""
echo "=== Sync State ==="
cat .xm/.sync-state.json 2>/dev/null || echo "No sync history"
echo ""
echo "=== Server ==="
if [ -f /tmp/x-sync-server.pid ] && kill -0 $(cat /tmp/x-sync-server.pid) 2>/dev/null; then
  echo "Running (PID: $(cat /tmp/x-sync-server.pid))"
  curl -s http://localhost:19842/dashboard/health 2>/dev/null
else
  echo "Not running locally"
fi
```

Output format:
```
x-sync Status

  Config:     ~/.xm/sync.json
  Server URL: http://my-server:19842
  Machine ID: macbook-a1b2
  API Key:    ****configured****

  Last Pull:  2026-04-06T10:30:00Z
  Server:     Not running locally

  Quick commands:
    /x-sync setup          Configure sync credentials
    /x-sync server start   Start local server
    /x-sync push           Push .xm/ to server
    /x-sync pull           Pull from server
```
