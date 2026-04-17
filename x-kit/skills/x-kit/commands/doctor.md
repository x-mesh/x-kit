# x-kit doctor

Unified diagnostic — check every piece of x-kit's install footprint in one pass.

## Commands

| Command | Description |
|---------|-------------|
| `x-kit doctor` | Report status of hooks, settings, x-sync, PATH, and Bun |
| `x-kit doctor --fix` | Automatically fix whatever is safe to fix (re-run init for missing hooks/settings; prompt before network install) |

## Status symbols

| Symbol | Meaning |
|--------|---------|
| `✅` | OK |
| `⚠️` | Degraded — works but suboptimal (e.g., hook out of date, PATH missing) |
| `❌` | Broken — feature unavailable |
| `⏭️` | Not applicable (e.g., server-only check when not installing server) |

## x-kit doctor

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
  // This hook is x-kit-repo-specific — intentionally omitted from per-project installs.
  // Only report presence inside the x-kit repo itself; everywhere else, mark as not applicable.
  const inXKitRepo = fs.existsSync(path.join(PROJECT, '.claude-plugin/marketplace.json'));
  const src = path.join(MARKETPLACE, '.claude/hooks/block-marketplace-copy.mjs');
  const dst = path.join(PROJECT, '.claude/hooks/block-marketplace-copy.mjs');
  if (!inXKitRepo) return { status: '⏭️', detail: 'x-kit-repo-only — expected to be absent in user projects' };
  if (!fs.existsSync(dst)) return { status: '❌', detail: 'missing in x-kit repo — restore from marketplace', fixable: false };
  if (fs.existsSync(src) && fs.readFileSync(src,'utf8') !== fs.readFileSync(dst,'utf8'))
    return { status: '⚠️', detail: 'out of date', fixable: false };
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
