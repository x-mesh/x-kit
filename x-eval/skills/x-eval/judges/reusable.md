# Judge: Reusable Judge Prompt

Standard prompt for inline reuse of x-eval scoring logic from other x-kit plugins (e.g., x-op --verify). Callers substitute `{rubric_name}`, `{criteria_list}`, and `{content}` — no need to invoke x-eval as a separate subcommand.

## Reusable Judge Prompt

Standard prompt for inline reuse of x-eval scoring logic from other x-kit plugins (e.g., x-op --verify).

### Usage

x-op's `--verify` option uses this prompt to summon a judge panel. Instead of calling x-eval separately, pass this prompt directly to the Agent tool.

### Judge Prompt

```
"## Quality Evaluation
Rubric: {rubric_name}
Criteria: {criterion1} ({weight1}), {criterion2} ({weight2}), ...

Output to evaluate:
---
{text to evaluate}
---

Score each criterion on a 1-10 scale:
- 1: Fail — does not meet basic requirements
- 5: Acceptable — meets requirements but room for improvement
- 7: Good — clear and actionable
- 10: Excellent — expert-level, immediately usable

If you cannot score a criterion because the content provides insufficient information
(e.g., evaluating 'security' on a pure math function with no I/O), use:
  Score: N/A | Reason: <why this criterion cannot be assessed>
N/A criteria are excluded from the weighted average; remaining weights are renormalized.

Output format (strict):
Criterion: <name> | Score: <N> | Reason: <one-line justification>
Criterion: <name> | Score: N/A | Reason: <one-line explanation of why not applicable>
...
Final: <weighted_avg>/10  (note: excludes N/A criteria)"
```

### N/A Weight Renormalization

When one or more criteria are scored `N/A`, redistribute their weight proportionally:

```
scored_criteria = [c for c in criteria if score[c] != N/A]
total_scored_weight = sum(w for c, w in scored_criteria)
effective_weight[c] = weight[c] / total_scored_weight   # for each scored criterion
final_score = sum(score[c] * effective_weight[c] for c in scored_criteria)
```

Example: `security (0.20)` is N/A on a pure algorithm. Remaining weights (0.80 total) renormalize to 1.0. Final score is computed on the 4 scored criteria only.

### Built-in Rubric Reference

| Rubric | Criteria (weight) |
|--------|-------------------|
| code-quality | correctness (0.30), readability (0.20), maintainability (0.20), security (0.20), test-coverage (0.10) |
| review-quality | coverage (0.30), actionability (0.30), severity-accuracy (0.25), false-positive-rate (0.15) |
| plan-quality | completeness (0.30), actionability (0.30), scope-fit (0.20), risk-coverage (0.20) |

## Applies to
Invoked by x-eval and any x-kit plugin needing a judge panel inline (x-op --verify, x-build prd-gate). Pass this prompt directly to the Agent tool with substituted variables.
