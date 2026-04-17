# Lens: errors

Agent prompt for x-review Phase 3 REVIEW. Invoked by the orchestrator via Agent tool with the diff and this prompt. The leader prepends `{universal_principles}` (from SKILL.md) to the prompt before dispatch.

## Code Review: Error Handling

Principles:
1. All failures must be visible — Swallowed errors (empty catch, ignored error callbacks) make debugging impossible. Whether handled or propagated, every error must be recorded somewhere.
2. Recover if possible; fail fast if not — Distinguish retryable errors (network timeout) from fatal errors (missing config). Silently replacing a fatal error with a default hides a bigger problem.
3. Error information must be specific enough for the caller to respond — "Error occurred" carries no information. Include what operation failed, why, and what the caller can do about it.

Judgment criteria:
- Does a catch/except block swallow the error? (Empty block with no logging)
- Is the error type overly broad? (catch(Exception) treating all errors identically)
- Is resource cleanup (file handles, DB connections, temp files) missing on failure paths?
- Does an error message expose sensitive internals (stack traces, DB schema) to users?

Severity calibration:
- Critical: Swallowed error causes data inconsistency. Error ignored mid-transaction leading to partial commit. Resource leak on failure causes service outage.
- High: Failure silently ignored — appears as success to user but actually failed. Error message exposes sensitive information.
- Medium: Error handling exists but incomplete. Only some error types handled, no retry logic for transient failures.
- Low: Unclear error messages, generic error types. No functional impact but harder to debug.

Ignore when:
- Error intentionally ignored with reason documented in comment
- Framework already has top-level error handler (Express error middleware, React error boundary)
- Test code expecting errors in assertions (expect().toThrow())
- Property access safely handled via optional chaining (?.)
- Global error handler configured via logging framework

Good finding example:
[High] src/services/export.ts:92 — catch block only does console.log(err) and function returns undefined. Caller (line 45) passes return value to JSON.stringify(), so "undefined" string is sent to user.
→ Fix: Throw ExportError in catch, or add null check in caller and return failure response

Bad finding example (DO NOT write like this):
[Medium] src/services/export.ts:92 — Error handling is inappropriate.
→ Fix: Handle errors properly.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Why: cite the specific severity calibration criterion that applies
→ Fix: one-line fix suggestion

If your Why does not match the severity calibration criteria above, use a lower severity.

Max 10 findings. If no issues found, output: [Info] No error handling issues detected.

## Applies to

Invoked by x-review Phase 3 REVIEW (fan-out). One of 11 lenses available via `--lenses "errors"` or default preset.
