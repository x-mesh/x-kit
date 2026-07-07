---
name: x-op
description: Strategy orchestration — 17 strategies including refine, tournament, chain, review, debate, red-team, brainstorm, distribute, council, socratic, persona, scaffold, compose, decompose, hypothesis, investigate, monitor
allowed-tools:
  - AskUserQuestion
---

# x-op — Strategy Orchestration (Claude Code Native)

Direct structured strategies to an agent team.
The leader Claude (you) serves as both orchestrator and synthesizer, controlling agents via the **Claude Code native Agent tool**.
No external dependencies required. An opt-in **term-mesh backend** can execute the same strategies on a live pane team — see x-agent `references/term-mesh-backend.md`.

## Arguments

User provided: $ARGUMENTS

## Mode Detection

Read mode from `.xm/config.json` (`mode` field). Default: `developer`.

**Developer mode**: Use technical terms (strategy, verdict, premise, assumption, consensus). Concise.

**Normal mode**: 쉬운 한국어로 안내합니다.
- "strategy" → "전략", "verdict" → "판정", "premise" → "가정", "self-score" → "자체 점수"
- "consensus" → "합의", "refinement" → "다듬기", "tournament" → "대결", "debate" → "토론"
- "compose" → "조합", "decompose" → "분해"
- Use "~하세요" form; lead with key information first

## Model Routing

| Subcommand | Model | Reason |
|------------|-------|--------|
| `list` | **haiku** (Agent tool) | Catalog display, no reasoning |
| Auto-route (strategy detection) | **sonnet** | Requires AskUserQuestion for confirmation |
| Strategy execution | **sonnet** | Multi-agent orchestration |

For haiku-eligible commands, delegate via: `Agent tool: { model: "haiku", prompt: "Run: [command]" }`

## Wiring

```
suggests: x-eval
suggests: x-humble
```

## Post-Strategy Eval Gate

After every strategy completes (Self-Score appended), check for auto-eval:

1. Read `.xm/config.json` → check `eval.auto` field
2. If `eval.auto: true` OR `--verify` flag was used:
   - Automatically invoke x-eval score with the strategy output
   - Rubric: use the strategy's default rubric from Self-Score Protocol mapping
   - Mode: use `--grounded` if the strategy involved code (review, red-team, monitor)
   - Store result in `.xm/eval/results/`
3. If `eval.auto` is not set and `--verify` is not used:
   - Show suggestion: `"💡 x-eval로 품질 평가를 할 수 있습니다. /xm:eval score로 실행하세요."`

This replaces the previous --verify inline judge panel with x-eval delegation, ensuring a single evaluation path.

> **Self-Score rule (applies to all strategies)**: Every strategy's final output MUST include a `## Self-Score` block per `references/self-score-protocol.md`.

## AskUserQuestion Dark-Theme Rule

See `references/ask-user-question-rule.md` — the `question` field is invisible on dark terminals; put context in markdown, use `header`/`label`/`description` for user-facing text.

## Interaction Protocol

**CRITICAL: x-op strategies with multiple phases MUST use AskUserQuestion at phase boundaries.**

Rules:
1. **AskUserQuestion is REQUIRED at every phase transition** — after completing a phase, call AskUserQuestion to confirm before proceeding to the next phase. This is the ONLY mechanism that forces a real turn boundary.
2. **No text-only questions** — NEVER output "진행할까요?" as plain text. Use AskUserQuestion tool.
3. **Show results before asking** — output the current phase results, then call AskUserQuestion for confirmation.
4. **Auto-Route confirmation is mandatory** — when auto-detecting a strategy, MUST use AskUserQuestion to confirm the recommendation before executing.

Anti-patterns (NEVER do these):
- ❌ Complete Phase 1, output results, then immediately start Phase 2
- ❌ Ask "다음 단계로 넘어갈까요?" as text output
- ✅ Complete Phase 1, output results, call AskUserQuestion("Phase 1 완료. Phase 2를 진행할까요?")

### Phase Checkpoint (required before any phase transition)

Before calling AskUserQuestion for a phase boundary, the leader MUST output a `**PHASE_N_CHECKPOINT:**` block listing the exit conditions for the phase just completed. This forces self-verification and gives the user something concrete to approve.

Template:
```
**PHASE_{N}_CHECKPOINT:**
- [x] {required output produced}
- [x] {evidence collected}
- [x] {dimensions covered or agents completed}
```

Rules:
- Every unchecked (`- [ ]`) item means the phase is NOT complete — fix it before asking
- For fan-out phases, include agent count (e.g., `- [x] 4/4 agents completed`)
- For compose sub-strategies, emit a checkpoint at each sub-strategy boundary, not only at the outer level
- Checkpoint precedes AskUserQuestion; AskUserQuestion still carries phase-transition authority

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
- Empty input → [Subcommand: list] — show strategy catalog
- Other text (no strategy keyword match) → [Auto-Route] — detect intent and recommend strategy

### Auto-Route (Natural Language → Strategy)

See `references/x-op-auto-route.md` — signal detection table, priority rules, compound signal boost, execution flow, and examples for mapping free-form input to strategies.

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
- `--analogical` — Brainstorm: cross-domain structural mapping mode
- `--lateral` — Brainstorm: de Bono lateral thinking operators mode (4 agents)
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

## Pre-Execution Confidence Gate

Before dispatching agents for any strategy, the leader self-assesses readiness. This is a lightweight pre-check (~50 tokens), not a post-execution quality gate.

### Checklist (answer each before proceeding)

1. **Topic clarity** — Is the task unambiguous? Can agents act on it without guessing?
2. **Sufficient context** — Does the leader have enough information (files read, prior results) to orchestrate?
3. **Strategy fit** — Is the selected strategy appropriate for this task type?
4. **Scope boundedness** — Can agents produce a result within their token/round budget?

### Decision

| Yes count | Confidence | Action |
|:---------:|:----------:|--------|
| 4/4 | HIGH | Proceed silently — no user interruption |
| 3/4 | MEDIUM | State which item is uncertain, proceed with caveat noted in trace |
| ≤ 2/4 | LOW | **STOP.** Show the uncertain items. Use AskUserQuestion: "Confidence is low. Clarify or proceed anyway?" |

### Rules
- The gate fires AFTER strategy selection but BEFORE the first agent dispatch
- At the gate, also resolve the execution backend (`XK_BACKEND` env → `execution_backend` config → auto-detect); on `term-mesh`, substitute every Agent-tool dispatch per x-agent `references/term-mesh-backend.md`
- For `compose` pipelines, the gate fires ONCE at the top level, not per sub-strategy
- The gate does NOT fire for `list`, `--dry-run`, or `--resume` (no agent dispatch)
- When `--context` is active, context injection counts toward "sufficient context"
- Record the confidence level in the trace entry (session_start args)

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
  brainstorm <topic>      Free ideation → cluster → vote [--analogical|--lateral]
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
  /xm:op refine "Payment API design" --rounds 4
  /xm:op tournament "Login implementation" --agents 4 --bracket double
  /xm:op debate "Monolith vs microservices"
  /xm:op review --target src/auth.ts
  /xm:op brainstorm "v2 feature ideas" --vote
  /xm:op socratic "Why microservices?" --rounds 4
  /xm:op persona "Auth redesign" --personas "engineer,security,pm"
  /xm:op scaffold "Plugin system" --agents 4
  /xm:op investigate "Auth system" --target src/auth/ --depth deep
  /xm:op investigate "Redis vs Memcached" --angles "performance,ecosystem,ops,cost"
  /xm:op compose "brainstorm | tournament | refine" --topic "v2 plan"
  /xm:op refine "API design" --dry-run
  /xm:op tournament "Login" --explain
  /xm:op decompose "Implement payment system" --agents 6
  /xm:op hypothesis "Why is latency spiking?" --rounds 3
```

---

## Strategy: refine

See `strategies/refine.md` — round-based Diverge → Converge → Verify refinement. Round 1 DIVERGE fan-out produces N independent proposals (run_in_background parallel); Round 2 CONVERGE leader synthesizes and runs a vote fan-out to adopt the best; Round 3+ VERIFY fan-out checks the adopted proposal — all OK triggers early termination, issues raised loop back until max_rounds.

---

## Strategy: tournament

See `strategies/tournament.md` — Compete → anonymous vote → adopt winner. Phase 1 COMPETE fan-out collects solutions; Phase 2 ANONYMIZE removes agent names and shuffles order; Phase 3 VOTE fan-out ranks anonymized solutions; Phase 4 TALLY applies Borda count. Supports `--bracket double` for seed ranking with losers' bracket.

---

## Strategy: chain

See `strategies/chain.md` — A→B→C sequential pipeline with conditional branching. Each step delegates to one agent passing prior step result as context. Enhanced mode supports `if:condition->step` DAG branching syntax and auto-inserts supplementary steps when confidence is low.

---

## Strategy: review

See `strategies/review.md` — Multi-perspective code review fan-out. Phase 1 TARGET reads `--target` file or `git diff HEAD`; Phase 2 ASSIGN distributes Security/Logic/Performance perspectives (scales with `--agents N`); Phase 3 REVIEW fan-out with per-perspective prompts; Phase 4 SYNTHESIZE deduplicates and sorts by severity.

---

## Strategy: debate

See `strategies/debate.md` — Pro vs Con debate followed by verdict. Phase 1 POSITION distributes agents into PRO/CON/JUDGE; Phase 2 OPENING runs simultaneous fan-out for arguments; Phase 3 REBUTTAL cross-sends openings; Phase 4 VERDICT delegate scores all arguments and delivers a final recommendation.

---

## Strategy: red-team

See `strategies/red-team.md` — Adversarial attack/defend cycle. Phase 1 TARGET collects via `--target` or `git diff HEAD`; Phase 2 ATTACK fan-out finds vulnerabilities tagged by dimension; Phase 3 DEFEND fan-out provides fixes or counter-evidence; Phase 4 REPORT synthesizes Fixed(🟢)/Partial(🟡)/Open(🔴).

---

## Strategy: brainstorm

See `strategies/brainstorm.md` — free ideation → cluster → vote. Phase 1 GENERATE fan-out produces minimum 5 tagged ideas per agent; two optional modes: `--analogical` (cross-domain structural mapping) and `--lateral` (de Bono operators: Reversal, Provocation, Random Entry, Fractionation). Phase 2 CLUSTER deduplicates and groups by theme; Phase 3 VOTE (when `--vote` is set) fan-out selects top 3.

---

## Strategy: distribute

See `strategies/distribute.md` — Split a large task into independent subtasks → parallel fan-out → merge. Phase 1 SPLIT auto-splits or uses `--splits`; Phase 2 DISPATCH fan-out with scoped subtask prompts; Phase 3 MERGE leader resolves conflicts and synthesizes by theme.

---

## Strategy: council

See `strategies/council.md` — N-party free discussion → cross-examination → deep dive → consensus. Round 1 OPENING fan-out collects positions; Round 2 CROSS-EXAMINE broadcasts each agent's view to others (excluding their own); Round 3~N-1 DEEP DIVE targets key points of contention; Final CONVERGE drafts a consensus proposal for vote. Supports `--weights` for role-based weighted voting.

---

## Strategy: socratic

See `strategies/socratic.md` — Socratic questioning across N rounds: Phase 1 SEED collects an initial position via delegate; Phase 2 QUESTION ROUNDS fan-out agents as questioners targeting logical gaps and implicit premises, then leader synthesizes and sends to a responding agent. Early termination when questions become trivial; max_rounds cap for best-effort output.

---

## Strategy: persona

See `strategies/persona.md` — Role-based multi-perspective analysis. Phase 1 ASSIGN distributes fixed personas (default: senior engineer, security expert, PM, junior developer); Phase 2 ANALYZE broadcast with per-persona prompts; Phase 3 SYNTHESIZE unifies across perspectives; optional Phase 4 CROSS-CHECK verifies unified proposal from each persona's view.

---

## Strategy: scaffold

See `strategies/scaffold.md` — Structure design → module distribution → parallel implementation → integration. Phase 1 DESIGN delegates to opus for module/interface spec; Phase 2 DISPATCH fan-out per module; Phase 3 INTEGRATE resolves interface compatibility and assembles final result.

---

## Options Reference

See `references/x-op-options.md` — detailed behavior for `--dry-run`, `--resume`, `--explain`, `--verify`, `--vote` (Self-Consistency).

---

## Strategy: compose

See `strategies/compose.md` — Chain multiple strategies into a sequential pipeline. Supports `compose "A | B | C"` syntax and `--pipe` flag. Leader constructs `pipe_payload` between each step using per-strategy extraction rules; includes a full transformation table for common strategy pairings.

---

## Strategy: decompose

See `strategies/decompose.md` — Recursive decomposition → leaf parallel execution → bottom-up assembly. Phase 1 DECOMPOSE delegates to an opus agent to build a dependency tree; Phase 2 EXECUTE LEAVES fan-out in dependency order; Phase 3 ASSEMBLE integrates results bottom-up.

---

## Strategy: hypothesis

See `strategies/hypothesis.md` — Generate hypotheses → falsify → adopt survivors. Phase 1 GENERATE fan-out produces 2-3 tagged hypotheses per agent with falsifiable predictions; Phase 2 FALSIFY fan-out attempts to disprove each (FALSIFIED or SURVIVED); Phase 3 SYNTHESIZE selects strongest survivor, re-runs if none survive (up to max_rounds).

---

## Strategy: investigate

See `strategies/investigate.md` — Multi-angle investigation → synthesis → gap analysis. Phase 1 SCOPE auto-selects angles from topic pattern (codebase/comparison/security/performance/general); Phase 2 EXPLORE broadcast with depth-aware prompts (shallow/deep/exhaustive); Phase 2.5 CROSS-VALIDATE for deep/exhaustive; Phase 3 SYNTHESIZE with conflict resolution and confidence aggregation; Phase 4 GAP ANALYSIS delegate suggests follow-up strategies.

---

## Strategy: monitor

See `strategies/monitor.md` — one-shot OODA (observe → orient → decide → act). Default observation targets: `--target` or recent git changes. Phase 2 ORIENT broadcasts to N agents across code-quality/security/dependency/test-coverage angles; Phase 3 DECIDE applies wait/escalate/act; Phase 4 ACT auto-dispatches red-team/review/chain/investigate/hypothesis per alert type.

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
└─ Change monitoring/anomaly detection → monitor
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
| compose | `--pipe` | Strategy pipelining |

## Agent Output Quality Contract

See `references/agent-output-contract.md` — evidence-based, falsifiable, dimension-tagged outputs with per-category Dimension Anchors and strict evidence standards.

---

## Self-Score Protocol

See `references/self-score-protocol.md` — 1-10 self-assessment scale, Strategy-Rubric mapping, 4Q hallucination check, output block format.

## Result Persistence

See `references/x-op-result-persistence.md` — save workflow, result schema, per-strategy outcome mapping, and what NOT to save.

---

## Trace Recording

See `references/trace-recording.md` — session_start/session_end are automatic via `.claude/hooks/trace-session.mjs`; emit best-effort `agent_step` entries for long sub-operations.

## Interactive Mode

When `$ARGUMENTS` is empty, use AskUserQuestion for step-by-step selection:

**Step 1 — Category:**
1. "Collaboration (refine / brainstorm / socratic)"
2. "Competition/Deliberation (tournament / debate / council)"
3. "Pipeline (chain / distribute / scaffold / compose / decompose)"
4. "Analysis (review / red-team / persona / hypothesis / investigate)"
5. "Monitoring/Meta (monitor / compose)"

**Step 2 — Select specific strategy**
**Step 3 — Enter task**

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll just use refine, it always works" | refine is convergence, not exploration. Use it *after* you have candidates, not before. Problems that need divergent thinking (brainstorm, tournament) starve on refine alone. |
| "This result looks good, `--verify` is overkill" | `--verify` exists precisely because "looks good" is where shared bias hides. Skipping it means you're trusting one model's confidence instead of checking its work. |
| "Debate is expensive, I'll skip it" | Debate is expensive *because* it surfaces disagreements that single-strategy runs hide. The cost is the value — if it didn't disagree, you didn't need it. |
| "Any strategy works for this" | "Any strategy" is the tell that you haven't classified the problem. Use classify first — "any strategy" is functionally the same as no strategy. |
| "18 strategies is too many, I'll stick with 3" | Sticking with 3 means you're using them outside their fit zone. classify narrows the 18 to the right 1-2 in seconds. |
| "The strategy matters less than the prompt" | The strategy *is* the control loop around the prompt. Wrong strategy = wrong loop = wasted agents even with a perfect prompt. |
| "Compose is for complex problems, mine is simple" | Compose chains strategies that address different failure modes. Even simple problems benefit when divergence-then-convergence is cheaper than any single strategy solving both. |
