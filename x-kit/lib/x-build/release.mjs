/**
 * x-build/release — Release automation CLI
 *
 * Subcommands:
 *   detect       — Detect changed plugins, classify commits, recommend bump
 *   diff-report  — Per-commit diff summary for LLM squash grouping
 *   squash       — Squash WIP commits since last release
 *   bump         — Bump versions in all JSON files + sync-bundle + test
 *   test         — Auto-detect and run project tests
 *   commit       — git add + commit + push
 *   trace        — Record release metrics to .xm/traces/
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

// ── Constants ─────────────────────────────────────────────────────────

const WIP_PATTERNS = [
  /^tm\(/,                     // term-mesh test
  /\[COMPLETED\]/,             // auto completion marker
  /^wip[:\s]/i,                // WIP prefix
  /^fixup!/,                   // git fixup
  /^squash!/,                  // git squash
  /^temp[:\s]/i,               // temporary commit
];

const PLUGIN_DIRS = [
  'x-build', 'x-agent', 'x-op', 'x-solver', 'x-review',
  'x-trace', 'x-memory', 'x-eval', 'x-probe', 'x-humble',
  'x-dashboard', 'x-kit', 'x-sync', 'x-ship',
];

// ── Helpers ───────────────────────────────────────────────────────────

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function parseOptions(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        opts[key] = args[++i];
      } else {
        opts[key] = true;
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { opts, positional };
}

function isWipCommit(msg) {
  return WIP_PATTERNS.some(p => p.test(msg));
}

function findLastRelease() {
  try {
    const line = git('log --oneline --grep="^release:" -1');
    if (!line) return null;
    const hash = line.split(' ')[0];
    const msg = line.slice(hash.length + 1);
    return { hash, msg };
  } catch { return null; }
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function bumpVersion(version, type) {
  const parts = version.split('.').map(Number);
  if (type === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0; }
  else if (type === 'minor') { parts[0]; parts[1]++; parts[2] = 0; }
  else { parts[2]++; }
  return parts.join('.');
}

function mapFileToPlugin(filepath) {
  for (const dir of PLUGIN_DIRS) {
    if (filepath.startsWith(dir + '/')) return dir;
  }
  return null;
}

function detectProjectType(cwd) {
  if (existsSync(join(cwd, '.claude-plugin', 'marketplace.json'))) return 'x-kit-marketplace';
  if (existsSync(join(cwd, 'Cargo.toml'))) return 'rust';
  if (existsSync(join(cwd, 'go.mod'))) return 'go';
  if (existsSync(join(cwd, 'pyproject.toml'))) return 'python';
  if (existsSync(join(cwd, 'package.json'))) return 'node';
  return 'generic';
}

function detectTestCommand(cwd) {
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bunfig.toml'))) return 'bun test';
  if (existsSync(join(cwd, 'package.json'))) {
    try {
      const pkg = readJSON(join(cwd, 'package.json'));
      if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') return 'npm test';
    } catch {}
  }
  if (existsSync(join(cwd, 'Cargo.toml'))) return 'cargo test';
  if (existsSync(join(cwd, 'go.mod'))) return 'go test ./...';
  if (existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'setup.py'))) return 'pytest';
  try {
    const mf = readFileSync(join(cwd, 'Makefile'), 'utf8');
    if (/^test:/m.test(mf)) return 'make test';
  } catch {}
  return null;
}

function getVersionFile(cwd, projectType) {
  switch (projectType) {
    case 'node': return { path: join(cwd, 'package.json'), type: 'json', key: 'version' };
    case 'rust': return { path: join(cwd, 'Cargo.toml'), type: 'toml', key: 'version' };
    case 'python': return { path: join(cwd, 'pyproject.toml'), type: 'toml', key: 'version' };
    case 'go': return { path: null, type: 'git-tag' };
    default: return { path: null, type: 'git-tag' };
  }
}

// ── cmdReleaseDetect ──────────────────────────────────────────────────

export function cmdReleaseDetect(args) {
  const cwd = process.cwd();
  const lastRelease = findLastRelease();
  const projectType = detectProjectType(cwd);
  const testCommand = detectTestCommand(cwd);

  // Changed files since last release
  let changedFiles = [];
  try {
    const ref = lastRelease ? lastRelease.hash : 'HEAD~20';
    changedFiles = git(`diff --name-only ${ref}..HEAD`).split('\n').filter(Boolean);
  } catch {}

  // Also include uncommitted
  try {
    const uncommitted = git('diff --name-only').split('\n').filter(Boolean);
    const staged = git('diff --cached --name-only').split('\n').filter(Boolean);
    changedFiles = [...new Set([...changedFiles, ...uncommitted, ...staged])];
  } catch {}

  // Map to plugins
  const pluginChanges = {};
  for (const f of changedFiles) {
    const plugin = mapFileToPlugin(f);
    if (plugin) {
      if (!pluginChanges[plugin]) pluginChanges[plugin] = [];
      pluginChanges[plugin].push(f);
    }
  }

  // Current versions from marketplace.json
  const marketplacePath = join(cwd, '.claude-plugin', 'marketplace.json');
  const marketplace = readJSON(marketplacePath);
  const versions = {};
  for (const p of marketplace.plugins) versions[p.name] = p.version;

  // Classify commits
  const commits = { work: [], wip: [] };
  try {
    const ref = lastRelease ? lastRelease.hash : 'HEAD~20';
    const lines = git(`log --oneline ${ref}..HEAD`).split('\n').filter(Boolean);
    for (const line of lines) {
      const hash = line.split(' ')[0];
      const msg = line.slice(hash.length + 1);
      if (isWipCommit(msg)) {
        commits.wip.push({ hash, msg });
      } else {
        commits.work.push({ hash, msg });
      }
    }
  } catch {}

  // Changed plugins with versions
  const changed = Object.entries(pluginChanges)
    .filter(([name]) => name !== 'x-kit') // x-kit is meta-bumped
    .map(([name, files]) => ({ name, current: versions[name] || '?', files }));

  const unchanged = PLUGIN_DIRS.filter(d => !pluginChanges[d] && versions[d]);

  // Standalone version detection
  let currentVersion = null;
  if (projectType !== 'x-kit-marketplace') {
    const vf = getVersionFile(cwd, projectType);
    if (vf.type === 'json' && vf.path && existsSync(vf.path)) {
      try { currentVersion = readJSON(vf.path).version; } catch {}
    } else if (vf.type === 'toml' && vf.path && existsSync(vf.path)) {
      try {
        const content = readFileSync(vf.path, 'utf8');
        const m = content.match(/^version\s*=\s*"([^"]+)"/m);
        if (m) currentVersion = m[1];
      } catch {}
    } else if (vf.type === 'git-tag') {
      try { currentVersion = git('describe --tags --abbrev=0 2>/dev/null'); } catch {}
    }
  }

  const output = {
    last_release: lastRelease,
    project_type: projectType,
    test_command: testCommand,
    current_version: currentVersion,
    changed_plugins: changed,
    unchanged_plugins: unchanged,
    commits,
    recommendation: {
      bump: 'patch',
      squash: commits.wip.length > 0,
      squash_count: commits.wip.length,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

// ── cmdReleaseSquash ──────────────────────────────────────────────────

export function cmdReleaseSquash(args) {
  const { opts } = parseOptions(args);
  const lastRelease = findLastRelease();
  const ref = opts.since || (lastRelease ? lastRelease.hash : null);

  if (!ref) {
    console.error('❌ No release reference found. Use --since <ref>.');
    process.exit(1);
  }

  // Count commits to squash
  const commitCount = git(`rev-list --count ${ref}..HEAD`);
  if (parseInt(commitCount) <= 1) {
    console.log('✅ Only 1 or 0 commits since last release. Nothing to squash.');
    return;
  }

  // Soft reset to last release — keeps all changes staged
  execSync(`git reset --soft ${ref}`, { stdio: 'inherit' });
  console.log(`✅ Squashed ${commitCount} commits (soft reset to ${ref.slice(0, 7)})`);
  console.log('   All changes are staged. Ready for release commit.');
}

// ── cmdReleaseBump ────────────────────────────────────────────────────

export function cmdReleaseBump(args) {
  const { opts } = parseOptions(args);
  const cwd = process.cwd();

  const bumpType = opts.patch ? 'patch' : opts.minor ? 'minor' : opts.major ? 'major' : 'patch';
  const pluginList = opts.plugins ? opts.plugins.split(',').map(s => s.trim()) : [];

  // Standalone mode
  if (opts.standalone || !pluginList.length) {
    const projectType = detectProjectType(cwd);
    if (projectType !== 'x-kit-marketplace') {
      const result = bumpStandalone(cwd, bumpType);
      if (result) {
        console.log(`\n✅ Version bump complete:\n`);
        console.log(`  ${result.name.padEnd(14)} ${result.from} → ${result.to}${result.tag ? ` (tag: ${result.tag})` : ''}`);
        if (result.tag) {
          console.log(`\n  Run: git tag ${result.tag} after committing`);
        }
      } else {
        console.error('❌ Could not detect version file.');
      }
      return;
    }
    if (!pluginList.length) {
      console.error('❌ No plugins specified. Use --plugins x-build,x-dashboard or --standalone');
      process.exit(1);
    }
  }

  const marketplacePath = join(cwd, '.claude-plugin', 'marketplace.json');
  const marketplace = readJSON(marketplacePath);

  const bumped = [];

  for (const pluginName of pluginList) {
    // 1. Plugin's own plugin.json
    const pluginJsonPath = join(cwd, pluginName, '.claude-plugin', 'plugin.json');
    if (existsSync(pluginJsonPath)) {
      const pj = readJSON(pluginJsonPath);
      const oldV = pj.version;
      pj.version = bumpVersion(oldV, bumpType);
      writeJSON(pluginJsonPath, pj);
      bumped.push({ name: pluginName, from: oldV, to: pj.version });
    }

    // 2. marketplace.json entry
    const entry = marketplace.plugins.find(p => p.name === pluginName);
    if (entry) {
      entry.version = bumpVersion(entry.version, bumpType);
    }
  }

  // 3. x-kit meta bump (always patch)
  const xkitEntry = marketplace.plugins.find(p => p.name === 'x-kit');
  const xkitPluginJsonPath = join(cwd, 'x-kit', '.claude-plugin', 'plugin.json');
  let xkitOld = xkitEntry?.version || '0.0.0';
  let xkitNew = bumpVersion(xkitOld, 'patch');

  if (xkitEntry) xkitEntry.version = xkitNew;
  if (existsSync(xkitPluginJsonPath)) {
    const xkitPj = readJSON(xkitPluginJsonPath);
    xkitPj.version = xkitNew;
    writeJSON(xkitPluginJsonPath, xkitPj);
  }
  bumped.push({ name: 'x-kit', from: xkitOld, to: xkitNew, meta: true });

  // 4. Write marketplace.json
  writeJSON(marketplacePath, marketplace);

  // 5. package.json root version = x-kit version
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = readJSON(pkgPath);
    pkg.version = xkitNew;
    writeJSON(pkgPath, pkg);
  }

  // 6. sync-bundle
  const syncScript = join(cwd, 'scripts', 'sync-bundle.sh');
  if (existsSync(syncScript)) {
    console.log('\n🔄 Running sync-bundle...');
    execSync(`bash ${syncScript}`, { stdio: 'inherit' });
  }

  // 7. Run tests
  console.log('\n🧪 Running tests...');
  try {
    execSync('bun test test/core-unit.test.mjs', { stdio: 'inherit', timeout: 120000 });
  } catch {
    console.error('❌ Tests failed. Fix before releasing.');
    process.exit(1);
  }

  // Output summary
  console.log('\n✅ Version bump complete:\n');
  for (const b of bumped) {
    console.log(`  ${b.name.padEnd(14)} ${b.from} → ${b.to}${b.meta ? ' (meta)' : ''}`);
  }
}

// ── cmdReleaseCommit ──────────────────────────────────────────────────

export function cmdReleaseCommit(args) {
  const { opts } = parseOptions(args);
  const msg = opts.msg || opts.message;

  if (!msg) {
    console.error('❌ No commit message. Use --msg "release: ..."');
    process.exit(1);
  }

  // Stage all relevant files
  const patterns = [
    '.claude-plugin/',
    'package.json',
    ...PLUGIN_DIRS.map(d => `${d}/.claude-plugin/`),
    ...PLUGIN_DIRS.map(d => `${d}/lib/`),
    ...PLUGIN_DIRS.map(d => `${d}/skills/`),
    ...PLUGIN_DIRS.map(d => `${d}/public/`),
    'x-kit/lib/',
    'x-kit/agents/',
    'scripts/',
    'test/',
  ];

  // Add all tracked changes
  try {
    execSync('git add -u', { stdio: 'inherit' });
  } catch {}

  // Commit — use -F <file> to preserve real newlines (JSON.stringify -m escapes \n as literal)
  const msgFile = `/tmp/xbuild-commit-${process.pid}-${Date.now()}.msg`;
  writeFileSync(msgFile, msg, 'utf8');
  try {
    execSync(`git commit -F ${JSON.stringify(msgFile)}`, { stdio: 'inherit' });
  } catch (e) {
    console.error('❌ Commit failed.');
    try { unlinkSync(msgFile); } catch {}
    process.exit(1);
  }
  try { unlinkSync(msgFile); } catch {}

  const hash = git('rev-parse --short HEAD');
  const branch = git('branch --show-current');
  console.log(`\n✅ Committed: ${hash}`);

  // Push if requested
  if (opts.push) {
    console.log(`\n🚀 Pushing to origin/${branch}...`);
    try {
      execSync(`git push origin ${branch}`, { stdio: 'inherit' });
      console.log(`✅ Pushed to origin/${branch}`);
    } catch {
      console.error(`⚠ Push failed. Run manually: git push origin ${branch}`);
    }
  }
}

// ── cmdReleaseDiffReport ──────────────────────────────────────────────

export function cmdReleaseDiffReport(args) {
  const { opts } = parseOptions(args);
  const lastRelease = findLastRelease();
  const ref = opts.since || (lastRelease ? lastRelease.hash : 'HEAD~20');

  let commitHashes = [];
  try {
    commitHashes = git(`log --format=%H ${ref}..HEAD --reverse`).split('\n').filter(Boolean);
  } catch { }

  const commits = [];
  for (const hash of commitHashes) {
    const msg = git(`log --format=%s -1 ${hash}`);
    let files = [], stat = '';
    try {
      files = git(`diff --name-only ${hash}~1..${hash}`).split('\n').filter(Boolean);
    } catch {
      files = git(`diff-tree --no-commit-id --name-only -r ${hash}`).split('\n').filter(Boolean);
    }
    try {
      stat = git(`diff --shortstat ${hash}~1..${hash}`).trim();
    } catch {}

    const hasExportChange = files.some(f => {
      if (!f.match(/\.(mjs|js|ts|mts)$/)) return false;
      try {
        const diff = git(`diff ${hash}~1..${hash} -- "${f}"`);
        return /^[+-]export\s/m.test(diff);
      } catch { return false; }
    });

    const hasTestChange = files.some(f => /test|spec|__tests__/i.test(f));

    commits.push({
      hash: hash.slice(0, 7),
      msg,
      files,
      stat,
      has_export_change: hasExportChange,
      has_test_change: hasTestChange,
      is_wip: isWipCommit(msg),
    });
  }

  // Find file overlap between commits
  const fileOverlap = [];
  for (let i = 0; i < commits.length; i++) {
    for (let j = i + 1; j < commits.length; j++) {
      const shared = commits[i].files.filter(f => commits[j].files.includes(f));
      if (shared.length > 0) {
        fileOverlap.push([commits[i].hash, commits[j].hash, shared]);
      }
    }
  }

  console.log(JSON.stringify({ commits, file_overlap: fileOverlap }, null, 2));
}

// ── cmdReleaseTest ────────────────────────────────────────────────────

export function cmdReleaseTest(args) {
  const { opts } = parseOptions(args);
  const cwd = process.cwd();
  const command = opts.command || detectTestCommand(cwd);

  if (!command) {
    console.log(JSON.stringify({ passed: null, command: null, summary: 'No test command detected' }));
    return;
  }

  console.error(`🧪 Running: ${command}`);
  try {
    const output = execSync(command, { encoding: 'utf8', timeout: 300000, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = output.trim().split('\n');
    const summary = lines.slice(-3).join(' | ').trim();
    console.log(JSON.stringify({ passed: true, command, summary }));
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '');
    const lines = output.trim().split('\n');
    const summary = lines.slice(-3).join(' | ').trim();
    console.log(JSON.stringify({ passed: false, command, summary }));
  }
}

// ── cmdReleaseBumpStandalone ──────────────────────────────────────────

function bumpStandalone(cwd, bumpType) {
  const projectType = detectProjectType(cwd);
  const vf = getVersionFile(cwd, projectType);

  if (vf.type === 'json' && vf.path && existsSync(vf.path)) {
    const data = readJSON(vf.path);
    const oldV = data.version;
    data.version = bumpVersion(oldV, bumpType);
    writeJSON(vf.path, data);
    return { name: projectType, from: oldV, to: data.version };
  }

  if (vf.type === 'toml' && vf.path && existsSync(vf.path)) {
    let content = readFileSync(vf.path, 'utf8');
    const m = content.match(/^(version\s*=\s*")([^"]+)(")/m);
    if (m) {
      const oldV = m[2];
      const newV = bumpVersion(oldV, bumpType);
      content = content.replace(m[0], m[1] + newV + m[3]);
      writeFileSync(vf.path, content, 'utf8');
      return { name: projectType, from: oldV, to: newV };
    }
  }

  if (vf.type === 'git-tag') {
    let oldV = '0.0.0';
    try { oldV = git('describe --tags --abbrev=0').replace(/^v/, ''); } catch {}
    const newV = bumpVersion(oldV, bumpType);
    return { name: projectType, from: oldV, to: newV, tag: `v${newV}` };
  }

  return null;
}

// ── cmdReleaseTrace ───────────────────────────────────────────────────

export function cmdReleaseTrace(args) {
  const { opts } = parseOptions(args);
  const cwd = process.cwd();

  const tracesDir = join(cwd, '.xm', 'traces');
  mkdirSync(tracesDir, { recursive: true });

  const ts = new Date().toISOString();
  const sessionId = `x-ship-${ts.slice(0, 10).replace(/-/g, '')}-${ts.slice(11, 19).replace(/:/g, '')}`;
  const tracePath = join(tracesDir, `${sessionId}.jsonl`);

  // Diff stats
  let filesChanged = 0, linesAdded = 0, linesDeleted = 0;
  try {
    const stat = git('diff --shortstat HEAD~1..HEAD');
    const fm = stat.match(/(\d+) file/); if (fm) filesChanged = parseInt(fm[1]);
    const am = stat.match(/(\d+) insertion/); if (am) linesAdded = parseInt(am[1]);
    const dm = stat.match(/(\d+) deletion/); if (dm) linesDeleted = parseInt(dm[1]);
  } catch {}

  const entry = {
    id: sessionId,
    timestamp: ts,
    type: 'checkpoint',
    source: 'x-ship',
    label: 'release',
    v: 1,
    data: {
      version_from: opts.from || null,
      version_to: opts.to || null,
      bump_level: opts.bump || 'patch',
      commits_before_squash: parseInt(opts['commits-before']) || null,
      commits_after_squash: parseInt(opts['commits-after']) || null,
      test_passed: opts['test-passed'] === 'true' ? true : opts['test-passed'] === 'false' ? false : null,
      review_verdict: opts['review-verdict'] || null,
      files_changed: filesChanged,
      lines_added: linesAdded,
      lines_deleted: linesDeleted,
    },
  };

  writeFileSync(tracePath, JSON.stringify(entry) + '\n', 'utf8');
  console.log(`✅ Trace recorded: ${tracePath}`);
}

// ── Router ────────────────────────────────────────────────────────────

export function cmdRelease(args) {
  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case 'detect':      cmdReleaseDetect(rest); break;
    case 'diff-report': cmdReleaseDiffReport(rest); break;
    case 'squash':      cmdReleaseSquash(rest); break;
    case 'bump':        cmdReleaseBump(rest); break;
    case 'test':        cmdReleaseTest(rest); break;
    case 'commit':      cmdReleaseCommit(rest); break;
    case 'trace':       cmdReleaseTrace(rest); break;
    default:
      console.log(`Usage: x-build release <subcommand>

  detect                          Detect changes, project type, classify commits
  diff-report [--since ref]       Per-commit diff summary for squash grouping
  squash [--since ref]            Squash WIP commits since last release
  bump --patch --plugins a,b      Bump versions (x-kit marketplace)
  bump --patch --standalone       Bump version (standalone project)
  test [--command "..."]          Auto-detect and run tests
  commit --msg "..." [--push]     Commit and optionally push
  trace --from X --to Y           Record release metrics to .xm/traces/`);
  }
}
