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

Show available tools:

```
x-mesh Toolkit (x-kit)

Bundled tools (available now):
  /x-build    Phase-based project harness — lifecycle, DAG, cost forecasting
  /x-op       Strategy orchestration — refine, tournament, debate, review
  /x-agent    Agent primitives — fan-out, delegate, broadcast, collect
  /x-solver   Structured problem solving — decompose, iterate, constrain, pipeline

Coming soon:
  /x-handoff  Session handoff between agents

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

1. First, pull latest from remote (marketplace is a git clone):
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

## Shared Config

x-kit manages shared settings at `.xm/config.json` that all tools (x-build, x-solver, x-op) reference.

### Commands

| Command | Description |
|---------|-------------|
| `x-kit config show` | Show current shared settings |
| `x-kit config set <key> <value>` | Change a setting |
| `x-kit config get <key>` | Get a setting value |

### Settings

| Key | Values | Default | Description |
|-----|--------|---------|-------------|
| `mode` | `developer`, `normal` | `developer` | Output style (technical terms vs plain language) |
| `agent_max_count` | number (1-10) | `4` | Max parallel agent execution count |
| `team_default_leader_model` | `opus`, `sonnet` | `opus` | Default model for Team Leader |
| `team_max_members` | number (1-10) | `5` | Max members per team |

### Config Resolution

Each tool reads settings in the following priority order:
1. Tool-specific local config (`.xm/{tool}/config.json`)
2. Shared config (`.xm/config.json`)
3. Default values
