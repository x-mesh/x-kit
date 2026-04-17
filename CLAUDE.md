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

See `references/finding-severity.md` — Critical/High/Medium/Low criteria and Finding Quality Standard (good/bad examples).

## Planning Principles (x-build)

x-build plan-phase agents must follow these principles.

### Universal Principles (apply to all plan activities)

1. **Decide what NOT to build first** — Scope is defined by exclusion. Every requirement added constrains every future one.
2. **Name the risk, then schedule it early** — Highest uncertainty goes first. Fail fast > fail late.
3. **A plan is a hypothesis, not a promise** — Design for adaptability: small tasks, clear boundaries, minimal cross-task deps.
4. **Intent over implementation** — PRD says WHAT/WHY. Tasks say WHAT to do. Neither prescribes HOW unless hard constraint.
5. **If you can't verify it, you can't ship it** — Every requirement needs success criteria. Every task needs done_criteria.
6. **Surface ambiguities before picking** — Multiple interpretations of the request? List them; never pick silently. The agent's job is to expose the fork, not choose for the user.
7. **Name low-confidence assumptions** — Assumptions at ≥ high confidence may stay implicit. Anything below must be written down (in PRD, plan, or AskUserQuestion) and validated before the next phase.
8. **Name the boundaries** — Every plan must declare agent autonomy explicitly. Section 13 of the PRD template (Always do / Ask first / Never do) is where these live. Empty boundaries = unbounded agent behavior = uncontrolled risk.

### PRD Quality — Good vs Bad

| Section | Good | Bad |
|---------|------|-----|
| Goal | One sentence, single focus | Multiple goals joined by "and" |
| Success Criteria | Measurable, binary pass/fail | "Should be fast and reliable" |
| Constraints | Non-negotiable hard limits | Preferences disguised as constraints |
| Risks | Likelihood + impact + mitigation | "Security risks" |
| Acceptance | Testable by command or state check | "Code is well-tested" |
| Boundaries | 3-tier with 2+ items per tier | Missing tiers or "TBD" |

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

## SKILL.md Authoring

### Language Rules

SKILL.md is a prompt for LLMs — write instructions in English for precision.

| Content type | Language |
|-------------|----------|
| Instructions, logic, rules, anti-patterns | **English only** |
| User-facing output examples (normal mode) | Korean OK |
| Term mapping tables (mode detection) | Korean OK |
| Section headers | English |
| Code examples | English |

**NEVER write instructions/rules in Korean.** Korean in SKILL.md is only for output templates shown to the user.

### Length Budget

**Hard limit: 500 lines per SKILL.md.** Longer files waste context on every invocation and get skimmed rather than read. If your skill exceeds 500 lines, split reference material into `docs/references/<plugin>-<topic>.md` and link from the main file. Current audit: `docs/skill-audit.md`.

### Required Sections

Every SKILL.md must include, in order: `Overview` → `When to Use` → `<Core Process>` → `Common Rationalizations` → `Red Flags` → `Verification`.

The **Common Rationalizations** table (excuses agents use to skip steps + factual rebuttals) is the single most impactful discipline mechanism — minimum 5 domain-specific rows. Without it, the skill has no defense against being partially applied.

### CLI Invocation Pattern (required when SKILL.md exposes a shell CLI)

If the skill references a plugin CLI (`node ${CLAUDE_PLUGIN_ROOT}/lib/<name>-cli.mjs ...`), the SKILL.md **MUST** instruct the agent to define a shell function before running commands, and explicitly forbid the variable-assignment anti-pattern.

**Required block** (adapt `xmXX` and path to the plugin):
```markdown
> **⚠ When using Bash tool, always define a shell function first:**
> ```bash
> xmXX() { node "${CLAUDE_PLUGIN_ROOT}/lib/<name>-cli.mjs" "$@"; }
> xmXX <command> <args>
> ```
> **Forbidden:** Assigning `XMXX="node ..."` then calling `$XMXX <command>` — zsh treats the entire quoted string as a single command name and fails with `no such file or directory`.
> Alternative: use the unified dispatcher `x-kit <subcmd> <command>` — no function needed.
```

**Why:** zsh expands `$VAR` as a single token. `XMS="node /path/cli.mjs"; $XMS foo` executes the file literally named `"node /path/cli.mjs"`, which does not exist. This is the #1 invocation failure LLMs repeat across sessions. Every SKILL.md referencing a CLI must teach the correct pattern.

**Exempt:** skills without a shell CLI (x-op, x-agent, x-review, x-eval, x-probe, x-humble, x-ship, x-trace, x-dashboard) — they orchestrate via the Agent tool only.

## Documentation

- `README.md` (English) and `README.ko.md` (Korean) must stay in sync
- When editing README.md, always update the corresponding section in README.ko.md
- `/x-release` Step 3.6 enforces this automatically

## Testing

```bash
bun test                    # run all tests
bun test test/core          # run specific test file
```

## Model Routing

Use the cheapest model that gets the job done. For commands that just execute a script and return output, haiku is sufficient and ~78% cheaper than sonnet.

### Routing Rules

| Task type | Model | Examples |
|-----------|-------|---------|
| **Display/query** — run command, return output | **haiku** | `config show/set/get`, `version`, `update`, `agents list/match`, `status`, `task list`, `trace show/list`, `memory list/search` |
| **Interactive wizard** — needs AskUserQuestion | **sonnet** | `config` (interactive), `init`, `setup`, auto-route confirmation, pipeline orchestration |
| **Reasoning** — analysis, planning, orchestration | **sonnet** (escalate to **opus** when budget allows) | `plan`, `forecast`, `run`, strategy execution, code review, problem solving |

### How to Apply

For haiku-eligible commands, delegate via Agent tool:
```
Agent tool: { model: "haiku", description: "x-kit: [command]", prompt: "Run: [bash command]" }
```

### Principle

> If the output is determined by a script (not by LLM reasoning), use haiku.
> The model is a messenger, not a thinker — pay messenger rates.

### Guardrail

Never route to haiku if the task involves: analysis, code generation, review, planning, evaluation, or multi-step orchestration. If detected, warn and escalate to sonnet. See `x-kit/skills/x-kit/SKILL.md` Model Guardrail for full rules.

### Cost-Aware Model Routing

Model selection follows a 3-level priority chain:

```
model_overrides → profile → fallback
```

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | `model_overrides` | Explicit per-role config — always wins |
| 2 | profile | `economy` / `default` / `max` setting (legacy `balanced`/`performance` auto-remapped) |
| 3 | fallback | Hard-coded safe defaults |

**Config keys:**

| Key | Description | Example |
|-----|-------------|---------|
| `budget.window_hours` | Rolling window for spend tracking (default: 24h) | `48` |
| `budget.projects` | Per-project budget caps | `{"my-project": {"max_usd": 2.0}}` |

Each `task_complete` event records `model`, `role`, `cost_usd`, `quality_score`, and a `correlation_id` (format: `ce-XXXXXXXX`) for observability. Adaptive learning was removed (Opus 4.7 era): it required multi-model samples per role to be meaningful, but single-profile routing rarely produces them — use `model_overrides` for deliberate per-role choices instead.

## Edit Policy

**NEVER edit files under `x-kit/skills/` directly.** That directory is the marketplace copy — a build artifact.

- Always edit the **source** SKILL.md in each plugin's own directory (e.g., `x-solver/skills/x-solver/SKILL.md`)
- The release process (`/x-release`) copies source → `x-kit/skills/`
- If you edit the marketplace copy, the change will be overwritten on next release and the source will remain stale

| Path | Role | Editable? |
|------|------|-----------|
| `x-solver/skills/x-solver/SKILL.md` | Source | **YES** |
| `x-kit/skills/x-solver/SKILL.md` | Marketplace copy | **NO** |

This applies to all plugins: x-build, x-op, x-probe, x-solver, x-eval, x-review, x-trace, x-memory, x-humble, x-ship, x-sync.

**Enforcement:** `.claude/hooks/block-marketplace-copy.mjs` is wired as a PreToolUse hook in `.claude/settings.json` and will deny any Edit/Write/MultiEdit/NotebookEdit targeting a marketplace copy. If you see a block, follow the source path in the error message and re-run `scripts/sync-bundle.sh` when done. The hook mirrors the protected set from `scripts/sync-bundle.sh`, so keep them in lockstep when adding new synced files.

## Lessons (x-humble)
<!-- Section managed by x-humble. Manual editing allowed. -->
- STOP: Editing `x-kit/skills/` SKILL.md files directly. Always edit source directory first. (L4, confirmed 2 times, 2026-04-08)
- START: Before editing any SKILL.md, verify the file path is in the source directory, not marketplace copy. (L5, confirmed 2 times, 2026-04-08)

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
