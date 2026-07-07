# term-mesh Integration Contract

Single source of truth for how x-kit (the `xm` marketplace plugins) integrates with
[term-mesh](https://github.com/x-mesh/term-mesh) — a macOS terminal app whose Rust daemon
(`term-meshd`) and CLI (`tm-agent`) run persistent multi-agent teams in live terminal panes.

This document is repo-neutral: term-mesh's `CLAUDE.md` links here instead of carrying its own
copy of the routing rules, and the runtime rules that agents need ship inside the plugins
themselves (`x-agent/skills/agent/references/term-mesh-backend.md`).

**Design invariant:** x-kit works with Claude Code alone. Everything below is strictly opt-in
and auto-degrades to a no-op when term-mesh is absent. No x-kit flow may fail because a
term-mesh socket is missing.

## Detection & backend selection

A session is "inside term-mesh" when either holds:

- `TERMMESH_SOCKET` env var is set (per-pane app socket), or
- a socket exists at `/tmp/term-mesh*.sock` or `/tmp/term-mesh.sock`.

The execution backend is resolved with this precedence:

```
XK_BACKEND env  →  execution_backend config (.xm/config.json)  →  auto-detect
```

| Value | Meaning |
|-------|---------|
| `auto` (default) | term-mesh iff detected, else native Agent tool |
| `native` | always Claude Code native Agent tool |
| `term-mesh` | force `tm-agent` panes (error if no socket) |

## Transport map

term-mesh exposes two IPC endpoints plus HTTP; x-kit uses each for a distinct purpose:

| Endpoint | Protocol | x-kit usage |
|----------|----------|-------------|
| App socket (`TERMMESH_SOCKET`) | line-based text commands | pane telemetry: `set_status`, `set_progress` |
| Daemon socket (`/tmp/term-meshd.sock`) | JSON-RPC 2.0, newline-framed | `events.publish` (phase transitions), task board RPCs via `tm-agent` |
| Daemon HTTP (`http.rs`) | REST | dashboard joins, `budget.auto_stop` |

## Fan-out substitution rules

When an xm skill's SKILL.md instructs *Claude Code native Agent tool* fan-out and the backend
resolves to `term-mesh`, substitute as follows (fire all delegates in ONE Bash message for
true parallelism):

| xm skill instruction | term-mesh substitution |
|---------------------|------------------------|
| "Spawn N Agent tools in parallel" (research / plan-check / test) | `tm-agent delegate <agent> "$INSTR" &` × N in a single Bash message + `tm-agent wait --timeout 120 --mode any` |
| "Spawn one Agent tool per perspective" (4 perspectives etc.) | fire 1 INSTR at 4–6 idle agents simultaneously; agent role lenses cover the perspectives |
| `model: "sonnet"` (Agent tool option) | ignored — each pane's model is fixed at `tm-agent create`/`attach` |
| "fan-out" / "broadcast" / "swarm" primitives | `/tm "<instruction>"` or `tm-agent delegate` × N (`broadcast` is claude-CLI only; mixed-CLI teams use delegate) |

Never use Claude Code team tools (`TeamCreate`, `SendMessage`, `TaskCreate`, `TaskList`,
`TaskGet`, `TaskUpdate`, `TeamDelete`) inside term-mesh — they create a parallel, disconnected
team state. `tm-agent` is the only team primitive.

### 4-perspective → role mapping (xm:build research)

| xm perspective | term-mesh agent role |
|----------------|----------------------|
| stack | reviewer |
| features | frontend |
| architecture | architect |
| pitfalls | security |

Extra idle agents (tester / refactorer …) may be mobilized as bonus perspectives — more
signal at ~zero cost (same single Bash message).

### Result synthesis contract

xm skills generally require raw agent output; `/tm` enforces a 3-line synthesis. Do **both**:

1. `tm-agent collect --headers` → STATUS/NEXT table
2. `[결론][충돌][다음]` 3-line synthesis
3. persist each agent's `task_id.md` path via the xm skill's own CLI
   (e.g. `xm build save research-notes --agent <name>`)

xm phase-gate validation (`gate pass`, `phase next`) proceeds normally.

### Worktree lifecycle (xm:build implement)

Implementation/fix tasks default to `tm-agent delegate ... --worktree auto` (`auto` acquires a
`git-kit wt` worktree only for mutating roles/keywords; review/research/plan reuse the cwd).
Force with `--worktree always`, disable with `--worktree off`, base with `--from <ref>`.

Worktree task capsules carry `WORKTREE_PATH`, `WORKTREE_BRANCH`, `WORKDIR_INSTRUCTION`; the
agent must cwd there. After the completion report the leader runs:

```bash
tm-agent task finish-worktree <task_id> --to parent --cleanup   # add --push to land
```

### Bypass

When the native Agent tool is genuinely better suited (single isolated investigation,
external worktree isolation), these rules do not apply. Delegate-first principles still hold.

## Shared reply-header contract: `XK_TASK` / `XK_CORR`

Pane agents executing x-kit work end replies with the term-mesh Standard Reply Header
(`STATUS`/`FILES`/`VERIFY`/`NEXT`/`FULL_REPORT`) plus two x-kit lines:

```
XK_TASK: <plugin>/<project>/<ref>    # e.g. build/my-proj/t3, op/refine-20260707/r2
XK_CORR: ce-XXXXXXXX                 # optional; joins cost-engine correlation_id
```

`XK_TASK` generalizes the legacy `XMB_TASK` header (x-build only); both remain valid.
`tm-agent xk-bridge` subscribes to daemon `reply`/`task_status` events, parses these lines,
and writes back into `.xm/` (x-build `tasks.json` transitions, `.xm/traces/*.jsonl`
`agent_step` entries, `.xm/build/metrics/sessions.jsonl` `task_complete` records). Parsers on both
sides ignore unknown fields; unparseable refs are skipped, never errors.

## Component map

| Component | Home | Role |
|-----------|------|------|
| `getExecutionBackend()` | `x-build/lib/shared-config.mjs` (bundled to `x-kit/lib/`) | backend resolution |
| `references/term-mesh-backend.md` | `x-agent/skills/agent/` | runtime substitution rules shipped with the plugin |
| `tm-bridge.mjs` | `x-kit/lib/term-mesh/` | pane telemetry + `events.publish` + task-board mirror (all no-op without sockets) |
| `tm-agent xk-bridge` | term-mesh `daemon/term-mesh-cli` | daemon events → `.xm/` writeback |

## Observability quick win

The x-dashboard (port 19841) can be opened in a term-mesh browser split at any time —
no integration code required:

```bash
x-kit dashboard start
term-mesh browser open http://127.0.0.1:19841
```
