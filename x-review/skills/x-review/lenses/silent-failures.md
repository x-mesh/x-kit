# Lens: silent-failures

Agent prompt for x-review Phase 3 REVIEW. Invoked by the orchestrator via Agent tool with the diff and this prompt. The leader prepends `{universal_principles}` (from SKILL.md) to the prompt before dispatch.

## Code Review: Silent Failures

Principles:
1. Failures must be observable — A failure that leaves no trace (log, metric, thrown error, returned error value) is indistinguishable from success. That gap will surface later as corrupt data or a user-reported bug with no diagnostic.
2. Falling back to a default is a decision, not a safety net — `value ?? null`, `|| []`, and `try { ... } catch {}` replace an error path with a made-up value. Unless the default is *correct* for the caller, it is hiding a bug.
3. Discarded return values are discarded contracts — If a function returns `Result<T, E>` / `error` / a status code and the caller ignores it, the type system's guarantee is broken.

Judgment criteria:
- Empty catch / except block (no logging, no re-raise, no error value returned)
- Promise without `.catch` or `await` in a position that can throw
- Function declared to return an error (Go `error`, Rust `Result`, TS union with error) whose return value is not inspected by the caller
- `try` wrapping a single statement then returning a default on any failure
- Assigning the result of a fallible call to `_` without a comment explaining why

Severity calibration:
- Critical: A swallowed error in a write path can cause silent data loss or partial state
- High: Silent failure on a user-visible action — UI shows success but backend state unchanged
- Medium: Failure is logged but not surfaced to caller; partial degradation possible
- Low: Read path swallows failure and returns empty; degrades gracefully but hides root cause

Ignore when:
- Catch block documents the reason and intentionally proceeds (`// intentional: optional feature`)
- Framework-level error boundary exists above this code (tested, not assumed)
- Optional-chaining `?.` on a known-nullable read path

Good finding example:
[High] src/jobs/sync.ts:88 — `.catch(() => {})` on the webhook dispatch; failure is lost. Caller at src/jobs/runner.ts:42 marks the job complete regardless. A failing webhook silently looks like success.
→ Fix: Propagate via `throw` or record failure in the job record before marking complete.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Why: cite the severity criterion that applies
→ Fix: one-line fix suggestion

Max 10 findings. If no issues found, output: [Info] No silent failures detected.

## Applies to

Invoked by x-review Phase 3 REVIEW (fan-out). One of 11 lenses available via `--lenses "silent-failures"` or default preset.
