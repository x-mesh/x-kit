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

## Phase 0: Project Environment Detection

Before writing PRD `done_criteria` or any task involving test/lint/build commands, detect the project's toolchain. Never hardcode `npm test` or `main` — derive from the project.

### Package manager / runner

| Lockfile / manifest found | Package manager | Test / lint / build prefix |
|--------------------------|-----------------|----------------------------|
| `bun.lockb` | bun | `bun test` / `bun run lint` / `bun run build` |
| `pnpm-lock.yaml` | pnpm | `pnpm test` / `pnpm lint` / `pnpm build` |
| `yarn.lock` | yarn | `yarn test` / `yarn lint` / `yarn build` |
| `package-lock.json` | npm | `npm test` / `npm run lint` / `npm run build` |
| `pyproject.toml` + `uv.lock` | uv | `uv run pytest` / `uv run ruff check` |
| `pyproject.toml` (no uv) | pip / poetry | `pytest` / `ruff check` |
| `Cargo.toml` | cargo | `cargo test` / `cargo clippy` / `cargo build` |
| `go.mod` | go | `go test ./...` / `go vet ./...` / `go build ./...` |

Probe once per project (via Bash `ls` or `test -f`) and reuse the result across the session.

### Base branch

Never hardcode `main`. Detect via:

```bash
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' \
  || git remote show origin 2>/dev/null | awk '/HEAD branch/ {print $NF}' \
  || echo main
```

Store as `{base_branch}` and use it for all branch comparisons in PRD / plan / tasks.

### Validation scripts

For Node projects, read `package.json` scripts once to discover available entries (`type-check`, `typecheck`, `tsc`, `lint`, `lint:fix`, `test`, `test:unit`, `build`) and prefer them over generic defaults.

### When to use

- Writing `done_criteria` in tasks (Plan phase): pull commands from detection, not memory
- Writing Verify-phase quality checks: same
- When a user's goal mentions tests/lint/build without specifying commands: detect and confirm

If detection is ambiguous (multiple lockfiles, unknown manifest), ask the user via AskUserQuestion rather than guessing.

## AskUserQuestion Dark-Theme Rule

See `references/ask-user-question-rule.md` — the `question` field is invisible on dark terminals; put context in markdown, use `header`/`label`/`description` for user-facing text.

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

See `references/cli-skill-protocol.md` — JSON output schema for next/discuss/research/plan/run commands, action types, run task schema, agent_type → subagent_type mapping.

---

## Workflow

See `references/workflow-guide.md` — end-to-end runbook covering:
- Planning Principles (Decide-what-NOT-to-build, Name-the-risk-early, plans-as-hypotheses)
- Step-by-step execution (Init → Discuss → Research → Plan → Execute → Verify → Close)
- Quick Mode (one-shot plan→run for simple goals)
- Error Recovery Guide (task failure, circuit breaker, replan)

Consult this file when running `plan "goal"` (full mode) or `plan "goal" --quick` (Quick Mode).

---

## Discuss Command (Phase-Aware Deliberation)

See `commands/discuss.md` — multi-mode deliberation engine (interview/assumptions/validate/critique/adapt) adapting to current project phase. JSON output schema + per-mode workflow.

---

## Commands Reference

See `commands/other-commands.md` — research (4-agent parallel investigation), plan-check (11-dimension validation including quality-bar / scope-guard / tech-leakage), next (smart routing), handoff (session preservation), context-usage (token budget), verify-coverage (requirement coverage).

---

## Data Model (`.xm/build/`)

See `references/data-model.md` — directory layout of `.xm/build/projects/<name>/`, task/step/circuit-breaker JSON schemas, HANDOFF.json structure.

---

## Plugin Integration

See `references/plugin-integration.md` — how x-build uses x-op (alternative to 4-agent research), x-solver (sub-problem decomposition), x-kit shared decisions, future shared-state plans.

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

See `references/trace-recording.md` — session_start/session_end are automatic via `.claude/hooks/trace-session.mjs`; emit best-effort `agent_step` entries for long sub-operations.

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
