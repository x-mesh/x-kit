# x-kit

**Agent toolkit for Claude Code** by [x-mesh](https://github.com/x-mesh).

A modular collection of AI-powered development tools that turn Claude Code into a structured project execution engine. Install everything at once, or pick what you need.

Zero external dependencies. Claude Code native. Works on macOS, Linux, and Windows.

## Why x-kit?

AI coding assistants are powerful but chaotic. They lose context mid-project, can't estimate costs, forget past decisions, and have no structured way to recover from failures.

x-kit fixes this with four layers:

```
┌─────────────────────────────────────────────┐
│  x-build    Project lifecycle & execution  │
│  x-solver   Structured problem solving     │
│  x-op       Strategy orchestration         │
├─────────────────────────────────────────────┤
│  x-agent    Agent primitives               │
│              fan-out · delegate · broadcast  │
├─────────────────────────────────────────────┤
│  Claude Code  Agent tool · SendMessage      │
└─────────────────────────────────────────────┘
```

- **x-agent** — Reusable agent primitives (fan-out, delegate, broadcast)
- **x-op** — 16 multi-agent strategies built on x-agent
- **x-solver** — 4 solving strategies (decompose, iterate, constrain, pipeline) with auto-recommendation
- **x-build** — Full project lifecycle built on x-agent

## Install

```bash
# Add the marketplace
/plugin marketplace add x-mesh/x-kit

# Install everything
/plugin install x-kit@x-kit

# Or install individually
/plugin install x-kit@x-agent    # Agent primitives
/plugin install x-kit@x-build    # Project harness
/plugin install x-kit@x-op       # Strategy orchestration
/plugin install x-kit@x-solver   # Problem solving
```

## Quick Start

```bash
# Start a project, describe what you want
/x-build init my-api
/x-build plan "Build a REST API with JWT auth, PostgreSQL, and Docker"

# Review cost, approve
/x-build forecast
/x-build gate pass

# Agents execute in dependency order
/x-build run

# Or use agents directly
/x-agent fan-out "Find bugs in src/auth.ts" --agents 5
/x-agent delegate architect "Design the database schema" --model opus

# Or run a strategy
/x-op debate "Monolith vs microservices"
```

---

## x-agent — Agent Primitives

The foundation layer. Structured patterns on top of Claude Code's native Agent tool.

```bash
/x-agent fan-out "Find bugs in this code" --agents 5       # Same prompt to N agents
/x-agent delegate security "Review src/auth.ts"             # One agent, specific role
/x-agent broadcast "Review this PR" --roles "security,perf,logic"  # Different roles
/x-agent status                                              # Active agents
```

### Primitives

| Primitive | What it does | Execution |
|-----------|-------------|-----------|
| **fan-out** | Same prompt → N agents in parallel | Background, collect all |
| **delegate** | One prompt → one agent with a role | Foreground, immediate result |
| **broadcast** | Different role/context → each agent | Background, collect all |
| **status** | Show running background agents | Instant |

### Model Auto-Routing

| Role keyword | Model |
|-------------|-------|
| architect, analyst, critic, planner | opus |
| executor, builder, fixer, tester | sonnet |
| explorer, scanner, linter | haiku |

Override with `--model opus|sonnet|haiku`.

### Pipeline Composition

Chain primitives for custom workflows:

```bash
# 1. Analyze (fan-out)
/x-agent fan-out "Find problems in src/auth.ts" --agents 3

# 2. Synthesize (delegate)
/x-agent delegate architect "Synthesize findings and design a fix" --model opus

# 3. Review (broadcast)
/x-agent broadcast "Review this design" --roles "security,performance,testing"
```

---

## x-op — Strategy Orchestration

16 multi-agent strategies. All built on x-agent primitives.

```bash
/x-op refine "Payment API design" --rounds 4
/x-op tournament "Best login implementation" --agents 4 --bracket double
/x-op debate "Monolith vs microservices"
/x-op hypothesis "Why is latency spiking?" --rounds 3
/x-op escalate "Summarize this codebase" --start haiku
```

### Strategies

| Strategy | Pattern | Best for |
|----------|---------|----------|
| **refine** | Diverge → converge → verify | Iterating on a design |
| **tournament** | Compete → seed → bracket → winner | Picking the best solution |
| **chain** | A → B → C with conditional branching | Multi-step analysis |
| **review** | Parallel multi-perspective | Code review |
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
| **hypothesis** | Generate → falsify → adopt | Bug diagnosis, decisions |
| **escalate** | haiku → sonnet → opus auto | Cost optimization |

### Options

```
--rounds N              Round count (default 4)
--preset quick|thorough|deep
--agents N              Number of agents (default: agent_max_count)
--model sonnet|opus     Agent model
--target <file>         Review/red-team target
--vote                  Enable voting (brainstorm)
--dry-run               Show execution plan only
--resume                Resume from checkpoint
--explain               Include decision trace
--pipe <strategy>       Chain strategies (compose)
--personas "a,b,c"      Persona roles
--bracket single|double Tournament bracket
--weights "role:N"      Council weighted voting
--start haiku|sonnet    Escalate start level
```

### Examples

```bash
/x-op refine "Payment API design" --rounds 4
/x-op tournament "Login implementation" --agents 5 --bracket double
/x-op chain "Security audit" --steps "explorer:scan,security:analyze,architect:recommend"
/x-op review --target src/payments/
/x-op debate "REST vs GraphQL" --rounds 2
/x-op brainstorm "v2 features" --vote
/x-op socratic "Why microservices?" --rounds 4
/x-op persona "Auth redesign" --personas "engineer,security,pm"
/x-op scaffold "Plugin system" --agents 4
/x-op compose "brainstorm | tournament | refine" --topic "v2 plan"
/x-op hypothesis "Memory leak cause" --rounds 3
/x-op escalate "Summarize codebase" --start haiku
/x-op refine "API design" --dry-run
```

---

## x-solver — Problem Solving

Structured problem solving with 4 strategies: decompose, iterate, constrain, and auto-pipeline.

```bash
/x-solver init "Memory leak in React component"
/x-solver classify                    # Auto-recommend strategy
/x-solver strategy set iterate        # Or choose manually
/x-solver solve                       # Execute strategy with agents
/x-solver verify                      # Check solution against constraints
```

| Strategy | Description | Best For |
|----------|-------------|----------|
| `decompose` | Tree-of-Thought: break → solve → merge | Complex multi-faceted problems |
| `iterate` | Hypothesis → Test → Refine loop | Bugs, debugging, root cause |
| `constrain` | Constraints → Candidates → Score → Select | Design decisions, tradeoffs |
| `pipeline` | Auto-detect type → Route to best strategy | When unsure |

---

## x-build — Project Harness

Full project lifecycle management with DAG execution, cost forecasting, and decision memory.

```bash
/x-build init my-api
/x-build plan "Build a REST API with JWT auth"
/x-build gate pass
/x-build run
```

### Phase Lifecycle

```
  Research ──→ Plan ──→ Execute ──→ Verify ──→ Close
   [auto]    [human]    [auto]    [quality]   [auto]
```

| Phase | What happens | Gate |
|-------|-------------|------|
| **Research** | Explore codebase, gather context | auto |
| **Plan** | Define tasks, compute steps, estimate cost | human-verify |
| **Execute** | Agents run tasks in DAG order | auto |
| **Verify** | Auto-run tests, lint, build | quality |
| **Close** | Generate summary, export | auto |

### DAG Step Execution

Tasks declare dependencies. x-build computes parallel groups:

```
Step 1 (parallel):  DB schema  +  Auth middleware      ← no deps
Step 2 (parallel):  API routes +  WebSocket handler    ← depends on Step 1
Step 3:             Integration tests                   ← depends on Step 2
```

### Cost Forecasting

```
/x-build forecast

💰 Cost Forecast (model: sonnet)
  t1: DB schema            small    sonnet   $0.207
  t2: API routes           large    opus     $16.200
  t3: Auth middleware       medium   sonnet   $0.810
  ──────────────────────────────────────────────────
  Total                                      $17.217
```

### Decision Memory

```bash
/x-build decisions add "Use PostgreSQL" --type architecture --rationale "ACID compliance"
```

Decisions are automatically injected into agent context when running tasks.

### Error Recovery

- **Auto-retry**: Exponential backoff (2s → 4s → 8s, max 3 attempts)
- **Circuit breaker**: 3 consecutive failures → step paused → cooldown → probe
- **Git rollback**: Failed tasks auto-stash + reset to last good commit

### Quality Gates

Auto-detects and runs your project's tools:

| Detected | Runs |
|----------|------|
| package.json test script | `npm test` |
| pytest.ini / pyproject.toml | `pytest` |
| go.mod | `go test ./...` |
| ESLint config | `npx eslint .` |
| Build script | `npm run build` / `go build` |

### Export & Import

```bash
/x-build export --format csv          # Google Sheets / Excel
/x-build export --format jira         # Jira bulk issue JSON
/x-build export --format confluence   # Wiki markup
/x-build export --format md           # Markdown report
/x-build import tasks.csv --from csv
```

### Normal Mode

Plain language for non-developers:

```
/x-build mode normal

📋 프로젝트: my-api
  ✅ 조사하기 완료!
  🔵 계획 세우기 [직접 확인] 지금 하는 중 ← 여기
  ⬜ 실행하기 아직 안 함
```

### Task Templates

```
/x-build templates list

  📋 add-auth       (medium)  Add Authentication
  📋 setup-ci       (small)   Setup CI/CD
  📋 add-tests      (medium)  Add Test Suite
  📋 add-docker     (small)   Add Docker Support
  📋 db-migration   (medium)  Database Migration
  🔬 tech-compare             Technology Comparison
  🔬 security-audit           Security Audit
```

### Shared Config

Control agent parallelism across all x-kit tools:

```bash
/x-kit config set agent_max_count 10  # 10 agents parallel
/x-kit config set agent_max_count 4   # 4 agents (default)
/x-kit config set agent_max_count 2   # 2 agents, token-saving
/x-kit config show                   # View current settings
```

### All Commands

| Category | Commands |
|----------|----------|
| **Project** | `init`, `list`, `status`, `close`, `dashboard` |
| **Phase** | `phase next/set`, `gate pass/fail`, `checkpoint` |
| **Tasks** | `tasks add/list/remove/update`, `templates list/use` |
| **Steps** | `steps compute/status/next` |
| **Execute** | `plan "goal"`, `run`, `run-status` |
| **Analysis** | `forecast`, `metrics`, `decisions`, `summarize` |
| **Export** | `export --format md/csv/jira/confluence`, `import` |
| **Settings** | `mode developer/normal`, `config set/get/show`, `quality`, `watch`, `alias install` |

---

## Coming Soon

| Tool | Description |
|------|-------------|
| **x-handoff** | Structured session handoff — context, decisions, and progress preserved across sessions |

---

## What Makes x-kit Different

Compared to 8 competitive tools (GSD, Cursor, Windsurf, Aider, Codex, Taskmaster, Devin, Claude Code built-in):

| Capability | x-kit | Others (0/8) |
|-----------|--------|-------------|
| Persistent decision memory | ✅ auto-inject to agents | ❌ |
| Pre-task cost forecasting | ✅ per-task $ estimate | ❌ |
| Circuit breaker on failures | ✅ auto-pause + cooldown | ❌ |
| Phase-aware context loading | ✅ 76% token reduction | ❌ |
| Non-developer mode | ✅ plain language | ❌ |
| Structured agent primitives | ✅ fan-out/delegate/broadcast | ❌ |
| 16 multi-agent strategies | ✅ refine to escalate | ❌ |
| Zero dependencies | ✅ Node.js stdlib only | varies |

## Architecture

```
x-kit/                                ← Marketplace repo
├── .claude-plugin/
│   └── marketplace.json                4 plugins registered
├── x-agent/                           Agent primitives
│   ├── .claude-plugin/plugin.json
│   └── skills/x-agent/SKILL.md       fan-out, delegate, broadcast
├── x-build/                           Project harness
│   ├── .claude-plugin/plugin.json
│   ├── lib/x-build-cli.mjs           Single-file CLI (0 deps)
│   ├── skills/x-build/SKILL.md
│   ├── hooks/                          Statusline
│   ├── templates/                      Task & research templates
│   └── scripts/setup.mjs
├── x-op/                              Strategy orchestration
│   ├── .claude-plugin/plugin.json
│   └── skills/x-op/SKILL.md          16 strategies
├── x-kit/                             Meta-package + shared config
│   ├── .claude-plugin/plugin.json
│   ├── lib/shared-config.mjs           Shared config utilities
│   └── skills/x-kit/SKILL.md
├── package.json
├── README.md
└── LICENSE (MIT)
```

## Requirements

- Claude Code (Node.js ≥ 18 bundled)
- macOS, Linux, or Windows
- No external dependencies

## License

MIT © [x-mesh](https://github.com/x-mesh)
