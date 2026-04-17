# Other x-build Commands

Reference for commands beyond Discuss/Plan: research, plan-check, next, handoff, context-usage, verify-coverage.

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

## Context-Usage Command (Token Budget)

Monitor how much context your project artifacts consume:

```bash
$XMB context-usage
```

Shows per-file token estimates. Warns at >35% and >75% of context window.
Recommends `handoff` when usage is high.

## Verify-Coverage Command

Check that every requirement in REQUIREMENTS.md has a matching task:

```bash
$XMB verify-coverage
```

Requirements must use format: `- [R1] Description` or `- [REQ-1] Description`.
Tasks match if they contain the requirement ID in their name.

## Applies to

Used by x-build routing (natural-language mapping + direct command dispatch).
