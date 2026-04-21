# Storage Layout Reference

File system layout for x-eval outputs, result schemas, and rubric definitions stored under `.xm/eval/`.

## Storage Layout

```
.xm/eval/
├── rubrics/               # Custom rubric definitions
│   └── <name>.json
├── results/               # Score and compare results
│   ├── {timestamp}-score.json
│   └── {timestamp}-compare.json
├── benchmarks/            # Benchmark results
│   └── {timestamp}-bench.json
└── diffs/                 # Diff analysis results
    └── {timestamp}-diff.json
```

### Result Schema (score)

```json
{
  "type": "score",
  "timestamp": "ISO8601",
  "rubric": "code-quality",
  "judges": 3,
  "scores": {
    "correctness": [9, 8, 9],
    "readability": [7, 8, 7]
  },
  "averages": { "correctness": 8.7, "readability": 7.3 },
  "overall": 7.8,
  "sigma": 0.6,
  "pass_threshold": 7.5,
  "passed": true,
  "na_criteria": ["security"],
  "assertion_results": [
    { "assertion": "function handles head=None", "result": "PASS",      "confidence": "3/3" },
    { "assertion": "no global mutable state",    "result": "HARD_FAIL", "confidence": "0/3" }
  ],
  "content_preview": "function add(a,b)...",
  "judge_rationales": [
    {
      "judge": "judge-1 (standard)",
      "per_criterion": { "correctness": "Handles edge cases; tested with negatives.", "readability": "..." },
      "overall_reasoning": "Solid implementation; minor naming concerns."
    }
  ]
}
```

- `pass_threshold` — copied from rubric at evaluation time (allows rubric tuning without invalidating old results).
- `passed` — `overall >= pass_threshold`. Used by `bench` for `pass_at_k` aggregation.
- `na_criteria` — list of criteria skipped by all judges due to insufficient context. Empty array when all criteria were scored. Consumers must not treat absence as implicit 0.
- `assertion_results` — present only when `--assert` flags were used. Each entry: `assertion` (text), `result` (`PASS` / `UNCERTAIN` / `HARD_FAIL`), `confidence` (judge agreement, e.g. `"2/3"`). A `HARD_FAIL` entry forces `passed = false`.
- `judge_rationales` — preserved for `report --sample-transcript` (article H: "누군가 트랜스크립트를 읽기 전에는 점수를 액면 그대로 믿지 말라"). Optional — skip when `eval.persist_transcripts: false`.

### Result Schema (compare)

```json
{
  "type": "compare",
  "timestamp": "ISO8601",
  "rubric": "general",
  "judges": 3,
  "winner": "B",
  "judge_votes": ["B", "B", "A"],
  "scores": { "A": 7.9, "B": 7.9 },
  "tiebreak": "accuracy",
  "content_previews": { "A": "...", "B": "..." }
}
```

### Rubric Schema

```json
{
  "name": "strict-code",
  "description": "Strict code evaluation",
  "criteria": ["correctness", "edge-cases", "complexity"],
  "weights": [0.5, 0.3, 0.2],
  "pass_threshold": 7.5,
  "created_at": "ISO8601"
}
```

- `pass_threshold` — optional, default **7.0**. Single trial is "pass" when `overall >= pass_threshold`. Used by `bench` pass@k / pass^k metrics. Built-in rubric thresholds: see `rubrics.md`.

### Result Schema (bench)

```json
{
  "type": "bench",
  "timestamp": "ISO8601",
  "task": "Find the bug in this code",
  "rubric": "general",
  "pass_threshold": 7.0,
  "strategies": [
    {
      "name": "debate",
      "trials": 3,
      "avg_score": 7.8,
      "sigma": 0.8,
      "pass_at_k": 2,
      "pass_hat_k": 0,
      "pass_at_k_rate": 0.67,
      "per_trial_overall": [8.2, 7.9, 5.4],
      "est_cost_usd": 0.08,
      "avg_time_sec": 30
    }
  ],
  "broken_task_warning": false,
  "recommendation": { "best_quality": "tournament", "best_value": "debate", "final": "tournament" }
}
```

- `pass_at_k` — count of trials with `overall >= pass_threshold`. Capability signal.
- `pass_hat_k` — 1 if all trials pass, else 0. Reliability signal.
- `pass_at_k_rate` — `pass_at_k / trials`. Normalized.
- `per_trial_overall` — per-trial weighted overall. Enables post-hoc re-scoring without re-running agents.
- `broken_task_warning` — true when ALL strategies have `pass_at_k_rate == 0` AND their `avg_score < 4.5` AND `trials >= 2`. Empirically validated false-alarm rate = 0% on merely-weak strategies.

### Result Schema (calibrate)

```json
{
  "type": "calibrate",
  "timestamp": "ISO8601",
  "rubric": "code-quality",
  "samples": 5,
  "criteria": {
    "correctness":     { "judge_avg": 8.2, "human_avg": 7.8, "bias_delta": 0.4,  "status": "slight" },
    "security":        { "judge_avg": 6.5, "human_avg": 8.1, "bias_delta": -1.6, "status": "systematic" }
  },
  "systematic_criteria": ["security"],
  "sample_ids": ["2026-04-21T11:00:00-score.json"]
}
```

- `bias_delta` — `judge_avg - human_avg`. Positive = inflation, negative = deflation.
- `status` — `"calibrated"` (|Δ| < 0.5), `"slight"` (0.5–0.9), `"systematic"` (≥ 1.0).
- `systematic_criteria` — list of criteria with `status == "systematic"`. Consumed by `report` to surface calibration warnings.
- Stored in `.xm/eval/calibrations/{timestamp}-calibrate.json`.

## Applies to

All subcommands that write output: `score`, `compare`, `bench`, `consistency`, `diff`, `calibrate`. The `report` subcommand reads from `results/`, `benchmarks/`, and `calibrations/`. Custom rubrics are read/written from `rubrics/`.
