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
| `x-kit version` | 설치된 플러그인 버전 + 최신 버전 비교 |
| `x-kit update` | 모든 x-kit 플러그인 일괄 업데이트 |
| `x-kit update <plugin>` | 특정 플러그인만 업데이트 (e.g. `x-kit update x-build`) |

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

1. First, sync the marketplace:
```bash
claude plugin marketplace update x-kit
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

## Shared Config

x-kit manages shared settings at `.xm/config.json` that all tools (x-build, x-solver, x-op) reference.

### Commands

| Command | Description |
|---------|-------------|
| `x-kit config show` | 현재 공유 설정 표시 |
| `x-kit config set <key> <value>` | 설정 변경 |
| `x-kit config get <key>` | 설정 값 조회 |

### Settings

| Key | Values | Default | Description |
|-----|--------|---------|-------------|
| `mode` | `developer`, `normal` | `developer` | 출력 스타일 (기술 용어 vs 쉬운 말) |
| `agent_max_count` | 숫자 (1-10) | `4` | 에이전트 병렬 실행 수 제어 |

### Config Resolution

각 도구는 아래 우선순위로 설정을 읽는다:
1. 도구별 로컬 config (`.xm/{tool}/config.json`)
2. 공유 config (`.xm/config.json`)
3. 기본값
