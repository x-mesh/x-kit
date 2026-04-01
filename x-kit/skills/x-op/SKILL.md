---
name: x-op
description: Strategy orchestration — 18 strategies including refine, tournament, chain, review, debate, red-team, brainstorm, distribute, council, socratic, persona, scaffold, compose, decompose, hypothesis, investigate, monitor, escalate
allowed-tools:
  - AskUserQuestion
---

# x-op — Strategy Orchestration (Claude Code Native)

Direct structured strategies to an agent team.
The leader Claude (you) serves as both orchestrator and synthesizer, controlling agents via the **Claude Code native Agent tool**.
No external dependencies (no term-mesh or tmux required).

## Arguments

User provided: $ARGUMENTS

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

**Developer mode**: Use technical terms (strategy, verdict, premise, assumption, consensus). Concise.

**Normal mode**: 쉬운 한국어로 안내합니다.
- "strategy" → "전략", "verdict" → "판정", "premise" → "가정", "assumption" → "근거 없는 추측"
- "consensus" → "합의", "refinement" → "다듬기", "tournament" → "대결", "debate" → "토론"
- "~하세요" 체 사용, 핵심 정보 먼저

## Routing

Determine strategy from the first word of `$ARGUMENTS`:
- `list` → [Subcommand: list]
- `refine` → [Strategy: refine]
- `tournament` → [Strategy: tournament]
- `chain` → [Strategy: chain]
- `review` → [Strategy: review]
- `debate` → [Strategy: debate]
- `red-team` → [Strategy: red-team]
- `brainstorm` → [Strategy: brainstorm]
- `distribute` → [Strategy: distribute]
- `council` → [Strategy: council]
- `socratic` → [Strategy: socratic]
- `persona` → [Strategy: persona]
- `scaffold` → [Strategy: scaffold]
- `compose` → [Strategy: compose]
- `decompose` → [Strategy: decompose]
- `hypothesis` → [Strategy: hypothesis]
- `investigate` → [Strategy: investigate]
- `monitor` → [Strategy: monitor]
- `escalate` → [Strategy: escalate]
- Empty input → Ask user to select a strategy

## Options

- `--rounds N` — Number of rounds (default 4)
- `--preset quick|thorough|deep` — quick: rounds=2, thorough: rounds=4, deep: rounds=6
- `--preset analysis-deep` — compose preset: `investigate | hypothesis | refine`
- `--preset security-audit` — compose preset: `review | red-team`
- `--preset consensus` — compose preset: `persona | council`
- `--agents N` — Number of participating agents (default: shared config's agent_max_count (default 4). Overrides when specified)
- `--model sonnet|opus|haiku` — Agent model (default sonnet)
- `--steps "role:task,role:task"` — Manually specify chain steps
- `--target <file|dir>` — review/red-team target
- `--vote` — Enable dot voting for brainstorm
- `--context` — Inject conversation context to agents
- `--no-context` — Disable context injection
- `--personas "role1,role2,..."` — Manually specify roles for persona strategy
- `--bracket single|double` — Tournament bracket type (default single)
- `--weights "role:N,role:N"` — Council weighted voting (default equal)
- `--dry-run` — Output execution plan only (no agent execution)
- `--resume` — Resume from previous checkpoint
- `--explain` — Output decision trace
- `--pipe <strategy>` — Strategy pipelining (compose)
- `--start haiku|sonnet` — Escalate starting level (default haiku)
- `--threshold N` — Escalate self-assessment threshold (default 7)
- `--max-level haiku|sonnet|opus` — Escalate maximum level (default opus)
- `--angles "a,b,c"` — Manually specify investigation angles
- `--depth shallow|deep|exhaustive` — Investigation depth (default shallow)
- `--verify` — Auto quality verification after strategy completion (judge panel scoring + re-run if below threshold)
- `--threshold N` — Verify passing score threshold (default 7, 1-10)
- `--max-retries N` — Maximum retry count on verify failure (default 2)

## Shared Config Integration

x-op references shared config from `.xm/config.json`:

| Setting | Key | Default | Effect |
|---------|-----|---------|--------|
| Agent count | `agent_max_count` | `4` | Determines fan-out/broadcast agent count when `--agents` is not specified |
| Mode | `mode` | `developer` | Output style (technical terms vs plain language) |

Change settings: `x-kit config set agent_max_count 10`

When the skill layer creates agents, if no `--agents` flag is present, it reads agent_max_count from shared config to determine the number of agents.

## Agent Primitives

This skill uses only Claude Code built-in tools:

### fan-out (same question to all)
Invoke N Agent tools **simultaneously** in a single message:
```
Agent tool call 1: { description: "agent-1", prompt: "...", run_in_background: true, model: "sonnet" }
Agent tool call 2: { description: "agent-2", prompt: "...", run_in_background: true, model: "sonnet" }
Agent tool call 3: { description: "agent-3", prompt: "...", run_in_background: true, model: "sonnet" }
```
All agents receive the same prompt but respond independently.

Agent count is determined by the `--agents N` flag or shared config's `agent_max_count`.

### specialist (agent-catalog injection)
Before creating agent prompts, select specialists from the catalog:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/agent-catalog.mjs match "{TOPIC}" --count {N}
```
This returns ranked specialist agents. For each, load the slim prompt:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/agent-catalog.mjs get {agent-name} --slim
```
Inject the slim content as a system-level preamble in the agent's prompt:
```
Agent tool: {
  description: "{agent-name}-specialist",
  prompt: "{slim agent rules}\n\n## Task: {TASK}\n{task-specific instructions}",
  run_in_background: true, model: "sonnet"
}
```
When `--personas` is specified, use those names directly instead of auto-matching.
When slim files are not available, use the full rules from `rules/` directory.

### delegate (assign to a specific agent)
Invoke 1 Agent tool:
```
Agent tool: { description: "role name", prompt: "...", run_in_background: false }
```
Receive the result immediately and use it in the next step.

### broadcast (different context to each)
Same as fan-out, but sends a **different** prompt to each agent (e.g., including other agents' results).

### Result collection
- Agents with `run_in_background: true` auto-notify on completion
- When notified, read results and use them in the next round

## Subcommand: list

```
x-op — Strategy Orchestration

Strategies:
  refine <topic>          Diverge → converge → verify rounds
  tournament <topic>      Compete → anonymous vote → winner
  chain <topic>           A→B→C sequential pipeline (conditional branching)
  review --target <file>  Multi-perspective code review
  debate <topic>          Pro vs Con → verdict
  red-team --target <f>   Attack → defend → re-attack
  brainstorm <topic>      Free ideation → cluster → vote
  distribute <topic>      Split → parallel execute → merge
  council <topic>         N-party deliberation → weighted consensus
  socratic <topic>        Question-driven deep inquiry
  persona <topic>         Multi-persona perspective analysis
  scaffold <topic>        Design → dispatch → integrate (top-down)
  compose "A | B | C"     Strategy piping / chaining
  decompose <topic>       Recursive decompose → leaf parallel → bottom-up
  hypothesis <topic>      Generate → falsify → adopt surviving hypotheses
  investigate <topic>     Multi-angle investigation → synthesize → gap analysis
  monitor --target <f>    Observe → analyze → auto-dispatch (1-shot watchdog)
  escalate <topic>        haiku→sonnet→opus auto-escalation (cost-optimized)

Options:
  --rounds N              Round count (default 4)
  --preset quick|thorough|deep
  --agents N              Number of agents (default: agent_max_count)
  --model sonnet|opus     Agent model
  --vote                  Enable dot voting (brainstorm)
  --target <file>         Review/red-team target
  --personas "a,b,c"      Persona roles (persona strategy)
  --bracket single|double Tournament bracket type
  --weights "role:N"      Council weighted voting
  --dry-run               Show execution plan only
  --resume                Resume from checkpoint
  --explain               Include decision trace
  --pipe <strategy>       Chain strategies (compose)
  --angles "a,b,c"       Investigation angles (investigate)
  --depth shallow|deep|exhaustive  Investigation depth (investigate)

Examples:
  /x-op refine "Payment API design" --rounds 4
  /x-op tournament "Login implementation" --agents 4 --bracket double
  /x-op debate "Monolith vs microservices"
  /x-op review --target src/auth.ts
  /x-op brainstorm "v2 feature ideas" --vote
  /x-op socratic "Why microservices?" --rounds 4
  /x-op persona "Auth redesign" --personas "engineer,security,pm"
  /x-op scaffold "Plugin system" --agents 4
  /x-op investigate "Auth system" --target src/auth/ --depth deep
  /x-op investigate "Redis vs Memcached" --angles "performance,ecosystem,ops,cost"
  /x-op compose "brainstorm | tournament | refine" --topic "v2 plan"
  /x-op refine "API design" --dry-run
  /x-op tournament "Login" --explain
  /x-op decompose "Implement payment system" --agents 6
  /x-op hypothesis "Why is latency spiking?" --rounds 3
  /x-op escalate "Summarize this codebase" --start haiku
```

---

## Strategy: refine

Diverge → converge → verify round-based refinement.

### Round 1: DIVERGE

> 🔄 [refine] Round 1/{max}: Diverge

**broadcast with specialist agents** — each agent gets a **different domain-expert prompt** to maximize diversity:

**Step 1: Select specialists** from the agent-catalog:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/agent-catalog.mjs match "{TASK}" --count {N-1}
```
Reserve 1 slot for a `contrarian` agent (no specialist — instructed to oppose the obvious approach).

**Step 2: Load slim prompts** for each selected specialist:
```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/agent-catalog.mjs get {agent-name} --slim
```

**Step 3: broadcast** with specialist-injected prompts:
```
Agent 1: "{security-agent slim}\n\n## Task: {TASK}\nPropose a solution from your specialist perspective. 400 words max. Evidence-based and falsifiable."
Agent 2: "{api-designer-agent slim}\n\n## Task: {TASK}\nPropose a solution from your specialist perspective. ..."
Agent 3: "{tech-lead-agent slim}\n\n## Task: {TASK}\nPropose a solution from your specialist perspective. ..."
Agent 4: "{compliance-agent slim}\n\n## Task: {TASK}\nPropose a solution from your specialist perspective. ..."
Agent 5: "## Task: {TASK} — Role: contrarian\nPropose a solution that takes the OPPOSITE approach to the obvious one. ..."
```

Rules:
- `--personas "security,devops,sre"` overrides auto-selection with manual agent names
- Always include at least 1 `contrarian` agent (forces genuine diversity)
- If slim files are unavailable, fall back to dimension-assigned prompts (feasibility, scalability, dx, cost, risk)
- Each specialist proposes from their domain but must still address other dimensions
- `run_in_background: true` (parallel)
- Wait for all agents to complete

### Round 1.5: DIVERSITY CHECK

> 🔄 [refine] Diversity check

Leader evaluates Diverge results:
- Count distinct approaches (not just wording differences — structurally different solutions)
- **Diverse (3+ distinct approaches)** → Proceed to Converge
- **Homogeneous (<3 distinct)** → Log warning, skip vote in Converge (leader synthesizes directly), allocate saved round to extra Verify

### Round 2: CONVERGE

> 🔄 [refine] Round 2/{max}: Converge

You (Claude, the leader) directly synthesize all results:
- Identify commonalities/differences, extract strengths from each, draft a unified proposal

**If diverse (3+ approaches):** Share the unified proposal with agents and request a vote (broadcast):
```
"## Synthesis of All Results
{synthesized results}

Select the best approach by number and explain your reasoning in 2-3 lines."
```
The leader tallies the votes → determines the adopted proposal.

**If homogeneous (<3 approaches):** Leader adopts the unified proposal directly (vote is skipped — unanimous agreement already demonstrated). Proceed to Verify with the saved round budget.

### Round 3+: VERIFY

> 🔄 [refine] Round {n}/{max}: Verify

**broadcast** — each agent verifies from a **different angle** (same proposal, different lens):

The leader assigns verification angles based on the topic. Example for N=6:
```
Agent 1: "## Verify: feasibility — Can this actually be built with current resources?"
Agent 2: "## Verify: edge cases — What inputs/scenarios break this?"
Agent 3: "## Verify: naming & clarity — Is every term defined? Any ambiguity?"
Agent 4: "## Verify: completeness — What's missing? Any gaps in the flow?"
Agent 5: "## Verify: integration — How does this connect to existing systems?"
Agent 6: "## Verify: adversarial — Try to break this proposal. Find the weakest point."
```

Each agent receives the adopted proposal + their specific verification angle.

- **All OK** → Early termination
- **Issues raised** → Leader deduplicates, incorporates feedback, proceeds to next round
- **max_rounds reached** → Best-effort output

### Final Output

```
🔄 [refine] Complete — {actual}/{max} rounds

## Adopted Solution
{final solution}

## Round Summary
| Round | Phase | Participants | Result |
|-------|-------|-------------|--------|
| 1 | Diverge | {N} agents | {N} independent solutions |
| 2 | Converge | {N} agents | Adopted (votes {M}/{N}) |
| 3 | Verify | {N} agents | {OK count}/{N} OK |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: tournament

All compete simultaneously → anonymous vote → adopt winner.

### Phase 1: COMPETE
> 🏆 [tournament] Phase 1: Compete

fan-out:
```
"Submit your best result. This is a competition — the best result will be adopted. Structure by dimension (see Dimension Anchors). Judges score per-dimension. 400 words max."
```

### Phase 2: ANONYMIZE
The leader anonymizes collected results:
- Remove agent names, shuffle order
- Label as "Solution A", "Solution B", "Solution C"

### Phase 3: VOTE
fan-out:
```
"Rank the solutions below from 1st to last.
{anonymized solution list}
Format: 1st: [A|B|C], 2nd: [...], ... Reason: [one line]"
```

### Phase 4: TALLY
Borda count (1st=N points, 2nd=N-1 points...). Leader breaks ties.

### Final Output
```
🏆 [tournament] Winner: Solution {X} ({agent})
| Rank | Solution | Score |
| 1st | {X} | {S} |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: chain

A→B→C sequential pipeline.

`--steps "explorer:analysis,architect:design,executor:implementation"` or auto-configured by the leader.

### Execution
For each step, invoke **1** Agent tool (delegate, foreground):
```
"## Chain Step {n}/{total}: {task}
Task: {original}
Previous step result: {previous result or 'none'}
Based on the above context, perform '{task}'. Tag output with scope-clarity and interface-completeness dimensions. Flag any ambiguity from the previous step. 400 words max."
```
Pass the result as input to the next step.

### Final Output
```
⛓️ [chain] Complete — {total} steps
| Step | Role | Task | Status |
| 1 | explorer | analysis | ✅ |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: review

All agents review code from multiple perspectives.

### Phase 1: TARGET
- `--target <file>` → Read the file with Read tool
- If absent → `git diff HEAD` (Bash tool)

### Phase 2: ASSIGN
Dynamically assign perspectives based on agent count (`--agents N` or `agent_max_count`):

| Agents | Perspectives |
|--------|-------------|
| 3 (default) | Security, Logic, Performance |
| 4 | + Error handling/Resilience |
| 5 | + Testability/Coverage |
| 6 | + Consistency/Code conventions |
| 7+ | + DX/Readability, Dependencies/Compatibility, etc. — leader assigns additional |

### Phase 3: REVIEW
fan-out (each agent gets a different perspective prompt):
```
"## Code Review: {perspective}
{code}
Report issues in [Critical|High|Medium|Low] file:line — description format. Each finding must be evidence-based and falsifiable per the Agent Output Quality Contract. Tag each with a dimension from Code Analysis Anchors.
End with self-assessment: review thoroughness 1-10, CONFIDENT or UNCERTAIN."
```

### Phase 4: SYNTHESIZE
Leader synthesizes: deduplicate, sort by severity, highlight issues found by multiple agents.

### Final Output
```
🔍 [review] Complete — {N} agents, {M} issues
| # | Severity | Location | Issue | Found by |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: debate

Pro vs Con debate followed by verdict.

### Phase 1: POSITION
`--agents N` (minimum 3) → Auto-distribute into PRO team, CON team, and JUDGE.

### Phase 2: OPENING
PRO/CON simultaneous fan-out:
PRO/CON simultaneous fan-out:
- PRO: "Present 3 arguments in favor. Each must be evidence-based and falsifiable per the Agent Output Quality Contract. Tag each with a dimension. 300 words max."
- CON: "Present 3 arguments against. Each must be evidence-based and falsifiable per the Agent Output Quality Contract. Tag each with a dimension. 300 words max."

### Phase 3: REBUTTAL
Send CON's opening to PRO, PRO's opening to CON (fan-out):
"Rebut the opposing arguments. 200 words."

### Phase 4: VERDICT
Send the full record to JUDGE (delegate):
"Evaluate both sides per the Judge/Evaluator Rubric (Agent Output Quality Contract). Score each argument on strength (1-10) and cite its dimension. Verdict must reference dimension scores. PRO or CON? Final recommendation in 200 words."

### Final Output
```
⚖️ [debate] Verdict: {PRO|CON}
| Team | Key Argument |
| PRO | {strongest} |
| CON | {strongest} |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: red-team

Attack/defend. Find vulnerabilities → fix.

### Phase 1: TARGET
Collect targets via `--target` or `git diff HEAD`.

### Phase 2: ATTACK
Attack team fan-out:
"From an adversarial perspective, find as many vulnerabilities/defects as possible. Each attack must target a distinct dimension from the Code Analysis Anchors. Tag: [dimension] [Critical|High|Medium] location — attack vector — proof scenario."

### Phase 3: DEFEND
Defense team fan-out (with attack results):
"For each attack, provide a fix or counter-evidence."

### Phase 4: REPORT
Leader synthesizes: Fixed(🟢), Partial(🟡), Open(🔴).

### Final Output
```
🔴 [red-team] Complete — {total} vulnerabilities
| # | Severity | Attack | Status |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: brainstorm

Free ideation → cluster → vote.

### Phase 1: GENERATE
fan-out:
"Generate as many ideas as possible on this topic. No criticism allowed. Each idea: [dimension] title + 1-2 lines. Tag each with a dimension from the Ideation Anchors (novelty/feasibility/impact/effort/risk). Minimum 5."

### Phase 2: CLUSTER
Leader deduplicates, groups by theme, assigns numbers.

### Phase 3: VOTE (when --vote is set)
fan-out:
"Select the 3 most valuable. Format: 1. [number], 2. [number], 3. [number]"

### Final Output
```
💡 [brainstorm] {N} ideas, {T} themes
## Top 5 (when --vote is set)
| Rank | Idea | Votes |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: distribute

Split a large task into independent subtasks → parallel execution → merge.

### Phase 1: SPLIT
`--splits "role:task,role:task"` or auto-split by the leader.

### Phase 2: DISPATCH
fan-out with unique subtasks per agent:
"Overall task: {original}. Your assignment: {subtask}. Confirm scope-clarity and interface-completeness per Dimension Anchors before starting. Do not modify anything outside your scope."

### Phase 3: MERGE
Leader merges all results: check for conflicts, synthesize by theme.

### Final Output
```
📦 [distribute] {N} subtasks, {completed} succeeded
| # | Agent | Subtask | Status |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: council

N-party free discussion → cross-examination → deep dive → consensus.

### Round 1: OPENING
fan-out: "State your position and rationale on this topic. Structure by dimension (see Dimension Anchors). Leader assigns dimension focus to each participant. 300 words."

Leader builds a position map: group similar stances, identify divergence points.

### Round 2: CROSS-EXAMINE
Send other participants' positions to each agent, **excluding their own** (broadcast — different prompt per agent):
"Read the other participants' positions: agree with 1 + raise 1-2 questions + state whether your position changed."

Early termination check: if all agree → skip to Final.

### Round 3~N-1: DEEP DIVE
fan-out (focus on key points of contention):
"Contention 1: {description}. Provide additional evidence, propose compromises, and state any position changes."

### Final: CONVERGE
Leader drafts a consensus proposal → fan-out:
"AGREE or OBJECT to the consensus proposal. Summarize your final position in one line."

Result: FULL CONSENSUS / CONSENSUS WITH RESERVATIONS / NO CONSENSUS.

### Final Output
```
🏛️ [council] {status}
## Consensus Statement
{consensus statement}

## Stance Evolution
| Agent | Round 1 | Final | Changed? |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: socratic

Socratic questioning — deconstruct premises and explore deeply through questions alone.

### Phase 1: SEED
> 🧠 [socratic] Phase 1: Seed

delegate (foreground):
```
"## Socratic Seed: {TOPIC}
Present your initial position and core arguments on this topic. 300 words max."
```

### Phase 2: QUESTION ROUNDS
> 🧠 [socratic] Round {n}/{max}: Question

fan-out — each agent acts as questioner:
```
"## Current Position
{previous round result}

Read the above arguments and find logical gaps, implicit premises, and counterexamples. Ask 2-3 sharp questions targeting specific dimensions from the Dimension Anchors. Avoid repeating dimensions already explored.
Do not provide answers — only ask questions."
```

Leader synthesizes the questions → sends to the responding agent (delegate):
```
"Answer the following questions and revise your position:
{synthesized question list}
Present your revised position in 300 words max."
```

- **Questions become trivial** → Early termination
- **max_rounds reached** → Best-effort output

### Final Output
```
🧠 [socratic] Complete — {actual}/{max} rounds

## Final Refined Position
{final position}

## Question Trace
| Round | Key Question | Position Change |
|-------|-------------|----------------|
| 1 | {question summary} | {change summary} |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: persona

Role-based multi-perspective analysis — each agent is assigned a fixed persona.

### Phase 1: ASSIGN
> 🎭 [persona] Phase 1: Assign

`--personas "role1,role2,..."` or auto-assigned by the leader:
- Default personas: senior engineer, security expert, PM, junior developer
- Persona count adjusted to match `--agents N`

### Phase 2: ANALYZE
> 🎭 [persona] Phase 2: Analyze

broadcast — each agent gets a different persona prompt:
```
"## Persona: {role name}
You are a {role description}.
Task: {TOPIC}
Analyze this task from the perspective of a {role name}:
- Core concerns (what matters most)
- Risks/concerns
- Recommendations
Map your persona's concerns to dimensions from the Dimension Anchors. Each persona naturally emphasizes different dimensions — make this explicit.
300 words max."
```

### Phase 3: SYNTHESIZE
Leader synthesizes all analyses:
- Key summary per perspective
- Common concerns vs conflict points
- Unified recommendation

### Phase 4: CROSS-CHECK (optional, when --rounds > 2)
fan-out — each agent re-verifies the unified proposal from their persona's perspective:
```
"## Unified Proposal Verification: {role name}
{unified proposal}
From the perspective of a {role name}, is anything missing or needs revision? If not, respond 'OK'."
```

### Final Output
```
🎭 [persona] Complete — {N} personas

## Unified Recommendation
{final recommendation}

## Per-Perspective Summary
| Persona | Core Concern | Recommendation | Conflict |
|---------|-------------|----------------|----------|
| Senior Engineer | {summary} | {recommendation} | {conflict} |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: scaffold

Structure design → module distribution → parallel implementation → integration.

### Phase 1: DESIGN
> 🏗️ [scaffold] Phase 1: Design

delegate (foreground, opus recommended):
```
"## Scaffold Design: {TOPIC}
Design the overall structure:
- List of modules/components and their responsibilities
- Interfaces between modules (inputs/outputs)
- Dependency order
Each module must be independently implementable. Verify scope-clarity, dependency-minimality, and interface-completeness per Dimension Anchors. 400 words max."
```

### Phase 2: DISPATCH
> 🏗️ [scaffold] Phase 2: Dispatch

fan-out matching the number of modules from the design:
```
"## Scaffold Module: {module name}
Overall structure:
{Phase 1 design result}

Your assigned module: {module name}
Responsibility: {module description}
Interface: {input/output spec}

Implement this module. Do not assume other modules' internal implementation — use interfaces only."
```

### Phase 3: INTEGRATE
> 🏗️ [scaffold] Phase 3: Integrate

delegate (foreground):
```
"## Scaffold Integration
Overall design:
{Phase 1 result}

Per-module implementation results:
{Phase 2 each agent result}

Integrate the modules:
- Verify interface compatibility
- Resolve omissions/conflicts
- Output the final integrated result"
```

### Final Output
```
🏗️ [scaffold] Complete — {N} modules

## Structure
{module diagram}

## Module Status
| Module | Agent | Status |
|--------|-------|--------|
| {module name} | agent-{n} | ✅ |

## Integration Result
{final result}
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Enhanced: chain (conditional branching)

Adds conditional branching support to the existing chain.

### Branch syntax
`--steps` extension: compose a DAG using `if:condition->step,else:step` format.

```
--steps "analyst:analysis,if:confidence<0.7->researcher:deep-research,architect:design,executor:implementation"
```

### Execution flow
After each step completes, the leader evaluates the `if` condition:
- Condition met → Execute branch step
- Condition not met → Proceed to next step
- After branch step completes, return to the original flow

Without `--steps`, the leader auto-decides: if the previous step's confidence/quality is low, a supplementary step is auto-inserted.

---

## Enhanced: tournament (seed ranking)

Adds seed ranking to the existing tournament.

### Phase 0: SEED (new)
> 🏆 [tournament] Phase 0: Seed

Before COMPETE, a lightweight evaluation (leader directly or haiku agent):
- Quick-score each candidate solution 1-10
- Compose bracket based on scores (strong competitors meet later)

### Bracket options
- `--bracket single` — Single elimination (default)
- `--bracket double` — Double elimination (includes losers' bracket)
- With 8 agents: quarterfinals → semifinals → finals

Remaining phases (COMPETE, ANONYMIZE, VOTE, TALLY) proceed identically but within the bracket structure, round by round.

---

## Enhanced: council (weighted voting)

Adds role-based weighted voting to the existing council.

### Weight options
`--weights "architect:3,security:2,developer:1"` or auto-assigned by the leader based on topic.

### Application
- OPENING: Specify role + weight for each agent
- CONVERGE: Apply weights to votes
  - Sum of `AGREE` weights > sum of `OBJECT` weights → CONSENSUS
  - Weighted majority not reached → CONSENSUS WITH RESERVATIONS
- Include weight rationale in final output

### Final Output change
```
🏛️ [council] {status} (weighted)
| Agent | Role | Weight | Vote |
|-------|------|--------|------|
| agent-1 | architect | 3 | AGREE |
| agent-2 | security | 2 | OBJECT |
Weighted: AGREE 4 / OBJECT 2 → CONSENSUS
```

---

## Options: --dry-run

Output execution plan only without running any agents.

### Usage
```
/x-op refine "topic" --dry-run
```

### Output
```
📋 [dry-run] refine "topic"

Execution Plan:
  Rounds: 4 (preset: thorough)
  Agents: 10 (agent_max_count: 10)
  Model: sonnet

  Round 1 (Diverge):  8 agents × fan-out
  Round 2 (Converge): 8 agents × fan-out + leader synthesis
  Round 3 (Verify):   8 agents × fan-out
  Round 4 (Verify):   8 agents × fan-out (if needed)

  Estimated tokens: ~120K input, ~48K output
  Estimated cost: ~$3.24
```

Returns immediately without invoking any agents. The leader constructs the plan based on the strategy documentation.

---

## Options: --resume

Resume an interrupted strategy execution from a checkpoint.

### Checkpoint schema

After each round/phase completes, the leader auto-saves to `.xm/op-checkpoints/{run-id}.json`:

```json
{
  "version": 1,
  "run_id": "refine-2026-03-27T12-30-00-000Z",
  "strategy": "refine",
  "topic": "Payment API design",
  "status": "in_progress",
  "created_at": "2026-03-27T12:30:00.000Z",
  "updated_at": "2026-03-27T12:35:42.000Z",
  "options": {
    "rounds": 4,
    "agents": 4,
    "model": "sonnet",
    "preset": "thorough"
  },
  "progress": {
    "total_rounds": 4,
    "completed_rounds": 2,
    "current_phase": "converge",
    "early_exit": false
  },
  "results": [
    {
      "round": 1,
      "phase": "diverge",
      "completed_at": "2026-03-27T12:32:10.000Z",
      "agent_outputs": [
        { "agent_id": "agent-1", "role": "engineer", "output_summary": "REST-based approach" },
        { "agent_id": "agent-2", "role": "architect", "output_summary": "GraphQL approach" }
      ],
      "summary": "3 approaches identified: REST, GraphQL, gRPC"
    }
  ],
  "verification": {
    "enabled": false,
    "rubric": "general",
    "threshold": 7,
    "attempts": [
      {
        "attempt": 1,
        "score": 6.2,
        "criteria_scores": { "accuracy": 7, "completeness": 5, "consistency": 6, "clarity": 7, "hallucination-risk": 8 },
        "feedback": "completeness scored lowest — missing edge cases",
        "timestamp": "2026-03-27T12:34:00.000Z"
      }
    ],
    "final_score": 7.8,
    "passed": true
  }
}
```

`run-id` generation: `{strategy}-{ISO timestamp}` (created on first run, reused thereafter).

### Save workflow

After each round/phase completes, the leader:
1. `mkdirSync('.xm/op-checkpoints/', { recursive: true })` (Bash)
2. Append current round result to the `results` array
3. Increment `progress.completed_rounds`, update `updated_at`
4. Save JSON file (atomic write)
5. When `--verify` is enabled: save verification results to the checkpoint
   - Record each attempt's score, criteria_scores, and feedback
   - Record the final selected version's score in final_score

### Resume workflow

```
/x-op --resume
```

1. Select the most recent `status: "in_progress"` file from `.xm/op-checkpoints/` by `updated_at`
2. Read `progress.completed_rounds` → `resume_from = completed_rounds + 1`
3. Inject `results[].summary` as context before the next round's prompt:
   ```
   "## Previous Execution Context (Round 1~{N} results)
   {results summary}"
   ```
4. Restore `options` and resume execution from that round
5. On completion: write `status: "completed"` → excluded from resume targets

### When no checkpoint exists
If `--resume` is used with no checkpoint: output `"⚠ No checkpoint found. Run a strategy first."`.

---

## Options: --explain

Output the decision-making process transparently alongside the final result.

### Usage
```
/x-op tournament "topic" --explain
```

### Additional output
Adds a `## Decision Trace` section to each strategy's final output:
```
## Decision Trace
| Step | Input | Decision | Rationale |
|------|-------|----------|-----------|
| Diverge | 8 proposals | 3 clusters identified | Grouped similar approaches |
| Converge | 3 clusters | Cluster B adopted (5/8 votes) | Feasibility + scalability |
| Verify | Cluster B | 2 issues found, 1 fixed | Security issue corrected |
```

The leader records why each decision was made at each step and includes it in the final output.

---

## Options: --verify

Auto quality verification after strategy completion. A judge panel scores the result and re-runs with feedback if below threshold.

### Verification flow

```
Strategy complete → Self-Score (self-assessment)
  │
  ├─ --verify not specified → Output Self-Score only, end
  │
  └─ --verify specified →
      1. Summon Judge Panel (3 agents, fan-out)
      2. Each judge scores against rubric criteria
      3. Calculate weighted average + σ (agreement level)
      │
      ├─ score >= threshold → ✅ PASS, final output
      │
      └─ score < threshold →
          ├─ retries < max-retries →
          │   a. Extract feedback for the lowest-scoring criterion
          │   b. Inject feedback as context
          │   c. Re-run strategy (same options + feedback)
          │   d. Increment retry counter
          │
          └─ retries >= max-retries →
              ⚠ Select highest-scoring version, output with warning
```

### Judge Prompt Template

Prompt sent to each judge agent (follows x-eval scoring format):

```
"## Quality Evaluation
Rubric: {rubric_name}
Output to evaluate:
{strategy final output (excluding Self-Score)}

Score on a 1-10 scale per the criteria below (1=fail, 5=baseline, 7=good, 10=excellent):

{rubric criteria + weights}

Output format (follow exactly):
Criterion: {name} | Score: {N} | Reason: {one-line rationale}
...
Final: {weighted average}/10"
```

### Agreement assessment

| σ | Agreement | Action |
|---|-----------|--------|
| < 0.8 | High — reliable | Use score as-is |
| 0.8–1.5 | Medium | Use score, flag caution |
| > 1.5 | Low | Summon 1 additional judge and re-score |

### Feedback injection on retry

Context added to the re-run prompt:
```
"## Previous Execution Feedback
Previous score: {score}/10
Items needing improvement:
- {lowest criterion}: {score}/10 — {judge reason}
- {second lowest criterion}: {score}/10 — {judge reason}
Focus on improving the above items in the re-run."
```

### Verification result output

```
## Verification
| Attempt | Score | Verdict | Feedback |
|---------|-------|---------|----------|
| 1 | 6.2/10 | ❌ retry | Insufficient completeness |
| 2 | 7.8/10 | ✅ pass | - |

Consensus: σ=0.6 (High)
Rubric: general
```

---

## Strategy: compose

Chain multiple strategies into a pipeline.

### Usage
```
/x-op compose "brainstorm | tournament | refine" --topic "v2 feature plan"
```

Or with the `--pipe` flag:
```
/x-op brainstorm "v2 features" --pipe tournament --pipe refine
```

### Execution flow
1. Run the first strategy → collect results
2. Leader constructs `pipe_payload` from the results (see schema below)
3. Inject `pipe_payload` as input context for the next strategy
4. The last strategy's result becomes the final output

### pipe_payload standard schema

After each strategy completes, the leader parses the markdown result and internally constructs the following structure (the existing markdown is exposed to the user as-is):

```json
{
  "strategy": "tournament",
  "status": "completed",
  "result": {
    "winner": "Solution B",
    "score": 18,
    "summary": "REST + OpenAPI direction"
  },
  "candidates": [
    { "id": "A", "summary": "...", "score": 14 },
    { "id": "B", "summary": "...", "score": 18 }
  ],
  "pipe_payload": "Key content text to pass to the next strategy"
}
```

Per-strategy `pipe_payload` extraction rules:
| Strategy | pipe_payload content |
|----------|---------------------|
| brainstorm | Representative ideas per cluster (top N when voted) |
| tournament | Full winning solution |
| refine | Full final adopted proposal |
| review | Critical/High issue list |
| debate | Verdict + key arguments |
| hypothesis | Surviving hypotheses + recommended verification methods |
| investigate | Key Insights + Knowledge Gaps |
| council | Consensus statement (or key contentions if NO CONSENSUS) |
| escalate | Final level's result |

Sub-agents respond in free text; JSON is not enforced. Constructing pipe_payload is the leader's responsibility.

### Transformation rules
| From → To | Transformation |
|-----------|---------------|
| brainstorm → tournament | Cluster representative ideas become candidates |
| brainstorm → refine | Top-voted idea becomes the seed |
| tournament → refine | Winning solution becomes the refinement target |
| review → red-team | Critical/High issues become attack targets |
| chain → review | Chain final output becomes the review target |
| investigate → debate | Conflicting findings become PRO/CON positions |
| investigate → hypothesis | Knowledge gaps become hypotheses |
| investigate → review | Identified files become review targets |
| investigate → red-team | Discovered attack surfaces become targets |
| investigate → refine | Key insights become the seed |
| brainstorm → investigate | Top ideas become investigation topics |
| hypothesis → investigate | Surviving hypotheses become verification investigation targets |
| hypothesis → scaffold | Adopted hypothesis solutions become module design input |
| hypothesis → chain | Adopted hypothesis becomes the analysis→design→implementation pipeline seed |
| council(no-consensus) → debate | On failed consensus, escalate to pro/con debate |
| review → chain "fix" | Critical issues become the analysis→fix pipeline input |
| persona → council | Per-perspective analyses become deliberation input |

### Final Output
```
🔗 [compose] Complete — {N} strategies

## Pipeline
| Step | Strategy | Input | Output |
|------|----------|-------|--------|
| 1 | brainstorm | "v2 features" | 12 ideas, 4 themes |
| 2 | tournament | top 4 ideas | Winner: idea #3 |
| 3 | refine | idea #3 | Refined solution |

## Final Result
{last strategy's output}
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: decompose

Recursive decomposition → leaf parallel execution → bottom-up assembly.

### Phase 1: DECOMPOSE
> 🧩 [decompose] Phase 1: Decompose

delegate (foreground, opus recommended):
```
"## Decompose: {TOPIC}
Recursively decompose this task:
- Each subtask must be independently executable
- If a subtask is still complex, decompose one level further
- Final leaves must be completable by a single agent in one pass
- Specify dependency order (which leaves must complete first)
- Each leaf must pass scope-clarity and parallelizability checks from Task Decomposition Dimension Anchors

Output format:
- Tree structure (indentation for hierarchy)
- Each leaf: [ID] task name (deps: none or list of IDs)"
```

### Phase 2: EXECUTE LEAVES
> 🧩 [decompose] Phase 2: Execute Leaves

fan-out leaves in dependency order:
- Execute leaves with no dependencies first in parallel
- Once complete, execute the next level of leaves in parallel
- Each leaf agent prompt:
```
"## Leaf Task: {leaf task name}
Overall structure:
{Phase 1 tree}

Dependency results:
{predecessor leaf results, or 'none'}

Complete this leaf task. Do not exceed scope."
```

### Phase 3: ASSEMBLE
> 🧩 [decompose] Phase 3: Assemble

Assemble results bottom-up (delegate, foreground):
```
"## Bottom-up Assembly
Overall tree:
{Phase 1 tree}

Leaf results:
{Phase 2 each leaf result}

Assemble the leaf results bottom-up following the tree structure:
- Integrate from lower to upper levels
- Resolve conflicts between leaves
- Output the final integrated result"
```

### Final Output
```
🧩 [decompose] Complete — {depth} levels, {leaves} leaves

## Decomposition Tree
{tree structure}

## Execution Results
| Level | Leaf | Status |
|-------|------|--------|
| L2 | {leaf name} | ✅ |

## Final Assembly Result
{integrated result}
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: hypothesis

Generate hypotheses → attempt falsification → adopt only survivors. Specialized for bug diagnosis/scientific reasoning.

### Phase 1: GENERATE
> 🔬 [hypothesis] Phase 1: Generate

fan-out — each agent independently generates hypotheses:
```
"## Hypothesis Generation: {TOPIC}
Propose 2-3 possible hypotheses for this problem. Each must address a DISTINCT dimension from the Dimension Anchors. Tag: [dimension] hypothesis.
Each hypothesis: title + rationale + falsifiable prediction (if this hypothesis is correct, then ~ should hold).
200 words max."
```

Leader collects → deduplicates → assigns numbers (H1, H2, ...).

### Phase 2: FALSIFY
> 🔬 [hypothesis] Phase 2: Falsify

fan-out falsification agents for each hypothesis:
```
"## Falsification: {hypothesis title}
Hypothesis: {hypothesis content}
Prediction: {falsifiable prediction}

Attempt to falsify this hypothesis:
- Find counterexamples or contradictions
- Present cases where the prediction fails
- Find evidence that the hypothesis's premises are wrong

Conclusion: FALSIFIED or SURVIVED. Rationale required."
```

### Phase 3: SYNTHESIZE
> 🔬 [hypothesis] Phase 3: Synthesize

Leader synthesizes results:
- Remove FALSIFIED hypotheses
- Select the strongest among SURVIVED hypotheses
- If no hypotheses survived → new hypothesis generation round (up to max_rounds)

### Final Output
```
🔬 [hypothesis] Complete — {total} hypotheses, {survived} survived

## Hypothesis Results
| # | Hypothesis | Status | Rationale |
|---|-----------|--------|-----------|
| H1 | {title} | ✅ SURVIVED | {rationale} |
| H2 | {title} | ❌ FALSIFIED | {falsification rationale} |

## Adopted Hypothesis
{strongest surviving hypothesis in detail}

## Recommended Verification Method
{next steps to confirm the hypothesis in practice}
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: investigate

Multi-angle investigation → synthesis → gap analysis. Specialized for exploring unknowns, technical comparisons, and codebase understanding.

### Phase 1: SCOPE
> 🔎 [investigate] Phase 1: Scope

Leader determines the investigation scope:
- `--target` → Confirm target files/directories
- `--angles` → Parse investigation angles (auto-generated from topic if absent)
- Match angle count to agent count (merge if exceeding)

Default angles (auto-selected by topic):
| Topic pattern | Detection criteria | Default angles |
|--------------|-------------------|----------------|
| Codebase | `--target` present or file/module name mentioned | `structure`, `data-flow`, `dependencies`, `conventions` |
| Technical comparison | Contains "vs", "versus", "compared", "comparison" | `performance`, `ecosystem`, `dx`, `tradeoffs` |
| Security/auth | Contains "auth", "security", "authentication" | `authentication`, `authorization`, `attack-surface`, `data-protection` |
| Performance/bottleneck | Contains "slow", "latency", "performance", "bottleneck" | `profiling`, `architecture`, `data-access`, `concurrency` |
| General | No pattern matched | `overview`, `mechanics`, `tradeoffs`, `alternatives` |

### Phase 2: EXPLORE
> 🔎 [investigate] Phase 2: Explore ({N} angles)

broadcast — each agent gets a different investigation angle prompt. Prompt varies by `--depth`:

**shallow (default):**
```
"## Investigation: {TOPIC}
Angle: {ANGLE_NAME} — {ANGLE_DESCRIPTION}
Target: {--target or 'general'}
Depth: shallow — max 5 files, no web search

Investigate from the '{ANGLE_NAME}' angle:
1. Collect specific facts (file reads only, no web search)
2. Cite source for each finding (file path)
3. Confidence per finding: HIGH / MEDIUM / LOW
4. Flag unverifiable items (unknowns)
5. Self-assessment: investigation thoroughness 1-10, CONFIDENT or UNCERTAIN

## Findings / ## Unknowns / ## Self-Assessment
Tag each finding with its dimension. Findings on the same dimension across agents will be cross-validated.
300 words max."
```

**deep:**
```
"## Investigation: {TOPIC}
Angle: {ANGLE_NAME} — {ANGLE_DESCRIPTION}
Target: {--target or 'general'}
Depth: deep — max 15 files, web search allowed

Conduct a deep investigation from the '{ANGLE_NAME}' angle:
1. Collect specific facts (file reads, web search allowed)
2. Cite source for each finding (file path, URL, inference)
3. Confidence per finding: HIGH / MEDIUM / LOW
4. Flag unverifiable items (unknowns)
5. Self-assessment: investigation thoroughness 1-10, CONFIDENT or UNCERTAIN

## Findings / ## Unknowns / ## Self-Assessment
Tag each finding with its dimension. Findings on the same dimension across agents will be cross-validated.
500 words max."
```

**exhaustive:**
```
"## Investigation: {TOPIC}
Angle: {ANGLE_NAME} — {ANGLE_DESCRIPTION}
Target: {--target or 'general'}
Depth: exhaustive — max 30 files, web search + cross-validation required

Conduct an exhaustive investigation from the '{ANGLE_NAME}' angle:
1. Collect specific facts (file reads, web search, cross-validation)
2. Cite source for each finding (file path, URL, inference)
3. Confidence per finding: HIGH / MEDIUM / LOW
4. Explicitly tag findings that may overlap with other angles
5. Flag unverifiable items (unknowns)
6. Self-assessment: investigation thoroughness 1-10, CONFIDENT or UNCERTAIN

## Findings / ## Unknowns / ## Self-Assessment
Tag each finding with its dimension. Findings on the same dimension across agents will be cross-validated.
700 words max."
```

### Phase 2.5: CROSS-VALIDATE (`--depth deep|exhaustive` only)
> 🔎 [investigate] Phase 2.5: Cross-Validate

Auto-activated for `--depth deep` and above. Applies the council CROSS-EXAMINE pattern:

broadcast — send other agents' Findings to each agent:
```
"## Cross-Validation: {ANGLE_NAME}
Your investigation results: {own Phase 2 Findings}
Other angles' results: {other agents' Findings summary}

Read the other angles' results and:
1. 1-2 findings you agree with + rationale
2. 1-2 findings you question + reason
3. Anything to revise/augment in your own findings
200 words max."
```

### Phase 3: SYNTHESIZE
> 🔎 [investigate] Phase 3: Synthesize

Leader synthesizes all results using structured rules:

**Cross-validation rules:**
- 2+ angles agree: confidence → confirmed HIGH
- 1 angle only: retain original confidence
- Findings endorsed in Phase 2.5: count as +1 angle

**Conflict resolution rules:**
- Contradictory findings on the same topic: tag `[CONFLICT]` → pass to Phase 4 as gap
- Majority rule (3+ angles agree vs 1 dissent): adopt majority, annotate minority opinion

**Structuring:**
- Reorganize by theme rather than by angle
- Assign cross-validation score per theme

**Self-assessment aggregation:**
- Average agent Self-Assessment < 6: display "⚠ Further investigation recommended"
- UNCERTAIN agent ratio > 50%: add deeper investigation gap to Phase 4

### Phase 4: GAP ANALYSIS
> 🔎 [investigate] Phase 4: Gap Analysis

delegate (foreground):
```
"## Gap Analysis: {TOPIC}
Synthesis result: {Phase 3 synthesis}
Reported unknowns: {Phase 2 Unknowns aggregated}

Analyze what is still unknown:
1. List of knowledge gaps
2. How to close each gap (files to read, experiments to run, people to ask)
3. Importance: CRITICAL / IMPORTANT / NICE-TO-HAVE
4. Suggest appropriate x-op strategy for gap closure:
   - Ambiguous findings → debate or hypothesis
   - Deep code analysis needed → review or red-team
   - Multiple perspectives needed → persona or council
   - Iterative refinement needed → refine
200 words max."
```

### Final Output
```
🔎 [investigate] Complete — {N} angles, {M} findings, {G} gaps

## Findings
| # | Finding | Confidence | Sources | Angles |
|---|---------|------------|---------|--------|
| 1 | {finding} | HIGH | src/auth.ts:42 | structure, data-flow |
| 2 | {finding} | MEDIUM | official docs | dependencies |

## Key Insights
- {3-5 key insights}

## Knowledge Gaps
| # | Gap | Importance | Suggested Action |
|---|-----|------------|-----------------|
| 1 | {unknown area} | CRITICAL | → hypothesis "..." |
| 2 | {unknown area} | IMPORTANT | → review --target src/ |

## Confidence Summary
- HIGH: {N} ({P}%)
- MEDIUM: {N} ({P}%)
- LOW: {N} ({P}%)
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: escalate

haiku → sonnet → opus auto-escalation. Cost-optimized.

### Execution flow
> 📈 [escalate] Level 1: haiku

1. **Level 1 (haiku)**: Start with the cheapest model
```
delegate (model: haiku):
"## Task: {TOPIC}
Solve this task. 400 words max.
At the end, self-assess your answer quality on a 1-10 scale.
7 or above: mark 'CONFIDENT'. Below 7: mark 'UNCERTAIN'."
```

2. **Leader evaluation**: Check result quality
   - `CONFIDENT` + leader agrees → Terminate
   - `UNCERTAIN` or leader deems insufficient → Escalate to Level 2

> 📈 [escalate] Level 2: sonnet

3. **Level 2 (sonnet)**: Include previous result as context
```
delegate (model: sonnet):
"## Escalated Task: {TOPIC}
Previous attempt (haiku):
{Level 1 result}
Improve upon the shortcomings of the previous attempt and present a better result.
Self-assessment: CONFIDENT / UNCERTAIN"
```

4. Same evaluation → Escalate to Level 3 (opus) if needed

> 📈 [escalate] Level 3: opus

5. **Level 3 (opus)**: Final level
```
delegate (model: opus):
"## Final Escalation: {TOPIC}
Previous attempts:
- haiku: {Level 1 result}
- sonnet: {Level 2 result}
Present the final result. Resolve all shortcomings from previous attempts."
```

### Auto start-level determination

If x-solver's `classify` result contains a `complexity` field, the start level is automatically determined:
| complexity | --start | Reason |
|------------|---------|--------|
| low | haiku | Simple task — start at lowest cost |
| medium | sonnet | Medium complexity — skip haiku step |
| high | sonnet | High complexity — haiku is insufficient, start from sonnet |

Manual `--start` flag takes precedence over auto-determination.

### Options
- `--start haiku|sonnet` — Start level (default haiku, auto-determined when integrated with classify complexity)
- `--threshold N` — Self-assessment threshold (default 7)
- `--max-level haiku|sonnet|opus` — Maximum escalation level (default opus)

### Final Output
```
📈 [escalate] Complete — resolved at {level}

## Escalation Path
| Level | Model | Quality | Decision |
|-------|-------|---------|----------|
| 1 | haiku | 5/10 | → escalate |
| 2 | sonnet | 8/10 | ✅ accepted |

## Cost Savings
Estimated: ${cost} (vs ${opus_cost} if opus-only, saved ${saved}%)

## Final Result
{final result}
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy: monitor

One-shot observe → assess → strategy dispatch. Periodicity is delegated to external tools (cron/tmux).

> Note: Claude Code has no time-based triggers, so monitor performs "one observation at invocation time" only.
> For periodic monitoring, use external cron + `claude -p "/x-op monitor ..."` or OMC `/loop`.

### Phase 1: OBSERVE
> 👁️ [monitor] Phase 1: Observe

Leader collects observation targets:
- `--target <file|dir|cmd>` → Read file, check directory state, or execute Bash command
- If absent → `git diff HEAD` + `git log --oneline -5` (recent changes)

### Phase 2: ANALYZE
> 👁️ [monitor] Phase 2: Analyze

broadcast — each agent gets a different observation angle:
```
"## Monitor: {TARGET}
Observation target: {Phase 1 collected data}
Angle: {ANGLE}

Assess anomalies against the following criteria:
1. Are there changes outside expected range
2. Are there signs of potential issues (bugs, security, performance regression)
3. Are there items requiring immediate action

Result: NORMAL / WARNING / ALERT + rationale. Each assessment must cite a specific observation (file:line, metric value, or diff hunk) per the Agent Output Quality Contract. 200 words max."
```

Default angles (assigned to match agent count):
- `code-quality`: Code quality regression
- `security`: Security vulnerability introduction
- `dependency`: Dependency changes/conflicts
- `test-coverage`: Missing tests

### Phase 3: DISPATCH
> 👁️ [monitor] Phase 3: Dispatch

Leader synthesizes agent results:
- **All NORMAL** → Output summary, no action
- **1+ WARNING** → Warning summary + recommended strategy suggestion
- **1+ ALERT** → Auto-execute recommended strategy (after user confirmation)

Auto-dispatch rules:
| Alert type | Recommended strategy |
|-----------|---------------------|
| Security vulnerability | → red-team --target {file} |
| Code quality regression | → review --target {file} |
| Missing tests | → chain "test-gap-analysis → test-generation" |
| Dependency conflict | → investigate "dependency conflict" |
| Compound issue | → hypothesis "What caused {issue}?" |

### Final Output
```
👁️ [monitor] Complete — {N} agents, {alerts} alerts, {warnings} warnings

## Observation Results
| # | Angle | Status | Finding |
|---|-------|--------|---------|
| 1 | code-quality | ✅ NORMAL | No changes |
| 2 | security | ⚠️ WARNING | New dependency has known CVE |
| 3 | test-coverage | 🚨 ALERT | 3 functions lack tests |

## Auto Dispatch
| Alert | Strategy | Status |
|-------|----------|--------|
| test-coverage | → review --target src/auth/ | Pending (user confirmation required) |
```

The leader appends a `## Self-Score` block to the final output per the [Self-Score Protocol].

---

## Strategy Selection Guide

When the user does not know which strategy to use, recommend one using the decision tree below:

```
What kind of task is this?
│
├─ Code writing/implementation → What scale?
│   ├─ Single module → scaffold
│   ├─ Multiple independent tasks → distribute
│   └─ Dependency tree → decompose
│
├─ Code review/security → What purpose?
│   ├─ Quality inspection → review
│   ├─ Vulnerability hunting → red-team
│   └─ Both → compose "review | red-team"
│
├─ Decision-making/design → Are there options?
│   ├─ 2 opposing choices → debate
│   ├─ 3+ candidates → tournament
│   ├─ Multiple stakeholders → council
│   └─ Per-perspective analysis needed → persona
│
├─ Problem solving/debugging → Do you know the cause?
│   ├─ Unknown → hypothesis
│   ├─ Exploration needed → investigate
│   └─ Want to verify assumptions → socratic
│
├─ Ideation/planning → What stage?
│   ├─ Divergence → brainstorm
│   ├─ Diverge→select→refine → compose "brainstorm | tournament | refine"
│   └─ Improve existing proposal → refine
│
├─ Sequential workflow → chain
│
├─ Change monitoring/anomaly detection → monitor
│
└─ Cost optimization → escalate
```

### Options application guide

| Strategy | Key options | Description |
|----------|-----------|-------------|
| refine | `--rounds`, `--preset` | Round count = refinement depth |
| tournament | `--bracket`, `--agents` | Agent count = candidate diversity |
| review | `--target` | Required — file to review |
| debate | `--agents` | Minimum 3 (PRO+CON+JUDGE) |
| brainstorm | `--vote` | Vote to select top ideas |
| council | `--weights` | Role-based weighted voting |
| persona | `--personas` | Manually specify roles |
| investigate | `--angles`, `--depth` | Investigation angles and depth |
| escalate | `--start`, `--max-level` | Start/max model level |
| compose | `--pipe` | Strategy pipelining |

## Agent Output Quality Contract

All agent prompts in x-op strategies implicitly reference this contract. The leader enforces it during synthesis.

### Output Quality Criteria

Every argument, finding, or position an agent produces must be:
1. **Evidence-based** — Cites a specific fact, example, or mechanism. "It's better" → FAIL. "Reduces latency by eliminating N+1 queries" → PASS.
2. **Falsifiable** — States a claim that could be proven wrong. "This might help" → FAIL. "This approach fails when concurrent users exceed 1K" → PASS.
3. **Dimension-tagged** — Labels which dimension it addresses. Two arguments on the same dimension must be merged.

### Dimension Anchors by Strategy Category

Agents must tag output by dimension BEFORE generating content. This prevents overlap and ensures coverage.

| Category | Strategies | Dimension Pool |
|----------|-----------|---------------|
| Argument/analysis | refine, tournament, debate, council, socratic, hypothesis, investigate | `feasibility`, `scalability`, `maintainability`, `cost`, `risk`, `performance`, `security`, `dx` |
| Code analysis | review, red-team, monitor | `correctness`, `security`, `performance`, `resilience`, `testability`, `readability` |
| Task decomposition | scaffold, decompose, distribute, chain | `scope-clarity`, `dependency-minimality`, `parallelizability`, `testability`, `interface-completeness` |
| Ideation | brainstorm, persona | `novelty`, `feasibility`, `impact`, `effort`, `risk` |

Rule: The **leader** pre-assigns dimensions to agents before generation. Agents do NOT freely pick dimensions — the leader selects the most relevant 3 from the pool based on the topic and assigns them. This ensures cross-trial consistency while maintaining relevance.

Leader dimension assignment (strategy-dependent):
- **Deterministic strategies** (review, red-team, monitor, scaffold, decompose, distribute, chain): Leader pre-assigns fixed dimensions. Same input → same dimensions.
- **Exploratory strategies** (debate, refine, tournament, brainstorm, council, socratic, persona, hypothesis, investigate): Leader selects the most relevant dimensions but diversity across trials is expected and valuable. Consistency is measured by verdict/conclusion, not by dimension selection.

### Judge/Evaluator Rubric

When a strategy includes a judge, evaluator, or voting phase:
- Score each argument on **strength** (evidence + logic, 1-10) and **coverage** (dimensions addressed, 1-10)
- Verdict must cite dimension scores, not just declare a winner

### Good vs Bad Agent Output

Good: `[feasibility] Requires only stdlib — no new deps, deploys on existing infra. Fails if payload exceeds 1MB (no streaming).`
Bad: `This approach is more practical and easier to implement.`

---

## Self-Score Protocol

All strategies include a `## Self-Score` block in the final output. The leader self-scores based on rubric after strategy completion.

### Strategy-Rubric mapping

| Category | Strategies | Default Rubric | Criteria (weight) |
|----------|-----------|----------------|-------------------|
| Code analysis | review, red-team, monitor | code-quality | correctness 0.30, readability 0.20, maintainability 0.20, security 0.20, test-coverage 0.10 |
| Argument/analysis | refine, tournament, debate, council, socratic, hypothesis, investigate | general | accuracy 0.25, completeness 0.25, consistency 0.20, clarity 0.20, hallucination-risk 0.10 |
| Task decomposition | scaffold, decompose, distribute, chain | plan-quality | completeness 0.30, actionability 0.30, scope-fit 0.20, risk-coverage 0.20 |
| Ideation | brainstorm, persona | general | accuracy 0.25, completeness 0.25, consistency 0.20, clarity 0.20, hallucination-risk 0.10 |
| Meta | escalate | inherits from task | - |
| Pipeline | compose | last strategy's rubric | - |

Override with `--rubric <name>` flag.

### Self-Score output format

Appended to the end of every strategy's final output:
```
## Self-Score
| Criterion | Score | Note |
|-----------|-------|------|
| {criterion1} | {1-10} | {one-line rationale} |
| {criterion2} | {1-10} | {one-line rationale} |
| ... | ... | ... |
| **Overall** | **{weighted average}** | |
```

Scoring scale: 1=fail, 5=baseline, 7=good, 10=excellent.

## Interactive Mode

When `$ARGUMENTS` is empty, use AskUserQuestion for step-by-step selection:

**Step 1 — Category:**
1. "Collaboration (refine / brainstorm / socratic)"
2. "Competition/Deliberation (tournament / debate / council)"
3. "Pipeline (chain / distribute / scaffold / compose / decompose)"
4. "Analysis (review / red-team / persona / hypothesis / investigate)"
5. "Monitoring/Meta (monitor / escalate / compose)"

**Step 2 — Select specific strategy**
**Step 3 — Enter task**
