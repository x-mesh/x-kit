---
name: x-dashboard
description: Web dashboard for .xm project state — start, stop, open in browser
allowed-tools:
  - Bash
---

<Purpose>
Start, stop, or check the xm-dashboard web server that visualizes .xm/ project state.
</Purpose>

<Use_When>
- User says "dashboard", "open dashboard", "start dashboard", "show dashboard"
- User says "stop dashboard", "close dashboard", "kill dashboard"
- User says "dashboard status"
</Use_When>

<Do_Not_Use_When>
- User wants to query .xm data directly (use x-build status instead)
</Do_Not_Use_When>

# x-dashboard

## Arguments

User provided: $ARGUMENTS

## Routing

Parse `$ARGUMENTS`:

- `stop` / `close` / `kill` → [Command: stop]
- `status` → [Command: status]
- `open` → [Command: open]
- Empty or `start` or any other text → [Command: start]

## Command: start

1. Check if already running:
```bash
cat ~/.xm/run/xdashboard-server.pid 2>/dev/null && echo "PID_EXISTS" || echo "NO_PID"
```

2. If PID exists, check if alive:
```bash
kill -0 $(cat ~/.xm/run/xdashboard-server.pid 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['pid'])" 2>/dev/null) 2>/dev/null && echo "ALIVE" || echo "DEAD"
```

3. If alive → just open browser and report URL:
```
Dashboard already running at http://127.0.0.1:{port}
```

4. If not running → start server in background:
```bash
nohup bun x-dashboard/lib/x-dashboard-server.mjs --session > /dev/null 2>&1 &
sleep 2
curl -s http://127.0.0.1:19841/health
```

5. Report to user:
```
Dashboard started at http://127.0.0.1:19841
Session mode — auto-stops after 60 minutes of inactivity.
To stop: /x-dashboard stop
```

## Command: stop

```bash
bun x-dashboard/lib/x-dashboard-server.mjs --stop
```

Report result to user.

## Command: status

```bash
curl -s http://127.0.0.1:19841/api/health 2>/dev/null || echo '{"status":"not_running"}'
```

Show: running/stopped, port, uptime, project name, cwd.

## Command: open

Open browser to dashboard URL:
```bash
open http://127.0.0.1:19841
```
