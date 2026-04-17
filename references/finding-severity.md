# Finding Severity

Reference for severity labels on code review findings. Used by x-review lenses and CLAUDE.md code review principles.

## Severity Calibration

| Severity | Criteria |
|----------|---------|
| Critical | Immediately exploitable security flaw, data loss/corruption, production outage |
| High | Feature defect, unhandled error path, severe perf degradation (10x+). No data loss. |
| Medium | Code quality issue, edge-case-only bug, incomplete test coverage |
| Low | Style, missing docs on internals, micro-optimization suggestions |

## Finding Quality Standard

Good finding: `[High] src/api.ts:42 — concrete description with traced path and context → Fix: specific code change`

Bad finding: `[Medium] src/api.ts:42 — vague description → Fix: fix it`

## Applies to

Used by: x-review (all 7 lenses), CLAUDE.md (Code Review Principles), x-humble (lesson severity)
