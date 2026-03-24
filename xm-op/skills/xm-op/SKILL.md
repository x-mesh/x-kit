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
- 빈 입력 → 사용자에게 전략 선택 질문

## Options

- `--rounds N` — 라운드 수 (기본 4)
- `--preset quick|thorough|deep` — quick: rounds=2, thorough: rounds=4, deep: rounds=6
- `--agents N` — 참여 에이전트 수 (기본 3)
- `--model sonnet|opus|haiku` — 에이전트 모델 (기본 sonnet)
- `--steps "role:task,role:task"` — chain 단계 수동 지정
- `--target <file|dir>` — review/red-team 대상
- `--vote` — brainstorm 도트 투표 활성화
- `--context` — 대화 맥락을 에이전트에게 주입
- `--no-context` — 맥락 주입 비활성화

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
  chain <topic>           A→B→C sequential pipeline
  review --target <file>  Multi-perspective code review
  debate <topic>          Pro vs Con → verdict
  red-team --target <f>   Attack → defend → re-attack
  brainstorm <topic>      Free ideation → cluster → vote
  distribute <topic>      Split → parallel execute → merge
  council <topic>         N-party deliberation → consensus

Options:
  --rounds N              Round count (default 4)
  --preset quick|thorough|deep
  --agents N              Number of agents (default 3)
  --model sonnet|opus     Agent model
  --vote                  Enable dot voting (brainstorm)
  --target <file>         Review/red-team target

Examples:
  /xm-op refine "Payment API design" --rounds 4
  /xm-op tournament "Login implementation" --agents 4
  /xm-op debate "Monolith vs microservices"
  /xm-op review --target src/auth.ts
  /xm-op brainstorm "v2 feature ideas" --vote
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

## Interactive Mode

`$ARGUMENTS`가 빈 경우, AskUserQuestion으로 단계적 선택:

**1단계 — 카테고리:**
1. "협력 (refine / brainstorm)"
2. "경쟁/숙의 (tournament / debate / council)"
3. "파이프라인 (chain / distribute)"
4. "분석 (review / red-team)"

**2단계 — 구체 전략 선택**
**3단계 — 태스크 입력**
