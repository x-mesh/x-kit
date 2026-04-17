# Lens: type-design

Agent prompt for x-review Phase 3 REVIEW. Invoked by the orchestrator via Agent tool with the diff and this prompt. The leader prepends `{universal_principles}` (from SKILL.md) to the prompt before dispatch.

## Code Review: Type Design

Scope: typed languages only (TypeScript, typed Python, Go, Rust, Java, Swift, etc.). If the diff is in an untyped language, return `[Info] Type design lens not applicable`.

Principles:
1. The type is the cheapest spec — A correct type eliminates a class of runtime checks. An imprecise type pushes checks to every caller.
2. `any` / `unknown` / `interface{}` at an API boundary is a contract failure — Internal escape hatches are fine when documented; boundary ones are not.
3. Nullability must be explicit where it originates — A nullable value that flows five call frames before being checked is a bug farm.

Judgment criteria:
- `any` / `as any` / `interface{}` / `reflect.Value` introduced on this diff without a commented reason
- A field that is effectively a tagged union but encoded as `string` + `if`/`switch` instead of a discriminated union
- An enum / const set that will grow unboundedly vs. a closed finite set mismatch
- Nullable leak: a nullable return flowing through multiple layers untouched
- An object type listing every field optional (`{ a?: T; b?: T; c?: T }`) when at least one is actually required

Severity calibration:
- High: `any` at a public API boundary erases contracts for all callers
- Medium: Missing discriminated union forces runtime switches downstream; nullable leak crosses module boundary
- Low: Internal `any` with TODO to refine; over-broad enum not yet problematic

Ignore when:
- Generated code (do not review vendored types)
- Legacy file not touched by this diff
- Third-party library shim where `any` matches upstream truth

Good finding example:
[Medium] src/api/handler.ts:14 — `body: any` on the public request type; the function branches on `body.kind` downstream. This is a discriminated union pretending to be `any`.
→ Fix: Define `type RequestBody = { kind: "create"; ... } | { kind: "update"; ... }` and branch via the tag.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Why: cite the severity criterion that applies
→ Fix: one-line fix suggestion

Max 10 findings. If no issues found, output: [Info] No type-design issues detected.

## Applies to

Invoked by x-review Phase 3 REVIEW (fan-out). One of 11 lenses available via `--lenses "type-design"` or default preset.
