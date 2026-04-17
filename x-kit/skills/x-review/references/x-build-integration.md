# x-review — x-build Integration

How x-review is consumed as a quality gate in x-build's Verify phase, with x-eval scoring and x-memory persistence.

## Usage From x-build

Used as a quality gate in x-build's Verify phase:

```
# Full diff review in the Verify phase
/x-review diff HEAD~{step_count}

# Block verdict = gate fail
# LGTM / Request Changes = continue
```

## x-build Verdict-to-Gate Mapping

| x-review Verdict | x-build Action |
|------------------|----------------|
| LGTM | `x-build gate pass "x-review LGTM"` |
| Request Changes | Show review results to user, re-review after fixes |
| Block | `x-build gate fail "Critical issues found"` — blocks phase next |

## x-eval Scoring Integration

After review completion, findings can be auto-scored via x-eval:

```
/x-eval score ".xm/review/last-result.json" --rubric review-quality
```

`review-quality` rubric criteria:
- **coverage** (0.30): Were all perspectives sufficiently covered
- **actionability** (0.30): Are findings specific and fixable
- **accuracy** (0.25): Are there no false positives
- **severity-calibration** (0.15): Are severity levels appropriate

## x-memory Integration

Recurring Critical/High findings are auto-saved to x-memory:
```
x-memory save --type failure --title "SQL injection in auth module"
  --why "x-review detected SQLi in 3 consecutive reviews"
  --tags "security,auth,recurring"
```

Condition: Auto-suggested when Critical/High is found 2+ times at the same file/pattern.

## Applies to

Invoked from x-build Verify phase; results feed x-eval scoring and x-memory auto-save.
