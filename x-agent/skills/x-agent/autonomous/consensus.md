# Autonomous: consensus

**Agents independently form positions, read peers' arguments on the board, and revise their stance each round until convergence or budget exhaustion.**

Unlike x-op `council` (leader mediates all communication, proposes consensus, calls vote), consensus agents reason independently — they read the board, decide whether to change their position, and post their updated stance with rationale. The leader only detects convergence.

### Parsing

From `$ARGUMENTS`:
- After `consensus` = topic/question to reach consensus on
- `--agents N` = number of agents (default 4)
- `--model sonnet|opus|haiku` = model (default sonnet)
- `--budget N` = max rounds per agent (default 4)
- `--perspectives "p1,p2,p3"` = assign starting perspectives (optional)

### Core Mechanism: Position-Revise Loop

Each round, agents read all positions on the board, reason about them, and post their (possibly revised) position. Convergence emerges naturally when positions stabilize.

```
BOARD: .xm/consensus/{run-id}/board.jsonl

Each line is one entry:
  {"type":"position","agent":"voice-1","round":1,"stance":"...","rationale":"...","confidence":8}
  {"type":"position","agent":"voice-2","round":1,"stance":"...","rationale":"...","confidence":6}
  {"type":"revision","agent":"voice-1","round":2,"prev_stance":"...","new_stance":"...","reason":"persuaded by voice-2's argument about...","confidence":7}
  {"type":"challenge","agent":"voice-3","round":2,"target":"voice-1","question":"What about the case where...?"}
  {"type":"concede","agent":"voice-2","round":3,"point":"...","to":"voice-3","reason":"..."}
```

```
┌─ voice-1 ──────────────────────────────────────┐
│                                                 │
│  while budget > 0:                              │
│    1. READ BOARD — all current positions        │
│    2. REASON     — evaluate each peer's argument│
│       - Which arguments are strongest?          │
│       - Do any contradict my position?          │
│       - Has anyone raised a point I missed?     │
│    3. DECIDE     — change position or hold?     │
│       - HOLD: post same stance + rebuttal       │
│       - REVISE: post new stance + reason        │
│       - CONCEDE: acknowledge a peer's point     │
│       - CHALLENGE: question a peer's argument   │
│    4. POST       — write to board               │
│    5. CHECK      — has the board converged?     │
│       if all positions aligned: STOP            │
│    budget -= 1                                  │
│                                                 │
│  FINAL POSITION — stance + confidence           │
└─────────────────────────────────────────────────┘
```

### Board Protocol

**Position** (initial or reaffirmed stance):
```json
{"type":"position","agent":"voice-N","round":R,"stance":"concise position","rationale":"why I believe this","confidence":1-10}
```

**Revision** (changed mind):
```json
{"type":"revision","agent":"voice-N","round":R,"prev_stance":"old","new_stance":"new","reason":"what changed my mind","confidence":1-10}
```

**Challenge** (question for a peer):
```json
{"type":"challenge","agent":"voice-N","round":R,"target":"voice-M","question":"specific question about their argument"}
```

**Concede** (acknowledge a peer's point):
```json
{"type":"concede","agent":"voice-N","round":R,"point":"what I concede","to":"voice-M","reason":"why they're right on this"}
```

### Execution

**Step 0: Create board**

```bash
RUN_ID="consensus-$(date +%Y%m%d-%H%M%S)"
mkdir -p .xm/consensus/$RUN_ID
touch .xm/consensus/$RUN_ID/board.jsonl
```

**Step 1: Launch agents with staggered start**

Round 1 is staggered so agents post initial positions sequentially (each agent sees more prior positions):

```
Agent 1: immediate — posts first position (no prior context)
Agent 2: sleep 8 — reads agent-1's position before forming own
Agent 3: sleep 16 — reads agent-1 and agent-2 before forming own
Agent 4: sleep 24 — reads all prior positions
```

This creates a richer initial board than simultaneous posting.

**Step 2: Wait for all agents to complete**

Agents stop when: budget exhausted, or they detect convergence (all recent positions aligned).

**Step 3: Leader convergence analysis**

The leader reads the final board and determines the outcome.

### Consensus Agent Prompt

```
## Autonomous Consensus: {TOPIC}
{perspective hint if --perspectives provided}

You are voice-{N}, one of {total} independent thinkers.
{if perspective: "Your assigned starting perspective: {perspective}"}

### Board
BOARD FILE: {board_path}

- READ: Bash("cat {board_path}")
- POST position: Bash("echo '{json}' >> {board_path}")
- POST revision/challenge/concede: Bash("echo '{json}' >> {board_path}")

### Deliberation Loop

{if stagger: "First: Bash(\"sleep {delay}\") to let earlier voices post."}

Run up to {budget} rounds. Each round:

1. **READ BOARD** — Read all positions and exchanges
   - Who holds what position? What's their rationale?
   - Any challenges directed at you? Any concessions?
   - What's the overall trend — converging or diverging?

2. **REASON** — Independently evaluate the arguments
   - Consider each peer's strongest argument
   - Look for: logical gaps in your own position, evidence you hadn't considered, assumptions you're making
   - Be genuinely open to changing your mind — but only for good reasons

3. **DECIDE** — What to post this round
   Choose ONE primary action:
   - **HOLD** — Reaffirm your position (post "position" with updated rationale addressing peer arguments)
   - **REVISE** — Change your position (post "revision" explaining what convinced you)
   - **CHALLENGE** — Question a specific peer's argument (post "challenge")
   - **CONCEDE** — Acknowledge a peer is right on a specific point (post "concede")
   You may combine: e.g., concede one point while holding your overall position.

4. **POST** — Write your action to the board
   - Always include your confidence level (1-10)
   - If revising: clearly state what changed your mind
   - If holding: address the strongest counter-argument

5. **CHECK CONVERGENCE** — Are all recent positions aligned?
   - If the last position from each agent agrees on the core question: STOP
   - If positions are narrowing but not yet aligned: CONTINUE
   - If deadlocked (same positions repeated 2+ rounds): STOP and report deadlock

### Rules
- Change your mind ONLY when presented with a genuinely stronger argument
- Do NOT change just to reach consensus faster — intellectual honesty matters
- Address challenges directed at you — ignoring them weakens your position
- Your confidence score should reflect your actual uncertainty, not strategy

### Final Report

## Final Position
{your final stance + confidence}

## Position Evolution
| Round | Stance | Confidence | Action |
|-------|--------|------------|--------|
| 1 | ... | 7 | initial position |
| 2 | ... | 6 | revised (persuaded by voice-2) |
| 3 | ... | 8 | held (addressed voice-3's challenge) |

## Key Moments
- (which arguments changed your thinking)
- (which challenges strengthened your position)

## Convergence Assessment
- CONVERGED / NARROWED / DEADLOCKED
```

### Leader Convergence Detection

After all agents complete, the leader reads the board and determines:

| Outcome | Criteria | Action |
|---------|----------|--------|
| **FULL CONSENSUS** | All agents' final positions agree on the core question | Report consensus statement |
| **STRONG CONSENSUS** | ≥75% of agents agree, minority conceded key points | Report majority view + minority reservation |
| **PARTIAL CONSENSUS** | Agents agree on sub-points but not the core question | Report areas of agreement + remaining contentions |
| **NO CONSENSUS** | Positions remained fixed or oscillated | Report the positions and why they diverged |

### Final Output

```
🤝 [consensus] {outcome} — {N} agents, {R} rounds

## Topic
{topic}

## Consensus Statement
{if FULL/STRONG: the agreed position}
{if PARTIAL: areas of agreement + contentions}
{if NO CONSENSUS: summary of positions}

## Position Map
| Agent | Round 1 | Final | Changed? | Confidence |
|-------|---------|-------|----------|------------|
| voice-1 | JWT | JWT | NO | 9 |
| voice-2 | Session | JWT | YES (R2) | 7 |
| voice-3 | API Key | Session | YES (R1) | 5 |
| voice-4 | JWT | JWT | NO | 8 |

## Deliberation Highlights
- Round 1: 3 positions (JWT, Session, API Key)
- Round 2: voice-2 revised to JWT after voice-1's stateless argument
- Round 3: voice-3 narrowed to Session, conceded API Key too limited

## Key Arguments That Moved Positions
| Argument | By | Convinced | Round |
|----------|-----|-----------|-------|
| "Stateless = horizontal scale" | voice-1 | voice-2 | 2 |
| "API Key insufficient for user auth" | voice-2 | voice-3 | 1 |

## Per-Agent Stats
| Agent | Rounds | Revisions | Challenges Made | Challenges Received | Final Confidence |
|-------|--------|-----------|-----------------|--------------------|-----------------| 
| voice-1 | 3/4 | 0 | 1 | 1 | 9 |
| voice-2 | 4/4 | 1 | 0 | 0 | 7 |
| voice-3 | 4/4 | 1 | 1 | 1 | 5 |
| voice-4 | 3/4 | 0 | 0 | 1 | 8 |
```

The leader appends a `## Self-Score` block per the Self-Score Protocol defined in x-op SKILL.md (rubric: `general`). Format: table with criterion, score (1-10), note per row, plus weighted overall.

### Comparison: x-agent consensus vs x-op council

| Dimension | x-op council | x-agent consensus |
|-----------|-------------|-------------------|
| Communication | Leader relays A's position to B (excluding A's own) | Agents read all positions directly on board |
| Position change | Leader detects and reports | Agents self-declare revisions with rationale |
| Consensus proposal | Leader drafts → agents vote AGREE/OBJECT | Emergent — agents converge naturally or don't |
| Weighted voting | Leader assigns weights to roles | None — all voices equal (arguments win, not authority) |
| Challenge/rebuttal | Not structured | Explicit challenge/concede entries on board |
| Round structure | Fixed (opening → cross-examine → deep dive → converge) | Flexible — agents decide what to post each round |
| Best for | Structured deliberation with role-based authority | Organic debate where the best argument wins |
