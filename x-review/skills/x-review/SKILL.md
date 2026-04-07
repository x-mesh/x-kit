---
name: x-review
description: Multi-perspective code review orchestrator — PR diff analysis with severity-rated findings and LGTM verdict
allowed-tools:
  - AskUserQuestion
---

<Purpose>
x-review takes a PR diff, file, or directory as input and runs multiple review agents in parallel. Each agent reports findings from a dedicated perspective (security, logic, performance, test coverage) in severity + file:line format. The leader then produces a consolidated report with an LGTM / Request Changes / Block verdict.
</Purpose>

<Use_When>
- User wants to review a PR, file, or directory
- User says "review", "code review", "check PR", "analyze diff", "review"
- User says "check security vulnerabilities", "find performance issues", "check test coverage"
- Other x-kit skills need a code quality gate
</Use_When>

<Do_Not_Use_When>
- Simple single-line questions that don't need multi-agent review
- Structured problem solving (use x-solver instead)
- Full project lifecycle management (use x-build instead)
</Do_Not_Use_When>

# x-review — Multi-Perspective Code Review

Parallel review orchestrator built on Claude Code native Agent tool.
No external dependencies. Only requires `git` and `gh` CLI.

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

**Developer mode**: Use technical terms (verdict, LGTM, Critical/High/Medium/Low, findings). Concise.

**Normal mode**: Use plain Korean for all user-facing output.
- "verdict" → "결과", "LGTM" → "통과", "Request Changes" → "수정 필요", "Block" → "차단"
- "finding" → "발견", "Critical" → "심각", "High" → "높음", "Medium" → "보통", "Low" → "낮음"
- "severity" → "심각도", "lens" → "관점", "challenge stage" → "재확인", "consensus elevation" → "합의 승격"
- Use "~하세요" style, lead with key information

## Arguments

User provided: $ARGUMENTS

## AskUserQuestion Dark-Theme Rule

**CRITICAL:** The `question` field in AskUserQuestion is invisible on dark terminals.

**Visibility map:**
| Element | Visible | Use for |
|---------|---------|---------|
| `header` | ✅ YES | Short context tag (e.g., "x-op bump", "Pipeline") |
| `question` | ❌ NO | Keep minimal — user cannot see this text |
| option `label` | ✅ YES | Primary info — must be self-explanatory |
| option `description` | ✅ YES | Supplementary detail |

**Always follow this pattern:**
1. Output ALL context (descriptions, status, analysis) as **regular markdown text** BEFORE calling AskUserQuestion
2. `header`: put the key context here (visible, max 12 chars)
3. `question`: keep short, duplicate of header is fine (invisible to user)
4. Option `label` + `description`: carry all decision-relevant information

**WRONG:** Putting context in `question` field → user sees blank space above options
**RIGHT:** Print context as markdown first, use `header` for tag, options for detail

## Routing

First word of `$ARGUMENTS`:
- `diff` → [Phase 1: TARGET — diff mode]
- `pr` → [Phase 1: TARGET — pr mode]
- `file` → [Phase 1: TARGET — file mode]
- `full` → [Phase 1: TARGET — full mode]
- `list` → [Subcommand: list]
- Empty input → [Smart Router]
- Natural language → [Smart Router] (interpret intent, then route)
- Unrecognized input → [Subcommand: list] (safe fallback for typos/unsupported commands)

### Smart Router (empty input or natural language)

When called without arguments, **automatically determines the review scope**. Runs immediately without asking the user.

**Step 1: Context detection (order = routing priority)**

```bash
# Priority 1: PR detection (highest priority)
BRANCH=$(git branch --show-current 2>/dev/null)
PR_NUM=$(gh pr view --json number -q .number 2>/dev/null || echo "")
BASE=$(git merge-base main HEAD 2>/dev/null || git merge-base master HEAD 2>/dev/null || echo "")

# Priority 2: Last reviewed commit (for main branch)
LAST_REVIEW=$(jq -r '.reviewed_commit // empty' .xm/review/last-result.json 2>/dev/null || echo "")

# Priority 3: Last release commit
if [ -z "$LAST_REVIEW" ]; then
  LAST_REVIEW=$(git log --grep="^release:" --format=%H -1 2>/dev/null || echo "")
fi

# Priority 4: Last tag
if [ -z "$LAST_REVIEW" ]; then
  TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  [ -n "$TAG" ] && LAST_REVIEW=$(git rev-parse -- "$TAG" 2>/dev/null || echo "")
fi

# Priority 5: Fallback
if [ -z "$LAST_REVIEW" ]; then
  LAST_REVIEW="HEAD~10"
fi

# Validate reference point — only hex SHA or HEAD~N allowed
if ! echo "$LAST_REVIEW" | grep -qE '^[0-9a-f]{7,40}$|^HEAD~[0-9]+$'; then
  LAST_REVIEW="HEAD~10"
fi
```

**Step 2: Routing (top to bottom, first match wins)**

| Priority | Condition | Review scope | Rationale |
|---------|------|----------|------|
| 1 | PR exists | `gh pr diff {PR_NUM}` | PR = natural unit of review |
| 2 | Feature branch (no PR) | `diff {BASE}..HEAD` | Entire branch = unit of work |
| 3 | Main + reference point exists | `diff {LAST_REVIEW}..HEAD` | Since last review/release/tag |
| 4 | Fallback | `diff HEAD~10` | Reasonable default |
| — | Unrecognized input | [Subcommand: list] | Safe fallback for typos/unsupported commands |

**Step 3: Pre-run summary + large diff guard**
```
🔍 리뷰 범위: {ref:0:7}..HEAD ({N} 커밋, {M} 파일, +{add}/-{del} 줄)
   기준: {마지막 리뷰 / 릴리스 커밋 / 태그 / HEAD~10}
```

| Diff size | Behavior |
|----------|------|
| 0 lines | Output "변경 사항이 없습니다", exit |
| 1-500 lines | Run immediately |
| 500-2000 lines | AskUserQuestion: choose `--preset thorough` (4 lenses) or `--preset quick` (2 lenses) |
| 2000+ lines | Force `--preset quick` (override: `--force-full`) |

**Save reference point after review:**

After Phase 4 completes, write the `reviewed_commit` field to `last-result.json`:
```json
{
  "reviewed_commit": "{commit hash of HEAD}",
  ...existing fields
}
```
This value becomes priority 1 reference point for the next Smart Router run.

**Natural language mapping:**
| User says | Route to |
|-----------|----------|
| "review this PR", "PR 리뷰" | `pr` (auto-detect) |
| "review the code", "코드 리뷰" | Smart Router (auto scope) |
| "check security", "보안 검사" | `diff --lenses "security"` |
| "review this file", "이 파일 리뷰" | `file` (ask for path) |
| "full review", "전체 리뷰" | `full` |

---

## Subcommand: list

```
x-review — Multi-Perspective Code Review Orchestrator

Commands:
  (no args)                     Smart detect: PR, branch diff, or recent commit
  diff [ref]                    Review git diff (default: HEAD~1)
  pr [number]                   Review GitHub PR (auto-detect from branch)
  file <path>                   Review specific file(s)
  full                          Full codebase review (split by lens)

Options:
  --lenses "security,logic,perf,tests"
                                Review perspectives (default: all 4)
  --severity critical|high|medium|low
                                Minimum severity to show (default: low)
  --format markdown|github-comment
                                Output format (default: markdown)
  --agents N                    Number of review agents (default: from shared config)
  --thorough                    Enhanced recall: dedicated recall agent, 10 observations max

Lenses (default 4 + extended 3):
  security       Injection, auth, secrets, OWASP Top 10
  logic          Bugs, edge cases, off-by-one, null handling
  perf           N+1, memory leaks, complexity, blocking I/O
  tests          Missing tests, untested paths, test quality
  architecture   Module boundaries, coupling, SRP (--agents 5+)
  docs           Public API docs, outdated comments (--agents 6+)
  errors         Error handling, recovery paths (--agents 7+)

Presets:
  --preset quick       security + logic (2 agents, ~2min)
  --preset standard    4 core lenses (~5min)
  --preset security    security × 3 agents (redundant verification)
  (default)            all 7 lenses, 7 agents

Examples:
  /x-review                                     Smart detect: PR or diff
  /x-review diff
  /x-review pr                                  Auto-detect PR from branch
  /x-review diff --preset quick
  /x-review diff --lenses "security,logic" --severity high
  /x-review pr 142 --format github-comment
```

---

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

### Perspective Prompts

Each agent receives a combination of `{universal_principles}` + perspective prompt.

**security:**
```
{universal_principles}

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
```

**logic:**
```
{universal_principles}

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
```

**perf:**
```
{universal_principles}

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
```

**tests:**
```
{universal_principles}

## Code Review: Test Coverage

Principles:
1. Tests verify behavior, not implementation — Check "input X produces output Y," not "internal method called 3 times." Implementation-coupled tests block refactoring.
2. Riskier paths need tests more — Do not demand tests for every function. Prioritize paths where failure is costly: payments, auth, data deletion, external API calls.
3. A false-confidence test is worse than no test — An assertion-free test, an always-passing test, or a test that verifies nothing about actual behavior just creates the illusion of coverage.

Judgment criteria:
- Does each newly added public function/endpoint have a corresponding test?
- Are error paths (catch, error callback, failure branches) tested?
- Do assertions verify meaningful behavior? (Simply "no error thrown" is insufficient)
- Do mocks diverge from real behavior enough to make the test meaningless?

Severity calibration:
- Critical: No tests at all for high-risk logic (payments, auth, data deletion).
- High: New public API/endpoint has no tests. Existing tests do not cover new branches.
- Medium: Insufficient edge case tests. Weak assertions (toBeTruthy instead of toEqual).
- Low: Missing tests for internal utility functions. Demanding tests for doc/config changes.

Ignore when:
- Pure type definitions, interfaces, DTO declarations (no logic)
- Simple re-exports or config file changes
- Generated code (protobuf, GraphQL codegen)
- Simple delegation functions already covered by integration tests
- Trivial formatting/logging changes

Good finding example:
[High] src/services/payment.ts:89 — processRefund() newly added but has no tests. Partial refund (amount < total), already-refunded order, and insufficient balance cases are all unverified.
→ Fix: Add 4 test cases in payment.test.ts: success, partial refund, duplicate refund, insufficient balance

Bad finding example (DO NOT write like this):
[Medium] src/services/payment.ts:89 — No tests found.
→ Fix: Add tests.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Why: cite the specific severity calibration criterion that applies
→ Fix: one-line fix suggestion

If your Why does not match the severity calibration criteria above, use a lower severity.

Max 10 findings. If no issues found, output: [Info] No test coverage issues detected.
```

**architecture:**
```
{universal_principles}

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
```

**docs:**
```
{universal_principles}

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
```

**errors:**
```
{universal_principles}

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
```

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

---

## Severity Definitions

| Severity | Criteria |
|----------|----------|
| **Critical** | Immediately exploitable security vulnerability, data loss risk, production-breaking bug |
| **High** | Feature defect, unhandled error path, severe performance degradation (10x+ slowdown) |
| **Medium** | Code quality issue **introduced by this diff**, minor performance problem, incomplete test coverage |
| **Low** | Style, missing documentation, improvement suggestion, **following an existing repo-wide pattern** |

---

## Data Directory

Review state is stored in `.xm/review/`.

```
.xm/review/
├── last-result.json                    # Latest review result (JSON)
├── last-result.md                      # Latest review result (Markdown, human-readable)
└── history/
    └── {YYYY-MM-DD}-{ref-slug}.md      # Past review reports
```

### Review Result MD Save (MANDATORY)

After every review completes, save the Phase 4 final output as an MD file under `.xm/review/`. **This step cannot be skipped.**

1. `last-result.md` — latest review result (overwrite)
2. `history/{YYYY-MM-DD}-{ref-slug}.md` — preserve history

**ref-slug generation:**
- `diff HEAD~1` → `head-1`
- `pr 142` → `pr-142`
- `diff main..HEAD` → `main-head`
- `full` → `full`
- `file src/auth.ts` → `file-src-auth-ts`

**MD file content:** Save Phase 4 final output (verdict, findings, summary table, observations) as-is.
Prepend metadata at the top of the file:
```markdown
# x-review: {target} — {verdict}
- Date: {YYYY-MM-DD HH:MM}
- Branch: {branch}
- Lenses: {lenses}
- Agents: {N}
- Findings: {count} (Critical: {n}, High: {n}, Medium: {n}, Low: {n})

---
{Phase 4 output}
```

### last-result.json Schema

```json
{
  "timestamp": "ISO8601",
  "target": { "type": "diff|pr|file", "ref": "HEAD~1|142|src/auth.ts" },
  "lenses": ["security", "logic", "perf", "tests"],
  "agents": 4,
  "verdict": "LGTM|Request Changes|Block",
  "findings": [
    {
      "severity": "Critical|High|Medium|Low",
      "file": "src/auth.ts",
      "line": 42,
      "description": "SQL injection via unsanitized user input",
      "fix": "Use parameterized query",
      "lenses": ["security", "logic"],
      "consensus": true
    }
  ],
  "summary": {
    "security": { "total": 2, "critical": 1, "high": 1, "medium": 0, "low": 0 },
    "logic":    { "total": 1, "critical": 0, "high": 1, "medium": 0, "low": 0 },
    "perf":     { "total": 1, "critical": 0, "high": 0, "medium": 1, "low": 0 },
    "tests":    { "total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0 }
  }
}
```

---

## Shared Config Integration

x-review references shared settings in `.xm/config.json`:

| Setting | Key | Default | Effect |
|---------|-----|---------|--------|
| Agent count | `agent_max_count` | `4` | Default agent count when `--agents` is not specified |

`--agents` takes precedence over shared config when explicitly provided.

---

## Usage From x-build

Used as a quality gate in x-build's Verify phase:

```
# Full diff review in the Verify phase
/x-review diff HEAD~{step_count}

# Block verdict = gate fail
# LGTM / Request Changes = continue
```

### x-build Verdict-to-Gate Mapping

| x-review Verdict | x-build Action |
|------------------|----------------|
| LGTM | `x-build gate pass "x-review LGTM"` |
| Request Changes | Show review results to user, re-review after fixes |
| Block | `x-build gate fail "Critical issues found"` — blocks phase next |

### x-eval Scoring Integration

After review completion, findings can be auto-scored via x-eval:

```
/x-eval score ".xm/review/last-result.json" --rubric review-quality
```

`review-quality` rubric criteria:
- **coverage** (0.30): Were all perspectives sufficiently covered
- **actionability** (0.30): Are findings specific and fixable
- **accuracy** (0.25): Are there no false positives
- **severity-calibration** (0.15): Are severity levels appropriate

### x-memory Integration

Recurring Critical/High findings are auto-saved to x-memory:
```
x-memory save --type failure --title "SQL injection in auth module"
  --why "x-review detected SQLi in 3 consecutive reviews"
  --tags "security,auth,recurring"
```

Condition: Auto-suggested when Critical/High is found 2+ times at the same file/pattern.

---

## Trace Recording

x-review MUST record trace entries to `.xm/traces/` during review execution. See x-trace SKILL.md "Trace Directive Template" for the full schema.

### On review start (MUST)

Before spawning lens agents, generate session ID and record:
```bash
SESSION_ID="x-review-$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 2)"
mkdir -p .xm/traces && echo "{\"type\":\"session_start\",\"session_id\":\"$SESSION_ID\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"v\":1,\"skill\":\"x-review\",\"args\":{\"target\":\"TARGET\",\"preset\":\"PRESET\"}}" >> .xm/traces/$SESSION_ID.jsonl
```

### Per lens agent (SHOULD — best-effort)

After each lens review agent completes, record agent_step with lens name as role, model, estimated tokens, duration, and status.

### On review end (MUST)

After verdict synthesis, record session_end with total duration, agent count, findings count, and verdict.

### Rules
1. session_start and session_end are **MUST** — never skip
2. agent_step is **SHOULD** — best-effort
3. **Metadata only** — never include findings or code snippets in trace entries
4. If trace write fails, log to stderr and continue

---

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "Review this PR" | `pr` (prompt for PR number) |
| "Review the code" | `diff` (default HEAD~1) |
| "Review this file" | `file <path>` |
| "Check security only" | `diff --lenses "security"` |
| "Show critical ones only" | `diff --severity high` |
| "GitHub comment format" | `diff --format github-comment` |

## Interaction Protocol

**CRITICAL: x-review MUST use AskUserQuestion at key decision points.**

Rules:
1. Before starting review → AskUserQuestion to confirm target (file/PR/diff) and lens selection
2. After showing review results → AskUserQuestion for verdict confirmation (LGTM or request changes)
3. For multi-lens review → show each lens result, then AskUserQuestion before final synthesis

Anti-patterns:
- ❌ Auto-detect diff and immediately start reviewing
- ❌ Show findings and declare LGTM without user confirmation
- ✅ Show target + selected lenses, AskUserQuestion("이 설정으로 리뷰를 시작할까요?")
| "Usage" | `list` |
