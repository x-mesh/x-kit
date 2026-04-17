# Workflow Guide

Full x-build workflow from goal to project close, including planning principles, phase-by-phase execution, Quick Mode shortcut, and error recovery.

## Planning Principles

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

Read `references/prd-template.md` for the full PRD structure (Section 0 Assumptions + Sections 1-13) and per-section quality criteria before generating. Fill in every section without omission.
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

## Applies to

Used by x-build routing after init/plan command parsing. The leader consults this guide during phase execution. For the full command reference, see the main SKILL.md. For discuss modes (interview/assumptions/validate/critique/adapt), see `commands/discuss.md`.
