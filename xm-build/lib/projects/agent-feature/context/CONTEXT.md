# CONTEXT.md — xm-agent Role Presets

## Goal
xm-agent에 역할 프리셋(Role Presets) 레이어를 추가한다. 기존 프리미티브(fan-out, delegate, broadcast) 위에 도메인 전문 에이전트 역할을 정의하여 탐색/분석/리뷰 품질을 높인다.

## Architecture Decision
- Layer 1: 프리미티브 (HOW) — fan-out, delegate, broadcast, status (기존 유지)
- Layer 2: 역할 프리셋 (WHO) — explorer, se, sre, architect, reviewer, security (신규)
- 프리셋 = 시스템 프롬프트 + 모델 라우팅 + 도메인 체크리스트
- SKILL.md에 프롬프트 정의만 추가, CLI 코드 변경 없음

## Role Presets
| Role | Model | Focus |
|------|-------|-------|
| explorer | haiku | 코드베이스 탐색, 디렉토리 매핑, 진입점/패턴 파악 |
| se | sonnet | 구현, 리팩토링, 테스트, 코드 품질 |
| sre | sonnet | 인프라, 모니터링, SLO/SLI, 장애 대응, 스케일링 |
| architect | opus | 설계, 트레이드오프, 아키텍처 결정 |
| reviewer | sonnet | 코드 리뷰, 보안/성능/로직 다각도 |
| security | sonnet | 보안 감사, OWASP, 취약점 분석 |

## Constraints
- 기존 프리미티브 동작을 변경하지 않는다
- SKILL.md 프롬프트 수준에서 구현 (코드 변경 최소화)
- 각 프리셋은 독립적 — 사용자가 선택적으로 사용

## Out of Scope
- 에이전트 풀/상태 관리 시스템
- 에이전트 간 직접 통신 (리더 경유만)
- 외부 도구/MCP 연동

## Usage Patterns
- /xm-agent delegate explorer "이 코드베이스 파악해"
- /xm-agent delegate sre "이 서비스 점검해"
- /xm-agent fan-out --roles "se,sre,security" "이 PR 리뷰해"
- xm-op, xm-build가 내부적으로 역할 프리셋 활용
