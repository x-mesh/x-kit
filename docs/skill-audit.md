# SKILL.md Audit

Status of every `SKILL.md` in the repo against the length budget and required-sections rules in `CLAUDE.md`.

Last updated: 2026-04-17

---

## Length budget compliance

**Hard limit:** 500 lines per `SKILL.md`. Anything over needs reference material split to sibling sub-directories (`references/`, `commands/`, `strategies/`, `lenses/`, `judges/`, `subcommands/`, `sessions/`, `autonomous/`).

| Status | Count |
|--------|-------|
| ✅ Under budget | 13 |
| 🔴 Over budget | 1 |

### Current lines (source files)

Post-Phase 3 decomposition sweep (2026-04-17). All plugin skills except `x-kit` bundle meta are under the 500-line cap.

| Lines | Plugin | Status |
|-------|--------|--------|
| 915 | `x-kit/skills/x-kit/SKILL.md` | 🔴 **1.8x** over (bundle meta — aggregates all plugin commands) |
| 494 | `x-op/skills/x-op/SKILL.md` | ✅ OK |
| 491 | `x-agent/skills/x-agent/SKILL.md` | ✅ OK |
| 411 | `x-build/skills/x-build/SKILL.md` | ✅ OK |
| 350 | `x-memory/skills/x-memory/SKILL.md` | ✅ OK |
| 345 | `x-humble/skills/x-humble/SKILL.md` | ✅ OK |
| 336 | `x-solver/skills/x-solver/SKILL.md` | ✅ OK |
| 331 | `x-kit/skills/x-ship/SKILL.md` | ✅ OK |
| 319 | `x-trace/skills/x-trace/SKILL.md` | ✅ OK |
| 304 | `x-kit/skills/x-sync/SKILL.md` | ✅ OK |
| 277 | `x-review/skills/x-review/SKILL.md` | ✅ OK |
| 251 | `x-probe/skills/x-probe/SKILL.md` | ✅ OK |
| 238 | `x-eval/skills/x-eval/SKILL.md` | ✅ OK |
| 116 | `x-dashboard/skills/x-dashboard/SKILL.md` | ✅ OK |

---

## Common Rationalizations section coverage

Every SKILL.md must have a `## Common Rationalizations` section.

**Coverage: 14/14 (100%)** — all plugins compliant.

| Plugin | Rows | Focus |
|--------|:----:|-------|
| x-humble | 7 | retrospective decay, pattern recognition |
| x-probe | 7 | premise validation, inversion, self-evident trap |
| x-review | 7 | review discipline, severity, author blind spots |
| x-build | 7 | planning, done_criteria, scope, risk |
| x-solver | 7 | structured decomposition, iteration, constraints |
| x-eval | 7 | rubrics, N=1 eval, LLM-as-judge bias |
| x-op | 7 | strategy selection, --verify, compose |
| x-agent | 7 | parallelism, delegation, context isolation |
| x-trace | 6 | session boundaries, metadata-only, fail-open |
| x-memory | 7 | bloat vs recall, re-derivation, dedupe |
| x-kit | 7 | shared config, cost engine, DAG, model routing |
| x-ship | 6 | changelog, semver, squash, irreversibility |
| x-sync | 5 | pull-first, conflicts, drift |
| x-dashboard | 5 | cross-plugin vs plugin-scoped view |

---

## Sub-file inventory

Largest sub-files (non-SKILL.md) by line count. These don't fall under the 500-line cap but warrant attention if they become unwieldy.

| Lines | File | Notes |
|-------|------|-------|
| 654 | `x-build/skills/x-build/references/workflow-guide.md` | Largest reference; candidate for secondary split (phases / data-model / consensus-agents) |
| 494 | `x-agent/skills/x-agent/references/role-presets.md` | Per-primitive role presets |
| 488 | `x-solver/skills/x-solver/commands/solve.md` | 4 strategy branches; already borderline |
| 429 | `x-agent/skills/x-agent/TEAM.md` | Team mode dispatcher |
| 396 | `x-review/skills/x-review/references/review-workflow.md` | Phase 1-4 full pipeline |
| 365 | `x-probe/skills/x-probe/sessions/probe.md` | Premise + evidence + verdict |
| 257 | `x-humble/skills/x-humble/sessions/reflect.md` | Reflection walkthrough |

---

## Remaining work

### Tier 1 — x-kit bundle meta (915 lines)

`x-kit/skills/x-kit/SKILL.md` is the all-in-one bundle skill. It aggregates Model Routing, Pipeline Wiring, and cross-plugin command tables. Split candidates:

- `x-kit/skills/x-kit/references/model-routing.md` — haiku/sonnet/opus routing rules, profile/override resolution
- `x-kit/skills/x-kit/references/pipeline-wiring.md` — SKILL.md after/suggests contract + phased rollout
- `x-kit/skills/x-kit/references/command-catalog.md` — aggregated command lookup across plugins
- Keep in main: entry routing, delegation selector, Common Rationalizations

Estimated post-split: ~350-400 lines.

### Tier 2 — sub-file hygiene (optional)

`x-build/references/workflow-guide.md` at 654 lines could split into `phases.md` + `data-model.md` + `consensus-agents.md` if it ever becomes a bottleneck. Not urgent — references don't hit the 500-line policy.

`x-solver/commands/solve.md` at 488 lines is borderline; consider splitting per-strategy (`decompose.md`, `iterate.md`, `constrain.md`, `pipeline.md`) if the file grows further.
