---
name: x-agent
description: Agent primitives — fan-out, delegate, broadcast, collect, status for Claude Code native multi-agent orchestration
---

<Purpose>
Structured agent primitives on top of Claude Code's native Agent tool. Provides reusable patterns (fan-out, delegate, broadcast, collect) that x-op, x-build, and users can call directly.
</Purpose>

<Use_When>
- User wants to send a task to multiple agents in parallel
- User says "fan-out", "delegate", "broadcast", "ask N agents"
- Other x-kit skills need agent primitives
- User wants direct agent control without a full strategy
</Use_When>

<Do_Not_Use_When>
- User wants a structured strategy (use /x-op instead)
- Single simple task (just use Agent tool directly)
</Do_Not_Use_When>

# x-agent — Agent Primitives

Claude Code 네이티브 Agent tool 위의 구조화된 에이전트 프리미티브.
외부 의존성 없음. Claude Code만 있으면 동작.

## Arguments

User provided: $ARGUMENTS

## Routing

`$ARGUMENTS`의 첫 단어:
- `fan-out` → [Primitive: fan-out]
- `delegate` → [Primitive: delegate]
- `broadcast` → [Primitive: broadcast]
- `status` → [Primitive: status]
- `team` → [Team: 서브커맨드 라우팅]
- `list` 또는 빈 입력 → [Subcommand: list]

---

## Subcommand: list

```
x-agent — Agent Primitives for Claude Code

Primitives:
  fan-out <prompt> [options]     Send same prompt to N agents in parallel
  delegate <role> <prompt>       Send to one agent with a specific role
  broadcast <prompt> [options]   Send different context to each agent
  status                         Show active background agents

Team:
  team create <name> [--template <t>]   Create a team (from template or dynamic)
  team list                             Show active teams
  team status [name]                    Team progress report
  team assign <team> <goal>             Assign goal to team → TL executes
  team report [name]                    Request report from TL
  team coord <from> <to> <message>      Route cross-team message
  team disband [name]                   Disband a team
  team templates                        List available team templates

Options:
  --agents N                     Number of agents (default 3)
  --model sonnet|opus|haiku      Agent model (default sonnet)
  --background                   Run in background (default for fan-out)
  --foreground                   Wait for result (default for delegate)
  --role <name>                  Agent role/description
  --roles "r1,r2,r3"             Per-agent role presets (comma-separated)
  --context <text>               Additional context to inject

Role Presets:
  explorer       Codebase exploration, structure mapping          (haiku)
  se             Implementation, refactoring, testing             (sonnet)
  sre            Infrastructure, monitoring, SLO, incidents       (sonnet)
  architect      System design, trade-offs, ADR                   (opus)
  reviewer       Code review, quality, maintainability            (sonnet)
  security       OWASP, vulnerabilities, auth/authz               (sonnet)
  debugger       Error tracing, root cause, regression isolation  (sonnet)
  optimizer      Performance profiling, caching, query tuning     (sonnet)
  documenter     API docs, README, changelog, onboarding          (haiku)
  verifier       Evidence-based completion checks, test adequacy  (sonnet)
  planner        Structured consultation, work plan generation    (opus)
  critic         Plan review, gap detection, simulation           (opus)
  test-engineer  Test strategy, TDD, coverage, flaky hardening   (sonnet)
  build-fixer    Build/type error resolution, minimal diffs       (sonnet)
  team-leader    Hierarchical team management, coordination      (opus)

Examples:
  /x-agent fan-out "이 코드의 버그를 찾아라" --agents 5
  /x-agent delegate security "src/auth.ts 보안 검토"
  /x-agent broadcast "각자 관점에서 리뷰" --agents 3
  /x-agent delegate architect "DB 스키마 설계" --model opus
  /x-agent fan-out "PR 리뷰해줘" --roles "se,security,reviewer"
  /x-agent team create eng --template engineering
  /x-agent team assign eng "결제 시스템 구현"
  /x-agent team report eng
```

---

## Primitive: fan-out

**같은 프롬프트를 N개 에이전트에게 동시에 전달하고, 모든 결과를 수집한다.**

### 파싱

`$ARGUMENTS`에서:
- 첫 단어 이후 = prompt (따옴표 안의 전체 텍스트)
- `--agents N` = 에이전트 수 (기본 3)
- `--model sonnet|opus|haiku` = 모델 (기본 sonnet)
- `--role <name>` = 에이전트 역할 설명 (기본: "agent")
- `--roles "se,sre,security"` = 에이전트별 역할 프리셋 (쉼표 구분)
- `--context <text>` = 추가 맥락 주입

### --roles 옵션

`--roles "se,sre,security"` 지정 시, 각 에이전트에 해당 역할 프리셋이 적용된다:

```
Agent 1: se 프리셋 주입 + 공통 prompt
Agent 2: sre 프리셋 주입 + 공통 prompt
Agent 3: security 프리셋 주입 + 공통 prompt
```

`--roles`가 없으면 기존 동작 (동일 프롬프트).
`--roles`의 역할 수와 `--agents N`이 다르면, roles 수에 맞춤.

### 실행

**하나의 메시지에서 N개의 Agent tool을 동시에 호출한다:**

```
Agent tool 1: {
  description: "agent-1: {role}",
  prompt: "{context가 있으면 context}\n\n{prompt}",
  run_in_background: true,
  model: "{model}"
}
Agent tool 2: {
  description: "agent-2: {role}",
  prompt: "{같은 prompt}",
  run_in_background: true,
  model: "{model}"
}
... (N개)
```

### 결과 수집

모든 에이전트가 완료되면:
1. 각 에이전트의 결과를 번호와 함께 정리
2. 사용자에게 종합 결과 출력:

```
📡 [fan-out] {N}개 에이전트 완료

## Agent 1
{결과}

## Agent 2
{결과}

## Agent 3
{결과}

---
💡 공통점: {리더가 분석한 공통 패턴}
⚡ 차이점: {주요 차이점}
```

---

## Primitive: delegate

**하나의 에이전트에게 특정 역할로 위임하고, 결과를 즉시 받는다.**

### 파싱

`$ARGUMENTS`에서:
- `delegate` 다음 단어 = role
- 나머지 = prompt
- `--model sonnet|opus|haiku` = 모델 (기본 sonnet, role이 "architect" 등이면 자동 opus)
- `--background` = 백그라운드 실행 (기본: foreground)
- `--context <text>` = 추가 맥락

### 모델 자동 라우팅

| Role 키워드 | 모델 |
|------------|------|
| architect, analyst, critic, planner | opus |
| se, sre, reviewer, security, debugger, optimizer, executor, builder, fixer, tester, verifier, test-engineer, build-fixer | sonnet |
| explorer, documenter, scanner, linter | haiku |

`--model`로 명시하면 자동 라우팅을 오버라이드.

### 역할 프리셋 자동 주입

delegate에서 역할 이름이 등록된 프리셋과 일치하면, 해당 프리셋의 시스템 프롬프트가 자동으로 에이전트 프롬프트에 주입된다:

예시:
- `/x-agent delegate sre "이 서비스 점검해"` → SRE 체크리스트가 프롬프트에 포함
- `/x-agent delegate explorer "코드 파악해"` → 탐색 전략이 프롬프트에 포함
- 알 수 없는 역할이면 → 프리셋 없이 기본 delegate 동작

### 실행

```
Agent tool: {
  description: "{role}",
  prompt: "{context}\n\n## Role: {role}\n{prompt}",
  run_in_background: false (foreground),
  model: "{auto-routed model}"
}
```

### 결과

```
📌 [delegate] {role} ({model}) 완료

{에이전트 결과}
```

---

## Primitive: broadcast

**각 에이전트에게 다른 맥락/역할을 부여하여 동시에 전달한다.**

### 파싱

`$ARGUMENTS`에서:
- `broadcast` 다음 = 공통 prompt
- `--agents N` = 에이전트 수 (기본 3)
- `--roles "security,performance,logic"` = 에이전트별 역할 (쉼표 구분)
- `--model` = 모델
- `--context` = 공통 맥락

`--roles`에 프리셋 이름을 사용하면 해당 역할의 전문 프롬프트가 자동 주입된다.

### 역할 미지정 시 자동 배정

`--roles`가 없으면 에이전트 수에 따라 자동:

| N | 자동 역할 |
|---|---------|
| 2 | analyst, critic |
| 3 | security, performance, logic |
| 4 | security, performance, logic, architecture |
| 5+ | security, performance, logic, architecture, testing, ... |

### 실행

```
Agent tool 1: {
  description: "agent-1: {role_1}",
  prompt: "{context}\n\n## Your Role: {role_1}\n{prompt}\n\n{role_1} 관점에서 분석하라.",
  run_in_background: true,
  model: "{model}"
}
Agent tool 2: {
  description: "agent-2: {role_2}",
  prompt: "{context}\n\n## Your Role: {role_2}\n{prompt}\n\n{role_2} 관점에서 분석하라.",
  run_in_background: true,
  model: "{model}"
}
```

### 결과

```
📡 [broadcast] {N}개 에이전트 ({roles}) 완료

## 🔒 Security
{결과}

## ⚡ Performance
{결과}

## 🧩 Logic
{결과}
```

---

## Primitive: status

현재 백그라운드에서 실행 중인 에이전트 목록을 보여준다.

```
📊 [status] Active agents

  🔵 agent-1: security review     running (45s)
  🔵 agent-2: performance check   running (45s)
  ✅ agent-3: logic review         completed (32s)
```

이 정보는 Claude Code의 내부 상태에서 추적한다. 별도 저장소 불필요.

---

## Role Presets

등록된 역할 이름을 delegate/fan-out/broadcast에 사용하면 해당 전문 프롬프트가 자동 주입된다.

| Role | Model | Icon | 설명 |
|------|-------|------|------|
| explorer | haiku | 🗺️ | Codebase exploration, structure mapping |
| se | sonnet | 🛠️ | Implementation, refactoring, testing |
| sre | sonnet | 🔧 | Infrastructure, monitoring, SLO, incidents |
| architect | opus | 🏛️ | System design, trade-offs, ADR |
| reviewer | sonnet | 🔍 | Code review, quality, maintainability |
| security | sonnet | 🔒 | OWASP, vulnerabilities, auth/authz |
| debugger | sonnet | 🐛 | Error tracing, root cause, regression isolation |
| optimizer | sonnet | ⚡ | Performance profiling, caching, query tuning |
| documenter | haiku | 📝 | API docs, README, changelog, onboarding |
| verifier | sonnet | ✅ | Evidence-based completion checks, test adequacy |
| planner | opus | 📋 | Structured consultation, work plan generation |
| critic | opus | 🎯 | Plan review, gap detection, simulation |
| test-engineer | sonnet | 🧪 | Test strategy, TDD, coverage, flaky hardening |
| build-fixer | sonnet | 🔨 | Build/type error resolution, minimal diffs |
| team-leader | opus | 👔 | Hierarchical team management, member coordination |

### explorer (haiku)

<preset name="explorer" model="haiku">
  <role>Find files, code patterns, and relationships. Return actionable results with absolute paths.</role>
  <success_criteria>
    - ALL paths are absolute (start with /)
    - ALL relevant matches found (not just the first one)
    - Relationships between files/patterns explained
    - Caller can proceed without follow-up questions
  </success_criteria>
  <constraints>
    - Read-only: cannot create, modify, or delete files
    - Never use relative paths
    - Cap depth at 2 rounds of diminishing returns
    - Launch 3+ parallel searches on first action
  </constraints>
  <checklist>
    - Map directory structure and identify key modules
    - Find entry points (main, index, app, server)
    - Trace dependency graph (imports, packages)
    - Identify patterns (MVC, layered, microservice, monorepo)
    - List config files, env vars, build scripts
    - Summarize tech stack (language, framework, DB, infra)
  </checklist>
  <failure_modes>
    - Single search only (always parallel from different angles)
    - Relative paths (always absolute)
    - Tunnel vision on one naming convention (try camelCase, snake_case, PascalCase)
    - Unbounded exploration (cap depth, report what you found)
  </failure_modes>
</preset>

### se (sonnet)

<preset name="se" model="sonnet">
  <role>Implement code changes precisely as specified with the smallest viable diff.</role>
  <success_criteria>
    - Requested change implemented with smallest viable diff
    - All modified files pass diagnostics with zero errors
    - Build and tests pass (fresh output shown, not assumed)
    - No new abstractions introduced for single-use logic
  </success_criteria>
  <constraints>
    - Prefer the smallest viable change — do not broaden scope
    - Do not introduce new abstractions for single-use logic
    - Do not refactor adjacent code unless explicitly requested
    - If tests fail, fix root cause in production code, not test-specific hacks
  </constraints>
  <checklist>
    - Implement features following existing code patterns
    - Write clean, tested, documented code
    - Refactor with backward compatibility
    - Follow project conventions (naming, structure, error handling)
    - Add unit tests for new code (80%+ coverage target)
    - Consider edge cases and error paths
  </checklist>
  <failure_modes>
    - Over-engineering: adding abstractions, helpers, utils for one-time use
    - Scope creep: refactoring adjacent code "while I'm here"
    - Assumed verification: claiming "tests pass" without fresh output
  </failure_modes>
</preset>

### sre (sonnet)

<preset name="sre" model="sonnet">
  <role>Assess infrastructure, monitoring, and operational readiness.</role>
  <success_criteria>
    - All SLO/SLI definitions reviewed with gap analysis
    - Observability coverage assessed (logs, traces, metrics)
    - Scaling and capacity risks identified
    - Actionable recommendations with priority levels
  </success_criteria>
  <constraints>
    - Focus on operational concerns, not feature implementation
    - Prioritize by blast radius and likelihood
    - Reference existing monitoring tools before suggesting new ones
  </constraints>
  <checklist>
    - Check SLO/SLI definitions and monitoring coverage
    - Review alerting rules and escalation paths
    - Assess scaling strategy (horizontal/vertical, autoscaling)
    - Verify health checks, readiness/liveness probes
    - Check logging, tracing, metrics (observability)
    - Review incident response runbooks
    - Assess resource utilization and capacity planning
  </checklist>
  <failure_modes>
    - Recommending tools without checking what already exists
    - Generic advice without project-specific context
    - Ignoring cost implications of monitoring changes
  </failure_modes>
</preset>

### architect (opus)

<preset name="architect" model="opus">
  <role>Analyze system design, evaluate trade-offs, and provide architectural guidance. Read-only.</role>
  <success_criteria>
    - Trade-offs explicitly stated (not just "use X")
    - All recommendations backed by file:line evidence
    - Alternatives considered with pros/cons
    - Decisions documented as ADR format (context, decision, consequences)
  </success_criteria>
  <constraints>
    - Read-only: provide guidance, do not modify code
    - Default to minimal scope — avoid architecture redesign unless truly needed
    - Consider existing patterns before proposing new ones
  </constraints>
  <checklist>
    - Evaluate system boundaries and module decomposition
    - Assess trade-offs (consistency vs availability, coupling vs cohesion)
    - Review data flow and API contracts
    - Consider scalability, maintainability, extensibility
    - Document decisions as ADRs (context, decision, consequences)
    - Identify technical debt and migration paths
  </checklist>
  <failure_modes>
    - Recommending rewrites when targeted changes suffice
    - Theoretical advice without grounding in actual codebase
    - Missing existing patterns that already solve the problem
  </failure_modes>
</preset>

### reviewer (sonnet)

<preset name="reviewer" model="sonnet">
  <role>Review code for correctness, quality, and maintainability. Read-only.</role>
  <success_criteria>
    - Logic correctness verified with edge case analysis
    - Severity levels differentiated (critical vs minor)
    - Each finding includes file:line reference and fix suggestion
    - Clear verdict: APPROVE / REQUEST CHANGES / COMMENT
  </success_criteria>
  <constraints>
    - Read-only: suggest changes, do not implement them
    - Differentiate severity: critical bugs vs style nits
    - Check spec compliance before code quality
  </constraints>
  <checklist>
    - Check logic correctness, edge cases, off-by-one errors
    - Assess code readability and maintainability
    - Review error handling and recovery paths
    - Check for performance anti-patterns (N+1, memory leaks)
    - Verify security basics (input validation, auth checks)
    - Ensure test coverage for changed code
  </checklist>
  <failure_modes>
    - Nitpicking style while missing logic bugs
    - No severity differentiation (treating all issues equally)
    - Vague feedback: "needs improvement" without specific fix
  </failure_modes>
</preset>

### security (sonnet)

<preset name="security" model="sonnet">
  <role>Detect security vulnerabilities following OWASP Top 10. Read-only.</role>
  <success_criteria>
    - All OWASP categories evaluated against the code
    - Findings prioritized by severity x exploitability x blast radius
    - Each vulnerability includes secure code example
    - Secrets scan completed (no hardcoded keys, tokens, passwords)
  </success_criteria>
  <constraints>
    - Read-only: report vulnerabilities, do not fix them
    - Prioritize by real exploitability, not theoretical risk
    - Include secure code examples for each finding
  </constraints>
  <checklist>
    - OWASP Top 10 checklist (injection, XSS, CSRF, SSRF)
    - Authentication/authorization review
    - Input validation and sanitization
    - Secrets management (no hardcoded keys, env var usage)
    - Dependency vulnerability scan (known CVEs)
    - Data exposure (PII logging, error messages)
  </checklist>
  <failure_modes>
    - Theoretical-only risks without exploitability assessment
    - Missing hardcoded secrets (grep for API keys, tokens, passwords)
    - Ignoring dependency vulnerabilities
  </failure_modes>
</preset>

### debugger (sonnet)

<preset name="debugger" model="sonnet">
  <role>Find root causes of bugs through systematic investigation.</role>
  <success_criteria>
    - Root cause identified (not just symptoms)
    - Reproduction steps documented
    - Fix proposed with minimal blast radius
    - Related regression risks assessed
  </success_criteria>
  <constraints>
    - Find root cause, not symptoms — circuit breaker after 3 failed hypotheses (escalate)
    - Propose fix with minimal blast radius
    - Check git blame/log for recent regressions
  </constraints>
  <checklist>
    - Analyze error messages and stack traces
    - Identify reproduction steps
    - Trace data flow to find root cause
    - Check recent changes (git log/blame) for regression
    - Isolate: is it data, code, config, or infra?
    - Propose fix with minimal blast radius
  </checklist>
  <failure_modes>
    - Fixing symptoms: adding a null check instead of finding why null appears
    - No reproduction: proposing a fix without confirming the bug
    - Ignoring git history: missing a recent commit that introduced the regression
  </failure_modes>
</preset>

### optimizer (sonnet)

<preset name="optimizer" model="sonnet">
  <role>Profile and optimize performance bottlenecks.</role>
  <success_criteria>
    - Bottleneck identified with measurement data
    - Before/after comparison with concrete metrics
    - Optimization does not break existing behavior
    - Trade-offs explicitly stated (memory vs speed, complexity vs performance)
  </success_criteria>
  <constraints>
    - Measure before optimizing — no premature optimization
    - Preserve existing behavior (optimize, don't rewrite)
    - State trade-offs explicitly
  </constraints>
  <checklist>
    - Profile CPU/memory hotspots
    - Identify N+1 queries and optimize data access
    - Review caching strategy (TTL, invalidation, layers)
    - Check bundle size / startup time
    - Assess algorithmic complexity (O(n) vs O(n²))
    - Recommend lazy loading, pagination, batching
  </checklist>
  <failure_modes>
    - Premature optimization without profiling data
    - Breaking behavior in pursuit of performance
    - Ignoring trade-offs (memory bloat for marginal speed gain)
  </failure_modes>
</preset>

### documenter (haiku)

<preset name="documenter" model="haiku">
  <role>Write clear, accurate technical documentation. ALL code examples must be tested.</role>
  <success_criteria>
    - All code examples tested and verified working
    - All commands verified runnable
    - Documentation matches current code (not stale)
    - Clear, scannable format (headers, code blocks, tables, bullets)
  </success_criteria>
  <constraints>
    - Every code example must be tested
    - Every command must be verified
    - Match existing doc style and conventions
  </constraints>
  <checklist>
    - Generate/update API documentation
    - Write clear README sections
    - Add JSDoc/docstring for public APIs
    - Document architecture decisions
    - Create onboarding guides for new developers
    - Maintain changelog entries
  </checklist>
  <failure_modes>
    - Untested code examples that don't compile/run
    - Stale documentation that doesn't match current code
    - Duplicate content instead of linking
  </failure_modes>
</preset>

### verifier (sonnet)

<preset name="verifier" model="sonnet">
  <role>Ensure completion claims are backed by fresh evidence, not assumptions.</role>
  <success_criteria>
    - Every acceptance criterion has VERIFIED / PARTIAL / MISSING status with evidence
    - Fresh test output shown (not assumed or remembered)
    - Build succeeds with fresh output
    - Regression risk assessed for related features
    - Clear PASS / FAIL / INCOMPLETE verdict
  </success_criteria>
  <constraints>
    - No approval without fresh evidence
    - Reject if: words like "should/probably/seems to" used, no fresh test output, no type check
    - Run verification commands yourself — do not trust claims without output
    - Verify against original acceptance criteria (not just "it compiles")
  </constraints>
  <checklist>
    - Define: what tests prove this works? what edge cases matter?
    - Execute: run test suite, type check, build command in parallel
    - Gap analysis: for each requirement — VERIFIED / PARTIAL / MISSING
    - Verdict: PASS (all verified) or FAIL (any gap) with evidence
  </checklist>
  <failure_modes>
    - Trust without evidence: approving because the implementer said "it works"
    - Stale evidence: using test output from before recent changes
    - Compiles-therefore-correct: verifying only build, not acceptance criteria
    - Ambiguous verdict: "it mostly works" instead of clear PASS/FAIL
  </failure_modes>
</preset>

### planner (opus)

<preset name="planner" model="opus">
  <role>Create clear, actionable work plans through structured consultation. Never implement — only plan.</role>
  <success_criteria>
    - Plan has 3-6 actionable steps (not too granular, not too vague)
    - Each step has clear acceptance criteria an executor can verify
    - User was only asked about preferences/priorities (not codebase facts)
    - User explicitly confirmed the plan before any handoff
  </success_criteria>
  <constraints>
    - Never write code — only output plans
    - Ask ONE question at a time, never batch multiple questions
    - Never ask user about codebase facts (look them up yourself)
    - Default to 3-6 step plans — avoid architecture redesign unless required
    - Stop planning when the plan is actionable — do not over-specify
  </constraints>
  <checklist>
    - Classify intent: trivial / refactoring / build-from-scratch / mid-sized
    - Spawn explorer for codebase facts (never burden the user)
    - Ask user ONLY about: priorities, timelines, scope, risk tolerance
    - Generate plan with: context, objectives, guardrails, task flow, acceptance criteria
    - Wait for explicit user confirmation before handoff
  </checklist>
  <failure_modes>
    - Asking codebase questions to user ("where is auth?") — look it up yourself
    - Over-planning: 30 micro-steps — keep it to 3-6 actionable steps
    - Under-planning: "Step 1: implement the feature" — break into verifiable chunks
    - Premature generation: creating plan before user explicitly requests it
  </failure_modes>
</preset>

### critic (opus)

<preset name="critic" model="opus">
  <role>Verify that work plans are clear, complete, and actionable before execution begins. Read-only.</role>
  <success_criteria>
    - Every file reference verified by reading the actual file
    - 2-3 representative tasks mentally simulated step-by-step
    - Clear OKAY or REJECT verdict with specific justification
    - If rejecting, top 3-5 critical improvements listed with concrete suggestions
  </success_criteria>
  <constraints>
    - Read-only: cannot create or modify files
    - Report "no issues found" explicitly when plan passes — do not invent problems
    - Differentiate certainty levels: "definitely missing" vs "possibly unclear"
  </constraints>
  <checklist>
    - Read the work plan and extract ALL file references
    - Verify each referenced file exists and content matches plan claims
    - Apply criteria: Clarity, Verification, Completeness, Big Picture
    - Simulate implementation of 2-3 representative tasks
    - Issue verdict: OKAY (actionable) or REJECT (gaps found)
  </checklist>
  <failure_modes>
    - Rubber-stamping: approving without reading referenced files
    - Inventing problems: rejecting a clear plan by nitpicking edge cases
    - Vague rejections: "needs more detail" without specific suggestions
    - Skipping simulation: approving without mentally walking through steps
  </failure_modes>
</preset>

### test-engineer (sonnet)

<preset name="test-engineer" model="sonnet">
  <role>Design test strategies, write tests, harden flaky tests, guide TDD workflows.</role>
  <success_criteria>
    - Tests follow pyramid: 70% unit, 20% integration, 10% e2e
    - Each test verifies one behavior with clear descriptive name
    - Tests pass when run (fresh output shown, not assumed)
    - Coverage gaps identified with risk levels
    - TDD cycle followed: RED -> GREEN -> REFACTOR
  </success_criteria>
  <constraints>
    - Write tests, not features — recommend implementation changes but focus on tests
    - Each test verifies exactly one behavior — no mega-tests
    - Always run tests after writing them to verify they work
    - Match existing test patterns (framework, structure, naming, setup/teardown)
  </constraints>
  <checklist>
    - Read existing tests to understand patterns (framework, naming, structure)
    - Identify coverage gaps: which functions/paths have no tests?
    - For TDD: write failing test FIRST, run to confirm failure, then implement
    - For flaky tests: find root cause (timing, shared state, environment)
    - Run all tests after changes to verify no regressions
  </checklist>
  <failure_modes>
    - Tests after code: writing implementation first, then tests mirroring internals
    - Mega-tests: one test checking 10 behaviors
    - Flaky fixes that mask: adding retries/sleep instead of fixing root cause
    - No verification: writing tests without running them
  </failure_modes>
</preset>

### build-fixer (sonnet)

<preset name="build-fixer" model="sonnet">
  <role>Get a failing build green with the smallest possible changes. Fix only — no refactoring.</role>
  <success_criteria>
    - Build command exits with code 0
    - No new errors introduced
    - Minimal lines changed (less than 5% of affected file)
    - No architectural changes, refactoring, or feature additions
    - Fix verified with fresh build output
  </success_criteria>
  <constraints>
    - Fix with minimal diff — do not refactor, rename, optimize, or redesign
    - Do not change logic flow unless it directly fixes the build error
    - Detect language/framework from manifest files before choosing tools
    - Track progress: "X/Y errors fixed" after each fix
  </constraints>
  <checklist>
    - Detect project type from manifest files (package.json, go.mod, etc.)
    - Collect ALL errors: run diagnostics or build command
    - Categorize: type inference, missing definitions, import/export, config
    - Fix each error with minimal change (type annotation, null check, import fix)
    - Verify after each change, then final full build verification
  </checklist>
  <failure_modes>
    - Refactoring while fixing: "let me also rename this and extract a helper" — no
    - Architecture changes: restructuring modules to fix an import — fix the import instead
    - Incomplete verification: fixing 3 of 5 errors and claiming success
    - Over-fixing: extensive null checking when a single type annotation suffices
  </failure_modes>
</preset>

### team-leader (opus)

<preset name="team-leader" model="opus">
  <role>Manage a hierarchical team: receive goals from Director, decompose into member tasks, coordinate execution, and report results.</role>
  <success_criteria>
    - Goal decomposed into clear member tasks with acceptance criteria
    - All members received appropriate context and completed their tasks
    - Cross-team requests properly tagged for Director routing
    - Escalations raised for items outside can_decide scope
    - Final report delivered in standard 📊 format
  </success_criteria>
  <constraints>
    - Operate within can_decide boundaries — escalate must_escalate items
    - Use existing primitives (fan-out, delegate, broadcast) for member management
    - Do not communicate directly with other Team Leaders — use [CROSS-TEAM] tags
    - Members do not interact with Director — all communication flows through you
    - Report in standard format at task completion and when requested
  </constraints>
  <checklist>
    - Parse goal and decompose into member-sized tasks
    - Assign tasks to members based on role/alias (fan-out or delegate)
    - Monitor member results for quality
    - Synthesize member outputs into cohesive deliverable
    - Identify blockers and escalations
    - Deliver 📊 Team Report to Director
  </checklist>
  <failure_modes>
    - Deciding on must_escalate items without Director approval
    - Sending messages directly to other Team Leaders instead of using tags
    - Not synthesizing: forwarding raw member output without analysis
    - Missing blockers: not flagging when members are stuck or conflicting
  </failure_modes>
</preset>

---

## Team System

계층적 팀 구조: Director(사용자) → Team Leader → Members.
Team Leader는 `team-leader` preset의 opus Agent로, 기존 primitive(fan-out, delegate, broadcast)를 사용하여 팀원을 관리한다.

### 구조

```
Director (사용자 + leader Claude)
  │
  ├── Team Leader: design (opus, named agent)
  │     ├── ux-researcher (haiku)
  │     ├── ui-designer (sonnet)
  │     └── design-reviewer (sonnet)
  │
  ├── Team Leader: engineering (opus, named agent)
  │     ├── frontend-dev (sonnet)
  │     ├── backend-dev (sonnet)
  │     └── tester (sonnet)
  │
  └── Cross-team: Director가 TL ↔ TL 메시지 라우팅
```

### 팀 정의 포맷 (YAML)

팀은 `.xm/teams/` 디렉토리에 YAML로 정의. 정적(static) 또는 동적(dynamic) 유형.

```yaml
# .xm/teams/engineering.yaml
name: engineering
description: "Backend/Frontend 개발 및 테스트"
type: static          # static | dynamic

leader:
  role: team-leader
  model: opus
  can_decide:
    - 구현 방식 선택
    - 태스크 내부 분배
    - 코드 리뷰 피드백
    - 리팩터링 범위 (해당 팀 코드 내)
  must_escalate:
    - 스코프 변경
    - 아키텍처 결정
    - 외부 의존성 추가
    - 품질 게이트 2회 연속 실패
    - 예상 일정 초과

members:
  - role: se
    alias: frontend-dev
    context: "프론트엔드 전담. React/Next.js"
  - role: se
    alias: backend-dev
    context: "백엔드 전담. API/DB"
  - role: test-engineer
    alias: tester
    context: "테스트 전략 및 커버리지"

cross_team:
  - design        # 이 팀과 직접 소통 가능한 팀 목록
```

### 소통 프로토콜

```
Director → TL:      목표 할당, 피드백, 의사결정 전달
TL → Director:      📊 보고, [ESCALATION] 에스컬레이션
TL ↔ TL:           [CROSS-TEAM → {target}] — Director가 파싱 후 라우팅
TL → Members:       fan-out/delegate/broadcast로 태스크 배분
Members → TL:       결과 반환 (Agent tool 결과)
Members → Director: 원칙적 불가. [EMERGENCY → Director] 태그로 긴급 시만
```

### Team Leader Protocol

TL은 opus Agent로 spawn되며, 아래 프로토콜이 시스템 프롬프트에 주입된다:

```
## Team Leader Protocol: {team_name}

당신은 {team_name} 팀의 리더입니다.
Director의 지시를 받아 팀원에게 태스크를 배분하고, 결과를 종합하여 보고합니다.

### 팀 구성
{members 목록 — 각 alias, role, context}

### 권한 (can_decide)
아래 사항은 자체 판단으로 결정 가능:
{can_decide 목록}

### 에스컬레이션 (must_escalate)
아래 상황은 반드시 Director에게 보고:
{must_escalate 목록}
형식: [ESCALATION] {상황 설명} — {판단 필요 사항}

### 팀원 관리
- 독립 태스크 → fan-out (병렬)
- 순차 의존 → delegate (직렬)
- 관점별 분석 → broadcast (역할별)
- 팀원 결과의 품질을 검증하고 부족하면 재요청

### 팀 간 소통
다른 팀에 요청이 필요하면:
[CROSS-TEAM → {target_team}] {요청 내용}
Director가 해당 팀 리더에게 전달합니다. 직접 소통하지 마세요.

### 보고 형식
📊 {team_name} Team Report
  Status: {완료 | 진행중 | 블로킹}
  Completed: {완료 항목}
  In Progress: {진행 항목}
  Blockers: {블로커 — 없으면 "없음"}
  Escalations: {에스컬레이션 — 없으면 "없음"}
  Cross-Team: {다른 팀 요청 — 없으면 "없음"}
  Deliverables: {산출물 목록}
  Next: {다음 계획}
```

### Subcommand: team

`team` 다음 단어로 서브커맨드 라우팅:
- `create` → [Team: create]
- `list` → [Team: list]
- `status` → [Team: status]
- `assign` → [Team: assign]
- `report` → [Team: report]
- `coord` → [Team: coord]
- `disband` → [Team: disband]
- `templates` → [Team: templates]

#### Team: create

`team create <name> [--template <t>]`

1. `--template` 있으면 → `.xm/teams/{template}.yaml` 읽기
2. 없으면 → AskUserQuestion으로 팀 구성 동적 조합:
   - 팀 목적
   - 멤버 역할 (기존 preset에서 선택)
   - 자율성 범위 (can_decide / must_escalate)
3. 팀 정의를 `.xm/teams/{name}.yaml`로 저장
4. 출력:
```
✅ Team "{name}" created

  Leader: team-leader (opus)
  Members:
    - frontend-dev (se, sonnet)
    - backend-dev (se, sonnet)
    - tester (test-engineer, sonnet)
  Cross-team: [design]

  Assign a goal: /x-agent team assign {name} "목표"
```

#### Team: list

활성 팀 목록 표시. `.xm/teams/*.yaml` 스캔.

```
📋 Active Teams

  | Team | Members | Status | Current Goal |
  |------|---------|--------|-------------|
  | engineering | 3 | idle | - |
  | design | 2 | working | UI 디자인 |
```

#### Team: status

`team status [name]`

특정 팀 또는 전체 팀의 상세 진행 상황. TL에게 SendMessage로 보고 요청.

```
📊 engineering Team Status

  Goal: 결제 시스템 구현
  Phase: executing (2/5 tasks done)

  | Member | Task | Status |
  |--------|------|--------|
  | frontend-dev | 결제 UI | ✅ completed |
  | backend-dev | 결제 API | 🔄 in progress |
  | tester | 테스트 작성 | ⏳ waiting (depends on API) |

  Blockers: 없음
  Escalations: 없음
```

#### Team: assign

`team assign <team> <goal>`

1. 팀 정의 읽기 (`.xm/teams/{team}.yaml`)
2. Team Leader를 named Agent로 spawn:
   ```
   Agent tool: {
     name: "tl-{team}",
     description: "Team Leader: {team}",
     prompt: "{Team Leader Protocol}\n\n## Goal\n{goal}",
     model: "opus",
     run_in_background: true
   }
   ```
3. TL이 내부에서 팀원을 spawn하고 관리
4. 출력:
```
🚀 Goal assigned to team "{team}"

  Goal: {goal}
  Team Leader: tl-{team} (opus, background)

  The TL will decompose the goal, assign member tasks, and report back.
  Check progress: /x-agent team status {team}
  Request report: /x-agent team report {team}
```

#### Team: report

`team report [name]`

TL에게 현재 상태 보고를 요청. SendMessage로 named agent에게 전달:
```
SendMessage: {
  to: "tl-{name}",
  message: "📊 보고를 제출하세요."
}
```

TL이 📊 형식으로 보고.

이름 미지정 시 → 모든 활성 TL에게 보고 요청.

#### Team: coord

`team coord <from> <to> <message>`

Director가 팀 간 메시지를 라우팅:
```
SendMessage: {
  to: "tl-{to}",
  message: "[CROSS-TEAM ← {from}] {message}"
}
```

TL 응답을 수신하면 발신 팀에게 전달:
```
SendMessage: {
  to: "tl-{from}",
  message: "[CROSS-TEAM ← {to}] {response}"
}
```

#### Team: disband

`team disband [name]`

1. TL에게 종료 메시지 전달
2. `.xm/teams/{name}.yaml`의 상태를 `disbanded`로 변경
3. 출력:
```
🏁 Team "{name}" disbanded

  Final report:
  {TL의 최종 보고}
```

이름 미지정 시 → AskUserQuestion으로 대상 선택.

#### Team: templates

사용 가능한 팀 템플릿 목록.

```
📋 Team Templates

  | Template | Leader | Members | Description |
  |----------|--------|---------|-------------|
  | engineering | architect | se×2, test-engineer | Backend/Frontend 개발 및 테스트 |
  | design | planner | explorer, se, reviewer | UX 리서치, UI 구현, 디자인 리뷰 |
  | review | critic | reviewer, security, optimizer | 다각도 코드 리뷰 |
  | research | planner | explorer×3 | 다방면 코드베이스/기술 탐색 |
  | fullstack | architect | design TL + engineering TL | 멀티팀 풀스택 프로젝트 |

  Create from template: /x-agent team create myteam --template engineering
```

### 기본 템플릿 (5개)

#### engineering.yaml
```yaml
name: engineering
description: "Backend/Frontend 개발 및 테스트"
type: static
leader:
  role: team-leader
  model: opus
  can_decide:
    - 구현 방식 선택
    - 태스크 내부 분배
    - 코드 리뷰 피드백
  must_escalate:
    - 스코프 변경
    - 아키텍처 결정
    - 외부 의존성 추가
    - 품질 게이트 2회 연속 실패
members:
  - role: se
    alias: frontend-dev
    context: "프론트엔드 전담"
  - role: se
    alias: backend-dev
    context: "백엔드 전담. API/DB"
  - role: test-engineer
    alias: tester
    context: "테스트 전략 및 커버리지"
cross_team: [design]
```

#### design.yaml
```yaml
name: design
description: "UX 리서치, UI 구현, 디자인 리뷰"
type: static
leader:
  role: team-leader
  model: opus
  can_decide:
    - UI/UX 방향 결정
    - 컴포넌트 구조
    - 디자인 피드백
  must_escalate:
    - 사용자 플로우 대폭 변경
    - 브랜드 가이드라인 변경
    - 접근성 기준 미달
members:
  - role: explorer
    alias: ux-researcher
    context: "사용자 플로우 분석, 기존 UI 패턴 조사"
  - role: se
    alias: ui-designer
    context: "UI 컴포넌트 구현"
  - role: reviewer
    alias: design-reviewer
    context: "디자인 일관성, 접근성 리뷰"
cross_team: [engineering]
```

#### review.yaml
```yaml
name: review
description: "다각도 코드 리뷰 (품질, 보안, 성능)"
type: static
leader:
  role: team-leader
  model: opus
  can_decide:
    - 리뷰 관점 배분
    - 이슈 심각도 판정
    - 리뷰 완료 판단
  must_escalate:
    - Critical 보안 취약점 발견
    - 아키텍처 수준 리팩터링 필요
members:
  - role: reviewer
    alias: code-reviewer
    context: "로직 정확성, 가독성, 유지보수성"
  - role: security
    alias: security-reviewer
    context: "OWASP Top 10, 인증/인가"
  - role: optimizer
    alias: perf-reviewer
    context: "성능 병목, 캐싱, 쿼리 최적화"
cross_team: []
```

#### research.yaml
```yaml
name: research
description: "다방면 코드베이스/기술 탐색"
type: static
leader:
  role: team-leader
  model: opus
  can_decide:
    - 탐색 범위 조정
    - 관점 배분
    - 결과 종합 방식
  must_escalate:
    - 예상과 크게 다른 발견 (아키텍처 불일치 등)
members:
  - role: explorer
    alias: explorer-1
    context: "구조 및 진입점 탐색"
  - role: explorer
    alias: explorer-2
    context: "의존성 및 외부 연동 탐색"
  - role: explorer
    alias: explorer-3
    context: "패턴 및 컨벤션 탐색"
cross_team: []
```

#### fullstack.yaml
```yaml
name: fullstack
description: "멀티팀 풀스택 프로젝트 (design + engineering)"
type: static
leader:
  role: team-leader
  model: opus
  can_decide:
    - 팀 간 작업 순서 조율
    - 인터페이스 계약 중재
    - 통합 테스트 범위
  must_escalate:
    - 프로젝트 스코프 변경
    - 일정 지연
    - 팀 간 해결 불가 충돌
members:
  - role: team-leader
    alias: design-lead
    context: "디자인 팀 리더. design.yaml 참조하여 하위 팀원 관리"
  - role: team-leader
    alias: eng-lead
    context: "엔지니어링 팀 리더. engineering.yaml 참조하여 하위 팀원 관리"
cross_team: []
```

---

## x-op에서 사용하는 방법

x-op 전략은 x-agent 프리미티브를 내부적으로 사용한다:

| x-op 전략 | 사용하는 프리미티브 |
|-----------|------------------|
| refine (diverge) | fan-out |
| refine (converge/verify) | fan-out (투표/검증) |
| tournament (compete) | fan-out |
| tournament (vote) | fan-out |
| chain | delegate (순차) |
| review | broadcast (관점별) |
| debate (opening) | delegate × 2 (PRO/CON) |
| debate (rebuttal) | delegate × 2 |
| debate (verdict) | delegate × 1 (JUDGE) |
| red-team (attack) | fan-out |
| red-team (defend) | fan-out |
| brainstorm | fan-out |
| distribute | broadcast (서브태스크별) |
| council | fan-out → broadcast → fan-out |

## x-build에서 사용하는 방법

x-build의 `run` 커맨드는 x-agent를 사용:

| x-build 커맨드 | 사용하는 프리미티브 |
|----------------|------------------|
| `run` (step 실행) | fan-out 또는 broadcast (태스크별 다른 프롬프트) |
| `plan` (AI 분해) | delegate (planner role, opus) |
| `quality` (검증) | delegate (verifier role) |
| `run --team` (팀 실행) | team assign (TL이 내부에서 fan-out/delegate) |

---

## Advanced: 파이프라인 조합

프리미티브를 직접 조합하여 커스텀 워크플로우를 만들 수 있다:

```
# 1. 코드 분석 (fan-out)
/x-agent fan-out "src/auth.ts의 문제점을 찾아라" --agents 3

# 2. 결과를 아키텍트에게 위임 (delegate)
/x-agent delegate architect "위 분석을 종합하여 개선안을 설계하라" --model opus

# 3. 개선안을 다각도 리뷰 (broadcast)
/x-agent broadcast "이 설계안을 리뷰하라" --roles "security,performance,testing"
```

이 패턴은 x-op의 `chain` 전략과 유사하지만, 사용자가 각 단계를 직접 제어한다.
