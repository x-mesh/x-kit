---
name: x-build
description: Phase-based project harness — manage project lifecycle, DAG execution, cost forecasting, and agent orchestration
---

<Purpose>
x-build manages the full project lifecycle (Research → Plan → Execute → Verify → Close) with structured requirements gathering, parallel research, plan validation, DAG-based step execution, quality gates, cost forecasting, decision memory, and agent orchestration.
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
- Git operations not related to x-build
</Do_Not_Use_When>

# x-build — Phase-Based Project Harness

## Mode Detection

Check mode before every command:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/x-build-cli.mjs mode show 2>/dev/null | head -1
```

**Developer mode**: Use technical terms (DAG, phase, gate, step, context, retry, circuit breaker). Concise.

**Normal mode**: Use simple language. "phase" → "단계", "gate" → "확인 절차", "step" → "순서".
Use cooking analogies: project = recipe, phases = big steps (prep → cook → taste → serve), tasks = individual items.
Always use 존댓말. Explain commands: `xmb steps compute` (할 일의 순서를 자동으로 계산합니다).

## CLI

All commands via:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/x-build-cli.mjs <command> [args]
```

Shorthand in this document: `$XMB` = `node ${CLAUDE_PLUGIN_ROOT}/lib/x-build-cli.mjs`

> **⚠ Bash tool 실행 시 반드시 shell function으로 정의 후 사용:**
> ```bash
> xmb() { node "${CLAUDE_PLUGIN_ROOT}/lib/x-build-cli.mjs" "$@"; }
> xmb plan "goal"
> ```
> **금지:** `XMB="node ..."` 변수 할당 후 `$XMB plan` — zsh에서 전체 문자열을 단일 명령으로 인식하여 실패함.
> 여러 명령을 연속 실행할 때는 첫 줄에 function을 정의하고 이후 `xmb <command>`로 호출.

## Phase Lifecycle

```
Research → [PRD] → Plan → Execute → Verify → Close
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
- `init <name>` — Create project (`.x-build/` in cwd)
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
- `verify-contracts` — Check task done_criteria fulfillment
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
- `config show|set|get` — Shared config management (agent_max_count, mode)
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

#### PRD Generation (Plan phase 첫 단계)

태스크 분해 전에 리더가 PRD를 생성한다. Research 산출물(CONTEXT.md, REQUIREMENTS.md, ROADMAP.md)을 기반으로:

delegate (foreground, opus 권장):
```
"## PRD Generation: {project_name}
Research 산출물:
- CONTEXT: {CONTEXT.md 요약}
- REQUIREMENTS: {REQUIREMENTS.md 전문}
- ROADMAP: {ROADMAP.md 요약 (있으면)}

아래 PRD 템플릿의 모든 섹션을 빠짐없이 작성하라:

# PRD: {project_name}

## 1. Goal
{1-2 문장 — 이 프로젝트가 해결하는 핵심 문제}

## 2. Success Criteria
- [SC1] {측정 가능한 성공 기준}
- [SC2] ...

## 3. Constraints
- [C1] {기술적/비즈니스 제약}
- [C2] ...

## 4. Non-Functional Requirements
- Performance: {응답 시간, 처리량}
- Security: {인증, 암호화}
- Scalability: {확장 요구사항}
- Reliability: {가용성, 복구}

## 5. Requirements Traceability
- [R1] {요구사항} → SC1
- [R2] {요구사항} → SC1, SC2
(REQUIREMENTS.md의 모든 항목을 Success Criteria에 매핑)

## 6. Out of Scope
- {포함하지 않는 것을 명시}

## 7. Risks
- {식별된 리스크와 완화 방안}

## 8. Acceptance Criteria
- [ ] {검증 가능한 체크리스트 항목}
- [ ] ...
"
```

PRD를 `.xm/build/projects/{name}/02-plan/PRD.md`로 저장:
```bash
$XMB save plan --content "{PRD 내용}"
```

PRD 생성 후 PRD Review로 진행.

#### PRD Review (사용자 리뷰 및 수정)

PRD 생성 후, **사용자에게 먼저 PRD를 표시**하고 피드백을 수렴한다. 사용자 승인 없이 태스크 분해로 넘어가지 않는다.

1. **PRD 전문 표시**: PRD.md 전체를 사용자에게 출력
2. **피드백 요청**: AskUserQuestion으로 리뷰 결과 수집:
   ```
   PRD를 검토해주세요:
   1) 승인 — 이대로 진행
   2) 수정 필요 — 수정 사항을 알려주세요
   3) 품질 검증 — Judge Panel(3 agent)이 채점 후 피드백 제공
   4) 합의 검토 — 4 에이전트(architect, critic, planner, security)가 리뷰 후 합의할 때까지 자동 수정
   5) 재작성 — PRD를 처음부터 다시 생성
   ```
3. **선택별 동작**:
   - "승인" → 태스크 분해로 진행
   - "수정 필요" → 사용자 피드백을 반영하여 PRD 수정 후 다시 표시 (반복)
   - "품질 검증" → [PRD Quality Gate] 실행 후 결과와 함께 PRD Review 선택지로 복귀
   - "합의 검토" → [Consensus Loop] 실행
   - "재작성" → PRD Generation부터 재실행

4. **수정 시 PRD 재저장**:
   ```bash
   $XMB save plan --content "{수정된 PRD 내용}"
   ```

5. **PRD 확정 기록**:
   ```
   ✅ PRD reviewed and approved by user.
   Proceeding to task decomposition.
   ```

> 중요: PRD Review 루프는 사용자가 "승인"할 때까지 반복된다. 자동 스킵 불가.
> 루프 제한: PRD Review 전체 루프(수정+재작성+품질 검증+합의 검토 포함)는 최대 5회 반복.
> 5회 도달 시: 현재 PRD를 표시하고 "승인" 또는 "프로젝트 중단" 2가지 선택지만 제공.

#### PRD Quality Gate (on-demand)

사용자가 "품질 검증"을 선택할 때만 실행된다. 자동 실행되지 않는다.

1. **Judge Panel 소환** (3 에이전트):
   - Rubric: plan-quality (completeness 0.30, actionability 0.30, scope-fit 0.20, risk-coverage 0.20)
   - 각 judge가 PRD를 독립 채점 (x-eval Reusable Judge Prompt 사용)

2. **결과 표시** (자동 판정/재생성 없음 — 사용자에게 정보만 제공):
   ```
   📋 PRD Quality: {score}/10 (plan-quality rubric)
   | Criterion      | Score | Feedback          |
   |----------------|-------|-------------------|
   | completeness   | 8     | ...               |
   | actionability  | 7     | ...               |
   | scope-fit      | 8     | ...               |
   | risk-coverage  | 6     | ...               |
   ```

3. **점수별 가이드 메시지** (권고일 뿐, 자동 동작 없음):
   - Score >= 7.0 → `"💡 품질 양호 — 승인을 고려하세요."`
   - Score 5.0–6.9 → `"💡 개선 여지 있음 — 위 피드백을 참고하여 수정을 고려하세요."`
   - Score < 5.0 → `"💡 품질 부족 — 재작성을 고려하세요."`

4. **PRD 점수를 프로젝트 메타데이터에 기록**:
   ```bash
   $XMB save plan --content "PRD Score: {score}/10"
   ```

5. **PRD Review 선택지로 복귀** — Judge 결과는 참고 자료로 제공되며, 최종 결정은 사용자가 한다.

> 호출 제한: 동일 PRD Review 세션에서 품질 검증은 최대 2회 실행 가능. "재작성" 선택 시 리셋.
> 2회 후 "품질 검증" 선택 시: `"⚠ 품질 검증 한도 도달. '승인', '수정 필요', 또는 '합의 검토'를 선택하세요."`

#### Consensus Loop (합의 검토)

사용자가 "합의 검토"를 선택하면, 4 에이전트가 PRD를 다각도로 리뷰하고 합의할 때까지 자동 수정한다.

**Round 1: broadcast (4 agents)**
```
Agent 1 (architect): "PRD의 구조적 완성도를 평가하라:
- 모듈 경계가 명확한가
- 인터페이스/의존성이 정의되어 있는가
- 아키텍처 결정이 누락되지 않았는가
결론: AGREE 또는 OBJECT + 구체적 피드백. 200단어 이내."

Agent 2 (critic): "PRD의 약점을 찾아라:
- 빠진 요구사항이나 시나리오가 있는가
- 모순되는 항목이 있는가
- 리스크가 과소평가되지 않았는가
결론: AGREE 또는 OBJECT + 구체적 피드백. 200단어 이내."

Agent 3 (planner): "PRD의 실행 가능성을 평가하라:
- 태스크로 분해하기 쉬운 구조인가
- 성공 기준이 측정 가능한가
- 일정/비용 현실성이 있는가
결론: AGREE 또는 OBJECT + 구체적 피드백. 200단어 이내."

Agent 4 (security): "PRD의 보안/리스크 측면을 평가하라:
- 보안 관련 요구사항이 누락되지 않았는가
- 리스크 mitigation이 구체적이고 실행 가능한가
- 민감 데이터 처리 방식이 명시되어 있는가
결론: AGREE 또는 OBJECT + 구체적 피드백. 200단어 이내."
```

**합의 판정:**
- **전원 AGREE** → 합의 완료, 사용자에게 결과 표시 후 PRD Review 선택지로 복귀
- **OBJECT 1개+** → 리더가 OBJECT 피드백을 종합하여 PRD 수정 → 다시 broadcast (max 3 rounds)
- **3 rounds 후 미합의** → 핵심 쟁점을 정리하여 사용자에게 표시, 사용자 판단 요청

> 재진입 제한: 동일 PRD Review 세션에서 Consensus Loop는 최대 2회 실행 가능.
> 2회 후 "합의 검토" 선택 시: "⚠ 합의 검토 한도 도달. '승인' 또는 '수정 필요'를 선택하세요."

**합의 결과 출력:**
```
🏛️ [consensus] PRD Review — Round {n}/{max}

| Agent | Role | Verdict | Key Feedback |
|-------|------|---------|-------------|
| 1 | architect | ✅ AGREE | 구조 적절 |
| 2 | critic | ❌ OBJECT | [R3] 테스트 전략 누락 |
| 3 | planner | ✅ AGREE | 분해 가능 |

→ critic 피드백 반영하여 PRD 수정 중...
```

합의 완료 후 PRD Review 선택지로 복귀 — 사용자가 최종 "승인"해야 진행.

---

Create tasks informed by research artifacts:

1. Run: `$XMB plan "goal"`
2. Parse JSON output — it now includes `context_summary`, `requirements_summary`, `roadmap_summary`
3. Decompose into 5-10 tasks based on REQUIREMENTS.md:
   - Each task references requirement IDs in its name (e.g., "Implement JWT auth [R1]")
   - Concrete, actionable names (start with verb)
   - Size: small (1-2h), medium (half-day), large (full day+)
   - Dependencies: what must complete first
4. Register tasks with acceptance contracts:
   ```bash
   $XMB tasks add "Implement JWT auth [R1]" --size medium
   $XMB tasks add "Create CRUD endpoints [R2]" --deps t1 --size medium
   ```
   After registering all tasks, derive **done criteria** for each task from the PRD's Section 8 (Acceptance Criteria) and Section 5 (Requirements Traceability):
   ```bash
   $XMB tasks done-criteria
   ```
   This generates `done_criteria` for each task — a checklist of verifiable conditions that define "done."
   If auto-generation is insufficient, manually set criteria:
   ```bash
   $XMB tasks update t1 --done-criteria "JWT 발급/검증 동작, refresh token rotation 구현, 단위 테스트 3개 이상"
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
7. **Plan Review** — 사용자에게 태스크 목록 + DAG + forecast를 표시하고 AskUserQuestion:
   ```
   계획을 검토해주세요:
   1) 승인 — Execute로 진행
   2) 수정 필요 — 태스크 추가/삭제/변경
   3) 합의 검토 — 4 에이전트가 전체 계획(PRD+태스크+DAG)을 리뷰
   4) 재계획 — plan부터 다시
   ```
   - "승인" → gate pass
   - "수정 필요" → 사용자 피드백 반영 후 plan-check 재실행
   - "합의 검토" → [Consensus Loop]를 전체 계획 대상으로 실행 (PRD + 태스크 + DAG를 평가)
   - "재계획" → PRD Review부터 재시작
8. Advance: `$XMB gate pass` → `$XMB phase next`

### Step 4: Execute (Execute Phase)

1. `$XMB run --json`
2. Parse JSON → spawn Agent per task:
   - `agent_type: "deep-executor"` → `subagent_type: "oh-my-claudecode:deep-executor"`, `model: "opus"`
   - otherwise → `subagent_type: "oh-my-claudecode:executor"`, `model: "sonnet"`
   - `prompt`: use `task.prompt` value + **inject `done_criteria`** as acceptance contract:
     ```
     ## Acceptance Contract
     이 태스크는 아래 조건을 모두 충족해야 완료이다:
     {task.done_criteria 항목을 체크리스트로 나열}
     완료 시 각 조건의 충족 여부를 보고하라.
     ```
   - `run_in_background: true` (parallel)
3. On completion: `$XMB tasks update <id> --status completed|failed`
4. Check `$XMB run-status`, advance to next step or phase

#### Strategy-Tagged Execution

태스크에 `--strategy` 플래그가 있으면 x-op 전략으로 실행한다:

```
$XMB tasks add "Review auth module [R3]" --strategy review --rubric code-quality
$XMB tasks add "Design payment flow [R1]" --strategy refine --rubric plan-quality
$XMB tasks add "Implement CRUD endpoints [R2]"   # 일반 태스크 (strategy 없음)
$XMB tasks add "결제 시스템 구현 [R4]" --team engineering  # 팀에 할당
```

실행 시 리더가 태스크 유형을 판별:

```
For each task in current step:
  if task.team:
    → /x-agent team assign {task.team} "{task.name}"
    → TL이 내부에서 팀원 관리, 완료 시 보고
    → $XMB tasks update {id} --status completed
  elif task.strategy:
    → /x-op {task.strategy} "{task.name}" --verify --rubric {task.rubric}
    → score를 수집하여 $XMB tasks update {id} --score {score}
  else:
    → 일반 에이전트 delegate로 실행
```

#### Quality Dashboard

`status` 출력에 per-task score 표시:

```
📊 Tasks (scored):
  [t1] Design payment flow [R1]     ✅ completed  Score: 8.2/10
  [t2] Review auth module [R3]      ✅ completed  Score: 7.5/10
  [t3] Implement CRUD endpoints [R2] ✅ completed
  [t4] Add error handling [R4]      ⚠ completed  Score: 6.1/10 ⚠

Project Quality: 7.3/10 avg (1 below threshold)
```

#### 전략 자동 추천

태스크에 strategy가 없을 때 리더가 태스크 이름에서 추론:

| 태스크 키워드 | 추천 전략 |
|-------------|---------|
| review, audit, check | review |
| design, plan, architect | refine |
| compare, evaluate, vs | debate |
| investigate, analyze, debug | investigate |
| implement, build, create | (일반 실행) |

추천만 하고 자동 적용은 하지 않음 — 사용자가 `--strategy`로 명시해야 함.

### Step 5: Verify (Verify Phase)

1. Run quality checks: `$XMB quality`
2. Check requirement coverage: `$XMB verify-coverage`
3. Check acceptance contracts: `$XMB verify-contracts`
   - For each task with `done_criteria`, verify that the criteria are met
   - Output: `✅ t1: 3/3 criteria met` or `❌ t2: 1/3 criteria met — [missing: "단위 테스트 3개 이상"]`
   - Unmet criteria → report to user for resolution before closing
4. If all pass: `$XMB phase next`

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
| tech-leakage | Tasks don't name specific technologies unless declared in CONTEXT.md or PRD Constraints |
| overall | Combined assessment |

Run: `$XMB plan-check`
Fix errors → re-run until all pass → `$XMB gate pass`

### tech-leakage 검사 규칙

태스크 이름/설명에 특정 기술명(프레임워크, 라이브러리, 서비스)이 포함되어 있으면 **CONTEXT.md** 또는 **PRD Section 3 (Constraints)**에 해당 기술이 명시되어 있는지 확인한다.

- 명시된 기술 → pass (이미 결정된 제약)
- 명시되지 않은 기술 → `warn`: `"t3: 'Redis' is not declared in CONTEXT.md or PRD Constraints — consider using intent ('캐싱 구현') instead of implementation ('Redis 캐시 추가')"`

이 검사는 **warn** 레벨이며 plan-check 전체를 fail시키지 않는다. PRD에서 결정된 기술 선택은 태스크에 사용해도 된다는 점에서, 사용자의 의도적인 구현 지정을 차단하지 않는다.

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

### Auto-Handoff on Phase Transition

`phase next` 실행 시 **자동으로 `handoff`를 트리거**하여 현재 phase의 상태를 보존한다. 이는 오케스트레이터(리더) 레벨의 컨텍스트 누적을 방지하고, 다음 phase가 구조화된 맥락에서 시작할 수 있게 한다.

`phase next` 내부 동작 확장:
```
1. gate 검증 (기존)
2. $XMB handoff          ← 자동 실행 (현재 phase 상태 저장)
3. phase 상태 전환 (기존)
4. 리더에게 handoff 요약 출력:
   "📋 Phase handoff saved. Key decisions: {N}, Pending risks: {M}"
```

Handoff 문서는 다음 phase에서 `$XMB handoff --restore`로 복원하거나, 새 에이전트에 컨텍스트로 주입할 수 있다. 이를 통해 이전 phase의 탐색 과정, 디버깅 로그, 폐기된 대안 등 "과정의 잡음"은 자연스럽게 버려지고 **결정과 산출물만** 다음 phase로 전달된다.

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

x-build는 `.xm/config.json`의 공유 설정을 참조한다:

| 설정 | 키 | 기본값 | 영향 |
|------|-----|--------|------|
| 모드 | `mode` | `developer` | 출력 스타일 (기술 용어 vs 쉬운 말) |
| 에이전트 수 | `agent_max_count` | `4` | research 에이전트 수, run 병렬 실행 수 |
| TL 모델 | `team_default_leader_model` | `opus` | `--team` 태스크의 Team Leader 모델 |
| 팀 멤버 수 | `team_max_members` | `5` | 팀당 최대 멤버 수 |

설정 변경:
```bash
$XMB config set agent_max_count 10   # 최대 병렬
$XMB config set agent_max_count 2    # 토큰 절약
$XMB config show                     # 현재 설정 확인
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
| "에이전트 설정", "agent level" | `config show` / `config set agent_max_count` |
