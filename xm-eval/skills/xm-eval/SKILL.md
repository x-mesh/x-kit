---
name: xm-eval
description: Agent output quality evaluation — multi-rubric scoring, strategy benchmarking, and A/B prompt experiments
---

<Purpose>
xm-eval은 AI 에이전트 출력의 품질을 구조적으로 평가한다. 다차원 루브릭으로 독립 judge 에이전트가 출력을 채점하고, 전략/모델 벤치마킹과 A/B 프롬프트 실험을 지원한다.
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
- Strategy execution without evaluation (use xm-op instead)
- Project lifecycle management (use xm-build instead)
</Do_Not_Use_When>

# xm-eval — Agent Output Quality Evaluation

다차원 루브릭 채점, 전략 벤치마킹, A/B 프롬프트 실험.
Judge 에이전트 팬아웃으로 독립 평가 후 집계한다.

## Arguments

User provided: $ARGUMENTS

## Routing

`$ARGUMENTS`의 첫 단어:
- `score` → [Subcommand: score]
- `compare` → [Subcommand: compare]
- `bench` → [Subcommand: bench]
- `rubric` → [Subcommand: rubric]
- `report` → [Subcommand: report]
- `list` 또는 빈 입력 → [Subcommand: list]

---

## Subcommand: list

```
xm-eval — Agent Output Quality Evaluation

Commands:
  score <content> --rubric <name|criteria>     Score content against rubric
  compare <output-a> <output-b> [--judges N]   Compare two outputs with judge panel
  bench <task> --strategies "s1,s2"            Benchmark strategies/models
       [--models "m1,m2"] [--trials N]
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
  /xm-eval score "function add(a,b){return a+b}" --rubric code-quality
  /xm-eval compare output-a.md output-b.md --judges 5
  /xm-eval bench "버그를 찾아라" --strategies "refine,debate,tournament" --trials 3
  /xm-eval rubric create strict-code --criteria "correctness,edge-cases,complexity"
  /xm-eval report
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

### Agent Level 확인

```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/xm-build-cli.mjs config get agent_level 2>/dev/null || echo "medium"
```

| Level | 기본 Judges |
|-------|------------|
| `min` | 1 |
| `medium` | 3 |
| `max` | 5 |

`--judges N` 명시 시 agent_level을 오버라이드.

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
2. **병렬 실행**: 각 조합에 대해 xm-op 전략으로 태스크 실행 (가능하면 동시)
3. **평가**: 각 출력에 대해 [Subcommand: score] 로직으로 채점
4. **집계**: 전략별 평균 점수, 비용, 소요 시간 계산
5. **추천**: score/$, score/time 등 효율 지표로 최적 전략 추천

**전략 이름 → xm-op 매핑:**

| bench 전략명 | xm-op 서브커맨드 |
|------------|----------------|
| `refine` | `/xm-op refine` |
| `debate` | `/xm-op debate` |
| `tournament` | `/xm-op tournament` |
| `chain` | `/xm-op chain` |
| `review` | `/xm-op review` |
| `brainstorm` | `/xm-op brainstorm` |
| 미등록 이름 | 직접 Agent 호출로 fallback |

xm-op이 없으면 각 전략을 단순 Agent 프롬프트로 fallback 실행한다.

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

## Subcommand: rubric

**커스텀 루브릭을 생성하거나 목록을 조회한다.**

### rubric create

`/xm-eval rubric create <name> --criteria "c1,c2,c3"`

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

`/xm-eval rubric list`

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
└── benchmarks/            # Benchmark results
    └── {timestamp}-bench.json
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

xm-eval은 `.xm/config.json`의 공유 설정을 참조한다:

| 설정 | 키 | 기본값 | 영향 |
|------|----|--------|------|
| 에이전트 수 | `agent_level` | `medium` (3) | 기본 judge 수 |

### Agent Level → Judge 수 매핑

| Level | 기본 Judges |
|-------|------------|
| `min` | 1 |
| `medium` | 3 |
| `max` | 5 |

`--judges N` 명시 시 agent_level을 오버라이드.

### Config Resolution 우선순위

1. CLI 플래그 (`--judges N`) — 명시하면 최우선
2. 공유 config (`agent_level` → judge 수 매핑)
3. 기본값 (3)

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
| "eval 뭐 있어?", "도움말" | `list` |
