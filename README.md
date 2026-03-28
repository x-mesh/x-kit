# x-kit

**Multi-agent toolkit for Claude Code** by [x-mesh](https://github.com/x-mesh).

Structured problem solving, strategy orchestration, and agent primitives — with built-in quality pipelines and structured retrospectives that ensure consistent, high-quality results.

Zero dependencies. Claude Code native. Works everywhere.

## Install

```bash
# Add the marketplace
/plugin marketplace add x-mesh/x-kit

# Install everything (bundle — 10 plugins)
/plugin install x-kit@x-kit -s user

# Or install individually
/plugin install x-op@x-kit -s user      # Strategy orchestration
/plugin install x-build@x-kit -s user   # Project harness
/plugin install x-eval@x-kit -s user    # Quality evaluation
/plugin install x-humble@x-kit -s user  # Structured retrospective
/plugin install x-agent@x-kit -s user   # Agent primitives
/plugin install x-solver@x-kit -s user  # Problem solving
```

## Quick Start

```bash
# Multi-agent strategy with auto quality verification
/x-op debate "Monolith vs microservices" --verify
/x-op review --target src/auth/ --agents 5
/x-op investigate "Why is latency spiking?" --depth deep

# Project with PRD → consensus review → execution
/x-build init my-api
/x-build plan "Build a REST API with JWT auth"
# → PRD generated → user review → optional quality gate / consensus → tasks
/x-build run

# Learn from failures together
/x-humble reflect
# → recall → identify failures → root cause + bias analysis
# → steelman alternatives → KEEP/STOP/START lessons

# Measure quality
/x-eval score output.md --rubric code-quality
/x-eval diff --quality
```

---

## Plugins

### x-op — Strategy Orchestration

18 multi-agent strategies with self-scoring and auto-verification.

```bash
/x-op refine "Payment API design" --rounds 4 --verify
/x-op tournament "Best approach" --agents 6 --bracket double
/x-op debate "REST vs GraphQL"
/x-op investigate "Redis vs Memcached" --depth deep
/x-op compose "brainstorm | tournament | refine" --topic "v2 plan"
/x-op hypothesis "Memory leak cause" --rounds 3
```

| Category | Strategies |
|----------|-----------|
| **Collaboration** | refine, brainstorm, socratic |
| **Competition** | tournament, debate, council |
| **Pipeline** | chain, distribute, scaffold, compose, decompose |
| **Analysis** | review, red-team, persona, hypothesis, investigate |
| **Meta** | monitor, escalate |

**Quality features:**
- **Self-Score**: Every strategy auto-scores output against rubric (1-10)
- **--verify**: Judge panel validates quality, auto-retries if below threshold
- **Compose presets**: `--preset analysis-deep`, `--preset security-audit`, `--preset consensus`

<details>
<summary>All 18 strategies</summary>

| Strategy | Pattern | Best for |
|----------|---------|----------|
| **refine** | Diverge → converge → verify | Iterating on a design |
| **tournament** | Compete → seed → bracket → winner | Picking the best solution |
| **chain** | A → B → C with conditional branching | Multi-step analysis |
| **review** | Parallel multi-perspective (dynamic scaling) | Code review |
| **debate** | Pro vs Con + Judge → verdict | Trade-off decisions |
| **red-team** | Attack → defend → re-attack | Security hardening |
| **brainstorm** | Free ideation → cluster → vote | Feature exploration |
| **distribute** | Split → parallel → merge | Large parallel tasks |
| **council** | Weighted deliberation → consensus | Multi-stakeholder decisions |
| **socratic** | Question-driven deep inquiry | Challenging assumptions |
| **persona** | Multi-role perspective analysis | Requirements from all angles |
| **scaffold** | Design → dispatch → integrate | Top-down implementation |
| **compose** | Strategy piping (A \| B \| C) | Complex workflows |
| **decompose** | Recursive split → leaf parallel → assemble | Large implementations |
| **hypothesis** | Generate → falsify → adopt | Bug diagnosis, root cause |
| **investigate** | Multi-angle → cross-validate → gap analysis | Unknown exploration |
| **monitor** | Observe → analyze → auto-dispatch | Change surveillance |
| **escalate** | haiku → sonnet → opus auto | Cost optimization |

</details>

<details>
<summary>Options</summary>

```
--rounds N              Round count (default 4)
--preset quick|thorough|deep|analysis-deep|security-audit|consensus
--agents N              Number of agents (default: agent_max_count)
--model sonnet|opus     Agent model
--target <file>         Review/red-team/monitor target
--depth shallow|deep|exhaustive   Investigation depth
--verify                Auto quality validation (judge panel + retry)
--threshold N           Verify pass score (default 7)
--vote                  Enable voting (brainstorm)
--dry-run               Show execution plan only
--resume                Resume from checkpoint
--explain               Include decision trace
--pipe <strategy>       Chain strategies (compose)
```

</details>

---

### x-build — Project Harness

Full project lifecycle with PRD generation, consensus review, acceptance contracts, and quality-gated execution.

```bash
/x-build init my-api
/x-build plan "Build a REST API with JWT auth"
# → PRD generated → quality gate → user/agent consensus review
/x-build tasks done-criteria    # Auto-derive "done" criteria from PRD
/x-build forecast               # Per-task cost estimate
/x-build run                    # Agents execute in DAG order with acceptance contracts
```

```
Research ──→ PRD ──→ Plan ──→ Execute ──→ Verify ──→ Close
 [auto]    [quality]  [consensus]  [contract]  [quality]  [auto]
                                      ↑            ↑
                               done_criteria   verify-contracts
```

| Feature | Description |
|---------|-------------|
| **PRD generation** | Auto-generates 8-section PRD from research artifacts |
| **PRD quality gate** | On-demand judge panel — user triggers when needed, scores with guidance |
| **Consensus review** | 4-agent review (architect, critic, planner, security) until agreement |
| **Team execution** | `--team` routes tasks to hierarchical teams (x-agent team system) |
| **Acceptance contracts** | `done_criteria` per task — auto-derived from PRD, injected into agent prompts, verified at close |
| **Auto-handoff** | `phase next` auto-saves structured state — decisions survive, noise is discarded |
| **Strategy-tagged tasks** | Tasks can specify x-op strategy + rubric for quality-verified execution |
| **DAG execution** | Tasks run in dependency order, parallel where possible |
| **Cost forecasting** | Per-task $ estimate before execution |
| **Quality dashboard** | Per-task scores + project average in status output |
| **Error recovery** | Auto-retry with exponential backoff, circuit breaker, git rollback |
| **plan-check (9 dims)** | atomicity, deps, coverage, granularity, completeness, context, naming, **tech-leakage**, overall |

<details>
<summary>All commands</summary>

| Category | Commands |
|----------|----------|
| **Project** | `init`, `list`, `status`, `close`, `dashboard` |
| **Phase** | `phase next/set`, `gate pass/fail`, `checkpoint`, `handoff` |
| **Plan** | `plan "goal"`, `plan-check [--strict]` |
| **Tasks** | `tasks add [--strategy] [--team] [--done-criteria]`, `tasks done-criteria`, `tasks list/remove/update` |
| **Steps** | `steps compute/status/next` |
| **Execute** | `run`, `run --json`, `run-status` |
| **Verify** | `quality`, `verify-coverage`, `verify-contracts` |
| **Analysis** | `forecast`, `metrics`, `decisions`, `summarize` |
| **Export** | `export --format md/csv/jira/confluence`, `import` |
| **Settings** | `mode developer/normal`, `config set/get/show` |

</details>

---

### x-humble — Structured Retrospective

Learn from failures together. Not a rule generator — the retrospective process itself is the value.

```bash
/x-humble reflect              # Full session retrospective
/x-humble review "why scaffold?"  # Deep-dive on specific decision
/x-humble lessons              # View accumulated lessons
/x-humble apply L3             # Apply lesson to CLAUDE.md
```

```
CHECK-IN ──→ RECALL ──→ IDENTIFY ──→ ANALYZE ──→ ALTERNATIVE ──→ COMMIT
[accountability]  [summary]  [failures]   [root cause]  [steelman]    [KEEP/STOP/START]
```

| Feature | Description |
|---------|-------------|
| **Phase 0 Check-In** | Verify previous COMMIT items before new retrospective |
| **Bias analysis** | 7 cognitive biases detected (anchoring, confirmation, sunk cost, ...) |
| **Cross-session patterns** | Recurring bias tags surfaced automatically |
| **Steelman Protocol** | User proposes alternative first, agent strengthens it |
| **Comfortable Challenger** | Agent challenges self-rationalization directly |
| **KEEP/STOP/START** | Lessons stored, optionally applied to CLAUDE.md |

---

### x-eval — Quality Evaluation

Multi-rubric scoring, strategy benchmarking, A/B comparison, and change measurement.

```bash
/x-eval score output.md --rubric code-quality     # Judge panel scoring
/x-eval compare old.md new.md --judges 5          # A/B comparison
/x-eval bench "Find bugs" --strategies "refine,debate,tournament"  # Benchmark
/x-eval diff --from abc1234 --quality              # Change measurement + quality delta
/x-eval rubric create strict --criteria "correctness,edge-cases"   # Custom rubric
```

| Command | What it does |
|---------|-------------|
| **score** | N judges score content against rubric (1-10, weighted avg, consensus σ) |
| **compare** | A/B comparison with position bias mitigation |
| **bench** | strategies × models × trials matrix with Score/$ optimization |
| **diff** | Git-based change analysis + optional before/after quality comparison |
| **rubric** | Create/list custom evaluation rubrics |
| **report** | Aggregated evaluation history |

**Built-in rubrics:** `code-quality`, `review-quality`, `plan-quality`, `general`
**Domain presets:** `api-design`, `frontend-design`, `data-pipeline`, `security-audit`, `architecture-review`
**Bias-aware judging:** High-confidence x-humble lessons (confirmed 3+) surfaced as optional judge context

---

### x-solver — Problem Solving

4 structured strategies with auto-recommendation.

```bash
/x-solver init "Memory leak in React component"
/x-solver classify          # Auto-recommend strategy
/x-solver solve             # Execute with agents
```

| Strategy | Pattern | Best for |
|----------|---------|----------|
| **decompose** | Break → solve leaves → merge | Complex multi-faceted problems |
| **iterate** | Hypothesis → test → refine loop | Bugs, debugging, root cause |
| **constrain** | Constraints → candidates → score → select | Design decisions, tradeoffs |
| **pipeline** | Auto-detect → route to best strategy | When unsure |

---

### x-agent — Agent Primitives & Teams

The foundation layer. Structured patterns on top of Claude Code's native Agent tool, plus hierarchical team management.

```bash
/x-agent fan-out "Find bugs in this code" --agents 5
/x-agent delegate security "Review src/auth.ts"
/x-agent broadcast "Review this PR" --roles "security,perf,logic"
/x-agent team create eng --template engineering
/x-agent team assign eng "Build payment system"
```

| Primitive | What it does |
|-----------|-------------|
| **fan-out** | Same prompt → N agents in parallel |
| **delegate** | One prompt → one specialized agent |
| **broadcast** | Different role/context → each agent |
| **team** | Hierarchical team: Director → Team Leader → Members |

**Team system**: Define teams as YAML (`.xm/teams/`), assign goals, Team Leaders (opus) autonomously manage members using primitives. 5 templates: `engineering`, `design`, `review`, `research`, `fullstack`.

Model auto-routing: `architect` → opus, `executor` → sonnet, `scanner` → haiku. Override with `--model`.

---

## Quality & Learning Pipeline

x-kit connects x-build, x-op, x-eval, and x-humble into a closed feedback loop:

```
x-build plan → PRD Quality Gate (7.0+) → Consensus Review (4 agents)
     ↓
x-build tasks done-criteria → Acceptance contracts from PRD
     ↓
x-op strategy --verify → Judge Panel (bias-aware) → Auto-retry
     ↓
x-eval score → Per-task quality tracking → Project quality dashboard
     ↓
x-build verify-contracts → Done criteria fulfillment check
     ↓
x-humble reflect → Root cause + bias analysis → KEEP/STOP/START lessons
     ↓
lessons → CLAUDE.md + x-eval judge context → Next session applies patterns
```

| Component | Mechanism |
|-----------|-----------|
| **Self-Score** | Every x-op strategy auto-scores against mapped rubric |
| **--verify loop** | Judge panel (bias-aware) → fail → feedback → re-execute (max 2) |
| **PRD consensus** | architect + critic + planner + security must agree |
| **Acceptance contracts** | `done_criteria` auto-derived from PRD → injected into agents → verified at close |
| **Auto-handoff** | Phase transitions preserve decisions, discard exploration noise |
| **plan-check (9 dims)** | Includes tech-leakage: warns on undeclared technology names |
| **Quality dashboard** | `x-build status` shows per-task scores + project avg |
| **Domain rubrics** | 5 presets (api-design, frontend, data-pipeline, security, architecture) |
| **Bias-aware judging** | x-humble lessons (confirmed 3+) inform judge context |
| **x-eval diff** | Measure how skills changed + quality delta |
| **x-humble reflect** | Structured retrospective with bias detection + pattern tracking |

---

## Shared Config

```bash
/x-kit config set agent_max_count 10              # 10 agents parallel
/x-kit config set team_default_leader_model opus  # Team Leader model
/x-kit config set team_max_members 5              # Max members per team
/x-kit config show
```

Settings stored in `.xm/config.json` (project-level).

---

## Architecture

```
x-kit/                              Marketplace repo
├── x-op/                           Strategy orchestration (18 strategies)
├── x-build/                        Project harness + PRD pipeline
├── x-eval/                         Quality evaluation + diff
├── x-humble/                       Structured retrospective
├── x-solver/                       Problem solving (4 strategies)
├── x-agent/                        Agent primitives
├── x-review/                       Code review orchestrator
├── x-trace/                        Execution tracing
├── x-memory/                       Cross-session memory
├── x-kit/                          Bundle (all skills) + shared config
└── .claude-plugin/marketplace.json  10 plugins registered
```

## Requirements

- Claude Code (Node.js >= 18 bundled)
- macOS, Linux, or Windows
- No external dependencies

## License

MIT © [x-mesh](https://github.com/x-mesh)
