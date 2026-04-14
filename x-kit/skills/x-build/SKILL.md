---
name: x-build
description: Phase-based project harness — manage project lifecycle, DAG execution, cost forecasting, and agent orchestration
allowed-tools:
  - AskUserQuestion
---

<Purpose>
x-build manages the full project lifecycle (Research → Plan → Execute → Verify → Close) with structured requirements gathering, parallel research, plan validation, DAG-based step execution, quality gates, cost forecasting, decision memory, and agent orchestration.
</Purpose>

<Use_When>
- User wants to start a new project with structured phases
- User says "start project", "new project", "init"
- User asks to plan, execute, or verify work
- User says "build me ~" or describes a goal (auto-plan)
- User asks about project status, costs, or decisions
- User wants to export to Jira, Confluence, CSV
</Use_When>

<Do_Not_Use_When>
- Simple one-off tasks that don't need project structure
- Git operations not related to x-build
</Do_Not_Use_When>

# x-build — Phase-Based Project Harness

## Model Routing

| Subcommand | Model | Reason |
|------------|-------|--------|
| `list`, `status`, `task list`, `decisions` | **haiku** (Agent tool) | Read-only status display |
| `init` (interactive) | **sonnet** | Requires AskUserQuestion |
| `plan`, `forecast`, `research`, `run` | **sonnet** | Complex reasoning / orchestration |

For haiku-eligible commands, delegate via: `Agent tool: { model: "haiku", prompt: "Run: [command]" }`

## Mode Detection

Check mode before every command:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/x-build-cli.mjs mode show 2>/dev/null | head -1
```

**Developer mode**: Use technical terms (DAG, phase, gate, step, context, retry, circuit breaker). Concise.

**Normal mode**: Guide in plain Korean.
- Direct expressions without metaphors: "단계", "할 일", "확인", "다음"
- Use "~하세요" style
- Replace technical terms with explanations: "DAG" → "순서 계산", "gate" → "넘어가기 조건", "circuit breaker" → "자동 중단"
- Keep commands in English but add explanation: `steps compute` → "할 일의 실행 순서를 계산합니다"
- Key information first, supplementary details after

**Pass mode when delegating agents (MANDATORY):**
Inject mode into all delegate/fan-out prompts. When in Normal mode:
- Add to first line of prompt: `"언어: 한국어로 작성. 기술 용어는 원어 유지."`
- All artifacts (PRD, CONTEXT.md, REQUIREMENTS.md, etc.) are generated in Korean
- Section titles remain in English (Goal, Success Criteria, etc.)

## CLI

All commands via:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/x-build-cli.mjs <command> [args]
```

Shorthand in this document: `$XMB` = `node ${CLAUDE_PLUGIN_ROOT}/lib/x-build-cli.mjs`

> **⚠ When using Bash tool, always define a shell function first:**
> ```bash
> # Auto-detect: use persistent server if available, otherwise direct CLI
> if [ -f "${CLAUDE_PLUGIN_ROOT}/lib/server/x-kit-client.mjs" ]; then
>   xmb() { node "${CLAUDE_PLUGIN_ROOT}/lib/server/x-kit-client.mjs" x-build "$@"; }
> else
>   xmb() { node "${CLAUDE_PLUGIN_ROOT}/lib/x-build-cli.mjs" "$@"; }
> fi
>
> xmb plan "goal"
> ```
> **Forbidden:** Assigning `XMB="node ..."` then calling `$XMB plan` — zsh treats the entire string as a single command and fails.
> When running multiple commands sequentially, define the function on the first line then call `xmb <command>` afterward.
> The server client auto-starts the server if not running (lazy start), and silently falls back to node if bun is not installed.

## AskUserQuestion Dark-Theme Rule

**CRITICAL:** The `question` field in AskUserQuestion is invisible on dark terminals.

**Visibility map:**
| Element | Visible | Use for |
|---------|---------|---------|
| `header` | ✅ YES | Short context tag (e.g., "x-op bump", "Pipeline") |
| `question` | ❌ NO | Keep minimal — user cannot see this text |
| option `label` | ✅ YES | Primary info — must be self-explanatory |
| option `description` | ✅ YES | Supplementary detail |

**Always follow this pattern:**
1. Output ALL context (descriptions, status, analysis) as **regular markdown text** BEFORE calling AskUserQuestion
2. `header`: put the key context here (visible, max 12 chars)
3. `question`: keep short, duplicate of header is fine (invisible to user)
4. Option `label` + `description`: carry all decision-relevant information

**WRONG:** Putting context in `question` field → user sees blank space above options
**RIGHT:** Print context as markdown first, use `header` for tag, options for detail

## Interaction Protocol

**CRITICAL: x-build phase transitions and reviews MUST use AskUserQuestion.**

Rules:
1. **AskUserQuestion is REQUIRED for all user confirmations** — PRD review, plan review, phase gate passes, and any decision point. Text-only questions do NOT enforce turn boundaries.
2. **Phase transitions** — before calling `phase next`, MUST get user confirmation via AskUserQuestion.
3. **NEVER skip Research** — `plan "goal"` without `--quick` MUST go through Research (interview + research) before PRD generation. Calling `phase set plan` to skip Research is FORBIDDEN except in Quick Mode.
4. **PRD MUST be printed** — after PRD generation, output the FULL PRD text to the user before calling AskUserQuestion for review. Never save-and-ask without showing.
5. **PRD Review loop** — already uses AskUserQuestion (keep as-is).
6. **Plan Review** — already uses AskUserQuestion (keep as-is).
7. **Execute → Verify** — after all tasks complete, MUST use AskUserQuestion before advancing.
8. **Verify → Close** — after quality checks, MUST use AskUserQuestion before closing.

9. **PRD is MANDATORY** — every project MUST have a PRD.md in `context/` before Execute phase. If tasks were added without PRD (e.g., direct `tasks add`), generate PRD from existing tasks before proceeding.
10. **Task documentation** — every task MUST have `done_criteria` before execution starts. If missing, auto-derive from PRD requirements using `$XMB tasks done-criteria`.
11. **No phantom projects** — a project without PRD.md and CONTEXT.md is invisible to dashboard and untrackable. Always generate these artifacts.

Anti-patterns:
- ❌ `plan "goal"` → `phase set plan` → PRD generation (skips Research)
- ❌ PRD generated → "리뷰해주세요" without showing PRD content
- ❌ PRD generated → show to user → but forget `$XMB save plan` (PRD lost, not in dashboard)
- ❌ Phase transition without AskUserQuestion
- ❌ `init` → `tasks add` → `tasks update --status in_progress` (no PRD, no CONTEXT.md — dashboard blind spot)
- ✅ `plan "goal"` → init → interview → research → gate pass → phase next → PRD → `save plan` → show PRD → AskUserQuestion
- ✅ If tasks added directly: generate PRD from task list before first `tasks update --status in_progress`

Anti-patterns:
- All tasks complete → immediately run `phase next`
- Show plan and ask "Shall we proceed?" as text (must use AskUserQuestion)
- All tasks complete → AskUserQuestion("모든 태스크 완료. Verify 단계로 넘어갈까요?")

## Phase Lifecycle

```
Research → [PRD] → Plan → Execute → Verify → Close
```

Each phase has an exit gate. The gate blocks advancement until conditions are met:

| Phase | Exit Gate | Condition |
|-------|-----------|-----------|
| Research | human-verify | CONTEXT.md or REQUIREMENTS.md must exist + no unresolved decisions in CONTEXT.md |
| Plan | human-verify | PRD.md MUST exist + Tasks defined with done_criteria + plan-check passed (+ optional critique) |
| Execute | auto | All tasks completed |
| Verify | quality | test/lint/build all pass |
| Close | auto | — |

**Plan exit gate enforcement:** Before advancing from Plan → Execute, check:
1. `context/PRD.md` exists and is non-empty
2. All tasks have `done_criteria` (not null)
3. If either check fails → block transition, generate missing artifacts first

## Routing

Parse user's `$ARGUMENTS` and current project state to determine the action:

### No arguments (empty)
1. Run `$XMB list` to check for existing projects
2. **If active project exists** → run `$XMB next --json` and follow Smart Router
3. **If no project exists** → immediately ask the user for a goal (AskUserQuestion):
   - Developer mode: `"What do you want to build? Describe the goal in 1-2 sentences."`
   - Normal mode: `"어떤 것을 만들고 싶으세요? 1-2문장으로 목표를 알려주세요."`
4. After receiving goal → `$XMB init {slug}` → full flow (Research → Plan)

### `plan` (no goal argument)
1. Check for active project
2. **If active project in Plan phase** → run `$XMB next --json` to determine next plan action
3. **If active project in other phase** → show current phase, suggest `phase set plan` if appropriate
4. **If no project exists** → same as "No arguments" above — ask for goal immediately

### `plan "goal"` (with goal argument)
1. Check for active project
2. **If no project** → `$XMB init {slug}` → **start from Research phase** (interview → research → then plan):
   - Run `$XMB discuss --mode interview` (gather requirements using the goal as seed)
   - Run `$XMB research "{goal}"` (4-agent parallel investigation)
   - Save CONTEXT.md, REQUIREMENTS.md, ROADMAP.md
   - `$XMB gate pass` → `$XMB phase next` (Research → Plan)
   - Then generate PRD and proceed with plan
   - **NEVER skip Research by calling `phase set plan` directly — Research produces the artifacts that PRD depends on.**
3. **If project exists in Research phase** → check artifacts, continue Research if incomplete, then plan
4. **If project exists in Plan phase** → `$XMB plan "{goal}"` (already past Research)

### `plan "goal" --quick` (explicit Quick Mode)
1. `$XMB init quick-{timestamp}` → `$XMB phase set plan` → Quick Mode flow (see [Quick Mode](#quick-mode-one-shot-planrun))
2. Only enters Quick Mode when `--quick` flag is **explicitly** provided
3. Quick Mode is the ONLY case where Research is skipped — and only because `--quick` is an explicit user opt-in

### Other commands
- Route directly to the matching CLI command (init, status, discuss, research, run, etc.)

---

## Commands

### Project
- `init <name>` — Create project (`.xm/build/` in cwd)
- `list` — List all projects
- `status` — Show status with progress bars
- `next [--json]` — Smart routing: tells you what to do next (JSON mode for skill layer)
- `handoff [--restore]` — Save/restore session state
- `close [--summary "..."]` — Close project
- `dashboard` — Multi-project overview

### Research Phase
- `discuss [--mode interview|assumptions|validate]` — Gather & validate requirements
- `research [goal]` — Parallel agent investigation

### Deliberation (cross-phase)
- `discuss --mode interview [--round N]` — Multi-round requirements interview with drill-down
- `discuss --mode assumptions` — Codebase-driven assumption generation
- `discuss --mode validate` — Research artifact completeness verification (Research phase)
- `discuss --mode critique [--round N]` — Strategic plan review by Critic+Architect (Plan phase)
- `discuss --mode adapt ["topic"]` — Adaptive review between execution steps (Execute phase)

### Plan Phase
- `plan "goal"` — AI auto-decomposes goal into tasks
- `plan-check` — Validate plan across 11 quality dimensions
- `prd-gate [--threshold N]` — Judge panel PRD quality evaluation (rubric-based scoring)
- `consensus [--round N]` — 4-agent consensus review (architect/critic/planner/security)
- `phase next` / `phase set <name>` — Move between phases
- `gate pass/fail [message]` — Resolve gate
- `checkpoint <type> [message]` — Record checkpoint

### Execute Phase
- `tasks add <name> [--deps t1,t2] [--size small|medium|large] [--done-criteria "..."] [--team <name>]`
- `tasks list` / `tasks remove <id>` / `tasks update <id> --status <s> [--done-criteria "..."]`
- `tasks done-criteria` — Auto-derive done criteria from PRD for all tasks
- `steps compute` — Calculate step groups from dependencies
- `steps status` / `steps next` — Step progress
- `run` — Execute current step via agents
- `run --json` — Machine-readable execution plan
- `run-status` — Execution progress
- `templates list` / `templates use <name>` — Use task templates

### Verify & Close
- `quality` — Run test/lint/build checks
- `verify-coverage` — Check requirement-to-task mapping
- `verify-traceability` — R# ↔ Task ↔ AC ↔ Done Criteria matrix
- `verify-contracts` — Check task done_criteria fulfillment
- `context-usage` — Show artifact token usage

### Analysis
- `forecast` — Per-task cost estimation ($) with complexity-adjusted confidence levels
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
- `config show|set|get` — Shared config management (agent_max_count, mode)
- `watch [--interval N]`
- `alias install`

---

## CLI↔Skill JSON Protocol

Several commands output JSON for the skill layer to parse and act on. The skill layer (this document) is responsible for interpreting the JSON and orchestrating agents.

### Action Types

| Command | `action` field | Key fields |
|---------|---------------|------------|
| `next --json` | varies | `phase`, `action`, `args`, `reason`, `artifacts`, `goal?`, `ready?` |
| `discuss` | `"discuss"` | `mode`, `project`, `current_phase`, `round`, `max_rounds` + mode-specific fields |
| `research` | `"research"` | `goal`, `project`, `perspectives[]` |
| `plan` | `"auto-plan"` | `goal`, `project`, `existing_tasks`, `context_summary`, `requirements_summary`, `roadmap_summary` |
| `run --json` | (no action field) | `project`, `step`, `total_steps`, `tasks[]`, `parallel` |

### `next --json` — Smart Router (primary entry point)

**When the skill is invoked without a specific command (no args), always run `next --json` first.**

Output schema:
```json
{
  "project": "my-project",
  "phase": "research",
  "action": "discuss",
  "args": ["--mode", "interview"],
  "reason": "No CONTEXT.md found. Start requirements interview.",
  "artifacts": { "context": false, "requirements": false, "roadmap": false, "prd": false, "plan_check": false },
  "goal": null,
  "ready": false
}
```

After parsing, execute the recommended action:
- `action: "discuss"` → run `$XMB discuss` with args, then follow the discuss protocol below
- `action: "research"` → run `$XMB research`, then follow the research protocol below
- `action: "plan"` → if `goal` is set, run `$XMB plan "goal"`; otherwise ask user for goal
- `action: "plan-check"` → run `$XMB plan-check`
- `action: "phase"` + `args: ["next"]` → run `$XMB phase next` (phase gate transition)
- `action: "run"` → run `$XMB run --json`, then orchestrate agents
- `action: "quality"` → run `$XMB quality`
- `action: "close"` → run `$XMB close --summary "..."`

### `run --json` Task Schema

```json
{
  "task_id": "t1",
  "task_name": "Implement auth [R1]",
  "size": "medium",
  "agent_type": "executor",
  "model": "sonnet",
  "prompt": "...",
  "on_complete": "node .../x-build-cli.mjs tasks update t1 --status completed",
  "on_fail": "node .../x-build-cli.mjs tasks update t1 --status failed"
}
```

- `agent_type`: `"executor"` (small/medium) or `"deep-executor"` (large)
- `model`: `"sonnet"` (default) or `"opus"` (large tasks)
- `on_complete`/`on_fail`: Callback commands to update task status after agent finishes

### Mapping to Agent Tool

| CLI `agent_type` | Agent `subagent_type` | Fallback (x-agent preset) | `model` |
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

**Interview mode**: Structured multi-round interview with ambiguity gating. Repeats until clarity threshold is met.

1. Run: `$XMB discuss --mode interview`
2. Parse JSON output (`action: "discuss"`, `mode: "interview"`)

#### Round 1: Dimension Scan (mandatory)

Ask exactly one question per dimension. Use AskUserQuestion with multiple questions:

| Dimension | Question Pattern | Example |
|-----------|-----------------|---------|
| **scope** | "What is explicitly OUT of scope?" | "Admin panel? Mobile? i18n?" |
| **users** | "Who are the primary users and what's their technical level?" | "Developers via API? End users via UI?" |
| **tech** | "Are there hard tech constraints or preferences?" | "Must use PostgreSQL? Existing framework?" |
| **quality** | "What's the minimum acceptable quality bar?" | "Tests required? CI/CD? Performance SLA?" |
| **timeline** | "What's the urgency and phasing?" | "MVP first? All-at-once? Deadline?" |

After user answers, compute **ambiguity score** per dimension:

| User answer | Ambiguity |
|-------------|:---------:|
| Specific, decisive ("PostgreSQL, no alternatives") | 0 (clear) |
| Partial ("probably REST, maybe GraphQL") | 1 (needs follow-up) |
| Vague ("whatever works") | 2 (high ambiguity) |
| No answer / skipped | 2 (high ambiguity) |

**Ambiguity gate**: Sum all dimension scores. Max = 10, threshold = 3.
- Total ≤ 3 → proceed to CONTEXT.md generation
- Total > 3 → drill-down round on highest-ambiguity dimensions

#### Round 2+: Drill-Down (conditional)

For each dimension with ambiguity ≥ 2, ask 2-3 targeted follow-up questions:

```
Dimension: scope (ambiguity: 2)
You said "whatever works" for scope. Let me narrow down:
1. Will this need authentication/authorization?
2. Is there an existing codebase this integrates with?
3. Should this be deployable standalone or as part of a larger system?
```

Re-score after each round. Repeat until total ≤ 3 or `--round N` limit reached (default: 3 rounds).

#### CONTEXT.md Generation

After ambiguity gate passes, save:
```bash
$XMB save context --content "# CONTEXT.md\n\n## Goal\n...\n## Scope\n### In Scope\n...\n### Out of Scope\n...\n## Users\n...\n## Tech Constraints\n...\n## Quality Bar\n...\n## Timeline\n...\n## Decisions\n...\n## Ambiguity Log\n| Dimension | Round 1 | Final | Resolution |\n"
```

The **Ambiguity Log** records how each dimension was clarified — this feeds into x-probe if the user runs premise validation later.

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

### Optional: SWOT Analysis (for technology/approach decisions)

When research involves choosing between technologies, frameworks, or approaches, add a SWOT analysis after the 4-agent fan-out:

delegate (analyst, sonnet):
```
"## SWOT Analysis: {technology/approach decision}

Based on research findings:

| | Positive | Negative |
|---|---------|----------|
| **Internal** | **Strengths:** team expertise, existing code | **Weaknesses:** gaps, limitations |
| **External** | **Opportunities:** ecosystem, trends | **Threats:** risks, competition |

Then derive TOWS strategies:
- **SO:** Use strengths to capture opportunities
- **WO:** Address weaknesses to capture opportunities
- **ST:** Use strengths to mitigate threats
- **WT:** Address weaknesses to mitigate threats

Output: 2-3 actionable TOWS strategies that inform the plan phase."
```

This step is triggered when the research goal contains technology comparison keywords (vs, compare, choose, select, migrate).

5. **(Optional but recommended) Validate research artifacts**:
   ```bash
   $XMB discuss --mode validate
   ```
   - Checks completeness, consistency, testability, scope clarity, risk identification
   - If `verdict === "incomplete"`: address gaps via `discuss --mode interview --round 2`
   - If `verdict === "pass"`: proceed to gate

6. **Decision checkpoint (MUST — before gate pass)**:
   Before advancing, check CONTEXT.md `## Decisions` section for unresolved items.
   - Scan for keywords: "미결정", "undecided", "TBD", "조사 후 결정", "to be determined"
   - If unresolved decisions exist → present each to the user via AskUserQuestion with the research findings as context
   - User must confirm a choice for each unresolved decision before proceeding
   - Update CONTEXT.md with confirmed decisions (change "미결정" → chosen option)
   - Only after ALL decisions are resolved → proceed to gate pass

   Anti-patterns:
   - ❌ CONTEXT.md has "미결정" items → immediately `gate pass` (skips decisions)
   - ❌ Assume defaults for unresolved decisions without asking
   - ✅ Present each unresolved decision with research-backed options → AskUserQuestion → update CONTEXT.md → gate pass

7. Advance to Plan phase: `$XMB gate pass "Research complete — all decisions resolved"` → `$XMB phase next`

### Step 3: Plan (Plan Phase)

#### Planning Principles

These principles apply to all plan-phase activities (PRD generation, task decomposition, consensus review, critique).

```
## Planning Principles

1. **Decide what NOT to build first** — Scope is defined more by what you exclude than what you include. Every requirement added is a constraint on every future requirement.
2. **Name the risk, then schedule it early** — Uncertainty should drive ordering. The task you're least sure about goes first, not last. Fail fast > fail late.
3. **A plan is a hypothesis, not a promise** — Plans will change. Design for adaptability: small tasks, clear boundaries, minimal cross-task dependencies.
4. **Intent over implementation** — PRD describes WHAT and WHY. Tasks describe WHAT to do. Neither should prescribe HOW (specific technology/library) unless it's a hard constraint.
5. **If you can't verify it, you can't ship it** — Every requirement needs a success criterion. Every task needs done_criteria. If you can't describe how to check "done," the scope is too vague.
6. **Surface assumptions before tasks** — Before decomposing into tasks, list the assumptions the plan rests on (project state + user intent + constraints). Assumptions with low confidence must be validated (ask user, run probe) before tasks are written.
```

#### PRD Generation (first step of Plan phase)

Before task decomposition, the leader generates a PRD. Based on research artifacts (CONTEXT.md, REQUIREMENTS.md, ROADMAP.md).

**IMPORTANT: Check mode from `.xm/config.json` before generating.**
- `developer` mode → Write PRD in English (technical terms, concise)
- `normal` mode → Write PRD content in Korean (section titles remain in English, body in Korean). Inject this instruction into the agent prompt: `"모든 섹션의 내용을 한국어로 작성하세요. 섹션 제목(Goal, Success Criteria 등)은 영문 유지. 기술 용어는 원어 유지."`

#### PRD Size Tiers

Determine PRD size based on task count expectation or `--size` flag:

| Tier | Condition | PRD Sections |
|------|-----------|-------------|
| **small** | ≤5 expected tasks or `--size small` | 1.Goal, 2.Success Criteria, 3.Constraints, 5.Requirements Traceability, 7.Risks, 8.Architecture, 12.Acceptance Criteria (7 sections) |
| **medium** | 6-15 tasks (default) | Above + 4.NFR, 6.Out of Scope, 9.Key Scenarios (10 sections) |
| **large** | 15+ tasks or `--size large` | All 12 sections (current full template) |

**Rationale for small tier change:** Previous small tier (5 sections) omitted Risks and Architecture, producing PRDs that lacked actionable context for executors. Every project has risks and structure — even small ones.

When generating the PRD, include only the sections for the determined tier. The delegate prompt should specify: "Generate PRD with {tier} tier — include only sections: {section list}."

delegate (foreground, opus recommended):
```
"## PRD Generation: {project_name}
{IF mode === 'normal': '언어: 한국어로 작성. 섹션 제목은 영문 유지, 내용은 한국어. 기술 용어는 원어 유지.'}
Research artifacts:
- CONTEXT: {CONTEXT.md summary}
- REQUIREMENTS: {REQUIREMENTS.md full text}
- ROADMAP: {ROADMAP.md summary (if available)}

Fill in every section of the PRD template below without omission:

# PRD: {project_name}

## 1. Goal
{2-3 sentences: WHAT this project delivers + WHY it matters + WHO benefits.}
{Anti-pattern: 1-line goals like 'Add feature X' — always include the motivation.}
{If the goal needs 'and' joining two unrelated outcomes, split into two projects.}

## 2. Success Criteria
- [SC1] {verb + measurable outcome + threshold. e.g., 'Reduce API latency to <200ms p95'}
- [SC2] {each SC must be binary pass/fail — no 'should be fast' or 'works correctly'}
{Minimum 2 SCs. Each must answer: 'How would a stranger verify this in 5 minutes?'}

## 3. Constraints
- [C1] {hard constraint — non-negotiable. e.g., 'Must use existing PostgreSQL 15 instance'}
- [C2] {preferences disguised as constraints are NOT constraints — move them to NFR}

## 4. Non-Functional Requirements
- Performance: {response time, throughput}
- Security: {authentication, encryption}
- Scalability: {scaling requirements}
- Reliability: {availability, recovery}

## 5. Requirements Traceability
- [R1] {requirement} → SC1
- [R2] {requirement} → SC1, SC2
{Map EVERY item from REQUIREMENTS.md to at least one SC#. Unmapped items = scope creep or missing SC.}
{IDs must be sequential (R1, R2, R3...). Gaps (R1, R2, R6) indicate deleted requirements — renumber.}

## 6. Out of Scope
- {explicitly state what is NOT included — boundaries matter more than inclusions}
{Minimum 2 items. Ask: 'What will users expect this project to do, that it will NOT do?'}

## 7. Risks
{Minimum 2 risks. Format: risk description → likelihood (H/M/L) × impact (H/M/L) → mitigation.}
- {risk 1} — Likelihood: M, Impact: H → Mitigation: {specific action}
- {risk 2} — Likelihood: L, Impact: H → Mitigation: {specific action}
{Anti-pattern: 'Security risks' without specifics. Name the attack vector and the mitigation.}

## 8. Architecture

**Express the system structure with an ASCII diagram.** Select the appropriate type from the guide below.

### Diagram Selection Guide (23 types)

| Category | Situation | Recommended Type |
|------|------|----------|
| **System Architecture** | Overall service/API structure | System Architecture |
| | Logical layer design | Layers |
| | Plugin/module extension | Extension Structure |
| | Distributed system network | Topology |
| **Process/Flow** | API call sequence | Sequence |
| | Task dependencies | Tree, DAG |
| | Async event communication | Message, CQRS |
| | User action branching | User Journey |
| **Data/State** | Data processing flow | Pipeline, ETL |
| | State transitions | State Machine |
| | DB table relationships | ERD |
| **Infrastructure** | Environment switching | Before/After |
| | Network paths | Network Flow |
| | Access control | Security Boundary |
| | Auto-scaling | Resource Allocation |
| **AI/Automation** | Agent collaboration | Multi-Agent |
| | CI/CD | Deployment Pipeline |
| | Error handling | Fallback |
| **Other** | UI wireframe | Layout |
| | Project schedule | Gantt |

### Standard Format

```
■ Diagram: [name]
■ Purpose: [core message 1-2 lines]

[ ASCII Art — use code block ]

■ Legend:
  - [ ] : Component / Server
  - ( ) : Data / State
  - ──▶ : Synchronous call
  - ╌╌▶ : Async communication

■ Key Notes:
  1. [Design point]
  2. [Performance/security notes]
```

### Reference Examples

System Architecture:
```
[Client] ──▶ [WAF/LB] ──▶ [App Cluster] ──▶ [(DB)]
```

Sequence:
```
User        Server        DB
 │── Req ──▶│             │
 │          │── Query ───▶│
 │          │◀── Result ──│
 │◀── Res ──│             │
```

DAG:
```
     ┌── [Build A] ──┐
[Push]               ├──▶ [Test] ──▶ [Deploy]
     └── [Build B] ──┘
```

State Machine:
```
[Pending] ──(Start)──▶ [Running] ──(Done)──▶ [Complete]
                          │
                       (Fail)──▶ [Failed]
```

Multi-Agent:
```
                 ┌──▶ [Planning Agent] ──┐
[Router Agent] ──┤                      ├──▶ [Executor]
                 └──▶ [Memory Mesh] ◀───┘
```

Key decisions: Describe why this structure was chosen and what alternatives were rejected.

## 9. Key Scenarios

Write 2-3 concrete scenarios as step-by-step flows:

### Happy Path
1. User runs `{command}`
2. System does {specific action}
3. User sees {specific output}
4. Result: {measurable outcome}

### Failure Path
1. User runs `{command}` with {invalid input}
2. System detects {specific condition}
3. User sees {error message text}
4. System state: {unchanged / rolled back}

### Edge Case
1. {Unusual but realistic scenario}
2. Expected behavior: {specific}

Include a **Day-0 Demo Script**: the exact commands a PM would run to demo this feature in 3 minutes.

## 10. Data Model & API Contracts

### Entity Model
List core entities with key fields and relationships (Mermaid ER or table):

| Entity | Key Fields | Relationships |
|--------|-----------|---------------|
| {Entity A} | id, name, status, created_at | has_many: {Entity B} |

### Critical API Contracts
For each interface crossing a module boundary, specify:
```
GET /api/{endpoint}
Response: { field1: string, field2: number, nested: { ... } }
Errors: 400 (invalid input), 404 (not found)
```

### Data Flow Trace
Trace one request end-to-end: `User input → Component A (does X) → Component B (does Y) → Output`
Name actual files, functions, or variables at each step.

## 11. Decisions & Assumptions

### Decision Log
For each non-obvious decision, record what was chosen AND what was rejected:
| Decision | Chosen | Rejected | Rationale |
|----------|--------|----------|-----------|
| {topic} | {option A} | {option B, C} | {why A wins} |

### Assumption Register
Separate facts from assumptions. If an assumption breaks, what collapses?
| Assumption | Confidence | If Wrong |
|-----------|-----------|----------|
| {assumption} | high/medium/low | {consequence} |

### Tension Map
Where do requirements conflict? How was each resolved?
| Requirement A | Requirement B | Tension | Resolution |
|--------------|--------------|---------|------------|

### Invariants
Things that must ALWAYS be true regardless of implementation:
- {invariant 1 — e.g., "No writes to .xm/ ever"}
- {invariant 2 — e.g., "safeJoin called on every file path"}

## 12. Acceptance Criteria
- [ ] {verifiable checklist item — must be a command or observable state check}
- [ ] {e.g., `bun test` passes, `curl /api/health` returns 200, file X exists with Y content}
{Minimum: 1 item per SC. Each AC must map back to a Success Criterion.}
{Anti-pattern: 'Code is well-tested' — not verifiable. Use: 'bun test passes with 0 failures'.}

## PRD Section Quality Criteria

**Detailed criteria with Good/Bad examples are in `PRD-GUIDE.md` (same directory).**
When generating a PRD, read `PRD-GUIDE.md` for per-section quality standards.

Core rules (always apply without reading the file):
- Goal: 2-3 sentences with WHAT + WHY + WHO. If it needs 'and' joining unrelated outcomes, split into two projects.
- Success Criteria: Each must be measurable and binary (pass/fail). Minimum 2. 'Works correctly' is NEVER a valid SC.
- Constraints: Only hard constraints — non-negotiable. Preferences go to NFR.
- Requirements Traceability: Every R# maps to at least one SC#. IDs must be sequential — no gaps.
- Risks: Minimum 2. Each with likelihood × impact + specific mitigation. 'Security risks' without specifics = rejected.
- Architecture: ALWAYS include a diagram (even for small projects). A box-and-arrow showing data flow is sufficient.
- Acceptance Criteria: Each item must be testable by command or state check. Minimum 1 per SC.
"
```

**MANDATORY: Save PRD to file IMMEDIATELY after generation.** This is not optional — the PRD must exist as a file before review.
```bash
$XMB save plan --content "{PRD content}"
```
If `save plan` is not called, the PRD will not appear in the dashboard and will be lost on session end.

After saving, proceed to PRD Review.

#### PRD Review (user review and revision)

After PRD generation, **the leader MUST output the full PRD text to the user**. This is non-negotiable — the user cannot review what they cannot see.

**Output protocol:**
1. **Print the entire PRD as text output** — every section, every table, every diagram. Do NOT summarize. Do NOT say "PRD가 생성되었습니다" without showing the content.
2. **After the full text output**, call AskUserQuestion for review.

Anti-patterns:
- ❌ Save PRD to file → immediately ask for review without showing content
- ❌ Show only section titles or a summary instead of the full PRD
- ✅ Output full PRD text → then AskUserQuestion for review

1. **Show full PRD**: Output the ENTIRE PRD.md content as text (mandatory — not a file reference)
2. **Request feedback**: Collect review results via AskUserQuestion:
   ```
   Please review the PRD:
   1) Approve — proceed as-is
   2) Needs revision — tell me what to change
   3) Quality review — Judge Panel scores first; if score < 7.0, auto-escalates to Consensus Review
   4) Rewrite — regenerate the PRD from scratch
   ```
3. **Action per selection**:
   - "Approve" → proceed to task decomposition
   - "Needs revision" → revise PRD with user feedback, then show again (repeat)
   - "Quality review" → run [PRD Quality Gate]; if score < 7.0, automatically run [Consensus Loop] with judge feedback as context
   - "Rewrite" → re-run PRD Generation from scratch

4. **Re-save on revision**:
   ```bash
   $XMB save plan --content "{revised PRD content}"
   ```

5. **Record PRD confirmation**:
   ```
   ✅ PRD reviewed and approved by user.
   Proceeding to task decomposition.
   ```

> Important: The PRD Review loop repeats until the user selects "Approve". Cannot be auto-skipped.
> Loop limit: The entire PRD Review loop (including revisions + rewrites + quality checks + consensus reviews) repeats at most 5 times.
> On reaching 5: Show the current PRD and offer only 2 options: "Approve" or "Abort project".

#### PRD Quality Gate (on-demand)

Runs only when the user selects "Quality check". Not triggered automatically.

```bash
$XMB prd-gate [--threshold N] [--judges N]
```

Read `rubric`, `prd`, `requirements` from the output JSON and perform the following:

1. **Summon Judge Panel** (default 3 agents, adjustable via `--judges`):
   - Rubric: Use the `rubric` array from JSON (completeness, feasibility, atomicity, clarity, risk-coverage)
   - Each judge scores the PRD independently (using x-eval Reusable Judge Prompt)

2. **Display results** (no auto-judgment/regeneration — information only for the user):
   ```
   📋 PRD Quality: {score}/10 (plan-quality rubric)
   | Criterion      | Score | Feedback          |
   |----------------|-------|-------------------|
   | completeness   | 8     | ...               |
   | actionability  | 7     | ...               |
   | scope-fit      | 8     | ...               |
   | risk-coverage  | 6     | ...               |
   ```

3. **Score-based guidance message**:
   - Score >= 7.0 → `"💡 Quality is good — consider approving."`
   - Score 5.0–6.9 → **Auto-escalate to Consensus Review** with judge feedback as context
   - Score < 5.0 → **Auto-escalate to Consensus Review** with judge feedback as context

4. **Record PRD score in project metadata**:
   ```bash
   $XMB save plan --content "PRD Score: {score}/10"
   ```

5. **Return to PRD Review options** — Judge results are provided as reference; the final decision is the user's.

> Call limit: Quality check can run at most 2 times within the same PRD Review session. Resets on "Rewrite".
> After 2 attempts: `"⚠ Quality check limit reached. Select 'Approve', 'Needs revision', or 'Consensus review'."`

#### Consensus Loop (consensus review)

When the user selects "Consensus review", 4 agents review the PRD from multiple perspectives and auto-revise until consensus.

```bash
$XMB consensus [--round N] [--max-rounds N]
```

Read `agents`, `prd`, `round` from the output JSON and perform the following.

**Round 1: broadcast (4 agents)**
```
Agent 1 (architect): "Review the PRD from an architecture perspective.

Principles:
1. Simplest architecture that meets constraints wins. More components = more failure modes.
2. Module boundaries should align with team boundaries and deployment boundaries.
3. Missing interfaces between modules are more dangerous than missing features.

Evaluate:
- Could this be built with fewer components/services/layers?
- Are the boundaries between modules at natural seams (data ownership, deployment unit, team)?
- Are cross-module interfaces defined, or left implicit?

Good OBJECT: 'PRD implies 3 services but only 1 deployment target. Simplify to monolith with module boundaries.'
Bad OBJECT: 'Architecture could be better.'

Conclusion: AGREE or OBJECT + specific feedback. 200 words max."

Agent 2 (critic): "Find weaknesses in the PRD.

Principles:
1. The most dangerous assumption is the one nobody questioned.
2. A contradiction between two requirements is better found now than during implementation.
3. 'We'll figure it out later' is a risk, not a plan.

Evaluate:
- What assumption, if wrong, would invalidate this entire plan?
- Are there contradictions between requirements, constraints, or success criteria?
- Where does the PRD say 'TBD' or imply deferred decisions?

Good OBJECT: '[R3] requires real-time sync but [C2] prohibits WebSocket — contradiction.'
Bad OBJECT: 'Some requirements seem incomplete.'

Conclusion: AGREE or OBJECT + specific feedback. 200 words max."

Agent 3 (planner): "Evaluate the feasibility of the PRD.

Principles:
1. If a task can't be explained in one sentence starting with a verb, it's too big or too vague.
2. Parallel tasks should have zero shared state. If they share a file, they're not parallel.
3. Done criteria that require human judgment ('code is clean') are not done criteria.

Evaluate:
- Can each implied task be completed in one session by one agent?
- Are success criteria measurable without subjective judgment?
- Is the implicit task ordering fail-fast? (highest risk first)

Good OBJECT: '[SC2] says performance is acceptable — not measurable. Needs p95 latency target.'
Bad OBJECT: 'Success criteria need work.'

Conclusion: AGREE or OBJECT + specific feedback. 200 words max."

Agent 4 (security): "Evaluate the security/risk aspects of the PRD.

Principles:
1. Security requirements are constraints, not features. They don't get 'nice to have' priority.
2. Every data flow that crosses a trust boundary needs explicit handling in the plan.
3. 'We'll add auth later' means 'we'll rebuild everything later.'

Evaluate:
- Are auth, authz, and data protection explicitly addressed (not assumed)?
- Do data flows crossing trust boundaries have handling specified?
- Are security risks listed with specific mitigations (not 'follow best practices')?

Good OBJECT: 'No mention of API rate limiting — [R1] public endpoint is DoS-vulnerable without it.'
Bad OBJECT: 'Security could be improved.'

Conclusion: AGREE or OBJECT + specific feedback. 200 words max."
```

**Consensus judgment:**
- **All AGREE** → Consensus reached; show results to user, return to PRD Review options
- **1+ OBJECT** → Leader synthesizes OBJECT feedback to revise PRD → broadcast again (max 3 rounds)
- **No consensus after 3 rounds** → Summarize key disagreements for the user, request user judgment

> Re-entry limit: Consensus Loop can run at most 2 times within the same PRD Review session.
> After 2 attempts: "⚠ Consensus review limit reached. Select 'Approve' or 'Needs revision'."

**Consensus result output:**
```
🏛️ [consensus] PRD Review — Round {n}/{max}

| Agent | Role | Verdict | Key Feedback |
|-------|------|---------|-------------|
| 1 | architect | ✅ AGREE | Structure is sound |
| 2 | critic | ❌ OBJECT | [R3] Missing test strategy |
| 3 | planner | ✅ AGREE | Decomposable |

→ Incorporating critic feedback to revise PRD...
```

After consensus, return to PRD Review options — user must give final "Approve" to proceed.

---

Create tasks informed by research artifacts:

1. Run: `$XMB plan "goal"`
2. Parse JSON output — it now includes `context_summary`, `requirements_summary`, `roadmap_summary`
3. Decompose into 5-10 tasks based on REQUIREMENTS.md:
   - Each task references requirement IDs in its name (e.g., "Implement JWT auth [R1]")
   - Concrete, actionable names (start with verb)
   - Size: small (1-2h), medium (half-day), large (full day+)
   - Dependencies: what must complete first

4. **CONTEXT.md Quality Bar → Task Injection (automatic)**

   Before registering tasks, read CONTEXT.md and extract commitments from these sections:

   | CONTEXT.md Section | Auto-generated task/criteria |
   |--------------------|-----------------------------|
   | **Quality Bar → Testing** | Task: "Write {test_type} tests" + done_criteria from interview spec |
   | **Quality Bar → Documentation** | Task: "Generate {doc_type}" (e.g., OpenAPI spec) |
   | **Quality Bar → Error Handling** | done_criteria injected into relevant endpoint tasks |
   | **Scope → Out of Scope** | Scope guard: plan-check warns if a task name matches an out-of-scope item |
   | **Timeline → Phasing** | If MVP phasing specified, tag tasks as `phase:mvp` or `phase:hardening` |

   Example — if CONTEXT.md says:
   ```
   ## Quality Bar
   ### Testing
   - Integration tests required (happy path + error paths)
   ### Documentation
   - OpenAPI spec required
   ```

   Auto-inject:
   ```bash
   $XMB tasks add "Write integration tests [QA]" --size medium --deps t1,t2
   $XMB tasks update t{last} --done-criteria "happy path + primary error path per endpoint"
   $XMB tasks add "Generate OpenAPI spec [DOC]" --size small --deps t1,t2
   $XMB tasks update t{last} --done-criteria "valid spec, all endpoints documented"
   ```

   Tags: `[QA]` for quality tasks, `[DOC]` for documentation tasks, `[R1]` for requirement tasks. This makes CONTEXT.md → task traceability visible.

5. Register all tasks (requirement-derived + quality-derived):
   ```bash
   $XMB tasks add "Implement JWT auth [R1]" --size medium
   $XMB tasks add "Create CRUD endpoints [R2]" --deps t1 --size medium
   # ... plus auto-injected [QA] and [DOC] tasks from step 4
   ```
   After registering all tasks, derive **done criteria** for each task from the PRD's Section 8 (Acceptance Criteria) and Section 5 (Requirements Traceability):
   ```bash
   $XMB tasks done-criteria
   ```
   This generates `done_criteria` for each task — a checklist of verifiable conditions that define "done."
   Quality Bar items from CONTEXT.md are injected into relevant task done_criteria automatically.
   If auto-generation is insufficient, manually set criteria:
   ```bash
   $XMB tasks update t1 --done-criteria "JWT issue/verify works, refresh token rotation implemented"
   ```

6. Validate the plan:
   ```bash
   $XMB plan-check
   ```
   This checks 11 dimensions: atomicity, dependencies, coverage, granularity, completeness, context, naming, tech-leakage, scope-clarity, risk-ordering, overall. Fix any errors.

6. **(Conditional) Strategic critique** — auto-skip when task count ≤ 5 (small project):
   ```bash
   $XMB discuss --mode critique
   ```
   - Reviews approach fitness, risk ordering, dependency structure, missing tasks, done-criteria quality, scope creep
   - If `verdict === "revise"`: apply action items, then re-run critique (`--round 2`)
   **Auto-skip rule**: If `tasks.length <= 5`, skip critique and proceed directly to step 7 (steps compute). Show: `"💡 Small project (≤5 tasks) — skipping strategic critique."` Critique is most valuable for complex plans (6+ tasks, cross-cutting dependencies).
   - If `verdict === "approve"`: proceed to step review

7. Compute steps + forecast:
   ```bash
   $XMB steps compute
   $XMB forecast
   ```
8. **Plan Review** — Show task list + DAG + forecast to the user and AskUserQuestion:
   ```
   Please review the plan:
   1) Approve — proceed to Execute
   2) Needs revision — add/remove/change tasks
   3) Consensus review — 4 agents review the full plan (PRD + tasks + DAG)
   4) Re-plan — start over from plan
   ```
   - "Approve" → gate pass
   - "Needs revision" → apply user feedback then re-run plan-check
   - "Consensus review" → run [Consensus Loop] against the full plan (PRD + tasks + DAG)
   - "Re-plan" → restart from PRD Review
9. Advance: `$XMB gate pass` → `$XMB phase next`

### Step 4: Execute (Execute Phase)

1. `$XMB run --json`
2. Parse JSON → spawn Agent per task:
   - `agent_type: "deep-executor"` → `subagent_type: "oh-my-claudecode:deep-executor"`, `model: "opus"`
   - otherwise → `subagent_type: "oh-my-claudecode:executor"`, `model: "sonnet"`
   - `prompt`: use `task.prompt` value + **inject `done_criteria`** as acceptance contract:
     ```
     ## Acceptance Contract
     This task is complete only when all of the following conditions are met:
     {list task.done_criteria items as a checklist}
     Upon completion, report the fulfillment status of each condition.
     ```
   - `run_in_background: true` (parallel)
3. On completion: `$XMB tasks update <id> --status completed|failed`
4. Check `$XMB run-status`, advance to next step or phase

**Call AskUserQuestion before advancing to Verify phase.** When all tasks complete, ask the user to confirm before advancing (e.g., "All tasks completed. Proceed to the Verify phase?" in developer mode, or `"모든 태스크 완료. Verify 단계로 넘어갈까요?"` in normal mode). Do NOT run `phase next` without user confirmation.

#### Strategy-Tagged Execution

If a task has the `--strategy` flag, execute it via x-op strategy:

```
$XMB tasks add "Review auth module [R3]" --strategy review --rubric code-quality
$XMB tasks add "Design payment flow [R1]" --strategy refine --rubric plan-quality
$XMB tasks add "Implement CRUD endpoints [R2]"   # regular task (no strategy)
$XMB tasks add "Implement payment system [R4]" --team engineering  # assigned to team
```

Tasks with a strategy in `$XMB run --json` output include `strategy` and `strategy_hint` fields.
During execution, the leader determines the task type:

```
For each task in run output:
  if task.strategy:
    → /x-op {task.strategy} "{task.task_name}" --verify --rubric {task.rubric || 'general'}
    → collect score, then $XMB tasks update {task.task_id} --score {score}
    → $XMB tasks update {task.task_id} --status completed
  elif task.team:
    → /x-agent team assign {task.team} "{task.task_name}"
    → TL manages members internally, reports on completion
    → $XMB tasks update {task.task_id} --status completed
  else:
    → execute via regular agent delegation
```

#### Quality Dashboard

`status` output shows per-task score:

```
📊 Tasks (scored):
  [t1] Design payment flow [R1]     ✅ completed  Score: 8.2/10
  [t2] Review auth module [R3]      ✅ completed  Score: 7.5/10
  [t3] Implement CRUD endpoints [R2] ✅ completed
  [t4] Add error handling [R4]      ⚠ completed  Score: 6.1/10 ⚠

Project Quality: 7.3/10 avg (1 below threshold)
```

#### Automatic Strategy Recommendation

When a task has no strategy, the leader infers from the task name:

| Task keyword | Recommended strategy |
|-------------|---------|
| review, audit, check | review |
| design, plan, architect | refine |
| compare, evaluate, vs | debate |
| investigate, analyze, debug | investigate |
| implement, build, create | (regular execution) |

Recommendation only — not auto-applied. User must specify via `--strategy`.

### Step 5: Verify (Verify Phase)

1. Run quality checks: `$XMB quality`
2. Check requirement coverage: `$XMB verify-coverage`
3. Check acceptance contracts: `$XMB verify-contracts`
   - For each task with `done_criteria`, verify that the criteria are met
   - Output: `✅ t1: 3/3 criteria met` or `❌ t2: 1/3 criteria met — [missing: "at least 3 unit tests"]`
   - Unmet criteria → report to user for resolution before closing
4. **Call AskUserQuestion before closing.** Show quality check results first, then ask the user to confirm before advancing (e.g., "Quality checks passed. Proceed to the Close phase?" in developer mode, or `"품질 검사 완료. 프로젝트를 Close 단계로 넘어갈까요?"` in normal mode). Do NOT run `phase next` without user confirmation.
5. If user confirms: `$XMB phase next`

### Step 6: Close

`$XMB close --summary "Completed all requirements"`

---

## Quick Mode: One-Shot Plan→Run

A condensed version of the full 6-step flow for simple, well-defined goals.

### Quick Mode Entry Conditions
- **`--quick` flag explicitly provided** (e.g., `/x-build plan "Build X" --quick`)
- Without `--quick`, `plan` ALWAYS runs the full flow: Research → PRD → Tasks. "plan" means planning, not skipping it
- Quick Mode is the ONLY case where Research is skipped — `phase set plan` is NEVER used outside Quick Mode
- Goal should be simple (expected 5 or fewer tasks); for complex goals, recommend full flow even with `--quick`

### Quick Mode Flow

```
Goal → Init → Auto-Plan → Review → Execute → Verify → Close
       (auto)   (auto)    (user)    (auto)     (auto)   (auto)
```

1. **Init**: `$XMB init quick-{timestamp}`
2. **Phase skip**: `$XMB phase set plan` (skip Research)
3. **Auto-Plan**: `$XMB plan "{goal}"` → parse JSON → create 3-5 tasks
   - Task decomposition from goal text only, without research artifacts
   - PRD generation skipped — task names and done_criteria are sufficient
   - Register tasks: `$XMB tasks add "..." --size small|medium`
   - Auto-generate done-criteria: `$XMB tasks done-criteria`
4. **Quick Review**: Show task list via AskUserQuestion
   ```
   Quick Plan:
   - t1: {task1} (small)
   - t2: {task2} (medium, depends: t1)
   - t3: {task3} (small)

   1) Execute — proceed as-is
   2) Revise — add/change tasks
   3) Full flow — run full Research→PRD→Plan
   ```
5. **Execute**: `$XMB steps compute` → `$XMB phase set execute` → `$XMB run --json`
   - Parse JSON → spawn Agent per task (same as Step 4)
   - Wait for all tasks to complete → check with `$XMB run-status`
6. **Verify**: `$XMB phase set verify` → `$XMB quality` → `$XMB verify-contracts`
7. **Close**: `$XMB close --summary "Quick mode completed"`

### Error Recovery

If an error occurs during Quick Mode execution:

1. **Task failure**: Check the failed task's error, fix it, then re-run `$XMB run`
   - `cmdRun` starts from non-completed tasks, so re-running is effectively a resume
   - No separate --resume flag needed
2. **Circuit breaker open**: Check `$XMB circuit-breaker status` → `$XMB circuit-breaker reset` → `$XMB run`
3. **Full restart**: `$XMB phase set plan` → modify tasks → `$XMB run`

---

## Error Recovery Guide

When x-build run fails during execution, recovery is possible without a separate checkpoint/resume mechanism:

| Situation | Recovery method |
|------|----------|
| Single agent failure | `$XMB tasks update <id> --status pending` → `$XMB run` |
| Multiple agent failures | Identify failure cause → modify tasks → `$XMB run` |
| Circuit breaker open | `$XMB circuit-breaker reset` → `$XMB run` |
| Incorrect task decomposition | `$XMB phase set plan` → modify tasks → `$XMB steps compute` → `$XMB phase set execute` → `$XMB run` |
| Session terminated mid-run | In new session: `$XMB status` to check current state → `$XMB run` (previous state is preserved) |

> **Core principle**: The CLI persists all state to `.xm/build/` files, so state is preserved even if the session disconnects. `x-build run` always starts from incomplete tasks.

---

## Discuss Command (Phase-Aware Deliberation)

The discuss command is a multi-mode deliberation engine that adapts to the current project phase.

When `discuss` is invoked:

1. Run: `$XMB discuss [--mode MODE] [--round N]`
2. Parse JSON output (`action: "discuss"`)
3. Check `mode` and `round` fields, then branch accordingly:

### Interview Mode (default, Research phase)

Multi-round requirements gathering with drill-down.

**Round 1** (initial):
- Identify 4-6 gray areas: technology choices, scope boundaries, performance requirements, auth strategy, data model, deployment target
- For each area, present 2-4 options as numbered choices
- Collect answers
- Generate CONTEXT.md with sections: Goal, Decisions, Constraints, Out of Scope, Assumptions
- **Completeness check**: After saving CONTEXT.md, evaluate coverage against `completeness_dimensions` from JSON output:
  - For each dimension (functional_requirements, non_functional_requirements, constraints, error_handling, security, performance, data_model, integrations):
    - Rate coverage: `covered` | `partial` | `missing`
  - If any dimension is `missing` and `round < max_rounds`: recommend drill-down
- Save round result:
  ```bash
  $XMB save context --content "..." # Update CONTEXT.md
  ```
  Also write round metadata to `01-research/discuss-interview-r{round}.json`:
  ```json
  {
    "round": 1,
    "questions_asked": 6,
    "answers_collected": 6,
    "completeness": { "functional_requirements": "covered", "security": "missing", ... },
    "recommendation": "drill-down on security, error_handling"
  }
  ```

**Round 2+ (drill-down)**: When `round > 1` and `previous_round` is present:
- Read `previous_round.completeness` to identify gaps
- Generate 2-4 targeted follow-up questions for `missing`/`partial` dimensions only
- Collect answers
- Update CONTEXT.md (merge new information, don't overwrite)
- Re-evaluate completeness
- If all dimensions are `covered` or `partial`, or `round >= max_rounds`: conclude

### Assumptions Mode (Research phase)

> **On-demand only** — not part of the default Research flow. Only triggered when `next --json` detects an existing codebase (presence of `package.json`, `go.mod`, `Cargo.toml`, etc.) or when the user explicitly calls `discuss --mode assumptions`. Skipped for greenfield projects.

- Read codebase files relevant to the goal
- Generate 5-10 assumptions with format:
  ```
  [HIGH] We'll use the existing Express.js server → Failure: need new framework setup
  [MED] PostgreSQL for data storage → Failure: different DB required
  [LOW] No real-time features needed → Failure: need WebSocket setup
  ```
- User confirms/rejects each
- Save confirmed to CONTEXT.md

### Validate Mode (Research → Plan transition)

> **Lightweight alternative available** — For simple projects, `gate pass` automatically checks: (1) CONTEXT.md exists, (2) REQUIREMENTS.md has ≥1 R# item, (3) CONTEXT.md Decisions has no unresolved items. Full validate mode is recommended only for complex projects (10+ requirements).

Verifies research artifacts are complete and consistent before moving to Plan phase.

1. Run: `$XMB discuss --mode validate`
2. JSON output includes `requirements`, `roadmap`, `context_full`
3. Evaluate across 5 validation criteria:

| Criterion | What to check |
|-----------|---------------|
| **Completeness** | All functional areas from CONTEXT.md have requirements in REQUIREMENTS.md |
| **Consistency** | No contradictions between CONTEXT.md decisions and REQUIREMENTS.md |
| **Testability** | Each requirement [R*] has verifiable acceptance criteria |
| **Scope clarity** | Out-of-scope items are explicit; no ambiguous boundaries |
| **Risk identification** | Major risks from research are acknowledged in ROADMAP.md |

4. Output verdict and save to `01-research/discuss-validate.json`:
   ```json
   {
     "verdict": "pass" | "incomplete",
     "round": 1,
     "summary": "2 requirements lack acceptance criteria, security section missing",
     "criteria": {
       "completeness": { "status": "pass", "detail": "..." },
       "consistency": { "status": "pass", "detail": "..." },
       "testability": { "status": "fail", "gaps": ["R3", "R7"] },
       "scope_clarity": { "status": "pass", "detail": "..." },
       "risk_identification": { "status": "fail", "detail": "No security risks listed" }
     },
     "recommended_actions": [
       "Add acceptance criteria to R3, R7",
       "Run discuss --mode interview --round 2 to address security"
     ]
   }
   ```
5. If `verdict === "incomplete"`: present gaps to user and recommend specific actions
6. If `verdict === "pass"`: recommend `gate pass`

### Critique Mode (Plan phase)

Strategic review of task decomposition by Critic and Architect perspectives.

1. Run: `$XMB discuss --mode critique`
2. JSON output includes `prd`, `tasks`, `requirements`, `plan_check`
3. Evaluate across 6 strategic dimensions (beyond plan-check's structural checks):

| Dimension | Principle | Good Assessment | Bad Assessment |
|-----------|-----------|----------------|----------------|
| **Approach fitness** | Simplest approach that meets constraints. If a simpler alternative exists, the burden is on the complex approach to justify itself. | "Event sourcing justified: audit trail is [C2] constraint" | "Using microservices because it's modern" |
| **Risk ordering** | Highest uncertainty first. If a task depends on an unproven assumption, it goes to step 1. | "t1: Validate third-party API integration (highest uncertainty)" | "t1: Setup project boilerplate" |
| **Dependency structure** | Maximize parallelism. If tasks A and B have no data dependency, they should not have a declared dependency. | "t1,t2,t3 parallel → t4 depends on all" | "t1→t2→t3→t4 serial chain with no real dependency" |
| **Missing tasks** | Every transition between tasks needs checking: setup→code, code→test, test→deploy. Implicit tasks are the ones that fail. | "Missing: DB migration task between schema design and API implementation" | "Looks complete" |
| **Done-criteria quality** | Each criterion is a command you can run or a state you can check. Subjective criteria are not criteria. | "JWT endpoint returns 401 for expired token" | "Auth works properly" |
| **Scope creep** | If a task doesn't trace back to a requirement [R#], it's scope creep. Nice-to-haves should be explicit and deferrable. | "t6 traces to R4" | "t6: Add dark mode (not in requirements)" |

4. For each dimension, provide:
   - Assessment: `good` | `concern` | `critical`
   - Detail: specific observation
   - Suggestion: actionable improvement (if concern/critical)

5. Output verdict and save to `02-plan/discuss-critique.json`:
   ```json
   {
     "verdict": "approve" | "revise",
     "round": 1,
     "summary": "Good decomposition but high-risk auth task is in step 3; move to step 1",
     "dimensions": {
       "approach_fitness": { "assessment": "good", "detail": "..." },
       "risk_ordering": { "assessment": "concern", "detail": "Auth task t4 depends on t2,t3 but is highest risk", "suggestion": "Extract auth spike as t0 with no deps" },
       ...
     },
     "action_items": [
       "Reorder: move auth spike to step 1",
       "Add missing task: database migration setup"
     ]
   }
   ```
6. If `verdict === "revise"`: present concerns and action items; user can apply fixes then re-run critique
7. If `verdict === "approve"`: recommend `plan-check` then `gate pass`

**Multi-round critique** (`--round 2+`): When `previous_round` is present:
- Focus only on whether previous `action_items` were addressed
- Verify fixes didn't introduce new issues
- Lighter evaluation — skip dimensions that were `good` in previous round

### Adapt Mode (Execute phase, between steps)

Adaptive review during execution to catch plan divergence.

1. Run: `$XMB discuss --mode adapt ["specific concern"]`
2. JSON output includes `tasks`, `steps`, `progress`, `topic`
3. Compare execution reality vs plan expectations:

| Check | What to evaluate |
|-------|-----------------|
| **Completed vs expected** | Did completed tasks produce expected artifacts/results? |
| **Discovered complexity** | Any task that took significantly longer or required unexpected changes? |
| **Remaining relevance** | Are remaining tasks still necessary given what was learned? |
| **New tasks needed** | Did execution reveal tasks not in the original plan? |

4. If `topic` is provided, focus evaluation on that specific area
5. Output to `03-execute/discuss-adapt.json`:
   ```json
   {
     "verdict": "continue" | "replan",
     "summary": "Step 1 revealed API needs pagination — add task for pagination support",
     "observations": ["...", "..."],
     "recommended_changes": [
       { "type": "add_task", "description": "Add pagination to list endpoints" },
       { "type": "update_task", "task_id": "t5", "change": "Add caching requirement" }
     ]
   }
   ```
6. If `verdict === "replan"`: present changes, user can apply via `tasks add`/`tasks update`
7. If `verdict === "continue"`: proceed with next `run`

### Saving discuss results

All modes save via the skill layer:
- **interview/assumptions**: `$XMB save context --content "..."` (updates CONTEXT.md)
- **validate**: Write JSON to `01-research/discuss-validate.json`
- **critique**: Write JSON to `02-plan/discuss-critique.json`
- **adapt**: Write JSON to `03-execute/discuss-adapt.json`

Use Bash to write JSON result files (atomic write):
```bash
echo '{"verdict":"pass",...}' > .xm/build/{project}/{phase-dir}/discuss-{mode}.json.tmp && mv .xm/build/{project}/{phase-dir}/discuss-{mode}.json.tmp .xm/build/{project}/{phase-dir}/discuss-{mode}.json
```

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
| atomicity | Each task completable in one session; warns if 3+ tasks are large (G4) |
| dependencies | No orphan deps, no cycles |
| coverage | All requirements referenced in task names or done_criteria (G2) |
| granularity | Not too many large tasks; warns if >15 tasks (over-decomposition) (G6) |
| completeness | Enough tasks to cover the goal |
| context | CONTEXT.md exists for informed planning |
| naming | Tasks start with action verbs (44-verb list) (G7) |
| tech-leakage | Tasks don't name specific technologies unless declared in CONTEXT.md or PRD Constraints |
| quality-bar | CONTEXT.md Quality Bar items are mapped to tasks |
| scope-clarity | Scope guard: warns if task name matches PRD Out of Scope keywords (G1) |
| risk-ordering | Uses DAG step position, not array index (G3) |
| overall | Combined assessment |

Run: `$XMB plan-check`
Fix errors → re-run until all pass → `$XMB gate pass`

### quality-bar Check Rules

Read CONTEXT.md `## Quality Bar` section. For each sub-section (Testing, Documentation, Error Handling):
- Check if at least one task addresses it (by `[QA]`/`[DOC]` tag or keyword match)
- Check if the relevant done_criteria reflect the specific requirements from the interview

| Quality Bar item | Expected task pattern |
|-----------------|----------------------|
| "Integration tests required" | Task with `[QA]` tag or name containing "test" |
| "OpenAPI spec required" | Task with `[DOC]` tag or name containing "OpenAPI/swagger/spec" |
| "Error handling: 401/400/404" | done_criteria in endpoint tasks mentioning status codes |

- Missing mapping → `error`: `"Quality Bar requires 'integration tests' but no task addresses this. Add: tasks add 'Write integration tests [QA]'"`
- Partial mapping → `warn`: `"Quality Bar requires 'OpenAPI spec' — task t5 exists but has no done_criteria specifying it"`

### scope-guard Check Rules

Read CONTEXT.md `## Scope → Out of Scope` section. For each out-of-scope item:
- Check if any task name or description contains matching keywords
- Match → `warn`: `"t4 'Build admin panel' matches Out of Scope item 'Admin panel'. Confirm this is intentional or remove the task."`

### tech-leakage Check Rules

If a task name/description contains a specific technology name (framework, library, service), verify that the technology is declared in **CONTEXT.md** or **PRD Section 3 (Constraints)**.

- Declared technology → pass (already a decided constraint)
- Undeclared technology → `warn`: `"t3: 'Redis' is not declared in CONTEXT.md or PRD Constraints — consider using intent ('implement caching') instead of implementation ('add Redis cache')"`

This check is at the **warn** level and does not fail plan-check overall. Since technology choices decided in the PRD are fine to use in tasks, this does not block intentional implementation-specific naming by the user.

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
| Plan | plan-check passed, no critique | → `discuss --mode critique` (suggest) |
| Plan | critique verdict "revise" | → Fix action items, re-critique |
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

### Auto-Handoff on Phase Transition

When `phase next` runs, it **automatically triggers `handoff`** to preserve the current phase's state. This prevents context accumulation at the orchestrator (leader) level and ensures the next phase starts with structured context.

Extended `phase next` behavior:
```
1. Gate verification (existing)
2. $XMB handoff          ← auto-triggered (saves current phase state)
3. Phase state transition (existing)
4. Output handoff summary to leader:
   "📋 Phase handoff saved. Key decisions: {N}, Pending risks: {M}"
```

The handoff document can be restored in the next phase via `$XMB handoff --restore`, or injected as context to new agents. This naturally discards the "noise of the process" — exploration paths, debugging logs, abandoned alternatives — and carries forward **only decisions and artifacts** to the next phase.

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

### x-op Integration (Research Phase)

The `research` command's 4-agent fan-out can optionally be replaced with x-op's `refine` strategy for iterative convergence:

```
# Default: 4-agent parallel fan-out (stack, features, architecture, pitfalls)
$XMB research "goal"

# Alternative: Use x-op refine for Diverge→Converge→Verify rounds
# Invoke /x-op refine "goal" instead, then save results:
$XMB save requirements --content "..."
$XMB save roadmap --content "..."
```

Use x-op refine when the goal is ambiguous and benefits from multiple iteration rounds.

### x-solver Integration (Execute Phase)

For complex sub-problems within a task, x-solver can be invoked:

```
# During task execution, if a sub-problem needs structured decomposition:
# Invoke /x-solver decompose "sub-problem"
# Then feed the solution back into the task
```

### Shared Decision Context

x-build decisions (`decisions add/list/inject`) can be injected into x-solver sessions:

```bash
# Export decisions for other tools
$XMB decisions inject
# Output: markdown of recent decisions — paste into x-solver context
```

Future: shared `.xm/shared/decisions.json` for automatic cross-tool context.

---

## Shared Config Integration

x-build references the shared configuration in `.xm/config.json`:

| Setting | Key | Default | Effect |
|---------|-----|---------|--------|
| Mode | `mode` | `developer` | Output style (technical terms vs simple language) |
| Agent count | `agent_max_count` | `4` | Number of research agents, parallel run concurrency |
| TL model | `team_default_leader_model` | `opus` | Team Leader model for `--team` tasks |
| Team member count | `team_max_members` | `5` | Max members per team |

Change settings:
```bash
$XMB config set agent_max_count 10   # max parallelism
$XMB config set agent_max_count 2    # save tokens
$XMB config show                     # show current settings
```

### Config Resolution Priority

1. CLI flag (`--agents N`) — highest priority when specified
2. Tool-specific local config (`.xm/build/config.json`)
3. Shared config (`.xm/config.json`)
4. Defaults

---

## Trace Recording

session_start and session_end are **automatic** — recorded by `.claude/hooks/trace-session.mjs` on Skill tool invocation. No manual action needed.

### Per task agent (SHOULD — best-effort)

Read session ID from `.xm/traces/.active`, then record agent_step with task_id as role, model, estimated tokens, duration, and status.

### Rules
1. session_start/session_end — **automatic** via hook, do not emit manually
2. agent_step — **best-effort**, record when possible
3. **Metadata only** — never include task output in trace entries
4. If trace write fails, log to stderr and continue

---

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "start project", "new project" | `init` |
| "what should I do?", "what's next?" | `next` |
| "gather requirements", "ask me questions" | `discuss` |
| "investigate", "research" | `research` |
| "validate requirements", "anything missing?" | `discuss --mode validate` |
| "make a plan", "build me ~" (goal) | `plan "goal"` |
| "validate plan", "is the plan ok?" | `plan-check` |
| "critical review", "review the plan", "critique" | `discuss --mode critique` |
| "mid-check", "need to adjust the plan?" | `discuss --mode adapt` |
| "status" | `status` |
| "next phase" | `phase next` |
| "approve", "LGTM" | `gate pass` |
| "execute", "run" | `run` |
| "cost" | `forecast` |
| "coverage" | `verify-coverage` |
| "save session" | `handoff` |
| "export" | `export` |
| "change mode" | `mode` |
| "agent settings", "agent level" | `config show` / `config set agent_max_count` |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "We'll figure out edge cases during implementation" | Edge cases are why you plan. Discovering them mid-build means your plan was incomplete — and now rework is expensive. |
| "This task is obvious, it doesn't need done_criteria" | Without done_criteria, "done" is subjective. If you can't write it in one sentence, the task is too big. |
| "Adding more detail to the PRD slows us down" | Vague PRDs cause rework. Ten minutes of spec clarity saves hours of implementation churn. |
| "The risk is unlikely, skip the mitigation" | Risks are ranked by likelihood × impact. Low-likelihood × high-impact still needs a plan. Silent risks become incidents. |
| "We can parallelize everything" | Real dependencies exist. Declaring false parallelism creates integration debt — tasks that "could" run in parallel but actually serialize on shared state. |
| "The scope is fine as is" | Scope is defined by exclusion. If you haven't decided what NOT to build, you haven't scoped anything. |
| "Planning is overhead, not value" | Planning is where wrong turns are found for free. Every hour spent in plan-phase saves multiple hours in exec-phase. |
