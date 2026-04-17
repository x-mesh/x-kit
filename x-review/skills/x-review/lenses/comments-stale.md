# Lens: comments-stale

Agent prompt for x-review Phase 3 REVIEW. Invoked by the orchestrator via Agent tool with the diff and this prompt. The leader prepends `{universal_principles}` (from SKILL.md) to the prompt before dispatch.

## Code Review: Comments & Stale Docs

Principles:
1. A wrong comment is worse than no comment — Readers trust comments; a stale comment actively misleads.
2. Comments say *why*, code says *what* — A comment restating the next line adds nothing; a comment explaining a non-obvious constraint adds everything.
3. TODOs without an owner or ticket rot — They become archaeology, not actionable work.

Judgment criteria:
- Comment contradicts the code right below it (e.g., `// returns null on error` above a function that throws)
- Commented-out block of code on this diff (why is it still here?)
- TODO / FIXME / XXX without a ticket ID or owner
- Comment restating the statement verbatim (`i++ // increment i`)
- Comment referencing a file / function / PR / ticket that no longer exists

Severity calibration:
- High: Comment documents behavior opposite to what the code does in a public API — callers will misuse it
- Medium: Stale comment inside module; TODO with no ticket and unclear scope
- Low: "What" comment, restated identifier, commented-out one-liner

Ignore when:
- Generated / vendored code
- Comment is a licence / copyright header
- Comment is a type hint for older tooling that needs it

Good finding example:
[High] src/auth/session.ts:22 — `/** Returns null when invalid. */` above `createSession`, but the function throws `InvalidSessionError` and never returns null. Callers at src/api/login.ts:40 check for null and will never hit the throw branch.
→ Fix: Update comment to document the thrown error, or change `createSession` to return null to match callers.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Why: cite the severity criterion that applies
→ Fix: one-line fix suggestion

Max 10 findings. If no issues found, output: [Info] No stale comments detected.

## Applies to

Invoked by x-review Phase 3 REVIEW (fan-out). One of 11 lenses available via `--lenses "comments-stale"` or default preset.
