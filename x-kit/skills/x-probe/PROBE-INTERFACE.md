# x-probe Verdict Interface Spec

x-kit 도구가 probe 결과를 소비하기 위한 표준 인터페이스.

## Verdict File

- **Path**: `.xm/probe/last-verdict.json` (고정, 환경변수/설정 경유 금지)
- **Schema**: `verdict-schema.json` (schema_version: 2)
- **Producer**: x-probe (Phase 4 VERDICT 완료 시 생성)
- **History**: `.xm/probe/history/{timestamp}-{slug}.json`

## Consumer Rules

### 공통 규칙 (모든 소비자)

1. 파일 존재 확인 후 읽기. 없으면 probe 미실행으로 간주 — 정상 진행.
2. `schema_version` 확인. 지원하지 않는 버전이면 무시 (하위 호환 보장 안 함).
3. `evidence_summary` 필드만 사용. 사용자 답변 원문은 저장되지 않음.
4. verdict 파일 수정 금지 — 읽기 전용.

### x-build (Producer: x-probe → Consumer: x-build)

| 필드 | 용도 |
|------|------|
| `premises[].statement` + `final_grade` | CONTEXT.md "Premises Validated" 섹션 |
| `premises[].status == "survived" && final_grade == "assumption"` | CONTEXT.md "Evidence Gaps" 섹션 |
| `kill_criteria` | CONTEXT.md "Kill Criteria" 섹션 |
| `risks` | CONTEXT.md "Risks to Monitor" 섹션 |
| `domain` | Research phase 에이전트 perspective 힌트 |

**Trigger**: `x-build init` 시 자동 감지. verdict `timestamp`가 24시간 이내일 때만.

### x-solver (Consumer)

| 필드 | 용도 |
|------|------|
| `premises` | 문제 분해 시 검증된 전제를 제약으로 활용 |
| `evidence_gaps` | 미검증 가정을 sub-problem으로 분리 |
| `verdict` | KILL이면 대안 접근 권장 |

**Trigger**: `x-solver` 시작 시 `.xm/probe/last-verdict.json` 존재하면 자동 참조.

### x-humble (Consumer)

| 필드 | 용도 |
|------|------|
| `premises[].status` | 회고 시 "어떤 전제가 틀렸는가?" 분석 |
| `premises[].initial_grade` → `final_grade` | 증거 등급 변화 패턴 분석 |
| `verdict` + `recommendation` | 원래 판단 vs 실제 결과 비교 |

**Trigger**: `/x-humble` 실행 시 관련 probe 이력 자동 검색.

### x-memory (Consumer)

| 필드 | 용도 |
|------|------|
| `idea` + `verdict` | 의사결정 이력으로 장기 저장 |
| `premises[].statement` + `status` | 패턴 학습 (자주 refute되는 전제 유형 추적) |

**Trigger**: probe verdict 생성 시 x-memory에 자동 저장 권장 (수동 trigger).

## Monitoring

### Completion Rate (완주율)

Phase 4 verdict 도달률을 추적한다. verdict 파일 생성 = 완주.

```bash
# 완주 횟수
ls .xm/probe/history/*.json 2>/dev/null | wc -l
```

**Kill criteria**: 완주율이 3회 연속 측정에서 50% 미만이면 SKILL.md 복잡도를 줄인다.

### Quality Metrics

| Metric | 측정 방법 | 기준 |
|--------|----------|------|
| SKILL.md 줄 수 | `wc -l SKILL.md` | ≤ 500 |
| 질문 수 | Phase 2 AskUserQuestion 호출 횟수 | 기존 대비 미증가 |
| 등급 분포 | verdict JSON final_grade 집계 | assumption 비율 감소 추세 |
| 도메인 감지 정확도 | 사용자 수동 확인 | 오분류 ≤ 20% |
