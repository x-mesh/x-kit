# term-mesh Execution Backend

Runtime rules for executing x-agent primitives (and every x-op/x-build/x-solver phase that
reuses them) on a **term-mesh pane team** via `tm-agent` instead of Claude Code's native
Agent tool. Repo-neutral contract: `docs/term-mesh-integration.md` in the x-kit repo.

**Invariant:** outside term-mesh, behavior is byte-for-byte the native path. Nothing below
may run — or fail — when no term-mesh session exists.

## 1. Backend resolution

Precedence: `XK_BACKEND` env → `execution_backend` in `.xm/config.json` → `auto`
(`auto` = term-mesh iff detected). Programmatic: `getExecutionBackend()` in
`shared-config.mjs`. Shell-only equivalent (use when the lib is not at hand):

```bash
resolve_xk_backend() {
  local v="${XK_BACKEND:-}"
  case "$v" in auto|native|term-mesh) ;; *) v="";; esac
  if [ -z "$v" ] && [ -f .xm/config.json ]; then
    v=$(sed -n 's/.*"execution_backend"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' .xm/config.json | head -1)
  fi
  [ -z "$v" ] && v=auto
  if [ "$v" = auto ]; then
    if [ -n "${TERMMESH_SOCKET:-}" ] || ls /tmp/term-mesh*.sock >/dev/null 2>&1; then
      v=term-mesh
    else
      v=native
    fi
  fi
  echo "$v"
}
```

Resolve ONCE per strategy/phase run, before the first dispatch. If it returns `native`,
stop reading this file and follow the SKILL.md's native Agent-tool instructions unchanged.

## 2. Primitive substitution (backend = term-mesh)

Fire all delegates of one wave in a SINGLE Bash message for true parallelism.

| SKILL.md instruction | term-mesh substitution |
|---------------------|------------------------|
| fan-out: "Invoke N Agent tools simultaneously" | `tm-agent delegate <agent> "$INSTR" &` × N (one Bash message) + `tm-agent wait --timeout 120 --mode any` |
| delegate: "Invoke 1 Agent tool (foreground)" | `tm-agent delegate <mapped-role> "$INSTR"` + `tm-agent wait` |
| broadcast: "N Agent tools with different role prompts" | claude-only team: `tm-agent broadcast`; mixed CLIs: `tm-agent delegate` × N with per-role INSTR |
| autonomous research/solve/consensus/swarm | `tm-agent research/solve/consensus/swarm` (same board.jsonl stigmergy) |
| `model:` / `run_in_background:` Agent-tool options | ignored — a pane's model is fixed at `create`/`attach` |
| implementation / fix / refactor tasks | add `--worktree auto` to delegate; leader finishes with `tm-agent task finish-worktree <task_id> --to parent --cleanup` |

Never use Claude Code native team tools (`TeamCreate`, `SendMessage`, `TaskCreate`,
`TaskList`, `TaskGet`, `TaskUpdate`, `TeamDelete`) in term-mesh context — they create a
parallel, disconnected team state. `tm-agent` is the only team primitive.

## 3. Role mapping (x-kit preset → term-mesh role)

| x-kit preset | term-mesh role | | x-kit preset | term-mesh role |
|--------------|----------------|-|--------------|----------------|
| explorer | explorer | | debugger | debugger |
| se | executor | | optimizer | perf |
| sre | devops | | documenter | writer |
| architect | architect | | verifier | tester |
| reviewer | reviewer | | planner | planner |
| security | security | | critic | reviewer |
| test-engineer | tester | | build-fixer | executor |
| team-leader | (the leader pane itself — never delegated) | | |

Model routing note: x-kit's `getModelForRole()` result applies only when ATTACHING a new
agent (`tm-agent add <role> --model <model>`); existing panes keep their model.

### Team ensure

Before the first wave, check `tm-agent status`. If required roles are missing, either add
them explicitly (`tm-agent add <role> --model <model>`) or proceed with the idle agents
available — role lenses are advisory, not blocking. Do not create a second team if one exists.

## 4. Reply-header contract (mandatory for delegated tasks)

Every instruction you delegate MUST tell the agent to end its reply with the term-mesh
Standard Reply Header (`STATUS`/`FILES`/`VERIFY`/`NEXT`/`FULL_REPORT`) plus:

```
XK_TASK: <plugin>/<project>/<ref>    # e.g. build/my-proj/t3, op/refine-20260707/r2
XK_CORR: <correlation_id or omit>
```

`<plugin>` = the xm skill family (`build`/`op`/`solver`/`agent`/`eval`), `<project>` = the
x-kit project slug or `<strategy>-<run-id>`, `<ref>` = task/round id. These lines power the
`tm-agent xk-bridge` writeback into `.xm/` (traces, metrics, x-build tasks.json). If the
bridge binary supports it, start it once per run: `tm-agent xk-bridge --timeout <T> &`
(from the MAIN checkout, not a worktree — `.xm/` resolution follows the main repo).

## 5. Result collection & synthesis

Do BOTH the tm-agent synthesis and whatever the xm skill requires:

1. `tm-agent collect --headers` → STATUS/NEXT table (open `FULL_REPORT` files only for
   BLOCKED / NEEDS_REVIEW / failed VERIFY; full replies live at
   `~/.term-mesh/results/<team>/<task_id>.md`, socket replies truncate at 1500 chars)
2. `[결론][충돌][다음]` 3-line synthesis
3. Persist per-agent results via the xm skill's own CLI
   (e.g. `xm build save research-notes --agent <name>`)

xm phase gates (`gate pass`, `phase next`, checkpoints, AskUserQuestion boundaries) proceed
exactly as the SKILL.md specifies — the backend changes WHO executes, never the phase
discipline.

## 6. Shared stigmergy board (mixed swarms)

x-agent's autonomous behaviors and `tm-agent research/solve/consensus/swarm` already share
the same convention — a JSONL board at `.xm/<behavior>/<run-id>/board.jsonl` under the
project root, with identical entry schemas (research:
`{"agent","round","finding","source","implication"}`; solve: typed
`attempt/insight/abandon/adopt/solved` entries). That makes MIXED swarms possible: cheap
native subagents (e.g. haiku explorers) and persistent pane agents cooperating on ONE board.

Rules for mixing:
- One board per run. Whoever starts the run creates it (leader `mkdir -p … && touch`, or
  `tm-agent <behavior>` which creates `.xm/<behavior>/<behavior>-<YYYYMMDD-HHMMSS>-<hex4>/`).
  Pass the SAME absolute board path to every participant, native or pane.
- Multi-writer safety: POST with an flock append (the form tm-agent's prompts use):
  `python3 -c "import fcntl,sys; f=open(sys.argv[1],'a'); fcntl.flock(f,fcntl.LOCK_EX); f.write(sys.argv[2]+'\n'); f.flush(); fcntl.flock(f,fcntl.LOCK_UN)" <board> '<json>'`
  Plain `echo >>` is acceptable only for a single-writer board.
- Give each participant a unique `agent` name across BOTH pools (e.g. `researcher-n1`
  native, `researcher-p1` pane) so dedup/adoption logic works.
- Budget/round semantics are per-agent and unchanged; the leader synthesizes from the board
  exactly as the behavior's reference specifies.

## 7. Scoring & budget governance

- Pane replies are durable at `~/.term-mesh/results/<team>/<task_id>.md` (`FULL_REPORT`).
  x-eval can score those files and record `quality_score` into `.xm/build/metrics` — enabling
  native-vs-pane A/B of the same strategy (see x-eval SKILL.md "term-mesh replies").
- Budget: when the cost engine reports `warning` (>80%) or `exceeded`, downgrade the model
  for any NEW `tm-agent add` (opus→sonnet, sonnet→haiku) and prefer reusing existing panes.
  On `exceeded`, x-kit also POSTs the daemon's budget kill-switch
  (`/api/budget/auto-stop {"enabled":true}` on `TERM_MESH_HTTP_ADDR`, default
  `127.0.0.1:9876`) via tm-bridge — pane agents pause instead of burning past the cap.

## 8. Bypass

A genuinely isolated single investigation (or one needing isolation term-mesh cannot give)
may still use the native Agent tool. Delegate-first still applies to everything else.
