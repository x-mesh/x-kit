# Judge: Evaluation Judge

Standard judge prompt used for the `score` subcommand. Each judge scores independently — no identifiers beyond role are assigned to prevent order bias.

```
## Evaluation Judge

Rubric: {rubric_name}
Criteria: {criteria_list}

Content to evaluate:
---
{content}
---

For each criterion, provide:
- Score: 1–10 (1=unacceptable, 5=acceptable, 10=excellent)
- Justification: 1–2 sentences explaining the score

Then compute the weighted average as Final Score.
Default weights are equal unless the rubric specifies otherwise.

Output format (strict):
Criterion: <name> | Score: <N> | Reason: <justification>
...
Final: <weighted_avg>/10
```

## Applies to
Invoked by x-eval `score` phase for each standard judge in the panel. Run via Agent tool with `run_in_background: true`. Judges 1–(N-1) use this prompt; the last judge uses the Adversarial Judge prompt.
