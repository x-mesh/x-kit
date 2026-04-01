---
name: x-trace
description: Agent execution tracing — timeline, token/cost tracking, replay, and diff for multi-agent observability
---

<Purpose>
x-trace tracks x-kit tool executions. It records agent call trees, estimated token counts, costs, and elapsed time. It provides timeline visualization, execution replay, and cross-session diff.
No external dependencies. All state is stored as JSONL files in `.xm/traces/`.
</Purpose>

<Use_When>
- User wants to trace or observe multi-agent execution
- User says "trace", "execution log", "check cost", "token usage", "show timeline"
- User wants to compare two runs ("diff", "compare before and after")
- User wants to replay a previous execution ("replay", "reproduce")
- Other x-kit skills want to record agent calls for observability
</Use_When>

<Do_Not_Use_When>
- Simple single-step tasks with no agent fan-out
- Cost tracking for non-x-kit workflows
- Real-time monitoring (x-trace is post-hoc, not live)
</Do_Not_Use_When>

# x-trace — Agent Execution Tracing

Reads and writes JSONL files using Claude Code's native Bash tool.
No external dependencies. Works as long as the `.xm/traces/` directory exists.

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

**Developer mode**: Use technical terms (trace, timeline, token, replay, diff, JSONL). Concise.

**Normal mode**: 쉬운 한국어로 안내합니다.
- "trace" → "실행 기록", "timeline" → "시간순 보기", "token" → "토큰", "replay" → "다시 보기"
- "diff" → "비교", "cost" → "비용"
- "~하세요" 체 사용, 핵심 정보 먼저

## Arguments

User provided: $ARGUMENTS

## Routing

Determine the subcommand from the first word of `$ARGUMENTS`:

- `start` → [Subcommand: start]
- `stop` → [Subcommand: stop]
- `show` → [Subcommand: show]
- `cost` → [Subcommand: cost]
- `replay` → [Subcommand: replay]
- `diff` → [Subcommand: diff]
- `list` → [Subcommand: list]
- `clean` → [Subcommand: clean]
- Empty input or `help` → [Subcommand: help]
- Anything else → `show` (display latest session)

---

## Subcommand: help

```
x-trace — Agent Execution Tracing for x-kit

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
  /x-trace start feature-auth
  /x-trace show
  /x-trace cost feature-auth-20260325
  /x-trace diff run-1 run-2
  /x-trace replay feature-auth-20260325 --from 3
  /x-trace clean --older-than 7d
```

---

## Subcommand: start

Starts a new trace session with the given session name.

### Parsing

From `$ARGUMENTS`:
- Word after `start` = session name (default: `session-{YYYYMMDD-HHMMSS}`)

### Execution

1. Create `.xm/traces/` directory if it does not exist:
   ```bash
   mkdir -p .xm/traces
   ```

2. Determine session file path:
   ```
   .xm/traces/{name}-{YYYYMMDD-HHMMSS}.jsonl
   ```

3. Write session start entry to JSONL:
   ```bash
   echo '{"id":"s-000","timestamp":"...","type":"session_start","session":"...","status":"active"}' >> .xm/traces/{file}
   ```

4. Save current active session to `.xm/traces/.active` (atomic write):
   ```bash
   echo '.xm/traces/{file}' > .xm/traces/.active.tmp && mv .xm/traces/.active.tmp .xm/traces/.active
   ```

### Output

```
[trace] Session started: feature-auth
  File: .xm/traces/feature-auth-20260325-120000.jsonl
  Use /x-trace stop to end the session.
```

---

## Subcommand: stop

Stops the current active session and saves it.

### Execution

1. Read active session file path from `.xm/traces/.active`
2. Write session end entry:
   ```json
   {"id":"s-end","timestamp":"...","type":"session_end","status":"completed","total_entries":N}
   ```
3. Delete `.xm/traces/.active`

### Output

```
[trace] Session stopped: feature-auth-20260325-120000
  Entries: 12
  Duration: 16s
  File saved: .xm/traces/feature-auth-20260325-120000.jsonl
```

---

## Subcommand: show

Renders the trace timeline in ASCII.

### Parsing

From `$ARGUMENTS`:
- After `show` = session name (partial matching allowed; defaults to latest session if omitted)

### Session file lookup

```bash
# Latest session
ls -t .xm/traces/*.jsonl 2>/dev/null | head -1

# Name matching
ls .xm/traces/*.jsonl 2>/dev/null | grep "{name}"
```

### Timeline rendering

Read each entry from the JSONL file and output in the following format:

```
[trace] Session: feature-auth (2026-03-25)

00:00 ┬ x-op:review started
00:01 ├─┬ fan-out: 4 agents
00:01 │ ├── agent-1: security (~2.5K in, ~800 out) ✅ 12s
00:01 │ ├── agent-2: logic (~2.5K in, ~600 out) ✅ 10s
00:01 │ ├── agent-3: performance (~2.5K in, ~700 out) ✅ 11s
00:01 │ └── agent-4: tests (~2.5K in, ~500 out) ✅ 9s
00:13 ├── synthesize ✅ 3s
00:16 └── complete

Total: 16s | ~13K tokens | ~$0.04 est.
```

### Timeline rendering rules

- Time display: elapsed time from session start (`MM:SS`)
- Entries with `parent_id: null` → root node (`┬`)
- Entries with `parent_id` → child node (`├──` or `└──`)
- Last child → `└──`, others → `├──`
- Fan-out group → `├─┬` + indentation
- Status icons: `completed` → ✅, `failed` → ❌, `running` → 🔵, `skipped` → ⏭️
- Token display: abbreviated with `K` for thousands (2500 → `~2.5K`)
- Cost is summed and shown on the `Total` line

---

## Subcommand: cost

Outputs a detailed cost report broken down by agent/task.

### Parsing

Same session file lookup as `show`.

### Cost calculation (token rates)

| Model | Input ($/1M tokens) | Output ($/1M tokens) |
|------|-------------------|-------------------|
| haiku | $0.80 | $4.00 |
| sonnet | $3.00 | $15.00 |
| opus | $15.00 | $75.00 |

Calculated from `input_tokens_est`, `output_tokens_est`, and `agent.model` fields:
```
cost = (input_tokens_est / 1_000_000 * input_rate) + (output_tokens_est / 1_000_000 * output_rate)
```

### Output

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

Source: x-op:review | Duration: 16s | Agents: 5
```

---

## Subcommand: replay

Replays an execution from a specific step of a given session.

### Parsing

From `$ARGUMENTS`:
- After `replay` = session name (required)
- `--from N` = step number to start replay from (defaults to beginning if omitted)

### Execution

1. Read session file
2. Filter entries where `step >= N`
3. Display each agent entry's prompt/context sequentially
4. Ask user whether to re-invoke the actual Agent tool calls

### Output

```
[trace] Replay: feature-auth-20260325 (from step 3)

Step 3: agent-1 (security, sonnet)
  Source: x-op:review
  Input tokens est.: ~2,500
  ---
  [Prompt preview, first 200 chars...]
  ---

Step 4: agent-2 (logic, sonnet)
  ...

Replay steps 3-6? (y/N)
```

If the user confirms, re-invoke those agents with `run_in_background: true`.

---

## Subcommand: diff

Compares two trace sessions and outputs the differences.

### Parsing

From `$ARGUMENTS`:
- Two words after `diff` = session name 1, session name 2

### Comparison metrics

Read JSONL from each session and aggregate the following metrics:

| Metric | Description |
|------|------|
| Duration | Total session duration (ms) |
| Tokens | Total token count (in + out) |
| Cost | Total estimated cost ($) |
| Agents | Number of agent calls |
| Failed | Number of failed agents |
| Steps | Total number of steps |

### Output

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

Lists saved trace sessions.

### Execution

```bash
ls -lt .xm/traces/*.jsonl 2>/dev/null
```

Read the first and last entry of each file to display session metadata.

### Output

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

Deletes old trace files.

### Parsing

From `$ARGUMENTS`:
- `--older-than Nd` = delete files older than N days (default: `7d`)

### Execution

```bash
# Find files older than 7 days
find .xm/traces/ -name "*.jsonl" -mtime +7
```

Show the list before deletion and ask the user for confirmation.

### Output

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

### Storage path

```
.xm/traces/
├── {session-name}-{YYYYMMDD-HHMMSS}.jsonl   # Per-session trace file
├── {session-name}-{YYYYMMDD-HHMMSS}.jsonl   # ...
└── .active                                   # Current active session file path
```

### JSONL entry schema

Each line is an independent JSON object:

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
  "source": "x-op:review",
  "step": 1
}
```

### Entry types (type field)

| type | Description | Required fields |
|------|------|-----------|
| `session_start` | Session start | `session`, `status` |
| `session_end` | Session end | `status`, `total_entries` |
| `agent_call` | Agent invocation | `agent`, `step`, `source` |
| `fan_out` | Parallel agent group start | `count`, `source` |
| `synthesize` | Result aggregation step | `parent_id`, `step` |
| `checkpoint` | Manual recording point | `label` |

### Status values (status field)

| status | Icon | Description |
|--------|--------|------|
| `completed` | ✅ | Completed successfully |
| `failed` | ❌ | Failed |
| `running` | 🔵 | Running |
| `skipped` | ⏭️ | Skipped |
| `active` | 🟢 | Session active |

---

## Integration with other x-kit tools

x-trace can be used by other x-kit skills to record entries before and after agent calls.

### x-op integration example

When executing x-op's `review` strategy:

```bash
# Record fan-out start
echo '{"id":"fo-001","timestamp":"...","type":"fan_out","count":4,"source":"x-op:review","step":1}' >> .xm/traces/.active-file

# Record after each agent completes
echo '{"id":"t-001","timestamp":"...","type":"agent_call","parent_id":"fo-001","agent":{"role":"security","model":"sonnet"},...}' >> .xm/traces/.active-file
```

### x-build integration example

Automatically records each task agent call when x-build's `run` command executes.

---

## Auto-recording event guide

Events each x-kit plugin should record:

### x-op strategy execution
| Event | Trace type | When to record |
|--------|-----------|----------|
| Strategy start | `session_start` | Immediately after `/x-op {strategy}` is called |
| Fan-out call | `fan_out` | When N agents are invoked concurrently (includes agents[], prompt) |
| Delegate call | `agent_call` | When a single agent is invoked (role, model, prompt) |
| Round synthesis | `synthesize` | When the leader synthesizes results (round, summary) |
| Checkpoint save | `checkpoint` | When saving a checkpoint for `--resume` |
| Strategy complete | `session_end` | When final output + Self-Score is complete (total_cost, duration) |

### x-build task execution
| Event | Trace type | When to record |
|--------|-----------|----------|
| Run start | `session_start` | When `x-build run` is called (step_id, task_count) |
| Agent spawn | `agent_call` | When each task agent is spawned (task_id, role, model) |
| Task complete | `agent_call` + `status: done` | On `tasks update --status completed` callback |
| Task failure | `agent_call` + `status: failed` | On failure, includes error_message |
| Step complete | `checkpoint` | When all tasks in the current step are complete |

### x-review review
| Event | Trace type | When to record |
|--------|-----------|----------|
| Review start | `session_start` | When `/x-review diff` is called |
| Per-lens review | `fan_out` | When per-agent review is invoked (lens, model) |
| Final verdict | `synthesize` | When verdict is determined (findings_count, verdict) |

## Cost alert rules

Warn when cumulative cost exceeds thresholds during trace recording:

| Threshold | Action |
|--------|------|
| `budget × 50%` | `💡 50% of budget used: $X / $Y` (info) |
| `budget × 80%` | `⚠ 80% of budget used: $X / $Y` (warning) |
| `budget × 100%` | `🚨 Budget exceeded: $X / $Y — continue?` (confirmation required) |

Budget is read from `budget.max_usd` in `.xm/config.json`. No alerts if unset.

Automatic cost summary on session end:
```
📊 Session cost: $0.42 (input: 180K, output: 45K tokens)
   Budget: $0.42 / $5.00 (8.4%)
```

---

## Natural Language Mapping

| User says | Command |
|-----------|---------|
| "start trace", "start recording" | `start` |
| "stop trace", "stop recording" | `stop` |
| "show timeline", "show execution log" | `show` |
| "how much did it cost", "how many tokens used" | `cost` |
| "redo the previous run", "reproduce it" | `replay` |
| "compare before and after", "compare two runs" | `diff` |
| "session list", "trace list" | `list` |
| "delete old ones", "clean up" | `clean` |
