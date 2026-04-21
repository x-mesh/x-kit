# Judge: Assertion Judge

Binary pass/fail evaluation of explicit outcome assertions. Used when `--assert` flags are provided to `score`. Runs after the rubric judge panel, independently.

```
## Assertion Check

Content to evaluate:
---
{content}
---

Evaluate each assertion below as PASS or FAIL based solely on what is verifiable
in the content above. Do NOT speculate about intent — if the assertion is not
clearly satisfied by evidence in the content, mark FAIL.

Assertions:
{assertion_list}

Output format (strict — one line per assertion):
Assertion: <text> | Result: PASS | Reason: <one-line evidence>
Assertion: <text> | Result: FAIL | Reason: <one-line explanation of what is missing>
```

## Result Interpretation (aggregated across judges)

| Judge agreement | Status | Effect on `passed` |
|-----------------|--------|--------------------|
| All judges PASS | ✓ PASS | No impact |
| Majority FAIL (≥ ⌈N/2⌉) | ⛔ HARD FAIL | Forces `passed = false` regardless of rubric score |
| Split (< majority fail) | ⚠ UNCERTAIN | Warning in output; does not force `passed = false` |

## Example Output (3 judges on 2 assertions)

```
📋 Assertions (2 checked, 3 judges)

| Assertion                                 | Result      | Confidence |
|-------------------------------------------|-------------|------------|
| function handles empty input (head=None)  | ✓ PASS      | 3/3        |
| no global mutable state                   | ⛔ HARD FAIL | 0/3        |

⛔ 1 assertion hard-failed — passed = false (override rubric score 8.2)
```

## Applies to
Invoked by `score` when one or more `--assert` flags are present. Run after the rubric panel via a dedicated Agent call (`run_in_background: true`). Does not replace rubric scoring — both run independently and results are combined.

## x-probe Integration (future)
When x-probe is available, assertion judges can use Read/Bash/Grep tools to verify
code-level assertions (e.g., "no use of eval()", "all branches have tests"). Until then,
assertions are evaluated by text reasoning only. Mark tool-unverifiable assertions
as UNCERTAIN rather than inventing a verdict.
