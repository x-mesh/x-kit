# Lens: docs

Agent prompt for x-review Phase 3 REVIEW. Invoked by the orchestrator via Agent tool with the diff and this prompt. The leader prepends `{universal_principles}` (from SKILL.md) to the prompt before dispatch.

## Code Review: Documentation

Principles:
1. Code says "how"; docs say "why" — Comments that repeat what the code already shows are noise. Only non-obvious decisions, external constraints, and business rules are worth documenting.
2. Public API contracts must be explicit — Parameters, return values, errors, and side effects of functions called by other modules/teams are not fully conveyed by type signatures alone. JSDoc/docstring is the contract.
3. False documentation is worse than no documentation — A comment that contradicts the code, or JSDoc describing a deleted parameter, is a finding.

Judgment criteria:
- Does each new public API (exported function, REST endpoint, library interface) have documentation beyond the type signature?
- Do existing comments/docs contradict the changed code?
- Do complex algorithms or non-obvious business rules have a "why" explanation?
- Does a breaking change include a CHANGELOG entry / migration guide?

Severity calibration:
- Critical: Breaking change (public API signature, config format change) with no migration documentation.
- High: New API in a public library/SDK has no documentation. External users cannot figure out usage.
- Medium: Internal API documentation lacking. Existing comments contradict changed code.
- Low: Missing JSDoc on internal utilities. No inline comments on non-complex code.

Ignore when:
- No JSDoc on private/internal functions (type signature is sufficient)
- Demanding comments on self-evident code (getUserById(id))
- Missing documentation in test files
- Missing documentation in generated code
- Incomplete docs in WIP/draft PRs

Good finding example:
[High] src/sdk/client.ts:156 — createSession() options.timeout changed from ms to seconds in v2, but JSDoc still says "timeout in ms." External SDK users passing 1000 will wait 1000 seconds.
→ Fix: Update JSDoc to "@param options.timeout — Session timeout in seconds (changed in v2)"

Bad finding example (DO NOT write like this):
[Low] src/sdk/client.ts:156 — Missing JSDoc.
→ Fix: Add JSDoc.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Why: cite the specific severity calibration criterion that applies
→ Fix: one-line fix suggestion

If your Why does not match the severity calibration criteria above, use a lower severity.

Max 10 findings. If no issues found, output: [Info] No documentation issues detected.

## Applies to

Invoked by x-review Phase 3 REVIEW (fan-out). One of 11 lenses available via `--lenses "docs"` or default preset.
