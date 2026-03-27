---
name: x-humble
description: Structured retrospective — reflect on failures together, find root causes, explore alternatives, and grow
---

<Purpose>
x-humble은 사용자와 에이전트가 함께 실패에서 배우는 구조화된 회고 시스템이다.
규칙 생성이 아니라 **회고 과정 자체**가 핵심이다. 규칙은 부산물일 뿐.

"겸손(humble) = 틀릴 수 있다는 걸 아는 것"
</Purpose>

<Use_When>
- 세션 끝에 "뭘 잘못했지?", "회고해보자", "반성", "reflect"
- 같은 실수가 반복될 때 "또 이러네", "왜 자꾸 이래"
- 프로젝트 완료 후 "뭘 배웠지?", "다음엔 어떻게?"
- 사용자가 "이거 아닌데"라고 여러 번 말했을 때
</Use_When>

<Do_Not_Use_When>
- 지금 당장 문제를 해결해야 할 때 (x-solver 사용)
- 전략적 분석이 필요할 때 (x-op 사용)
- 단순 피드백 저장 (Claude Code 내장 memory 사용)
</Do_Not_Use_When>

# x-humble — Structured Retrospective

실패에서 함께 배우는 구조화된 회고. 사용자도 배우고, 에이전트도 배운다.

## Arguments

User provided: $ARGUMENTS

## Routing

`$ARGUMENTS`의 첫 단어:
- `reflect` → [Session: reflect] — 이번 세션 회고
- `review` → [Session: review] — 특정 실패/결정 회고
- `lessons` → [View: lessons] — 축적된 교훈 조회
- `apply` → [Action: apply] — 교훈을 CLAUDE.md에 적용
- `history` → [View: history] — 회고 이력
- 빈 입력 → [Session: reflect] — 기본값

---

## Session: reflect

**이번 세션을 함께 돌아본다.** 5단계 구조화 회고.

### Phase 1: RECALL — 무엇을 했는가

> 🪞 [reflect] Phase 1: Recall

리더가 이번 세션의 대화 흐름을 요약:
- 사용자의 요청 목록
- 에이전트의 주요 판단/행동
- 결과물 (코드, 문서, 분석 등)

```
📋 이번 세션 요약

| # | 요청 | 행동 | 결과 |
|---|------|------|------|
| 1 | API 설계 | refine 4 rounds | 채택안 도출 |
| 2 | 코드 구현 | scaffold 3 modules | 구현 완료 |
| 3 | 리뷰 | review 5 agents | 이슈 8개 발견 |
```

### Phase 2: IDENTIFY — 무엇이 잘 안 됐는가

> 🪞 [reflect] Phase 2: Identify

사용자에게 질문 (AskUserQuestion):
```
이번 세션에서 불편하거나 아쉬웠던 점이 있나요?
1) 결과물 품질이 기대 이하
2) 같은 실수를 반복함
3) 방향이 잘못되어 되돌아감
4) 특별히 없음 (잘 됐음)
```

"없음" → Phase 5로 건너뛰기 (성공 회고).

사용자가 선택하면 구체적으로 물어본다:
```
어떤 부분이 가장 아쉬웠나요? 구체적으로 알려주세요.
```

### Phase 3: ANALYZE — 왜 그런 판단을 했는가

> 🪞 [reflect] Phase 3: Analyze (Root Cause)

**에이전트가 자신의 판단 과정을 솔직하게 분석한다.** 이것이 x-humble의 핵심.

delegate (foreground, opus 권장):
```
"## Root Cause Analysis

실패/아쉬움:
{Phase 2에서 식별된 문제}

이 세션의 맥락:
{Phase 1 요약}

솔직하게 분석하라:
1. 왜 그 판단을 했는가? (어떤 정보에 기반했는가)
2. 어떤 정보가 부족했는가? (모르는 걸 몰랐는가, 아니면 알면서 무시했는가)
3. 어떤 편향이 작용했는가?
   - 과잉 자신감: 확실하지 않은데 확신한 것
   - 앵커링: 첫 번째 접근법에 고착된 것
   - 사용자 동조: 사용자가 원하는 답을 하려 한 것
   - 복잡성 편향: 단순한 해결책을 무시하고 복잡하게 간 것
4. 외부 제약이 있었는가? (컨텍스트 부족, 도구 한계, 시간 압박)

형식:
## 판단 경로
{어떤 시점에 어떤 판단을 했는지}

## 실패 원인
{가장 근본적인 원인 1-2개}

## 편향 분석
{작용한 편향과 증거}

300단어 이내. 변명하지 말고 솔직하게."
```

분석 결과를 사용자에게 표시하고 피드백:
```
이 분석이 맞나요? 다른 원인이 있었을까요?
```

### Phase 4: ALTERNATIVE — 어떻게 했어야 했는가

> 🪞 [reflect] Phase 4: Alternative (Counterfactual)

**반사실적 추론 — 다른 경로를 탐색한다.**

broadcast (3 agents):
```
Agent 1 (같은 접근, 다른 실행):
"같은 전략을 선택했지만 실행 방식이 달랐다면?
문제: {Phase 2 문제}
실제 행동: {Phase 3 판단 경로}
같은 방향에서 더 나은 실행 방법은? 200단어 이내."

Agent 2 (완전히 다른 접근):
"처음부터 완전히 다른 접근을 택했다면?
문제: {Phase 2 문제}
실제 접근: {Phase 3 판단 경로}
근본적으로 다른 접근법은? 200단어 이내."

Agent 3 (최소 개입):
"가장 단순한 해결책은 무엇이었는가?
문제: {Phase 2 문제}
실제 행동: {Phase 3 판단 경로}
오컴의 면도날 — 가장 적은 노력으로 해결하는 방법은? 200단어 이내."
```

리더가 3개 대안을 종합하여 표시:

```
🔄 대안 경로

| # | 접근 | 예상 결과 | 비용 |
|---|------|----------|------|
| 1 | 같은 방향, 더 나은 실행 | ... | 낮음 |
| 2 | 완전히 다른 접근 | ... | 높음 |
| 3 | 최소 개입 | ... | 최저 |
```

사용자에게 질문:
```
다음에 비슷한 상황이 오면 어떤 접근이 좋을까요?
1) 대안 1 — ...
2) 대안 2 — ...
3) 대안 3 — ...
4) 원래 접근이 맞았음 — 실행만 개선
```

### Phase 5: COMMIT — 무엇을 바꿀 것인가

> 🪞 [reflect] Phase 5: Commit

회고 결과를 교훈(lesson)으로 정리한다. **규칙 강제가 아니라 교훈 공유.**

```
🪞 [reflect] Complete

## 교훈
{Phase 3-4에서 도출된 핵심 인사이트}

## 행동 변화
- KEEP: {계속할 것}
- STOP: {멈출 것}
- START: {시작할 것}

## 적용 여부
이 교훈을 CLAUDE.md에 저장할까요?
1) 저장 — 다음 세션부터 자동 적용
2) 기억만 — .xm/humble/에 기록만 (자동 적용 안 함)
3) 무시 — 이번만의 상황, 일반화 불필요
```

사용자가 "저장"을 선택하면:
```
CLAUDE.md에 추가:
## Lessons (x-humble)
- STOP: {멈출 것} — {근거, 날짜}
- START: {시작할 것} — {근거, 날짜}
```

---

## Session: review

**특정 실패나 결정을 깊이 회고한다.** reflect보다 좁고 깊다.

### 사용법

```
/x-humble review "왜 scaffold 대신 distribute를 선택했는가"
/x-humble review "테스트 누락한 이유"
```

### 실행

Phase 3 (Analyze) + Phase 4 (Alternative)만 실행:
- 특정 판단 시점을 찾아 맥락을 복원
- 그 시점의 판단 경로를 분석
- 대안을 탐색
- 교훈 도출

---

## View: lessons

**축적된 교훈을 조회한다.**

```
/x-humble lessons

🪞 Lessons (5 total)

Active (CLAUDE.md에 적용 중):
  [L1] STOP: 첫 접근에 고착하기 (2026-03-27, 3회 확인)
  [L2] START: 구현 전 --dry-run 확인 (2026-03-25, 2회 확인)

Recorded (기록만):
  [L3] KEEP: PRD 생성 후 consensus 검토 (2026-03-27)
  [L4] STOP: 에러 메시지 무시하고 재시도 (2026-03-26)
  [L5] START: 사용자 피드백 즉시 반영 (2026-03-24)

Stats:
  회고 횟수: 8
  교훈 생성: 5 (active: 2, recorded: 3)
  반복 실수 감소: 측정 중
```

### 교훈 강화/약화

동일 교훈이 다른 세션에서 다시 확인되면 자동 강화:
```
[L4] STOP: 에러 메시지 무시 (confirmed: 3회)
  → 3회 이상 확인 → CLAUDE.md 적용 제안
```

교훈이 틀렸다고 판명되면:
```
/x-humble lessons deprecate L2 --reason "dry-run이 오히려 비효율"
```

---

## Action: apply

**교훈을 CLAUDE.md에 수동 적용/해제한다.**

```
/x-humble apply L3          # L3 교훈을 CLAUDE.md에 추가
/x-humble apply --remove L2 # L2 교훈을 CLAUDE.md에서 제거
```

### CLAUDE.md 주입 형식

```markdown
## Lessons (x-humble)
<!-- x-humble이 관리하는 섹션. 수동 편집 가능. -->
- STOP: 첫 접근에 고착하기. 최소 2개 대안을 먼저 고려. (L1, 3회 확인, 2026-03-27)
- START: 구현 전 --dry-run으로 계획 확인. (L2, 2회 확인, 2026-03-25)
```

---

## View: history

**회고 이력을 조회한다.**

```
/x-humble history

🪞 Retrospective History

| # | Date | Type | Topic | Lessons |
|---|------|------|-------|---------|
| 1 | 03-27 | reflect | x-kit 리네이밍 세션 | L1, L3 |
| 2 | 03-26 | review | scaffold vs distribute 선택 | L4 |
| 3 | 03-25 | reflect | x-build PRD 파이프라인 | L2, L5 |
```

---

## Storage

```
.xm/humble/
├── retrospectives/           # 회고 기록
│   └── {timestamp}-{type}.json
├── lessons/                  # 교훈
│   └── {id}.json
└── stats.json                # 통계
```

### Lesson Schema

```json
{
  "id": "L1",
  "type": "STOP" | "START" | "KEEP",
  "content": "첫 접근에 고착하기",
  "reason": "앵커링 편향으로 3회 연속 같은 실수",
  "source_retrospective": "2026-03-27T12:00:00Z-reflect",
  "confirmed_count": 3,
  "status": "active" | "recorded" | "deprecated",
  "applied_to_claudemd": true,
  "created_at": "ISO8601",
  "last_confirmed": "ISO8601"
}
```

### Retrospective Schema

```json
{
  "timestamp": "ISO8601",
  "type": "reflect" | "review",
  "session_summary": "...",
  "failures_identified": ["..."],
  "root_causes": ["..."],
  "biases_detected": ["anchoring"],
  "alternatives_explored": 3,
  "user_choice": "alternative-1",
  "lessons_created": ["L1"],
  "user_satisfaction": "helpful" | "neutral" | "unhelpful"
}
```

---

## 성공 회고 (Phase 2에서 "없음" 선택 시)

실패만 회고하지 않는다. 성공에서도 배운다.

```
🪞 [reflect] 성공 회고

이번 세션에서 잘 된 점:
| # | 판단 | 왜 잘 됐는가 |
|---|------|-------------|
| 1 | PRD consensus 활용 | critic의 피드백이 빠진 부분을 채움 |
| 2 | --verify로 품질 보장 | 첫 결과 6.2 → 재시도 7.8 |

KEEP으로 기록할까요?
1) KEEP: consensus 검토 활용 → 교훈 저장
2) 기록만
3) 무시
```

---

## 편향 사전

Phase 3에서 사용하는 인지 편향 목록:

| 편향 | 설명 | 감지 신호 |
|------|------|----------|
| 앵커링 | 첫 번째 접근에 고착 | 대안 탐색 없이 직진 |
| 과잉 자신감 | 불확실한데 확신 | "확실히", "반드시" 사용하면서 틀림 |
| 사용자 동조 | 원하는 답 맞추기 | 사용자 암시에 비판 없이 따름 |
| 복잡성 편향 | 단순한 해결책 무시 | 3줄로 될 걸 30줄로 구현 |
| 매몰 비용 | 잘못된 경로를 포기 못함 | "이미 여기까지 왔으니" |
| 확증 편향 | 맞는 증거만 찾음 | 반례를 무시하거나 축소 |
| 가용성 편향 | 최근/익숙한 것만 추천 | 항상 같은 패턴/라이브러리 제안 |

---

## Shared Config Integration

```
.xm/config.json의 설정:
- mode: developer | normal (회고 출력 스타일)
- agent_max_count: Phase 4 대안 탐색 에이전트 수 (기본 3)
```

---

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "회고하자", "돌아보자", "reflect" | `reflect` |
| "왜 그렇게 했어?", "그 판단 왜?" | `review "해당 판단"` |
| "뭘 배웠지?", "교훈 보여줘" | `lessons` |
| "이거 CLAUDE.md에 넣어줘" | `apply L{N}` |
| "회고 이력" | `history` |
| "그 교훈 틀렸어" | `lessons deprecate L{N}` |
