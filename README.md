# xm-kit

**Agent toolkit for Claude Code** by [x-mesh](https://github.com/x-mesh).

A modular collection of AI-powered development tools that turn Claude Code into a structured project execution engine. Install everything at once, or pick what you need.

Zero external dependencies. Claude Code native. Works on macOS, Linux, and Windows.

## Why xm-kit?

AI coding assistants are powerful but chaotic. They lose context mid-project, can't estimate costs, forget past decisions, and have no structured way to recover from failures.

xm-kit fixes this with three layers:

```
┌─────────────────────────────────────────────┐
│  xm-build    Project lifecycle & execution  │
│  xm-op       Strategy orchestration         │
├─────────────────────────────────────────────┤
│  xm-agent    Agent primitives               │
│              fan-out · delegate · broadcast  │
├─────────────────────────────────────────────┤
│  Claude Code  Agent tool · SendMessage      │
└─────────────────────────────────────────────┘
```

- **xm-agent** — Reusable agent primitives (fan-out, delegate, broadcast)
- **xm-op** — 9 multi-agent strategies built on xm-agent
- **xm-build** — Full project lifecycle built on xm-agent

## Install

```bash
# Add the marketplace
/plugin marketplace add x-mesh/xm-kit

# Install everything
/plugin install xm-kit@xm-kit

# Or install individually
/plugin install xm-kit@xm-agent    # Agent primitives
/plugin install xm-kit@xm-build    # Project harness
/plugin install xm-kit@xm-op       # Strategy orchestration
```

## Quick Start

```bash
# Start a project, describe what you want
/xm-build init my-api
/xm-build plan "Build a REST API with JWT auth, PostgreSQL, and Docker"

# Review cost, approve
/xm-build forecast
/xm-build gate pass

# Agents execute in dependency order
/xm-build run

# Or use agents directly
/xm-agent fan-out "Find bugs in src/auth.ts" --agents 5
/xm-agent delegate architect "Design the database schema" --model opus

# Or run a strategy
/xm-op debate "Monolith vs microservices"
```

---

## xm-agent — Agent Primitives

The foundation layer. Structured patterns on top of Claude Code's native Agent tool.

```bash
/xm-agent fan-out "Find bugs in this code" --agents 5       # Same prompt to N agents
/xm-agent delegate security "Review src/auth.ts"             # One agent, specific role
/xm-agent broadcast "Review this PR" --roles "security,perf,logic"  # Different roles
/xm-agent status                                              # Active agents
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
/xm-agent fan-out "Find problems in src/auth.ts" --agents 3

# 2. Synthesize (delegate)
/xm-agent delegate architect "Synthesize findings and design a fix" --model opus

# 3. Review (broadcast)
/xm-agent broadcast "Review this design" --roles "security,performance,testing"
```

---

## xm-op — Strategy Orchestration

9 proven multi-agent strategies. All built on xm-agent primitives.

```bash
/xm-op refine "Payment API design" --rounds 4
/xm-op tournament "Best login implementation" --agents 4
/xm-op debate "Monolith vs microservices"
/xm-op review --target src/auth.ts
/xm-op red-team --target src/api/
```

### Strategies

| Strategy | Pattern | Best for |
|----------|---------|----------|
| **refine** | Diverge → converge → verify | Iterating on a design |
| **tournament** | Compete → anonymous vote → winner | Picking the best solution |
| **chain** | A → B → C sequential pipeline | Multi-step analysis |
| **review** | Parallel multi-perspective | Code review |
| **debate** | Pro vs Con + Judge → verdict | Trade-off decisions |
| **red-team** | Attack → defend → re-attack | Security hardening |
| **brainstorm** | Free ideation → cluster → vote | Feature exploration |
| **distribute** | Split → parallel → merge | Large parallel tasks |
| **council** | Free discussion → cross-examine → consensus | Complex multi-stakeholder decisions |

### Options

```
--rounds N              Round count (default 4)
--preset quick|thorough|deep
--agents N              Number of agents (default 3)
--model sonnet|opus     Agent model
--target <file>         Review/red-team target
--vote                  Enable voting (brainstorm)
--steps "a:t,b:t"       Chain steps
--roles "a,b"           Broadcast roles
--context / --no-context  Context injection
```

### Examples

```bash
/xm-op refine "Payment API design" --rounds 4
/xm-op tournament "Login implementation" --agents 5
/xm-op chain "Security audit" --steps "explorer:scan,security:analyze,architect:recommend"
/xm-op review --target src/payments/
/xm-op debate "REST vs GraphQL" --rounds 2
/xm-op red-team --target src/auth.ts
/xm-op brainstorm "v2 features" --vote
/xm-op distribute "Fix 6 Sentry issues" --agents 3
/xm-op council "Migration strategy" --rounds 4 --agenda "DB choice,API design,Deploy plan"
```

---

## xm-build — Project Harness

Full project lifecycle management with DAG execution, cost forecasting, and decision memory.

```bash
/xm-build init my-api
/xm-build plan "Build a REST API with JWT auth"
/xm-build gate pass
/xm-build run
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

Tasks declare dependencies. xm-build computes parallel groups:

```
Step 1 (parallel):  DB schema  +  Auth middleware      ← no deps
Step 2 (parallel):  API routes +  WebSocket handler    ← depends on Step 1
Step 3:             Integration tests                   ← depends on Step 2
```

### Cost Forecasting

```
/xm-build forecast

💰 Cost Forecast (model: sonnet)
  t1: DB schema            small    sonnet   $0.207
  t2: API routes           large    opus     $16.200
  t3: Auth middleware       medium   sonnet   $0.810
  ──────────────────────────────────────────────────
  Total                                      $17.217
```

### Decision Memory

```bash
/xm-build decisions add "Use PostgreSQL" --type architecture --rationale "ACID compliance"
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
/xm-build export --format csv          # Google Sheets / Excel
/xm-build export --format jira         # Jira bulk issue JSON
/xm-build export --format confluence   # Wiki markup
/xm-build export --format md           # Markdown report
/xm-build import tasks.csv --from csv
```

### Normal Mode

Plain language for non-developers:

```
/xm-build mode normal

📋 프로젝트: my-api
  ✅ 조사하기 완료!
  🔵 계획 세우기 [직접 확인] 지금 하는 중 ← 여기
  ⬜ 실행하기 아직 안 함
```

### Task Templates

```
/xm-build templates list

  📋 add-auth       (medium)  Add Authentication
  📋 setup-ci       (small)   Setup CI/CD
  📋 add-tests      (medium)  Add Test Suite
  📋 add-docker     (small)   Add Docker Support
  📋 db-migration   (medium)  Database Migration
  🔬 tech-compare             Technology Comparison
  🔬 security-audit           Security Audit
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
| **Settings** | `mode developer/normal`, `quality`, `watch`, `alias install` |

---

## Coming Soon

| Tool | Description |
|------|-------------|
| **xm-handoff** | Structured session handoff — context, decisions, and progress preserved across sessions |
| **xm-solve** | Structured problem solving — root cause analysis, solution generation, verification |

---

## What Makes xm-kit Different

Compared to 8 competitive tools (GSD, Cursor, Windsurf, Aider, Codex, Taskmaster, Devin, Claude Code built-in):

| Capability | xm-kit | Others (0/8) |
|-----------|--------|-------------|
| Persistent decision memory | ✅ auto-inject to agents | ❌ |
| Pre-task cost forecasting | ✅ per-task $ estimate | ❌ |
| Circuit breaker on failures | ✅ auto-pause + cooldown | ❌ |
| Phase-aware context loading | ✅ 76% token reduction | ❌ |
| Non-developer mode | ✅ plain language | ❌ |
| Structured agent primitives | ✅ fan-out/delegate/broadcast | ❌ |
| 9 multi-agent strategies | ✅ refine to council | ❌ |
| Zero dependencies | ✅ Node.js stdlib only | varies |

## Architecture

```
xm-kit/                                ← Marketplace repo
├── .claude-plugin/
│   └── marketplace.json                4 plugins registered
├── xm-agent/                           Agent primitives
│   ├── .claude-plugin/plugin.json
│   └── skills/xm-agent/SKILL.md       fan-out, delegate, broadcast
├── xm-build/                           Project harness
│   ├── .claude-plugin/plugin.json
│   ├── lib/xm-build-cli.mjs           Single-file CLI (0 deps)
│   ├── skills/xm-build/SKILL.md
│   ├── hooks/                          Statusline
│   ├── templates/                      Task & research templates
│   └── scripts/setup.mjs
├── xm-op/                              Strategy orchestration
│   ├── .claude-plugin/plugin.json
│   └── skills/xm-op/SKILL.md          9 strategies
├── xm-kit/                             Meta-package
│   ├── .claude-plugin/plugin.json
│   └── skills/xm-kit/SKILL.md
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
