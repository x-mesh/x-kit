# Subcommand: diff

Compares two trace sessions and outputs the differences.

## Subcommand: diff

### Parsing

From `$ARGUMENTS`:
- Two words after `diff` = session name 1, session name 2

### Comparison metrics

Read JSONL from each session and aggregate the following metrics:

| Metric | Description |
|------|------|
| Duration | Total session duration (ms) |
| Tokens | Total token count (in + out) |
| Cost | Total estimated cost ($) |
| Agents | Number of agent calls |
| Failed | Number of failed agents |
| Steps | Total number of steps |

### Output

```
[trace] Diff: run-1 vs run-2

| Metric   | run-1  | run-2  | Delta   |
|----------|--------|--------|---------|
| Duration | 16s    | 22s    | +38%    |
| Tokens   | 13K    | 18K    | +38%    |
| Cost     | $0.04  | $0.06  | +50%    |
| Agents   | 4      | 6      | +2      |
| Failed   | 0      | 1      | +1      |
| Steps    | 3      | 4      | +1      |

Agent breakdown:
  run-1: security ✅, logic ✅, performance ✅, tests ✅
  run-2: security ✅, logic ✅, performance ✅, tests ❌, retry-tests ✅, synthesize ✅

Summary: run-2 took 38% longer with 1 failure and retry.
```

## Applies to
Invoked via `/x-trace diff <session1> <session2>`.
