---
name: xm-trace
description: Agent execution tracing — timeline, token/cost tracking, replay, and diff for multi-agent observability
---

<Purpose>
xm-trace는 xm-kit 도구 실행을 추적한다. 에이전트 호출 트리, 토큰 추정량, 비용, 소요 시간을 기록한다. 타임라인 시각화, 실행 재현(replay), 세션 간 diff를 제공한다.
외부 의존성 없음. 모든 상태는 `.xm/traces/`에 JSONL 파일로 저장된다.
</Purpose>

<Use_When>
- User wants to trace or observe multi-agent execution
- User says "trace", "실행 기록", "비용 확인", "토큰 사용량", "타임라인 보여줘"
- User wants to compare two runs ("diff", "전후 비교")
- User wants to replay a previous execution ("replay", "재현")
- Other xm-kit skills want to record agent calls for observability
</Use_When>

<Do_Not_Use_When>
- Simple single-step tasks with no agent fan-out
- Cost tracking for non-xm-kit workflows
- Real-time monitoring (xm-trace is post-hoc, not live)
</Do_Not_Use_When>

# xm-trace — Agent Execution Tracing

Claude Code 네이티브 Bash tool로 JSONL 파일을 읽고 쓴다.
외부 의존성 없음. `.xm/traces/` 디렉토리만 있으면 동작.

## Arguments

User provided: $ARGUMENTS

## Routing

`$ARGUMENTS`의 첫 단어로 서브커맨드를 결정한다:

- `start` → [Subcommand: start]
- `stop` → [Subcommand: stop]
- `show` → [Subcommand: show]
- `cost` → [Subcommand: cost]
- `replay` → [Subcommand: replay]
- `diff` → [Subcommand: diff]
- `list` → [Subcommand: list]
- `clean` → [Subcommand: clean]
- 빈 입력 또는 `help` → [Subcommand: help]
- 그 외 → `show` (최신 세션 표시)

---

## Subcommand: help

```
xm-trace — Agent Execution Tracing for xm-kit

Commands:
  start [name]                   Start a named trace session
  stop                           Stop current session and save
  show [session]                 Show trace timeline (default: latest)
  cost [session]                 Show cost breakdown by agent/task
  replay <session> [--from step] Replay execution from specific step
  diff <session1> <session2>     Compare two trace sessions
  list                           List saved trace sessions
  clean [--older-than 7d]        Clean old trace files

Storage: .xm/traces/{session-name}-{timestamp}.jsonl

Examples:
  /xm-trace start feature-auth
  /xm-trace show
  /xm-trace cost feature-auth-20260325
  /xm-trace diff run-1 run-2
  /xm-trace replay feature-auth-20260325 --from 3
  /xm-trace clean --older-than 7d
```

---

## Subcommand: start

세션 이름을 받아 새 트레이스 세션을 시작한다.

### 파싱

`$ARGUMENTS`에서:
- `start` 다음 단어 = 세션 이름 (기본: `session-{YYYYMMDD-HHMMSS}`)

### 실행

1. `.xm/traces/` 디렉토리가 없으면 생성:
   ```bash
   mkdir -p .xm/traces
   ```

2. 세션 파일 경로 결정:
   ```
   .xm/traces/{name}-{YYYYMMDD-HHMMSS}.jsonl
   ```

3. 세션 시작 엔트리를 JSONL에 기록:
   ```bash
   echo '{"id":"s-000","timestamp":"...","type":"session_start","session":"...","status":"active"}' >> .xm/traces/{file}
   ```

4. 현재 활성 세션을 `.xm/traces/.active` 파일에 저장:
   ```bash
   echo '.xm/traces/{file}' > .xm/traces/.active
   ```

### 출력

```
[trace] Session started: feature-auth
  File: .xm/traces/feature-auth-20260325-120000.jsonl
  Use /xm-trace stop to end the session.
```

---

## Subcommand: stop

현재 활성 세션을 종료하고 저장한다.

### 실행

1. `.xm/traces/.active` 파일에서 활성 세션 파일 경로 읽기
2. 세션 종료 엔트리 기록:
   ```json
   {"id":"s-end","timestamp":"...","type":"session_end","status":"completed","total_entries":N}
   ```
3. `.xm/traces/.active` 파일 삭제

### 출력

```
[trace] Session stopped: feature-auth-20260325-120000
  Entries: 12
  Duration: 16s
  File saved: .xm/traces/feature-auth-20260325-120000.jsonl
```

---

## Subcommand: show

트레이스 타임라인을 ASCII로 렌더링한다.

### 파싱

`$ARGUMENTS`에서:
- `show` 다음 = 세션 이름 (부분 매칭 허용, 생략 시 최신 세션)

### 세션 파일 탐색

```bash
# 최신 세션
ls -t .xm/traces/*.jsonl 2>/dev/null | head -1

# 이름 매칭
ls .xm/traces/*.jsonl 2>/dev/null | grep "{name}"
```

### 타임라인 렌더링

JSONL 파일의 각 엔트리를 읽어 아래 형식으로 출력한다:

```
[trace] Session: feature-auth (2026-03-25)

00:00 ┬ xm-op:review started
00:01 ├─┬ fan-out: 4 agents
00:01 │ ├── agent-1: security (~2.5K in, ~800 out) ✅ 12s
00:01 │ ├── agent-2: logic (~2.5K in, ~600 out) ✅ 10s
00:01 │ ├── agent-3: performance (~2.5K in, ~700 out) ✅ 11s
00:01 │ └── agent-4: tests (~2.5K in, ~500 out) ✅ 9s
00:13 ├── synthesize ✅ 3s
00:16 └── complete

Total: 16s | ~13K tokens | ~$0.04 est.
```

### 타임라인 렌더링 규칙

- 시간 표시: 세션 시작 기준 경과 시간 (`MM:SS`)
- `parent_id: null` 엔트리 → 루트 노드 (`┬`)
- `parent_id` 있는 엔트리 → 자식 노드 (`├──` 또는 `└──`)
- 마지막 자식 → `└──`, 나머지 → `├──`
- fan-out 그룹 → `├─┬` + 들여쓰기
- status별 아이콘: `completed` → ✅, `failed` → ❌, `running` → 🔵, `skipped` → ⏭️
- 토큰 표시: 1000 단위로 `K` 약식 (2500 → `~2.5K`)
- 비용은 합산 후 `Total` 줄에 표시

---

## Subcommand: cost

에이전트/태스크별 비용 상세 리포트를 출력한다.

### 파싱

`show`와 동일하게 세션 파일 탐색.

### 비용 계산 (토큰 단가)

| 모델 | 입력 ($/1M tokens) | 출력 ($/1M tokens) |
|------|-------------------|-------------------|
| haiku | $0.80 | $4.00 |
| sonnet | $3.00 | $15.00 |
| opus | $15.00 | $75.00 |

`input_tokens_est`, `output_tokens_est`, `agent.model` 필드로 계산:
```
cost = (input_tokens_est / 1_000_000 * input_rate) + (output_tokens_est / 1_000_000 * output_rate)
```

### 출력

```
[trace] Cost Report: feature-auth

| Agent        | Model  | In Tokens | Out Tokens | Est. Cost |
|--------------|--------|-----------|------------|-----------|
| security     | sonnet |     2,500 |        800 |    $0.012 |
| logic        | sonnet |     2,500 |        600 |    $0.017 |
| performance  | sonnet |     2,500 |        700 |    $0.018 |
| tests        | sonnet |     2,500 |        500 |    $0.015 |
| synthesize   | sonnet |     3,000 |        600 |    $0.018 |
|--------------|--------|-----------|------------|-----------|
| TOTAL        |        |    15,000 |      3,200 |    $0.080 |

Source: xm-op:review | Duration: 16s | Agents: 5
```

---

## Subcommand: replay

특정 세션의 실행을 지정 스텝부터 재현한다.

### 파싱

`$ARGUMENTS`에서:
- `replay` 다음 = 세션 이름 (필수)
- `--from N` = 재현 시작 스텝 번호 (생략 시 처음부터)

### 실행

1. 세션 파일 읽기
2. `step >= N` 인 엔트리만 필터링
3. 각 에이전트 엔트리의 프롬프트/컨텍스트를 화면에 순서대로 표시
4. 사용자에게 확인 후 실제 Agent tool 재호출 여부 질문

### 출력

```
[trace] Replay: feature-auth-20260325 (from step 3)

Step 3: agent-1 (security, sonnet)
  Source: xm-op:review
  Input tokens est.: ~2,500
  ---
  [프롬프트 미리보기 첫 200자...]
  ---

Step 4: agent-2 (logic, sonnet)
  ...

Replay steps 3-6? (y/N)
```

사용자가 확인하면 해당 에이전트들을 `run_in_background: true`로 재호출한다.

---

## Subcommand: diff

두 트레이스 세션을 비교하여 차이를 출력한다.

### 파싱

`$ARGUMENTS`에서:
- `diff` 다음 두 단어 = 세션 이름 1, 세션 이름 2

### 비교 지표

각 세션의 JSONL을 읽어 다음 지표를 집계한다:

| 지표 | 설명 |
|------|------|
| Duration | 세션 총 소요 시간 (ms) |
| Tokens | 총 토큰 수 (in + out) |
| Cost | 총 추정 비용 ($) |
| Agents | 에이전트 호출 수 |
| Failed | 실패한 에이전트 수 |
| Steps | 총 스텝 수 |

### 출력

```
[trace] Diff: run-1 vs run-2

| Metric   | run-1  | run-2  | Delta   |
|----------|--------|--------|---------|
| Duration | 16s    | 22s    | +38%    |
| Tokens   | 13K    | 18K    | +38%    |
| Cost     | $0.04  | $0.06  | +50%    |
| Agents   | 4      | 6      | +2      |
| Failed   | 0      | 1      | +1      |
| Steps    | 3      | 4      | +1      |

Agent breakdown:
  run-1: security ✅, logic ✅, performance ✅, tests ✅
  run-2: security ✅, logic ✅, performance ✅, tests ❌, retry-tests ✅, synthesize ✅

Summary: run-2 took 38% longer with 1 failure and retry.
```

---

## Subcommand: list

저장된 트레이스 세션 목록을 출력한다.

### 실행

```bash
ls -lt .xm/traces/*.jsonl 2>/dev/null
```

각 파일의 첫 번째와 마지막 엔트리를 읽어 세션 메타데이터를 표시.

### 출력

```
[trace] Saved sessions (5 total)

  NAME                           DATE        DURATION  AGENTS  COST
  feature-auth-20260325-120000   2026-03-25  16s       4       $0.04
  feature-auth-20260324-090000   2026-03-24  22s       6       $0.06
  bugfix-login-20260323-150000   2026-03-23  8s        2       $0.02
  review-pr-42-20260322-110000   2026-03-22  31s       8       $0.09
  init-project-20260321-140000   2026-03-21  45s       12      $0.14

Active: feature-auth-20260325-120000 (running)
```

---

## Subcommand: clean

오래된 트레이스 파일을 삭제한다.

### 파싱

`$ARGUMENTS`에서:
- `--older-than Nd` = N일보다 오래된 파일 삭제 (기본: `7d`)

### 실행

```bash
# 7일 이전 파일 탐색
find .xm/traces/ -name "*.jsonl" -mtime +7
```

삭제 전 목록을 보여주고 사용자에게 확인 요청.

### 출력

```
[trace] Clean: files older than 7 days

  To delete (3 files):
    .xm/traces/init-project-20260310-140000.jsonl  (15d ago, 12KB)
    .xm/traces/bugfix-20260308-110000.jsonl        (17d ago, 4KB)
    .xm/traces/review-20260305-090000.jsonl        (20d ago, 8KB)

  Total: 24KB will be freed.

Delete? (y/N)
```

---

## Data Model

### 스토리지 경로

```
.xm/traces/
├── {session-name}-{YYYYMMDD-HHMMSS}.jsonl   # 세션별 트레이스 파일
├── {session-name}-{YYYYMMDD-HHMMSS}.jsonl   # ...
└── .active                                   # 현재 활성 세션 파일 경로
```

### JSONL 엔트리 스키마

각 줄은 독립적인 JSON 객체:

```json
{
  "id": "t-001",
  "timestamp": "2026-03-25T12:00:00Z",
  "type": "agent_call",
  "parent_id": null,
  "agent": {
    "role": "security",
    "model": "sonnet"
  },
  "input_tokens_est": 2500,
  "output_tokens_est": 800,
  "duration_ms": 12000,
  "status": "completed",
  "source": "xm-op:review",
  "step": 1
}
```

### 엔트리 타입 (type 필드)

| type | 설명 | 필수 필드 |
|------|------|-----------|
| `session_start` | 세션 시작 | `session`, `status` |
| `session_end` | 세션 종료 | `status`, `total_entries` |
| `agent_call` | 에이전트 호출 | `agent`, `step`, `source` |
| `fan_out` | 병렬 에이전트 그룹 시작 | `count`, `source` |
| `synthesize` | 결과 통합 단계 | `parent_id`, `step` |
| `checkpoint` | 수동 기록 지점 | `label` |

### 상태값 (status 필드)

| status | 아이콘 | 설명 |
|--------|--------|------|
| `completed` | ✅ | 성공 완료 |
| `failed` | ❌ | 실패 |
| `running` | 🔵 | 실행 중 |
| `skipped` | ⏭️ | 건너뜀 |
| `active` | 🟢 | 세션 활성 |

---

## 다른 xm-kit 도구와의 연동

xm-trace는 다른 xm-kit 스킬에서 에이전트 호출 전후에 엔트리를 기록하여 사용할 수 있다.

### xm-op 연동 예시

xm-op의 `review` 전략 실행 시:

```bash
# fan-out 시작 기록
echo '{"id":"fo-001","timestamp":"...","type":"fan_out","count":4,"source":"xm-op:review","step":1}' >> .xm/traces/.active-file

# 각 에이전트 완료 후 기록
echo '{"id":"t-001","timestamp":"...","type":"agent_call","parent_id":"fo-001","agent":{"role":"security","model":"sonnet"},...}' >> .xm/traces/.active-file
```

### xm-build 연동 예시

xm-build의 `run` 커맨드 실행 시 각 태스크 에이전트 호출을 자동 기록.

---

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "trace 시작", "기록 시작해줘" | `start` |
| "trace 종료", "기록 멈춰" | `stop` |
| "타임라인 보여줘", "실행 기록 보여줘" | `show` |
| "비용 얼마야", "토큰 얼마 썼어" | `cost` |
| "이전 실행 다시 해봐", "재현해줘" | `replay` |
| "전후 비교해줘", "두 실행 비교" | `diff` |
| "세션 목록", "trace 목록" | `list` |
| "오래된 거 지워줘", "정리해줘" | `clean` |
