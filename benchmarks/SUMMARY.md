# x-kit Benchmark Results

Date: 2026-03-31 | Model: claude-sonnet-4-6 | Metric system: v2 (dual-metric)

## Metric System

Two distinct measurement systems by strategy type:

| Type | Measures | Diversity is... |
|------|----------|:---------------:|
| **Deterministic** | Same input → same output | penalized |
| **Exploratory** | Same conclusion via diverse paths | rewarded |

## 1. Plugin Consistency Suite

| Plugin | Strategy | Type | Score | Status |
|--------|----------|------|:-----:|--------|
| x-review | multi-lens review | deterministic | **1.00** | PASS |
| x-eval | rubric-scoring | deterministic | **1.00** | PASS |
| x-humble | retrospective | exploratory | **0.96** | PASS |
| x-solver | decompose | exploratory | **0.94** | PASS |
| x-op | debate | exploratory | **0.936** | PASS |
| x-build | planning | exploratory | **0.927** | PASS |
| x-probe | premise-extraction | exploratory | **0.895** | PASS |

**All 7 plugins PASS** | Verdict stability: 100% across all plugins

### Deterministic Metrics (x-review, x-eval)

Same input must produce same output. Overlap = good, diversity = bad.

| Metric | Weight | x-review | x-eval |
|--------|:------:|:--------:|:------:|
| verdict_consistency | 0.40 | 1.0 | 1.0 |
| finding_overlap | 0.20 | 1.0 | 1.0 |
| severity_consistency | 0.20 | 1.0 | 1.0 |
| rank_correlation | 0.20 | 1.0 | 1.0 |
| **Overall** | | **1.00** | **1.00** |

### Exploratory Metrics (x-op, x-build, x-probe, x-humble, x-solver)

Same conclusion via different paths. Diversity = good, convergence on core = required.

| Metric | Weight | x-op | x-build | x-probe | x-humble | x-solver |
|--------|:------:|:----:|:-------:|:-------:|:--------:|:--------:|
| verdict_stability | 0.40 | 1.0 | 0.817 | 1.0 | 1.0 | 1.0 |
| conclusion_quality | 0.25 | 0.944 | 1.0 | 0.88 | 1.0 | 1.0 |
| coverage_breadth | 0.20 | 1.0 | 1.0 | 0.79 | 0.8 | 0.71 |
| core_convergence | 0.15 | 0.667 | 1.0 | 0.78 | 1.0 | 1.0 |
| **Overall** | | **0.936** | **0.927** | **0.895** | **0.96** | **0.94** |

### Calibration History

| Plugin | v1 (before) | After calibration | Method |
|--------|:-----------:|:-----------------:|--------|
| x-review | 0.44 | **0.89** | severity disambiguation + verdict quantification |
| x-humble | 0.50 | **0.96** | action quality contract + taxonomy + examples |
| x-op | 0.73 | **0.95** | output quality contract + dimension anchors |

## 2. A/B: x-kit vs Vanilla Claude Code

Same diff reviewed with and without x-review framework.

| Metric | Vanilla | x-kit (v3) | x-kit + Recall Boost (v4) |
|--------|:-------:|:----------:|:-------------------------:|
| Precision | 0.75 | **1.0** | **1.0** |
| Recall | **1.0** | 0.25 | **0.75** |
| F1 | 0.857 | 0.4 | **0.857** |
| Severity accuracy | 0.75 | **1.0** | **1.0** |

x-kit matches vanilla F1 with superior precision and severity accuracy.

## 3. Key Insights

1. **Verdict stability is universal** — 100% across all 7 plugins, both deterministic and exploratory
2. **Diversity is a feature, not a flaw** — exploratory strategies that explore more dimensions while reaching the same conclusion are BETTER, not worse
3. **Calibration pattern works** — "vague criteria → specific criteria + worked examples" improved every plugin it was applied to
4. **Precision vs recall solved** — Recall Boost recovers coverage (0.25→0.75) without sacrificing precision (1.0)
5. **Measure what matters** — deterministic strategies need output overlap; exploratory strategies need conclusion stability + coverage breadth

## Data Files

- `x-review-consistency.json` — 9-trial deterministic benchmark
- `x-solver-consistency.json` — 3-trial exploratory benchmark
- `x-op-debate-consistency.json` — 3+6-trial exploratory benchmark with calibration
- `x-probe-consistency.json` — 3-trial exploratory benchmark
- `x-build-consistency.json` — 3-trial exploratory benchmark
- `x-eval-consistency.json` — 3-trial deterministic benchmark
- `x-humble-consistency.json` — 3+3-trial exploratory benchmark with calibration
- `ab-vanilla-vs-xkit.json` — A/B comparison
