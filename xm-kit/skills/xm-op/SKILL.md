---
name: xm-op
description: Strategy orchestration — refine, tournament, chain, review, debate, red-team, brainstorm, distribute, council
---

# xm-op — Strategy Orchestration (Claude Code Native)

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
- 빈 입력 → 사용자에게 전략 선택 질문

## Options

- `--rounds N` — 라운드 수 (기본 4)
- `--preset quick|thorough|deep` — quick: rounds=2, thorough: rounds=4, deep: rounds=6
- `--agents N` — 참여 에이전트 수 (기본값: shared config의 agent_level에 따라 결정. min=2, medium=4, max=8. 명시하면 오버라이드)
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

## Shared Config Integration

xm-op은 `.xm/config.json`의 공유 설정을 참조한다:

| 설정 | 키 | 기본값 | 영향 |
|------|-----|--------|------|
| 에이전트 수 | `agent_level` | `medium` (4) | `--agents` 미지정 시 fan-out/broadcast 에이전트 수 결정 |
| 모드 | `mode` | `developer` | 출력 스타일 (기술 용어 vs 쉬운 말) |

### Agent Level → 에이전트 수 매핑

| Level | Agents | 용도 |
|-------|--------|------|
| `min` | 2 | 토큰 절약, 빠른 피드백 |
| `medium` | 4 | 기본값, 대부분의 작업 |
| `max` | 8 | 대규모 분석, 토큰 무제한 |

설정 변경: `xm-kit config set agent_level max`

Skill layer가 에이전트를 생성할 때 `--agents` 플래그가 없으면 shared config에서 agent_level을 읽어 에이전트 수를 결정한다.

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

에이전트 수는 `--agents N` 플래그 또는 shared config의 `agent_level`에 따라 결정된다.

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
xm-op — Strategy Orchestration

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

Options:
  --rounds N              Round count (default 4)
  --preset quick|thorough|deep
  --agents N              Number of agents (default: agent_level)
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

Examples:
  /xm-op refine "Payment API design" --rounds 4
  /xm-op tournament "Login implementation" --agents 4 --bracket double
  /xm-op debate "Monolith vs microservices"
  /xm-op review --target src/auth.ts
  /xm-op brainstorm "v2 feature ideas" --vote
  /xm-op socratic "Why microservices?" --rounds 4
  /xm-op persona "Auth redesign" --personas "engineer,security,pm"
  /xm-op scaffold "Plugin system" --agents 4
  /xm-op compose "brainstorm | tournament | refine" --topic "v2 plan"
  /xm-op refine "API design" --dry-run
  /xm-op tournament "Login" --explain
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

---

## Strategy: review

전원이 코드를 다각도 리뷰.

### Phase 1: TARGET
- `--target <file>` → Read tool로 파일 읽기
- 없으면 → `git diff HEAD` (Bash tool)

### Phase 2: ASSIGN
에이전트별 관점 자동 배정:
- Agent 1 → 보안 (인젝션, 인증, 권한)
- Agent 2 → 로직 (버그, 가독성, 패턴)
- Agent 3 → 성능 (쿼리, 메모리, 에러 핸들링)

### Phase 3: REVIEW
fan-out (각 에이전트에 다른 관점 프롬프트):
```
"## Code Review: {관점}
{코드}
[Critical|High|Medium|Low] 파일:라인 — 설명 형식으로 이슈 보고."
```

### Phase 4: SYNTHESIZE
리더가 종합: 중복 제거, 심각도별 정렬, 다수 발견 이슈 강조.

### 최종 출력
```
🔍 [review] Complete — {N} agents, {M} issues
| # | Severity | Location | Issue | Found by |
```

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
/xm-op refine "topic" --dry-run
```

### 출력 내용
```
📋 [dry-run] refine "topic"

Execution Plan:
  Rounds: 4 (preset: thorough)
  Agents: 8 (agent_level: max)
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

### 체크포인트 저장
각 라운드/phase 완료 시 리더가 `.xm/op-checkpoints/{run-id}.json`에 자동 저장:
```json
{
  "strategy": "refine",
  "topic": "...",
  "current_round": 2,
  "completed_results": [...],
  "options": { "agents": 8, "model": "sonnet" }
}
```

### 재개
```
/xm-op --resume
```
가장 최근 체크포인트를 로드 → 중단된 라운드부터 재실행.

### 구현
리더가 체크포인트 파일 존재 여부를 확인하고, 있으면 이전 결과를 컨텍스트로 주입하여 다음 라운드부터 진행.

---

## Options: --explain

최종 결과와 함께 의사결정 과정을 투명하게 출력.

### 사용법
```
/xm-op tournament "topic" --explain
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

## Strategy: compose

여러 전략을 파이프라인으로 연결.

### 사용법
```
/xm-op compose "brainstorm | tournament | refine" --topic "v2 feature plan"
```

또는 `--pipe` 플래그:
```
/xm-op brainstorm "v2 features" --pipe tournament --pipe refine
```

### 실행 흐름
1. 첫 전략 실행 → 결과 수집
2. 결과를 다음 전략의 입력으로 자동 변환:
   - brainstorm → tournament: Top N 아이디어를 후보로 전달
   - tournament → refine: 우승 솔루션을 refine 시드로 전달
   - review → red-team: 리뷰 이슈를 공격 대상으로 전달
3. 마지막 전략 결과가 최종 출력

### 변환 규칙
| From → To | 변환 |
|-----------|------|
| brainstorm → tournament | 클러스터 대표 아이디어를 후보로 |
| brainstorm → refine | 최다 득표 아이디어를 시드로 |
| tournament → refine | 우승 솔루션을 정제 대상으로 |
| review → red-team | Critical/High 이슈를 공격 대상으로 |
| chain → review | 체인 최종 출력을 리뷰 대상으로 |

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

---

## Interactive Mode

`$ARGUMENTS`가 빈 경우, AskUserQuestion으로 단계적 선택:

**1단계 — 카테고리:**
1. "협력 (refine / brainstorm / socratic)"
2. "경쟁/숙의 (tournament / debate / council)"
3. "파이프라인 (chain / distribute / scaffold / compose)"
4. "분석 (review / red-team / persona)"

**2단계 — 구체 전략 선택**
**3단계 — 태스크 입력**
