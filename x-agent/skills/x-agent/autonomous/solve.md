# Autonomous: solve

**Agents independently attack a problem from different angles — posting attempts to a shared board, learning from peers' successes and failures, and adapting their approach each round.**

Unlike x-op `hypothesis` (leader collects hypotheses → assigns falsification), solve agents self-direct their entire investigation. They read the board to learn what others tried, what worked, what failed, and can abandon dead ends or join a peer's promising approach.

### Parsing

From `$ARGUMENTS`:
- After `solve` = problem description
- `--agents N` = number of agents (default 3)
- `--model sonnet|opus|haiku` = model (default sonnet)
- `--budget N` = max rounds per agent (default 5)
- `--target <file|dir>` = target files/directories (optional)
- `--verify <command>` = verification command to check if solved (optional, e.g., `"bun test"`)

### Core Mechanism: Try-Share-Adapt Loop

Each agent tries a different approach, posts what they tried and learned, reads what peers tried, and adapts. The board accumulates a collective knowledge of "what works" and "what doesn't".

```
BOARD: .xm/solve/{run-id}/board.jsonl

Each line is one entry:
  {"type":"attempt","agent":"solver-1","round":1,"approach":"...","result":"success|failed|partial","detail":"..."}
  {"type":"insight","agent":"solver-2","round":2,"insight":"...","confidence":"HIGH|MEDIUM|LOW"}
  {"type":"abandon","agent":"solver-1","round":3,"approach":"...","reason":"..."}
  {"type":"adopt","agent":"solver-3","round":2,"from":"solver-1","approach":"...","adaptation":"..."}
  {"type":"solved","agent":"solver-2","round":4,"solution":"...","verification":"..."}
```

```
┌─ solver-1 ──────────────────────────────────────┐
│                                                  │
│  while budget > 0 AND not solved:                │
│    1. READ BOARD — what have peers tried?        │
│       - What approaches failed? (avoid these)    │
│       - What insights were shared? (build on)    │
│       - Has anyone solved it? (stop if yes)      │
│    2. FRAME  — choose my approach for this round │
│       - Round 1: independent approach            │
│       - Round 2+: informed by board              │
│    3. TRY    — attempt the solution              │
│    4. POST   — write attempt result to board     │
│       - Include: approach, result, what I learned│
│    5. VERIFY — if --verify, run verification cmd │
│       - If passes: post "solved" entry, STOP     │
│    budget -= 1                                   │
│                                                  │
│  REPORT — attempts, what worked, what didn't     │
└──────────────────────────────────────────────────┘
```

### Board Protocol

**Attempt** (tried something):
```json
{"type":"attempt","agent":"solver-N","round":R,"approach":"what I tried","result":"success|failed|partial","detail":"what happened","files_changed":["path1"]}
```

**Insight** (learned something useful):
```json
{"type":"insight","agent":"solver-N","round":R,"insight":"key learning","confidence":"HIGH|MEDIUM|LOW"}
```

**Abandon** (giving up on an approach):
```json
{"type":"abandon","agent":"solver-N","round":R,"approach":"what I abandoned","reason":"why"}
```

**Adopt** (picking up a peer's approach):
```json
{"type":"adopt","agent":"solver-N","round":R,"from":"solver-M","approach":"what I'm adopting","adaptation":"how I'm modifying it"}
```

**Solved** (problem resolved):
```json
{"type":"solved","agent":"solver-N","round":R,"solution":"description","verification":"command output or evidence"}
```

### Execution

**Step 0: Create board**

```bash
RUN_ID="solve-$(date +%Y%m%d-%H%M%S)"
mkdir -p .xm/solve/$RUN_ID
touch .xm/solve/$RUN_ID/board.jsonl
```

**Step 1: Launch agents in parallel**

Each agent gets a different starting angle (leader assigns initial angles to maximize coverage):

```
Agent 1: "Start by analyzing from the code structure angle"
Agent 2: "Start by analyzing from the data flow angle"
Agent 3: "Start by analyzing from the error/log angle"
```

With staggered start (3s intervals) to reduce conflicts on shared files.

**Step 2: Wait for all agents or early termination**

If any agent posts a `"type":"solved"` entry, the leader can notify remaining agents (or let them discover it on next board read).

**Step 3: Leader synthesize**

Read board, verify the solution, compile the attempt history.

### Solve Agent Prompt

```
## Autonomous Problem Solving: {PROBLEM}
{target files if --target provided}

You are solver-{N}, one of {total} independent problem solvers.
Starting angle: {assigned_angle}

{if N > 1: "First: Bash(\"sleep {(N-1)*3}\") to stagger start and reduce file conflicts."}

### Board
BOARD FILE: {board_path}

- READ: Bash("cat {board_path}")
- POST attempt: Bash("echo '{json}' >> {board_path}")
- POST insight: Bash("echo '{json}' >> {board_path}")
{if --verify: "- VERIFY: Bash(\"{verify_command}\")"}

### Problem-Solving Loop

Run up to {budget} rounds. Each round:

1. **READ BOARD** — Learn from peers
   - Failed attempts: DO NOT repeat these approaches
   - Insights: Build on these
   - "solved" entry: STOP immediately — someone found it

2. **FRAME** — Choose your approach
   - Round 1: Use your assigned starting angle
   - Round 2+: Adapt based on board contents
   - If your previous attempt failed: try a fundamentally different approach
   - If a peer posted a promising partial result: consider building on it (post "adopt" entry)

3. **TRY** — Attempt the solution
   - Read relevant files, analyze, make changes if needed
   - Keep changes minimal and reversible
   - If working on shared files, check board for conflicts first

4. **POST** — Share what happened
   - Always post an "attempt" entry with result and detail
   - If you learned something generalizable, also post an "insight"
   - If abandoning an approach, post "abandon" with reason

5. **VERIFY** — Check if solved
{if --verify: "   - Run: {verify_command}
   - If passes: post \"solved\" entry and STOP
   - If fails: post failure detail in attempt entry"}
{if no --verify: "   - Assess based on evidence whether the problem is resolved"}

### Rules
- NEVER repeat an approach that another agent already tried and failed
- If you see a peer's "solved" entry, STOP immediately
- Post to the board EVERY round — even failed attempts are valuable data
- Keep file changes minimal — don't refactor while solving

### Final Report

## Attempts
| Round | Approach | Result | Key Learning |
|-------|----------|--------|-------------|

## Solution (if found)
{description + evidence}

## Dead Ends
- {approaches that didn't work and why}

## Self-Assessment
- Rounds used: N/{budget}
- Solved: YES/NO
- Confidence: CONFIDENT / UNCERTAIN
```

### Early Termination

When any agent posts `"type":"solved"`:
- Other agents discover it on their next READ BOARD and STOP
- The leader verifies the solution independently
- If verification fails, the leader removes the "solved" entry and agents continue

### Final Output

```
🔧 [solve] Complete — {status} in {rounds} rounds by {agent}

## Problem
{problem}

## Solution
{solution description}
{verification output if --verify}

## Attempt History
| Round | Agent | Approach | Result |
|-------|-------|----------|--------|
| 1 | solver-1 | code structure analysis | partial — found symptom |
| 1 | solver-2 | data flow tracing | failed — wrong direction |
| 2 | solver-1 | adopted solver-3's insight | ✅ solved |

## Insights Collected
| # | Insight | Agent | Confidence |
|---|---------|-------|------------|
| 1 | {insight} | solver-3 | HIGH |

## Dead Ends
- {approach}: {why it failed} (solver-2, round 1)

## Per-Agent Stats
| Agent | Rounds | Attempts | Insights | Solved? |
|-------|--------|----------|----------|---------|
| solver-1 | 3/5 | 3 | 1 | ✅ |
| solver-2 | 3/5 | 2 | 0 | — |
| solver-3 | 2/5 | 2 | 1 | — |
```

The leader appends a `## Self-Score` block per the Self-Score Protocol defined in x-op SKILL.md (rubric: `general`). Format: table with criterion, score (1-10), note per row, plus weighted overall.

### Comparison: x-agent solve vs x-op hypothesis

| Dimension | x-op hypothesis | x-agent solve |
|-----------|----------------|---------------|
| Hypothesis generation | Fan-out, leader collects | Agents try independently |
| Falsification | Leader assigns to agents | Agents self-verify each round |
| Learning from failure | Not shared between agents | Board accumulates failed attempts — no repeats |
| Direction change | Not possible mid-phase | Agents adopt/abandon based on board |
| Early termination | Only if all falsified | Any agent posts "solved" → all stop |
| Code changes | Read-only analysis | Agents can make changes to solve |
| Best for | Understanding "why" | Actually fixing the problem |
