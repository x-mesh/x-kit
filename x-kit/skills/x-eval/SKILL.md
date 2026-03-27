---
name: x-eval
description: Agent output quality evaluation — multi-rubric scoring, strategy benchmarking, and A/B prompt experiments
---

<Purpose>
x-eval은 AI 에이전트 출력의 품질을 구조적으로 평가한다. 다차원 루브릭으로 독립 judge 에이전트가 출력을 채점하고, 전략/모델 벤치마킹과 A/B 프롬프트 실험을 지원한다.
외부 의존성 없음. 평가 결과는 `.xm/eval/`에 저장한다.
</Purpose>

<Use_When>
- User wants to score or grade agent output against a rubric
- User says "평가해줘", "채점해줘", "품질 확인", "score", "eval"
- User wants to compare two outputs and pick the better one
- User says "compare", "어느 게 나아?", "A vs B"
- User wants to benchmark strategies or models on the same task
- User says "bench", "벤치마크", "어떤 전략이 나아?"
- User wants to create or list evaluation rubrics
- User says "rubric", "루브릭", "평가 기준"
</Use_When>

<Do_Not_Use_When>
- Simple factual questions that don't need quality evaluation
- Strategy execution without evaluation (use x-op instead)
- Project lifecycle management (use x-build instead)
</Do_Not_Use_When>

# x-eval — Agent Output Quality Evaluation

다차원 루브릭 채점, 전략 벤치마킹, A/B 프롬프트 실험.
Judge 에이전트 팬아웃으로 독립 평가 후 집계한다.

## Arguments

User provided: $ARGUMENTS

## Routing

`$ARGUMENTS`의 첫 단어:
- `score` → [Subcommand: score]
- `compare` → [Subcommand: compare]
- `bench` → [Subcommand: bench]
- `diff` → [Subcommand: diff]
- `rubric` → [Subcommand: rubric]
- `report` → [Subcommand: report]
- `list` 또는 빈 입력 → [Subcommand: list]

---

## Subcommand: list

```
x-eval — Agent Output Quality Evaluation

Commands:
  score <content> --rubric <name|criteria>     Score content against rubric
  compare <output-a> <output-b> [--judges N]   Compare two outputs with judge panel
  bench <task> --strategies "s1,s2"            Benchmark strategies/models
       [--models "m1,m2"] [--trials N]
  diff [--from <commit>] [--to <commit>]      Measure skill/plugin changes + quality delta
  rubric create <name> --criteria "c1,c2,c3"  Create custom rubric
  rubric list                                   List available rubrics
  report [session]                              Show evaluation report
  list                                          Show this help

Options:
  --rubric <name>           Built-in or custom rubric name
  --judges N                Number of judge agents (default 3)
  --model sonnet|opus|haiku Judge model (default sonnet)
  --trials N                Repetitions per strategy (default 3, for bench)
  --strategies "s1,s2"      Comma-separated strategy names (for bench)
  --models "m1,m2"          Comma-separated model names (for bench)

Built-in Rubrics:
  code-quality    correctness, readability, maintainability, security, test-coverage
  review-quality  coverage, actionability, severity-accuracy, false-positive-rate
  plan-quality    completeness, actionability, scope-fit, risk-coverage
  general         accuracy, completeness, consistency, clarity, hallucination-risk

Examples:
  /x-eval score "function add(a,b){return a+b}" --rubric code-quality
  /x-eval compare output-a.md output-b.md --judges 5
  /x-eval bench "버그를 찾아라" --strategies "refine,debate,tournament" --trials 3
  /x-eval diff                                  # 최근 커밋 vs HEAD 변경 분석
  /x-eval diff --from abc1234 --to HEAD         # 특정 커밋 간 변경 분석
  /x-eval rubric create strict-code --criteria "correctness,edge-cases,complexity"
  /x-eval report
```

---

## Subcommand: score

**콘텐츠를 루브릭에 따라 N개의 judge 에이전트가 독립적으로 채점한다.**

### 파싱

`$ARGUMENTS`에서:
- `score` 다음 = 평가할 content (인용부호 안 텍스트, 또는 파일 경로)
- `--rubric <name>` = 루브릭 이름 또는 기준 (쉼표 구분 커스텀 기준)
- `--judges N` = judge 에이전트 수 (기본 3)
- `--model` = judge 모델 (기본 sonnet)

content가 파일 경로이면 파일을 읽어 내용을 전달한다.
`--rubric`이 빈 입력이면 `general` 루브릭을 사용한다.

### Judge 수 결정

judge 수는 `--judges N`으로 명시하거나, agent_max_count 값을 사용한다 (기본 4).

`--judges N` 명시 시 agent_max_count를 오버라이드.

### Judge 프롬프트

N개의 Agent tool을 동시에 호출한다 (`run_in_background: true`):

```
## Evaluation Judge

Rubric: {rubric_name}
Criteria: {criteria_list}

Content to evaluate:
---
{content}
---

For each criterion, provide:
- Score: 1–10 (1=unacceptable, 5=acceptable, 10=excellent)
- Justification: 1–2 sentences explaining the score

Then compute the weighted average as Final Score.
Default weights are equal unless the rubric specifies otherwise.

Output format (strict):
Criterion: <name> | Score: <N> | Reason: <justification>
...
Final: <weighted_avg>/10
```

각 judge는 독립적으로 채점한다. 순서 바이어스를 방지하기 위해 judge 번호 외 식별자를 부여하지 않는다.

### 결과 집계 및 출력

모든 judge 완료 후 집계:

```
📊 [eval] Score: 7.8/10 (3 judges)
Rubric: code-quality

| Criterion       | J1 | J2 | J3 | Avg  |
|-----------------|----|----|-----|------|
| Correctness     |  9 |  8 |  9 | 8.7  |
| Readability     |  7 |  8 |  7 | 7.3  |
| Maintainability |  8 |  7 |  8 | 7.7  |
| Security        |  6 |  7 |  7 | 6.7  |
| Test Coverage   |  8 |  9 |  8 | 8.3  |

Overall: 7.7/10
Consensus: High (σ=0.6)

Notable: Security scored lowest — consider input validation and sanitization.
```

**Consensus 기준:**

| σ (표준편차) | 판정 |
|-------------|------|
| < 0.8 | High |
| 0.8–1.5 | Medium |
| > 1.5 | Low — interpret with caution |

### 저장

결과를 `.xm/eval/results/{timestamp}-score.json`에 저장한다.

---

## Subcommand: compare

**두 출력을 judge 패널이 비교하여 승자를 결정한다.**

### 파싱

`$ARGUMENTS`에서:
- `compare` 다음 첫 인수 = output-a (텍스트 또는 파일 경로)
- 두 번째 인수 = output-b (텍스트 또는 파일 경로)
- `--judges N` = judge 수 (기본 3)
- `--rubric <name>` = 비교 기준 루브릭 (기본 `general`)
- `--model` = judge 모델 (기본 sonnet)

### Position Bias 방지

각 judge에게 A/B 순서를 무작위로 뒤집는다:

```
Judge 1: [Output A] vs [Output B]
Judge 2: [Output B] vs [Output A]   ← 순서 반전
Judge 3: [Output A] vs [Output B]
```

judge 프롬프트에서 "First Output" / "Second Output"으로만 지칭한다 (A/B 레이블 숨김).
집계 시 순서를 복원하여 올바른 A/B 매핑으로 결과를 계산한다.

### Judge 프롬프트

```
## Comparison Judge

Rubric: {rubric_name}
Criteria: {criteria_list}

Evaluate two outputs on each criterion. Pick the better one or declare a tie.

First Output:
---
{output_x}
---

Second Output:
---
{output_y}
---

For each criterion:
Criterion: <name> | First: <score> | Second: <score> | Winner: First|Second|Tie | Reason: <1 sentence>

Overall Winner: First|Second|Tie
Overall reason: <1-2 sentences>
```

### 결과 집계 및 출력

```
📊 [eval] Comparison: A vs B (3 judges)
Rubric: general

Winner: Output B (2/3 judges)

| Criterion     |   A  |   B  | Winner |
|---------------|------|------|--------|
| Accuracy      |  8.0 |  8.7 | B      |
| Completeness  |  7.3 |  8.0 | B      |
| Consistency   |  8.0 |  7.7 | A      |
| Clarity       |  8.3 |  7.0 | A      |
| Hallucination |  7.7 |  8.3 | B      |

Overall: A=7.9 vs B=7.9 → Marginal B win (tie-break: Accuracy)

Judge consensus: Medium (2/3 agree on winner)
```

**타이브레이크 규칙:** 전체 평균이 동일하면 루브릭의 첫 번째 기준(가장 중요한 기준)으로 결정한다.

### 저장

결과를 `.xm/eval/results/{timestamp}-compare.json`에 저장한다.

---

## Subcommand: bench

**같은 태스크를 여러 전략/모델로 실행하고, 각 출력을 평가하여 최적을 찾는다.**

### 파싱

`$ARGUMENTS`에서:
- `bench` 다음 = 태스크 설명 (인용부호 안 텍스트)
- `--strategies "s1,s2,s3"` = 벤치마킹할 전략 (쉼표 구분)
- `--models "m1,m2"` = 벤치마킹할 모델 (기본 현재 모델)
- `--trials N` = 전략당 반복 횟수 (기본 3)
- `--rubric <name>` = 평가 루브릭 (기본 `general`)
- `--judges N` = judge 수 (기본 3)

### 실행 흐름

1. **Matrix 생성**: `strategies × models × trials` 조합 목록 생성
2. **병렬 실행**: 각 조합에 대해 x-op 전략으로 태스크 실행 (가능하면 동시)
3. **평가**: 각 출력에 대해 [Subcommand: score] 로직으로 채점
4. **집계**: 전략별 평균 점수, 비용, 소요 시간 계산
5. **추천**: score/$, score/time 등 효율 지표로 최적 전략 추천

**전략 이름 → x-op 매핑:**

| bench 전략명 | x-op 서브커맨드 |
|------------|----------------|
| `refine` | `/x-op refine` |
| `debate` | `/x-op debate` |
| `tournament` | `/x-op tournament` |
| `chain` | `/x-op chain` |
| `review` | `/x-op review` |
| `brainstorm` | `/x-op brainstorm` |
| 미등록 이름 | 직접 Agent 호출로 fallback |

x-op이 없으면 각 전략을 단순 Agent 프롬프트로 fallback 실행한다.

### 결과 집계 및 출력

```
📊 [eval] Benchmark: 3 strategies × 3 trials
Task: "이 코드의 버그를 찾아라"
Rubric: general

| Strategy   | Avg Score | Trials | Est. Cost | Avg Time | Score/$ |
|------------|-----------|--------|-----------|----------|---------|
| refine     |      8.2  |      3 |     $0.12 |      45s |    68.3 |
| debate     |      7.8  |      3 |     $0.08 |      30s |    97.5 |
| tournament |      8.5  |      3 |     $0.15 |      55s |    56.7 |

Best quality:  tournament (8.5/10)
Best value:    debate (97.5 score/$)
Recommendation: debate (best quality-cost balance at 7.8/10, $0.08/run)

Score variance across trials:
  refine     σ=0.3  (consistent)
  debate     σ=0.8  (moderate variance)
  tournament σ=0.2  (consistent)
```

**추천 로직:**
- `best quality`: Avg Score 최고
- `best value`: Score/$ 최고
- `recommendation`: Score ≥ 7.5이고 Score/$ 최고인 전략. 없으면 Score/$ 최고.

### 저장

결과를 `.xm/eval/benchmarks/{timestamp}-bench.json`에 저장한다.

---

## Subcommand: diff

**x-kit 플러그인의 변경량과 품질 변화를 측정한다. git 기반 정량 분석 + 선택적 품질 비교.**

### 파싱

`$ARGUMENTS`에서:
- `diff` (인수 없음) = 마지막 태그/릴리즈 커밋 vs HEAD
- `--from <commit>` = 시작 커밋 (기본: 이전 릴리즈 커밋)
- `--to <commit>` = 끝 커밋 (기본: HEAD)
- `--quality` = 변경된 SKILL.md를 before/after로 품질 비교 (비용 큼)
- `--rubric <name>` = 품질 비교 시 사용할 루브릭 (기본: plan-quality)

### Phase 1: 정량 분석 (git 기반, 즉시)

Bash로 git 명령 실행:

```bash
# 변경된 플러그인 감지
git diff --name-only {from}..{to} -- '*/skills/*/SKILL.md' '*/lib/*.mjs' '*/.claude-plugin/*.json'

# 플러그인별 변경량
git diff --stat {from}..{to} -- 'x-build/' 'x-op/' 'x-eval/' 'x-kit/' ...

# SKILL.md 줄 수 변화
git show {from}:{path} | wc -l   # before
wc -l {path}                      # after

# 커밋 수
git log --oneline {from}..{to} | wc -l

# 버전 변화
git show {from}:package.json | grep version
cat package.json | grep version
```

### Phase 2: 구조 분석 (리더가 파싱)

변경된 SKILL.md를 읽고 구조적 변화를 추출:
- 전략/명령어 수 변화 (예: 16→18 전략)
- 옵션 수 변화 (예: 15→22 옵션)
- 새로 추가된 섹션
- 제거된 섹션

### Phase 3: 품질 비교 (`--quality` 시에만)

변경된 각 SKILL.md에 대해 before/after A/B 비교:

1. before 버전 추출: `git show {from}:{path}`
2. after 버전: 현재 파일
3. [Subcommand: compare] 로직으로 A/B 비교 (judge panel)
4. 각 플러그인에 대해 품질 변화 (score delta) 계산

### 최종 출력

```
📊 [eval] Diff: {from_short}..{to_short} ({N} commits)

## 변경 요약
| Plugin | Files | +Lines | -Lines | Net |
|--------|-------|--------|--------|-----|
| x-op | 2 | +176 | -2 | +174 |
| x-build | 3 | +139 | -4 | +135 |
| x-eval | 1 | +44 | 0 | +44 |
| x-kit | 4 | +49 | 0 | +49 |
| **Total** | **10** | **+408** | **-6** | **+402** |

## 구조 변화
| Plugin | Metric | Before | After | Delta |
|--------|--------|--------|-------|-------|
| x-op | strategies | 16 | 18 | +2 |
| x-op | options | 15 | 22 | +7 |
| x-op | SKILL.md lines | 1200 | 1645 | +445 |
| x-build | phases | 5 | 5 | 0 |
| x-build | sub-steps | 6 | 9 | +3 |
| x-build | SKILL.md lines | 650 | 803 | +153 |

## 주요 변경
- x-op: +investigate, +monitor 전략 추가
- x-op: Self-Score Protocol, --verify, Consensus Loop
- x-build: PRD Generation, PRD Review, plan-check --strict
- x-eval: Reusable Judge Prompt

## 버전
| Plugin | Before | After |
|--------|--------|-------|
| x-op | 1.0.0 | 1.3.0 |
| x-build | 1.0.0 | 1.2.0 |
| x-eval | 1.0.0 | 1.1.0 |
| x-kit | 1.0.0 | 1.6.0 |
```

`--quality` 시 추가:
```
## 품질 비교 (plan-quality rubric)
| Plugin | Before | After | Delta | Verdict |
|--------|--------|-------|-------|---------|
| x-op SKILL.md | 6.8 | 8.2 | +1.4 | ✅ improved |
| x-build SKILL.md | 7.0 | 8.5 | +1.5 | ✅ improved |
```

### 저장

결과를 `.xm/eval/diffs/{timestamp}-diff.json`에 저장한다.

### 저장 스키마

```json
{
  "type": "diff",
  "timestamp": "ISO8601",
  "from": "commit-sha",
  "to": "commit-sha",
  "commits": 12,
  "plugins": {
    "x-op": {
      "files_changed": 2,
      "lines_added": 176,
      "lines_removed": 2,
      "structure": {
        "strategies": { "before": 16, "after": 18 },
        "options": { "before": 15, "after": 22 },
        "skill_lines": { "before": 1200, "after": 1645 }
      },
      "quality": { "before": 6.8, "after": 8.2, "delta": 1.4 }
    }
  },
  "summary": "..."
}
```

---

## Subcommand: rubric

**커스텀 루브릭을 생성하거나 목록을 조회한다.**

### rubric create

`/x-eval rubric create <name> --criteria "c1,c2,c3"`

- `<name>`: 루브릭 이름 (영문, 하이픈 허용)
- `--criteria "c1,c2,c3"`: 평가 기준 (쉼표 구분)
- `--weights "w1,w2,w3"`: 가중치 (선택, 합계 1.0, 기본 균등)
- `--description "..."`: 설명 (선택)

기준 이름은 그대로 judge 프롬프트에 전달된다. 구체적일수록 채점이 일관된다.

저장 위치: `.xm/eval/rubrics/<name>.json`

출력:
```
✅ [eval] Rubric 'strict-code' created
Criteria (3): correctness, edge-cases, complexity
Weights: equal (0.33 each)
Saved: .xm/eval/rubrics/strict-code.json
```

### rubric list

`/x-eval rubric list`

빌트인 루브릭과 커스텀 루브릭을 모두 보여준다:

```
📋 [eval] Available Rubrics

Built-in:
  code-quality    correctness, readability, maintainability, security, test-coverage
  review-quality  coverage, actionability, severity-accuracy, false-positive-rate
  plan-quality    completeness, actionability, scope-fit, risk-coverage
  general         accuracy, completeness, consistency, clarity, hallucination-risk

Custom (.xm/eval/rubrics/):
  strict-code     correctness, edge-cases, complexity
```

---

## Subcommand: report

**현재 세션 또는 특정 세션의 평가 결과를 요약 출력한다.**

### 파싱

- `report` (인수 없음) = 현재 세션 전체 결과
- `report <session-id>` = 특정 세션 결과
- `report --all` = 전체 이력

`.xm/eval/results/`와 `.xm/eval/benchmarks/`를 모두 읽어 집계한다.

### 출력

```
📊 [eval] Evaluation Report (current session)

Scores (3):
  2026-03-25 14:30  code-quality  7.8/10   src/auth.ts
  2026-03-25 14:45  general       8.2/10   "refactoring proposal"
  2026-03-25 15:00  plan-quality  6.9/10   sprint plan v2

Comparisons (1):
  2026-03-25 15:20  general       Winner: B  "response style A vs B"

Benchmarks (1):
  2026-03-25 15:40  3 strategies  Best: tournament (8.5)  Rec: debate

Session avg score: 7.6/10
```

---

## Built-in Rubrics

### code-quality

| Criterion | Description | Weight |
|-----------|-------------|--------|
| correctness | Logic is correct, handles edge cases, no bugs | 0.30 |
| readability | Clear naming, structure, minimal cognitive load | 0.20 |
| maintainability | Extensible, follows patterns, low coupling | 0.20 |
| security | No injection, input validated, secrets safe | 0.20 |
| test-coverage | Critical paths have tests or are testable | 0.10 |

### review-quality

| Criterion | Description | Weight |
|-----------|-------------|--------|
| coverage | All important issues found, nothing critical missed | 0.30 |
| actionability | Each finding has a clear fix suggestion | 0.30 |
| severity-accuracy | Critical bugs labeled critical, nits labeled nits | 0.25 |
| false-positive-rate | No valid code flagged as problematic | 0.15 |

### plan-quality

| Criterion | Description | Weight |
|-----------|-------------|--------|
| completeness | All requirements addressed by tasks | 0.30 |
| actionability | Each task is concrete and executor can start immediately | 0.30 |
| scope-fit | Plan fits the stated goal — not over or under | 0.20 |
| risk-coverage | Key risks and dependencies identified | 0.20 |

### general

| Criterion | Description | Weight |
|-----------|-------------|--------|
| accuracy | Factually correct, no errors | 0.25 |
| completeness | All aspects of the question addressed | 0.25 |
| consistency | No internal contradictions | 0.20 |
| clarity | Easy to follow, well structured | 0.20 |
| hallucination-risk | No unsupported claims or fabricated facts | 0.10 |

---

## Storage Layout

```
.xm/eval/
├── rubrics/               # Custom rubric definitions
│   └── <name>.json
├── results/               # Score and compare results
│   ├── {timestamp}-score.json
│   └── {timestamp}-compare.json
├── benchmarks/            # Benchmark results
│   └── {timestamp}-bench.json
└── diffs/                 # Diff analysis results
    └── {timestamp}-diff.json
```

### Result Schema (score)

```json
{
  "type": "score",
  "timestamp": "ISO8601",
  "rubric": "code-quality",
  "judges": 3,
  "scores": {
    "correctness": [9, 8, 9],
    "readability": [7, 8, 7]
  },
  "averages": { "correctness": 8.7, "readability": 7.3 },
  "overall": 7.8,
  "sigma": 0.6,
  "content_preview": "function add(a,b)..."
}
```

### Result Schema (compare)

```json
{
  "type": "compare",
  "timestamp": "ISO8601",
  "rubric": "general",
  "judges": 3,
  "winner": "B",
  "judge_votes": ["B", "B", "A"],
  "scores": { "A": 7.9, "B": 7.9 },
  "tiebreak": "accuracy",
  "content_previews": { "A": "...", "B": "..." }
}
```

### Rubric Schema

```json
{
  "name": "strict-code",
  "description": "Strict code evaluation",
  "criteria": ["correctness", "edge-cases", "complexity"],
  "weights": [0.5, 0.3, 0.2],
  "created_at": "ISO8601"
}
```

---

## Shared Config Integration

x-eval은 `.xm/config.json`의 공유 설정을 참조한다:

| 설정 | 키 | 기본값 | 영향 |
|------|----|--------|------|
| 에이전트 수 | `agent_max_count` | `4` | 기본 judge 수 |

judge 수는 `--judges N`으로 명시하거나, agent_max_count 값을 사용한다 (기본 4).

### Config Resolution 우선순위

1. CLI 플래그 (`--judges N`) — 명시하면 최우선
2. 공유 config (`agent_max_count`)
3. 기본값 (4)

---

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "이거 평가해줘", "채점해줘", "score this" | `score <content>` |
| "어느 게 나아?", "A vs B 비교해줘" | `compare <a> <b>` |
| "전략 비교", "벤치마크", "어떤 전략이 나아?" | `bench <task> --strategies "..."` |
| "루브릭 만들어줘" | `rubric create <name>` |
| "루브릭 목록", "어떤 기준 있어?" | `rubric list` |
| "평가 결과 보여줘", "report" | `report` |
| "뭐가 바뀌었어?", "변경 분석", "diff" | `diff` |
| "이전 버전과 비교", "얼마나 좋아졌어?" | `diff --quality` |
| "eval 뭐 있어?", "도움말" | `list` |

---

## Reusable Judge Prompt

다른 x-kit 플러그인(x-op --verify 등)에서 x-eval 채점 로직을 인라인으로 재사용할 때 사용하는 표준 프롬프트.

### 사용법

x-op의 `--verify` 옵션이 이 프롬프트를 사용하여 judge panel을 소환한다. x-eval을 별도로 호출하지 않고, 이 프롬프트를 Agent tool에 직접 전달한다.

### Judge Prompt

```
"## Quality Evaluation
Rubric: {rubric_name}
Criteria: {criterion1} ({weight1}), {criterion2} ({weight2}), ...

Output to evaluate:
---
{평가 대상 텍스트}
---

각 기준을 1-10점으로 채점하라:
- 1: 불합격 — 기본 요구사항 미충족
- 5: 기본 수준 — 요구사항 충족하나 개선 여지
- 7: 우수 — 명확하고 실행 가능
- 10: 탁월 — 전문가 수준, 즉시 활용 가능

출력 형식 (정확히 준수):
Criterion: <name> | Score: <N> | Reason: <한 줄 근거>
Criterion: <name> | Score: <N> | Reason: <한 줄 근거>
...
Final: <가중평균>/10"
```

### 내장 Rubric 참조

| Rubric | Criteria (weight) |
|--------|-------------------|
| code-quality | correctness (0.30), readability (0.20), maintainability (0.20), security (0.20), test-coverage (0.10) |
| review-quality | coverage (0.30), actionability (0.30), severity-accuracy (0.25), false-positive-rate (0.15) |
| plan-quality | completeness (0.30), actionability (0.30), scope-fit (0.20), risk-coverage (0.20) |
| general | accuracy (0.25), completeness (0.25), consistency (0.20), clarity (0.20), hallucination-risk (0.10) |
