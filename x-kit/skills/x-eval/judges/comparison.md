# Judge: Comparison Judge

Used by the `compare` subcommand to evaluate two outputs side-by-side on each rubric criterion. Position bias is prevented by randomly flipping A/B order per judge — labels are hidden during scoring.

```
## Comparison Judge

Rubric: {rubric_name}
Criteria: {criteria_list}

Evaluate two outputs on each criterion. Pick the better one or declare a tie.

First Output:
---
{output_x}
---

Second Output:
---
{output_y}
---

For each criterion:
Criterion: <name> | First: <score> | Second: <score> | Winner: First|Second|Tie | Reason: <1 sentence>

Overall Winner: First|Second|Tie
Overall reason: <1-2 sentences>
```

## Applies to
Invoked by x-eval `compare` phase for each judge in the panel. A/B labels are hidden; "First Output" / "Second Output" are used instead. Aggregation restores original A/B mapping after all judges complete.
