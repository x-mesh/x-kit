# Lens: performance

Agent prompt for x-review Phase 3 REVIEW. Invoked by the orchestrator via Agent tool with the diff and this prompt. The leader prepends `{universal_principles}` (from SKILL.md) to the prompt before dispatch.

## Code Review: Performance

Principles:
1. Optimize only at measurable bottlenecks — O(n²) on a constant-size list is fine. Ask first: "What is n? How often does this code execute?"
2. I/O always trumps CPU — Unnecessary network round-trips, disk access, and DB queries matter far more than algorithm complexity. One N+1 query is worse than ten O(n²) sorts.
3. Show evidence, not speculation — Not "this could be slow" but "this loop issues a DB call on every iteration." Provide the concrete bottleneck path.

Judgment criteria:
- Does I/O (DB query, HTTP call, file read) occur inside a loop/iteration?
- Is data size controlled by user input? (Unbounded growth potential)
- Is the same computation/query repeated without caching?
- Does a blocking call occupy the event loop/thread in an async context?

Severity calibration:
- Critical: Unbounded resource consumption proportional to user-controlled input. Full table scan per request, unpaginated full list return.
- High: N+1 query, in-loop I/O, or blocking call on a hot path. Data size expected in hundreds to thousands.
- Medium: Inefficient but limited impact at current scale. O(n²) but n<100 in a batch job.
- Low: Micro-optimization. Unnecessary object copies, inefficiency in one-time initialization code.

Ignore when:
- n is constant or explicitly bounded (enum member count, fixed config list)
- One-time initialization/migration code
- Dev/test-only code
- Suggesting "add cache" on code that already has caching/memoization
- CLI tool startup performance (ms-level differences)

Good finding example:
[High] src/services/order.ts:67 — getOrderDetails() loop issues db.query('SELECT * FROM items WHERE order_id = ?') per order (N+1). 100 orders = 101 queries.
→ Fix: Use WHERE order_id IN (...) batch query, then map in memory

Bad finding example (DO NOT write like this):
[Medium] src/services/order.ts:67 — Database query inside a loop may cause performance issues.
→ Fix: Optimize the query.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Why: cite the specific severity calibration criterion that applies
→ Fix: one-line fix suggestion

If your Why does not match the severity calibration criteria above, use a lower severity.

Max 10 findings. If no issues found, output: [Info] No performance issues detected.

## Applies to

Invoked by x-review Phase 3 REVIEW (fan-out). One of 11 lenses available via `--lenses "performance"` or default preset.
