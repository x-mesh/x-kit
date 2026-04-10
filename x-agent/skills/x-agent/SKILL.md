---
name: x-agent
description: Agent primitives and autonomous behaviors — fan-out, delegate, broadcast, research, solve, consensus, swarm for Claude Code native multi-agent orchestration
---

<Purpose>
Two layers of agent capability on top of Claude Code's native Agent tool:
1. **Primitives** — Reusable patterns (fan-out, delegate, broadcast) for direct agent control
2. **Autonomous Behaviors** — Goal-driven agent activities (research, solve, consensus, swarm) where agents self-direct, discover, and collaborate via stigmergy

Key distinction from x-op: x-op = leader-controlled strategies. x-agent = agent-autonomous execution.
</Purpose>

<Use_When>
- User wants to send a task to multiple agents in parallel
- User says "fan-out", "delegate", "broadcast", "ask N agents"
- User wants agents to explore/research autonomously ("research this", "investigate freely", "find out about")
- User wants agents to solve a problem without step-by-step direction ("figure out why", "fix this somehow")
- Other x-kit skills need agent primitives
- User wants direct agent control without a full strategy
</Use_When>

<Do_Not_Use_When>
- User wants a leader-controlled strategy with fixed phases (use /x-op instead)
- Single simple task (just use Agent tool directly)
- User says specific strategy names like "refine", "tournament", "debate" (use /x-op)
</Do_Not_Use_When>

# x-agent — Agent Primitives & Autonomous Behaviors

Structured agent primitives and autonomous behaviors on top of the Claude Code native Agent tool.
No external dependencies. Works with Claude Code alone.

```
x-agent
├── Primitives          fan-out, delegate, broadcast, status
├── Autonomous          research, solve, consensus, swarm
├── Team                Team Leader → Members hierarchy
└── (cross-cutting) Role Presets — 15 presets injected into all layers
```

**Design philosophy:**
- x-op = conductor with a score (leader controls every phase)
- x-agent = jazz band (agents listen to each other and adapt)

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

**Developer mode**: Use technical terms (fan-out, delegate, broadcast, collect, verdict, assumption). Concise.

**Normal mode**: Use simple Korean for all user-facing output.
- Term mapping: "fan-out" → "동시 실행", "delegate" → "위임", "broadcast" → "전체 전달", "board" → "게시판"
- Term mapping: "verdict" → "판정", "role" → "역할", "team" → "팀", "stigmergy" → "간접 협동"
- Use polite register (~하세요 체), prioritize key information first

## Arguments

User provided: $ARGUMENTS

## Routing

First word of `$ARGUMENTS`:
- `fan-out` → [Primitive: fan-out]
- `delegate` → [Primitive: delegate]
- `broadcast` → [Primitive: broadcast]
- `status` → [Primitive: status]
- `team` → [Team: subcommand routing]
- `research` → [Autonomous: research]
- `solve` → [Autonomous: solve]
- `consensus` → [Autonomous: consensus]
- `swarm` → [Autonomous: swarm]
- `list` or empty input → [Subcommand: list]

---

## Subcommand: list

```
x-agent — Agent Primitives & Autonomous Behaviors

Primitives:
  fan-out <prompt> [options]     Send same prompt to N agents in parallel
  delegate <role> <prompt>       Send to one agent with a specific role
  broadcast <prompt> [options]   Send different context to each agent
  status                         Show active background agents

Autonomous:
  research <topic> [options]     Autonomous exploration — agents discover, share, re-explore
  solve <goal> [options]         Autonomous problem-solving — agents try, adapt, converge
  consensus <topic> [options]    Peer deliberation — agents debate and self-converge
  swarm <goal> [options]         Stigmergy — agents claim, execute, post tasks to shared board

Team:
  team create <name> [--template <t>]   Create a team (from template or dynamic)
  team list                             Show active teams
  team status [name]                    Team progress report
  team assign <team> <goal>             Assign goal to team → TL executes
  team report [name]                    Request report from TL
  team coord <from> <to> <message>      Route cross-team message
  team disband [name]                   Disband a team
  team templates                        List available team templates

Primitive Options:
  --agents N                     Number of agents (default 3)
  --model sonnet|opus|haiku      Agent model (default sonnet)
  --background                   Run in background (default for fan-out)
  --foreground                   Wait for result (default for delegate)
  --role <name>                  Agent role/description
  --roles "r1,r2,r3"             Per-agent role presets (comma-separated)
  --context <text>               Additional context to inject

Autonomous Options:
  --agents N                     Number of agents (default 3; consensus: 4)
  --model sonnet|opus|haiku      Agent model (default sonnet)
  --budget N                     Max rounds per agent (default 5; consensus: 4)
  --depth shallow|deep|exhaustive  Exploration depth (default deep)
  --focus <hint>                 Focus area hint (optional)
  --web                          Allow web search (default: code-only)

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
  /x-agent fan-out "Find bugs in this code" --agents 5
  /x-agent delegate security "Security review of src/auth.ts"
  /x-agent broadcast "Review from your perspective" --agents 3
  /x-agent research "Redis pub/sub limits and alternatives" --budget 5
  /x-agent solve "CI-only test failure in auth module" --agents 3
  /x-agent consensus "JWT vs Session for auth" --agents 4
  /x-agent swarm "Increase test coverage to 80%" --agents 5 --budget 10
  /x-agent team create eng --template engineering
  /x-agent team assign eng "Implement payment system"
```

---

## Primitive: fan-out

**Send the same prompt to N agents in parallel and collect all results.**

### Parsing

From `$ARGUMENTS`:
- After the first word = prompt (full text inside quotes)
- `--agents N` = number of agents (default 3)
- `--model sonnet|opus|haiku` = model (default sonnet)
- `--role <name>` = agent role description (default: "agent")
- `--roles "se,sre,security"` = per-agent role presets (comma-separated)
- `--context <text>` = additional context injection

### --roles option

When `--roles "se,sre,security"` is specified, each agent gets its corresponding role preset:

```
Agent 1: se preset injected + common prompt
Agent 2: sre preset injected + common prompt
Agent 3: security preset injected + common prompt
```

Without `--roles`, the default behavior applies (identical prompts).
If the number of roles in `--roles` differs from `--agents N`, the roles count takes precedence.

### Execution

**Invoke N Agent tools simultaneously in a single message:**

```
Agent tool 1: {
  description: "agent-1: {role}",
  prompt: "{context if provided}\n\n{prompt}",
  run_in_background: true,
  model: "{model}"
}
Agent tool 2: {
  description: "agent-2: {role}",
  prompt: "{same prompt}",
  run_in_background: true,
  model: "{model}"
}
... (N total)
```

### Result collection

When all agents complete:
1. Organize each agent's result with numbering
2. Output consolidated results to the user:

```
📡 [fan-out] {N} agents completed

## Agent 1
{result}

## Agent 2
{result}

## Agent 3
{result}

---
💡 Commonalities: {common patterns identified by the leader}
⚡ Differences: {key differences}
```

---

## Primitive: delegate

**Delegate to a single agent with a specific role and receive the result immediately.**

### Parsing

From `$ARGUMENTS`:
- Word after `delegate` = role
- Remainder = prompt
- `--model sonnet|opus|haiku` = model (default sonnet; auto-selects opus for roles like "architect")
- `--background` = run in background (default: foreground)
- `--context <text>` = additional context

### Automatic model routing

| Role keyword | Model |
|------------|------|
| architect, analyst, critic, planner | opus |
| se, sre, reviewer, security, debugger, optimizer, executor, builder, fixer, tester, verifier, test-engineer, build-fixer | sonnet |
| explorer, documenter, scanner, linter | haiku |

Explicit `--model` overrides automatic routing.

### Automatic role preset injection

When the role name in delegate matches a registered preset, that preset's system prompt is automatically injected into the agent prompt:

Examples:
- `/x-agent delegate sre "Inspect this service"` → SRE checklist included in the prompt
- `/x-agent delegate explorer "Map the codebase"` → Exploration strategy included in the prompt
- Unknown role → default delegate behavior without preset

### Execution

```
Agent tool: {
  description: "{role}",
  prompt: "{context}\n\n## Role: {role}\n{prompt}",
  run_in_background: false (foreground),
  model: "{auto-routed model}"
}
```

### Result

```
📌 [delegate] {role} ({model}) completed

{agent result}
```

---

## Primitive: broadcast

**Send to multiple agents simultaneously, each with a different context/role.**

### Parsing

From `$ARGUMENTS`:
- After `broadcast` = common prompt
- `--agents N` = number of agents (default 3)
- `--roles "security,performance,logic"` = per-agent roles (comma-separated)
- `--model` = model
- `--context` = common context

When preset names are used in `--roles`, the corresponding specialized prompts are automatically injected.

### Automatic role assignment when unspecified

When `--roles` is omitted, roles are auto-assigned based on agent count:

| N | Auto-assigned roles |
|---|---------|
| 2 | analyst, critic |
| 3 | security, performance, logic |
| 4 | security, performance, logic, architecture |
| 5+ | security, performance, logic, architecture, testing, ... |

### Execution

```
Agent tool 1: {
  description: "agent-1: {role_1}",
  prompt: "{context}\n\n## Your Role: {role_1}\n{prompt}\n\nAnalyze from the {role_1} perspective.",
  run_in_background: true,
  model: "{model}"
}
Agent tool 2: {
  description: "agent-2: {role_2}",
  prompt: "{context}\n\n## Your Role: {role_2}\n{prompt}\n\nAnalyze from the {role_2} perspective.",
  run_in_background: true,
  model: "{model}"
}
```

### Result

```
📡 [broadcast] {N} agents ({roles}) completed

## 🔒 Security
{result}

## ⚡ Performance
{result}

## 🧩 Logic
{result}
```

---

## Primitive: status

Show the list of agents currently running in the background.

```
📊 [status] Active agents

  🔵 agent-1: security review     running (45s)
  🔵 agent-2: performance check   running (45s)
  ✅ agent-3: logic review         completed (32s)
```

This information is tracked from Claude Code's internal state. No separate storage required.

---

## Role Presets

When a registered role name is used with delegate/fan-out/broadcast, the corresponding specialized prompt is automatically injected.

| Role | Model | Icon | Description |
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

Hierarchical team structure: Director (user) → Team Leader → Members.

> Detailed documentation: [TEAM.md](./TEAM.md) — team definition format, communication protocols, TL Protocol, subcommand details, built-in templates.
> When executing a `team` command, read TEAM.md and follow the instructions in the relevant section.

```
Director (user + leader Claude)
  ├── Team Leader (opus, named agent) → manages members via fan-out/delegate/broadcast
  └── Cross-team: Director routes TL ↔ TL messages
```

| Command | Action |
|------|------|
| `team create <name> [--template <t>]` | Create a team (template or dynamic) |
| `team list` | List active teams |
| `team status [name]` | Team progress report |
| `team assign <team> <goal>` | Assign goal to team → TL executes |
| `team report [name]` | Request report from TL |
| `team coord <from> <to> <msg>` | Route cross-team message |
| `team disband [name]` | Disband a team |
| `team templates` | List available templates |

Built-in templates: `engineering`, `design`, `review`, `research`, `fullstack` (`.xm/teams/`)

---

## x-op vs x-agent: When to Use Which

| Situation | Use | Why |
|-----------|-----|-----|
| Known unknowns — you know what angles to explore | **x-op** (investigate, review) | Leader assigns angles, structured phases |
| Unknown unknowns — you don't know what you'll find | **x-agent** (research) | Agents self-discover, board-driven adaptation |
| Structured debate with roles | **x-op** (council, debate) | Leader mediates, weighted voting |
| Organic agreement — best argument wins | **x-agent** (consensus) | Peer positions on board, self-revision |
| Known task list to parallelize | **x-op** (distribute) | Leader splits and assigns upfront |
| Emergent tasks discovered during work | **x-agent** (swarm) | Agents add tasks to board dynamically |
| Fixed hypothesis → falsification | **x-op** (hypothesis) | Leader collects → assigns verification |
| Try different approaches, learn from failures | **x-agent** (solve) | Agents post attempts, adopt/abandon on board |

## How x-op uses primitives

x-op strategies use x-agent primitives internally (design intent — x-op implements its own agent management):

| x-op strategy | Primitive used |
|-----------|------------------|
| refine (diverge) | fan-out |
| refine (converge/verify) | fan-out (voting/verification) |
| tournament (compete) | fan-out |
| tournament (vote) | fan-out |
| chain | delegate (sequential) |
| review | broadcast (per-perspective) |
| debate (opening) | delegate x 2 (PRO/CON) |
| debate (rebuttal) | delegate x 2 |
| debate (verdict) | delegate x 1 (JUDGE) |
| red-team (attack) | fan-out |
| red-team (defend) | fan-out |
| brainstorm | fan-out |
| distribute | broadcast (per-subtask) |
| council | fan-out → broadcast → fan-out |

## How x-build uses this

x-build's `run` command uses x-agent:

| x-build command | Primitive used |
|----------------|------------------|
| `run` (step execution) | fan-out or broadcast (different prompts per task) |
| `plan` (AI decomposition) | delegate (planner role, opus) |
| `quality` (verification) | delegate (verifier role) |
| `run --team` (team execution) | team assign (TL uses fan-out/delegate internally) |

---

## Advanced: Pipeline composition

Compose primitives directly to build custom workflows:

```
# 1. Code analysis (fan-out)
/x-agent fan-out "Find issues in src/auth.ts" --agents 3

# 2. Delegate results to architect (delegate)
/x-agent delegate architect "Synthesize the above analysis and design improvements" --model opus

# 3. Multi-perspective review of the proposal (broadcast)
/x-agent broadcast "Review this design proposal" --roles "security,performance,testing"
```

This pattern is similar to x-op's `chain` strategy, but the user controls each step directly.

---

## Autonomous: research

**Agents autonomously explore a topic — discovering, sharing findings via a shared board, and re-exploring based on what others found.**

Unlike x-op `investigate` (leader assigns angles, fixed phases), research agents decide their own direction, share findings indirectly through a shared board file (stigmergy pattern), and loop until they judge "enough is known" or budget runs out.

### Communication: Stigmergy (Indirect Coordination)

Sub-agents cannot use SendMessage (Claude Code architecture constraint — only parent has SendMessage). Instead, agents coordinate through a **shared board file**, like ants leaving pheromone trails:

```
agent-1 writes finding → board.jsonl ← agent-2 reads and adapts
```

Verified behavior (tested 2026-04-07):
- Agents read each other's findings from the board ✅
- Agents adapt their exploration direction based on peer findings ✅
- Natural work deduplication occurs without explicit coordination ✅
- Independent agents converge on the same conclusions from different angles ✅

### Parsing

From `$ARGUMENTS`:
- After `research` = topic
- `--agents N` = number of agents (default 3)
- `--model sonnet|opus|haiku` = model (default sonnet)
- `--budget N` = max rounds per agent (default 5)
- `--depth shallow|deep|exhaustive` = exploration depth (default deep)
- `--focus <hint>` = optional focus area hint
- `--web` = allow WebSearch/WebFetch (default: code-only — Read, Grep, Glob, Bash)

### Core Mechanism: Discovery Loop with Stigmergy

Each agent runs an independent discovery loop. Between rounds, agents read a shared board file to see what peers have discovered, and adapt their next question accordingly.

```
BOARD: .xm/research/{run-id}/board.jsonl

┌─ researcher-1 ───────────────────────────────┐
│                                               │
│  while budget > 0:                            │
│    1. READ BOARD — check peer findings        │
│       if peer finding changes my direction:   │
│         reframe next question                 │
│    2. FRAME   — pick next question to explore │
│    3. EXPLORE — gather evidence (Read/Grep/Web)│
│    4. EVALUATE — assess findings              │
│    5. POST    — write finding to board.jsonl  │
│    6. JUDGE   — "do I know enough?" or continue│
│    budget -= 1                                │
│                                               │
│  REPORT — individual findings + confidence    │
└───────────────────────────────────────────────┘
```

### Execution

**Step 0: Create shared board**

The leader creates the board file before launching agents:
```bash
RUN_ID="research-$(date +%Y%m%d-%H%M%S)"
mkdir -p .xm/research/$RUN_ID
touch .xm/research/$RUN_ID/board.jsonl
```

**Step 1: Launch agents in parallel**

The leader spawns N agents simultaneously:

```
Agent tool 1: {
  description: "researcher-1: {topic}",
  run_in_background: true,
  model: "{model}",
  prompt: "{RESEARCH_AGENT_PROMPT}"
}
Agent tool 2: {
  description: "researcher-2: {topic}",
  ...same structure...
}
... (N total)
```

**Step 2: Wait for all agents to complete**

Agents auto-notify on completion. The leader waits for all N agents.

**Step 3: Synthesize**

The leader reads all agent reports and the board file, then produces the final synthesis.

### Research Agent Prompt

Each agent receives this prompt (adapted for depth and focus):

```
## Autonomous Research: {TOPIC}
{focus hint if --focus provided}

You are researcher-{N}, one of {total} independent researchers.
Your peers are also writing findings to the shared board.

### Your Tools
- Read, Grep, Glob, Bash for code/file exploration
{if --web: "- WebSearch, WebFetch for external research"}

### Shared Board (Stigmergy)
BOARD FILE: {absolute_path_to_board.jsonl}

- To POST a finding: Bash("echo '{json}' >> {board_path}")
  Format: {"agent":"researcher-{N}","round":R,"finding":"...","source":"...","implication":"..."}
- To READ peer findings: Bash("cat {board_path}")

### Discovery Loop

Run up to {budget} rounds. Each round:

1. **READ BOARD** — Check what peers have discovered
   - Bash("cat {board_path}")
   - If a peer's finding opens a new angle: explore it
   - If a peer's finding overlaps your current line: pivot to avoid duplication
   - If a peer's finding contradicts yours: investigate the discrepancy

2. **FRAME** — What is the most valuable question to explore next?
   - Round 1: derive from the topic directly
   - Round 2+: informed by your findings AND board contents

3. **EXPLORE** — Gather evidence for your current question
   - {depth_instructions}
   - Cite every finding: file path, line number, URL, or inference

4. **POST** — Write your finding to the board
   - Bash("echo '{"agent":"researcher-{N}","round":{R},"finding":"...","source":"...","implication":"..."}' >> {board_path}")
   - Only post genuinely useful discoveries, not every observation

5. **JUDGE** — Should you continue?
   - STOP if: your questions are answered + confidence is high + board shows convergence
   - CONTINUE if: budget remains + open questions exist or board suggests new angles

### Depth: {depth}
{depth_instructions — see Depth Instructions below}

### Final Report

When done (STOP or budget exhausted), output:

## Findings
| # | Finding | Confidence | Source |
|---|---------|------------|--------|
(number each finding, HIGH/MEDIUM/LOW confidence, cite source)

## Key Insights
- (3-5 most important takeaways)

## Board Interactions
- (what you learned from the board, how it changed your direction)
- (which peer findings influenced your exploration)

## Open Questions
- (what you couldn't resolve within budget)

## Self-Assessment
- Rounds used: {N}/{budget}
- Thoroughness: {1-10}
- Confidence: CONFIDENT / UNCERTAIN
```

### Depth Instructions

| Depth | Max files per round | Web | Cross-validation | Agent prompt addition |
|-------|-------------------|-----|------------------|----------------------|
| shallow | 3 | No | No | "Quick scan only. Prioritize breadth over depth. 1-2 findings per round." |
| deep | 8 | If --web | Yes (check peer findings) | "Follow promising leads 2 levels deep. Verify key findings with a second source." |
| exhaustive | 15 | If --web | Required | "Leave no stone unturned. Cross-reference findings across files. Verify every claim." |

### Leader Synthesis

After all agents complete, the leader produces the final output by:

1. **Collect** all agent reports
2. **Cross-validate** — findings reported by 2+ agents = HIGH confidence
3. **Deduplicate** — merge overlapping findings, keep the most detailed version
4. **Resolve conflicts** — contradictory findings flagged as `[CONFLICT]`
5. **Aggregate open questions** — union of all agents' open questions, minus any answered by other agents

### Final Output

```
🔬 [research] Complete — {N} agents, {total_rounds} rounds, {M} findings

## Topic
{topic}

## Findings
| # | Finding | Confidence | Sources | Agents |
|---|---------|------------|---------|--------|
| 1 | {finding} | HIGH | src/auth.ts:42, docs | 1, 3 |
| 2 | {finding} | MEDIUM | researcher-2 report | 2 |

## Key Insights
1. {insight — synthesized across agents}
2. ...

## Discovery Graph
{How agents influenced each other via the board}
- researcher-1 posted X (round 1) → researcher-2 read board, pivoted to Y → confirmed Z
- researcher-3 independently found Z → HIGH confidence (convergent discovery)

## Open Questions
| # | Question | Importance | Suggested Next Step |
|---|----------|------------|-------------------|
| 1 | {question} | CRITICAL | → /x-agent research --focus "..." |
| 2 | {question} | NICE-TO-HAVE | → /x-op hypothesis "..." |

## Research Stats
| Agent | Rounds | Findings | Board Posts | Adapted from Board? |
|-------|--------|----------|-------------|-------------------|
| researcher-1 | 4/5 | 6 | 4 | YES (round 3) |
| researcher-2 | 5/5 | 4 | 3 | YES (round 2, 3) |
| researcher-3 | 3/5 | 5 (early stop) | 3 | NO |
```

The leader appends a `## Self-Score` block per the Self-Score Protocol defined in x-op SKILL.md (rubric: `general`). Format: table with criterion, score (1-10), note per row, plus weighted overall.

### Comparison: x-agent research vs x-op investigate

| Dimension | x-op investigate | x-agent research |
|-----------|-----------------|-----------------|
| Angle selection | Leader pre-assigns | Agent self-discovers |
| Phase count | Fixed 4 (scope→explore→synthesize→gap) | Agent-determined (budget-bounded) |
| Mid-execution confirmation | AskUserQuestion required at every phase | None — agents run autonomously |
| New question discovery | Only in Gap Analysis (Phase 4, post-hoc) | Real-time via board → reshapes ongoing exploration |
| Agent communication | None (leader relays everything) | Stigmergy — shared board file (indirect, async) |
| Direction change | Impossible mid-phase | Agents read board and pivot each round |
| Best for | Known unknowns (you know what angles to explore) | Unknown unknowns (you don't know what you'll find) |

### Why Stigmergy, Not SendMessage

Claude Code sub-agents (Agent tool) cannot use SendMessage — only the parent has it. Tested and confirmed 2026-04-07. Stigmergy (shared file read/write) is the verified alternative:

- **Pros**: Works with existing tools (Bash echo/cat), async by nature, no polling needed (agents read board at round start), naturally produces an audit trail
- **Cons**: Latency depends on round timing (agent may not see peer's finding until next round), no guaranteed delivery order
- **Result**: In testing, agents successfully read peer findings, adapted direction, avoided duplication, and converged independently — functionally equivalent to peer messaging for research tasks

---

## Autonomous: solve

**Agents independently attack a problem from different angles — posting attempts to a shared board, learning from peers' successes and failures, and adapting their approach each round.**

Unlike x-op `hypothesis` (leader collects hypotheses → assigns falsification), solve agents self-direct their entire investigation. They read the board to learn what others tried, what worked, what failed, and can abandon dead ends or join a peer's promising approach.

### Parsing

From `$ARGUMENTS`:
- After `solve` = problem description
- `--agents N` = number of agents (default 3)
- `--model sonnet|opus|haiku` = model (default sonnet)
- `--budget N` = max rounds per agent (default 5)
- `--target <file|dir>` = target files/directories (optional)
- `--verify <command>` = verification command to check if solved (optional, e.g., `"bun test"`)

### Core Mechanism: Try-Share-Adapt Loop

Each agent tries a different approach, posts what they tried and learned, reads what peers tried, and adapts. The board accumulates a collective knowledge of "what works" and "what doesn't".

```
BOARD: .xm/solve/{run-id}/board.jsonl

Each line is one entry:
  {"type":"attempt","agent":"solver-1","round":1,"approach":"...","result":"success|failed|partial","detail":"..."}
  {"type":"insight","agent":"solver-2","round":2,"insight":"...","confidence":"HIGH|MEDIUM|LOW"}
  {"type":"abandon","agent":"solver-1","round":3,"approach":"...","reason":"..."}
  {"type":"adopt","agent":"solver-3","round":2,"from":"solver-1","approach":"...","adaptation":"..."}
  {"type":"solved","agent":"solver-2","round":4,"solution":"...","verification":"..."}
```

```
┌─ solver-1 ──────────────────────────────────────┐
│                                                  │
│  while budget > 0 AND not solved:                │
│    1. READ BOARD — what have peers tried?        │
│       - What approaches failed? (avoid these)    │
│       - What insights were shared? (build on)    │
│       - Has anyone solved it? (stop if yes)      │
│    2. FRAME  — choose my approach for this round │
│       - Round 1: independent approach            │
│       - Round 2+: informed by board              │
│    3. TRY    — attempt the solution              │
│    4. POST   — write attempt result to board     │
│       - Include: approach, result, what I learned│
│    5. VERIFY — if --verify, run verification cmd │
│       - If passes: post "solved" entry, STOP     │
│    budget -= 1                                   │
│                                                  │
│  REPORT — attempts, what worked, what didn't     │
└──────────────────────────────────────────────────┘
```

### Board Protocol

**Attempt** (tried something):
```json
{"type":"attempt","agent":"solver-N","round":R,"approach":"what I tried","result":"success|failed|partial","detail":"what happened","files_changed":["path1"]}
```

**Insight** (learned something useful):
```json
{"type":"insight","agent":"solver-N","round":R,"insight":"key learning","confidence":"HIGH|MEDIUM|LOW"}
```

**Abandon** (giving up on an approach):
```json
{"type":"abandon","agent":"solver-N","round":R,"approach":"what I abandoned","reason":"why"}
```

**Adopt** (picking up a peer's approach):
```json
{"type":"adopt","agent":"solver-N","round":R,"from":"solver-M","approach":"what I'm adopting","adaptation":"how I'm modifying it"}
```

**Solved** (problem resolved):
```json
{"type":"solved","agent":"solver-N","round":R,"solution":"description","verification":"command output or evidence"}
```

### Execution

**Step 0: Create board**

```bash
RUN_ID="solve-$(date +%Y%m%d-%H%M%S)"
mkdir -p .xm/solve/$RUN_ID
touch .xm/solve/$RUN_ID/board.jsonl
```

**Step 1: Launch agents in parallel**

Each agent gets a different starting angle (leader assigns initial angles to maximize coverage):

```
Agent 1: "Start by analyzing from the code structure angle"
Agent 2: "Start by analyzing from the data flow angle"
Agent 3: "Start by analyzing from the error/log angle"
```

With staggered start (3s intervals) to reduce conflicts on shared files.

**Step 2: Wait for all agents or early termination**

If any agent posts a `"type":"solved"` entry, the leader can notify remaining agents (or let them discover it on next board read).

**Step 3: Leader synthesize**

Read board, verify the solution, compile the attempt history.

### Solve Agent Prompt

```
## Autonomous Problem Solving: {PROBLEM}
{target files if --target provided}

You are solver-{N}, one of {total} independent problem solvers.
Starting angle: {assigned_angle}

{if N > 1: "First: Bash(\"sleep {(N-1)*3}\") to stagger start and reduce file conflicts."}

### Board
BOARD FILE: {board_path}

- READ: Bash("cat {board_path}")
- POST attempt: Bash("echo '{json}' >> {board_path}")
- POST insight: Bash("echo '{json}' >> {board_path}")
{if --verify: "- VERIFY: Bash(\"{verify_command}\")"}

### Problem-Solving Loop

Run up to {budget} rounds. Each round:

1. **READ BOARD** — Learn from peers
   - Failed attempts: DO NOT repeat these approaches
   - Insights: Build on these
   - "solved" entry: STOP immediately — someone found it

2. **FRAME** — Choose your approach
   - Round 1: Use your assigned starting angle
   - Round 2+: Adapt based on board contents
   - If your previous attempt failed: try a fundamentally different approach
   - If a peer posted a promising partial result: consider building on it (post "adopt" entry)

3. **TRY** — Attempt the solution
   - Read relevant files, analyze, make changes if needed
   - Keep changes minimal and reversible
   - If working on shared files, check board for conflicts first

4. **POST** — Share what happened
   - Always post an "attempt" entry with result and detail
   - If you learned something generalizable, also post an "insight"
   - If abandoning an approach, post "abandon" with reason

5. **VERIFY** — Check if solved
{if --verify: "   - Run: {verify_command}
   - If passes: post \"solved\" entry and STOP
   - If fails: post failure detail in attempt entry"}
{if no --verify: "   - Assess based on evidence whether the problem is resolved"}

### Rules
- NEVER repeat an approach that another agent already tried and failed
- If you see a peer's "solved" entry, STOP immediately
- Post to the board EVERY round — even failed attempts are valuable data
- Keep file changes minimal — don't refactor while solving

### Final Report

## Attempts
| Round | Approach | Result | Key Learning |
|-------|----------|--------|-------------|

## Solution (if found)
{description + evidence}

## Dead Ends
- {approaches that didn't work and why}

## Self-Assessment
- Rounds used: N/{budget}
- Solved: YES/NO
- Confidence: CONFIDENT / UNCERTAIN
```

### Early Termination

When any agent posts `"type":"solved"`:
- Other agents discover it on their next READ BOARD and STOP
- The leader verifies the solution independently
- If verification fails, the leader removes the "solved" entry and agents continue

### Final Output

```
🔧 [solve] Complete — {status} in {rounds} rounds by {agent}

## Problem
{problem}

## Solution
{solution description}
{verification output if --verify}

## Attempt History
| Round | Agent | Approach | Result |
|-------|-------|----------|--------|
| 1 | solver-1 | code structure analysis | partial — found symptom |
| 1 | solver-2 | data flow tracing | failed — wrong direction |
| 2 | solver-1 | adopted solver-3's insight | ✅ solved |

## Insights Collected
| # | Insight | Agent | Confidence |
|---|---------|-------|------------|
| 1 | {insight} | solver-3 | HIGH |

## Dead Ends
- {approach}: {why it failed} (solver-2, round 1)

## Per-Agent Stats
| Agent | Rounds | Attempts | Insights | Solved? |
|-------|--------|----------|----------|---------|
| solver-1 | 3/5 | 3 | 1 | ✅ |
| solver-2 | 3/5 | 2 | 0 | — |
| solver-3 | 2/5 | 2 | 1 | — |
```

The leader appends a `## Self-Score` block per the Self-Score Protocol defined in x-op SKILL.md (rubric: `general`). Format: table with criterion, score (1-10), note per row, plus weighted overall.

### Comparison: x-agent solve vs x-op hypothesis

| Dimension | x-op hypothesis | x-agent solve |
|-----------|----------------|---------------|
| Hypothesis generation | Fan-out, leader collects | Agents try independently |
| Falsification | Leader assigns to agents | Agents self-verify each round |
| Learning from failure | Not shared between agents | Board accumulates failed attempts — no repeats |
| Direction change | Not possible mid-phase | Agents adopt/abandon based on board |
| Early termination | Only if all falsified | Any agent posts "solved" → all stop |
| Code changes | Read-only analysis | Agents can make changes to solve |
| Best for | Understanding "why" | Actually fixing the problem |

---

## Autonomous: consensus

**Agents independently form positions, read peers' arguments on the board, and revise their stance each round until convergence or budget exhaustion.**

Unlike x-op `council` (leader mediates all communication, proposes consensus, calls vote), consensus agents reason independently — they read the board, decide whether to change their position, and post their updated stance with rationale. The leader only detects convergence.

### Parsing

From `$ARGUMENTS`:
- After `consensus` = topic/question to reach consensus on
- `--agents N` = number of agents (default 4)
- `--model sonnet|opus|haiku` = model (default sonnet)
- `--budget N` = max rounds per agent (default 4)
- `--perspectives "p1,p2,p3"` = assign starting perspectives (optional)

### Core Mechanism: Position-Revise Loop

Each round, agents read all positions on the board, reason about them, and post their (possibly revised) position. Convergence emerges naturally when positions stabilize.

```
BOARD: .xm/consensus/{run-id}/board.jsonl

Each line is one entry:
  {"type":"position","agent":"voice-1","round":1,"stance":"...","rationale":"...","confidence":8}
  {"type":"position","agent":"voice-2","round":1,"stance":"...","rationale":"...","confidence":6}
  {"type":"revision","agent":"voice-1","round":2,"prev_stance":"...","new_stance":"...","reason":"persuaded by voice-2's argument about...","confidence":7}
  {"type":"challenge","agent":"voice-3","round":2,"target":"voice-1","question":"What about the case where...?"}
  {"type":"concede","agent":"voice-2","round":3,"point":"...","to":"voice-3","reason":"..."}
```

```
┌─ voice-1 ──────────────────────────────────────┐
│                                                 │
│  while budget > 0:                              │
│    1. READ BOARD — all current positions        │
│    2. REASON     — evaluate each peer's argument│
│       - Which arguments are strongest?          │
│       - Do any contradict my position?          │
│       - Has anyone raised a point I missed?     │
│    3. DECIDE     — change position or hold?     │
│       - HOLD: post same stance + rebuttal       │
│       - REVISE: post new stance + reason        │
│       - CONCEDE: acknowledge a peer's point     │
│       - CHALLENGE: question a peer's argument   │
│    4. POST       — write to board               │
│    5. CHECK      — has the board converged?     │
│       if all positions aligned: STOP            │
│    budget -= 1                                  │
│                                                 │
│  FINAL POSITION — stance + confidence           │
└─────────────────────────────────────────────────┘
```

### Board Protocol

**Position** (initial or reaffirmed stance):
```json
{"type":"position","agent":"voice-N","round":R,"stance":"concise position","rationale":"why I believe this","confidence":1-10}
```

**Revision** (changed mind):
```json
{"type":"revision","agent":"voice-N","round":R,"prev_stance":"old","new_stance":"new","reason":"what changed my mind","confidence":1-10}
```

**Challenge** (question for a peer):
```json
{"type":"challenge","agent":"voice-N","round":R,"target":"voice-M","question":"specific question about their argument"}
```

**Concede** (acknowledge a peer's point):
```json
{"type":"concede","agent":"voice-N","round":R,"point":"what I concede","to":"voice-M","reason":"why they're right on this"}
```

### Execution

**Step 0: Create board**

```bash
RUN_ID="consensus-$(date +%Y%m%d-%H%M%S)"
mkdir -p .xm/consensus/$RUN_ID
touch .xm/consensus/$RUN_ID/board.jsonl
```

**Step 1: Launch agents with staggered start**

Round 1 is staggered so agents post initial positions sequentially (each agent sees more prior positions):

```
Agent 1: immediate — posts first position (no prior context)
Agent 2: sleep 8 — reads agent-1's position before forming own
Agent 3: sleep 16 — reads agent-1 and agent-2 before forming own
Agent 4: sleep 24 — reads all prior positions
```

This creates a richer initial board than simultaneous posting.

**Step 2: Wait for all agents to complete**

Agents stop when: budget exhausted, or they detect convergence (all recent positions aligned).

**Step 3: Leader convergence analysis**

The leader reads the final board and determines the outcome.

### Consensus Agent Prompt

```
## Autonomous Consensus: {TOPIC}
{perspective hint if --perspectives provided}

You are voice-{N}, one of {total} independent thinkers.
{if perspective: "Your assigned starting perspective: {perspective}"}

### Board
BOARD FILE: {board_path}

- READ: Bash("cat {board_path}")
- POST position: Bash("echo '{json}' >> {board_path}")
- POST revision/challenge/concede: Bash("echo '{json}' >> {board_path}")

### Deliberation Loop

{if stagger: "First: Bash(\"sleep {delay}\") to let earlier voices post."}

Run up to {budget} rounds. Each round:

1. **READ BOARD** — Read all positions and exchanges
   - Who holds what position? What's their rationale?
   - Any challenges directed at you? Any concessions?
   - What's the overall trend — converging or diverging?

2. **REASON** — Independently evaluate the arguments
   - Consider each peer's strongest argument
   - Look for: logical gaps in your own position, evidence you hadn't considered, assumptions you're making
   - Be genuinely open to changing your mind — but only for good reasons

3. **DECIDE** — What to post this round
   Choose ONE primary action:
   - **HOLD** — Reaffirm your position (post "position" with updated rationale addressing peer arguments)
   - **REVISE** — Change your position (post "revision" explaining what convinced you)
   - **CHALLENGE** — Question a specific peer's argument (post "challenge")
   - **CONCEDE** — Acknowledge a peer is right on a specific point (post "concede")
   You may combine: e.g., concede one point while holding your overall position.

4. **POST** — Write your action to the board
   - Always include your confidence level (1-10)
   - If revising: clearly state what changed your mind
   - If holding: address the strongest counter-argument

5. **CHECK CONVERGENCE** — Are all recent positions aligned?
   - If the last position from each agent agrees on the core question: STOP
   - If positions are narrowing but not yet aligned: CONTINUE
   - If deadlocked (same positions repeated 2+ rounds): STOP and report deadlock

### Rules
- Change your mind ONLY when presented with a genuinely stronger argument
- Do NOT change just to reach consensus faster — intellectual honesty matters
- Address challenges directed at you — ignoring them weakens your position
- Your confidence score should reflect your actual uncertainty, not strategy

### Final Report

## Final Position
{your final stance + confidence}

## Position Evolution
| Round | Stance | Confidence | Action |
|-------|--------|------------|--------|
| 1 | ... | 7 | initial position |
| 2 | ... | 6 | revised (persuaded by voice-2) |
| 3 | ... | 8 | held (addressed voice-3's challenge) |

## Key Moments
- (which arguments changed your thinking)
- (which challenges strengthened your position)

## Convergence Assessment
- CONVERGED / NARROWED / DEADLOCKED
```

### Leader Convergence Detection

After all agents complete, the leader reads the board and determines:

| Outcome | Criteria | Action |
|---------|----------|--------|
| **FULL CONSENSUS** | All agents' final positions agree on the core question | Report consensus statement |
| **STRONG CONSENSUS** | ≥75% of agents agree, minority conceded key points | Report majority view + minority reservation |
| **PARTIAL CONSENSUS** | Agents agree on sub-points but not the core question | Report areas of agreement + remaining contentions |
| **NO CONSENSUS** | Positions remained fixed or oscillated | Report the positions and why they diverged |

### Final Output

```
🤝 [consensus] {outcome} — {N} agents, {R} rounds

## Topic
{topic}

## Consensus Statement
{if FULL/STRONG: the agreed position}
{if PARTIAL: areas of agreement + contentions}
{if NO CONSENSUS: summary of positions}

## Position Map
| Agent | Round 1 | Final | Changed? | Confidence |
|-------|---------|-------|----------|------------|
| voice-1 | JWT | JWT | NO | 9 |
| voice-2 | Session | JWT | YES (R2) | 7 |
| voice-3 | API Key | Session | YES (R1) | 5 |
| voice-4 | JWT | JWT | NO | 8 |

## Deliberation Highlights
- Round 1: 3 positions (JWT, Session, API Key)
- Round 2: voice-2 revised to JWT after voice-1's stateless argument
- Round 3: voice-3 narrowed to Session, conceded API Key too limited

## Key Arguments That Moved Positions
| Argument | By | Convinced | Round |
|----------|-----|-----------|-------|
| "Stateless = horizontal scale" | voice-1 | voice-2 | 2 |
| "API Key insufficient for user auth" | voice-2 | voice-3 | 1 |

## Per-Agent Stats
| Agent | Rounds | Revisions | Challenges Made | Challenges Received | Final Confidence |
|-------|--------|-----------|-----------------|--------------------|-----------------| 
| voice-1 | 3/4 | 0 | 1 | 1 | 9 |
| voice-2 | 4/4 | 1 | 0 | 0 | 7 |
| voice-3 | 4/4 | 1 | 1 | 1 | 5 |
| voice-4 | 3/4 | 0 | 0 | 1 | 8 |
```

The leader appends a `## Self-Score` block per the Self-Score Protocol defined in x-op SKILL.md (rubric: `general`). Format: table with criterion, score (1-10), note per row, plus weighted overall.

### Comparison: x-agent consensus vs x-op council

| Dimension | x-op council | x-agent consensus |
|-----------|-------------|-------------------|
| Communication | Leader relays A's position to B (excluding A's own) | Agents read all positions directly on board |
| Position change | Leader detects and reports | Agents self-declare revisions with rationale |
| Consensus proposal | Leader drafts → agents vote AGREE/OBJECT | Emergent — agents converge naturally or don't |
| Weighted voting | Leader assigns weights to roles | None — all voices equal (arguments win, not authority) |
| Challenge/rebuttal | Not structured | Explicit challenge/concede entries on board |
| Round structure | Fixed (opening → cross-examine → deep dive → converge) | Flexible — agents decide what to post each round |
| Best for | Structured deliberation with role-based authority | Organic debate where the best argument wins |

---

## Autonomous: swarm

**Agents self-organize around a shared goal using a task board — claiming work, executing, posting results, and spawning new subtasks they discover along the way.**

Unlike x-op `distribute` (leader splits tasks upfront and assigns), swarm agents read the board, pick their own work, and add tasks they discover during execution. The leader only manages the board (no task assignment) and synthesizes the final result.

### Parsing

From `$ARGUMENTS`:
- After `swarm` = goal description
- `--agents N` = number of agents (default 3)
- `--model sonnet|opus|haiku` = model (default sonnet)
- `--budget N` = max rounds per agent (default 10)
- `--seed "task1, task2, task3"` = initial task list (optional — leader auto-generates if absent)

### Core Mechanism: Task Board Stigmergy

Agents share a JSONL task board. Each agent reads the board, claims an open task, executes it, posts the result, and optionally adds new tasks discovered during execution.

```
BOARD: .xm/swarm/{run-id}/board.jsonl

Each line is one entry:
  {"type":"task","id":1,"desc":"...","status":"open"}
  {"type":"claim","id":1,"agent":"swarm-1","ts":"..."}
  {"type":"result","id":1,"agent":"swarm-1","output":"...","new_tasks":["desc1","desc2"]}
  {"type":"task","id":4,"desc":"...","status":"open","added_by":"swarm-1"}
  {"type":"goal_check","progress":"62%→71%","remaining":3}
```

```
┌─ swarm-1 ──────────────────────────────────────┐
│                                                 │
│  while budget > 0:                              │
│    1. READ BOARD — find open (unclaimed) tasks  │
│    2. CLAIM     — write claim entry to board    │
│    3. EXECUTE   — do the work                   │
│    4. POST      — write result + new tasks      │
│    5. CHECK GOAL — is the overall goal met?     │
│       if goal met: STOP                         │
│    budget -= 1                                  │
│                                                 │
│  REPORT — tasks completed, tasks added          │
└─────────────────────────────────────────────────┘
```

### Board Protocol

**Task entry** (leader or agent creates):
```json
{"type":"task","id":N,"desc":"description","status":"open","added_by":"leader|swarm-N"}
```

**Claim** (agent claims a task — prevents double-work):
```json
{"type":"claim","id":N,"agent":"swarm-N","ts":"ISO timestamp"}
```

**Result** (agent posts completion):
```json
{"type":"result","id":N,"agent":"swarm-N","status":"done|failed","output":"summary","new_tasks":["desc1","desc2"]}
```

**Conflict resolution**: If two agents claim the same task (race condition), the agent that reads the board and sees another's claim first should release and pick a different task. In practice, with sleep staggering this is rare.

### Execution

**Step 0: Create board and seed tasks**

```bash
RUN_ID="swarm-$(date +%Y%m%d-%H%M%S)"
mkdir -p .xm/swarm/$RUN_ID
```

If `--seed` provided, leader writes initial tasks:
```bash
echo '{"type":"task","id":1,"desc":"task 1","status":"open","added_by":"leader"}' >> board.jsonl
echo '{"type":"task","id":2,"desc":"task 2","status":"open","added_by":"leader"}' >> board.jsonl
```

If `--seed` absent, leader analyzes the goal and auto-generates 3-6 initial tasks.

**Step 1: Launch agents with staggered start**

To reduce claim conflicts, agents start with slight delays:

```
Agent 1: { prompt: "...", run_in_background: true }  — immediate
Agent 2: { prompt: "... sleep 3 first ...", run_in_background: true }  — 3s delay
Agent 3: { prompt: "... sleep 6 first ...", run_in_background: true }  — 6s delay
```

**Step 2: Wait for all agents to complete**

Agents stop when: budget exhausted, no open tasks remain, or goal is met.

**Step 3: Leader synthesize**

Read the board, collect all results, verify goal completion.

### Swarm Agent Prompt

```
## Swarm Worker: {GOAL}

You are swarm-{N}, one of {total} autonomous workers.
Your goal: {GOAL}

### Board
BOARD FILE: {absolute_path_to_board.jsonl}

- READ board: Bash("cat {board_path}")
- CLAIM a task: Bash("echo '{\"type\":\"claim\",\"id\":ID,\"agent\":\"swarm-{N}\",\"ts\":\"TIMESTAMP\"}' >> {board_path}")
- POST result: Bash("echo '{\"type\":\"result\",\"id\":ID,\"agent\":\"swarm-{N}\",\"status\":\"done\",\"output\":\"SUMMARY\",\"new_tasks\":[]}' >> {board_path}")
- ADD new task: Bash("echo '{\"type\":\"task\",\"id\":NEW_ID,\"desc\":\"...\",\"status\":\"open\",\"added_by\":\"swarm-{N}\"}' >> {board_path}")

### Work Loop

{if stagger: "First: Bash(\"sleep {delay}\") to stagger start."}

Run up to {budget} rounds. Each round:

1. **READ BOARD** — Bash("cat {board_path}")
   - Parse entries to find: open tasks (no claim), completed tasks, peer results
   - If a peer's result revealed new information, factor it into your next task choice

2. **PICK TASK** — Choose an open task (no claim entry exists for it)
   - Prefer tasks that build on completed work (check results)
   - If no open tasks remain: STOP
   - If a task seems blocked by an incomplete task: skip it, pick another

3. **CLAIM** — Write claim entry to board BEFORE starting work
   - This tells other agents "I'm working on this, pick something else"

4. **VERIFY CLAIM** — Re-read board to check for duplicate claims
   - Bash("cat {board_path}") and check if another agent also claimed the same task ID
   - If duplicate: the agent with the higher number (e.g., swarm-3 > swarm-1) releases and picks another task
   - If no duplicate: proceed to execute

5. **EXECUTE** — Do the actual work
   - Use Read, Edit, Write, Bash, Grep, Glob as needed
   - Stay focused on the claimed task — don't scope-creep

6. **POST RESULT** — Write result entry to board
   - Include a 1-2 line output summary
   - If you discovered subtasks during execution, add them as new task entries
   - Use agent-scoped IDs: `swarm-{N}-{round}` (e.g., `swarm-1-3`) to avoid ID collisions

7. **CHECK GOAL** — Is the overall goal met?
   - Read board: are all tasks done? Is the goal achievable with current progress?
   - If goal is clearly met: STOP early
   - If more work needed: continue to next round

### Final Report

## Tasks Completed
| # | Task | Status | New Tasks Added |
|---|------|--------|----------------|

## Summary
- Tasks completed: N
- Tasks added: M
- Rounds used: R/{budget}
- Goal progress: assessment
```

### Goal Completion Detection

The leader checks goal completion after all agents finish:

1. Read the full board
2. Count: total tasks, completed tasks, failed tasks, still open
3. If goal has a measurable target (e.g., "80% coverage"):
   - Run verification command
   - Compare against target
4. If goal is qualitative:
   - Synthesize all results
   - Assess whether the goal is met

### Final Output

```
🐝 [swarm] Complete — {N} agents, {T} tasks ({C} done, {F} failed, {O} open)

## Goal
{goal}

## Goal Status: {MET | PARTIAL | NOT MET}
{verification evidence}

## Task Board Summary
| ID | Task | Status | Agent | New Tasks |
|----|------|--------|-------|-----------|
| 1 | {desc} | ✅ done | swarm-1 | +2 tasks |
| 2 | {desc} | ✅ done | swarm-2 | — |
| 3 | {desc} | ✅ done | swarm-3 | +1 task |
| 4 | {desc} (added by swarm-1) | ✅ done | swarm-2 | — |

## Discovery Chain
{How tasks spawned new tasks}
- Task 1 → swarm-1 discovered tasks 4, 5
- Task 3 → swarm-3 discovered task 6
- Total: {seed} seed tasks → {final} total tasks ({added} discovered during execution)

## Per-Agent Stats
| Agent | Tasks Done | Tasks Added | Rounds | Idle Rounds |
|-------|-----------|-------------|--------|-------------|
| swarm-1 | 3 | 2 | 8/10 | 0 |
| swarm-2 | 2 | 0 | 7/10 (early stop) | 1 |
| swarm-3 | 2 | 1 | 6/10 (early stop) | 0 |
```

The leader appends a `## Self-Score` block per the Self-Score Protocol defined in x-op SKILL.md (rubric: `plan-quality` — swarm generates/decomposes tasks, making plan-quality criteria more appropriate than general). Format: table with criterion, score (1-10), note per row, plus weighted overall.

### Comparison: x-agent swarm vs x-op distribute

| Dimension | x-op distribute | x-agent swarm |
|-----------|----------------|---------------|
| Task assignment | Leader splits and assigns upfront | Agents self-select from board |
| New task discovery | Not possible — fixed task list | Agents add tasks during execution |
| Load balancing | Static (leader decides) | Dynamic (fast agents pick more tasks) |
| Failure handling | Leader must reassign | Other agents see "failed" and can retry |
| Goal awareness | None — just merge results | Agents check goal each round, stop when met |
| Best for | Known, parallelizable subtasks | Emergent work where you discover tasks as you go |

---

## Trace Recording

session_start and session_end are **automatic** — recorded by `.claude/hooks/trace-session.mjs` on Skill tool invocation. No manual action needed.

### Per agent call (SHOULD — best-effort)
Read session ID from `.xm/traces/.active`, then record agent_step after each agent completes.

### Rules
1. session_start/session_end — **automatic** via hook, do not emit manually
2. agent_step — **best-effort**, record when possible
3. **Metadata only** — never include output content in trace entries
4. If trace write fails, continue — never block execution

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll do this sequentially, parallelism is overhead" | For N independent tasks, sequential is N× time. Parallelism overhead is fixed; serialization cost is linear in N. Measure before assuming. |
| "This is too small to delegate" | Delegation isn't about task size — it's about context isolation. Small tasks that stuff the main context window cost more than a subagent run. |
| "Delegating costs tokens" | Not delegating costs context window, which costs the entire session. Subagent tokens are cheap; a polluted main context is expensive and unrecoverable. |
| "I'll just stuff the files into my context" | Context stuffing is how sessions degrade. Delegate the reading, keep the reasoning. The main agent should hold judgment, not raw data. |
| "Broadcast is for research, not real work" | Broadcast is for anything where multiple independent perspectives help. If three agents looking at the same thing would help, it's a broadcast. |
| "Swarm is overkill for this" | Swarm is for 5+ genuinely independent exploration paths. If you have 5+, it's not overkill — it's the right primitive. |
| "Fan-out results are hard to merge" | The fan-out primitive returns structured results so merging is part of the contract. If you're hand-merging, you're using it wrong. |
