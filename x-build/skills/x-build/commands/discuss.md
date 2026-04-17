# Discuss Command (Phase-Aware Deliberation)

The discuss command is a multi-mode deliberation engine that adapts to the current project phase.

When `discuss` is invoked:

1. Run: `$XMB discuss [--mode MODE] [--round N]`
2. Parse JSON output (`action: "discuss"`)
3. Check `mode` and `round` fields, then branch accordingly:

## Interview Mode (default, Research phase)

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

## Assumptions Mode (Research phase)

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

## Validate Mode (Research → Plan transition)

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

## Critique Mode (Plan phase)

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

## Adapt Mode (Execute phase, between steps)

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

## Saving discuss results

All modes save via the skill layer:
- **interview/assumptions**: `$XMB save context --content "..."` (updates CONTEXT.md)
- **validate**: Write JSON to `01-research/discuss-validate.json`
- **critique**: Write JSON to `02-plan/discuss-critique.json`
- **adapt**: Write JSON to `03-execute/discuss-adapt.json`

Use Bash to write JSON result files (atomic write):
```bash
echo '{"verdict":"pass",...}' > .xm/build/{project}/{phase-dir}/discuss-{mode}.json.tmp && mv .xm/build/{project}/{phase-dir}/discuss-{mode}.json.tmp .xm/build/{project}/{phase-dir}/discuss-{mode}.json
```

## Applies to

Invoked by the x-build leader during Research phase (interview, assumptions, validate), Plan phase (critique), and Execute phase (adapt). JSON output drives phase-specific behavior — always parse the `mode` and `verdict` fields to determine next action.
