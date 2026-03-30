# TODOS

## ✅ Completed (64101d7)

- ~~P0: x-build plan/run 실제 구현 상태 조사~~ — CLI=상태관리, SKILL.md=오케스트레이션 확인
- ~~P0: SKILL.md plan→run 가이드 강화~~ — Quick Mode + Error Recovery Guide 추가
- ~~P0: README 정직하게 재작성~~ — 킬러 기능 중심 + 아키텍처 정확하게 설명
- ~~P0: 체크포인트/resume 재설계~~ — 기존 메커니즘 활용 (재실행 = resume), SKILL.md에 가이드 추가
- ~~P0: 클라이언트 타임아웃 조정~~ — command-aware timeout (30s / 10min)
- ~~P1: /exec plugin name validation~~ — `/^[a-z][a-z0-9-]*$/` 검증 추가
- ~~P2: 텔레메트리 스키마 확장~~ — 기존 appendMetric에 run_complete 메트릭 추가

## P2 — Tech Debt

### x-build-cli.mjs 모듈 분리
- **What:** 현재 단일 대형 파일(~4000줄). plan/run/status/verify 등 명령별로 파일 분리.
- **Why:** 유지보수성, 테스트 용이성 향상
- **Effort:** M (human: ~1주 / CC: ~1시간)
- **Priority:** P2

### 상태 경로 통합
- **What:** .xm/build, .x-build, projects/<name>/checkpoints 등 상태 저장 경로가 비일관적. 하나로 통합.
- **Why:** Codex 지적 — 상태 파편화
- **Effort:** M
- **Priority:** P2

## P2 — UX

### x-build run 진행 상황 표시
- **What:** "3/10 태스크 완료, 현재: API 엔드포인트 구현" 형태의 진행률 표시
- **Why:** "한번 돌리면 끝까지" 신뢰 구축
- **Effort:** S
- **Priority:** P2

## P3 — Future

### 핵심 테스트 추가
- **What:** bun test 기반 — x-kit-server (health, /exec, validation, timeout) + x-build CLI (init, plan, status, demo)
- **Why:** 킬러 기능 신뢰성
- **Effort:** M
- **Priority:** P3
