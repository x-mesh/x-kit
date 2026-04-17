# SKILL.md Audit

Status of every `SKILL.md` in the repo against the length budget and required-sections rules in `CLAUDE.md`.

Last updated: 2026-04-17 (post-x-kit split)

---

## Length budget compliance

**Hard limit:** 500 lines per `SKILL.md`. Anything over needs reference material split to sibling sub-directories (`references/`, `commands/`, `strategies/`, `lenses/`, `judges/`, `subcommands/`, `sessions/`, `autonomous/`).

| Status | Count |
|--------|-------|
| ✅ Under budget | 14 |
| 🔴 Over budget | 0 |

### Current lines (source files)

Phase 3 decomposition sweep complete (2026-04-17). **All 14 SKILL.md files under the 500-line cap.**

| Lines | Plugin | Status |
|-------|--------|--------|
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
| 159 | `x-kit/skills/x-kit/SKILL.md` | ✅ OK (was 915 — split to commands/ + references/) |
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

### Tier 1 — none

All 14 plugin skills are under budget. No urgent splits required.

### Tier 2 — sub-file hygiene (optional, low priority)

These references don't hit the 500-line policy (it applies to SKILL.md only) but could be split if they grow further:

- `x-build/references/workflow-guide.md` (654 lines) — could split into `phases.md` + `data-model.md` + `consensus-agents.md` if it becomes hard to navigate
- `x-solver/commands/solve.md` (488 lines) — borderline; consider per-strategy split (`decompose.md`, `iterate.md`, `constrain.md`, `pipeline.md`) if strategy branches grow

### Regression guard

Re-run this audit whenever:
- A SKILL.md gains a new major section (>50 lines)
- A new plugin is added to the marketplace
- `release bump --minor` is invoked for any SKILL.md-carrying plugin

Command:
```bash
wc -l x-*/skills/*/SKILL.md x-kit/skills/*/SKILL.md | sort -rn
```
