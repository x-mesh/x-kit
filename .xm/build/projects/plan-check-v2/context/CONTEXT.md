# CONTEXT.md

## Goal
plan-check G1-G7 개선의 마무리: 단위 테스트 추가, SKILL.md 동기화, README 반영.

## Scope
### In Scope
- G1-G7 각 차원별 단위 테스트 작성 (plan.mjs, tasks.mjs)
- 실제 프로젝트로 plan-check 실행하는 통합 테스트
- x-build SKILL.md에 새 차원(scope guard, granularity 상한, 확장 동사) 반영
- README/README.ko.md의 plan-check 설명 업데이트

### Out of Scope
- G8 (granularity config 연동)
- G9 (tech-leakage done_criteria 스캔)
- G10 (done_criteria 품질 검증)
- plan-check 코드 구조 리팩터링

## Users
- x-kit 개발자 (본인)
- x-kit 사용자 (plan-check 실행 시 새 경고 확인)

## Tech Constraints
- Bun test runner (기존 테스트 패턴 따르기)
- 기존 plan.mjs/tasks.mjs 구조 유지

## Quality Bar
### Testing
- 각 G1-G7 차원별 단위 테스트 (최소 1 케이스)
- 통합 테스트: 실제 tasks.json으로 plan-check 실행하여 기대 결과 확인
### Documentation
- SKILL.md plan-check 차원 테이블 업데이트
- README plan-check 섹션 업데이트

## Timeline
- 오늘 세션 내 완료

## Decisions
- G1-G7은 이미 구현 완료 (plan.mjs, tasks.mjs에 코드 반영됨)
- 테스트는 기존 test/ 디렉토리의 패턴을 따름

## Ambiguity Log
| Dimension | Round 1 | Final | Resolution |
|-----------|---------|-------|------------|
| scope | 0 | 0 | G1-G7 마무리로 명확히 한정 |
| quality | 0 | 0 | 통합 테스트까지 |
| timeline | 0 | 0 | 오늘 세션 내 |