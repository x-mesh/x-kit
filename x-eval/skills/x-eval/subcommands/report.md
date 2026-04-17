# Subcommand: report

Output a summary of evaluation results for the current or a specific session. Reads from `.xm/eval/results/` and `.xm/eval/benchmarks/`.

## Subcommand: report

**Output a summary of evaluation results for the current or a specific session.**

### Parsing

- `report` (no arguments) = all results from current session
- `report <session-id>` = specific session results
- `report --all` = full history

Reads and aggregates from both `.xm/eval/results/` and `.xm/eval/benchmarks/`.

### Output

```
📊 [eval] Evaluation Report (current session)

Scores (3):
  2026-03-25 14:30  code-quality  7.8/10   src/auth.ts
  2026-03-25 14:45  general       8.2/10   "refactoring proposal"
  2026-03-25 15:00  plan-quality  6.9/10   sprint plan v2

Comparisons (1):
  2026-03-25 15:20  general       Winner: B  "response style A vs B"

Benchmarks (1):
  2026-03-25 15:40  3 strategies  Best: tournament (8.5)  Rec: debate

Session avg score: 7.6/10
```

## Applies to
Invoked via `/x-eval report ...`. See Subcommand: list in SKILL.md for all available commands.
