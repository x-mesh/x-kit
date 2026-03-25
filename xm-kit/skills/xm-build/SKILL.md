---
name: xm-build
description: Phase-based project harness — manage project lifecycle, DAG execution, cost forecasting, and agent orchestration
---

<Purpose>
xm-build manages the full project lifecycle (Research → Plan → Execute → Verify → Close) with structured requirements gathering, parallel research, plan validation, DAG-based step execution, quality gates, cost forecasting, decision memory, and agent orchestration.
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

Shorthand in this document: `$XMB` = `node ${CLAUDE_PLUGIN_ROOT}/lib/xm-build-cli.mjs`
When executing via Bash tool, always use the full command — do NOT assign to a shell variable.

## Phase Lifecycle

```
Research → Plan → Execute → Verify → Close
```

Each phase has an exit gate. The gate blocks advancement until conditions are met:

| Phase | Exit Gate | Condition |
|-------|-----------|-----------|
| Research | human-verify | CONTEXT.md or REQUIREMENTS.md must exist |
| Plan | human-verify | Tasks defined + plan-check passed |
| Execute | auto | All tasks completed |
| Verify | quality | test/lint/build all pass |
| Close | auto | — |

## Commands

### Project
- `init <name>` — Create project (`.xm-build/` in cwd)
- `list` — List all projects
- `status` — Show status with progress bars
- `next` — Smart routing: tells you what to do next
- `handoff [--restore]` — Save/restore session state
- `close [--summary "..."]` — Close project
- `dashboard` — Multi-project overview

### Research Phase
- `discuss [--mode interview|assumptions]` — Gather requirements
- `research [goal]` — Parallel agent investigation

### Plan Phase
- `plan "goal"` — AI auto-decomposes goal into tasks
- `plan-check` — Validate plan across 8 quality dimensions
- `phase next` / `phase set <name>` — Move between phases
- `gate pass/fail [message]` — Resolve gate
- `checkpoint <type> [message]` — Record checkpoint

### Execute Phase
- `tasks add <name> [--deps t1,t2] [--size small|medium|large]`
- `tasks list` / `tasks remove <id>` / `tasks update <id> --status <s>`
- `steps compute` — Calculate step groups from dependencies
- `steps status` / `steps next` — Step progress
- `run` — Execute current step via agents
- `run --json` — Machine-readable execution plan
- `run-status` — Execution progress
- `templates list` / `templates use <name>` — Use task templates

### Verify & Close
- `quality` — Run test/lint/build checks
- `verify-coverage` — Check requirement-to-task mapping
- `context-usage` — Show artifact token usage

### Analysis
- `forecast` — Per-task cost estimation ($)
- `metrics` — Phase duration, task velocity
- `decisions add "..." [--type] [--rationale]` / `decisions list` / `decisions inject`
- `summarize` — Step summaries
- `save <context|requirements|roadmap|project|plan>` — Save planning artifact

### Export/Import
- `export --format md|csv|jira|confluence`
- `import <file> --from csv|jira`

### Context & Artifacts
- `context [project]` — Generate phase-aware context brief
- `phase-context [project]` — Load phase-specific context for agents
- `save <context|requirements|roadmap|project|plan> --content "..."` — Save planning artifact
- `summarize [step-id]` — Summarize completed step execution

### Resilience
- `circuit-breaker status` — Show circuit breaker state (closed/open/half-open)
- `circuit-breaker reset` — Manually reset circuit breaker to closed

### Settings
- `mode developer|normal`
- `config show|set|get` — Shared config management (agent_level, mode)
- `watch [--interval N]`
- `alias install`

---

## CLI↔Skill JSON Protocol

Several commands output JSON for the skill layer to parse and act on. The skill layer (this document) is responsible for interpreting the JSON and orchestrating agents.

### Action Types

| Command | `action` field | Key fields |
|---------|---------------|------------|
| `discuss` | `"discuss"` | `mode`, `project`, `current_phase` |
| `research` | `"research"` | `goal`, `project`, `perspectives[]` |
| `plan` | `"auto-plan"` | `goal`, `project`, `existing_tasks`, `context_summary`, `requirements_summary`, `roadmap_summary` |
| `run --json` | (no action field) | `project`, `step`, `total_steps`, `tasks[]`, `parallel` |

### `run --json` Task Schema

```json
{
  "task_id": "t1",
  "task_name": "Implement auth [R1]",
  "size": "medium",
  "agent_type": "executor",
  "model": "sonnet",
  "prompt": "...",
  "on_complete": "node .../xm-build-cli.mjs tasks update t1 --status completed",
  "on_fail": "node .../xm-build-cli.mjs tasks update t1 --status failed"
}
```

- `agent_type`: `"executor"` (small/medium) or `"deep-executor"` (large)
- `model`: `"sonnet"` (default) or `"opus"` (large tasks)
- `on_complete`/`on_fail`: Callback commands to update task status after agent finishes

### Mapping to Agent Tool

| CLI `agent_type` | Agent `subagent_type` | Fallback (xm-agent preset) | `model` |
|-----------------|----------------------|---------------------------|---------|
| `executor` | `oh-my-claudecode:executor` | `se` | `sonnet` |
| `deep-executor` | `oh-my-claudecode:deep-executor` | `architect` | `opus` |
| `planner` | `oh-my-claudecode:planner` | `planner` | `opus` |
| `verifier` | `oh-my-claudecode:verifier` | `verifier` | `sonnet` |
| `critic` | `oh-my-claudecode:critic` | `critic` | `opus` |
| `test-engineer` | `oh-my-claudecode:test-engineer` | `test-engineer` | `sonnet` |
| `build-fixer` | `oh-my-claudecode:build-fixer` | `build-fixer` | `sonnet` |

---

## Workflow: From Goal to Completion

### Step 1: Init + Discuss (Research Phase)

User describes a goal. Initialize and gather requirements:

```bash
$XMB init my-project
$XMB discuss --mode interview
```

**Interview mode**: Claude identifies gray areas in the goal and asks 4-6 clarifying questions. After the user answers, generate CONTEXT.md:

1. Run: `$XMB discuss --mode interview`
2. Parse JSON output (`action: "discuss"`, `mode: "interview"`)
3. Identify 4-6 ambiguous areas in the goal (technical choices, scope boundaries, constraints, priorities)
4. Ask the user using AskUserQuestion (present as numbered choices where possible)
5. After answers collected, save the result:
   ```bash
   $XMB save context --content "# CONTEXT.md\n\n## Goal\n...\n## Decisions\n...\n## Constraints\n..."
   ```

**Assumptions mode**: Claude reads the codebase, generates assumptions with confidence levels, and asks the user to confirm/reject:

1. Run: `$XMB discuss --mode assumptions`
2. Read 5-15 relevant files from the codebase
3. Generate assumptions with confidence (High/Medium/Low) and failure scenario
4. Present to user for confirmation
5. Save confirmed assumptions to CONTEXT.md

### Step 2: Research (Research Phase)

Parallel investigation with 4 agents:

1. Run: `$XMB research "goal description"`
2. Parse JSON output (`action: "research"`)
3. Spawn 4 agents in parallel (fan-out), each investigating one perspective:

```
Agent 1: "stack" — What tech stack is in use? What's available? What fits?
Agent 2: "features" — Break down the goal into concrete feature requirements
Agent 3: "architecture" — How should this be structured? What patterns apply?
Agent 4: "pitfalls" — What could go wrong? Common mistakes? Edge cases?
```

All agents run with `run_in_background: true`, `model: "sonnet"`.

4. Collect results, synthesize into:
   - **REQUIREMENTS.md**: Scoped features with IDs (`[R1]`, `[R2]`, ...)
   - **ROADMAP.md**: Phase breakdown mapping to requirements

```bash
$XMB save requirements --content "# Requirements\n\n- [R1] User authentication with JWT\n- [R2] CRUD API endpoints\n..."
$XMB save roadmap --content "# Roadmap\n\n## Phase 1: Foundation\n- R1, R2\n..."
```

5. Advance to Plan phase: `$XMB gate pass "Research complete"` → `$XMB phase next`

### Step 3: Plan (Plan Phase)

Create tasks informed by research artifacts:

1. Run: `$XMB plan "goal"`
2. Parse JSON output — it now includes `context_summary`, `requirements_summary`, `roadmap_summary`
3. Decompose into 5-10 tasks based on REQUIREMENTS.md:
   - Each task references requirement IDs in its name (e.g., "Implement JWT auth [R1]")
   - Concrete, actionable names (start with verb)
   - Size: small (1-2h), medium (half-day), large (full day+)
   - Dependencies: what must complete first
4. Register tasks:
   ```bash
   $XMB tasks add "Implement JWT auth [R1]" --size medium
   $XMB tasks add "Create CRUD endpoints [R2]" --deps t1 --size medium
   ```
5. Validate the plan:
   ```bash
   $XMB plan-check
   ```
   This checks 8 dimensions: atomicity, dependencies, coverage, granularity, completeness, context, naming, overall. Fix any errors.

6. Compute steps + forecast:
   ```bash
   $XMB steps compute
   $XMB forecast
   ```
7. Show plan to user for approval
8. Advance: `$XMB gate pass` → `$XMB phase next`

### Step 4: Execute (Execute Phase)

1. `$XMB run --json`
2. Parse JSON → spawn Agent per task:
   - `agent_type: "deep-executor"` → `subagent_type: "oh-my-claudecode:deep-executor"`, `model: "opus"`
   - otherwise → `subagent_type: "oh-my-claudecode:executor"`, `model: "sonnet"`
   - `prompt`: use `task.prompt` value
   - `run_in_background: true` (parallel)
3. On completion: `$XMB tasks update <id> --status completed|failed`
4. Check `$XMB run-status`, advance to next step or phase

### Step 5: Verify (Verify Phase)

1. Run quality checks: `$XMB quality`
2. Check requirement coverage: `$XMB verify-coverage`
3. If all pass: `$XMB phase next`

### Step 6: Close

`$XMB close --summary "Completed all requirements"`

---

## Discuss Command (Requirements Gathering)

When `discuss` is invoked:

1. Run: `$XMB discuss [--mode interview|assumptions]`
2. Parse JSON output (`action: "discuss"`)
3. Based on mode:

**Interview mode** (default):
- Identify 4-6 gray areas: technology choices, scope boundaries, performance requirements, auth strategy, data model, deployment target
- For each area, present 2-4 options as numbered choices
- Collect answers
- Generate CONTEXT.md with sections: Goal, Decisions, Constraints, Out of Scope, Assumptions

**Assumptions mode**:
- Read codebase files relevant to the goal
- Generate 5-10 assumptions with format:
  ```
  [HIGH] We'll use the existing Express.js server → Failure: need new framework setup
  [MED] PostgreSQL for data storage → Failure: different DB required
  [LOW] No real-time features needed → Failure: need WebSocket setup
  ```
- User confirms/rejects each
- Save confirmed to CONTEXT.md

Always save via: `$XMB save context --content "..."`

---

## Research Command (Parallel Investigation)

When `research` is invoked:

1. Run: `$XMB research [goal]`
2. Parse JSON output (`action: "research"`)
3. Spawn 4 agents (fan-out) with `run_in_background: true`:

| Agent | Perspective | Prompt Focus |
|-------|------------|--------------|
| 1 | stack | Current tech stack, dependencies, compatibility |
| 2 | features | Feature decomposition, user stories, acceptance criteria |
| 3 | architecture | System design, patterns, module boundaries, data flow |
| 4 | pitfalls | Risks, common mistakes, edge cases, security concerns |

4. Collect all results
5. Synthesize into REQUIREMENTS.md and ROADMAP.md
6. Save via `$XMB save requirements` and `$XMB save roadmap`

---

## Plan-Check Command (8-Dimension Validation)

Validates the plan across:

| Dimension | What it checks |
|-----------|---------------|
| atomicity | Each task completable in one session |
| dependencies | No orphan deps, no cycles |
| coverage | All requirements referenced in tasks |
| granularity | Not too many large tasks |
| completeness | Enough tasks to cover the goal |
| context | CONTEXT.md exists for informed planning |
| naming | Tasks start with action verbs |
| overall | Combined assessment |

Run: `$XMB plan-check`
Fix errors → re-run until all pass → `$XMB gate pass`

---

## Next Command (Smart Routing)

`$XMB next` analyzes current state and recommends the next action:

| Phase | Missing Artifact | Recommendation |
|-------|-----------------|----------------|
| Research | No CONTEXT.md | → `discuss` |
| Research | No REQUIREMENTS.md | → `research` |
| Research | Both exist | → `phase next` |
| Plan | No tasks | → `plan "goal"` |
| Plan | No plan-check | → `plan-check` |
| Plan | Errors in plan-check | → Fix errors |
| Plan | All good | → `phase next` |
| Execute | No steps | → `steps compute` |
| Execute | Has ready tasks | → `run` |
| Execute | All done | → `phase next` |
| Verify | — | → `quality` + `verify-coverage` |
| Close | — | → `close` |

---

## Handoff Command (Session Preservation)

Save state before context compaction or session end:

```bash
$XMB handoff           # Save current state to HANDOFF.json
$XMB handoff --restore # Show saved state in new session
```

HANDOFF.json includes: phase, pending tasks, recent decisions, artifact status.

---

## Context-Usage Command (Token Budget)

Monitor how much context your project artifacts consume:

```bash
$XMB context-usage
```

Shows per-file token estimates. Warns at >35% and >75% of context window.
Recommends `handoff` when usage is high.

---

## Verify-Coverage Command

Check that every requirement in REQUIREMENTS.md has a matching task:

```bash
$XMB verify-coverage
```

Requirements must use format: `- [R1] Description` or `- [REQ-1] Description`.
Tasks match if they contain the requirement ID in their name.

---

## Data Model (`.xm/build/`)

```
.xm/build/projects/<name>/
├── manifest.json              # Project metadata
├── config.json                # Project-specific config overrides
├── HANDOFF.json               # Session state preservation
├── context/
│   ├── CONTEXT.md             # Goals, decisions, constraints
│   ├── REQUIREMENTS.md        # Scoped features [R1], [R2]...
│   ├── ROADMAP.md             # Phase breakdown
│   └── decisions.md           # Decision log (markdown)
├── 01-research/ ... 05-close/
│   ├── status.json            # Phase status
│   └── quality-results.json   # Quality check results (verify phase)
├── 03-execute/
│   ├── tasks.json             # Task list + status
│   ├── steps.json             # Computed DAG steps
│   ├── circuit-breaker.json   # Resilience state
│   └── checkpoints/           # Manual markers
└── metrics/
    └── sessions.jsonl         # Append-only metrics (auto-rotated at 5MB)
```

### Task Schema (`tasks.json`)

```json
{
  "tasks": [{
    "id": "t1",
    "name": "Implement JWT auth [R1]",
    "depends_on": [],
    "size": "small | medium | large",
    "status": "pending | ready | running | completed | failed | cancelled",
    "created_at": "ISO8601",
    "started_at": "ISO8601 | null",
    "completed_at": "ISO8601 | null",
    "retry_count": 0,
    "next_retry_at": "ISO8601 | null"
  }]
}
```

### Steps Schema (`steps.json`)

```json
{
  "steps": [
    { "id": 1, "tasks": ["t1", "t2"] },
    { "id": 2, "tasks": ["t3"] }
  ],
  "computed_at": "ISO8601"
}
```

### Circuit Breaker Schema

```json
{
  "state": "closed | open | half-open",
  "consecutive_failures": 0,
  "opened_at": "ISO8601 | null",
  "cooldown_until": "ISO8601 | null"
}
```

---

## Plugin Integration

### xm-op Integration (Research Phase)

The `research` command's 4-agent fan-out can optionally be replaced with xm-op's `refine` strategy for iterative convergence:

```
# Default: 4-agent parallel fan-out (stack, features, architecture, pitfalls)
$XMB research "goal"

# Alternative: Use xm-op refine for Diverge→Converge→Verify rounds
# Invoke /xm-op refine "goal" instead, then save results:
$XMB save requirements --content "..."
$XMB save roadmap --content "..."
```

Use xm-op refine when the goal is ambiguous and benefits from multiple iteration rounds.

### xm-solver Integration (Execute Phase)

For complex sub-problems within a task, xm-solver can be invoked:

```
# During task execution, if a sub-problem needs structured decomposition:
# Invoke /xm-solver decompose "sub-problem"
# Then feed the solution back into the task
```

### Shared Decision Context

xm-build decisions (`decisions add/list/inject`) can be injected into xm-solver sessions:

```bash
# Export decisions for other tools
$XMB decisions inject
# Output: markdown of recent decisions — paste into xm-solver context
```

Future: shared `.xm/shared/decisions.json` for automatic cross-tool context.

---

## Shared Config Integration

xm-build는 `.xm/config.json`의 공유 설정을 참조한다:

| 설정 | 키 | 기본값 | 영향 |
|------|-----|--------|------|
| 모드 | `mode` | `developer` | 출력 스타일 (기술 용어 vs 쉬운 말) |
| 에이전트 수 | `agent_level` | `medium` (4) | research 에이전트 수, run 병렬 실행 수 |

### Agent Level → 에이전트 수 매핑

| Level | Max Agents | 용도 |
|-------|-----------|------|
| `min` | 2 | 토큰 절약, 빠른 피드백 |
| `medium` | 4 | 기본값, 대부분의 작업 |
| `max` | 8 | 대규모 프로젝트, 토큰 무제한 |

설정 변경:
```bash
$XMB config set agent_level max    # 최대 병렬
$XMB config set agent_level min    # 토큰 절약
$XMB config show                   # 현재 설정 확인
```

### Config Resolution 우선순위

1. CLI 플래그 (`--agents N`) — 명시하면 최우선
2. 도구별 로컬 config (`.xm/build/config.json`)
3. 공유 config (`.xm/config.json`)
4. 기본값

---

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "프로젝트 시작", "new project" | `init` |
| "뭐해야해?", "다음은?" | `next` |
| "요구사항 정리", "질문해봐" | `discuss` |
| "조사해봐", "리서치" | `research` |
| "계획 세워", "~만들어줘" (goal) | `plan "goal"` |
| "검증해봐", "계획 괜찮아?" | `plan-check` |
| "상태", "status" | `status` |
| "다음 단계" | `phase next` |
| "승인", "LGTM" | `gate pass` |
| "실행", "run" | `run` |
| "비용", "cost" | `forecast` |
| "커버리지" | `verify-coverage` |
| "세션 저장" | `handoff` |
| "내보내기", "export" | `export` |
| "모드 변경" | `mode` |
| "에이전트 설정", "agent level" | `config show` / `config set agent_level` |
