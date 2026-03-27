---
name: x-review
description: Multi-perspective code review orchestrator — PR diff analysis with severity-rated findings and LGTM verdict
---

<Purpose>
x-review는 PR diff, 파일, 또는 디렉토리를 입력받아 다수의 리뷰 에이전트를 병렬로 구동한다. 각 에이전트는 전담 관점(보안, 로직, 성능, 테스트 커버리지)에서 발견사항을 severity + file:line 형식으로 보고하고, 리더가 통합 보고서와 LGTM / Request Changes / Block 판정을 발행한다.
</Purpose>

<Use_When>
- User wants to review a PR, file, or directory
- User says "리뷰", "코드 리뷰", "PR 확인", "diff 분석", "review"
- User says "보안 취약점 확인", "성능 문제 찾아줘", "테스트 커버리지 확인"
- Other x-kit skills need a code quality gate
</Use_When>

<Do_Not_Use_When>
- Simple single-line questions that don't need multi-agent review
- Structured problem solving (use x-solver instead)
- Full project lifecycle management (use x-build instead)
</Do_Not_Use_When>

# x-review — Multi-Perspective Code Review

Claude Code 네이티브 Agent tool 기반 병렬 리뷰 오케스트레이터.
외부 의존성 없음. `git`, `gh` CLI만 있으면 동작.

## Arguments

User provided: $ARGUMENTS

## Routing

`$ARGUMENTS`의 첫 단어:
- `diff` → [Phase 1: TARGET — diff mode]
- `pr` → [Phase 1: TARGET — pr mode]
- `file` → [Phase 1: TARGET — file mode]
- `list` → [Subcommand: list]
- 빈 입력 또는 그 외 → [Subcommand: list]

---

## Subcommand: list

```
x-review — Multi-Perspective Code Review Orchestrator

Commands:
  diff [ref]                    Review git diff (default: HEAD~1)
  pr [number]                   Review GitHub PR (uses gh CLI)
  file <path>                   Review specific file(s)

Options:
  --lenses "security,logic,perf,tests"
                                Review perspectives (default: all 4)
  --severity critical|high|medium|low
                                Minimum severity to show (default: low)
  --format markdown|github-comment
                                Output format (default: markdown)
  --agents N                    Number of review agents (default: from shared config)

Lenses:
  security     Injection, auth, secrets, OWASP Top 10
  logic        Bugs, edge cases, off-by-one, null handling
  perf         N+1, memory leaks, complexity, blocking I/O
  tests        Missing tests, untested paths, test quality

Examples:
  /x-review diff
  /x-review diff HEAD~3
  /x-review pr 142
  /x-review file src/auth.ts
  /x-review diff --lenses "security,logic" --severity high
  /x-review pr 142 --format github-comment --agents 2
```

---

## Phase 1: TARGET

diff, PR, 또는 파일에서 리뷰 대상 콘텐츠를 수집한다.

### diff [ref]

```bash
git diff HEAD~1    # ref가 없으면 기본값
git diff {ref}     # ref가 있으면 해당 ref 사용
```

Bash tool로 실행. 결과 전체를 `{diff_content}`로 보관.
파일 확장자에서 언어 자동 감지 (`.ts`, `.py`, `.go` 등).

### pr [number]

```bash
gh pr diff {number}
```

Bash tool로 실행. 결과를 `{diff_content}`로 보관.
`number`가 없으면 사용자에게 PR 번호 질문.

### file <path>

Read tool로 파일 직접 읽기. 경로가 디렉토리면 하위 파일 목록 후 각각 읽기.
결과를 `{diff_content}`로 보관.

---

## Phase 2: ASSIGN

`--lenses` 옵션 또는 자동으로 리뷰 관점을 배정한다.

### 기본 4개 관점

| Agent | Lens | 집중 영역 |
|-------|------|----------|
| Agent 1 | security | Injection, XSS, CSRF, auth/authz, hardcoded secrets, OWASP Top 10 |
| Agent 2 | logic | 버그, 엣지 케이스, off-by-one, null/undefined 처리, 타입 오류 |
| Agent 3 | perf | N+1 쿼리, 메모리 누수, 복잡도, blocking I/O, 불필요한 재계산 |
| Agent 4 | tests | 테스트 누락, 미검증 경로, 테스트 품질, 경계값 테스트 |

### --agents > 4 시 추가 관점

| Agent | Lens | 집중 영역 |
|-------|------|----------|
| Agent 5 | architecture | 모듈 경계, 결합도, 단일 책임 원칙 |
| Agent 6 | docs | 인라인 주석, 공개 API 문서, 변경 이력 |
| Agent 7 | errors | 에러 처리, 복구 경로, 실패 전파 |
| Agent 8+ | (추가 security/logic 에이전트) | 심층 분석 |

### --lenses 지정 시

`--lenses "security,logic"` → 명시된 관점만 사용, 에이전트 수를 맞춤.
`--lenses`와 `--agents`가 모두 있으면 → agents 수에 맞게 lenses를 반복 배정.

### Shared Config에서 에이전트 수 결정

`--agents`가 없으면 shared config의 `agent_max_count` 값을 사용한다 (기본 4).

---

## Phase 3: REVIEW

fan-out — 각 에이전트에게 diff + 전담 관점 프롬프트를 동시에 전달한다.

**하나의 메시지에서 N개의 Agent tool을 동시에 호출:**

```
Agent tool 1: {
  description: "x-review: security",
  prompt: "## Code Review: Security\n\n{diff_content}\n\n[관점 프롬프트]",
  run_in_background: true,
  model: "sonnet"
}
Agent tool 2: {
  description: "x-review: logic",
  prompt: "## Code Review: Logic\n\n{diff_content}\n\n[관점 프롬프트]",
  run_in_background: true,
  model: "sonnet"
}
... (N개)
```

### 관점별 프롬프트

각 에이전트에게 전달하는 관점 프롬프트:

**security:**
```
Review this code from a security perspective.
Focus: injection attacks (SQL, command, LDAP), XSS/CSRF/SSRF, authentication and
authorization flaws, hardcoded secrets or API keys, insecure deserialization,
sensitive data exposure, OWASP Top 10 categories.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Fix: one-line fix suggestion

Max 10 findings. If no issues found, output: [Info] No security issues detected.
```

**logic:**
```
Review this code from a logic correctness perspective.
Focus: bugs, off-by-one errors, null/undefined dereferences, incorrect conditionals,
race conditions, infinite loops, incorrect type assumptions, missing error returns.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Fix: one-line fix suggestion

Max 10 findings. If no issues found, output: [Info] No logic issues detected.
```

**perf:**
```
Review this code from a performance perspective.
Focus: N+1 query patterns, memory leaks, O(n²) or worse algorithms, blocking I/O
in async contexts, unnecessary recomputation, missing pagination, large allocations,
inefficient data structures.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Fix: one-line fix suggestion

Max 10 findings. If no issues found, output: [Info] No performance issues detected.
```

**tests:**
```
Review this code from a test coverage perspective.
Focus: missing unit tests for new functions, untested error paths, untested edge cases,
test quality (assertions that don't verify behavior), missing integration tests for
critical flows, tests that mock too much.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Fix: one-line fix suggestion

Max 10 findings. If no issues found, output: [Info] No test coverage issues detected.
```

**architecture:**
```
Review this code from an architectural perspective.
Focus: single responsibility violations, tight coupling, abstraction leaks,
circular dependencies, inappropriate layer crossing, missing interfaces.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Fix: one-line fix suggestion

Max 10 findings. If no issues found, output: [Info] No architecture issues detected.
```

**docs:**
```
Review this code from a documentation perspective.
Focus: missing JSDoc/docstring for public APIs, unclear variable names, missing
inline comments for complex logic, stale comments that contradict code, missing
changelog entries for breaking changes.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Fix: one-line fix suggestion

Max 10 findings. If no issues found, output: [Info] No documentation issues detected.
```

**errors:**
```
Review this code from an error handling perspective.
Focus: swallowed exceptions, missing error propagation, overly broad catch blocks,
missing cleanup on failure, inconsistent error types, panic without recovery.

For each finding, output exactly:
[Critical|High|Medium|Low] file:line — description
→ Fix: one-line fix suggestion

Max 10 findings. If no issues found, output: [Info] No error handling issues detected.
```

---

## Phase 4: SYNTHESIZE

모든 에이전트가 완료되면 리더가 통합 보고서를 생성한다.

### 1. 파싱

각 에이전트 결과에서 findings를 파싱:
```
[Severity] file:line — description
→ Fix: ...
```

`[Info]` 라인은 건너뜀.

### 2. 중복 제거

- 같은 `file:line`에서 다른 에이전트가 동일 문제를 보고한 경우 → 하나로 합치고 출처 렌즈를 모두 표기
- 합쳐진 findings는 "consensus" 표시

### 3. 정렬

Critical → High → Medium → Low 순으로 정렬.
같은 severity 내에서 consensus findings 우선.

### 4. --severity 필터 적용

`--severity high` → High 이상만 출력. 카운트는 필터 전 전체 기준.

### 5. 판정

| 조건 | 판정 |
|------|------|
| Critical 0개, High ≤ 2개 | LGTM |
| Critical 0개, High > 2개 또는 Medium 다수 | Request Changes |
| Critical 1개 이상 | Block |

### 6. 출력 형식

#### format: markdown (기본)

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

| Severity | 기준 |
|----------|------|
| **Critical** | 즉시 악용 가능한 보안 취약점, 데이터 손실 위험, 프로덕션 장애 유발 버그 |
| **High** | 기능 결함, 미처리 에러 경로, 성능 심각 저하 (10x+ 느려짐) |
| **Medium** | 코드 품질 문제, 경미한 성능 이슈, 불완전한 테스트 커버리지 |
| **Low** | 스타일, 문서 누락, 개선 제안 |

---

## Data Directory

리뷰 상태는 `.xm/review/`에 저장한다.

```
.xm/review/
└── last-result.json    # 최근 리뷰 결과 (판정, findings, 에이전트별 요약)
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

x-review는 `.xm/config.json`의 공유 설정을 참조한다:

| 설정 | 키 | 기본값 | 영향 |
|------|-----|--------|------|
| 에이전트 수 | `agent_max_count` | `4` | `--agents` 미지정 시 기본 에이전트 수 결정 |

`--agents`를 명시하면 shared config보다 우선한다.

---

## x-build에서 사용하는 방법

x-build Verify 페이즈에서 품질 게이트로 활용:

```
# Verify 페이즈에서 전체 diff 리뷰
/x-review diff HEAD~{step_count}

# Block 판정이면 gate fail
# LGTM / Request Changes이면 계속 진행
```

---

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "PR 리뷰해줘" | `pr` (PR 번호 질문) |
| "코드 리뷰해줘" | `diff` (HEAD~1 기본) |
| "이 파일 리뷰" | `file <path>` |
| "보안 취약점만 확인" | `diff --lenses "security"` |
| "심각한 것만 보여줘" | `diff --severity high` |
| "GitHub 코멘트 형식으로" | `diff --format github-comment` |
| "사용법" | `list` |
