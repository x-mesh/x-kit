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

### Settings
- `mode developer|normal`
- `watch [--interval N]`
- `alias install`

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
