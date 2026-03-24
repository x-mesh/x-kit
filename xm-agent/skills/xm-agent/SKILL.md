---
name: xm-agent
description: Agent primitives — fan-out, delegate, broadcast, collect, status for Claude Code native multi-agent orchestration
---

<Purpose>
Structured agent primitives on top of Claude Code's native Agent tool. Provides reusable patterns (fan-out, delegate, broadcast, collect) that xm-op, xm-build, and users can call directly.
</Purpose>

<Use_When>
- User wants to send a task to multiple agents in parallel
- User says "fan-out", "delegate", "broadcast", "ask N agents"
- Other xm-kit skills need agent primitives
- User wants direct agent control without a full strategy
</Use_When>

<Do_Not_Use_When>
- User wants a structured strategy (use /xm-op instead)
- Single simple task (just use Agent tool directly)
</Do_Not_Use_When>

# xm-agent — Agent Primitives

Claude Code 네이티브 Agent tool 위의 구조화된 에이전트 프리미티브.
외부 의존성 없음. Claude Code만 있으면 동작.

## Arguments

User provided: $ARGUMENTS

## Routing

`$ARGUMENTS`의 첫 단어:
- `fan-out` → [Primitive: fan-out]
- `delegate` → [Primitive: delegate]
- `broadcast` → [Primitive: broadcast]
- `status` → [Primitive: status]
- `list` 또는 빈 입력 → [Subcommand: list]

---

## Subcommand: list

```
xm-agent — Agent Primitives for Claude Code

Primitives:
  fan-out <prompt> [options]     Send same prompt to N agents in parallel
  delegate <role> <prompt>       Send to one agent with a specific role
  broadcast <prompt> [options]   Send different context to each agent
  status                         Show active background agents

Options:
  --agents N                     Number of agents (default 3)
  --model sonnet|opus|haiku      Agent model (default sonnet)
  --background                   Run in background (default for fan-out)
  --foreground                   Wait for result (default for delegate)
  --role <name>                  Agent role/description
  --roles "r1,r2,r3"             Per-agent role presets (comma-separated)
  --context <text>               Additional context to inject

Role Presets:
  explorer     Codebase exploration, structure mapping          (haiku)
  se           Implementation, refactoring, testing             (sonnet)
  sre          Infrastructure, monitoring, SLO, incidents       (sonnet)
  architect    System design, trade-offs, ADR                   (opus)
  reviewer     Code review, quality, maintainability            (sonnet)
  security     OWASP, vulnerabilities, auth/authz               (sonnet)
  debugger     Error tracing, root cause, regression isolation  (sonnet)
  optimizer    Performance profiling, caching, query tuning     (sonnet)
  documenter   API docs, README, changelog, onboarding          (haiku)

Examples:
  /xm-agent fan-out "이 코드의 버그를 찾아라" --agents 5
  /xm-agent delegate security "src/auth.ts 보안 검토"
  /xm-agent broadcast "각자 관점에서 리뷰" --agents 3
  /xm-agent delegate architect "DB 스키마 설계" --model opus
  /xm-agent fan-out "PR 리뷰해줘" --roles "se,security,reviewer"
```

---

## Primitive: fan-out

**같은 프롬프트를 N개 에이전트에게 동시에 전달하고, 모든 결과를 수집한다.**

### 파싱

`$ARGUMENTS`에서:
- 첫 단어 이후 = prompt (따옴표 안의 전체 텍스트)
- `--agents N` = 에이전트 수 (기본 3)
- `--model sonnet|opus|haiku` = 모델 (기본 sonnet)
- `--role <name>` = 에이전트 역할 설명 (기본: "agent")
- `--roles "se,sre,security"` = 에이전트별 역할 프리셋 (쉼표 구분)
- `--context <text>` = 추가 맥락 주입

### --roles 옵션

`--roles "se,sre,security"` 지정 시, 각 에이전트에 해당 역할 프리셋이 적용된다:

```
Agent 1: se 프리셋 주입 + 공통 prompt
Agent 2: sre 프리셋 주입 + 공통 prompt
Agent 3: security 프리셋 주입 + 공통 prompt
```

`--roles`가 없으면 기존 동작 (동일 프롬프트).
`--roles`의 역할 수와 `--agents N`이 다르면, roles 수에 맞춤.

### 실행

**하나의 메시지에서 N개의 Agent tool을 동시에 호출한다:**

```
Agent tool 1: {
  description: "agent-1: {role}",
  prompt: "{context가 있으면 context}\n\n{prompt}",
  run_in_background: true,
  model: "{model}"
}
Agent tool 2: {
  description: "agent-2: {role}",
  prompt: "{같은 prompt}",
  run_in_background: true,
  model: "{model}"
}
... (N개)
```

### 결과 수집

모든 에이전트가 완료되면:
1. 각 에이전트의 결과를 번호와 함께 정리
2. 사용자에게 종합 결과 출력:

```
📡 [fan-out] {N}개 에이전트 완료

## Agent 1
{결과}

## Agent 2
{결과}

## Agent 3
{결과}

---
💡 공통점: {리더가 분석한 공통 패턴}
⚡ 차이점: {주요 차이점}
```

---

## Primitive: delegate

**하나의 에이전트에게 특정 역할로 위임하고, 결과를 즉시 받는다.**

### 파싱

`$ARGUMENTS`에서:
- `delegate` 다음 단어 = role
- 나머지 = prompt
- `--model sonnet|opus|haiku` = 모델 (기본 sonnet, role이 "architect" 등이면 자동 opus)
- `--background` = 백그라운드 실행 (기본: foreground)
- `--context <text>` = 추가 맥락

### 모델 자동 라우팅

| Role 키워드 | 모델 |
|------------|------|
| architect, analyst, critic, planner | opus |
| se, sre, reviewer, security, debugger, optimizer, executor, builder, fixer, tester | sonnet |
| explorer, documenter, scanner, linter | haiku |

`--model`로 명시하면 자동 라우팅을 오버라이드.

### 역할 프리셋 자동 주입

delegate에서 역할 이름이 등록된 프리셋과 일치하면, 해당 프리셋의 시스템 프롬프트가 자동으로 에이전트 프롬프트에 주입된다:

예시:
- `/xm-agent delegate sre "이 서비스 점검해"` → SRE 체크리스트가 프롬프트에 포함
- `/xm-agent delegate explorer "코드 파악해"` → 탐색 전략이 프롬프트에 포함
- 알 수 없는 역할이면 → 프리셋 없이 기본 delegate 동작

### 실행

```
Agent tool: {
  description: "{role}",
  prompt: "{context}\n\n## Role: {role}\n{prompt}",
  run_in_background: false (foreground),
  model: "{auto-routed model}"
}
```

### 결과

```
📌 [delegate] {role} ({model}) 완료

{에이전트 결과}
```

---

## Primitive: broadcast

**각 에이전트에게 다른 맥락/역할을 부여하여 동시에 전달한다.**

### 파싱

`$ARGUMENTS`에서:
- `broadcast` 다음 = 공통 prompt
- `--agents N` = 에이전트 수 (기본 3)
- `--roles "security,performance,logic"` = 에이전트별 역할 (쉼표 구분)
- `--model` = 모델
- `--context` = 공통 맥락

`--roles`에 프리셋 이름을 사용하면 해당 역할의 전문 프롬프트가 자동 주입된다.

### 역할 미지정 시 자동 배정

`--roles`가 없으면 에이전트 수에 따라 자동:

| N | 자동 역할 |
|---|---------|
| 2 | analyst, critic |
| 3 | security, performance, logic |
| 4 | security, performance, logic, architecture |
| 5+ | security, performance, logic, architecture, testing, ... |

### 실행

```
Agent tool 1: {
  description: "agent-1: {role_1}",
  prompt: "{context}\n\n## Your Role: {role_1}\n{prompt}\n\n{role_1} 관점에서 분석하라.",
  run_in_background: true,
  model: "{model}"
}
Agent tool 2: {
  description: "agent-2: {role_2}",
  prompt: "{context}\n\n## Your Role: {role_2}\n{prompt}\n\n{role_2} 관점에서 분석하라.",
  run_in_background: true,
  model: "{model}"
}
```

### 결과

```
📡 [broadcast] {N}개 에이전트 ({roles}) 완료

## 🔒 Security
{결과}

## ⚡ Performance
{결과}

## 🧩 Logic
{결과}
```

---

## Primitive: status

현재 백그라운드에서 실행 중인 에이전트 목록을 보여준다.

```
📊 [status] Active agents

  🔵 agent-1: security review     running (45s)
  🔵 agent-2: performance check   running (45s)
  ✅ agent-3: logic review         completed (32s)
```

이 정보는 Claude Code의 내부 상태에서 추적한다. 별도 저장소 불필요.

---

## Role Presets

등록된 역할 이름을 delegate/fan-out/broadcast에 사용하면 해당 전문 프롬프트가 자동 주입된다.

| Role | Model | Icon | 설명 |
|------|-------|------|------|
| explorer | haiku | 🗺️ | Codebase exploration, structure mapping |
| se | sonnet | 🛠️ | Implementation, refactoring, testing |
| sre | sonnet | 🔧 | Infrastructure, monitoring, SLO, incidents |
| architect | opus | 🏛️ | System design, trade-offs, ADR |
| reviewer | sonnet | 🔍 | Code review, quality, maintainability |
| security | sonnet | 🔒 | OWASP, vulnerabilities, auth/authz |
| debugger | sonnet | 🐛 | Error tracing, root cause, regression isolation |
| optimizer | sonnet | ⚡ | Performance profiling, caching, query tuning |
| documenter | haiku | 📝 | API docs, README, changelog, onboarding |

### explorer (haiku)

```
- Map directory structure and identify key modules
- Find entry points (main, index, app, server)
- Trace dependency graph (imports, packages)
- Identify patterns (MVC, layered, microservice, monorepo)
- List config files, env vars, build scripts
- Summarize tech stack (language, framework, DB, infra)
```

### se (sonnet)

```
- Implement features following existing code patterns
- Write clean, tested, documented code
- Refactor with backward compatibility
- Follow project conventions (naming, structure, error handling)
- Add unit tests for new code (80%+ coverage target)
- Consider edge cases and error paths
```

### sre (sonnet)

```
- Check SLO/SLI definitions and monitoring coverage
- Review alerting rules and escalation paths
- Assess scaling strategy (horizontal/vertical, autoscaling)
- Verify health checks, readiness/liveness probes
- Check logging, tracing, metrics (observability)
- Review incident response runbooks
- Assess resource utilization and capacity planning
```

### architect (opus)

```
- Evaluate system boundaries and module decomposition
- Assess trade-offs (consistency vs availability, coupling vs cohesion)
- Review data flow and API contracts
- Consider scalability, maintainability, extensibility
- Document decisions as ADRs (context, decision, consequences)
- Identify technical debt and migration paths
```

### reviewer (sonnet)

```
- Check logic correctness, edge cases, off-by-one errors
- Assess code readability and maintainability
- Review error handling and recovery paths
- Check for performance anti-patterns (N+1, memory leaks)
- Verify security basics (input validation, auth checks)
- Ensure test coverage for changed code
```

### security (sonnet)

```
- OWASP Top 10 checklist (injection, XSS, CSRF, SSRF)
- Authentication/authorization review
- Input validation and sanitization
- Secrets management (no hardcoded keys, env var usage)
- Dependency vulnerability scan (known CVEs)
- Data exposure (PII logging, error messages)
```

### debugger (sonnet)

```
- Analyze error messages and stack traces
- Identify reproduction steps
- Trace data flow to find root cause
- Check recent changes (git log/blame) for regression
- Isolate: is it data, code, config, or infra?
- Propose fix with minimal blast radius
```

### optimizer (sonnet)

```
- Profile CPU/memory hotspots
- Identify N+1 queries and optimize data access
- Review caching strategy (TTL, invalidation, layers)
- Check bundle size / startup time
- Assess algorithmic complexity (O(n) vs O(n²))
- Recommend lazy loading, pagination, batching
```

### documenter (haiku)

```
- Generate/update API documentation
- Write clear README sections
- Add JSDoc/docstring for public APIs
- Document architecture decisions
- Create onboarding guides for new developers
- Maintain changelog entries
```

---

## xm-op에서 사용하는 방법

xm-op 전략은 xm-agent 프리미티브를 내부적으로 사용한다:

| xm-op 전략 | 사용하는 프리미티브 |
|-----------|------------------|
| refine (diverge) | fan-out |
| refine (converge/verify) | fan-out (투표/검증) |
| tournament (compete) | fan-out |
| tournament (vote) | fan-out |
| chain | delegate (순차) |
| review | broadcast (관점별) |
| debate (opening) | delegate × 2 (PRO/CON) |
| debate (rebuttal) | delegate × 2 |
| debate (verdict) | delegate × 1 (JUDGE) |
| red-team (attack) | fan-out |
| red-team (defend) | fan-out |
| brainstorm | fan-out |
| distribute | broadcast (서브태스크별) |
| council | fan-out → broadcast → fan-out |

## xm-build에서 사용하는 방법

xm-build의 `run` 커맨드는 xm-agent를 사용:

| xm-build 커맨드 | 사용하는 프리미티브 |
|----------------|------------------|
| `run` (step 실행) | fan-out 또는 broadcast (태스크별 다른 프롬프트) |
| `plan` (AI 분해) | delegate (planner role, opus) |
| `quality` (검증) | delegate (verifier role) |

---

## Advanced: 파이프라인 조합

프리미티브를 직접 조합하여 커스텀 워크플로우를 만들 수 있다:

```
# 1. 코드 분석 (fan-out)
/xm-agent fan-out "src/auth.ts의 문제점을 찾아라" --agents 3

# 2. 결과를 아키텍트에게 위임 (delegate)
/xm-agent delegate architect "위 분석을 종합하여 개선안을 설계하라" --model opus

# 3. 개선안을 다각도 리뷰 (broadcast)
/xm-agent broadcast "이 설계안을 리뷰하라" --roles "security,performance,testing"
```

이 패턴은 xm-op의 `chain` 전략과 유사하지만, 사용자가 각 단계를 직접 제어한다.
