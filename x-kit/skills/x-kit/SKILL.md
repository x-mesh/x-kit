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

## First-Run Init Check

**Before executing any x-kit subcommand** (except `init` itself), verify the project is initialized:

1. Check `test -f .claude/hooks/trace-session.mjs` in the current working directory.
2. If **missing**, pause the requested command and prompt via AskUserQuestion:
   - header: `x-kit init`
   - option 1 label: `Yes (권장)` — description: `hooks + settings + x-sync client 설치`
   - option 2 label: `Skip sync` — description: `hooks + settings만, x-sync 제외`
   - option 3 label: `No` — description: `이번만 건너뛰기`
3. Before the AskUserQuestion, print:
   ```
   ⚠ x-kit이 이 프로젝트에 초기화되지 않았습니다.
     설치 항목: trace hook, block-marketplace hook, .claude/settings.json, x-sync client
   ```
4. On **Yes** → run `x-kit init`. On **Skip sync** → run `x-kit init --skip-sync`. On **No** → proceed with the original command without init (do not re-prompt this session).
5. After init completes, resume the originally requested subcommand.

Skip this check when the user explicitly invokes `x-kit init`, `x-kit doctor`, or passes `--no-init-check`.

For a fuller picture (not just trace-session.mjs), suggest `x-kit doctor` — but the fast `test -f` check is sufficient as the entry gate.

## Model Routing

| Subcommand | Model | Reason |
|------------|-------|--------|
| `version`, `update`, `agents list/match/get` | **haiku** (Agent tool) | Read-only, no reasoning needed |
| `config show/set/get/reset` | **haiku** (Agent tool) | Simple command execution |
| `config` (interactive wizard) | **sonnet** | Requires AskUserQuestion |
| `pipeline list`, `validate` | **haiku** (Agent tool) | Read-only display |
| `pipeline <name>` | **sonnet** | Multi-step orchestration with AskUserQuestion |

For haiku-eligible commands, delegate via: `Agent tool: { model: "haiku", prompt: "Run: [command]" }`

### Model Guardrail

Before delegating to haiku, verify the task is display/query only. If ANY of the following apply, use sonnet or higher — never haiku:

| Signal | Example | Why |
|--------|---------|-----|
| Produces analysis or recommendations | code review, plan critique, risk assessment | Reasoning quality degrades |
| Generates or modifies code | implement feature, fix bug, refactor | Edge case handling (NaN, negative, boundary) drops significantly |
| Multi-step orchestration | strategy execution, pipeline run | Loses coherence across steps |
| Evaluates quality | x-eval scoring, x-probe validation | Calibration requires stronger model |

If a haiku-eligible command receives `--thorough` or similar depth flags, escalate to sonnet.

**Scope:** This guardrail applies to top-level command routing only. Sub-agents spawned by the leader inherit the leader's model context and do not require a separate routing check.

**Violation output:** If the leader detects a reasoning task routed to haiku (e.g., via user override or misconfigured pipeline), prepend this warning to the output:
```
⚠️ Model mismatch: this task requires reasoning but is running on haiku.
   Results may miss edge cases. Re-run without --model haiku for full quality.
```

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

## Cost

### Commands

| Command | Description |
|---------|-------------|
| `x-kit cost` | Show accumulated cost from metrics ledger |
| `x-kit cost --session` | Show cost for current session only |

### x-kit cost

Read `.xm/build/metrics/sessions.jsonl` and aggregate `cost_usd` fields:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const mp = path.join(process.cwd(), '.xm/build/metrics/sessions.jsonl');
if (!fs.existsSync(mp)) { console.log('No metrics data yet.'); process.exit(0); }
const lines = fs.readFileSync(mp, 'utf8').trim().split('\n').filter(Boolean);
let total = 0; const byType = {}; const byModel = {};
for (const line of lines) {
  try {
    const m = JSON.parse(line);
    if (typeof m.cost_usd === 'number') {
      total += m.cost_usd;
      byType[m.type] = (byType[m.type] || 0) + m.cost_usd;
      if (m.model) byModel[m.model] = (byModel[m.model] || 0) + m.cost_usd;
    }
  } catch {}
}
console.log('💰 x-kit Cost Summary\n');
console.log('  Total: \$' + total.toFixed(4));
console.log('\n  By type:');
for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log('    ' + k.padEnd(20) + '\$' + v.toFixed(4));
}
if (Object.keys(byModel).length) {
  console.log('\n  By model:');
  for (const [k, v] of Object.entries(byModel).sort((a, b) => b[1] - a[1])) {
    console.log('    ' + k.padEnd(12) + '\$' + v.toFixed(4));
  }
}
"
```

## Init

### Commands

| Command | Description |
|---------|-------------|
| `x-kit init` | Install hooks + settings into `.claude/` and install x-sync client |
| `x-kit init --dry-run` | Preview all changes without writing anything |
| `x-kit init --skip-sync` | Install only hooks + settings, skip x-sync |
| `x-kit init --with-server` | Also install x-sync server (requires Bun) |
| `x-kit init --rollback` | Restore `.claude/settings.json` from the most recent backup |

### Status Labels

All install steps emit one of these labels per item for consistent feedback:

| Label | Meaning |
|-------|---------|
| `➕ installed` | New item written |
| `🔄 updated` | Existing item replaced with newer content |
| `✅ already installed` | Content matches, no change |
| `⏭️ skipped` | User flag skipped this step |
| `🔍 would install/update` | Dry-run preview only |

### x-kit init

**Dry-run mode** (`--dry-run`): Execute steps 1-3 in preview mode — compute diffs, do NOT write files, do NOT run curl. Print `🔍 would <action>` lines and the full diff for settings.json. Exit with `📋 Dry run complete. Re-run without --dry-run to apply.`

**Normal mode**: Run steps 1-2 (hooks + settings, with auto-backup) → step 3 (x-sync client, unless `--skip-sync`) → step 4 if `--with-server`.

**Step 0: Backup settings.json** (normal mode only, before any write)

Before touching `.claude/settings.json`, copy it to `.claude/settings.json.backup-{ISO8601}`. Skip if the file doesn't exist. Keep only the 5 most recent backups (prune oldest).

**Step 1-2 implementation:**

Pass `DRY_RUN=1` env when `--dry-run` is active.

```bash
DRY_RUN="${DRY_RUN:-0}" node -e "
const fs = require('fs');
const path = require('path');

const DRY = process.env.DRY_RUN === '1';
const MARKETPLACE = path.join(process.env.HOME, '.claude/plugins/marketplaces/x-kit');
const PROJECT = process.cwd();

// Step 0: Backup settings.json (skip in dry-run)
const settingsPath = path.join(PROJECT, '.claude/settings.json');
if (!DRY && fs.existsSync(settingsPath)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = settingsPath + '.backup-' + stamp;
  fs.copyFileSync(settingsPath, backupPath);
  console.log('  💾 backup → ' + path.basename(backupPath));

  // Prune to 5 most recent backups
  const dir = path.dirname(settingsPath);
  const backups = fs.readdirSync(dir)
    .filter(f => f.startsWith('settings.json.backup-'))
    .sort()
    .reverse();
  for (const old of backups.slice(5)) {
    fs.unlinkSync(path.join(dir, old));
    console.log('  🗑  pruned ' + old);
  }
}

// Step 1: Copy hooks
const hooksDir = path.join(PROJECT, '.claude/hooks');
if (!DRY) fs.mkdirSync(hooksDir, { recursive: true });

const hookFiles = ['trace-session.mjs', 'block-marketplace-copy.mjs'];
for (const f of hookFiles) {
  const src = path.join(MARKETPLACE, '.claude/hooks', f);
  const dst = path.join(hooksDir, f);
  if (!fs.existsSync(src)) continue;
  const srcContent = fs.readFileSync(src, 'utf8');
  const exists = fs.existsSync(dst);
  const dstContent = exists ? fs.readFileSync(dst, 'utf8') : '';
  if (srcContent === dstContent) {
    console.log('  ✅ already installed  ' + f);
  } else if (DRY) {
    console.log('  🔍 would ' + (exists ? 'update' : 'install') + '    ' + f);
  } else {
    fs.writeFileSync(dst, srcContent);
    console.log('  ' + (exists ? '🔄 updated           ' : '➕ installed         ') + f);
  }
}

// Step 2: Merge hook entries into settings.json
const srcSettingsPath = path.join(MARKETPLACE, '.claude/settings.json');
if (fs.existsSync(srcSettingsPath)) {
  const srcSettings = JSON.parse(fs.readFileSync(srcSettingsPath, 'utf8'));
  let dstSettings = {};
  if (fs.existsSync(settingsPath)) {
    try { dstSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}
  }

  const before = JSON.stringify(dstSettings, null, 2);
  const srcHooks = srcSettings.hooks || {};
  if (!dstSettings.hooks) dstSettings.hooks = {};

  for (const [phase, entries] of Object.entries(srcHooks)) {
    if (!dstSettings.hooks[phase]) dstSettings.hooks[phase] = [];
    for (const entry of entries) {
      const present = dstSettings.hooks[phase].some(
        e => e.matcher === entry.matcher && JSON.stringify(e.hooks) === JSON.stringify(entry.hooks)
      );
      if (present) {
        console.log('  ✅ already installed  settings.json[' + phase + '] ' + entry.matcher);
      } else {
        dstSettings.hooks[phase].push(entry);
        console.log('  ' + (DRY ? '🔍 would add         ' : '➕ added             ') + 'settings.json[' + phase + '] ' + entry.matcher);
      }
    }
  }

  const after = JSON.stringify(dstSettings, null, 2);
  if (DRY && before !== after) {
    console.log('\n  --- settings.json diff (preview) ---');
    console.log(after);
    console.log('  ---');
  } else if (!DRY && before !== after) {
    fs.writeFileSync(settingsPath, after + '\n');
  }
} else {
  console.log('  ⚠ No source settings.json found in marketplace');
}

console.log(DRY ? '\n📋 Dry run complete. Re-run without --dry-run to apply.' : '\n✅ Hooks and settings installed.');
"
```

**Step 3: Install x-sync client** (skip if user passed `--skip-sync`)

First check if already installed: `command -v x-sync >/dev/null 2>&1 && x-sync --version 2>/dev/null`. If present, print `⬜ x-sync (already installed)` and move on.

Otherwise run:

```bash
curl -fsSL https://raw.githubusercontent.com/x-mesh/x-kit/main/x-sync/install.sh | bash -s client
```

After install, remind the user:
```
💡 Run `x-sync setup` to configure server URL and API key.
   Ensure $HOME/.local/bin is in your PATH.
```

**Step 4: Install x-sync server** (only when `--with-server` is passed)

```bash
curl -fsSL https://raw.githubusercontent.com/x-mesh/x-kit/main/x-sync/install.sh | bash -s server
```

Display the output of each step to the user. Final line: `✅ x-kit init complete.` (or the dry-run message).

**Step 3 dry-run:** Check `command -v x-sync` — if present, print `✅ already installed  x-sync`. Otherwise print `🔍 would install     x-sync client (curl ... | bash -s client)`. Do NOT execute curl.

### x-kit init --rollback

Restore `.claude/settings.json` from the most recent backup.

```bash
node -e "
const fs = require('fs');
const path = require('path');

const dir = path.join(process.cwd(), '.claude');
const settingsPath = path.join(dir, 'settings.json');
if (!fs.existsSync(dir)) { console.log('⚠ No .claude directory.'); process.exit(1); }

const backups = fs.readdirSync(dir)
  .filter(f => f.startsWith('settings.json.backup-'))
  .sort()
  .reverse();

if (backups.length === 0) { console.log('⚠ No backup found.'); process.exit(1); }

const latest = backups[0];
fs.copyFileSync(path.join(dir, latest), settingsPath);
console.log('✅ Restored settings.json from ' + latest);
console.log('  Remaining backups: ' + backups.length);
"
```

## Doctor

Unified diagnostic — check every piece of x-kit's install footprint in one pass.

### Commands

| Command | Description |
|---------|-------------|
| `x-kit doctor` | Report status of hooks, settings, x-sync, PATH, and Bun |
| `x-kit doctor --fix` | Automatically fix whatever is safe to fix (re-run init for missing hooks/settings; prompt before network install) |

### Status symbols

| Symbol | Meaning |
|--------|---------|
| `✅` | OK |
| `⚠️` | Degraded — works but suboptimal (e.g., hook out of date, PATH missing) |
| `❌` | Broken — feature unavailable |
| `⏭️` | Not applicable (e.g., server-only check when not installing server) |

### x-kit doctor

```bash
FIX="${FIX:-0}" node -e "
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FIX = process.env.FIX === '1';
const MARKETPLACE = path.join(process.env.HOME, '.claude/plugins/marketplaces/x-kit');
const PROJECT = process.cwd();
const results = [];

function check(name, fn) {
  try { results.push({ name, ...fn() }); }
  catch (e) { results.push({ name, status: '❌', detail: e.message }); }
}

// 1. Hooks present and up to date
check('hooks/trace-session.mjs', () => {
  const src = path.join(MARKETPLACE, '.claude/hooks/trace-session.mjs');
  const dst = path.join(PROJECT, '.claude/hooks/trace-session.mjs');
  if (!fs.existsSync(dst)) return { status: '❌', detail: 'missing — run x-kit init', fixable: true };
  if (fs.existsSync(src) && fs.readFileSync(src,'utf8') !== fs.readFileSync(dst,'utf8'))
    return { status: '⚠️', detail: 'out of date', fixable: true };
  return { status: '✅', detail: 'installed' };
});

check('hooks/block-marketplace-copy.mjs', () => {
  const src = path.join(MARKETPLACE, '.claude/hooks/block-marketplace-copy.mjs');
  const dst = path.join(PROJECT, '.claude/hooks/block-marketplace-copy.mjs');
  if (!fs.existsSync(dst)) return { status: '❌', detail: 'missing — run x-kit init', fixable: true };
  if (fs.existsSync(src) && fs.readFileSync(src,'utf8') !== fs.readFileSync(dst,'utf8'))
    return { status: '⚠️', detail: 'out of date', fixable: true };
  return { status: '✅', detail: 'installed' };
});

// 2. settings.json has hook entries
check('.claude/settings.json', () => {
  const p = path.join(PROJECT, '.claude/settings.json');
  if (!fs.existsSync(p)) return { status: '❌', detail: 'missing', fixable: true };
  const s = JSON.parse(fs.readFileSync(p,'utf8'));
  const srcP = path.join(MARKETPLACE, '.claude/settings.json');
  if (!fs.existsSync(srcP)) return { status: '⚠️', detail: 'marketplace has no reference' };
  const srcHooks = (JSON.parse(fs.readFileSync(srcP,'utf8')).hooks) || {};
  const dstHooks = s.hooks || {};
  let missing = 0, total = 0;
  for (const [phase, entries] of Object.entries(srcHooks)) {
    for (const e of entries) {
      total++;
      const present = (dstHooks[phase] || []).some(d =>
        d.matcher === e.matcher && JSON.stringify(d.hooks) === JSON.stringify(e.hooks)
      );
      if (!present) missing++;
    }
  }
  if (missing > 0) return { status: '⚠️', detail: missing + '/' + total + ' hook entries missing', fixable: true };
  return { status: '✅', detail: total + ' hook entries registered' };
});

// 3. x-sync client installed
check('x-sync client', () => {
  try {
    execSync('command -v x-sync', { stdio: 'pipe' });
    return { status: '✅', detail: 'found in PATH' };
  } catch {
    return { status: '⚠️', detail: 'not installed — run x-kit init (network required)', networkFix: true };
  }
});

// 4. PATH includes ~/.local/bin
check('PATH: ~/.local/bin', () => {
  const binDir = path.join(process.env.HOME, '.local/bin');
  const parts = (process.env.PATH || '').split(path.delimiter);
  if (parts.includes(binDir)) return { status: '✅', detail: 'present' };
  return { status: '⚠️', detail: 'add export PATH=\"' + binDir + ':\$PATH\" to your shell profile' };
});

// 5. Bun (optional, server only)
check('Bun (optional, server)', () => {
  try {
    const v = execSync('bun --version', { stdio: 'pipe' }).toString().trim();
    return { status: '✅', detail: v };
  } catch {
    return { status: '⏭️', detail: 'not installed — only needed for x-sync server' };
  }
});

// Report
console.log('🩺 x-kit doctor\n');
for (const r of results) {
  console.log('  ' + r.status + ' ' + r.name.padEnd(36) + ' ' + (r.detail || ''));
}

// Summary
const counts = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
console.log('\n  Summary: ' + Object.entries(counts).map(([k,v]) => v + k).join(' · '));

// Fix
if (FIX) {
  const localFixes = results.filter(r => r.fixable && (r.status === '❌' || r.status === '⚠️'));
  const networkFixes = results.filter(r => r.networkFix);
  if (localFixes.length > 0) {
    console.log('\n🔧 Re-running init for: ' + localFixes.map(r => r.name).join(', '));
    // Delegate to init (leader invokes 'x-kit init' separately — doctor only flags them)
    console.log('   → run: x-kit init');
  }
  if (networkFixes.length > 0) {
    console.log('\n🌐 Network install required for: ' + networkFixes.map(r => r.name).join(', '));
    console.log('   → run: x-kit init  (will curl x-sync install.sh)');
  }
  if (localFixes.length === 0 && networkFixes.length === 0) {
    console.log('\n✅ Nothing to fix.');
  }
}

process.exit(results.some(r => r.status === '❌') ? 1 : 0);
"
```

**`--fix` behavior:**
1. Leader runs doctor first to collect findings
2. For **local fixes** (hooks out of date, settings missing entries): automatically run `x-kit init` — safe, no network
3. For **network fixes** (x-sync missing): use AskUserQuestion to confirm before running `x-kit init` (which does curl). Header: `x-sync install`, options: `Install now` / `Skip`
4. After fixes, re-run doctor to verify — expect all ✅/⏭️

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

4. After plugins are updated, check if hooks need updating too:
```
💡 Hooks may have changed. Run `x-kit init` to update hooks and settings.
```

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

See the [Model Routing](#model-routing) table at the top of this file for `pipeline list`, `pipeline validate`, and `pipeline <name>` model assignments.

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

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll write my own config parser" | x-kit's shared config exists for cross-plugin consistency. Duplicating it creates drift that sync-bundle can't catch and that users can't debug. |
| "I'll guess the cost, close enough" | Cost estimates are cheap; surprise bills are expensive. Use the cost engine — it's one call. |
| "Model routing is overengineering" | Model routing is ~78% savings on haiku-eligible commands. That's math, not engineering. |
| "This doesn't need a DAG, tasks are trivial" | DAGs make dependencies explicit. Trivial tasks with implicit dependencies are how parallel runs silently serialize on shared state. |
| "The model guardrail will catch wrong routing" | The guardrail is a safety net, not a planner. Use it for defense in depth, not as your first line of thinking. |
| "I don't need to read shared config, defaults are fine" | Defaults are fine in isolation. Cross-plugin coordination requires reading the actual config — otherwise plugins disagree about state. |
| "Agent catalog is a nice-to-have" | The catalog is how agent rules get discovered across sessions. Without it, every new agent spawn starts from scratch. |
