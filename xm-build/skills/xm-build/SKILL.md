---
name: xm-build
description: Phase-based project harness — manage project lifecycle, DAG execution, cost forecasting, and agent orchestration
---

<Purpose>
xm-build manages the full project lifecycle (Research → Plan → Execute → Verify → Close) with DAG-based step execution, quality gates, cost forecasting, decision memory, and agent orchestration.
</Purpose>

<Use_When>
- User wants to start a new project with structured phases
- User says "프로젝트 시작", "새 프로젝트", "init"
- User asks to plan, execute, or verify work
- User says "~만들어줘" or describes a goal (auto-plan)
- User asks about project status, costs, or decisions
- User wants to export to Jira, Confluence, CSV
</Use_When>

<Do_Not_Use_When>
- Simple one-off tasks that don't need project structure
- Git operations not related to xm-build
</Do_Not_Use_When>

# xm-build — Phase-Based Project Harness

## Mode Detection

Check mode before every command:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/xm-build-cli.mjs mode show 2>/dev/null | head -1
```

**Developer mode**: Use technical terms (DAG, phase, gate, step, context, retry, circuit breaker). Concise.

**Normal mode**: Use simple language. "phase" → "단계", "gate" → "확인 절차", "step" → "순서".
Use cooking analogies: project = recipe, phases = big steps (prep → cook → taste → serve), tasks = individual items.
Always use 존댓말. Explain commands: `xmb steps compute` (할 일의 순서를 자동으로 계산합니다).

## CLI

All commands via:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/xm-build-cli.mjs <command> [args]
```

## Commands

### Project
- `init <name>` — Create project (`.xm-build/` in cwd)
- `list` — List all projects
- `status` — Show status with progress bars
- `close [--summary "..."]` — Close project
- `dashboard` — Multi-project overview

### Phase & Gate
- `phase next` / `phase set <name>` — Move between phases
- `gate pass/fail [message]` — Resolve gate
- `checkpoint <type> [message]` — Record checkpoint

### Tasks
- `tasks add <name> [--deps t1,t2] [--size small|medium|large]`
- `tasks list` / `tasks remove <id>` / `tasks update <id> --status <s>`
- `templates list` / `templates use <name>` — Use task templates

### Steps (DAG)
- `steps compute` — Calculate step groups from dependencies
- `steps status` / `steps next` — Step progress

### Execution
- `plan "goal"` — AI auto-decomposes goal into tasks (see Plan section)
- `run` — Execute current step via agents
- `run --json` — Machine-readable execution plan
- `run-status` — Execution progress

### Analysis
- `forecast` — Per-task cost estimation ($)
- `metrics` — Phase duration, task velocity
- `decisions add "..." [--type] [--rationale]` / `decisions list` / `decisions inject`
- `summarize` — Step summaries

### Export/Import
- `export --format md|csv|jira|confluence`
- `import <file> --from csv|jira`

### Settings
- `mode developer|normal`
- `quality` — Run test/lint/build checks
- `watch [--interval N]`
- `alias install`

## Plan Command (AI Auto-Decompose)

When user describes a goal:

1. Run: `node ${CLAUDE_PLUGIN_ROOT}/lib/xm-build-cli.mjs plan <goal>`
2. Parse JSON output (`action: "auto-plan"`)
3. Analyze the goal and decompose into 5-10 tasks:
   - Concrete, actionable names (start with verb)
   - Size: small (1-2h), medium (half-day), large (full day+)
   - Dependencies: what must complete first
   - Match available templates if applicable
4. Register tasks:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/lib/xm-build-cli.mjs tasks add "task name" --size medium
   node ${CLAUDE_PLUGIN_ROOT}/lib/xm-build-cli.mjs tasks add "next task" --deps t1 --size small
   ```
5. Compute steps + forecast:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/lib/xm-build-cli.mjs steps compute
   node ${CLAUDE_PLUGIN_ROOT}/lib/xm-build-cli.mjs forecast
   ```
6. Show plan to user for approval

## Run Command (Agent Orchestration)

1. `node ${CLAUDE_PLUGIN_ROOT}/lib/xm-build-cli.mjs run --json`
2. Parse JSON → spawn Agent per task:
   - `agent_type: "deep-executor"` → `subagent_type: "oh-my-claudecode:deep-executor"`, `model: "opus"`
   - otherwise → `subagent_type: "oh-my-claudecode:executor"`, `model: "sonnet"`
   - `prompt`: use `task.prompt` value
   - `run_in_background: true` (parallel)
3. On completion: `tasks update <id> --status completed|failed`
4. Check `run-status`, advance to next step or phase

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "프로젝트 시작", "new project" | `init` |
| "상태", "status" | `status` |
| "다음 단계" | `phase next` |
| "승인", "LGTM" | `gate pass` |
| "~만들어줘" (goal) | `plan "goal"` |
| "실행", "run" | `run` |
| "비용", "cost" | `forecast` |
| "내보내기", "export" | `export` |
| "모드 변경" | `mode` |
