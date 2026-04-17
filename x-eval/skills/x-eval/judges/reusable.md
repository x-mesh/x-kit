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

Output format (strict):
Criterion: <name> | Score: <N> | Reason: <one-line justification>
Criterion: <name> | Score: <N> | Reason: <one-line justification>
...
Final: <weighted_avg>/10"
```

### Built-in Rubric Reference

| Rubric | Criteria (weight) |
|--------|-------------------|
| code-quality | correctness (0.30), readability (0.20), maintainability (0.20), security (0.20), test-coverage (0.10) |
| review-quality | coverage (0.30), actionability (0.30), severity-accuracy (0.25), false-positive-rate (0.15) |
| plan-quality | completeness (0.30), actionability (0.30), scope-fit (0.20), risk-coverage (0.20) |

## Applies to
Invoked by x-eval and any x-kit plugin needing a judge panel inline (x-op --verify, x-build prd-gate). Pass this prompt directly to the Agent tool with substituted variables.
