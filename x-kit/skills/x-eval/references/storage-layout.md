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
  "content_preview": "function add(a,b)..."
}
```

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
  "created_at": "ISO8601"
}
```

## Applies to

All subcommands that write output: `score`, `compare`, `bench`, `consistency`, `diff`. The `report` subcommand reads from `results/` and `benchmarks/`. Custom rubrics are read/written from `rubrics/`.
