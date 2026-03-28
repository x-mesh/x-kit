# x-agent Team System — Reference

계층적 팀 구조: Director(사용자) → Team Leader → Members.
Team Leader는 `team-leader` preset의 opus Agent로, 기존 primitive(fan-out, delegate, broadcast)를 사용하여 팀원을 관리한다.

## 구조

```
Director (사용자 + leader Claude)
  │
  ├── Team Leader: design (opus, named agent)
  │     ├── ux-researcher (haiku)
  │     ├── ui-designer (sonnet)
  │     └── design-reviewer (sonnet)
  │
  ├── Team Leader: engineering (opus, named agent)
  │     ├── frontend-dev (sonnet)
  │     ├── backend-dev (sonnet)
  │     └── tester (sonnet)
  │
  └── Cross-team: Director가 TL ↔ TL 메시지 라우팅
```

## 팀 정의 포맷 (YAML)

팀은 `.xm/teams/` 디렉토리에 YAML로 정의. 정적(static) 또는 동적(dynamic) 유형.

```yaml
# .xm/teams/engineering.yaml
name: engineering
description: "Backend/Frontend 개발 및 테스트"
type: static          # static | dynamic

leader:
  role: team-leader
  model: opus
  can_decide:
    - 구현 방식 선택
    - 태스크 내부 분배
    - 코드 리뷰 피드백
    - 리팩터링 범위 (해당 팀 코드 내)
  must_escalate:
    - 스코프 변경
    - 아키텍처 결정
    - 외부 의존성 추가
    - 품질 게이트 2회 연속 실패
    - 예상 일정 초과

members:
  - role: se
    alias: frontend-dev
    context: "프론트엔드 전담. React/Next.js"
  - role: se
    alias: backend-dev
    context: "백엔드 전담. API/DB"
  - role: test-engineer
    alias: tester
    context: "테스트 전략 및 커버리지"

cross_team:
  - design        # 이 팀과 직접 소통 가능한 팀 목록
```

## 소통 프로토콜

```
Director → TL:      목표 할당, 피드백, 의사결정 전달
TL → Director:      📊 보고, [ESCALATION] 에스컬레이션
TL ↔ TL:           [CROSS-TEAM → {target}] — Director가 파싱 후 라우팅
TL → Members:       fan-out/delegate/broadcast로 태스크 배분
Members → TL:       결과 반환 (Agent tool 결과)
Members → Director: 원칙적 불가. [EMERGENCY → Director] 태그로 긴급 시만
```

## Team Leader Protocol

TL은 opus Agent로 spawn되며, 아래 프로토콜이 시스템 프롬프트에 주입된다:

```
## Team Leader Protocol: {team_name}

당신은 {team_name} 팀의 리더입니다.
Director의 지시를 받아 팀원에게 태스크를 배분하고, 결과를 종합하여 보고합니다.

### 팀 구성
{members 목록 — 각 alias, role, context}

### 권한 (can_decide)
아래 사항은 자체 판단으로 결정 가능:
{can_decide 목록}

### 에스컬레이션 (must_escalate)
아래 상황은 반드시 Director에게 보고:
{must_escalate 목록}
형식: [ESCALATION] {상황 설명} — {판단 필요 사항}

### 팀원 관리
- 독립 태스크 → fan-out (병렬)
- 순차 의존 → delegate (직렬)
- 관점별 분석 → broadcast (역할별)
- 팀원 결과의 품질을 검증하고 부족하면 재요청

### 팀 간 소통
다른 팀에 요청이 필요하면:
[CROSS-TEAM → {target_team}] {요청 내용}
Director가 해당 팀 리더에게 전달합니다. 직접 소통하지 마세요.

### 보고 형식
📊 {team_name} Team Report
  Status: {완료 | 진행중 | 블로킹}
  Completed: {완료 항목}
  In Progress: {진행 항목}
  Blockers: {블로커 — 없으면 "없음"}
  Escalations: {에스컬레이션 — 없으면 "없음"}
  Cross-Team: {다른 팀 요청 — 없으면 "없음"}
  Deliverables: {산출물 목록}
  Next: {다음 계획}
```

## Subcommand: team

`team` 다음 단어로 서브커맨드 라우팅:
- `create` → [Team: create]
- `list` → [Team: list]
- `status` → [Team: status]
- `assign` → [Team: assign]
- `report` → [Team: report]
- `coord` → [Team: coord]
- `disband` → [Team: disband]
- `templates` → [Team: templates]

### Team: create

`team create <name> [--template <t>]`

1. `--template` 있으면 → `.xm/teams/{template}.yaml` 읽기
2. 없으면 → AskUserQuestion으로 팀 구성 동적 조합:
   - 팀 목적
   - 멤버 역할 (기존 preset에서 선택)
   - 자율성 범위 (can_decide / must_escalate)
3. 팀 정의를 `.xm/teams/{name}.yaml`로 저장
4. 출력:
```
✅ Team "{name}" created

  Leader: team-leader (opus)
  Members:
    - frontend-dev (se, sonnet)
    - backend-dev (se, sonnet)
    - tester (test-engineer, sonnet)
  Cross-team: [design]

  Assign a goal: /x-agent team assign {name} "목표"
```

### Team: list

활성 팀 목록 표시. `.xm/teams/*.yaml` 스캔.

```
📋 Active Teams

  | Team | Members | Status | Current Goal |
  |------|---------|--------|-------------|
  | engineering | 3 | idle | - |
  | design | 2 | working | UI 디자인 |
```

### Team: status

`team status [name]`

특정 팀 또는 전체 팀의 상세 진행 상황. TL에게 SendMessage로 보고 요청.

```
📊 engineering Team Status

  Goal: 결제 시스템 구현
  Phase: executing (2/5 tasks done)

  | Member | Task | Status |
  |--------|------|--------|
  | frontend-dev | 결제 UI | ✅ completed |
  | backend-dev | 결제 API | 🔄 in progress |
  | tester | 테스트 작성 | ⏳ waiting (depends on API) |

  Blockers: 없음
  Escalations: 없음
```

### Team: assign

`team assign <team> <goal>`

1. 팀 정의 읽기 (`.xm/teams/{team}.yaml`)
2. Team Leader를 named Agent로 spawn:
   ```
   Agent tool: {
     name: "tl-{team}",
     description: "Team Leader: {team}",
     prompt: "{Team Leader Protocol}\n\n## Goal\n{goal}",
     model: "opus",
     run_in_background: true
   }
   ```
3. TL이 내부에서 팀원을 spawn하고 관리
4. 출력:
```
🚀 Goal assigned to team "{team}"

  Goal: {goal}
  Team Leader: tl-{team} (opus, background)

  The TL will decompose the goal, assign member tasks, and report back.
  Check progress: /x-agent team status {team}
  Request report: /x-agent team report {team}
```

### Team: report

`team report [name]`

TL에게 현재 상태 보고를 요청. SendMessage로 named agent에게 전달:
```
SendMessage: {
  to: "tl-{name}",
  message: "📊 보고를 제출하세요."
}
```

TL이 📊 형식으로 보고.

이름 미지정 시 → 모든 활성 TL에게 보고 요청.

### Team: coord

`team coord <from> <to> <message>`

Director가 팀 간 메시지를 라우팅:
```
SendMessage: {
  to: "tl-{to}",
  message: "[CROSS-TEAM ← {from}] {message}"
}
```

TL 응답을 수신하면 발신 팀에게 전달:
```
SendMessage: {
  to: "tl-{from}",
  message: "[CROSS-TEAM ← {to}] {response}"
}
```

### Team: disband

`team disband [name]`

1. TL에게 종료 메시지 전달
2. `.xm/teams/{name}.yaml`의 상태를 `disbanded`로 변경
3. 출력:
```
🏁 Team "{name}" disbanded

  Final report:
  {TL의 최종 보고}
```

이름 미지정 시 → AskUserQuestion으로 대상 선택.

### Team: templates

사용 가능한 팀 템플릿 목록.

```
📋 Team Templates

  | Template | Leader | Members | Description |
  |----------|--------|---------|-------------|
  | engineering | architect | se×2, test-engineer | Backend/Frontend 개발 및 테스트 |
  | design | planner | explorer, se, reviewer | UX 리서치, UI 구현, 디자인 리뷰 |
  | review | critic | reviewer, security, optimizer | 다각도 코드 리뷰 |
  | research | planner | explorer×3 | 다방면 코드베이스/기술 탐색 |
  | fullstack | architect | design TL + engineering TL | 멀티팀 풀스택 프로젝트 |

  Create from template: /x-agent team create myteam --template engineering
```

## 기본 템플릿 (5개)

### engineering.yaml
```yaml
name: engineering
description: "Backend/Frontend 개발 및 테스트"
type: static
leader:
  role: team-leader
  model: opus
  can_decide:
    - 구현 방식 선택
    - 태스크 내부 분배
    - 코드 리뷰 피드백
  must_escalate:
    - 스코프 변경
    - 아키텍처 결정
    - 외부 의존성 추가
    - 품질 게이트 2회 연속 실패
members:
  - role: se
    alias: frontend-dev
    context: "프론트엔드 전담"
  - role: se
    alias: backend-dev
    context: "백엔드 전담. API/DB"
  - role: test-engineer
    alias: tester
    context: "테스트 전략 및 커버리지"
cross_team: [design]
```

### design.yaml
```yaml
name: design
description: "UX 리서치, UI 구현, 디자인 리뷰"
type: static
leader:
  role: team-leader
  model: opus
  can_decide:
    - UI/UX 방향 결정
    - 컴포넌트 구조
    - 디자인 피드백
  must_escalate:
    - 사용자 플로우 대폭 변경
    - 브랜드 가이드라인 변경
    - 접근성 기준 미달
members:
  - role: explorer
    alias: ux-researcher
    context: "사용자 플로우 분석, 기존 UI 패턴 조사"
  - role: se
    alias: ui-designer
    context: "UI 컴포넌트 구현"
  - role: reviewer
    alias: design-reviewer
    context: "디자인 일관성, 접근성 리뷰"
cross_team: [engineering]
```

### review.yaml
```yaml
name: review
description: "다각도 코드 리뷰 (품질, 보안, 성능)"
type: static
leader:
  role: team-leader
  model: opus
  can_decide:
    - 리뷰 관점 배분
    - 이슈 심각도 판정
    - 리뷰 완료 판단
  must_escalate:
    - Critical 보안 취약점 발견
    - 아키텍처 수준 리팩터링 필요
members:
  - role: reviewer
    alias: code-reviewer
    context: "로직 정확성, 가독성, 유지보수성"
  - role: security
    alias: security-reviewer
    context: "OWASP Top 10, 인증/인가"
  - role: optimizer
    alias: perf-reviewer
    context: "성능 병목, 캐싱, 쿼리 최적화"
cross_team: []
```

### research.yaml
```yaml
name: research
description: "다방면 코드베이스/기술 탐색"
type: static
leader:
  role: team-leader
  model: opus
  can_decide:
    - 탐색 범위 조정
    - 관점 배분
    - 결과 종합 방식
  must_escalate:
    - 예상과 크게 다른 발견 (아키텍처 불일치 등)
members:
  - role: explorer
    alias: explorer-1
    context: "구조 및 진입점 탐색"
  - role: explorer
    alias: explorer-2
    context: "의존성 및 외부 연동 탐색"
  - role: explorer
    alias: explorer-3
    context: "패턴 및 컨벤션 탐색"
cross_team: []
```

### fullstack.yaml
```yaml
name: fullstack
description: "멀티팀 풀스택 프로젝트 (design + engineering)"
type: static
leader:
  role: team-leader
  model: opus
  can_decide:
    - 팀 간 작업 순서 조율
    - 인터페이스 계약 중재
    - 통합 테스트 범위
  must_escalate:
    - 프로젝트 스코프 변경
    - 일정 지연
    - 팀 간 해결 불가 충돌
members:
  - role: team-leader
    alias: design-lead
    context: "디자인 팀 리더. design.yaml 참조하여 하위 팀원 관리"
  - role: team-leader
    alias: eng-lead
    context: "엔지니어링 팀 리더. engineering.yaml 참조하여 하위 팀원 관리"
cross_team: []
```
