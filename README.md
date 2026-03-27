# x-kit

**Multi-agent toolkit for Claude Code** by [x-mesh](https://github.com/x-mesh).

Turn Claude Code into a structured project execution engine with 18 orchestration strategies, phase-based project management, and reusable agent primitives.

Zero dependencies. Claude Code native. Works everywhere.

## Install

```bash
# Add the marketplace
/plugin marketplace add x-mesh/x-kit

# Install everything (bundle)
/plugin install x-kit@x-kit -s user

# Or install individually
/plugin install x-agent@x-kit -s user   # Agent primitives
/plugin install x-build@x-kit -s user   # Project harness
/plugin install x-op@x-kit -s user      # Strategy orchestration
/plugin install x-solver@x-kit -s user  # Problem solving
```

## Quick Start

```bash
# Run a multi-agent strategy
/x-op debate "Monolith vs microservices"
/x-op review --target src/auth/
/x-op investigate "Why is latency spiking?" --depth deep

# Manage a project end-to-end
/x-build init my-api
/x-build plan "Build a REST API with JWT auth and PostgreSQL"
/x-build run

# Use agent primitives directly
/x-agent fan-out "Find bugs in src/" --agents 5
/x-agent delegate architect "Design the database schema" --model opus
```

---

## Plugins

### x-op — Strategy Orchestration

18 multi-agent strategies built on x-agent primitives.

```bash
/x-op refine "Payment API design" --rounds 4
/x-op tournament "Best login approach" --agents 6 --bracket double
/x-op debate "REST vs GraphQL"
/x-op hypothesis "Memory leak cause" --rounds 3
/x-op compose "brainstorm | tournament | refine" --topic "v2 plan"
```

| Category | Strategies |
|----------|-----------|
| **Collaboration** | refine, brainstorm, socratic |
| **Competition** | tournament, debate, council |
| **Pipeline** | chain, distribute, scaffold, compose, decompose |
| **Analysis** | review, red-team, persona, hypothesis, investigate |
| **Meta** | monitor, escalate |

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
--vote                  Enable voting (brainstorm)
--dry-run               Show execution plan only
--resume                Resume from checkpoint
--explain               Include decision trace
--pipe <strategy>       Chain strategies (compose)
--personas "a,b,c"      Persona roles
--bracket single|double Tournament bracket
--weights "role:N"      Council weighted voting
--start haiku|sonnet    Escalate start level
--verify                Enable verification round
```

</details>

---

### x-build — Project Harness

Full project lifecycle with DAG execution, cost forecasting, and decision memory.

```bash
/x-build init my-api
/x-build plan "Build a REST API with JWT auth"
/x-build forecast    # Per-task cost estimate
/x-build gate pass   # Human approval
/x-build run         # Agents execute in DAG order
```

```
Research ──→ Plan ──→ Execute ──→ Verify ──→ Close
 [auto]    [human]    [auto]    [quality]   [auto]
```

| Feature | Description |
|---------|-------------|
| **DAG execution** | Tasks run in dependency order, parallel where possible |
| **Cost forecasting** | Per-task $ estimate before execution |
| **Decision memory** | Architectural decisions auto-injected into agent context |
| **Error recovery** | Auto-retry with exponential backoff, circuit breaker, git rollback |
| **Quality gates** | Auto-detect npm test, pytest, go test, eslint |
| **Export** | CSV, Jira, Confluence, Markdown |
| **Normal mode** | Plain language output for non-developers |

<details>
<summary>All commands</summary>

| Category | Commands |
|----------|----------|
| **Project** | `init`, `list`, `status`, `close`, `dashboard` |
| **Phase** | `phase next/set`, `gate pass/fail`, `checkpoint` |
| **Tasks** | `tasks add/list/remove/update`, `templates list/use` |
| **Steps** | `steps compute/status/next` |
| **Execute** | `plan "goal"`, `run`, `run-status` |
| **Analysis** | `forecast`, `metrics`, `decisions`, `summarize` |
| **Export** | `export --format md/csv/jira/confluence`, `import` |
| **Settings** | `mode developer/normal`, `config set/get/show` |

</details>

---

### x-solver — Problem Solving

4 structured strategies with auto-recommendation.

```bash
/x-solver init "Memory leak in React component"
/x-solver classify          # Auto-recommend strategy
/x-solver strategy set iterate
/x-solver solve             # Execute with agents
```

| Strategy | Pattern | Best for |
|----------|---------|----------|
| **decompose** | Break → solve leaves → merge | Complex multi-faceted problems |
| **iterate** | Hypothesis → test → refine loop | Bugs, debugging, root cause |
| **constrain** | Constraints → candidates → score → select | Design decisions, tradeoffs |
| **pipeline** | Auto-detect → route to best strategy | When unsure |

---

### x-agent — Agent Primitives

The foundation layer. Structured patterns on top of Claude Code's native Agent tool.

```bash
/x-agent fan-out "Find bugs in this code" --agents 5
/x-agent delegate security "Review src/auth.ts"
/x-agent broadcast "Review this PR" --roles "security,perf,logic"
```

| Primitive | What it does |
|-----------|-------------|
| **fan-out** | Same prompt → N agents in parallel |
| **delegate** | One prompt → one specialized agent |
| **broadcast** | Different role/context → each agent |

Model auto-routing: `architect` → opus, `executor` → sonnet, `scanner` → haiku. Override with `--model`.

---

## Shared Config

Control agent parallelism across all x-kit tools:

```bash
/x-kit config set agent_max_count 10   # 10 agents parallel
/x-kit config set agent_max_count 4    # 4 agents (default)
/x-kit config show
```

Settings stored in `.xm/config.json` (project-level).

---

## Architecture

```
x-kit/                              Marketplace repo
├── .claude-plugin/
│   └── marketplace.json            9 plugins registered
├── x-agent/                        Agent primitives
│   └── skills/x-agent/SKILL.md
├── x-build/                        Project harness
│   ├── lib/x-build-cli.mjs        Single-file CLI (0 deps)
│   ├── skills/x-build/SKILL.md
│   └── templates/
├── x-op/                           Strategy orchestration
│   └── skills/x-op/SKILL.md       18 strategies
├── x-solver/                       Problem solving
│   ├── lib/x-solver-cli.mjs
│   └── skills/x-solver/SKILL.md
├── x-kit/                          Bundle + shared config
│   ├── lib/shared-config.mjs
│   └── skills/                     All skills bundled
├── x-review/                       Code review
├── x-trace/                        Execution tracing
├── x-memory/                       Decision memory
├── x-eval/                         Output evaluation
└── package.json
```

## Requirements

- Claude Code (Node.js >= 18 bundled)
- macOS, Linux, or Windows
- No external dependencies

## License

MIT © [x-mesh](https://github.com/x-mesh)
