---
name: x-op
description: Strategy orchestration — 18 strategies including refine, tournament, chain, review, debate, red-team, brainstorm, distribute, council, socratic, persona, scaffold, compose, decompose, hypothesis, investigate, monitor, escalate
---

# x-op — Strategy Orchestration (Claude Code Native)

에이전트 팀에게 구조화된 전략을 지시한다.
리더 Claude(너)가 오케스트레이터 겸 합성 역할을 수행하며, **Claude Code 네이티브 Agent tool**로 에이전트를 제어한다.
외부 의존성 없음 (term-mesh, tmux 불필요).

## Arguments

User provided: $ARGUMENTS

## Routing

Parse `$ARGUMENTS`의 첫 단어로 전략을 결정한다:
- `list` → [Subcommand: list]
- `refine` → [Strategy: refine]
- `tournament` → [Strategy: tournament]
- `chain` → [Strategy: chain]
- `review` → [Strategy: review]
- `debate` → [Strategy: debate]
- `red-team` → [Strategy: red-team]
- `brainstorm` → [Strategy: brainstorm]
- `distribute` → [Strategy: distribute]
- `council` → [Strategy: council]
- `socratic` → [Strategy: socratic]
- `persona` → [Strategy: persona]
- `scaffold` → [Strategy: scaffold]
- `compose` → [Strategy: compose]
- `decompose` → [Strategy: decompose]
- `hypothesis` → [Strategy: hypothesis]
- `investigate` → [Strategy: investigate]
- `monitor` → [Strategy: monitor]
- `escalate` → [Strategy: escalate]
- 빈 입력 → 사용자에게 전략 선택 질문

## Options

- `--rounds N` — 라운드 수 (기본 4)
- `--preset quick|thorough|deep` — quick: rounds=2, thorough: rounds=4, deep: rounds=6
- `--preset analysis-deep` — compose 프리셋: `investigate | hypothesis | refine`
- `--preset security-audit` — compose 프리셋: `review | red-team`
- `--preset consensus` — compose 프리셋: `persona | council`
- `--agents N` — 참여 에이전트 수 (기본값: shared config의 agent_max_count (기본 4). 명시하면 오버라이드)
- `--model sonnet|opus|haiku` — 에이전트 모델 (기본 sonnet)
- `--steps "role:task,role:task"` — chain 단계 수동 지정
- `--target <file|dir>` — review/red-team 대상
- `--vote` — brainstorm 도트 투표 활성화
- `--context` — 대화 맥락을 에이전트에게 주입
- `--no-context` — 맥락 주입 비활성화
- `--personas "역할1,역할2,..."` — persona 전략의 역할 수동 지정
- `--bracket single|double` — tournament 브래킷 방식 (기본 single)
- `--weights "role:N,role:N"` — council 가중 투표 (기본 동등)
- `--dry-run` — 실행 계획만 출력 (에이전트 미실행)
- `--resume` — 이전 체크포인트에서 재개
- `--explain` — 의사결정 과정 추적 출력
- `--pipe <strategy>` — 전략 파이프라이닝 (compose)
- `--start haiku|sonnet` — escalate 시작 레벨 (기본 haiku)
- `--threshold N` — escalate 자가평가 임계값 (기본 7)
- `--max-level haiku|sonnet|opus` — escalate 최대 레벨 (기본 opus)
- `--angles "a,b,c"` — investigate 조사 관점 수동 지정
- `--depth shallow|deep|exhaustive` — investigate 조사 깊이 (기본 shallow)
- `--verify` — 전략 완료 후 자동 품질 검증 (judge panel 채점 + 미달 시 재실행)
- `--threshold N` — verify 합격 기준 점수 (기본 7, 1-10)
- `--max-retries N` — verify 실패 시 최대 재시도 횟수 (기본 2)

## Shared Config Integration

x-op은 `.xm/config.json`의 공유 설정을 참조한다:

| 설정 | 키 | 기본값 | 영향 |
|------|-----|--------|------|
| 에이전트 수 | `agent_max_count` | `4` | `--agents` 미지정 시 fan-out/broadcast 에이전트 수 결정 |
| 모드 | `mode` | `developer` | 출력 스타일 (기술 용어 vs 쉬운 말) |

설정 변경: `x-kit config set agent_max_count 10`

Skill layer가 에이전트를 생성할 때 `--agents` 플래그가 없으면 shared config에서 agent_max_count를 읽어 에이전트 수를 결정한다.

## Agent Primitives

이 스킬은 Claude Code 내장 도구만 사용한다:

### fan-out (전원에게 같은 질문)
하나의 메시지에서 N개의 Agent tool을 **동시에** 호출한다:
```
Agent tool 호출 1: { description: "agent-1", prompt: "...", run_in_background: true, model: "sonnet" }
Agent tool 호출 2: { description: "agent-2", prompt: "...", run_in_background: true, model: "sonnet" }
Agent tool 호출 3: { description: "agent-3", prompt: "...", run_in_background: true, model: "sonnet" }
```
모든 에이전트가 같은 프롬프트를 받되, 각자 독립적으로 응답한다.

에이전트 수는 `--agents N` 플래그 또는 shared config의 `agent_max_count`에 따라 결정된다.

### delegate (특정 에이전트에 위임)
Agent tool 1개를 호출한다:
```
Agent tool: { description: "역할명", prompt: "...", run_in_background: false }
```
결과를 즉시 받아 다음 단계에 사용한다.

### broadcast (전원에게 다른 맥락)
fan-out과 동일하되, 각 에이전트에게 **다른** 프롬프트를 전달한다 (예: 다른 에이전트의 결과를 포함).

### 결과 수집
- `run_in_background: true`인 에이전트는 완료 시 자동 알림
- 알림이 오면 결과를 읽고 다음 라운드에 활용

## Subcommand: list

```
x-op — Strategy Orchestration

Strategies:
  refine <topic>          Diverge → converge → verify rounds
  tournament <topic>      Compete → anonymous vote → winner
  chain <topic>           A→B→C sequential pipeline (conditional branching)
  review --target <file>  Multi-perspective code review
  debate <topic>          Pro vs Con → verdict
  red-team --target <f>   Attack → defend → re-attack
  brainstorm <topic>      Free ideation → cluster → vote
  distribute <topic>      Split → parallel execute → merge
  council <topic>         N-party deliberation → weighted consensus
  socratic <topic>        Question-driven deep inquiry
  persona <topic>         Multi-persona perspective analysis
  scaffold <topic>        Design → dispatch → integrate (top-down)
  compose "A | B | C"     Strategy piping / chaining
  decompose <topic>       Recursive decompose → leaf parallel → bottom-up
  hypothesis <topic>      Generate → falsify → adopt surviving hypotheses
  investigate <topic>     Multi-angle investigation → synthesize → gap analysis
  monitor --target <f>    Observe → analyze → auto-dispatch (1-shot watchdog)
  escalate <topic>        haiku→sonnet→opus auto-escalation (cost-optimized)

Options:
  --rounds N              Round count (default 4)
  --preset quick|thorough|deep
  --agents N              Number of agents (default: agent_max_count)
  --model sonnet|opus     Agent model
  --vote                  Enable dot voting (brainstorm)
  --target <file>         Review/red-team target
  --personas "a,b,c"      Persona roles (persona strategy)
  --bracket single|double Tournament bracket type
  --weights "role:N"      Council weighted voting
  --dry-run               Show execution plan only
  --resume                Resume from checkpoint
  --explain               Include decision trace
  --pipe <strategy>       Chain strategies (compose)
  --angles "a,b,c"       Investigation angles (investigate)
  --depth shallow|deep|exhaustive  Investigation depth (investigate)

Examples:
  /x-op refine "Payment API design" --rounds 4
  /x-op tournament "Login implementation" --agents 4 --bracket double
  /x-op debate "Monolith vs microservices"
  /x-op review --target src/auth.ts
  /x-op brainstorm "v2 feature ideas" --vote
  /x-op socratic "Why microservices?" --rounds 4
  /x-op persona "Auth redesign" --personas "engineer,security,pm"
  /x-op scaffold "Plugin system" --agents 4
  /x-op investigate "Auth system" --target src/auth/ --depth deep
  /x-op investigate "Redis vs Memcached" --angles "performance,ecosystem,ops,cost"
  /x-op compose "brainstorm | tournament | refine" --topic "v2 plan"
  /x-op refine "API design" --dry-run
  /x-op tournament "Login" --explain
  /x-op decompose "Implement payment system" --agents 6
  /x-op hypothesis "Why is latency spiking?" --rounds 3
  /x-op escalate "Summarize this codebase" --start haiku
```

---

## Strategy: refine

발산→수렴→검증 라운드 기반 정제.

### Round 1: DIVERGE

> 🔄 [refine] Round 1/{max}: Diverge

Agent tool을 N개 동시 호출 (fan-out):
```
각 에이전트 프롬프트:
"## Task: {TASK}
이 태스크에 대해 독립적으로 해결책을 제시하라. 400단어 이내.
다른 에이전트의 답변을 고려하지 말고 자기만의 접근법을 제안해라."
```
- `run_in_background: true` (병렬)
- 모든 에이전트 완료 대기

### Round 2: CONVERGE

> 🔄 [refine] Round 2/{max}: Converge

너(Claude, 리더)가 직접 전원 결과를 종합:
- 공통점/차이점 파악, 각 강점 추출, 종합안 작성

종합안을 에이전트에게 공유하고 투표 요청 (fan-out):
```
"## 전원 결과 종합
{종합 결과}

가장 좋은 접근법 번호를 선택하고 이유를 2-3줄로 설명하라."
```

투표 결과를 리더가 집계 → 채택안 결정.

### Round 3+: VERIFY

> 🔄 [refine] Round {n}/{max}: Verify

채택안을 에이전트에게 전달 (fan-out):
```
"## 채택안 검증
{채택안}
자신의 관점에서 검증하라. 문제가 있으면 지적하고 수정안 제시. 없으면 'OK'."
```

- **전원 OK** → 조기 종료
- **지적 있음** → 리더가 반영 후 다음 라운드
- **max_rounds 도달** → best-effort 출력

### 최종 출력

```
🔄 [refine] Complete — {실제}/{max} rounds

## 채택된 해결책
{최종안}

## 라운드 요약
| Round | Phase | 참여 | 결과 |
|-------|-------|------|------|
| 1 | Diverge | {N}명 | {N}개 독립 해결책 |
| 2 | Converge | {N}명 | 채택 (득표 {M}/{N}) |
| 3 | Verify | {N}명 | {OK수}/{N} OK |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: tournament

전원 동시 경쟁 → 익명 투표 → 채택.

### Phase 1: COMPETE
> 🏆 [tournament] Phase 1: Compete

fan-out:
```
"최선의 결과를 제출하라. 이것은 경쟁이다 — 가장 뛰어난 결과가 채택된다. 400단어 이내."
```

### Phase 2: ANONYMIZE
리더가 수집된 결과를 익명화:
- 에이전트 이름 제거, 순서 셔플
- "Solution A", "Solution B", "Solution C" 라벨링

### Phase 3: VOTE
fan-out:
```
"아래 솔루션을 1위부터 순위를 매겨라.
{익명화된 솔루션 목록}
형식: 1위: [A|B|C], 2위: [...], ... 이유: [한 줄]"
```

### Phase 4: TALLY
Borda count (1위=N점, 2위=N-1점...). 동점 시 리더 판정.

### 최종 출력
```
🏆 [tournament] Winner: Solution {X} ({에이전트})
| Rank | Solution | Score |
| 1st | {X} | {S} |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: chain

A→B→C 순차 파이프라인.

`--steps "explorer:분석,architect:설계,executor:구현"` 또는 리더가 자동 구성.

### 실행
각 단계마다 Agent tool **1개** 호출 (delegate, foreground):
```
"## Chain Step {n}/{total}: {task}
태스크: {원본}
이전 단계 결과: {이전 결과 또는 '없음'}
위 맥락을 바탕으로 '{task}'를 수행하라. 400단어 이내."
```
결과를 다음 단계 입력으로 전달.

### 최종 출력
```
⛓️ [chain] Complete — {total} steps
| Step | Role | Task | Status |
| 1 | explorer | 분석 | ✅ |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: review

전원이 코드를 다각도 리뷰.

### Phase 1: TARGET
- `--target <file>` → Read tool로 파일 읽기
- 없으면 → `git diff HEAD` (Bash tool)

### Phase 2: ASSIGN
에이전트 수(`--agents N` 또는 `agent_max_count`)에 따라 관점을 동적 배정:

| Agents | 관점 |
|--------|------|
| 3 (기본) | 보안, 로직, 성능 |
| 4 | + 에러 핸들링/복원력 |
| 5 | + 테스트 가능성/커버리지 |
| 6 | + 일관성/코드 규약 |
| 7+ | + DX/가독성, 의존성/호환성 등 리더가 추가 배정 |

### Phase 3: REVIEW
fan-out (각 에이전트에 다른 관점 프롬프트):
```
"## Code Review: {관점}
{코드}
[Critical|High|Medium|Low] 파일:라인 — 설명 형식으로 이슈 보고.
마지막에 자가 평가: 리뷰 충분도 1-10, CONFIDENT 또는 UNCERTAIN."
```

### Phase 4: SYNTHESIZE
리더가 종합: 중복 제거, 심각도별 정렬, 다수 발견 이슈 강조.

### 최종 출력
```
🔍 [review] Complete — {N} agents, {M} issues
| # | Severity | Location | Issue | Found by |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: debate

찬반 토론 후 판정.

### Phase 1: POSITION
`--agents N` (최소 3) → PRO팀, CON팀, JUDGE 자동 분배.

### Phase 2: OPENING
PRO/CON 동시 fan-out:
- PRO: "찬성 측 논거 3가지. 300단어 이내."
- CON: "반대 측 논거 3가지. 300단어 이내."

### Phase 3: REBUTTAL
PRO에게 CON 입론, CON에게 PRO 입론 전달 (fan-out):
"상대 주장에 반박하라. 200단어."

### Phase 4: VERDICT
JUDGE에게 전체 기록 전달 (delegate):
"양측 평가 후 판정. PRO/CON? 최종 권고 200단어."

### 최종 출력
```
⚖️ [debate] Verdict: {PRO|CON}
| Team | Key Argument |
| PRO | {strongest} |
| CON | {strongest} |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: red-team

공격/방어. 취약점 발견 → 수정.

### Phase 1: TARGET
`--target` 또는 `git diff HEAD`로 대상 수집.

### Phase 2: ATTACK
공격팀 fan-out:
"적대적 관점에서 취약점/결함을 최대한 찾아라. [Critical|High|Medium] 위치 — 공격 벡터 — 증명 시나리오."

### Phase 3: DEFEND
방어팀 fan-out (공격 결과 전달):
"각 공격에 대해 수정안 또는 반박 근거를 제시하라."

### Phase 4: REPORT
리더 종합: Fixed(🟢), Partial(🟡), Open(🔴).

### 최종 출력
```
🔴 [red-team] Complete — {total} vulnerabilities
| # | Severity | Attack | Status |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: brainstorm

자유 발산 → 분류 → 투표.

### Phase 1: GENERATE
fan-out:
"이 주제에 대해 아이디어를 최대한 제시하라. 비판 금지. 각 아이디어: 제목 + 1-2줄. 최소 5개."

### Phase 2: CLUSTER
리더가 중복 제거, 테마별 그룹핑, 번호 부여.

### Phase 3: VOTE (--vote 시)
fan-out:
"가장 가치 있는 3개를 선택하라. 형식: 1. [번호], 2. [번호], 3. [번호]"

### 최종 출력
```
💡 [brainstorm] {N} ideas, {T} themes
## Top 5 (--vote 시)
| Rank | Idea | Votes |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: distribute

대규모 태스크를 독립 서브태스크로 분할 → 병렬 실행 → 병합.

### Phase 1: SPLIT
`--splits "role:task,role:task"` 또는 리더가 자동 분할.

### Phase 2: DISPATCH
각 에이전트에 고유 서브태스크 fan-out:
"전체 태스크: {원본}. 당신의 담당: {서브태스크}. 범위 밖 수정 금지."

### Phase 3: MERGE
리더가 전원 결과 병합: 충돌 검사, 테마별 종합.

### 최종 출력
```
📦 [distribute] {N} subtasks, {completed} succeeded
| # | Agent | Subtask | Status |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: council

N명 자유 토의 → 교차 질의 → 심화 → 합의.

### Round 1: OPENING
fan-out: "이 주제에 대한 입장과 근거를 밝혀라. 300단어."

리더가 포지션 맵 구축: 유사 입장 그룹핑, 분기점 파악.

### Round 2: CROSS-EXAMINE
각 에이전트에게 **본인 제외** 타인 입장 전달 (broadcast — 에이전트별 다른 프롬프트):
"다른 참여자 입장을 읽고: 동의 1개 + 의문 1-2개 + 입장 변화 여부."

조기 종료 체크: 전원 합의 → Final로 직행.

### Round 3~N-1: DEEP DIVE
fan-out (핵심 쟁점 집중):
"쟁점 1: {description}. 추가 근거, 타협안, 입장 변화를 밝혀라."

### Final: CONVERGE
리더가 합의안 초안 작성 → fan-out:
"합의안에 AGREE 또는 OBJECT. 최종 입장 한 줄 요약."

결과: FULL CONSENSUS / CONSENSUS WITH RESERVATIONS / NO CONSENSUS.

### 최종 출력
```
🏛️ [council] {status}
## Consensus Statement
{합의문}

## Stance Evolution
| Agent | Round 1 | Final | Changed? |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: socratic

소크라테스식 문답 — 질문만으로 전제를 해체하고 깊은 탐구.

### Phase 1: SEED
> 🧠 [socratic] Phase 1: Seed

delegate (foreground):
```
"## Socratic Seed: {TOPIC}
이 주제에 대해 초기 입장과 핵심 주장을 300단어 이내로 제시하라."
```

### Phase 2: QUESTION ROUNDS
> 🧠 [socratic] Round {n}/{max}: Question

fan-out — 각 에이전트가 질문자 역할:
```
"## 현재 입장
{이전 라운드 결과}

위 주장을 읽고 논리적 허점, 암묵적 전제, 반례를 찾아 날카로운 질문 2-3개를 던져라.
답을 제시하지 말고 질문만 하라."
```

리더가 질문을 종합 → 응답 에이전트(delegate)에게 전달:
```
"다음 질문들에 답변하고 입장을 수정하라:
{종합 질문 목록}
수정된 입장을 300단어 이내로 제시하라."
```

- **질문이 사소해지면** → 조기 종료
- **max_rounds 도달** → best-effort 출력

### 최종 출력
```
🧠 [socratic] Complete — {실제}/{max} rounds

## 최종 정제된 입장
{최종안}

## 질문 추적
| Round | 핵심 질문 | 입장 변화 |
|-------|----------|----------|
| 1 | {질문 요약} | {변화 요약} |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: persona

역할 기반 다관점 분석 — 각 에이전트에 고정 페르소나 부여.

### Phase 1: ASSIGN
> 🎭 [persona] Phase 1: Assign

`--personas "역할1,역할2,..."` 또는 리더가 자동 배정:
- 기본 페르소나: 시니어 엔지니어, 보안 전문가, PM, 신입 개발자
- `--agents N`에 맞춰 페르소나 수 조정

### Phase 2: ANALYZE
> 🎭 [persona] Phase 2: Analyze

broadcast — 각 에이전트에 다른 페르소나 프롬프트:
```
"## Persona: {역할명}
당신은 {역할 설명}이다.
태스크: {TOPIC}
{역할명}의 관점에서 이 태스크를 분석하라:
- 핵심 관심사 (무엇이 중요한가)
- 리스크/우려 사항
- 권장 사항
300단어 이내."
```

### Phase 3: SYNTHESIZE
리더가 전원 분석을 종합:
- 관점별 핵심 요약
- 공통 관심사 vs 갈등 지점
- 통합 권고안

### Phase 4: CROSS-CHECK (선택, --rounds > 2 시)
fan-out — 각 에이전트가 통합안을 자기 페르소나 관점에서 재검증:
```
"## 통합안 검증: {역할명}
{통합안}
{역할명} 관점에서 빠진 것이나 수정할 점이 있는가? 없으면 'OK'."
```

### 최종 출력
```
🎭 [persona] Complete — {N} personas

## 통합 권고안
{최종안}

## 관점별 요약
| Persona | 핵심 관심사 | 권장 | 상충 |
|---------|-----------|------|------|
| 시니어 엔지니어 | {요약} | {권장} | {상충} |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: scaffold

구조 설계 → 모듈 분배 → 병렬 구현 → 통합.

### Phase 1: DESIGN
> 🏗️ [scaffold] Phase 1: Design

delegate (foreground, opus 권장):
```
"## Scaffold Design: {TOPIC}
전체 구조를 설계하라:
- 모듈/컴포넌트 목록과 각각의 책임
- 모듈 간 인터페이스 (입력/출력)
- 의존성 순서
각 모듈은 독립적으로 구현 가능해야 한다. 400단어 이내."
```

### Phase 2: DISPATCH
> 🏗️ [scaffold] Phase 2: Dispatch

설계 결과의 모듈 수에 맞춰 fan-out:
```
"## Scaffold Module: {모듈명}
전체 구조:
{Phase 1 설계 결과}

당신의 담당 모듈: {모듈명}
책임: {모듈 설명}
인터페이스: {입력/출력 스펙}

이 모듈을 구현하라. 다른 모듈의 내부 구현을 가정하지 말고 인터페이스만 사용하라."
```

### Phase 3: INTEGRATE
> 🏗️ [scaffold] Phase 3: Integrate

delegate (foreground):
```
"## Scaffold Integration
전체 설계:
{Phase 1 결과}

모듈별 구현 결과:
{Phase 2 각 에이전트 결과}

모듈들을 통합하라:
- 인터페이스 호환성 검증
- 누락/충돌 해결
- 최종 통합 결과물 출력"
```

### 최종 출력
```
🏗️ [scaffold] Complete — {N} modules

## 구조
{모듈 다이어그램}

## 모듈 상태
| Module | Agent | Status |
|--------|-------|--------|
| {모듈명} | agent-{n} | ✅ |

## 통합 결과
{최종 결과물}
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Enhanced: chain (조건 분기)

기존 chain에 조건부 분기 지원 추가.

### 분기 문법
`--steps` 확장: `if:조건->스텝,else:스텝` 형식으로 DAG 구성.

```
--steps "analyst:분석,if:confidence<0.7->researcher:심층조사,architect:설계,executor:구현"
```

### 실행 흐름
각 스텝 완료 후 리더가 `if` 조건을 평가:
- 조건 충족 → 분기 스텝 실행
- 조건 미충족 → 다음 스텝으로 진행
- 분기 스텝 완료 후 원래 흐름으로 복귀

`--steps` 없이도 리더가 자동 판단: 이전 스텝 결과의 confidence/quality가 낮으면 보강 스텝을 자동 삽입.

---

## Enhanced: tournament (시드 랭킹)

기존 tournament에 시드 배정 추가.

### Phase 0: SEED (신규)
> 🏆 [tournament] Phase 0: Seed

COMPETE 전에 lightweight 평가 (리더가 직접 또는 haiku 에이전트):
- 각 후보 솔루션을 1-10점으로 빠르게 점수화
- 점수 기반으로 브래킷 구성 (강자끼리 늦게 만남)

### 브래킷 옵션
- `--bracket single` — 단일 탈락 (기본)
- `--bracket double` — 더블 엘리미네이션 (패자부활전 포함)
- 에이전트 8명일 때: 8강→4강→결승

나머지 Phase (COMPETE, ANONYMIZE, VOTE, TALLY)는 기존과 동일하되 브래킷 구조 내에서 라운드별 진행.

---

## Enhanced: council (가중 투표)

기존 council에 역할별 가중치 투표 추가.

### 가중치 옵션
`--weights "architect:3,security:2,developer:1"` 또는 리더가 주제 기반 자동 배정.

### 적용 방식
- OPENING: 각 에이전트에 역할 + 가중치 명시
- CONVERGE: 투표 시 가중치 반영
  - `AGREE` 가중치 합 > `OBJECT` 가중치 합 → CONSENSUS
  - 가중 과반 미달 → CONSENSUS WITH RESERVATIONS
- 가중치 근거를 최종 출력에 포함

### 최종 출력 변경
```
🏛️ [council] {status} (weighted)
| Agent | Role | Weight | Vote |
|-------|------|--------|------|
| agent-1 | architect | 3 | AGREE |
| agent-2 | security | 2 | OBJECT |
Weighted: AGREE 4 / OBJECT 2 → CONSENSUS
```

---

## Options: --dry-run

실제 에이전트를 실행하지 않고 실행 계획만 출력.

### 사용법
```
/x-op refine "topic" --dry-run
```

### 출력 내용
```
📋 [dry-run] refine "topic"

Execution Plan:
  Rounds: 4 (preset: thorough)
  Agents: 10 (agent_max_count: 10)
  Model: sonnet

  Round 1 (Diverge):  8 agents × fan-out
  Round 2 (Converge): 8 agents × fan-out + leader synthesis
  Round 3 (Verify):   8 agents × fan-out
  Round 4 (Verify):   8 agents × fan-out (if needed)

  Estimated tokens: ~120K input, ~48K output
  Estimated cost: ~$3.24
```

에이전트 호출 없이 즉시 반환. 리더가 전략 문서를 기반으로 계획을 구성.

---

## Options: --resume

중단된 전략 실행을 체크포인트에서 재개.

### 체크포인트 스키마

각 round/phase 완료 직후, 리더가 `.xm/op-checkpoints/{run-id}.json`에 자동 저장:

```json
{
  "version": 1,
  "run_id": "refine-2026-03-27T12-30-00-000Z",
  "strategy": "refine",
  "topic": "Payment API design",
  "status": "in_progress",
  "created_at": "2026-03-27T12:30:00.000Z",
  "updated_at": "2026-03-27T12:35:42.000Z",
  "options": {
    "rounds": 4,
    "agents": 4,
    "model": "sonnet",
    "preset": "thorough"
  },
  "progress": {
    "total_rounds": 4,
    "completed_rounds": 2,
    "current_phase": "converge",
    "early_exit": false
  },
  "results": [
    {
      "round": 1,
      "phase": "diverge",
      "completed_at": "2026-03-27T12:32:10.000Z",
      "agent_outputs": [
        { "agent_id": "agent-1", "role": "engineer", "output_summary": "REST 기반 접근" },
        { "agent_id": "agent-2", "role": "architect", "output_summary": "GraphQL 접근" }
      ],
      "summary": "3개 접근법 도출: REST, GraphQL, gRPC"
    }
  ],
  "verification": {
    "enabled": false,
    "rubric": "general",
    "threshold": 7,
    "attempts": [
      {
        "attempt": 1,
        "score": 6.2,
        "criteria_scores": { "accuracy": 7, "completeness": 5, "consistency": 6, "clarity": 7, "hallucination-risk": 8 },
        "feedback": "completeness scored lowest — missing edge cases",
        "timestamp": "2026-03-27T12:34:00.000Z"
      }
    ],
    "final_score": 7.8,
    "passed": true
  }
}
```

`run-id` 생성: `{strategy}-{ISO timestamp}` (최초 실행 시 생성, 이후 재사용).

### 저장 워크플로우

각 round/phase 완료 시 리더가 **반드시** 체크포인트를 저장한다:

```bash
# 1. 디렉토리 확인/생성
mkdir -p .xm/op-checkpoints/
```

```javascript
// 2. 체크포인트 저장 (Write tool 사용)
const checkpoint = readJSON(checkpointPath) || { /* 초기 스키마 */ };
checkpoint.results.push({
  round: currentRound,
  phase: currentPhase,
  completed_at: new Date().toISOString(),
  agent_outputs: outputs.map(o => ({ agent_id: o.id, role: o.role, output_summary: o.summary })),
  summary: leaderSynthesis,
});
checkpoint.progress.completed_rounds = currentRound;
checkpoint.updated_at = new Date().toISOString();
writeJSON(checkpointPath, checkpoint);
```

상세 단계:
1. 디렉토리 생성: `mkdir -p .xm/op-checkpoints/`
2. `results` 배열에 현재 round 결과 append — 각 에이전트의 `output_summary`(200자 이내)와 리더의 `summary`를 포함
3. `progress.completed_rounds` 증가, `updated_at` 갱신
4. Write tool로 JSON 파일 저장
5. `--verify` 활성화 시: verification 결과를 체크포인트에 저장
   - 각 attempt의 score, criteria_scores, feedback 기록
   - 최종 선택된 버전의 score를 final_score에 기록

> 주의: 체크포인트 저장 실패 시에도 전략 실행은 중단하지 않는다. 저장은 best-effort.

### 재개 워크플로우

```
/x-op --resume
```

1. `.xm/op-checkpoints/` 에서 `status: "in_progress"` 파일 중 `updated_at` 최신 1개 선택
2. `progress.completed_rounds` 읽기 → `resume_from = completed_rounds + 1`
3. `results[].summary`를 다음 round 프롬프트 앞에 컨텍스트로 주입:
   ```
   "## 이전 실행 컨텍스트 (Round 1~{N} 결과)
   {results 요약}"
   ```
4. `options` 복원하여 해당 round부터 실행 재개
5. 완료 시: `status: "completed"` 기록 → 재개 대상에서 제외

### 체크포인트가 없을 때
`--resume` 사용 시 체크포인트가 없으면: `"⚠ No checkpoint found. Run a strategy first."` 출력.

---

## Options: --explain

최종 결과와 함께 의사결정 과정을 투명하게 출력.

### 사용법
```
/x-op tournament "topic" --explain
```

### 추가 출력
각 전략의 최종 출력에 `## Decision Trace` 섹션 추가:
```
## Decision Trace
| Step | Input | Decision | Rationale |
|------|-------|----------|-----------|
| Diverge | 8 proposals | 3 clusters identified | 유사 접근법 그룹핑 |
| Converge | 3 clusters | Cluster B 채택 (5/8 votes) | 실현 가능성 + 확장성 |
| Verify | Cluster B | 2 issues found, 1 fixed | 보안 이슈 수정 |
```

리더가 각 단계에서 왜 그 결정을 내렸는지를 기록하고 최종 출력에 포함.

---

## Options: --verify

전략 완료 후 자동 품질 검증. judge panel이 결과를 채점하고, 기준 미달 시 피드백을 주입하여 재실행.

### 검증 흐름

```
전략 완료 → Self-Score (자가 채점)
  │
  ├─ --verify 미지정 → Self-Score만 출력, 종료
  │
  └─ --verify 지정 →
      1. Judge Panel 소환 (3 에이전트, fan-out)
      2. 각 judge가 rubric 기준으로 채점
      3. 가중 평균 계산 + σ (합의도)
      │
      ├─ score >= threshold → ✅ PASS, 최종 출력
      │
      └─ score < threshold →
          ├─ retries < max-retries →
          │   a. 최저 점수 criterion 피드백 추출
          │   b. 피드백을 컨텍스트로 주입
          │   c. 전략 재실행 (동일 옵션 + 피드백)
          │   d. retry counter 증가
          │
          └─ retries >= max-retries →
              ⚠ 최고 점수 버전 선택, 경고와 함께 출력
```

### Judge Prompt Template

각 judge 에이전트에 전달하는 프롬프트 (x-eval 채점 형식 준수):

```
"## Quality Evaluation
Rubric: {rubric_name}
Output to evaluate:
{전략 최종 출력 (Self-Score 제외)}

아래 기준으로 1-10점 채점하라 (1=불합격, 5=기본, 7=우수, 10=탁월):

{rubric criteria + weights}

출력 형식 (정확히 준수):
Criterion: {name} | Score: {N} | Reason: {한 줄 근거}
...
Final: {가중평균}/10"
```

### 합의도 판단

| σ | 합의 | 조치 |
|---|------|------|
| < 0.8 | High — 신뢰 가능 | score 그대로 사용 |
| 0.8–1.5 | Medium | score 사용, 주의 표시 |
| > 1.5 | Low | 추가 judge 1명 소환 후 재채점 |

### 재시도 시 피드백 주입

재실행 프롬프트에 추가되는 컨텍스트:
```
"## 이전 실행 피드백
이전 점수: {score}/10
개선 필요 항목:
- {최저 criterion}: {score}/10 — {judge reason}
- {차저 criterion}: {score}/10 — {judge reason}
위 항목을 중점적으로 개선하여 재실행하라."
```

### 검증 결과 출력

```
## Verification
| Attempt | Score | Verdict | Feedback |
|---------|-------|---------|----------|
| 1 | 6.2/10 | ❌ retry | completeness 부족 |
| 2 | 7.8/10 | ✅ pass | - |

Consensus: σ=0.6 (High)
Rubric: general
```

---

## Strategy: compose

여러 전략을 파이프라인으로 연결.

### 사용법
```
/x-op compose "brainstorm | tournament | refine" --topic "v2 feature plan"
```

또는 `--pipe` 플래그:
```
/x-op brainstorm "v2 features" --pipe tournament --pipe refine
```

### 실행 흐름
1. 첫 전략 실행 → 결과 수집
2. 리더가 결과에서 `pipe_payload`를 구성 (아래 스키마 참조)
3. `pipe_payload`를 다음 전략의 입력 컨텍스트로 주입
4. 마지막 전략 결과가 최종 출력

### pipe_payload 표준 스키마

각 전략 완료 후, 리더가 마크다운 결과를 파싱하여 아래 구조를 내부적으로 구성한다 (사용자에게는 기존 마크다운 그대로 노출):

```json
{
  "strategy": "tournament",
  "status": "completed",
  "result": {
    "winner": "Solution B",
    "score": 18,
    "summary": "REST + OpenAPI 방향"
  },
  "candidates": [
    { "id": "A", "summary": "...", "score": 14 },
    { "id": "B", "summary": "...", "score": 18 }
  ],
  "pipe_payload": "다음 전략에 전달할 핵심 내용 텍스트"
}
```

전략별 `pipe_payload` 추출 규칙:
| 전략 | pipe_payload 내용 |
|------|------------------|
| brainstorm | 클러스터 대표 아이디어 목록 (투표 시 상위 N개) |
| tournament | 우승 솔루션 전문 |
| refine | 최종 채택안 전문 |
| review | Critical/High 이슈 목록 |
| debate | 판정 + 핵심 논거 |
| hypothesis | 생존 가설 + 권장 검증 방법 |
| investigate | Key Insights + Knowledge Gaps |
| council | 합의문 (또는 NO CONSENSUS 시 핵심 쟁점) |
| escalate | 최종 레벨의 결과물 |

서브에이전트는 자유 텍스트로 응답하며, JSON 강제는 하지 않는다. pipe_payload 구성은 리더의 책임이다.

### pipe_payload 구성 가이드

리더가 pipe_payload를 구성할 때 따르는 규칙:

1. **추출**: 전략 최종 출력의 마크다운에서 핵심 결과만 추출 (메타데이터, Self-Score 제외)
2. **크기 제한**: pipe_payload는 2000자 이내로 압축. 초과 시 핵심 포인트만 요약
3. **주입 형식**: 다음 전략 프롬프트에 아래 형식으로 주입:
   ```
   ## 이전 전략 결과 ({previous_strategy})
   {pipe_payload}
   ```
4. **누락 방지**: pipe_payload가 비어있으면 compose를 중단하고 사용자에게 알림
5. **변환 불가 시**: 변환 규칙 표에 없는 조합은 pipe_payload를 그대로 텍스트 컨텍스트로 전달

### 변환 규칙
| From → To | 변환 |
|-----------|------|
| brainstorm → tournament | 클러스터 대표 아이디어를 후보로 |
| brainstorm → refine | 최다 득표 아이디어를 시드로 |
| tournament → refine | 우승 솔루션을 정제 대상으로 |
| review → red-team | Critical/High 이슈를 공격 대상으로 |
| chain → review | 체인 최종 출력을 리뷰 대상으로 |
| investigate → debate | 충돌 발견을 PRO/CON 포지션으로 |
| investigate → hypothesis | 지식 갭을 가설로 |
| investigate → review | 식별된 파일을 리뷰 대상으로 |
| investigate → red-team | 발견된 공격면을 타겟으로 |
| investigate → refine | 핵심 인사이트를 seed로 |
| brainstorm → investigate | 상위 아이디어를 조사 주제로 |
| hypothesis → investigate | 생존 가설을 검증 조사 대상으로 |
| hypothesis → scaffold | 채택 가설의 해결책을 모듈 설계 입력으로 |
| hypothesis → chain | 채택 가설을 분석→설계→구현 파이프라인 시드로 |
| council(no-consensus) → debate | 합의 실패 시 찬반 토론으로 에스컬레이션 |
| review → chain "fix" | Critical 이슈를 분석→수정 파이프라인 입력으로 |
| persona → council | 관점별 분석을 합의 토의 입력으로 |

### 최종 출력
```
🔗 [compose] Complete — {N} strategies

## Pipeline
| Step | Strategy | Input | Output |
|------|----------|-------|--------|
| 1 | brainstorm | "v2 features" | 12 ideas, 4 themes |
| 2 | tournament | top 4 ideas | Winner: idea #3 |
| 3 | refine | idea #3 | Refined solution |

## Final Result
{마지막 전략의 출력}
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: decompose

재귀 분해 → 리프 병렬 실행 → bottom-up 조립.

### Phase 1: DECOMPOSE
> 🧩 [decompose] Phase 1: Decompose

delegate (foreground, opus 권장):
```
"## Decompose: {TOPIC}
이 태스크를 재귀적으로 분해하라:
- 각 하위 태스크는 독립적으로 실행 가능해야 한다
- 하위 태스크가 여전히 복잡하면 한 단계 더 분해
- 최종 리프는 에이전트 1명이 한 번에 완료 가능한 크기
- 의존성 순서를 명시 (어떤 리프가 먼저 완료되어야 하는지)

출력 형식:
- 트리 구조 (들여쓰기로 계층 표현)
- 각 리프: [ID] 태스크명 (deps: 없음 또는 ID 목록)"
```

### Phase 2: EXECUTE LEAVES
> 🧩 [decompose] Phase 2: Execute Leaves

의존성 순서에 따라 리프를 fan-out:
- 의존성 없는 리프들을 먼저 병렬 실행
- 완료되면 다음 레벨의 리프들을 병렬 실행
- 각 리프 에이전트 프롬프트:
```
"## Leaf Task: {리프 태스크명}
전체 구조:
{Phase 1 트리}

의존 결과:
{선행 리프 결과들, 없으면 '없음'}

이 리프 태스크를 완료하라. 범위를 벗어나지 말 것."
```

### Phase 3: ASSEMBLE
> 🧩 [decompose] Phase 3: Assemble

bottom-up으로 결과 조립 (delegate, foreground):
```
"## Bottom-up Assembly
전체 트리:
{Phase 1 트리}

리프 결과들:
{Phase 2 각 리프 결과}

리프 결과들을 트리 구조에 따라 bottom-up으로 조립하라:
- 하위 → 상위 순서로 통합
- 리프 간 충돌이 있으면 해결
- 최종 통합 결과물 출력"
```

### 최종 출력
```
🧩 [decompose] Complete — {depth} levels, {leaves} leaves

## 분해 트리
{트리 구조}

## 실행 결과
| Level | Leaf | Status |
|-------|------|--------|
| L2 | {리프명} | ✅ |

## 최종 조립 결과
{통합 결과물}
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: hypothesis

가설 생성 → 반증 시도 → 살아남은 가설만 채택. 버그 진단/과학적 추론에 특화.

### Phase 1: GENERATE
> 🔬 [hypothesis] Phase 1: Generate

fan-out — 각 에이전트가 독립적으로 가설을 생성:
```
"## Hypothesis Generation: {TOPIC}
이 문제에 대해 가능한 가설 2-3개를 제시하라.
각 가설: 제목 + 근거 + 반증 가능한 예측(이 가설이 맞다면 ~해야 한다).
200단어 이내."
```

리더가 수집 → 중복 제거 → 번호 부여 (H1, H2, ...).

### Phase 2: FALSIFY
> 🔬 [hypothesis] Phase 2: Falsify

각 가설에 대해 반증 에이전트 fan-out:
```
"## Falsification: {가설 제목}
가설: {가설 내용}
예측: {반증 가능한 예측}

이 가설을 반증하라:
- 반례나 모순을 찾아라
- 예측이 틀린 경우를 제시하라
- 가설의 전제가 잘못된 근거를 찾아라

결론: FALSIFIED (반증됨) 또는 SURVIVED (살아남음). 근거 필수."
```

### Phase 3: SYNTHESIZE
> 🔬 [hypothesis] Phase 3: Synthesize

리더가 결과 종합:
- FALSIFIED 가설 제거
- SURVIVED 가설들 중 가장 강력한 것 선정
- 살아남은 가설이 없으면 → 새로운 가설 생성 라운드 (max_rounds까지)

### 최종 출력
```
🔬 [hypothesis] Complete — {total} hypotheses, {survived} survived

## 가설 결과
| # | Hypothesis | Status | Rationale |
|---|-----------|--------|-----------|
| H1 | {제목} | ✅ SURVIVED | {근거} |
| H2 | {제목} | ❌ FALSIFIED | {반증 근거} |

## 채택된 가설
{가장 강력한 생존 가설 상세}

## 권장 검증 방법
{가설을 실제로 확인하기 위한 다음 단계}
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: investigate

다각도 조사 → 종합 → 갭 분석. 미지 영역 탐색, 기술 비교, 코드베이스 이해에 특화.

### Phase 1: SCOPE
> 🔎 [investigate] Phase 1: Scope

리더가 조사 범위를 결정:
- `--target` → 조사 대상 파일/디렉토리 확인
- `--angles` → 조사 관점 파싱 (없으면 주제 기반 자동 생성)
- 관점 수를 에이전트 수에 맞춤 (초과 시 병합)

기본 관점 (주제별 자동 선택):
| 주제 패턴 | 감지 기준 | 기본 관점 |
|-----------|----------|----------|
| 코드베이스 | `--target` 있음 또는 파일/모듈명 언급 | `structure`, `data-flow`, `dependencies`, `conventions` |
| 기술 비교 | "vs", "versus", "compared", "비교" 포함 | `performance`, `ecosystem`, `dx`, `tradeoffs` |
| 보안/인증 | "auth", "security", "보안", "인증" 포함 | `authentication`, `authorization`, `attack-surface`, `data-protection` |
| 성능/병목 | "slow", "latency", "성능", "병목" 포함 | `profiling`, `architecture`, `data-access`, `concurrency` |
| 일반 | 위 패턴 미매칭 | `overview`, `mechanics`, `tradeoffs`, `alternatives` |

### Phase 2: EXPLORE
> 🔎 [investigate] Phase 2: Explore ({N} angles)

broadcast — 각 에이전트에 다른 조사 관점 프롬프트. `--depth`에 따라 프롬프트가 달라진다:

**shallow (기본):**
```
"## Investigation: {TOPIC}
관점: {ANGLE_NAME} — {ANGLE_DESCRIPTION}
대상: {--target 또는 'general'}
깊이: shallow — 최대 5개 파일, 웹 검색 금지

'{ANGLE_NAME}' 관점에서 조사하라:
1. 구체적 사실 수집 (파일 읽기만, 웹 검색 하지 말 것)
2. 각 발견에 출처 명시 (파일 경로)
3. 각 발견의 신뢰도: HIGH / MEDIUM / LOW
4. 확인 불가한 사항 (미지 영역) 플래그
5. 자가 평가: 조사 충분도 1-10, CONFIDENT 또는 UNCERTAIN

## Findings / ## Unknowns / ## Self-Assessment
300단어 이내."
```

**deep:**
```
"## Investigation: {TOPIC}
관점: {ANGLE_NAME} — {ANGLE_DESCRIPTION}
대상: {--target 또는 'general'}
깊이: deep — 최대 15개 파일, 웹 검색 허용

'{ANGLE_NAME}' 관점에서 심층 조사하라:
1. 구체적 사실 수집 (파일 읽기, 웹 검색 가능)
2. 각 발견에 출처 명시 (파일 경로, URL, 추론)
3. 각 발견의 신뢰도: HIGH / MEDIUM / LOW
4. 확인 불가한 사항 (미지 영역) 플래그
5. 자가 평가: 조사 충분도 1-10, CONFIDENT 또는 UNCERTAIN

## Findings / ## Unknowns / ## Self-Assessment
500단어 이내."
```

**exhaustive:**
```
"## Investigation: {TOPIC}
관점: {ANGLE_NAME} — {ANGLE_DESCRIPTION}
대상: {--target 또는 'general'}
깊이: exhaustive — 최대 30개 파일, 웹 검색 + 교차 검증 필수

'{ANGLE_NAME}' 관점에서 철저히 조사하라:
1. 구체적 사실 수집 (파일 읽기, 웹 검색, 교차 검증)
2. 각 발견에 출처 명시 (파일 경로, URL, 추론)
3. 각 발견의 신뢰도: HIGH / MEDIUM / LOW
4. 다른 관점과 겹칠 수 있는 발견은 명시적으로 태깅
5. 확인 불가한 사항 (미지 영역) 플래그
6. 자가 평가: 조사 충분도 1-10, CONFIDENT 또는 UNCERTAIN

## Findings / ## Unknowns / ## Self-Assessment
700단어 이내."
```

### Phase 2.5: CROSS-VALIDATE (`--depth deep|exhaustive`에서만)
> 🔎 [investigate] Phase 2.5: Cross-Validate

`--depth deep` 이상에서 자동 활성화. council의 CROSS-EXAMINE 패턴 적용:

broadcast — 각 에이전트에 다른 에이전트의 Findings 전달:
```
"## Cross-Validation: {ANGLE_NAME}
당신의 조사 결과: {자신의 Phase 2 Findings}
다른 관점의 결과: {타 에이전트 Findings 요약}

타 관점 결과를 읽고:
1. 동의하는 발견 1-2개 + 근거
2. 의문이 있는 발견 1-2개 + 이유
3. 자신의 발견 중 수정/보강할 것
200단어 이내."
```

### Phase 3: SYNTHESIZE
> 🔎 [investigate] Phase 3: Synthesize

리더가 전원 결과를 구조화된 규칙으로 종합:

**교차 확인 규칙:**
- 2+ 관점 일치: 신뢰도 → HIGH 확정
- 1개 관점만: 원래 신뢰도 유지
- Phase 2.5에서 동의받은 발견: +1 관점으로 카운트

**충돌 해결 규칙:**
- 동일 주제에 모순 발견: `[CONFLICT]` 태깅 → Phase 4 갭으로 전달
- 다수결 (3+ 관점 합의 vs 1 반대): 다수 채택, 소수 의견 주석

**구조화:**
- 관점별이 아닌 테마별로 재배치
- 각 테마에 교차 확인 점수 부여

**자가 평가 집계:**
- 에이전트 Self-Assessment 평균 < 6: "⚠ 추가 조사 권장" 표시
- UNCERTAIN 에이전트 비율 > 50%: Phase 4에 심화 조사 갭 추가

### Phase 4: GAP ANALYSIS
> 🔎 [investigate] Phase 4: Gap Analysis

delegate (foreground):
```
"## Gap Analysis: {TOPIC}
종합 결과: {Phase 3 종합}
보고된 미지 영역: {Phase 2 Unknowns 집계}

아직 모르는 것을 분석하라:
1. 지식 갭 목록
2. 각 갭의 해소 방법 (읽을 파일, 실행할 실험, 질문할 대상)
3. 중요도: CRITICAL / IMPORTANT / NICE-TO-HAVE
4. 갭 해소에 적합한 x-op 전략 제안:
   - 모호한 발견 → debate 또는 hypothesis
   - 코드 심층 분석 필요 → review 또는 red-team
   - 다관점 필요 → persona 또는 council
   - 반복 정제 필요 → refine
200단어 이내."
```

### 최종 출력
```
🔎 [investigate] Complete — {N} angles, {M} findings, {G} gaps

## Findings
| # | Finding | Confidence | Sources | Angles |
|---|---------|------------|---------|--------|
| 1 | {발견} | HIGH | src/auth.ts:42 | structure, data-flow |
| 2 | {발견} | MEDIUM | 공식 문서 | dependencies |

## Key Insights
- {핵심 인사이트 3-5개}

## Knowledge Gaps
| # | Gap | Importance | Suggested Action |
|---|-----|------------|-----------------|
| 1 | {미지 영역} | CRITICAL | → hypothesis "..." |
| 2 | {미지 영역} | IMPORTANT | → review --target src/ |

## Confidence Summary
- HIGH: {N} ({P}%)
- MEDIUM: {N} ({P}%)
- LOW: {N} ({P}%)
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: escalate

haiku → sonnet → opus 자동 에스컬레이션. 비용 최적화.

### 실행 흐름
> 📈 [escalate] Level 1: haiku

1. **Level 1 (haiku)**: 가장 저렴한 모델로 시작
```
delegate (model: haiku):
"## Task: {TOPIC}
이 태스크를 해결하라. 400단어 이내.
마지막에 자신의 답변 품질을 1-10으로 자가 평가하라.
7 이상이면 'CONFIDENT', 미만이면 'UNCERTAIN'으로 표시."
```

2. **리더 평가**: 결과의 quality를 확인
   - `CONFIDENT` + 리더가 동의 → 종료
   - `UNCERTAIN` 또는 리더가 불충분 판단 → Level 2로 에스컬레이션

> 📈 [escalate] Level 2: sonnet

3. **Level 2 (sonnet)**: 이전 결과를 컨텍스트로 포함
```
delegate (model: sonnet):
"## Escalated Task: {TOPIC}
이전 시도 (haiku):
{Level 1 결과}
이전 시도의 부족한 점을 보완하여 더 나은 결과를 제시하라.
자가 평가: CONFIDENT / UNCERTAIN"
```

4. 동일한 평가 → 필요시 Level 3 (opus)로 에스컬레이션

> 📈 [escalate] Level 3: opus

5. **Level 3 (opus)**: 최종 레벨
```
delegate (model: opus):
"## Final Escalation: {TOPIC}
이전 시도들:
- haiku: {Level 1 결과}
- sonnet: {Level 2 결과}
최종 결과를 제시하라. 이전 시도의 모든 부족한 점을 해결할 것."
```

### 자동 시작 레벨 결정

x-solver의 `classify` 결과에 `complexity` 필드가 있으면 자동으로 시작 레벨을 결정:
| complexity | --start | 이유 |
|------------|---------|------|
| low | haiku | 간단한 태스크 — 최저 비용으로 시작 |
| medium | sonnet | 중간 복잡도 — haiku 단계 스킵 |
| high | sonnet | 높은 복잡도 — haiku로는 부족, sonnet부터 |

수동 `--start` 플래그가 있으면 자동 결정보다 우선한다.

### 옵션
- `--start haiku|sonnet` — 시작 레벨 (기본 haiku, classify complexity 연동 시 자동 결정)
- `--threshold N` — 자가 평가 임계값 (기본 7)
- `--max-level haiku|sonnet|opus` — 최대 에스컬레이션 레벨 (기본 opus)

### 최종 출력
```
📈 [escalate] Complete — resolved at {level}

## Escalation Path
| Level | Model | Quality | Decision |
|-------|-------|---------|----------|
| 1 | haiku | 5/10 | → escalate |
| 2 | sonnet | 8/10 | ✅ accepted |

## Cost Savings
Estimated: ${cost} (vs ${opus_cost} if opus-only, saved ${saved}%)

## Final Result
{최종 결과}
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy: monitor

1회 관찰 → 이상 판단 → 전략 dispatch. 주기성은 외부(cron/tmux)에 위임.

> 주의: Claude Code에 시간 기반 트리거가 없으므로, monitor는 "호출 시점에 1회 관찰"만 수행한다.
> 주기적 감시가 필요하면 외부 cron + `claude -p "/x-op monitor ..."` 또는 OMC `/loop`을 사용한다.

### Phase 1: OBSERVE
> 👁️ [monitor] Phase 1: Observe

리더가 관찰 대상을 수집:
- `--target <file|dir|cmd>` → 파일 읽기, 디렉토리 상태, 또는 Bash 명령 실행
- 없으면 → `git diff HEAD` + `git log --oneline -5` (최근 변경)

### Phase 2: ANALYZE
> 👁️ [monitor] Phase 2: Analyze

broadcast — 각 에이전트에 다른 관찰 관점:
```
"## Monitor: {TARGET}
관찰 대상: {Phase 1 수집 결과}
관점: {ANGLE}

아래 기준으로 이상 여부를 판단하라:
1. 예상 범위를 벗어나는 변경이 있는가
2. 잠재적 문제(버그, 보안, 성능 퇴행)의 징후가 있는가
3. 즉시 조치가 필요한 사항이 있는가

결과: NORMAL / WARNING / ALERT + 근거. 200단어 이내."
```

기본 관점 (에이전트 수에 맞춰 배정):
- `code-quality`: 코드 품질 퇴행
- `security`: 보안 취약점 도입
- `dependency`: 의존성 변경/충돌
- `test-coverage`: 테스트 누락

### Phase 3: DISPATCH
> 👁️ [monitor] Phase 3: Dispatch

리더가 에이전트 결과를 종합:
- **전원 NORMAL** → 요약 출력, 조치 없음
- **WARNING 1개+** → 경고 요약 + 권장 전략 제안
- **ALERT 1개+** → 자동으로 권장 전략 실행 (사용자 확인 후)

자동 dispatch 규칙:
| Alert 유형 | 권장 전략 |
|-----------|----------|
| 보안 취약점 | → red-team --target {file} |
| 코드 품질 퇴행 | → review --target {file} |
| 테스트 누락 | → chain "test-gap-analysis → test-generation" |
| 의존성 충돌 | → investigate "dependency conflict" |
| 복합 이슈 | → hypothesis "What caused {issue}?" |

### 최종 출력
```
👁️ [monitor] Complete — {N} agents, {alerts} alerts, {warnings} warnings

## 관찰 결과
| # | Angle | Status | Finding |
|---|-------|--------|---------|
| 1 | code-quality | ✅ NORMAL | 변경 없음 |
| 2 | security | ⚠️ WARNING | 새 dependency에 known CVE |
| 3 | test-coverage | 🚨 ALERT | 3개 함수 테스트 미작성 |

## 자동 Dispatch
| Alert | Strategy | Status |
|-------|----------|--------|
| test-coverage | → review --target src/auth/ | 실행 대기 (사용자 확인 필요) |
```

리더가 [Self-Score Protocol]에 따라 `## Self-Score` 블록을 최종 출력에 추가한다.

---

## Strategy Selection Guide

사용자가 전략을 모를 때, 아래 의사결정 트리로 추천한다:

```
어떤 종류의 작업인가?
│
├─ 코드 작성/구현 → 규모는?
│   ├─ 단일 모듈 → scaffold
│   ├─ 다수 독립 태스크 → distribute
│   └─ 의존성 있는 트리 → decompose
│
├─ 코드 리뷰/보안 → 목적은?
│   ├─ 품질 검사 → review
│   ├─ 취약점 탐색 → red-team
│   └─ 둘 다 → compose "review | red-team"
│
├─ 의사결정/설계 → 선택지가 있는가?
│   ├─ 2개 대립 → debate
│   ├─ 3개+ 후보 → tournament
│   ├─ 다수 이해관계자 → council
│   └─ 관점별 분석 필요 → persona
│
├─ 문제 해결/디버깅 → 원인을 아는가?
│   ├─ 모름 → hypothesis
│   ├─ 탐색 필요 → investigate
│   └─ 전제를 검증하고 싶음 → socratic
│
├─ 아이디어/기획 → 단계는?
│   ├─ 발산 → brainstorm
│   ├─ 발산→선택→정제 → compose "brainstorm | tournament | refine"
│   └─ 기존안 개선 → refine
│
├─ 순차 워크플로우 → chain
│
├─ 변경 감시/이상 탐지 → monitor
│
└─ 비용 최적화 → escalate
```

### 옵션 적용 가이드

| 전략 | 핵심 옵션 | 설명 |
|------|----------|------|
| refine | `--rounds`, `--preset` | 라운드 수 = 정제 깊이 |
| tournament | `--bracket`, `--agents` | 에이전트 수 = 후보 다양성 |
| review | `--target` | 필수 — 리뷰 대상 파일 |
| debate | `--agents` | 최소 3 (PRO+CON+JUDGE) |
| brainstorm | `--vote` | 투표로 상위 아이디어 선별 |
| council | `--weights` | 역할별 가중 투표 |
| persona | `--personas` | 역할 수동 지정 |
| investigate | `--angles`, `--depth` | 조사 관점과 깊이 |
| escalate | `--start`, `--max-level` | 시작/최대 모델 레벨 |
| compose | `--pipe` | 전략 파이프라이닝 |

## Self-Score Protocol

모든 전략의 최종 출력에 `## Self-Score` 블록을 포함한다. 리더가 전략 완료 후 rubric 기반으로 자가 채점한다.

### Strategy-Rubric 매핑

| Category | Strategies | Default Rubric | Criteria (weight) |
|----------|-----------|----------------|-------------------|
| Code analysis | review, red-team, monitor | code-quality | correctness 0.30, readability 0.20, maintainability 0.20, security 0.20, test-coverage 0.10 |
| Argument/analysis | refine, tournament, debate, council, socratic, hypothesis, investigate | general | accuracy 0.25, completeness 0.25, consistency 0.20, clarity 0.20, hallucination-risk 0.10 |
| Task decomposition | scaffold, decompose, distribute, chain | plan-quality | completeness 0.30, actionability 0.30, scope-fit 0.20, risk-coverage 0.20 |
| Ideation | brainstorm, persona | general | accuracy 0.25, completeness 0.25, consistency 0.20, clarity 0.20, hallucination-risk 0.10 |
| Meta | escalate | inherits from task | - |
| Pipeline | compose | last strategy's rubric | - |

`--rubric <name>` 플래그로 오버라이드 가능.

### Self-Score 출력 형식

모든 전략의 최종 출력 끝에 추가:
```
## Self-Score
| Criterion | Score | Note |
|-----------|-------|------|
| {criterion1} | {1-10} | {한 줄 근거} |
| {criterion2} | {1-10} | {한 줄 근거} |
| ... | ... | ... |
| **Overall** | **{가중 평균}** | |
```

채점 기준: 1=불합격, 5=기본 수준, 7=우수, 10=탁월.

## Interactive Mode

`$ARGUMENTS`가 빈 경우, AskUserQuestion으로 단계적 선택:

**1단계 — 카테고리:**
1. "협력 (refine / brainstorm / socratic)"
2. "경쟁/숙의 (tournament / debate / council)"
3. "파이프라인 (chain / distribute / scaffold / compose / decompose)"
4. "분석 (review / red-team / persona / hypothesis / investigate)"
5. "감시/메타 (monitor / escalate / compose)"

**2단계 — 구체 전략 선택**
**3단계 — 태스크 입력**
