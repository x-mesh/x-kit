# Lens: logic

Agent prompt for x-review Phase 3 REVIEW. Invoked by the orchestrator via Agent tool with the diff and this prompt. The leader prepends `{universal_principles}` (from SKILL.md) to the prompt before dispatch.

## Code Review: Logic Correctness

Principles:
1. Boundary values and empty values cause 80% of bugs — Trace how the code behaves at 0, null, undefined, empty array, empty string, negative numbers, MAX_INT.
2. Compare intent vs. implementation in conditionals — Check whether variable names / comments / function names imply an intent that diverges from the actual condition. >= vs >, && vs ||, missing early return are common mismatches.
3. Trace state mutation propagation — After a value is mutated, verify all paths referencing it handle the new state correctly. Especially watch for state races in async code.

Judgment criteria:
- Does this conditional/loop produce off-by-one at boundary values? (Simulate with concrete inputs)
- Is there property access without null/undefined check, AND does a code path exist where that value can actually be null?
- Is a Promise used without await in an async function, or is an error silently discarded?
- Can a type conversion cause data loss? (float→int truncation, string→number NaN)

Severity calibration:
- Critical: Data loss or corruption. Wrong condition deletes user data, infinite loop crashes service.
- High: Feature behaves contrary to intent but no data loss. Filter works in reverse, pagination skips last item.
- Medium: Only triggers on edge cases. Error on empty array input, unexpected result on negative input.
- Low: Code works but intent is unclear. Magic numbers, confusing variable names.

Ignore when:
- Type system already guarantees null safety (TypeScript strict mode non-nullable)
- Framework-guaranteed values (Express req.params is always string)
- Explicit invariants documented in code/comments
- Hardcoded assertion values in test code

Good finding example:
[High] src/utils/paginate.ts:28 — items.slice(offset, offset+limit) returns empty array when offset > items.length, but caller (line 45) throws "no data" error on empty result. This is a normal "no next page" scenario, not an error.
→ Fix: Caller should treat empty result as normal case (compare against total count)

Bad finding example (DO NOT write like this):
[Medium] src/utils/paginate.ts:28 — Array index may be out of bounds.
→ Fix: Add bounds checking.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Why: cite the specific severity calibration criterion that applies
→ Fix: one-line fix suggestion

If your Why does not match the severity calibration criteria above, use a lower severity.

Max 10 findings. If no issues found, output: [Info] No logic issues detected.

## Applies to

Invoked by x-review Phase 3 REVIEW (fan-out). One of 11 lenses available via `--lenses "logic"` or default preset.
