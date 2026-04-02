# x-kit

Claude Code plugin marketplace for structured multi-agent orchestration.

## Code Review Principles (x-review)

x-review agents must follow these principles when producing findings.

### Universal Principles (apply to all lenses)

1. **Context determines severity** — Same pattern varies by exposure scope, data sensitivity, call frequency. Ask: "Where does this run, with what data, how often?"
2. **No evidence, no finding** — Show "this code does X," not "this could do X." No traceable path in diff = not a finding.
3. **No fix direction, no finding** — If the Fix is "be careful," it is not actionable. Suggest a specific code change or don't report.
4. **Review only changed code** — Don't report pre-existing issues outside the diff. Exception: when a change worsens an existing problem.
5. **One finding, one problem** — Never bundle multiple issues into a single finding.
6. **When in doubt, downgrade** — Hesitating between severities? Choose lower. Over-reporting erodes trust faster than under-reporting.

### Per-Lens Principles

| Lens | Core Principles |
|------|----------------|
| security | Validate at trust boundaries only / Read as attacker — trace reachable paths / Recognize existing defense layers (ORM, framework escaping, auth middleware) |
| logic | Boundary + empty values cause 80% of bugs / Compare intent vs implementation in conditionals / Trace state mutation propagation |
| perf | Optimize only at measurable bottlenecks / I/O always trumps CPU / Show evidence, not speculation |
| tests | Verify behavior, not implementation / Riskier paths need tests more / False-confidence tests are worse than none |
| architecture | Blast radius = design quality measure / Abstractions only for current complexity (YAGNI) / Layers enforce dependency direction |
| docs | Code says "how," docs say "why" / Public API contracts must be explicit / False docs worse than no docs |
| errors | All failures must be visible / Recover or fail fast / Error info must be specific enough for caller to respond |

### Severity Calibration

| Severity | Criteria |
|----------|---------|
| Critical | Immediately exploitable security flaw, data loss/corruption, production outage |
| High | Feature defect, unhandled error path, severe perf degradation (10x+). No data loss. |
| Medium | Code quality issue, edge-case-only bug, incomplete test coverage |
| Low | Style, missing docs on internals, micro-optimization suggestions |

### Finding Quality Standard

Good finding: `[High] src/api.ts:42 — concrete description with traced path and context → Fix: specific code change`

Bad finding: `[Medium] src/api.ts:42 — vague description → Fix: fix it`

## Planning Principles (x-build)

x-build plan-phase agents must follow these principles.

### Universal Principles (apply to all plan activities)

1. **Decide what NOT to build first** — Scope is defined by exclusion. Every requirement added constrains every future one.
2. **Name the risk, then schedule it early** — Highest uncertainty goes first. Fail fast > fail late.
3. **A plan is a hypothesis, not a promise** — Design for adaptability: small tasks, clear boundaries, minimal cross-task deps.
4. **Intent over implementation** — PRD says WHAT/WHY. Tasks say WHAT to do. Neither prescribes HOW unless hard constraint.
5. **If you can't verify it, you can't ship it** — Every requirement needs success criteria. Every task needs done_criteria.

### PRD Quality — Good vs Bad

| Section | Good | Bad |
|---------|------|-----|
| Goal | One sentence, single focus | Multiple goals joined by "and" |
| Success Criteria | Measurable, binary pass/fail | "Should be fast and reliable" |
| Constraints | Non-negotiable hard limits | Preferences disguised as constraints |
| Risks | Likelihood + impact + mitigation | "Security risks" |
| Acceptance | Testable by command or state check | "Code is well-tested" |

### Consensus Agent Principles

| Agent | Core Principle |
|-------|---------------|
| architect | Simplest architecture that meets constraints wins |
| critic | The most dangerous assumption is the one nobody questioned |
| planner | If a task can't be one sentence starting with a verb, it's too big |
| security | Security requirements are constraints, not features |

### Critique Dimensions

| Dimension | Principle |
|-----------|-----------|
| Approach fitness | Simpler alternative exists → complex approach must justify itself |
| Risk ordering | Highest uncertainty first in schedule |
| Dependency structure | Maximize parallelism — no data dep = no declared dep |
| Missing tasks | Check every transition: setup→code→test→deploy |
| Done-criteria quality | Must be verifiable by command/state, not subjective |
| Scope creep | No R# traceability = scope creep |

## Documentation

- `README.md` (English) and `README.ko.md` (Korean) must stay in sync
- When editing README.md, always update the corresponding section in README.ko.md
- `/x-release` Step 3.6 enforces this automatically

## Testing

```bash
bun test                    # run all tests
bun test test/core          # run specific test file
```

## Project Structure

- `x-kit/` — core plugin (shared config, cost engine, DAG)
- `x-build/` — project lifecycle harness
- `x-op/` — strategy orchestration (18 strategies)
- `x-agent/` — agent primitives (fan-out, delegate, broadcast)
- `x-solver/` — structured problem solving
- `x-eval/` — output quality evaluation
- `x-review/` — code review orchestrator
- `x-trace/` — execution tracing
- `x-memory/` — cross-session decision memory
- `x-humble/` — structured retrospective
