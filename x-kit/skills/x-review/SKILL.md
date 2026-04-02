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

**Normal mode**: 쉬운 한국어로 안내합니다.
- "verdict" → "결과", "LGTM" → "통과", "Request Changes" → "수정 필요", "Block" → "차단"
- "finding" → "발견", "Critical" → "심각", "High" → "높음", "Medium" → "보통", "Low" → "낮음"
- "severity" → "심각도", "lens" → "관점", "challenge stage" → "재확인", "consensus elevation" → "합의 승격"
- "~하세요" 체 사용, 핵심 정보 먼저

## Arguments

User provided: $ARGUMENTS

## Routing

First word of `$ARGUMENTS`:
- `diff` → [Phase 1: TARGET — diff mode]
- `pr` → [Phase 1: TARGET — pr mode]
- `file` → [Phase 1: TARGET — file mode]
- `full` → [Phase 1: TARGET — full mode]
- `list` → [Subcommand: list]
- Empty input → [Smart Router]
- Natural language → [Smart Router] (interpret intent, then route)
- Unrecognized input → [Subcommand: list] (오타/미지원 명령 안전 처리)

### Smart Router (empty input or natural language)

인자 없이 호출하면 **자동으로 리뷰 범위를 결정**한다. 사용자에게 범위를 묻지 않고 바로 실행.

**Step 1: Context detection (순서 = 라우팅 우선순위)**

```bash
# 1순위: PR 감지 (가장 높은 우선순위)
BRANCH=$(git branch --show-current 2>/dev/null)
PR_NUM=$(gh pr view --json number -q .number 2>/dev/null || echo "")
BASE=$(git merge-base main HEAD 2>/dev/null || git merge-base master HEAD 2>/dev/null || echo "")

# 2순위: 마지막 리뷰 커밋 (main branch용)
LAST_REVIEW=$(jq -r '.reviewed_commit // empty' .xm/review/last-result.json 2>/dev/null || echo "")

# 3순위: 마지막 릴리스 커밋
if [ -z "$LAST_REVIEW" ]; then
  LAST_REVIEW=$(git log --grep="^release:" --format=%H -1 2>/dev/null || echo "")
fi

# 4순위: 마지막 태그
if [ -z "$LAST_REVIEW" ]; then
  TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  [ -n "$TAG" ] && LAST_REVIEW=$(git rev-parse -- "$TAG" 2>/dev/null || echo "")
fi

# 5순위: Fallback
if [ -z "$LAST_REVIEW" ]; then
  LAST_REVIEW="HEAD~10"
fi

# 기준점 유효성 검증 — hex SHA 또는 HEAD~N만 허용
if ! echo "$LAST_REVIEW" | grep -qE '^[0-9a-f]{7,40}$|^HEAD~[0-9]+$'; then
  LAST_REVIEW="HEAD~10"
fi
```

**Step 2: 라우팅 (위에서 아래로, 첫 매치 실행)**

| 우선순위 | 조건 | 리뷰 범위 | 근거 |
|---------|------|----------|------|
| 1 | PR 존재 | `gh pr diff {PR_NUM}` | PR = 리뷰의 자연스러운 단위 |
| 2 | Feature branch (PR 없음) | `diff {BASE}..HEAD` | 브랜치 전체 = 작업 단위 |
| 3 | Main + 기준점 있음 | `diff {LAST_REVIEW}..HEAD` | 마지막 리뷰/릴리스/태그 이후 |
| 4 | Fallback | `diff HEAD~10` | 합리적 기본값 |
| — | Unrecognized input | [Subcommand: list] | 오타/미지원 명령 안전 처리 |

**Step 3: 실행 전 요약 + 대규모 diff 가드**
```
🔍 리뷰 범위: {ref:0:7}..HEAD ({N} 커밋, {M} 파일, +{add}/-{del} 줄)
   기준: {마지막 리뷰 / 릴리스 커밋 / 태그 / HEAD~10}
```

| diff 크기 | 동작 |
|----------|------|
| 0줄 | "변경 사항이 없습니다" 출력, 종료 |
| 1-500줄 | 바로 실행 |
| 500-2000줄 | AskUserQuestion: `--preset thorough` (4렌즈) 또는 `--preset quick` (2렌즈) 선택 |
| 2000줄 이상 | `--preset quick` 강제 적용 (override: `--force-full`) |

**리뷰 완료 시 기준점 저장:**

Phase 4 완료 후 `last-result.json`에 `reviewed_commit` 필드를 기록한다:
```json
{
  "reviewed_commit": "{HEAD의 commit hash}",
  ...기존 필드
}
```
이 값이 다음 Smart Router 실행 시 기준점 1순위가 된다.

**Natural language mapping:**
| User says | Route to |
|-----------|----------|
| "review this PR", "PR 리뷰" | `pr` (auto-detect) |
| "review the code", "코드 리뷰" | Smart Router (자동 범위) |
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
  full                          Full codebase review (분할 리뷰)

Options:
  --lenses "security,logic,perf,tests"
                                Review perspectives (default: all 4)
  --severity critical|high|medium|low
                                Minimum severity to show (default: low)
  --format markdown|github-comment
                                Output format (default: markdown)
  --agents N                    Number of review agents (default: from shared config)

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
  --preset security    security × 3 agents (중복 검증)
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
- If no PR → AskUserQuestion: "PR 번호를 입력해 주세요"

### file <path>

Read the file directly via Read tool. If the path is a directory, list child files and read each one (non-recursive, respecting .gitignore).
Store the result as `{diff_content}`.

### full

프로젝트 전체 코드베이스 리뷰. diff가 아닌 전체 소스를 대상으로 한다.

1. 리뷰 대상 파일 수집:
   ```bash
   git ls-files --cached | grep -E '\.(ts|js|py|go|java|rs|mjs)$' | head -100
   ```
2. **렌즈 우선 분할** — 파일이 아닌 렌즈 기준으로 에이전트 배정:
   - 기본 4개 렌즈 (security, logic, perf, tests) × 전체 파일 목록
   - 각 에이전트가 **하나의 렌즈**로 전체 파일을 스캔 (파일그룹 × 7렌즈 금지)
   - 에이전트 수 = min(렌즈 수, `agent_max_count`)
   - 파일이 20개 이상이면 렌즈별로 파일을 반씩 나눠 2 에이전트 배정
3. 결과를 Phase 4: SYNTHESIZE로 통합

`full` 모드는 비용이 높으므로 실행 전 확인:
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

**--lenses + --agents 상호작용:**
- `--lenses "security" --agents 3` → security를 3개 독립 에이전트로 실행 (중복 검증, Self-Consistency 효과)
- `--lenses "security,logic" --agents 4` → security 2개 + logic 2개 (렌즈별 균등 분배)
- `--lenses "security,logic,perf"` (--agents 없음) → 3개 에이전트, 렌즈별 1개

### Presets (빠른 시작)

| Preset | 렌즈 | 에이전트 | 용도 |
|--------|------|---------|------|
| `--preset quick` | security, logic | 2 | 빠른 핵심 검사 (2분) |
| `--preset standard` | security, logic, perf, tests | 4 | 코드 품질 중심 (5분) |
| `--preset security` | security only | 3 | 보안 집중 (Self-Consistency) |
| (기본, preset 없음) | **전체 7개** | **7** | **전체 리뷰 (기본값)** |

### Agent Count

- 기본: agent count = lens count (**7 lenses = 7 agents**)
- `--preset quick` → 2, `--preset standard` → 4
- `--agents N` 지정 시: N개 에이전트 (렌즈를 N에 맞춰 배정)
- `--agents N`이 렌즈 수보다 적으면: 우선순위 높은 렌즈부터 배정 (security > logic > perf > errors > tests > architecture > docs)

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
2. **Verify against agent output:** Review agents must include the relevant code snippet (3-5 lines around the finding) in their output. The leader verifies the claim against this snippet — **파일을 다시 읽지 않는다.** 스니펫이 없는 finding만 Read tool로 확인.
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

For each issue found, output as:
[Observation] file:line — description
→ Fix: specific change

Observations do NOT affect the verdict. They are informational.
If nothing found, output: No additional observations.
```

**Rules:**
- Observations are appended to the report **after** the verdict section
- Observations do NOT count toward verdict thresholds (not Critical/High/Medium/Low)
- Observations use the `[Observation]` tag — a distinct category, not a severity level
- Maximum 5 observations per review
- If an observation is clearly a real defect (would be Medium+ if severity-rated), the leader **promotes** it to a finding and re-evaluates the verdict

**Why this exists:** x-review's "when in doubt, downgrade" principle optimizes for precision (no false positives) at the cost of recall. This pass recovers recall without inflating severity — observations are advisory, not blocking.

### 4. Sort

Sort by Critical → High → Medium → Low.
Within the same severity, consensus findings come first.

### 5. Apply --severity Filter

`--severity high` → Show only High and above. Counts are based on pre-filter totals.

### 6. Verdict

| Condition | Verdict | 의미 |
|-----------|---------|------|
| 0 Critical, 0 High, Medium ≤ 3 | LGTM ✅ | 머지 가능 |
| 0 Critical, High 1-2 or Medium > 3 | Request Changes 🔄 | 수정 후 재리뷰 |
| 1+ Critical or High > 2 | Block 🚫 | 머지 차단 — 반드시 수정 |

출력에 판정 이유를 포함한다: "Verdict: Request Changes 🔄 — High 1건 발견 (LGTM 기준: High 0건 필요)"

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
├── last-result.md                      # Latest review result (Markdown, 사람이 읽는 용)
└── history/
    └── {YYYY-MM-DD}-{ref-slug}.md      # Past review reports
```

### Review Result MD 저장 (MANDATORY)

모든 리뷰 완료 후, Phase 4 최종 출력을 `.xm/review/` 에 MD 파일로 저장한다. **이 단계는 스킵할 수 없다.**

1. `last-result.md` — 최신 리뷰 결과 (덮어쓰기)
2. `history/{YYYY-MM-DD}-{ref-slug}.md` — 히스토리 보존

**ref-slug 생성:**
- `diff HEAD~1` → `head-1`
- `pr 142` → `pr-142`
- `diff main..HEAD` → `main-head`
- `full` → `full`
- `file src/auth.ts` → `file-src-auth-ts`

**MD 파일 내용:** Phase 4 최종 출력 (verdict, findings, summary table, observations) 그대로 저장.
파일 상단에 메타데이터 추가:
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

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "Review this PR" | `pr` (prompt for PR number) |
| "Review the code" | `diff` (default HEAD~1) |
| "Review this file" | `file <path>` |
| "Check security only" | `diff --lenses "security"` |
| "Show critical ones only" | `diff --severity high` |
| "GitHub comment format" | `diff --format github-comment` |
| "Usage" | `list` |
