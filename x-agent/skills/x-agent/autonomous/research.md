# Autonomous: research

**Agents autonomously explore a topic — discovering, sharing findings via a shared board, and re-exploring based on what others found.**

Unlike x-op `investigate` (leader assigns angles, fixed phases), research agents decide their own direction, share findings indirectly through a shared board file (stigmergy pattern), and loop until they judge "enough is known" or budget runs out.

### Communication: Stigmergy (Indirect Coordination)

Sub-agents cannot use SendMessage (Claude Code architecture constraint — only parent has SendMessage). Instead, agents coordinate through a **shared board file**, like ants leaving pheromone trails:

```
agent-1 writes finding → board.jsonl ← agent-2 reads and adapts
```

Verified behavior (tested 2026-04-07):
- Agents read each other's findings from the board ✅
- Agents adapt their exploration direction based on peer findings ✅
- Natural work deduplication occurs without explicit coordination ✅
- Independent agents converge on the same conclusions from different angles ✅

### Parsing

From `$ARGUMENTS`:
- After `research` = topic
- `--agents N` = number of agents (default 3)
- `--model sonnet|opus|haiku` = model (default sonnet)
- `--budget N` = max rounds per agent (default 5)
- `--depth shallow|deep|exhaustive` = exploration depth (default deep)
- `--focus <hint>` = optional focus area hint
- `--web` = allow WebSearch/WebFetch (default: code-only — Read, Grep, Glob, Bash)

### Core Mechanism: Discovery Loop with Stigmergy

Each agent runs an independent discovery loop. Between rounds, agents read a shared board file to see what peers have discovered, and adapt their next question accordingly.

```
BOARD: .xm/research/{run-id}/board.jsonl

┌─ researcher-1 ───────────────────────────────┐
│                                               │
│  while budget > 0:                            │
│    1. READ BOARD — check peer findings        │
│       if peer finding changes my direction:   │
│         reframe next question                 │
│    2. FRAME   — pick next question to explore │
│    3. EXPLORE — gather evidence (Read/Grep/Web)│
│    4. EVALUATE — assess findings              │
│    5. POST    — write finding to board.jsonl  │
│    6. JUDGE   — "do I know enough?" or continue│
│    budget -= 1                                │
│                                               │
│  REPORT — individual findings + confidence    │
└───────────────────────────────────────────────┘
```

### Execution

**Step 0: Create shared board**

The leader creates the board file before launching agents:
```bash
RUN_ID="research-$(date +%Y%m%d-%H%M%S)"
mkdir -p .xm/research/$RUN_ID
touch .xm/research/$RUN_ID/board.jsonl
```

**Step 1: Launch agents in parallel**

The leader spawns N agents simultaneously:

```
Agent tool 1: {
  description: "researcher-1: {topic}",
  run_in_background: true,
  model: "{model}",
  prompt: "{RESEARCH_AGENT_PROMPT}"
}
Agent tool 2: {
  description: "researcher-2: {topic}",
  ...same structure...
}
... (N total)
```

**Step 2: Wait for all agents to complete**

Agents auto-notify on completion. The leader waits for all N agents.

**Step 3: Synthesize**

The leader reads all agent reports and the board file, then produces the final synthesis.

### Research Agent Prompt

Each agent receives this prompt (adapted for depth and focus):

```
## Autonomous Research: {TOPIC}
{focus hint if --focus provided}

You are researcher-{N}, one of {total} independent researchers.
Your peers are also writing findings to the shared board.

### Your Tools
- Read, Grep, Glob, Bash for code/file exploration
{if --web: "- WebSearch, WebFetch for external research"}

### Shared Board (Stigmergy)
BOARD FILE: {absolute_path_to_board.jsonl}

- To POST a finding: Bash("echo '{json}' >> {board_path}")
  Format: {"agent":"researcher-{N}","round":R,"finding":"...","source":"...","implication":"..."}
- To READ peer findings: Bash("cat {board_path}")

### Discovery Loop

Run up to {budget} rounds. Each round:

1. **READ BOARD** — Check what peers have discovered
   - Bash("cat {board_path}")
   - If a peer's finding opens a new angle: explore it
   - If a peer's finding overlaps your current line: pivot to avoid duplication
   - If a peer's finding contradicts yours: investigate the discrepancy

2. **FRAME** — What is the most valuable question to explore next?
   - Round 1: derive from the topic directly
   - Round 2+: informed by your findings AND board contents

3. **EXPLORE** — Gather evidence for your current question
   - {depth_instructions}
   - Cite every finding: file path, line number, URL, or inference

4. **POST** — Write your finding to the board
   - Bash("echo '{"agent":"researcher-{N}","round":{R},"finding":"...","source":"...","implication":"..."}' >> {board_path}")
   - Only post genuinely useful discoveries, not every observation

5. **JUDGE** — Should you continue?
   - STOP if: your questions are answered + confidence is high + board shows convergence
   - CONTINUE if: budget remains + open questions exist or board suggests new angles

### Depth: {depth}
{depth_instructions — see Depth Instructions below}

### Final Report

When done (STOP or budget exhausted), output:

## Findings
| # | Finding | Confidence | Source |
|---|---------|------------|--------|
(number each finding, HIGH/MEDIUM/LOW confidence, cite source)

## Key Insights
- (3-5 most important takeaways)

## Board Interactions
- (what you learned from the board, how it changed your direction)
- (which peer findings influenced your exploration)

## Open Questions
- (what you couldn't resolve within budget)

## Self-Assessment
- Rounds used: {N}/{budget}
- Thoroughness: {1-10}
- Confidence: CONFIDENT / UNCERTAIN
```

### Depth Instructions

| Depth | Max files per round | Web | Cross-validation | Agent prompt addition |
|-------|-------------------|-----|------------------|----------------------|
| shallow | 3 | No | No | "Quick scan only. Prioritize breadth over depth. 1-2 findings per round." |
| deep | 8 | If --web | Yes (check peer findings) | "Follow promising leads 2 levels deep. Verify key findings with a second source." |
| exhaustive | 15 | If --web | Required | "Leave no stone unturned. Cross-reference findings across files. Verify every claim." |

### Leader Synthesis

After all agents complete, the leader produces the final output by:

1. **Collect** all agent reports
2. **Cross-validate** — findings reported by 2+ agents = HIGH confidence
3. **Deduplicate** — merge overlapping findings, keep the most detailed version
4. **Resolve conflicts** — contradictory findings flagged as `[CONFLICT]`
5. **Aggregate open questions** — union of all agents' open questions, minus any answered by other agents

### Final Output

```
🔬 [research] Complete — {N} agents, {total_rounds} rounds, {M} findings

## Topic
{topic}

## Findings
| # | Finding | Confidence | Sources | Agents |
|---|---------|------------|---------|--------|
| 1 | {finding} | HIGH | src/auth.ts:42, docs | 1, 3 |
| 2 | {finding} | MEDIUM | researcher-2 report | 2 |

## Key Insights
1. {insight — synthesized across agents}
2. ...

## Discovery Graph
{How agents influenced each other via the board}
- researcher-1 posted X (round 1) → researcher-2 read board, pivoted to Y → confirmed Z
- researcher-3 independently found Z → HIGH confidence (convergent discovery)

## Open Questions
| # | Question | Importance | Suggested Next Step |
|---|----------|------------|-------------------|
| 1 | {question} | CRITICAL | → /x-agent research --focus "..." |
| 2 | {question} | NICE-TO-HAVE | → /x-op hypothesis "..." |

## Research Stats
| Agent | Rounds | Findings | Board Posts | Adapted from Board? |
|-------|--------|----------|-------------|-------------------|
| researcher-1 | 4/5 | 6 | 4 | YES (round 3) |
| researcher-2 | 5/5 | 4 | 3 | YES (round 2, 3) |
| researcher-3 | 3/5 | 5 (early stop) | 3 | NO |
```

The leader appends a `## Self-Score` block per the Self-Score Protocol defined in x-op SKILL.md (rubric: `general`). Format: table with criterion, score (1-10), note per row, plus weighted overall.

### Comparison: x-agent research vs x-op investigate

| Dimension | x-op investigate | x-agent research |
|-----------|-----------------|-----------------|
| Angle selection | Leader pre-assigns | Agent self-discovers |
| Phase count | Fixed 4 (scope→explore→synthesize→gap) | Agent-determined (budget-bounded) |
| Mid-execution confirmation | AskUserQuestion required at every phase | None — agents run autonomously |
| New question discovery | Only in Gap Analysis (Phase 4, post-hoc) | Real-time via board → reshapes ongoing exploration |
| Agent communication | None (leader relays everything) | Stigmergy — shared board file (indirect, async) |
| Direction change | Impossible mid-phase | Agents read board and pivot each round |
| Best for | Known unknowns (you know what angles to explore) | Unknown unknowns (you don't know what you'll find) |

### Why Stigmergy, Not SendMessage

Claude Code sub-agents (Agent tool) cannot use SendMessage — only the parent has it. Tested and confirmed 2026-04-07. Stigmergy (shared file read/write) is the verified alternative:

- **Pros**: Works with existing tools (Bash echo/cat), async by nature, no polling needed (agents read board at round start), naturally produces an audit trail
- **Cons**: Latency depends on round timing (agent may not see peer's finding until next round), no guaranteed delivery order
- **Result**: In testing, agents successfully read peer findings, adapted direction, avoided duplication, and converged independently — functionally equivalent to peer messaging for research tasks
