# Review Workflow

End-to-end x-review pipeline from target collection to final verdict. The orchestrator (leader) executes Phases 1-4 sequentially; Phase 3 dispatches lens agents in parallel. See `lenses/*.md` for per-lens agent prompts.

## Phase 1: TARGET

Collect review target content from a diff, PR, or file.

### diff [ref]

```bash
git diff HEAD~1    # default when no ref provided
git diff {ref}     # use the specified ref
```

Run via Bash tool. Store the entire result as `{diff_content}`.
Auto-detect language from file extensions (`.ts`, `.py`, `.go`, etc.).

### pr [number]

```bash
gh pr diff {number}
```

Run via Bash tool. Store the result as `{diff_content}`.

If `number` is omitted, auto-detect from current branch:
```bash
gh pr view --json number -q .number 2>/dev/null
```
- If PR found → use that number automatically
- If no PR → AskUserQuestion: "Please enter the PR number"

### file <path>

Read the file directly via Read tool. If the path is a directory, list child files and read each one (non-recursive, respecting .gitignore).
Store the result as `{diff_content}`.

### full

Full codebase review. Targets entire source, not a diff.

1. Collect files to review:
   ```bash
   git ls-files --cached | grep -E '\.(ts|js|py|go|java|rs|mjs)$' | head -100
   ```
2. **Lens-first split** — assign agents by lens, not by file group:
   - Default 4 lenses (security, logic, perf, tests) × full file list
   - Each agent scans all files with **one lens** (file-group × 7-lens split is prohibited)
   - Agent count = min(lens count, `agent_max_count`)
   - If 20+ files, split files in half per lens and assign 2 agents each
3. Merge results into Phase 4: SYNTHESIZE

`full` mode is expensive — confirm before running:
```
전체 리뷰 대상: {N}개 파일, {렌즈}개 렌즈, ~{agent_count}개 에이전트
예상 토큰: ~{token}K
계속할까요? (AskUserQuestion)
```

---

## Phase 2: ASSIGN

Assign review perspectives using `--lenses` option or automatically.

### Default 7 Perspectives

| Agent | Lens | Focus Area |
|-------|------|------------|
| Agent 1 | security | Injection, XSS, CSRF, auth/authz, hardcoded secrets, OWASP Top 10 |
| Agent 2 | logic | Bugs, edge cases, off-by-one, null/undefined handling, type errors |
| Agent 3 | perf | N+1 queries, memory leaks, complexity, blocking I/O, unnecessary recomputation |
| Agent 4 | tests | Missing tests, untested paths, test quality, boundary value tests |
| Agent 5 | architecture | Module boundaries, coupling, single responsibility principle |
| Agent 6 | docs | Inline comments, public API docs, change history |
| Agent 7 | errors | Error handling, recovery paths, failure propagation |
| Agent 8 | migrations | Schema drift, missing migrations, ORM/DB sync |

### Optional Lenses (opt-in via `--lenses`)

| Lens | Focus Area |
|------|------------|
| silent-failures | Empty catch, swallowed errors, `|| null` fallbacks, ignored promise rejections, discarded return values |
| type-design | `any` overuse, missing discriminated unions, nullable leaks, over-broad enums (typed languages only: TS / Python typed / Go / Rust) |
| comments-stale | Stale / contradictory comments, TODO without ticket, commented-out code, "what" comments instead of "why" |

These are NOT in the default preset — invoke explicitly: `--lenses "silent-failures,type-design"`.

### When --lenses Is Specified

`--lenses "security,logic"` → Use only the specified lenses; agent count = lens count.

**--lenses + --agents interaction:**
- `--lenses "security" --agents 3` → runs security as 3 independent agents (redundant verification, Self-Consistency effect)
- `--lenses "security,logic" --agents 4` → security ×2 + logic ×2 (evenly distributed per lens)
- `--lenses "security,logic,perf"` (no --agents) → 3 agents, 1 per lens

### Presets (quick start)

| Preset | Lenses | Agents | Use case |
|--------|------|---------|------|
| `--preset quick` | security, logic | 2 | Fast core check (~2 min) |
| `--preset standard` | security, logic, perf, tests | 4 | Code quality focused (~5 min) |
| `--preset security` | security only | 3 | Security focused (Self-Consistency) |
| (default, no preset) | **all 7** | **7** | **Full review (default)** |

### Agent Count

- Default: agent count = lens count (**7 lenses = 7 agents**)
- `--preset quick` → 2, `--preset standard` → 4
- When `--agents N` is specified: N agents (lenses assigned to fit N)
- If `--agents N` is less than lens count: assign highest-priority lenses first (security > logic > perf > errors > tests > architecture > docs)

---

## Phase 3: REVIEW

Fan-out — send the diff + dedicated perspective prompt to each agent simultaneously.

**Invoke N Agent tools simultaneously in a single message:**

```
Agent tool 1: {
  description: "x-review: security",
  prompt: "## Code Review: Security\n\n{diff_content}\n\n[perspective prompt]",
  run_in_background: true,
  model: "sonnet"
}
Agent tool 2: {
  description: "x-review: logic",
  prompt: "## Code Review: Logic\n\n{diff_content}\n\n[perspective prompt]",
  run_in_background: true,
  model: "sonnet"
}
... (N agents)
```

### Universal Review Principles

The following principles are injected at the `{universal_principles}` position in all perspective prompts.

```
## Universal Review Principles

1. **Context determines severity** — The same pattern varies in severity depending on exposure scope, data sensitivity, and call frequency. Always ask first: "Where does this code run, with what data, and how often?"
2. **A finding without evidence is noise** — Show "this code does X" not "this code could do X." If you cannot trace a concrete path in the diff, do not report it.
3. **No fix direction, no finding** — A finding whose Fix is "be careful" is not actionable. If you cannot suggest a specific code change, it is not a finding.
4. **Review only changed code** — Do not report issues in existing code outside the diff. Exception: when a change worsens an existing problem.
5. **One finding, one problem** — Do not bundle multiple issues into a single finding. "This is wrong AND that is wrong" is two findings.
6. **When in doubt, downgrade** — If you hesitate between two severity levels, choose the lower one. Over-reporting erodes trust faster than under-reporting. A consistently accurate Low is more valuable than an inflated Medium.
```

### Lens Prompts

Each lens provides a specialized agent prompt. The orchestrator selects lenses per `--lenses` flag or preset, prepends `{universal_principles}` (above), and dispatches N agents in parallel. See individual files for prompt contents and severity calibration rules.

- `lenses/security.md` — OWASP + trust-boundary validation
- `lenses/logic.md` — boundary values + conditional intent
- `lenses/performance.md` — measurable bottlenecks, I/O > CPU
- `lenses/tests.md` — behavior over implementation, risky paths first
- `lenses/architecture.md` — blast radius, YAGNI abstractions
- `lenses/docs.md` — why not what, API contracts, stale doc detection
- `lenses/errors.md` — visible failures, fail-fast, caller-specific info
- `lenses/migrations.md` — ORM vs schema sync, reversibility
- `lenses/silent-failures.md` — swallowed errors, default-value traps
- `lenses/type-design.md` — any/unknown at boundaries (typed languages only)
- `lenses/comments-stale.md` — contradictory comments, TODO hygiene

---

## Phase 4: SYNTHESIZE

Once all agents complete, the leader generates a consolidated report.

### 1. Parse

Parse findings from each agent's result:
```
[Severity] file:line — description
→ Why: ...
→ Fix: ...
```

Skip `[Info]` lines.

### 2. Deduplicate + Consensus Promotion

- If different agents report the same issue at the same `file:line` → merge into one and list all source lenses
- Merged findings are marked as "consensus"

**Consensus promotion rules:**
| Agent Count | Action |
|-------------|--------|
| 1 | Keep original severity |
| 2 | Promote severity one level (Medium → High) + `[consensus]` tag |
| 3+ | Promote to maximum severity (up to Critical) + `[strong consensus]` tag |

Promotion caps at Critical. Order: Low → Medium → High → Critical.
Preserve pre-promotion severity in parentheses: `[High←Medium] [consensus] file:line — issue`

### 2.5. Self-Verify (Chain-of-Verification)

After deduplication, each finding is self-verified before challenge. For each High+ finding, the leader generates a verification question and checks the code independently:

For each finding with severity >= High:
1. **Generate verification question:** "Does {file}:{line} actually do {claimed behavior}?"
2. **Verify against agent output:** Review agents must include the relevant code snippet (3-5 lines around the finding) in their output. The leader verifies the claim against this snippet — **do not re-read the file.** Only use Read tool for findings that have no snippet.
3. **Result:**
   - Verified → keep finding as-is
   - Contradicted → remove finding + tag `[CoVe-removed]`
   - Inconclusive → downgrade one level + tag `[CoVe-downgraded]`

CoVe-removed findings are excluded from Step 3 Challenge. CoVe-downgraded findings proceed to Challenge with their new severity.

This catches false positives where the agent claimed a vulnerability/bug that doesn't actually exist in the code. Only applies to High+ to limit cost — Low/Medium findings are validated in the Challenge step.

### 3. Challenge (Severity Validation)

Before sorting, the leader validates each finding's severity:

1. **Why-line check** — Does the Why line cite a specific criterion from the severity calibration?
   - If Why is vague ("could be a problem", "best practice") → downgrade one level
   - If Why is missing → downgrade one level

2. **Context check** — Does the finding account for existing defenses?
   - If the code already has guards (try/catch, optional chaining, ORM, auth middleware) that the finding ignores → downgrade one level or remove

3. **Reachability check** — Is the problem actually reachable in production?
   - If the finding requires conditions that cannot occur given the call site (e.g., internal-only function, caller already validates) → downgrade one level or remove

4. **Impact check** — What is the actual blast radius?
   - "Function crashes" in a CLI tool (user retries) vs. in a server (service down) → adjust severity to match actual impact

Downgrade is capped at removal (cannot go below Low).
Mark challenged findings with `[↓ severity←original] [challenged]` tag.
Example: `[Low←Medium] [challenged] file:line — description`

If all findings are removed after challenge, verdict is LGTM regardless of original counts.

### 3.5. Recall Boost (Completeness Check)

After challenge filtering, the leader does a **second pass** to catch issues that strict severity rules might have filtered out.

**Mode selection:**

| Flag | Behavior | Observation limit | Agent |
|------|----------|:-----------------:|-------|
| (default) | Leader second pass, 6 categories | 5 | Leader only |
| `--thorough` | Dedicated recall agent, 6 categories, aggressive promotion | 10 | Separate agent via Agent tool |

When `--thorough` is active, spawn a **separate recall agent** (not the leader) via Agent tool. The agent receives: (1) the full diff, (2) the list of already-reported findings, and (3) the recall boost prompt below. This provides genuine "fresh eyes" — a different context window from the leader who applied severity filters.

**Prompt for the recall boost pass:**
```
Review the diff one more time with fresh eyes. Ignore the findings already reported.
Look specifically for:

1. **Incomplete implementations** — Stubs, placeholder comments, TODO-equivalent code blocks
   that have no actionable instruction. (e.g., a command handler that is just a comment)
2. **Internal contradictions** — Two parts of the same file that say different things
   (e.g., a config table says X, but the prose says Y)
3. **Broken cross-references** — A section references a path, command, or identifier
   that doesn't match the actual definition elsewhere in the diff
4. **Silent behavior changes** — Default value changes, parameter reordering, removed
   validations, or loosened constraints that alter runtime behavior without explicit mention
5. **Missing error paths** — New I/O, network, or parsing operations introduced without
   error handling (no try/catch, no error return check, no fallback)
6. **Off-by-one and boundary gaps** — Loop bounds, array slicing, range checks, or
   pagination logic where ±1 changes the result set (e.g., < vs <=, 0-index vs 1-index)

For each issue found, output as:
[Observation] file:line — description
→ Fix: specific change

Observations do NOT affect the verdict. They are informational.
If nothing found, output: No additional observations.
```

**Promotion rules:**
- Observations are appended to the report **after** the verdict section
- Observations do NOT count toward verdict thresholds (not Critical/High/Medium/Low)
- Observations use the `[Observation]` tag — a distinct category, not a severity level
- Maximum 5 observations per review (10 with `--thorough`)
- **Auto-promotion criteria** — an observation is promoted to a severity-rated finding when ANY of:
  1. (all modes) It describes a defect that would be **Medium or higher** if severity-rated
  2. (`--thorough` only, additional) The recall agent flags it as `[Promote]` with explicit severity justification
- Promoted observations are re-evaluated: apply the same Challenge rules (Why-line, context, reachability, impact). If they survive challenge, the verdict is recalculated.

**Why this exists:** x-review's "when in doubt, downgrade" principle optimizes for precision (no false positives) at the cost of recall. This pass recovers recall without inflating severity — observations are advisory, not blocking. The 3 added categories (4-6) target the most common recall gaps identified in A/B benchmarks.

### 4. Sort

Sort by Critical → High → Medium → Low.
Within the same severity, consensus findings come first.

### 5. Apply --severity Filter

`--severity high` → Show only High and above. Counts are based on pre-filter totals.

### 6. Verdict

| Condition | Verdict | Meaning |
|-----------|---------|------|
| 0 Critical, 0 High, Medium ≤ 3 | LGTM ✅ | Ready to merge |
| 0 Critical, High 1-2 or Medium > 3 | Request Changes 🔄 | Fix then re-review |
| 1+ Critical or High > 2 | Block 🚫 | Merge blocked — must fix |

Include verdict rationale in output: "Verdict: Request Changes 🔄 — 1 High finding (LGTM requires: 0 High)"

### 7. Output Format

#### format: markdown (default)

```
🔍 [x-review] Complete — {N} agents, {M} findings

Verdict: {LGTM ✅ | Request Changes 🔄 | Block 🚫}

## Critical ({count})
[Critical] src/auth.ts:42 — SQL injection via unsanitized user input (security, logic)
  → Fix: Use parameterized query: db.query('SELECT * FROM users WHERE id = $1', [id])

## High ({count})
[High] src/api/handler.ts:88 — Unhandled promise rejection propagates silently (errors)
  → Fix: Add .catch() or use await with try/catch

## Medium ({count})
[Medium] src/utils/cache.ts:15 — O(n²) lookup in hot path (perf)
  → Fix: Convert to Map for O(1) lookup

## Low ({count})
[Low] src/models/user.ts:3 — Missing JSDoc for exported UserSchema (docs)
  → Fix: Add /** @param ... @returns ... */ above function signature

## Summary
| Lens | Findings | Critical | High | Medium | Low |
|------|---------|----------|------|--------|-----|
| security | 2 | 1 | 1 | 0 | 0 |
| logic | 1 | 0 | 1 | 0 | 0 |
| perf | 1 | 0 | 0 | 1 | 0 |
| tests | 0 | 0 | 0 | 0 | 0 |
| **Total** | **4** | **1** | **2** | **1** | **0** |

## Observations ({count})
[Observation] src/commands/export.ts:45 — Export handler has only a comment stub, no implementation instruction
  → Fix: Add explicit output format definition matching the import handler pattern

[Observation] src/config.ts:12 — Config docs say "timeout in ms" but code uses seconds
  → Fix: Align docs to match code: "timeout in seconds"
```

#### format: github-comment

````
<!-- x-review -->
## Code Review

**Verdict: Block 🚫** — 1 critical finding requires attention before merge.

<details>
<summary>🔴 Critical (1)</summary>

**`src/auth.ts:42`** — SQL injection via unsanitized user input *(security, logic)*
> Fix: Use parameterized query: `db.query('SELECT * FROM users WHERE id = $1', [id])`

</details>

<details>
<summary>🟠 High (2)</summary>

**`src/api/handler.ts:88`** — Unhandled promise rejection *(errors)*
> Fix: Add `.catch()` or use `await` with `try/catch`

**`src/models/user.ts:21`** — Missing null check before property access *(logic)*
> Fix: Add `if (!user) return null;` guard

</details>

<details>
<summary>📊 Summary</summary>

| Lens | Findings | Critical | High | Medium | Low |
|------|---------|----------|------|--------|-----|
| security | 2 | 1 | 1 | 0 | 0 |
| logic | 1 | 0 | 1 | 0 | 0 |
| perf | 1 | 0 | 0 | 1 | 0 |
| tests | 0 | 0 | 0 | 0 | 0 |

*Generated by [x-review](https://github.com/x-mesh/x-kit)*
</details>
````

## Applies to

Orchestrator runs through this workflow on every x-review invocation.
