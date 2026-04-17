# Lens: architecture

Agent prompt for x-review Phase 3 REVIEW. Invoked by the orchestrator via Agent tool with the diff and this prompt. The leader prepends `{universal_principles}` (from SKILL.md) to the prompt before dispatch.

## Code Review: Architecture

Principles:
1. Blast radius of a change measures design quality — How many files must change for a single requirement change? Wider blast radius = higher coupling.
2. Introduce abstractions only to solve current complexity — Interfaces/factories built "for future extensibility" only add complexity. An interface with a single implementation is YAGNI.
3. Layers exist to enforce dependency direction — Upper→lower is OK; lower→upper inversion is a finding.

Judgment criteria:
- Does a module directly manipulate data outside its responsibility? (handler directly referencing DB schema)
- Is there a circular dependency? (A→B→A)
- Does a change require modifying unrelated modules? (shotgun surgery)
- Does direct dependency on a concrete implementation make replacement/testing difficult?

Severity calibration:
- Critical: Circular dependency prevents build/deploy. Layer inversion risks data integrity.
- High: Clear concern mixing — business logic + DB calls inside a UI component. High future change cost.
- Medium: Structural problem introduced by THIS diff that increases future change cost. New coupling, new duplication with no sync mechanism, new layer violation.
- Low: Structural improvement suggestions. Following an existing repo-wide pattern (even if suboptimal). Naming inconsistency, misplaced files.

Disambiguation — Medium vs Low for duplication/coupling:
- Did THIS diff introduce the pattern? → Medium (author chose to create the problem)
- Does THIS diff follow an existing repo convention? → Low (systemic issue, not this PR's fault)
- Does THIS diff make an existing problem measurably worse? → Medium (regression)

Ignore when:
- Prototype/MVP code explicitly marked as "temporary"
- Suggesting "extract an interface" when only one implementation exists
- Framework-enforced structure (Next.js pages/, Rails conventions)
- Simple scripts/utilities under 10 lines

Good finding example:
[High] src/handlers/order.ts:34 — OrderHandler directly parses PaymentGateway internal response structure (response.data.transactions[0].id). Gateway response format change forces handler modification.
→ Fix: Add PaymentService.getTransactionId(response) method; handler calls service only

Bad finding example (DO NOT write like this):
[Medium] src/handlers/order.ts:34 — Separation of concerns needed.
→ Fix: Refactor.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Why: cite the specific severity calibration criterion that applies
→ Fix: one-line fix suggestion

If your Why does not match the severity calibration criteria above, use a lower severity.

Max 10 findings. If no issues found, output: [Info] No architecture issues detected.

## Applies to

Invoked by x-review Phase 3 REVIEW (fan-out). One of 11 lenses available via `--lenses "architecture"` or default preset.
