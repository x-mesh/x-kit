---
name: x-kit
description: x-mesh toolkit — list available tools and their status
---

<Purpose>
Show available x-mesh tools and their installation status.
</Purpose>

<Use_When>
- User asks "what tools are available"
- User says "x-kit", "x-mesh tools"
</Use_When>

<Do_Not_Use_When>
- User wants a specific tool (use x-build or x-op directly)
</Do_Not_Use_When>

# x-kit — x-mesh Toolkit

## Model Routing

| Subcommand | Model | Reason |
|------------|-------|--------|
| `version`, `update`, `agents list/match/get` | **haiku** (Agent tool) | Read-only, no reasoning needed |
| `config show/set/get/reset` | **haiku** (Agent tool) | Simple command execution |
| `config` (interactive wizard) | main model | Requires AskUserQuestion |
| `pipeline list`, `validate` | **haiku** (Agent tool) | Read-only display |
| `pipeline <name>` | main model | Multi-step orchestration with AskUserQuestion |

For haiku-eligible commands, delegate via: `Agent tool: { model: "haiku", prompt: "Run: [command]" }`

## AskUserQuestion Dark-Theme Rule

**CRITICAL:** The `question` field in AskUserQuestion is invisible on dark terminals.

**Visibility map:**
| Element | Visible | Use for |
|---------|---------|---------|
| `header` | ✅ YES | Short context tag (e.g., "x-op bump", "Pipeline") |
| `question` | ❌ NO | Keep minimal — user cannot see this text |
| option `label` | ✅ YES | Primary info — must be self-explanatory |
| option `description` | ✅ YES | Supplementary detail |

**Always follow this pattern:**
1. Output ALL context (descriptions, status, analysis) as **regular markdown text** BEFORE calling AskUserQuestion
2. `header`: put the key context here (visible, max 12 chars)
3. `question`: keep short, duplicate of header is fine (invisible to user)
4. Option `label` + `description`: carry all decision-relevant information

**WRONG:** Putting context in `question` field → user sees blank space above options
**RIGHT:** Print context as markdown first, use `header` for tag, options for detail

Show available tools:

```
x-mesh Toolkit (x-kit)

Bundled tools (available now):
  /x-build    Phase-based project harness — lifecycle, DAG, cost forecasting
  /x-op       Strategy orchestration — refine, tournament, debate, review
  /x-agent    Agent primitives — fan-out, delegate, broadcast, collect
  /x-solver   Structured problem solving — decompose, iterate, constrain, pipeline

Pipeline:
  /x-kit pipeline <name>    Run a named plugin pipeline (release, full, etc.)
  /x-kit pipeline list      Show all pipelines (config + auto-discovered)
  /x-kit validate           Check Wiring DAG for cycles and errors

Install bundle:     /plugin install x-kit@x-kit
Install individual: /plugin install x-kit@x-build
```

## Version & Update

### Commands

| Command | Description |
|---------|-------------|
| `x-kit version` | Compare installed plugin versions with latest available versions |
| `x-kit update` | Batch update all x-kit plugins |
| `x-kit update <plugin>` | Update a specific plugin only (e.g. `x-kit update x-build`) |

### x-kit version

Run the following bash command to show version comparison:

```bash
node -e "
const fs = require('fs');
const path = require('path');

const INSTALLED_PATH = path.join(process.env.HOME, '.claude/plugins/installed_plugins.json');
const MARKETPLACE_DIR = path.join(process.env.HOME, '.claude/plugins/marketplaces/x-kit');
const MARKETPLACE_JSON = path.join(MARKETPLACE_DIR, '.claude-plugin/marketplace.json');

const installed = JSON.parse(fs.readFileSync(INSTALLED_PATH, 'utf8'));
const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_JSON, 'utf8'));

function semverCmp(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i]||0) > (pb[i]||0)) return 1;
    if ((pa[i]||0) < (pb[i]||0)) return -1;
  }
  return 0;
}

const available = {};
for (const p of marketplace.plugins) available[p.name] = p.version;

console.log('x-mesh Toolkit — Version Status\n');
console.log('  Plugin        Installed    Available    Status');
console.log('  ' + '─'.repeat(58));

const names = Object.keys(available).sort();
for (const name of names) {
  const key = name + '@x-kit';
  const entry = installed.plugins?.[key]?.[0];
  const inst = entry ? entry.version : '—';
  const avail = available[name];
  let status;
  if (!entry) status = '⬜ not installed';
  else if (inst === avail) status = '✅ latest';
  else if (semverCmp(inst, avail) > 0) status = '⚡ newer than available';
  else status = '🔄 update available';
  console.log('  ' + name.padEnd(14) + ' ' + inst.padEnd(12) + ' ' + avail.padEnd(12) + ' ' + status);
}
console.log();
"
```

Display the output to the user.

### x-kit update

**MANDATORY: Always execute steps 1→2→3 in order. Never skip step 1 even if you think versions are current — the marketplace is a git clone and must be pulled before any comparison.**

1. Pull latest from remote (MUST run — do not skip):
```bash
cd ~/.claude/plugins/marketplaces/x-kit && git pull origin main 2>&1
```

2. Then update plugins. If a specific plugin name is given (e.g. `x-kit update x-build`), update only that one:
```bash
claude plugin update <plugin>@x-kit -s user
```

If no specific plugin is given, update ALL installed x-kit plugins by reading `installed_plugins.json` and running update for each:
```bash
node -e "
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const INSTALLED_PATH = path.join(process.env.HOME, '.claude/plugins/installed_plugins.json');
const installed = JSON.parse(fs.readFileSync(INSTALLED_PATH, 'utf8'));

const xmPlugins = Object.keys(installed.plugins || {}).filter(k => k.endsWith('@x-kit'));
const validKey = /^[a-zA-Z0-9@._-]+$/;
console.log('Updating ' + xmPlugins.length + ' x-kit plugins...\n');

for (const key of xmPlugins) {
  if (!validKey.test(key)) { console.error('  ⚠ Skipped invalid key: ' + key); continue; }
  console.log('  → ' + key);
  try {
    spawnSync('claude', ['plugin', 'update', key, '-s', 'user'], { stdio: 'inherit' });
  } catch (e) {
    console.error('  ⚠ Failed: ' + key);
  }
}
console.log('\n✅ Update complete. Run /reload-plugins to activate.');
"
```

3. After update, remind the user: "Run `/reload-plugins` or restart Claude Code to activate."

## Cross-Plugin Pipeline

Standard data flow connecting x-build, x-op, and x-eval.

### Pipeline Flow

```
x-build plan → PRD → x-op strategy --verify → x-eval score → x-build tasks update --score
```

### Standard Payload Schema

Structure that the leader constructs internally when passing data between plugins:

```json
{
  "xkit_payload": {
    "version": 1,
    "source": "x-build|x-op|x-eval",
    "type": "prd|strategy-output|eval-result",
    "content": "markdown text",
    "metadata": {
      "project": "project-name",
      "strategy": "refine|null",
      "rubric": "general|code-quality|plan-quality|null",
      "score": 7.8,
      "timestamp": "ISO8601"
    }
  }
}
```

### Plugin Responsibilities

| Plugin | Produces | Consumes |
|--------|----------|----------|
| x-build | PRD, task list, project context | eval scores, strategy outputs |
| x-op | strategy output, self-score | PRD (as context), eval feedback |
| x-eval | rubric scores, judge feedback | strategy output, code output |

### Integration Points

| Trigger | From | To | Data |
|---------|------|----|------|
| `x-build plan` complete | x-build | x-op | PRD + task list |
| `x-op --verify` complete | x-op | x-eval | strategy output for scoring |
| score < threshold | x-eval | x-op | feedback for retry |
| task complete | x-op | x-build | score + output for task update |

## Pipeline

Automated plugin chaining via SKILL.md Wiring declarations + user-defined pipelines.

### Wiring Protocol

Each plugin can declare dependencies in its SKILL.md:

```markdown
## Wiring
after: x-build:verify       # auto-run after this plugin completes
suggests: x-humble           # suggest to user (default: N)
```

| Keyword | Meaning | On upstream failure |
|---------|---------|-------------------|
| `after` | Auto-run when upstream completes | **skip + warn** |
| `suggests` | Prompt user after completion | Show regardless |

### User Pipeline Override

Users can define named pipelines in `.xm/config.json`:

```json
{
  "pipelines": {
    "release": ["x-review", "x-ship"],
    "full": ["x-review", "x-eval", "x-ship", "x-humble"]
  }
}
```

**Rule: config pipeline overrides SKILL.md Wiring completely.** No merge.

### Commands

| Command | Description |
|---------|-------------|
| `x-kit pipeline <name>` | Execute a named pipeline |
| `x-kit pipeline list` | Show all defined pipelines |
| `x-kit pipeline <name> --auto` | Execute without confirmation prompts |
| `x-kit pipeline <name> --dry-run` | Preview execution plan |
| `x-kit validate` | Check DAG for cycles and unknown plugin references |

### Model Routing

| Subcommand | Model | Reason |
|------------|-------|--------|
| `pipeline list`, `validate` | **haiku** | Read-only display |
| `pipeline <name>` | main model | Multi-step orchestration with AskUserQuestion |

### Execution Modes

| Mode | Flag | Behavior |
|------|------|----------|
| **interactive** (default) | (none) | Confirm before each step: `[Y/n/skip]` |
| **auto** | `--auto` | Run all steps, stop only on failure |
| **dry-run** | `--dry-run` | Show plan without executing |

### pipeline <name>

1. Read `.xm/config.json` → check `pipelines.<name>`
   - If found → use that array as execution order
   - If not found → build DAG from all plugins' `## Wiring` sections (topological sort)
2. For each step:
   - **interactive**: Show step, execute, ask `"다음: {next} → 계속할까요? [Y/n/skip]"`
   - **auto**: Execute silently, halt on failure with `"❌ {plugin} 실패. 1) 재시도 2) 건너뛰기 3) 중단"`
3. After all steps, show `suggests` plugins: `"💡 {plugin} 실행을 추천합니다. 실행할까요? [y/N]"` (default N)

Output format:
```
📋 Pipeline: {name} ({N} steps)

[1/N] {plugin}
  ... (output) ...
  ✅ 완료

  다음: {next} → 계속할까요? [Y/n/skip]

[2/N] {plugin}
  ...

Pipeline complete — {passed}/{total} passed
💡 x-humble (회고) 실행을 추천합니다. 실행할까요? [y/N]
```

### pipeline list

Show all named pipelines from config + auto-discovered DAG:

```
📋 Pipelines

  Named (from .xm/config.json):
    release     x-review → x-ship (2 steps)
    full        x-review → x-eval → x-ship → x-humble (4 steps)

  Auto (from Wiring):
    x-build:verify → x-review → x-eval
                          └──→ x-ship → (suggests) x-humble
```

### validate

Parse all `*/skills/*/SKILL.md` files for `## Wiring` sections.
Check:
- No cycles in DAG (topological sort)
- All referenced plugin names exist
- No duplicate edges

Output: `✅ DAG valid — {N} nodes, {E} edges` or `❌ {error details}`

---

## Shared Config

x-kit manages shared settings at `.xm/config.json` that all tools (x-build, x-solver, x-op) reference.

### Commands

| Command | Description |
|---------|-------------|
| `x-kit config` | Interactive config wizard |
| `x-kit config show` | Show current settings (global + local + merged) |
| `x-kit config set <key> <value>` | Change a setting |
| `x-kit config get <key>` | Get a setting value |
| `x-kit config reset` | Reset config to defaults |

### Scope

Default: **global** (`~/.xm/config.json`). Use `--local` to write to project (`.xm/config.json`).

Exception: `budget` defaults to **local** (per-project budgets are more natural).

| Flag | Writes to |
|------|-----------|
| (default) | `~/.xm/config.json` |
| `--local` | `.xm/config.json` |
| `--global` | `~/.xm/config.json` (explicit) |

### Settings

| Key | Values | Default | Scope | Description |
|-----|--------|---------|-------|-------------|
| `mode` | `developer`, `normal` | `developer` | global | Output style |
| `model_profile` | `economy`, `balanced`, `performance` | `balanced` | global | Role→model mapping |
| `agent_max_count` | number (1-10) | `4` | global | Max parallel agents |
| `budget.max_usd` | number or null | `null` | local | Session budget limit ($) |
| `model_overrides` | `{"role": "model"}` | `{}` | global | Per-role model overrides on top of profile |

### Config Resolution

Settings are resolved in priority order:
1. Project-local (`.xm/config.json`)
2. Global (`~/.xm/config.json`)
3. Default values

### Interactive Config (`x-kit config` with no sub-command)

When `config` is called with no arguments, run an interactive wizard using AskUserQuestion.

**Step 1: Show current state**

Run via Bash:
```bash
node -e "import('${CLAUDE_PLUGIN_ROOT}/lib/shared-config.mjs').then(m => m.cmdConfig(['show']))"
```

**Step 2: Ask what to configure**

Use AskUserQuestion:
```
설정할 항목을 선택하세요:

1) 모델 프로필 — economy / balanced / performance
2) 예산 한도 — 세션당 최대 비용 ($)
3) 에이전트 수 — 병렬 에이전트 수 (1-10)
4) 모드 — developer / normal
5) 역할별 오버라이드 — 프로필 위에 개별 역할 모델 지정
0) 나가기
```

**Step 3: Execute based on choice**

| Choice | Action |
|--------|--------|
| 1 | AskUserQuestion: "1) economy (~60-90% 절감) 2) balanced (기본) 3) performance (최강)" → run `cmdConfig(['set', 'model_profile', selected])` |
| 2 | AskUserQuestion: "세션 예산 ($, 0=무제한):" → run `cmdConfig(['set', 'budget.max_usd', value], { local: true })` |
| 3 | AskUserQuestion: "에이전트 수 (1-10):" → run `cmdConfig(['set', 'agent_max_count', value])` |
| 4 | AskUserQuestion: "1) developer 2) normal" → run `cmdConfig(['set', 'mode', selected])` |
| 5 | AskUserQuestion: "형식: role=model (예: architect=opus), done으로 종료" → loop: run `cmdConfig(['set', 'model_overrides', JSON.stringify(overrides)])` |
| 0 | Exit |

After each setting change, show the updated value and ask "다른 설정도 변경할까요? (y/n)". If y, return to Step 2.

### CLI Config (`x-kit config set/get/show/reset`)

Run directly via Bash:
```bash
node -e "import('${CLAUDE_PLUGIN_ROOT}/lib/shared-config.mjs').then(m => m.cmdConfig(['show']))"
node -e "import('${CLAUDE_PLUGIN_ROOT}/lib/shared-config.mjs').then(m => m.cmdConfig(['set', 'KEY', 'VALUE']))"
node -e "import('${CLAUDE_PLUGIN_ROOT}/lib/shared-config.mjs').then(m => m.cmdConfig(['get', 'KEY']))"
node -e "import('${CLAUDE_PLUGIN_ROOT}/lib/shared-config.mjs').then(m => m.cmdConfig(['reset']))"
```

For `--local` scope, pass flags: `m.cmdConfig(['set', 'KEY', 'VALUE'], { local: true })`

## Agent Catalog

x-kit includes a catalog of 37 specialist agents at `x-kit/agents/`. These provide domain expertise for broadcast/fan-out operations across all x-kit tools.

### Commands

| Command | Description |
|---------|-------------|
| `x-kit agents list` | List all available specialist agents |
| `x-kit agents match "<topic>"` | Find best agents for a topic (auto-selects by tag/keyword matching) |
| `x-kit agents get <name>` | Show a specialist agent's full rules |
| `x-kit agents get <name> --slim` | Show the slim version (~30 lines) |

### CLI

```bash
node ${CLAUDE_PLUGIN_ROOT}/lib/agent-catalog.mjs list
node ${CLAUDE_PLUGIN_ROOT}/lib/agent-catalog.mjs match "결제 API 설계" --count 5
node ${CLAUDE_PLUGIN_ROOT}/lib/agent-catalog.mjs get security --slim
```

### How Plugins Use It

| Plugin | Usage |
|--------|-------|
| **x-op** | refine/brainstorm/persona broadcast — auto-select specialists per topic |
| **x-review** | `--specialists` flag enhances lens prompts with domain expertise |
| **x-solver** | decompose/constrain fan-out — inject relevant specialists |
| **x-build** | research phase — select domain experts for investigation |

### Structure

```
x-kit/agents/
  catalog.json       ← Index: name, description, tags per agent
  rules/             ← Full agent rules (~240 lines each)
  slim/              ← Slim versions (~30 lines each, for prompt injection)
```
