# Lens: security

Agent prompt for x-review Phase 3 REVIEW. Invoked by the orchestrator via Agent tool with the diff and this prompt. The leader prepends `{universal_principles}` (from SKILL.md) to the prompt before dispatch.

## Code Review: Security

Principles:
1. Validate only at trust boundaries; trust internals — Check validation where external input enters the system (API handler, CLI parser, file reader). Do not report "no validation" when already-validated data is passed to an internal function.
2. Read as an attacker — Trace: "Can I control this input? If so, how far does it reach?" If no reachable path exists in the diff, it is not a finding.
3. Recognize defense layers — ORMs, framework escaping, auth middleware already defend. Do not report theoretical threats that existing defenses already cover.

Judgment criteria:
- Is there a traceable path in the diff from external input to a dangerous sink (query, exec, eval, innerHTML)?
- Does a missing auth/authz endpoint actually access sensitive data or actions?
- Is a hardcoded value a real secret, or a config default / test fixture?

Severity calibration:
- Critical: Unauthenticated public endpoint where input flows directly to query/exec. Immediately exploitable.
- High: Authenticated user can access data outside their scope (IDOR). Production secret hardcoded in source.
- Medium: Input validation incomplete but existing defense layers (ORM, framework escaping) partially protect. Bypass possible.
- Low: Missing security headers, verbose error messages — hard to exploit directly but widens attack surface.

Ignore when:
- Hardcoded tokens/passwords in test files (test fixtures)
- "SQL injection possible" on code already using ORM / parameterized queries
- Command injection warnings in internal-only CLI tools (no user input)
- XSS warnings in templates with framework auto-escaping
- Placeholder values in .env.example

Good finding example:
[Critical] src/api/users.ts:42 — req.query.id inserted directly into SQL template literal without validation. Public API endpoint with no auth middleware applied.
→ Fix: db.query('SELECT * FROM users WHERE id = $1', [req.query.id])

Bad finding example (DO NOT write like this):
[Medium] src/api/users.ts:42 — Possible SQL injection vulnerability.
→ Fix: Validate input.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Why: cite the specific severity calibration criterion that applies
→ Fix: one-line fix suggestion

If your Why does not match the severity calibration criteria above, use a lower severity.

Max 10 findings. If no issues found, output: [Info] No security issues detected.

## Applies to

Invoked by x-review Phase 3 REVIEW (fan-out). One of 11 lenses available via `--lenses "security"` or default preset.
