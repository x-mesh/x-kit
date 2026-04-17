# Autonomous: swarm

**Agents self-organize around a shared goal using a task board — claiming work, executing, posting results, and spawning new subtasks they discover along the way.**

Unlike x-op `distribute` (leader splits tasks upfront and assigns), swarm agents read the board, pick their own work, and add tasks they discover during execution. The leader only manages the board (no task assignment) and synthesizes the final result.

### Parsing

From `$ARGUMENTS`:
- After `swarm` = goal description
- `--agents N` = number of agents (default 3)
- `--model sonnet|opus|haiku` = model (default sonnet)
- `--budget N` = max rounds per agent (default 10)
- `--seed "task1, task2, task3"` = initial task list (optional — leader auto-generates if absent)

### Core Mechanism: Task Board Stigmergy

Agents share a JSONL task board. Each agent reads the board, claims an open task, executes it, posts the result, and optionally adds new tasks discovered during execution.

```
BOARD: .xm/swarm/{run-id}/board.jsonl

Each line is one entry:
  {"type":"task","id":1,"desc":"...","status":"open"}
  {"type":"claim","id":1,"agent":"swarm-1","ts":"..."}
  {"type":"result","id":1,"agent":"swarm-1","output":"...","new_tasks":["desc1","desc2"]}
  {"type":"task","id":4,"desc":"...","status":"open","added_by":"swarm-1"}
  {"type":"goal_check","progress":"62%→71%","remaining":3}
```

```
┌─ swarm-1 ──────────────────────────────────────┐
│                                                 │
│  while budget > 0:                              │
│    1. READ BOARD — find open (unclaimed) tasks  │
│    2. CLAIM     — write claim entry to board    │
│    3. EXECUTE   — do the work                   │
│    4. POST      — write result + new tasks      │
│    5. CHECK GOAL — is the overall goal met?     │
│       if goal met: STOP                         │
│    budget -= 1                                  │
│                                                 │
│  REPORT — tasks completed, tasks added          │
└─────────────────────────────────────────────────┘
```

### Board Protocol

**Task entry** (leader or agent creates):
```json
{"type":"task","id":N,"desc":"description","status":"open","added_by":"leader|swarm-N"}
```

**Claim** (agent claims a task — prevents double-work):
```json
{"type":"claim","id":N,"agent":"swarm-N","ts":"ISO timestamp"}
```

**Result** (agent posts completion):
```json
{"type":"result","id":N,"agent":"swarm-N","status":"done|failed","output":"summary","new_tasks":["desc1","desc2"]}
```

**Conflict resolution**: If two agents claim the same task (race condition), the agent that reads the board and sees another's claim first should release and pick a different task. In practice, with sleep staggering this is rare.

### Execution

**Step 0: Create board and seed tasks**

```bash
RUN_ID="swarm-$(date +%Y%m%d-%H%M%S)"
mkdir -p .xm/swarm/$RUN_ID
```

If `--seed` provided, leader writes initial tasks:
```bash
echo '{"type":"task","id":1,"desc":"task 1","status":"open","added_by":"leader"}' >> board.jsonl
echo '{"type":"task","id":2,"desc":"task 2","status":"open","added_by":"leader"}' >> board.jsonl
```

If `--seed` absent, leader analyzes the goal and auto-generates 3-6 initial tasks.

**Step 1: Launch agents with staggered start**

To reduce claim conflicts, agents start with slight delays:

```
Agent 1: { prompt: "...", run_in_background: true }  — immediate
Agent 2: { prompt: "... sleep 3 first ...", run_in_background: true }  — 3s delay
Agent 3: { prompt: "... sleep 6 first ...", run_in_background: true }  — 6s delay
```

**Step 2: Wait for all agents to complete**

Agents stop when: budget exhausted, no open tasks remain, or goal is met.

**Step 3: Leader synthesize**

Read the board, collect all results, verify goal completion.

### Swarm Agent Prompt

```
## Swarm Worker: {GOAL}

You are swarm-{N}, one of {total} autonomous workers.
Your goal: {GOAL}

### Board
BOARD FILE: {absolute_path_to_board.jsonl}

- READ board: Bash("cat {board_path}")
- CLAIM a task: Bash("echo '{\"type\":\"claim\",\"id\":ID,\"agent\":\"swarm-{N}\",\"ts\":\"TIMESTAMP\"}' >> {board_path}")
- POST result: Bash("echo '{\"type\":\"result\",\"id\":ID,\"agent\":\"swarm-{N}\",\"status\":\"done\",\"output\":\"SUMMARY\",\"new_tasks\":[]}' >> {board_path}")
- ADD new task: Bash("echo '{\"type\":\"task\",\"id\":NEW_ID,\"desc\":\"...\",\"status\":\"open\",\"added_by\":\"swarm-{N}\"}' >> {board_path}")

### Work Loop

{if stagger: "First: Bash(\"sleep {delay}\") to stagger start."}

Run up to {budget} rounds. Each round:

1. **READ BOARD** — Bash("cat {board_path}")
   - Parse entries to find: open tasks (no claim), completed tasks, peer results
   - If a peer's result revealed new information, factor it into your next task choice

2. **PICK TASK** — Choose an open task (no claim entry exists for it)
   - Prefer tasks that build on completed work (check results)
   - If no open tasks remain: STOP
   - If a task seems blocked by an incomplete task: skip it, pick another

3. **CLAIM** — Write claim entry to board BEFORE starting work
   - This tells other agents "I'm working on this, pick something else"

4. **VERIFY CLAIM** — Re-read board to check for duplicate claims
   - Bash("cat {board_path}") and check if another agent also claimed the same task ID
   - If duplicate: the agent with the higher number (e.g., swarm-3 > swarm-1) releases and picks another task
   - If no duplicate: proceed to execute

5. **EXECUTE** — Do the actual work
   - Use Read, Edit, Write, Bash, Grep, Glob as needed
   - Stay focused on the claimed task — don't scope-creep

6. **POST RESULT** — Write result entry to board
   - Include a 1-2 line output summary
   - If you discovered subtasks during execution, add them as new task entries
   - Use agent-scoped IDs: `swarm-{N}-{round}` (e.g., `swarm-1-3`) to avoid ID collisions

7. **CHECK GOAL** — Is the overall goal met?
   - Read board: are all tasks done? Is the goal achievable with current progress?
   - If goal is clearly met: STOP early
   - If more work needed: continue to next round

### Final Report

## Tasks Completed
| # | Task | Status | New Tasks Added |
|---|------|--------|----------------|

## Summary
- Tasks completed: N
- Tasks added: M
- Rounds used: R/{budget}
- Goal progress: assessment
```

### Goal Completion Detection

The leader checks goal completion after all agents finish:

1. Read the full board
2. Count: total tasks, completed tasks, failed tasks, still open
3. If goal has a measurable target (e.g., "80% coverage"):
   - Run verification command
   - Compare against target
4. If goal is qualitative:
   - Synthesize all results
   - Assess whether the goal is met

### Final Output

```
🐝 [swarm] Complete — {N} agents, {T} tasks ({C} done, {F} failed, {O} open)

## Goal
{goal}

## Goal Status: {MET | PARTIAL | NOT MET}
{verification evidence}

## Task Board Summary
| ID | Task | Status | Agent | New Tasks |
|----|------|--------|-------|-----------|
| 1 | {desc} | ✅ done | swarm-1 | +2 tasks |
| 2 | {desc} | ✅ done | swarm-2 | — |
| 3 | {desc} | ✅ done | swarm-3 | +1 task |
| 4 | {desc} (added by swarm-1) | ✅ done | swarm-2 | — |

## Discovery Chain
{How tasks spawned new tasks}
- Task 1 → swarm-1 discovered tasks 4, 5
- Task 3 → swarm-3 discovered task 6
- Total: {seed} seed tasks → {final} total tasks ({added} discovered during execution)

## Per-Agent Stats
| Agent | Tasks Done | Tasks Added | Rounds | Idle Rounds |
|-------|-----------|-------------|--------|-------------|
| swarm-1 | 3 | 2 | 8/10 | 0 |
| swarm-2 | 2 | 0 | 7/10 (early stop) | 1 |
| swarm-3 | 2 | 1 | 6/10 (early stop) | 0 |
```

The leader appends a `## Self-Score` block per the Self-Score Protocol defined in x-op SKILL.md (rubric: `plan-quality` — swarm generates/decomposes tasks, making plan-quality criteria more appropriate than general). Format: table with criterion, score (1-10), note per row, plus weighted overall.

### Comparison: x-agent swarm vs x-op distribute

| Dimension | x-op distribute | x-agent swarm |
|-----------|----------------|---------------|
| Task assignment | Leader splits and assigns upfront | Agents self-select from board |
| New task discovery | Not possible — fixed task list | Agents add tasks during execution |
| Load balancing | Static (leader decides) | Dynamic (fast agents pick more tasks) |
| Failure handling | Leader must reassign | Other agents see "failed" and can retry |
| Goal awareness | None — just merge results | Agents check goal each round, stop when met |
| Best for | Known, parallelizable subtasks | Emergent work where you discover tasks as you go |
