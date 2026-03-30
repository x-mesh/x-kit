# TODOS

## P0 — Critical (Codex Outside Voice 발견)

### ~~x-build plan/run 실제 구현 상태 조사~~ ✅ 완료
- **결과:** Codex 지적 확인됨. CLI는 상태 관리 레이어, 오케스트레이션은 SKILL.md+Claude.
- `cmdPlan`: JSON 출력만 (2740행), `cmdRun`: RUNNING 마킹만 (2279행)
- 이 아키텍처는 의도적 선택이지만 README가 과잉 주장 중
- **후속 작업:** 아래 P0 항목들 참조

### SKILL.md plan→run 가이드 품질 강화
- **What:** 킬러 기능의 실제 품질은 SKILL.md의 오케스트레이션 지시 품질에 의존. plan→run 플로우의 SKILL.md 지시를 완벽하게 만들어야 함.
- **Why:** CLI polish보다 SKILL.md 품질이 사용자 경험에 10x 더 영향
- **Action:** x-build SKILL.md의 plan→run 섹션을 리뷰하고, 에이전트가 따라야 할 step-by-step 지시를 강화
- **Effort:** M (human: ~1주 / CC: ~1시간)
- **Priority:** P0
- **Depends on:** 없음

### README 정직하게 재작성
- **What:** "DAG execution"을 CLI 기능으로 주장하는 대신, "CLI가 상태 관리, SKILL.md가 오케스트레이션" 아키텍처를 정확하게 설명
- **Why:** Codex 지적 — README 주장과 실제 구현의 격차가 신뢰를 훼손
- **Effort:** S
- **Priority:** P0
- **Depends on:** SKILL.md 강화 완료 후

### 체크포인트/resume 재설계
- **What:** 별도 checkpoint 메커니즘 불필요. cmdRun이 이미 completed가 아닌 태스크부터 시작하므로 재호출이 resume. 기존 태스크 상태가 체크포인트 역할.
- **Action:** CEO 플랜의 §3 (체크포인트) 항목을 "기존 메커니즘 활용"으로 변경. 필요하면 SKILL.md에 "실패 시 x-build run 재실행" 가이드만 추가.
- **Effort:** XS
- **Priority:** P0
- **Depends on:** 없음

### 클라이언트 타임아웃 조정
- **What:** x-kit-client.mjs가 30초에 abort하므로, 서버 타임아웃(5분)만 추가하면 의미 없음. 클라이언트 타임아웃도 함께 조정 필요.
- **Why:** Codex가 지적 — 서버 타임아웃만으로는 실제 병목 해결 안 됨.
- **Action:** x-kit-client.mjs의 타임아웃을 명령별로 분리 (짧은 명령 30s, run 등 긴 명령 5min+)
- **Effort:** S
- **Priority:** P0 — /exec timeout 구현과 동시에 처리
- **Depends on:** /exec timeout (CEO Plan §2)

## P1 — Security

### /exec plugin name validation
- **What:** `/exec` 엔드포인트에서 `plugin` 파라미터에 `/^[a-z][a-z0-9-]*$/` 검증 추가
- **Why:** path traversal로 임의 파일 import 가능
- **Action:** x-kit-server.mjs /exec 핸들러에 validation 1줄 추가
- **Effort:** XS (~10min)
- **Priority:** P1
- **Depends on:** 없음

## P2 — Tech Debt

### x-build-cli.mjs 모듈 분리
- **What:** 현재 단일 대형 파일(~4000줄 추정). plan/run/status/verify 등 명령별로 파일 분리.
- **Why:** 유지보수성, 테스트 용이성 향상
- **Effort:** M (human: ~1주 / CC: ~1시간)
- **Priority:** P2
- **Depends on:** P0 조사 완료 후

### 기존 텔레메트리 스키마 확장 (새 파일 생성 대신)
- **What:** Codex 지적 — x-build에 이미 JSONL 메트릭이 있음. 별도 analytics 파일 대신 기존 스키마에 필드 추가.
- **Why:** 중복 메커니즘/경로/opt-out 표면 방지
- **Effort:** S
- **Priority:** P2
- **Depends on:** P0 조사 완료

### 상태 경로 통합
- **What:** .xm/build, .x-build, projects/<name>/checkpoints 등 상태 저장 경로가 비일관적. 하나로 통합.
- **Why:** Codex 지적 — 상태 파편화
- **Effort:** M
- **Priority:** P2
- **Depends on:** P0 조사 완료

## P2 — UX

### x-build run 진행 상황 표시
- **What:** "3/10 태스크 완료, 현재: API 엔드포인트 구현" 형태의 진행률 표시
- **Why:** "한번 돌리면 끝까지" 신뢰 구축
- **Effort:** S
- **Priority:** P2
- **Depends on:** P0 (run이 실제로 태스크를 실행해야 진행률을 보여줄 수 있음)
