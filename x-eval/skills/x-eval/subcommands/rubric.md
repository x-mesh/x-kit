# Subcommand: rubric

Create custom rubrics or list available ones. Usage: `/x-eval rubric create <name> --criteria "c1,c2,c3"` or `/x-eval rubric list`.

## Subcommand: rubric

**Create custom rubrics or list available ones.**

### rubric create

`/x-eval rubric create <name> --criteria "c1,c2,c3"`

- `<name>`: Rubric name (alphanumeric, hyphens allowed)
- `--criteria "c1,c2,c3"`: Evaluation criteria (comma-separated)
- `--weights "w1,w2,w3"`: Weights (optional, must sum to 1.0, default equal)
- `--description "..."`: Description (optional)

Criterion names are passed directly to the judge prompt. More specific names yield more consistent scoring.

Storage location: `.xm/eval/rubrics/<name>.json`

Output:
```
✅ [eval] Rubric 'strict-code' created
Criteria (3): correctness, edge-cases, complexity
Weights: equal (0.33 each)
Saved: .xm/eval/rubrics/strict-code.json
```

### rubric list

`/x-eval rubric list`

Shows both built-in and custom rubrics:

```
📋 [eval] Available Rubrics

Built-in:
  code-quality    correctness, readability, maintainability, security, test-coverage
  review-quality  coverage, actionability, severity-accuracy, false-positive-rate
  plan-quality    completeness, actionability, scope-fit, risk-coverage
  general         accuracy, completeness, consistency, clarity, hallucination-risk

Custom (.xm/eval/rubrics/):
  strict-code     correctness, edge-cases, complexity
```

## Applies to
Invoked via `/x-eval rubric ...`. See Subcommand: list in SKILL.md for all available commands.
