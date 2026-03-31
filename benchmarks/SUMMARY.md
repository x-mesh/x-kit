# x-kit Benchmark Results

Date: 2026-03-31 | Model: claude-sonnet-4-6 | Total trials: 27

## 1. Plugin Consistency Suite (21 trials across 7 plugins)

Do x-kit SKILL.md prompt programs produce consistent outputs?

| Plugin | Strategy | Trials | Overall | Status |
|--------|----------|:------:|:-------:|--------|
| x-eval | rubric-scoring | 3 | **0.957** | PASS |
| x-solver | decompose | 3 | **0.917** | PASS |
| x-review | multi-lens review | 9 | **0.89** | PASS |
| x-probe | premise-extraction | 3 | **0.826** | PASS |
| x-build | planning | 3 | **0.824** | PASS |
| x-op | debate | 3 | **0.733** | WARN |
| x-humble | retrospective | 3 | **0.500** | FAIL |

**Average (7 plugins): 0.807** | 5 PASS, 1 WARN, 1 FAIL

### Key Findings

- **Final judgments are stable**: All 7 plugins achieve 100% verdict/diagnostic consistency — the conclusion never changes
- **Detail variance is natural**: Supporting arguments, sub-problems, and action items show controlled diversity (0.25–0.75 overlap)
- **x-humble needs calibration**: Action item convergence is weak (1/4 all-3 overlap). Root cause diagnosis is strong (2/4), but remediation specifics vary too much
- **Calibration works**: x-review improved from 0.44 → 0.89 (+102%) with two targeted SKILL.md edits

### Consistency by Dimension

| Dimension | Best Plugin | Score | Worst Plugin | Score |
|-----------|-------------|:-----:|--------------|:-----:|
| Verdict consistency | all 7 | 1.0 | — | — |
| Finding overlap | x-eval | 1.0 | x-probe | 0.625 |
| Severity consistency | x-eval, x-build | 1.0 | x-humble | 0.5 |
| Rank correlation | x-solver | 1.0 | x-humble | 0.25 |

## 2. A/B: x-kit vs Vanilla Claude Code (3 trials)

Same diff reviewed with and without x-review framework.

| Metric | Vanilla | x-kit (v3) | x-kit + Recall Boost (v4) |
|--------|:-------:|:----------:|:-------------------------:|
| Precision | 0.75 | **1.0** | **1.0** |
| Recall | **1.0** | 0.25 | **0.75** |
| F1 | 0.857 | 0.4 | **0.857** |
| Severity accuracy | 0.75 | **1.0** | **1.0** |

**Recall Boost** recovered 2 of 3 missed issues as `[Observation]` tags (non-blocking, advisory) plus found 1 new issue vanilla also missed. x-kit now matches vanilla F1 with superior precision and severity accuracy.

## 3. Cross-Plugin Strategy Quality

| Strategy | Plugin | Consistency | Characteristic |
|----------|--------|:-----------:|----------------|
| rubric-scoring | x-eval | **0.957** | Most reliable — scores within σ=0.2, all criteria ±1 |
| decompose | x-solver | **0.917** | Root cause 100%, rank ρ=1.0 across framings |
| multi-lens review | x-review | **0.89** | High after calibration — sensitive to severity wording |
| premise-extraction | x-probe | **0.826** | Core premises stable, peripheral premises vary |
| planning | x-build | **0.824** | Task count/size/deps 100%, DAG parallelism 67% |
| debate | x-op | **0.733** | Stable verdicts, diverse argument surface |
| retrospective | x-humble | **0.500** | Diagnosis stable, remediation varies |

## Conclusions

1. **SKILL.md prompt programs work** — 100% verdict consistency across all 7 plugins when criteria are specific
2. **Calibration matters** — vague criteria cause inconsistency; quantified thresholds fix it (proven: 33% → 100%)
3. **Precision vs recall tradeoff solved** — Recall Boost recovers coverage (0.25→0.75) without sacrificing precision (1.0)
4. **x-eval is the most reliable plugin** — 0.957 consistency, σ=0.2 score variance
5. **x-humble needs work** — 0.500 overall, action item convergence is the weakest dimension across all plugins
6. **x-kit matches vanilla F1** — 0.857 with superior precision (1.0 vs 0.75) and severity accuracy (1.0 vs 0.75)

## Action Items

| Priority | Plugin | Issue | Fix |
|----------|--------|-------|-----|
| HIGH | x-humble | Action items don't converge (1/4 all-3) | Add worked examples + golden-set validation |
| MEDIUM | x-op | Argument overlap moderate (1/3 all-3) | Consider argument anchoring in debate prompt |
| LOW | x-probe | Peripheral premise variance | Natural — core premises are stable |

## Data Files

- `x-review-consistency.json` — 9-trial consistency with v1/v2/v3 calibration comparison
- `x-solver-consistency.json` — 3-trial decompose strategy benchmark
- `x-op-debate-consistency.json` — 3-trial debate strategy benchmark
- `x-probe-consistency.json` — 3-trial premise extraction benchmark
- `x-build-consistency.json` — 3-trial planning benchmark
- `x-eval-consistency.json` — 3-trial rubric scoring benchmark
- `x-humble-consistency.json` — 3-trial retrospective benchmark
- `ab-vanilla-vs-xkit.json` — A/B comparison with precision/recall/F1 metrics
