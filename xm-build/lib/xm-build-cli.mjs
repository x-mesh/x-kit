#!/usr/bin/env node

/**
 * xm-build — Phase-Based Project Harness CLI
 * term-mesh 생태계의 프로젝트 라이프사이클 관리 도구
 *
 * Usage: node .xm-build/xm-build-cli.mjs <command> [args] [options]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, appendFileSync, renameSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { execSync, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ROOT resolution:
// 1. XM_BUILD_ROOT env var (explicit override)
// 2. --global flag → ~/.xm/build/
// 3. default → cwd/.xm/build/
const XM_GLOBAL = process.argv.includes('--global');
const ROOT = process.env.XM_BUILD_ROOT
  ? resolve(process.env.XM_BUILD_ROOT)
  : XM_GLOBAL
    ? resolve(homedir(), '.xm', 'build')
    : resolve(process.cwd(), '.xm', 'build');

// PLUGIN_ROOT: where templates and defaults live (always script dir)
const PLUGIN_ROOT = resolve(__dirname, '..');

// ── Constants ────────────────────────────────────────────────────────

const PHASES = [
  { id: '01-research', name: 'research', label: 'Research' },
  { id: '02-plan',     name: 'plan',     label: 'Plan' },
  { id: '03-execute',  name: 'execute',  label: 'Execute' },
  { id: '04-verify',   name: 'verify',   label: 'Verify' },
  { id: '05-close',    name: 'close',    label: 'Close' },
];

const TASK_STATES = {
  PENDING: 'pending',
  READY: 'ready',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const STATUS_ALIASES = {
  in_progress: 'running',
  done: 'completed',
  complete: 'completed',
  cancel: 'cancelled',
  fail: 'failed',
  todo: 'pending',
};

const GATE_TYPES = ['auto', 'human-verify', 'human-action', 'quality'];

// ── ANSI Colors ──────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const C = isTTY ? {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
} : Object.fromEntries(['reset','bold','dim','red','green','yellow','blue','magenta','cyan'].map(k => [k, '']));

function renderBar(done, total, width = 20) {
  if (total === 0) return `[${C.dim}${'░'.repeat(width)}${C.reset}] 0%`;
  const ratio = done / total;
  const filled = Math.round(ratio * width);
  const pct = Math.round(ratio * 100);
  return `[${C.green}${'█'.repeat(filled)}${C.dim}${'░'.repeat(width - filled)}${C.reset}] ${pct}% ${done}/${total}`;
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ── Lifecycle Hooks ──────────────────────────────────────────────────

function emitHook(event, payload) {
  const config = loadConfig();
  const hooks = (config.hooks || []).filter(h => h.event === event || h.event === '*');
  for (const h of hooks) {
    try {
      const input = JSON.stringify({ event, ...payload, timestamp: new Date().toISOString() });
      if (h.exec.endsWith('.mjs')) {
        spawnSync(process.execPath, [h.exec], { input, stdio: ['pipe', 'inherit', 'inherit'], cwd: resolve(ROOT, '..') });
      } else {
        spawnSync(h.exec, [], { input, stdio: ['pipe', 'inherit', 'inherit'], shell: true, cwd: resolve(ROOT, '..') });
      }
    } catch { /* hook errors are non-fatal */ }
  }
}

// ── Context Manifests (Phase-Aware Loading) ──────────────────────────

const CONTEXT_MANIFESTS = {
  research: ['goal', 'constraints', 'context_md', 'requirements_md'],
  plan:     ['goal', 'constraints', 'research_summary', 'context_md', 'requirements_md', 'roadmap_md'],
  execute:  ['plan_tasks', 'plan_steps', 'execute_progress', 'context_md', 'requirements_md'],
  verify:   ['plan_tasks', 'execute_artifacts', 'execute_errors', 'requirements_md'],
  close:    ['verify_report', 'execute_summary'],
};

function loadPhaseContext(project, phaseName) {
  const manifest = CONTEXT_MANIFESTS[phaseName] || [];
  const m = readJSON(manifestPath(project));
  const taskData = readJSON(tasksPath(project));
  const stepData = readJSON(stepsPath(project));
  const decisions = readMD(join(contextDir(project), 'decisions.md'));
  const notes = readMD(join(phaseDir(project, '01-research'), 'notes.md'));

  const store = {
    goal: m?.display_name || project,
    constraints: '',
    research_summary: notes?.slice(0, 500) || '',
    plan_tasks: taskData?.tasks || [],
    plan_steps: stepData?.steps || [],
    execute_progress: taskData?.tasks?.map(t => ({ id: t.id, status: t.status })) || [],
    execute_artifacts: taskData?.tasks?.filter(t => t.status === TASK_STATES.COMPLETED).map(t => t.id) || [],
    execute_errors: taskData?.tasks?.filter(t => t.status === TASK_STATES.FAILED).map(t => ({ id: t.id, name: t.name })) || [],
    execute_summary: '',
    verify_report: '',
    context_md: readMD(join(contextDir(project), 'CONTEXT.md'))?.slice(0, 2000) || '',
    requirements_md: readMD(join(contextDir(project), 'REQUIREMENTS.md'))?.slice(0, 2000) || '',
    roadmap_md: readMD(join(contextDir(project), 'ROADMAP.md'))?.slice(0, 2000) || '',
  };

  const ctx = {};
  for (const key of manifest) {
    if (store[key] !== undefined) ctx[key] = store[key];
  }
  return ctx;
}

// ── Git Integration ──────────────────────────────────────────────────

function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe', cwd: resolve(ROOT, '..') });
    return true;
  } catch { return false; }
}

function gitAutoCommit(project, task, phase) {
  if (!isGitRepo()) return null;
  const config = loadConfig();
  if (config.git?.auto_commit === false) return null;

  try {
    const cwd = resolve(ROOT, '..');
    execSync('git add -A', { stdio: 'pipe', cwd });

    // Check if there are staged changes
    const diff = execSync('git diff --cached --name-only', { stdio: 'pipe', cwd }).toString().trim();
    if (!diff) return null;

    const msg = `tm(${phase}/${task.id}): ${task.name} [${task.status.toUpperCase()}]`;
    execSync(`git commit -m ${JSON.stringify(msg)}`, { stdio: 'pipe', cwd });
    const sha = execSync('git rev-parse HEAD', { stdio: 'pipe', cwd }).toString().trim();
    return sha;
  } catch { return null; }
}

function gitRollbackTask(task) {
  if (!isGitRepo() || !task.commit_sha) return false;
  try {
    const cwd = resolve(ROOT, '..');
    execSync(`git stash push -m "tm-task-${task.id}-failed"`, { stdio: 'pipe', cwd });
    execSync(`git reset --hard ${task.commit_sha}`, { stdio: 'pipe', cwd });
    return true;
  } catch { return false; }
}

// ── Quality Gate Runner ──────────────────────────────────────────────

function detectAndRunQualityChecks(project) {
  const cwd = resolve(ROOT, '..');
  const results = [];
  const config = loadConfig();

  // Custom gate scripts
  const scripts = config.gate_scripts || {};
  for (const [name, script] of Object.entries(scripts)) {
    try {
      const out = spawnSync(script, [], { shell: true, cwd, stdio: 'pipe', timeout: 120000 });
      results.push({ check: name, passed: out.status === 0, output: out.stderr?.toString().slice(-200) || '' });
    } catch (e) {
      results.push({ check: name, passed: false, output: e.message });
    }
  }

  // Auto-detect test runners
  const detections = [
    { file: 'package.json', key: 'scripts.test', cmd: 'npm test', name: 'npm-test' },
    { file: 'pytest.ini', cmd: 'pytest', name: 'pytest' },
    { file: 'pyproject.toml', cmd: 'pytest', name: 'pytest' },
    { file: 'go.mod', cmd: 'go test ./...', name: 'go-test' },
    { file: 'Cargo.toml', cmd: 'cargo test', name: 'cargo-test' },
  ];

  for (const d of detections) {
    const filePath = join(cwd, d.file);
    if (!existsSync(filePath)) continue;

    // For package.json, check if test script exists and isn't the default
    if (d.key === 'scripts.test') {
      try {
        const pkg = JSON.parse(readFileSync(filePath, 'utf8'));
        if (!pkg.scripts?.test || pkg.scripts.test.includes('no test specified')) continue;
      } catch { continue; }
    }

    try {
      const out = spawnSync(d.cmd, [], { shell: true, cwd, stdio: 'pipe', timeout: 300000 });
      results.push({ check: d.name, passed: out.status === 0, output: out.stderr?.toString().slice(-200) || '' });
    } catch (e) {
      results.push({ check: d.name, passed: false, output: e.message });
    }
  }

  // Auto-detect linters
  const linters = [
    { files: ['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs'], cmd: 'npx eslint .', name: 'eslint' },
    { files: ['.golangci.yml', '.golangci.yaml'], cmd: 'golangci-lint run', name: 'golangci-lint' },
  ];

  for (const l of linters) {
    if (l.files.some(f => existsSync(join(cwd, f)))) {
      try {
        const out = spawnSync(l.cmd, [], { shell: true, cwd, stdio: 'pipe', timeout: 120000 });
        results.push({ check: l.name, passed: out.status === 0, output: out.stderr?.toString().slice(-200) || '' });
      } catch (e) {
        results.push({ check: l.name, passed: false, output: e.message });
      }
    }
  }

  // Auto-detect build
  const builds = [
    { file: 'package.json', key: 'scripts.build', cmd: 'npm run build', name: 'npm-build' },
    { file: 'go.mod', cmd: 'go build ./...', name: 'go-build' },
  ];

  for (const b of builds) {
    const filePath = join(cwd, b.file);
    if (!existsSync(filePath)) continue;
    if (b.key) {
      try {
        const pkg = JSON.parse(readFileSync(filePath, 'utf8'));
        if (!pkg.scripts?.build) continue;
      } catch { continue; }
    }
    try {
      const out = spawnSync(b.cmd, [], { shell: true, cwd, stdio: 'pipe', timeout: 300000 });
      results.push({ check: b.name, passed: out.status === 0, output: out.stderr?.toString().slice(-200) || '' });
    } catch (e) {
      results.push({ check: b.name, passed: false, output: e.message });
    }
  }

  // Save results
  writeJSON(join(phaseDir(project, '04-verify'), 'quality-results.json'), {
    timestamp: new Date().toISOString(),
    results,
    passed: results.length === 0 || results.every(r => r.passed),
  });

  return results;
}

// ── Task Retry & Circuit Breaker ─────────────────────────────────────

const RETRY_DEFAULTS = { max_retries: 3, base_delay_ms: 2000, max_delay_ms: 60000, jitter: 0.25 };
const CIRCUIT_DEFAULTS = { threshold: 3, cooldown_ms: 30000 };

function getRetryConfig() {
  const config = loadConfig();
  return { ...RETRY_DEFAULTS, ...config.retry };
}

function getCircuitConfig() {
  const config = loadConfig();
  return { ...CIRCUIT_DEFAULTS, ...config.circuit_breaker };
}

function computeRetryDelay(attempt, cfg) {
  const base = cfg.base_delay_ms * Math.pow(2, attempt);
  const capped = Math.min(base, cfg.max_delay_ms);
  const jitter = capped * cfg.jitter * (Math.random() * 2 - 1);
  return Math.round(capped + jitter);
}

function circuitBreakerPath(project) {
  return join(projectDir(project), 'circuit-breaker.json');
}

function getCircuitState(project) {
  return readJSON(circuitBreakerPath(project)) || {
    state: 'closed', consecutive_failures: 0,
    opened_at: null, cooldown_until: null,
  };
}

function updateCircuitBreaker(project, taskFailed) {
  const cfg = getCircuitConfig();
  const cb = getCircuitState(project);

  if (taskFailed) {
    cb.consecutive_failures++;
    if (cb.consecutive_failures >= cfg.threshold && cb.state === 'closed') {
      cb.state = 'open';
      cb.opened_at = new Date().toISOString();
      cb.cooldown_until = new Date(Date.now() + cfg.cooldown_ms).toISOString();
      console.log(`  ${C.red}⚡ Circuit breaker OPEN — ${cb.consecutive_failures} consecutive failures. Step paused.${C.reset}`);
      console.log(`  ${C.dim}Cooldown until: ${cb.cooldown_until}${C.reset}`);
    }
  } else {
    cb.consecutive_failures = 0;
    if (cb.state !== 'closed') {
      cb.state = 'closed';
      cb.opened_at = null;
      cb.cooldown_until = null;
      console.log(`  ${C.green}⚡ Circuit breaker CLOSED — resuming normal operation.${C.reset}`);
    }
  }

  writeJSON(circuitBreakerPath(project), cb);
  return cb;
}

function isCircuitOpen(project) {
  const cb = getCircuitState(project);
  if (cb.state !== 'open') return false;

  // Check if cooldown expired → half-open
  if (cb.cooldown_until && new Date() > new Date(cb.cooldown_until)) {
    cb.state = 'half-open';
    writeJSON(circuitBreakerPath(project), cb);
    console.log(`  ${C.yellow}⚡ Circuit breaker HALF-OPEN — probe allowed.${C.reset}`);
    return false;
  }

  return true;
}

function resetCircuitBreaker(project) {
  const cb = { state: 'closed', consecutive_failures: 0, opened_at: null, cooldown_until: null };
  writeJSON(circuitBreakerPath(project), cb);
  console.log(`  ${C.green}⚡ Circuit breaker manually reset to CLOSED.${C.reset}`);
  return cb;
}

function scheduleRetry(project, task, data) {
  const cfg = getRetryConfig();
  task.retry_count = (task.retry_count || 0) + 1;

  if (task.retry_count > cfg.max_retries) {
    console.log(`  ${C.red}🚫 Max retries (${cfg.max_retries}) exhausted for ${task.id}.${C.reset}`);
    return false;
  }

  const delay = computeRetryDelay(task.retry_count - 1, cfg);
  task.status = TASK_STATES.PENDING;
  task.next_retry_at = new Date(Date.now() + delay).toISOString();

  writeJSON(tasksPath(project), data);
  console.log(`  ${C.yellow}🔄 Retry ${task.retry_count}/${cfg.max_retries} scheduled in ${fmtDuration(delay)}${C.reset}`);
  return true;
}

// ── Templates ────────────────────────────────────────────────────────

function templatesDir() {
  // Check project-local first, then plugin bundled templates
  const local = join(ROOT, 'templates');
  if (existsSync(local)) return local;
  return join(PLUGIN_ROOT, 'templates');
}

function ensureTemplates() {
  const dir = templatesDir();
  const tasksDir = join(dir, 'tasks');
  const researchDir = join(dir, 'research');

  if (existsSync(join(tasksDir, 'add-auth.md'))) return; // already exists

  mkdirSync(tasksDir, { recursive: true });
  mkdirSync(researchDir, { recursive: true });

  // Task templates
  const taskTemplates = {
    'add-auth.md': `# Add Authentication
## Variants: jwt | oauth2 | api-key | session
## Size: medium
## Checklist
- [ ] Choose auth strategy
- [ ] Implement login/signup endpoints
- [ ] Add token validation middleware
- [ ] Implement token refresh
- [ ] Add rate limiting to auth endpoints
- [ ] Hash passwords (bcrypt, argon2)
## Common Pitfalls
- Storing plain-text passwords
- Missing token expiry
- No rate limiting on login (brute-force risk)
- Leaking tokens in logs
`,
    'setup-ci.md': `# Setup CI/CD
## Variants: github-actions | gitlab-ci | jenkins
## Size: small
## Checklist
- [ ] Create CI config file
- [ ] Add lint step
- [ ] Add test step with coverage
- [ ] Add build step
- [ ] Configure caching (node_modules, go mod, etc.)
- [ ] Add branch protection rules
## Common Pitfalls
- No caching → slow builds
- Missing env vars in CI
- Flaky tests blocking deploys
`,
    'add-tests.md': `# Add Test Suite
## Variants: unit | integration | e2e
## Size: medium
## Checklist
- [ ] Install test framework
- [ ] Configure test runner
- [ ] Write unit tests for core logic
- [ ] Add integration tests for API endpoints
- [ ] Set up test database/fixtures
- [ ] Add coverage reporting (>80%)
## Common Pitfalls
- Mocking too much (tests pass, prod fails)
- No test isolation (shared state)
- Missing edge cases and error paths
`,
    'add-docker.md': `# Add Docker Support
## Size: small
## Checklist
- [ ] Create Dockerfile (multi-stage build)
- [ ] Create .dockerignore
- [ ] Create docker-compose.yml
- [ ] Add health check endpoint
- [ ] Configure environment variables
- [ ] Test build locally
## Common Pitfalls
- Running as root in container
- Copying node_modules into image
- Missing .dockerignore → huge images
`,
    'db-migration.md': `# Database Migration
## Size: medium
## Checklist
- [ ] Design schema changes
- [ ] Write up migration (forward)
- [ ] Write down migration (rollback)
- [ ] Test on staging/dev first
- [ ] Back up production data
- [ ] Plan zero-downtime migration
## Common Pitfalls
- No rollback plan
- Locking tables during migration
- Data loss from column drops
`,
  };

  for (const [name, content] of Object.entries(taskTemplates)) {
    writeMD(join(tasksDir, name), content);
  }

  // Research templates
  writeMD(join(researchDir, 'tech-compare.md'), `# Technology Comparison: {TOPIC}

## Evaluation Criteria
| Criteria | Weight | Option A | Option B | Option C |
|----------|--------|----------|----------|----------|
| Performance | 30% | | | |
| DX / Ergonomics | 25% | | | |
| Ecosystem / Community | 20% | | | |
| Maintenance burden | 15% | | | |
| License / Cost | 10% | | | |

## Weighted Score
| Option | Total Score | Recommendation |
|--------|------------|----------------|
| A | | |
| B | | |
| C | | |

## Decision
**Chosen:**
**Rationale:**
`);

  writeMD(join(researchDir, 'security-audit.md'), `# Security Audit: {TARGET}

## OWASP Top 10 Check
- [ ] A01: Broken Access Control
- [ ] A02: Cryptographic Failures
- [ ] A03: Injection
- [ ] A04: Insecure Design
- [ ] A05: Security Misconfiguration
- [ ] A06: Vulnerable Components
- [ ] A07: Auth Failures
- [ ] A08: Data Integrity Failures
- [ ] A09: Logging Failures
- [ ] A10: SSRF

## Findings
| # | Severity | Location | Issue | Fix |
|---|----------|----------|-------|-----|
| 1 | | | | |

## Recommendation

`);
}

function cmdTemplates(args) {
  const sub = args[0];

  if (!sub || sub === 'list') {
    ensureTemplates();
    console.log(`\n${C.bold}📝 Templates${C.reset}\n`);

    const tasksDir = join(templatesDir(), 'tasks');
    const researchDir = join(templatesDir(), 'research');

    if (existsSync(tasksDir)) {
      console.log(`${C.bold}Task Templates:${C.reset}`);
      for (const f of readdirSync(tasksDir).filter(f => f.endsWith('.md'))) {
        const content = readMD(join(tasksDir, f));
        const firstLine = content.split('\n').find(l => l.startsWith('# '))?.slice(2) || f;
        const size = content.match(/## Size: (\w+)/)?.[1] || '?';
        console.log(`  📋 ${f.replace('.md', '').padEnd(20)} ${C.dim}(${size})${C.reset}  ${firstLine}`);
      }
    }

    if (existsSync(researchDir)) {
      console.log(`\n${C.bold}Research Templates:${C.reset}`);
      for (const f of readdirSync(researchDir).filter(f => f.endsWith('.md'))) {
        const content = readMD(join(researchDir, f));
        const firstLine = content.split('\n').find(l => l.startsWith('# '))?.slice(2) || f;
        console.log(`  🔬 ${f.replace('.md', '').padEnd(20)} ${firstLine}`);
      }
    }
    console.log('');
    return;
  }

  if (sub === 'use') {
    const templateName = args[1];
    if (!templateName) {
      console.error('Usage: xm-build templates use <template-name>');
      process.exit(1);
    }

    ensureTemplates();
    const project = resolveProject(null);

    // Search in tasks/ and research/
    let templatePath = join(templatesDir(), 'tasks', `${templateName}.md`);
    let dest = 'plan';
    if (!existsSync(templatePath)) {
      templatePath = join(templatesDir(), 'research', `${templateName}.md`);
      dest = 'research';
    }
    if (!existsSync(templatePath)) {
      console.error(`❌ Template "${templateName}" not found. Run: xm-build templates list`);
      process.exit(1);
    }

    const content = readMD(templatePath);
    const destDir = dest === 'plan'
      ? phaseDir(project, '02-plan')
      : phaseDir(project, '01-research');
    const destFile = join(destDir, `${templateName}.md`);

    writeMD(destFile, content);
    console.log(`✅ Template "${templateName}" applied to ${destFile}`);

    // If task template, also add a task entry
    if (dest === 'plan') {
      const sizeMatch = content.match(/## Size: (\w+)/);
      const titleMatch = content.match(/^# (.+)/m);
      const size = sizeMatch?.[1] || 'medium';
      const name = titleMatch?.[1] || templateName;

      const data = readJSON(tasksPath(project)) || { tasks: [] };
      const id = `t${data.tasks.length + 1}`;
      data.tasks.push({
        id, name, depends_on: [], size,
        status: TASK_STATES.PENDING,
        created_at: new Date().toISOString(),
        template: templateName,
      });
      writeJSON(tasksPath(project), data);
      console.log(`  ➕ Task "${id}: ${name}" added (${size})`);
    }

    return;
  }

  if (sub === 'init') {
    ensureTemplates();
    console.log(`✅ Templates initialized at ${templatesDir()}`);
    return;
  }

  console.error('Usage: xm-build templates <list|use|init>');
}

// ── Metrics ──────────────────────────────────────────────────────────

function metricsPath() {
  return join(ROOT, 'metrics', 'sessions.jsonl');
}

const METRICS_MAX_BYTES = 5 * 1024 * 1024; // 5MB rotation threshold

function appendMetric(data) {
  const p = metricsPath();
  mkdirSync(dirname(p), { recursive: true });
  // Rotate if file exceeds threshold
  if (existsSync(p)) {
    try {
      const sz = statSync(p).size;
      if (sz > METRICS_MAX_BYTES) {
        const rotated = p + '.1';
        if (existsSync(rotated)) writeFileSync(rotated, '', 'utf8'); // truncate old rotation
        renameSync(p, rotated);
      }
    } catch { /* ignore rotation errors */ }
  }
  appendFileSync(p, JSON.stringify(data) + '\n', 'utf8');
}

// ── File I/O Helpers ─────────────────────────────────────────────────

function readJSON(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    // Try .bak recovery
    const bak = path + '.bak';
    if (existsSync(bak)) {
      try {
        const recovered = JSON.parse(readFileSync(bak, 'utf8'));
        console.error(`  ${C.yellow}⚠ Corrupted JSON: ${basename(path)} — recovered from .bak${C.reset}`);
        writeFileSync(path, readFileSync(bak, 'utf8'));
        return recovered;
      } catch { /* bak also corrupted */ }
    }
    console.error(`  ${C.red}⚠ Failed to parse ${basename(path)}: ${err.message}${C.reset}`);
    return null;
  }
}

function writeJSON(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const content = JSON.stringify(data, null, 2) + '\n';
  const tmp = path + '.tmp';
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

function readMD(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function writeMD(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function loadConfig() {
  return readJSON(join(ROOT, 'config.json')) || {};
}

function loadSharedConfig() {
  // Shared config lives one level up from tool-specific root
  // ROOT = .xm/build/ → shared = .xm/config.json
  const sharedPath = join(ROOT, '..', 'config.json');
  const local = readJSON(sharedPath);
  if (local) return local;
  // Fallback to global config (~/.xm/config.json)
  const globalPath = join(homedir(), '.xm', 'config.json');
  return readJSON(globalPath) || {};
}

function getMode() {
  // Priority: local config → shared config → default
  const localMode = loadConfig().mode;
  if (localMode) return localMode;
  const sharedMode = loadSharedConfig().mode;
  if (sharedMode) return sharedMode;
  return 'developer';
}

function getAgentCount() {
  const shared = loadSharedConfig();
  return shared.agent_max_count ?? 4;
}

function isNormalMode() {
  return getMode() === 'normal';
}

// Normal mode label mappings (simple language)
const NORMAL_LABELS = {
  // Phases
  'Research': '조사하기',
  'Plan': '계획 세우기',
  'Execute': '실행하기',
  'Verify': '확인하기',
  'Close': '마무리',
  // Gates
  'auto': '자동',
  'human-verify': '직접 확인',
  'human-action': '직접 작업',
  'quality': '품질 검사',
  // Task states
  'pending': '대기 중',
  'ready': '준비됨',
  'running': '진행 중',
  'completed': '완료',
  'failed': '실패',
  'cancelled': '취소됨',
  // Sizes
  'small': '간단',
  'medium': '보통',
  'large': '복잡',
};

function L(key) {
  return isNormalMode() ? (NORMAL_LABELS[key] || key) : key;
}

function cmdMode(args) {
  const sub = args[0];

  if (!sub || sub === 'show') {
    const mode = getMode();
    console.log(`\n현재 모드: ${C.bold}${mode === 'normal' ? '🟢 일반인 모드' : '🔧 개발자 모드'}${C.reset}`);
    if (mode === 'normal') {
      console.log(`  모든 안내가 쉬운 말로 표시됩니다.`);
    } else {
      console.log(`  기술 용어가 그대로 표시됩니다.`);
    }
    console.log(`\n  변경: xmb mode developer | xmb mode normal\n`);
    return;
  }

  if (!['developer', 'normal'].includes(sub)) {
    console.error('Usage: xm-build mode <developer|normal>');
    process.exit(1);
  }

  const config = loadConfig();
  config.mode = sub;
  writeJSON(join(ROOT, 'config.json'), config);
  // Also update shared config
  const sharedPath = join(ROOT, '..', 'config.json');
  const sharedConfig = readJSON(sharedPath) || {};
  sharedConfig.mode = sub;
  writeJSON(sharedPath, sharedConfig);

  if (sub === 'normal') {
    console.log(`\n🟢 일반인 모드로 전환했습니다.`);
    console.log(`   앞으로 모든 안내가 이해하기 쉬운 말로 표시됩니다.\n`);
  } else {
    console.log(`\n🔧 Developer mode activated.`);
    console.log(`   Technical terminology will be used.\n`);
  }
}

// ── Path Helpers ─────────────────────────────────────────────────────

function projectsDir() {
  return join(ROOT, 'projects');
}

function projectDir(name) {
  return join(projectsDir(), name);
}

function manifestPath(name) {
  return join(projectDir(name), 'manifest.json');
}

function phaseDir(project, phaseId) {
  return join(projectDir(project), 'phases', phaseId);
}

function phaseStatusPath(project, phaseId) {
  return join(phaseDir(project, phaseId), 'status.json');
}

function tasksPath(project) {
  return join(phaseDir(project, '02-plan'), 'tasks.json');
}

function stepsPath(project) {
  return join(phaseDir(project, '02-plan'), 'steps.json');
}

function checkpointsDir(project) {
  return join(projectDir(project), 'checkpoints');
}

function contextDir(project) {
  return join(projectDir(project), 'context');
}

// ── Project Manager ──────────────────────────────────────────────────

function findCurrentProject() {
  const dir = projectsDir();
  if (!existsSync(dir)) return null;
  const projects = readdirSync(dir).filter(d =>
    existsSync(manifestPath(d))
  );
  if (projects.length === 0) return null;
  // Return most recently modified
  const withManifest = projects
    .map(p => ({ name: p, manifest: readJSON(manifestPath(p)) }))
    .filter(p => p.manifest && p.manifest.updated_at);
  if (withManifest.length === 0) return null;
  return withManifest
    .sort((a, b) => new Date(b.manifest.updated_at) - new Date(a.manifest.updated_at))
    [0].name;
}

function resolveProject(explicit) {
  const name = explicit || findCurrentProject();
  if (!name) {
    console.error('❌ No project found. Run: xm-build init <project-name>');
    process.exit(1);
  }
  if (!existsSync(manifestPath(name))) {
    console.error(`❌ Project "${name}" not found.`);
    process.exit(1);
  }
  return name;
}

function cmdInit(args) {
  const name = args[0];
  if (!name) {
    console.error('Usage: xm-build init <project-name>');
    process.exit(1);
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

  if (existsSync(manifestPath(slug))) {
    console.error(`❌ Project "${slug}" already exists.`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const manifest = {
    name: slug,
    display_name: name,
    current_phase: '01-research',
    created_at: now,
    updated_at: now,
  };

  writeJSON(manifestPath(slug), manifest);

  // Create phase directories with status files
  for (const phase of PHASES) {
    const status = {
      phase: phase.name,
      status: phase.id === '01-research' ? 'active' : 'pending',
      started_at: phase.id === '01-research' ? now : null,
      completed_at: null,
    };
    writeJSON(phaseStatusPath(slug, phase.id), status);
  }

  // Create context directory
  writeMD(join(contextDir(slug), 'brief.md'), `# ${name} — Context Brief\n\nProject initialized at ${now}.\n`);
  writeMD(join(contextDir(slug), 'decisions.md'), `# ${name} — Decisions Log\n\n`);

  // Create initial phase files
  writeMD(join(phaseDir(slug, '01-research'), 'notes.md'), `# Research Notes\n\n`);
  writeMD(join(phaseDir(slug, '02-plan'), 'roadmap.md'), `# Roadmap\n\n`);
  writeJSON(tasksPath(slug), { tasks: [] });
  writeMD(join(phaseDir(slug, '04-verify'), 'checklist.md'), `# Verification Checklist\n\n`);
  writeMD(join(phaseDir(slug, '05-close'), 'summary.md'), `# Project Summary\n\n`);

  // Create checkpoints directory
  mkdirSync(checkpointsDir(slug), { recursive: true });

  console.log(`✅ Project "${slug}" initialized.`);
  console.log(`📁 ${projectDir(slug)}`);
  console.log(`📍 Current phase: Research`);
}

function cmdList() {
  const dir = projectsDir();
  if (!existsSync(dir)) {
    console.log('No projects found.');
    return;
  }
  const projects = readdirSync(dir).filter(d => existsSync(manifestPath(d)));
  if (projects.length === 0) {
    console.log('No projects found.');
    return;
  }

  console.log('Projects:\n');
  for (const p of projects) {
    const m = readJSON(manifestPath(p));
    const phase = PHASES.find(ph => ph.id === m.current_phase);
    console.log(`  ${p}  →  ${phase?.label || m.current_phase}  (${m.created_at.slice(0, 10)})`);
  }
}

// ── Status ───────────────────────────────────────────────────────────

function cmdStatus(args) {
  const name = resolveProject(args[0]);
  const manifest = readJSON(manifestPath(name));
  const config = loadConfig();

  // Phase progress
  const completedPhases = PHASES.filter(p => {
    const s = readJSON(phaseStatusPath(name, p.id));
    return s?.status === 'completed';
  }).length;

  const normal = isNormalMode();

  if (normal) {
    console.log(`\n${C.bold}${C.cyan}📋 프로젝트: ${manifest.display_name || name}${C.reset}`);
    console.log(`   시작일: ${manifest.created_at.slice(0, 10)}  전체 진행률: ${renderBar(completedPhases, PHASES.length, 15)}`);
  } else {
    console.log(`\n${C.bold}${C.cyan}📋 ${manifest.display_name || name}${C.reset}`);
    console.log(`   Created: ${manifest.created_at.slice(0, 10)}  ${renderBar(completedPhases, PHASES.length, 15)}`);
  }
  console.log('');

  for (const phase of PHASES) {
    const status = readJSON(phaseStatusPath(name, phase.id));
    const isCurrent = phase.id === manifest.current_phase;
    const gateKey = `${phase.name}-exit`;
    const gateType = config.gates?.[gateKey] || 'auto';

    let icon = '⬜';
    let color = C.dim;
    let stateLabel = normal ? '아직 안 함' : '';
    if (status?.status === 'completed') { icon = '✅'; color = C.green; stateLabel = normal ? '완료!' : ''; }
    else if (status?.status === 'active') { icon = '🔵'; color = C.blue; stateLabel = normal ? '지금 하는 중' : ''; }
    else if (status?.status === 'failed') { icon = '❌'; color = C.red; stateLabel = normal ? '문제 발생' : ''; }

    // Duration
    let dur = '';
    if (status?.started_at) {
      const end = status.completed_at ? new Date(status.completed_at) : new Date();
      const elapsed = end - new Date(status.started_at);
      dur = normal ? ` ${C.dim}(${fmtDuration(elapsed)} 걸림)${C.reset}` : ` ${C.dim}(${fmtDuration(elapsed)})${C.reset}`;
    }

    const marker = isCurrent ? ` ${C.yellow}← 여기${C.reset}` : '';
    const gate = status?.status !== 'completed' ? ` ${C.dim}[${L(gateType)}]${C.reset}` : '';
    const label = normal ? L(phase.label) : phase.label;
    const extra = stateLabel && normal ? ` ${C.dim}${stateLabel}${C.reset}` : '';
    console.log(`  ${icon} ${color}${label}${C.reset}${gate}${dur}${extra}${marker}`);
  }

  // Show task summary if in plan/execute phase
  if (['02-plan', '03-execute'].includes(manifest.current_phase)) {
    const tasks = readJSON(tasksPath(name));
    if (tasks?.tasks?.length > 0) {
      const total = tasks.tasks.length;
      const done = tasks.tasks.filter(t => t.status === TASK_STATES.COMPLETED).length;
      const failed = tasks.tasks.filter(t => t.status === TASK_STATES.FAILED).length;
      const taskLabel = normal ? '할 일' : 'Tasks';
      const failLabel = normal ? `${failed}개 문제` : `${failed} failed`;
      console.log(`\n📊 ${taskLabel}: ${renderBar(done, total)}${failed ? ` ${C.red}(${failLabel})${C.reset}` : ''}`);
    }

    const stData = readJSON(stepsPath(name));
    if (stData?.steps?.length > 0) {
      const doneSteps = stData.steps.filter(w => {
        const taskData = readJSON(tasksPath(name));
        return w.tasks.every(id => taskData?.tasks?.find(t => t.id === id)?.status === TASK_STATES.COMPLETED);
      }).length;
      console.log(`🔹 Steps: ${renderBar(doneSteps, stData.steps.length, 10)}`);
    }
  }

  console.log('');
}

// ── Phase Manager ────────────────────────────────────────────────────

function cmdPhase(args) {
  const sub = args[0];
  if (!sub || !['next', 'set', 'status'].includes(sub)) {
    console.error('Usage: xm-build phase <next|set|status> [args]');
    process.exit(1);
  }

  if (sub === 'status') {
    return cmdStatus(args.slice(1));
  }

  if (sub === 'next') {
    return phaseNext(args.slice(1));
  }

  if (sub === 'set') {
    return phaseSet(args.slice(1));
  }
}

function phaseNext(args) {
  const project = resolveProject(args[0]);
  const manifest = readJSON(manifestPath(project));
  const config = loadConfig();
  const currentIdx = PHASES.findIndex(p => p.id === manifest.current_phase);

  if (currentIdx === -1) {
    console.error('❌ Invalid current phase in manifest.');
    process.exit(1);
  }

  // Check gate
  const currentPhase = PHASES[currentIdx];
  const gateKey = `${currentPhase.name}-exit`;
  const gateType = config.gates?.[gateKey] || 'auto';

  if (gateType === 'human-verify') {
    const status = readJSON(phaseStatusPath(project, currentPhase.id));
    if (status?.gate_passed !== true) {
      console.log(`⛔ Gate "${gateKey}" requires human verification.`);
      console.log(`   Run: xm-build gate pass [message]`);
      return;
    }
  }

  // Research-exit: verify artifacts exist
  if (currentPhase.name === 'research' && gateType === 'human-verify') {
    const hasContext = existsSync(join(contextDir(project), 'CONTEXT.md'));
    const hasReqs = existsSync(join(contextDir(project), 'REQUIREMENTS.md'));
    if (!hasContext && !hasReqs) {
      console.log(`⚠️  No research artifacts found. Recommended:`);
      console.log(`   1. xm-build discuss`);
      console.log(`   2. xm-build research`);
      console.log(`   Then: xm-build gate pass`);
      return;
    }
  }

  // Plan-exit: verify plan-check passed
  if (currentPhase.name === 'plan' && gateType === 'human-verify') {
    const tasks = readJSON(tasksPath(project));
    if (!tasks?.tasks?.length) {
      console.log(`⚠️  No tasks defined. Run: xm-build plan "goal"`);
      return;
    }
    const planCheck = readJSON(join(phaseDir(project, '02-plan'), 'plan-check.json'));
    if (!planCheck) {
      console.log(`⚠️  Plan not validated. Run: xm-build plan-check`);
      console.log(`   Then: xm-build gate pass`);
      return;
    }
    if (!planCheck.passed) {
      console.log(`⚠️  Plan check has errors. Fix them first.`);
      return;
    }
  }

  // Quality gate: auto-detect and run checks
  if (gateType === 'quality') {
    console.log(`🔍 Running quality checks...`);
    const results = detectAndRunQualityChecks(project);
    if (results.length === 0) {
      console.log(`  ${C.dim}(no checks detected — gate passes)${C.reset}`);
    } else {
      for (const r of results) {
        console.log(`  ${r.passed ? '✅' : '❌'} ${r.check}${r.passed ? '' : `: ${r.output.slice(0, 100)}`}`);
      }
      if (!results.every(r => r.passed)) {
        console.log(`\n⛔ Quality gate failed. Fix issues and retry.`);
        return;
      }
      console.log(`  ${C.green}All checks passed.${C.reset}`);
    }
  }

  // Custom gate scripts
  if (!GATE_TYPES.includes(gateType)) {
    const scripts = config.gate_scripts || {};
    if (scripts[gateType]) {
      console.log(`🔍 Running custom gate: ${gateType}...`);
      const out = spawnSync(scripts[gateType], [], { shell: true, cwd: resolve(ROOT, '..'), stdio: 'pipe' });
      if (out.status !== 0) {
        console.log(`⛔ Custom gate "${gateType}" failed.`);
        return;
      }
      console.log(`  ${C.green}Custom gate passed.${C.reset}`);
    }
  }

  if (currentIdx >= PHASES.length - 1) {
    console.log('✅ Already at final phase (Close).');
    return;
  }

  // Emit pre-exit hook
  emitHook('phase:pre-exit', { project, phase: currentPhase.name });

  // Complete current phase (with rollback on failure)
  const now = new Date().toISOString();
  const currentStatus = readJSON(phaseStatusPath(project, currentPhase.id));
  const nextPhase = PHASES[currentIdx + 1];
  const nextStatus = readJSON(phaseStatusPath(project, nextPhase.id));

  // Snapshot for rollback
  const prevCurrentStatus = JSON.parse(JSON.stringify(currentStatus));
  const prevNextStatus = JSON.parse(JSON.stringify(nextStatus));
  const prevManifest = JSON.parse(JSON.stringify(manifest));

  try {
    currentStatus.status = 'completed';
    currentStatus.completed_at = now;
    writeJSON(phaseStatusPath(project, currentPhase.id), currentStatus);

    nextStatus.status = 'active';
    nextStatus.started_at = now;
    writeJSON(phaseStatusPath(project, nextPhase.id), nextStatus);

    manifest.current_phase = nextPhase.id;
    manifest.updated_at = now;
    writeJSON(manifestPath(project), manifest);
  } catch (err) {
    // Rollback all writes
    console.error(`  ${C.red}❌ Phase transition failed: ${err.message}. Rolling back...${C.reset}`);
    try {
      writeJSON(phaseStatusPath(project, currentPhase.id), prevCurrentStatus);
      writeJSON(phaseStatusPath(project, nextPhase.id), prevNextStatus);
      writeJSON(manifestPath(project), prevManifest);
      console.error(`  ${C.yellow}⚠ Rollback complete. Phase unchanged.${C.reset}`);
    } catch { console.error(`  ${C.red}⚠ Rollback also failed. Manual recovery may be needed.${C.reset}`); }
    return;
  }

  // Log decision
  logDecision(project, `Phase transition: ${currentPhase.label} → ${nextPhase.label}`);

  // Emit post-enter hook
  emitHook('phase:post-enter', { project, phase: nextPhase.name, from: currentPhase.name });

  // Append phase metric
  if (currentStatus.started_at) {
    appendMetric({
      type: 'phase_complete', project, phase: currentPhase.name,
      duration_ms: new Date(now) - new Date(currentStatus.started_at),
      timestamp: now,
    });
  }

  console.log(`✅ ${currentPhase.label} → ${nextPhase.label}`);

  const nextGateKey = `${nextPhase.name}-exit`;
  const nextGateType = config.gates?.[nextGateKey] || 'auto';
  if (nextGateType !== 'auto') {
    console.log(`   Exit gate: ${nextGateType}`);
  }
}

function phaseSet(args) {
  const phaseName = args[0];
  const project = resolveProject(args[1]);

  if (!phaseName) {
    console.error('Usage: xm-build phase set <phase-name> [project]');
    process.exit(1);
  }

  const target = PHASES.find(p => p.name === phaseName || p.id === phaseName);
  if (!target) {
    console.error(`❌ Unknown phase: "${phaseName}". Valid: ${PHASES.map(p => p.name).join(', ')}`);
    process.exit(1);
  }

  const manifest = readJSON(manifestPath(project));
  const now = new Date().toISOString();

  // Mark all phases before target as completed
  for (const phase of PHASES) {
    const status = readJSON(phaseStatusPath(project, phase.id));
    if (phase.id < target.id) {
      status.status = 'completed';
      if (!status.completed_at) status.completed_at = now;
      if (!status.started_at) status.started_at = now;
    } else if (phase.id === target.id) {
      status.status = 'active';
      if (!status.started_at) status.started_at = now;
      status.completed_at = null;
    } else {
      status.status = 'pending';
      status.started_at = null;
      status.completed_at = null;
    }
    writeJSON(phaseStatusPath(project, phase.id), status);
  }

  manifest.current_phase = target.id;
  manifest.updated_at = now;
  writeJSON(manifestPath(project), manifest);

  logDecision(project, `Phase set to: ${target.label}`);
  console.log(`📍 Phase set to: ${target.label}`);
}

// ── Gate ──────────────────────────────────────────────────────────────

function cmdGate(args) {
  const action = args[0];
  if (!action || !['pass', 'fail'].includes(action)) {
    console.error('Usage: xm-build gate <pass|fail> [message] [project]');
    process.exit(1);
  }

  const message = args.slice(1).filter(a => !a.startsWith('--')).join(' ') || null;
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);

  if (!currentPhase) {
    console.error('❌ Invalid current phase.');
    process.exit(1);
  }

  const status = readJSON(phaseStatusPath(project, currentPhase.id));
  const now = new Date().toISOString();

  if (action === 'pass') {
    status.gate_passed = true;
    status.gate_message = message;
    status.gate_at = now;
    writeJSON(phaseStatusPath(project, currentPhase.id), status);

    // Record checkpoint
    const checkpoint = {
      type: 'gate-pass',
      phase: currentPhase.name,
      message,
      timestamp: now,
    };
    writeJSON(join(checkpointsDir(project), `${now.replace(/[:.]/g, '-')}-gate-pass.json`), checkpoint);

    logDecision(project, `Gate passed: ${currentPhase.label}${message ? ` — ${message}` : ''}`);
    console.log(`✅ Gate passed for ${currentPhase.label}.`);
    console.log(`   Run: xm-build phase next`);
  } else {
    status.gate_passed = false;
    status.gate_message = message;
    status.gate_at = now;
    writeJSON(phaseStatusPath(project, currentPhase.id), status);

    const checkpoint = {
      type: 'gate-fail',
      phase: currentPhase.name,
      message,
      timestamp: now,
    };
    writeJSON(join(checkpointsDir(project), `${now.replace(/[:.]/g, '-')}-gate-fail.json`), checkpoint);

    logDecision(project, `Gate failed: ${currentPhase.label}${message ? ` — ${message}` : ''}`);
    console.log(`❌ Gate failed for ${currentPhase.label}.`);
  }
}

// ── Tasks ────────────────────────────────────────────────────────────

function cmdTasks(args) {
  const sub = args[0];
  if (!sub || !['add', 'list', 'remove', 'update'].includes(sub)) {
    console.error('Usage: xm-build tasks <add|list|remove|update> [args]');
    process.exit(1);
  }

  const project = resolveProject(null);

  if (sub === 'add') return taskAdd(project, args.slice(1));
  if (sub === 'list') return taskList(project);
  if (sub === 'remove') return taskRemove(project, args.slice(1));
  if (sub === 'update') return taskUpdate(project, args.slice(1));
}

function parseOptions(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      opts[key] = val;
    } else {
      positional.push(args[i]);
    }
  }
  return { opts, positional };
}

function taskAdd(project, args) {
  const { opts, positional } = parseOptions(args);
  const name = positional.join(' ');

  if (!name) {
    console.error('Usage: xm-build tasks add <name> [--deps t1,t2] [--size small|medium|large]');
    process.exit(1);
  }

  const data = readJSON(tasksPath(project)) || { tasks: [] };
  const maxNum = data.tasks.reduce((max, t) => {
    const n = parseInt(t.id?.replace('t', ''), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const id = `t${maxNum + 1}`;
  const deps = opts.deps ? opts.deps.split(',').map(d => d.trim()) : [];
  const size = opts.size || 'medium';

  // Validate deps exist
  const validIds = new Set(data.tasks.map(t => t.id));
  for (const dep of deps) {
    if (!validIds.has(dep)) {
      console.error(`❌ Unknown dependency: "${dep}". Known: ${[...validIds].join(', ') || 'none'}`);
      process.exit(1);
    }
  }

  const role = opts.role || null; // e.g. architect, executor, reviewer, security

  const task = {
    id,
    name,
    depends_on: deps,
    size,
    role,
    status: TASK_STATES.PENDING,
    created_at: new Date().toISOString(),
  };

  data.tasks.push(task);
  writeJSON(tasksPath(project), data);
  console.log(`✅ Task added: ${id} — ${name}${deps.length ? ` (deps: ${deps.join(', ')})` : ''}`);
}

function taskList(project) {
  const data = readJSON(tasksPath(project));
  if (!data?.tasks?.length) {
    console.log('No tasks defined. Run: xm-build tasks add <name>');
    return;
  }

  console.log(`\n📋 Tasks (${data.tasks.length}):\n`);

  const stateIcon = {
    [TASK_STATES.PENDING]: '⬜',
    [TASK_STATES.READY]: '🟡',
    [TASK_STATES.RUNNING]: '🔵',
    [TASK_STATES.COMPLETED]: '✅',
    [TASK_STATES.FAILED]: '❌',
    [TASK_STATES.CANCELLED]: '⛔',
  };

  for (const task of data.tasks) {
    const icon = stateIcon[task.status] || '⬜';
    const deps = task.depends_on.length ? ` ← [${task.depends_on.join(', ')}]` : '';
    const size = task.size ? ` (${task.size})` : '';
    console.log(`  ${icon} ${task.id}: ${task.name}${size}${deps}`);
  }
  console.log('');
}

function taskRemove(project, args) {
  const id = args[0];
  if (!id) {
    console.error('Usage: xm-build tasks remove <task-id>');
    process.exit(1);
  }

  const data = readJSON(tasksPath(project));
  const idx = data.tasks.findIndex(t => t.id === id);
  if (idx === -1) {
    console.error(`❌ Task "${id}" not found.`);
    process.exit(1);
  }

  // Check if other tasks depend on this one
  const dependents = data.tasks.filter(t => t.depends_on.includes(id));
  if (dependents.length > 0) {
    console.error(`❌ Cannot remove "${id}" — depended on by: ${dependents.map(t => t.id).join(', ')}`);
    process.exit(1);
  }

  data.tasks.splice(idx, 1);
  writeJSON(tasksPath(project), data);
  console.log(`✅ Task "${id}" removed.`);
}

function taskUpdate(project, args) {
  const { opts, positional } = parseOptions(args);
  const id = positional[0];
  const rawStatus = opts.status;

  if (!id || !rawStatus) {
    console.error('Usage: xm-build tasks update <task-id> --status <pending|ready|running|completed|failed>');
    process.exit(1);
  }

  const newStatus = STATUS_ALIASES[rawStatus] || rawStatus;

  if (!Object.values(TASK_STATES).includes(newStatus)) {
    console.error(`❌ Invalid status: "${rawStatus}". Valid: ${Object.values(TASK_STATES).join(', ')}`);
    process.exit(1);
  }

  const data = readJSON(tasksPath(project));
  const task = data.tasks.find(t => t.id === id);
  if (!task) {
    console.error(`❌ Task "${id}" not found.`);
    process.exit(1);
  }

  const oldStatus = task.status;
  task.status = newStatus;
  if (newStatus === TASK_STATES.COMPLETED) task.completed_at = new Date().toISOString();
  if (newStatus === TASK_STATES.RUNNING) task.started_at = new Date().toISOString();

  writeJSON(tasksPath(project), data);

  // Emit hook
  emitHook('task:post-update', { project, taskId: id, from: oldStatus, to: newStatus });

  // Git auto-commit on task completion
  if (newStatus === TASK_STATES.COMPLETED) {
    const manifest = readJSON(manifestPath(project));
    const phase = PHASES.find(p => p.id === manifest?.current_phase);
    const sha = gitAutoCommit(project, task, phase?.name || 'unknown');
    if (sha) {
      task.commit_sha = sha;
      writeJSON(tasksPath(project), data);
      console.log(`  ${C.dim}📎 commit: ${sha.slice(0, 8)}${C.reset}`);
    }
    // Append metric
    if (task.started_at) {
      appendMetric({
        type: 'task_complete', project, taskId: id, taskName: task.name,
        duration_ms: new Date(task.completed_at) - new Date(task.started_at),
        timestamp: task.completed_at,
      });
    }
  }

  // On failure: circuit breaker + retry + rollback
  if (newStatus === TASK_STATES.FAILED) {
    updateCircuitBreaker(project, true);

    // Git rollback
    if (opts.rollback !== 'false' && task.commit_sha) {
      const rolled = gitRollbackTask(task);
      if (rolled) console.log(`  ${C.dim}🔄 rolled back to ${task.commit_sha.slice(0, 8)}${C.reset}`);
    }

    // Auto-retry if enabled
    if (opts.retry !== 'false') {
      scheduleRetry(project, task, data);
    }
  }

  // On success: reset circuit breaker
  if (newStatus === TASK_STATES.COMPLETED) {
    updateCircuitBreaker(project, false);
  }

  console.log(`✅ Task "${id}" → ${newStatus}`);
}

// ── DAG & Steps ──────────────────────────────────────────────────────

function computeSteps(tasks) {
  if (tasks.length === 0) return [];

  // Build adjacency and indegree
  const adj = new Map();    // predecessor → [successors]
  const indegree = new Map();
  const taskMap = new Map();

  for (const t of tasks) {
    adj.set(t.id, []);
    indegree.set(t.id, 0);
    taskMap.set(t.id, t);
  }

  for (const t of tasks) {
    for (const dep of t.depends_on) {
      if (!adj.has(dep)) continue;
      adj.get(dep).push(t.id);
      indegree.set(t.id, indegree.get(t.id) + 1);
    }
  }

  // Detect cycle: Kahn's algorithm
  const steps = [];
  const remaining = new Set(tasks.map(t => t.id));
  let stepNum = 1;

  while (remaining.size > 0) {
    const ready = [];
    for (const id of remaining) {
      if (indegree.get(id) === 0) ready.push(id);
    }

    if (ready.length === 0) {
      const cycleNodes = [...remaining].join(', ');
      throw new Error(`Circular dependency detected among: ${cycleNodes}`);
    }

    steps.push({
      id: stepNum,
      tasks: ready,
      status: 'pending',
    });

    for (const id of ready) {
      remaining.delete(id);
      for (const succ of adj.get(id)) {
        indegree.set(succ, indegree.get(succ) - 1);
      }
    }

    stepNum++;
  }

  return steps;
}

function cmdSteps(args) {
  const sub = args[0];
  if (!sub || !['compute', 'status', 'next'].includes(sub)) {
    console.error('Usage: xm-build steps <compute|status|next> [project]');
    process.exit(1);
  }

  const project = resolveProject(args[1] || null);

  if (sub === 'compute') return stepsCompute(project);
  if (sub === 'status') return stepsStatus(project);
  if (sub === 'next') return stepsNext(project);
}

function stepsCompute(project) {
  const data = readJSON(tasksPath(project));
  if (!data?.tasks?.length) {
    console.error('❌ No tasks defined. Run: xm-build tasks add <name>');
    process.exit(1);
  }

  try {
    const steps = computeSteps(data.tasks);
    writeJSON(stepsPath(project), { steps, computed_at: new Date().toISOString() });

    console.log(`✅ ${steps.length} steps computed from ${data.tasks.length} tasks:\n`);
    for (const step of steps) {
      const taskNames = step.tasks.map(id => {
        const t = data.tasks.find(t => t.id === id);
        return `${id}: ${t?.name || '?'}`;
      });
      console.log(`  🔹 Step ${step.id}: [${taskNames.join(', ')}]`);
    }
    console.log('');
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

function stepsStatus(project) {
  const stepData = readJSON(stepsPath(project));
  const taskData = readJSON(tasksPath(project));

  if (!stepData?.steps?.length) {
    console.log('No steps computed. Run: xm-build steps compute');
    return;
  }

  console.log(`\n🔹 Steps (${stepData.steps.length}):\n`);

  for (const step of stepData.steps) {
    const taskDetails = step.tasks.map(id => {
      const t = taskData.tasks.find(t => t.id === id);
      const icon = {
        pending: '⬜', ready: '🟡', running: '🔵',
        completed: '✅', failed: '❌', cancelled: '⛔',
      }[t?.status || 'pending'];
      return `${icon} ${id}`;
    });

    const allDone = step.tasks.every(id => {
      const t = taskData.tasks.find(t => t.id === id);
      return t?.status === TASK_STATES.COMPLETED;
    });
    const anyRunning = step.tasks.some(id => {
      const t = taskData.tasks.find(t => t.id === id);
      return t?.status === TASK_STATES.RUNNING;
    });

    let stepIcon = '⬜';
    if (allDone) stepIcon = '✅';
    else if (anyRunning) stepIcon = '🔵';

    console.log(`  ${stepIcon} Step ${step.id}: ${taskDetails.join('  ')}`);
  }
  console.log('');
}

function stepsNext(project) {
  const stepData = readJSON(stepsPath(project));
  const taskData = readJSON(tasksPath(project));

  if (!stepData?.steps?.length) {
    console.log('No steps computed. Run: xm-build steps compute');
    return;
  }

  for (const step of stepData.steps) {
    const pendingTasks = step.tasks.filter(id => {
      const t = taskData.tasks.find(t => t.id === id);
      return t && [TASK_STATES.PENDING, TASK_STATES.READY].includes(t.status);
    });

    if (pendingTasks.length > 0) {
      for (const id of pendingTasks) {
        const t = taskData.tasks.find(t => t.id === id);
        if (t) t.status = TASK_STATES.READY;
      }
      writeJSON(tasksPath(project), taskData);

      console.log(`🔹 Step ${step.id} ready — ${pendingTasks.length} tasks:`);
      for (const id of pendingTasks) {
        const t = taskData.tasks.find(t => t.id === id);
        console.log(`  🟡 ${id}: ${t?.name}`);
      }
      return;
    }
  }

  console.log('✅ All steps completed.');
}

// ── Checkpoint ───────────────────────────────────────────────────────

function cmdCheckpoint(args) {
  const { opts, positional } = parseOptions(args);
  const type = positional[0];
  const message = positional.slice(1).join(' ') || opts.message || '';

  if (!type || !GATE_TYPES.includes(type)) {
    console.error(`Usage: xm-build checkpoint <${GATE_TYPES.join('|')}> [message]`);
    process.exit(1);
  }

  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const now = new Date().toISOString();

  const checkpoint = {
    type,
    phase: PHASES.find(p => p.id === manifest.current_phase)?.name || manifest.current_phase,
    message,
    timestamp: now,
  };

  writeJSON(join(checkpointsDir(project), `${now.replace(/[:.]/g, '-')}-${type}.json`), checkpoint);
  logDecision(project, `Checkpoint [${type}]: ${message || '(no message)'}`);
  console.log(`📌 Checkpoint recorded: [${type}] ${message || '(no message)'}`);
}

// ── Context Brief ────────────────────────────────────────────────────

function cmdContext(args) {
  const project = resolveProject(args[0] || null);
  const manifest = readJSON(manifestPath(project));
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);
  const taskData = readJSON(tasksPath(project));
  const stepData = readJSON(stepsPath(project));
  const decisions = readMD(join(contextDir(project), 'decisions.md'));

  // Build brief
  const lines = [
    `# ${manifest.display_name || project} — Context Brief`,
    '',
    `**Phase:** ${currentPhase?.label || manifest.current_phase}`,
    `**Updated:** ${new Date().toISOString().slice(0, 19)}`,
    '',
  ];

  // Phase status summary
  lines.push('## Phase Status');
  for (const phase of PHASES) {
    const status = readJSON(phaseStatusPath(project, phase.id));
    const icon = status?.status === 'completed' ? '✅' : status?.status === 'active' ? '🔵' : '⬜';
    lines.push(`- ${icon} ${phase.label}`);
  }
  lines.push('');

  // Tasks summary
  if (taskData?.tasks?.length > 0) {
    const total = taskData.tasks.length;
    const done = taskData.tasks.filter(t => t.status === TASK_STATES.COMPLETED).length;
    lines.push(`## Tasks: ${done}/${total} completed`);

    if (stepData?.steps?.length > 0) {
      lines.push(`Steps: ${stepData.steps.length}`);
    }
    lines.push('');
  }

  // Recent decisions (last 5)
  if (decisions.trim().length > 30) {
    const decisionLines = decisions.split('\n').filter(l => l.startsWith('- '));
    const recent = decisionLines.slice(-5);
    if (recent.length > 0) {
      lines.push('## Recent Decisions');
      lines.push(...recent);
      lines.push('');
    }
  }

  const brief = lines.join('\n');
  writeMD(join(contextDir(project), 'brief.md'), brief);

  console.log(brief);
  console.log(`📄 Brief saved to: ${join(contextDir(project), 'brief.md')}`);
}

// ── Close ────────────────────────────────────────────────────────────

function cmdClose(args) {
  const { opts } = parseOptions(args);
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const now = new Date().toISOString();

  // Set phase to close
  for (const phase of PHASES) {
    const status = readJSON(phaseStatusPath(project, phase.id));
    if (phase.id === '05-close') {
      status.status = 'active';
      status.started_at = now;
    } else if (status.status !== 'completed') {
      status.status = 'completed';
      status.completed_at = now;
    }
    writeJSON(phaseStatusPath(project, phase.id), status);
  }

  manifest.current_phase = '05-close';
  manifest.updated_at = now;

  // Generate summary
  const taskData = readJSON(tasksPath(project));
  const total = taskData?.tasks?.length || 0;
  const done = taskData?.tasks?.filter(t => t.status === TASK_STATES.COMPLETED).length || 0;
  const decisions = readMD(join(contextDir(project), 'decisions.md'));

  const summaryContent = opts.summary || '';
  const summary = [
    `# Project Summary: ${manifest.display_name || project}`,
    '',
    `**Created:** ${manifest.created_at.slice(0, 10)}`,
    `**Closed:** ${now.slice(0, 10)}`,
    `**Tasks:** ${done}/${total} completed`,
    '',
    summaryContent ? `## Summary\n${summaryContent}\n` : '',
    '## Decisions',
    decisions.split('\n').filter(l => l.startsWith('- ')).join('\n') || '(none)',
    '',
  ].join('\n');

  writeMD(join(phaseDir(project, '05-close'), 'summary.md'), summary);

  // Mark close phase as completed
  const closeStatus = readJSON(phaseStatusPath(project, '05-close'));
  closeStatus.status = 'completed';
  closeStatus.completed_at = now;
  writeJSON(phaseStatusPath(project, '05-close'), closeStatus);
  manifest.current_phase = '05-close';
  writeJSON(manifestPath(project), manifest);

  logDecision(project, `Project closed.${summaryContent ? ` Summary: ${summaryContent}` : ''}`);
  console.log(`✅ Project "${project}" closed.`);
  console.log(`📄 Summary: ${join(phaseDir(project, '05-close'), 'summary.md')}`);
}

// ── Decision Logging ─────────────────────────────────────────────────

function logDecision(project, message) {
  const path = join(contextDir(project), 'decisions.md');
  const existing = readMD(path);
  const timestamp = new Date().toISOString().slice(0, 19);
  const entry = `- [${timestamp}] ${message}\n`;

  if (existing.trim()) {
    writeMD(path, existing + entry);
  } else {
    writeMD(path, `# Decisions Log\n\n${entry}`);
  }
}

// ── Persistent Decision Memory ───────────────────────────────────────

function decisionsPath(project) {
  return join(contextDir(project), 'decisions.json');
}

function addDecision(project, { type, title, rationale, alternatives, phase }) {
  const p = decisionsPath(project);
  const data = readJSON(p) || { decisions: [] };
  const manifest = readJSON(manifestPath(project));
  const currentPhase = phase || PHASES.find(ph => ph.id === manifest?.current_phase)?.name || 'unknown';

  data.decisions.push({
    id: `d${data.decisions.length + 1}`,
    type: type || 'decision',
    title,
    rationale: rationale || '',
    alternatives: alternatives || [],
    phase: currentPhase,
    timestamp: new Date().toISOString(),
  });

  writeJSON(p, data);
  logDecision(project, `[${type || 'decision'}] ${title}`);
}

function cmdDecisions(args) {
  const sub = args[0];
  const project = resolveProject(null);

  if (!sub || sub === 'list') {
    const data = readJSON(decisionsPath(project));
    if (!data?.decisions?.length) {
      console.log('No decisions recorded. Run: xm-build decisions add "title" --rationale "why"');
      return;
    }

    console.log(`\n${C.bold}📜 Decisions (${data.decisions.length})${C.reset}\n`);
    for (const d of data.decisions) {
      const typeIcon = { decision: '🔷', architecture: '🏗️', tradeoff: '⚖️', constraint: '🔒', pivot: '🔄' }[d.type] || '🔷';
      console.log(`  ${typeIcon} ${C.bold}${d.id}${C.reset}: ${d.title} ${C.dim}(${d.phase}, ${d.timestamp.slice(0, 10)})${C.reset}`);
      if (d.rationale) console.log(`     ${C.dim}Why: ${d.rationale}${C.reset}`);
      if (d.alternatives?.length) console.log(`     ${C.dim}Rejected: ${d.alternatives.join(', ')}${C.reset}`);
    }
    console.log('');
    return;
  }

  if (sub === 'add') {
    const { opts, positional } = parseOptions(args.slice(1));
    const title = positional.join(' ');
    if (!title) {
      console.error('Usage: xm-build decisions add "title" [--type decision|architecture|tradeoff] [--rationale "why"] [--alternatives "a,b"]');
      process.exit(1);
    }
    const alts = opts.alternatives ? opts.alternatives.split(',').map(a => a.trim()) : [];
    addDecision(project, { type: opts.type, title, rationale: opts.rationale, alternatives: alts });
    console.log(`✅ Decision recorded: ${title}`);
    return;
  }

  if (sub === 'inject') {
    // Generate injection-ready context from decisions
    const data = readJSON(decisionsPath(project));
    if (!data?.decisions?.length) {
      console.log('No decisions to inject.');
      return;
    }
    const lines = ['## Key Decisions', ''];
    for (const d of data.decisions.slice(-10)) {
      lines.push(`- **${d.title}** (${d.phase}): ${d.rationale || 'no rationale'}`);
    }
    const injection = lines.join('\n');
    console.log(injection);
    return;
  }

  console.error('Usage: xm-build decisions <list|add|inject>');
}

// ── Step Summarizer ──────────────────────────────────────────────────

function archiveDir(project) {
  return join(projectDir(project), 'archive');
}

function summarizeStep(project, stepId) {
  const taskData = readJSON(tasksPath(project));
  const stepData = readJSON(stepsPath(project));
  if (!stepData?.steps || !taskData?.tasks) return null;

  const step = stepData.steps.find(s => s.id === stepId);
  if (!step) return null;

  const taskDetails = step.tasks.map(id => {
    const t = taskData.tasks.find(t => t.id === id);
    return {
      id,
      name: t?.name || '?',
      status: t?.status || 'unknown',
      duration_ms: t?.completed_at && t?.started_at
        ? new Date(t.completed_at) - new Date(t.started_at)
        : null,
    };
  });

  const summary = {
    step_id: stepId,
    total_tasks: taskDetails.length,
    completed: taskDetails.filter(t => t.status === 'completed').length,
    failed: taskDetails.filter(t => t.status === 'failed').length,
    tasks: taskDetails,
    summarized_at: new Date().toISOString(),
  };

  // Archive full step data
  const aDir = archiveDir(project);
  mkdirSync(aDir, { recursive: true });
  writeJSON(join(aDir, `step-${stepId}.json`), summary);

  return summary;
}

function cmdSummarize(args) {
  const project = resolveProject(null);
  const stepData = readJSON(stepsPath(project));
  const taskData = readJSON(tasksPath(project));

  if (!stepData?.steps?.length) {
    console.log('No steps to summarize.');
    return;
  }

  console.log(`\n${C.bold}📋 Step Summaries${C.reset}\n`);

  let totalCompleted = 0;
  let totalFailed = 0;
  let totalDuration = 0;

  for (const step of stepData.steps) {
    const summary = summarizeStep(project, step.id);
    if (!summary) continue;

    totalCompleted += summary.completed;
    totalFailed += summary.failed;

    const durations = summary.tasks.filter(t => t.duration_ms).map(t => t.duration_ms);
    const stepDuration = durations.reduce((a, b) => a + b, 0);
    totalDuration += stepDuration;

    const icon = summary.completed === summary.total_tasks ? '✅' :
                 summary.failed > 0 ? '❌' : '⬜';

    console.log(`  ${icon} Step ${step.id}: ${summary.completed}/${summary.total_tasks} tasks ${C.dim}(${fmtDuration(stepDuration)})${C.reset}`);
    for (const t of summary.tasks) {
      const tIcon = { completed: '✅', failed: '❌', running: '🔵', pending: '⬜', ready: '🟡' }[t.status] || '⬜';
      const dur = t.duration_ms ? ` ${C.dim}${fmtDuration(t.duration_ms)}${C.reset}` : '';
      console.log(`    ${tIcon} ${t.id}: ${t.name}${dur}`);
    }
  }

  console.log(`\n${C.bold}Total:${C.reset} ${totalCompleted} completed, ${totalFailed} failed, ${fmtDuration(totalDuration)} elapsed\n`);
}

// ── Cost Forecasting ─────────────────────────────────────────────────

const MODEL_COSTS = {
  // per 1M tokens (input/output)
  'haiku':  { input: 0.25, output: 1.25 },
  'sonnet': { input: 3.00, output: 15.00 },
  'opus':   { input: 15.00, output: 75.00 },
};

const SIZE_TOKEN_ESTIMATES = {
  small:  { input: 8000,  output: 3000,  turns: 3 },
  medium: { input: 15000, output: 6000,  turns: 6 },
  large:  { input: 30000, output: 12000, turns: 12 },
};

function estimateTaskCost(task, model = 'sonnet') {
  const size = task.size || 'medium';
  const tokens = SIZE_TOKEN_ESTIMATES[size] || SIZE_TOKEN_ESTIMATES.medium;
  const costs = MODEL_COSTS[model] || MODEL_COSTS.sonnet;

  const inputCost = (tokens.input * tokens.turns / 1_000_000) * costs.input;
  const outputCost = (tokens.output * tokens.turns / 1_000_000) * costs.output;

  return {
    input_tokens: tokens.input * tokens.turns,
    output_tokens: tokens.output * tokens.turns,
    cost_usd: inputCost + outputCost,
    model,
  };
}

function cmdForecast(args) {
  const project = resolveProject(null);
  const taskData = readJSON(tasksPath(project));
  const config = loadConfig();
  const defaultModel = config.models?.executor || 'sonnet';

  if (!taskData?.tasks?.length) {
    console.log('No tasks to forecast. Run: xm-build tasks add <name>');
    return;
  }

  console.log(`\n${C.bold}💰 Cost Forecast${C.reset} ${C.dim}(model: ${defaultModel})${C.reset}\n`);

  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const task of taskData.tasks) {
    if (task.status === TASK_STATES.COMPLETED || task.status === TASK_STATES.CANCELLED) continue;

    const model = task.size === 'large' ? 'opus' : defaultModel;
    const est = estimateTaskCost(task, model);
    totalCost += est.cost_usd;
    totalInput += est.input_tokens;
    totalOutput += est.output_tokens;

    const costStr = `$${est.cost_usd.toFixed(3)}`;
    console.log(`  ${task.id}: ${task.name.padEnd(30)} ${C.dim}${task.size.padEnd(8)}${C.reset} ${model.padEnd(8)} ${C.yellow}${costStr}${C.reset}`);
  }

  console.log(`  ${'─'.repeat(60)}`);
  console.log(`  ${'Total'.padEnd(30)} ${' '.repeat(17)} ${C.bold}${C.yellow}$${totalCost.toFixed(3)}${C.reset}`);
  console.log(`  ${C.dim}Input: ~${(totalInput / 1000).toFixed(0)}K tokens, Output: ~${(totalOutput / 1000).toFixed(0)}K tokens${C.reset}`);

  // Budget warning
  const budget = config.budget?.max_usd;
  if (budget) {
    const pct = (totalCost / budget * 100).toFixed(0);
    const color = totalCost > budget ? C.red : totalCost > budget * 0.8 ? C.yellow : C.green;
    console.log(`  ${color}Budget: $${totalCost.toFixed(2)} / $${budget} (${pct}%)${C.reset}`);
  }

  console.log('');
}

// ── Execution Engine ─────────────────────────────────────────────────

function buildAgentPrompt(project, task, briefContent, decisionsContent) {
  const manifest = readJSON(manifestPath(project));
  const lines = [
    `## Task: ${task.name}`,
    `ID: ${task.id} | Size: ${task.size} | Project: ${manifest.display_name || project}`,
    '',
  ];

  if (briefContent) {
    lines.push('## Project Context', briefContent, '');
  }

  if (decisionsContent) {
    lines.push(decisionsContent, '');
  }

  if (task.depends_on?.length > 0) {
    const taskData = readJSON(tasksPath(project));
    lines.push('## Completed Dependencies');
    for (const depId of task.depends_on) {
      const dep = taskData.tasks.find(t => t.id === depId);
      if (dep) lines.push(`- ${dep.id}: ${dep.name} (${dep.status})`);
    }
    lines.push('');
  }

  // Check if template file exists for this task
  if (task.template) {
    const templateFile = join(phaseDir(project, '02-plan'), `${task.template}.md`);
    if (existsSync(templateFile)) {
      lines.push('## Task Template', readMD(templateFile).slice(0, 1500), '');
    }
  }

  lines.push(
    '## Instructions',
    `Complete the task "${task.name}" as described above.`,
    'Follow existing code patterns and conventions.',
    'Write clean, tested code.',
    '',
    '## On Completion',
    `After completing this task, run: node .xm-build/xm-build-cli.mjs tasks update ${task.id} --status completed`,
    `If the task fails, run: node .xm-build/xm-build-cli.mjs tasks update ${task.id} --status failed`,
  );

  return lines.join('\n');
}

function cmdRun(args) {
  const { opts } = parseOptions(args);
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);

  // Validate we're in execute phase
  if (currentPhase?.name !== 'execute') {
    console.error(`❌ Cannot run — current phase is "${currentPhase?.label}". Must be in Execute phase.`);
    console.log(`   Run: xm-build phase set execute`);
    process.exit(1);
  }

  // Check circuit breaker
  if (isCircuitOpen(project)) {
    console.error(`❌ Circuit breaker is OPEN. Wait for cooldown or reset manually.`);
    process.exit(1);
  }

  const taskData = readJSON(tasksPath(project));
  const stepData = readJSON(stepsPath(project));

  if (!stepData?.steps?.length) {
    console.error('❌ No steps computed. Run: xm-build steps compute');
    process.exit(1);
  }

  // Find current step (first with non-completed tasks)
  let currentStep = null;
  for (const step of stepData.steps) {
    const hasPending = step.tasks.some(id => {
      const t = taskData.tasks.find(t => t.id === id);
      return t && ![TASK_STATES.COMPLETED, TASK_STATES.CANCELLED].includes(t.status);
    });
    if (hasPending) {
      currentStep = step;
      break;
    }
  }

  if (!currentStep) {
    console.log('✅ All steps completed. Run: xm-build phase next');
    return;
  }

  // Mark pending tasks as ready
  const readyTasks = [];
  for (const id of currentStep.tasks) {
    const t = taskData.tasks.find(t => t.id === id);
    if (t && [TASK_STATES.PENDING, TASK_STATES.READY].includes(t.status)) {
      // Skip tasks waiting for retry delay
      if (t.next_retry_at && new Date(t.next_retry_at) > new Date()) {
        continue;
      }
      // Check dependencies are completed
      const depsOk = t.depends_on.every(depId => {
        const dep = taskData.tasks.find(d => d.id === depId);
        return dep?.status === TASK_STATES.COMPLETED;
      });
      if (depsOk) {
        t.status = TASK_STATES.READY;
        readyTasks.push(t);
      }
    }
  }
  writeJSON(tasksPath(project), taskData);

  if (readyTasks.length === 0) {
    console.log(`⏳ No ready tasks in Step ${currentStep.id}. Some may be waiting for retries or dependencies.`);
    return;
  }

  // Generate context
  const briefContent = (() => {
    try {
      cmdContext([project]);
      return readMD(join(contextDir(project), 'brief.md'));
    } catch { return ''; }
  })();

  const decisionsData = readJSON(decisionsPath(project));
  const decisionsContent = decisionsData?.decisions?.length
    ? '## Key Decisions\n' + decisionsData.decisions.slice(-5).map(d =>
        `- **${d.title}** (${d.phase}): ${d.rationale || ''}`
      ).join('\n')
    : '';

  // Output mode: json (for skill) or human-readable
  if (opts.json) {
    // Role-based model routing (aligned with xm-agent conventions)
    const ROLE_MODEL_MAP = {
      architect: 'opus', reviewer: 'opus', security: 'opus',
      executor: 'sonnet', designer: 'sonnet', debugger: 'sonnet',
      explorer: 'haiku', writer: 'haiku',
    };
    const plan = readyTasks.map(task => {
      const role = task.role || (task.size === 'large' ? 'deep-executor' : 'executor');
      const model = ROLE_MODEL_MAP[role] || (task.size === 'large' ? 'opus' : 'sonnet');
      return {
        task_id: task.id,
        task_name: task.name,
        size: task.size,
        role,
        agent_type: role === 'deep-executor' || model === 'opus' ? 'deep-executor' : 'executor',
        model,
        prompt: buildAgentPrompt(project, task, briefContent, decisionsContent),
        on_complete: `node ${join(PLUGIN_ROOT, 'lib', 'xm-build-cli.mjs')}${XM_GLOBAL ? ' --global' : ''} tasks update ${task.id} --status completed`,
        on_fail: `node ${join(PLUGIN_ROOT, 'lib', 'xm-build-cli.mjs')}${XM_GLOBAL ? ' --global' : ''} tasks update ${task.id} --status failed`,
      };
    });

    const output = {
      project,
      step: currentStep.id,
      total_steps: stepData.steps.length,
      tasks: plan,
      parallel: readyTasks.length > 1,
    };

    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Human-readable output
  console.log(`\n${C.bold}🚀 Execution Plan — Step ${currentStep.id}/${stepData.steps.length}${C.reset}\n`);

  const ROLE_MODEL_MAP_HR = {
    architect: 'opus', reviewer: 'opus', security: 'opus',
    executor: 'sonnet', designer: 'sonnet', debugger: 'sonnet',
    explorer: 'haiku', writer: 'haiku',
  };
  const cost = readyTasks.reduce((sum, t) => {
    const role = t.role || (t.size === 'large' ? 'deep-executor' : 'executor');
    const model = ROLE_MODEL_MAP_HR[role] || (t.size === 'large' ? 'opus' : 'sonnet');
    return sum + estimateTaskCost(t, model).cost_usd;
  }, 0);
  console.log(`  Tasks: ${readyTasks.length} (${readyTasks.length > 1 ? 'parallel' : 'sequential'})`);
  console.log(`  Estimated cost: ${C.yellow}$${cost.toFixed(3)}${C.reset}\n`);

  for (const task of readyTasks) {
    const role = task.role || (task.size === 'large' ? 'deep-executor' : 'executor');
    const model = ROLE_MODEL_MAP_HR[role] || (task.size === 'large' ? 'opus' : 'sonnet');
    console.log(`  🔹 ${C.bold}${task.id}${C.reset}: ${task.name} → ${C.cyan}${role} (${model})${C.reset}`);
  }

  console.log(`\n${C.dim}To execute, the /xm-build skill will spawn agents for each task.${C.reset}`);
  console.log(`${C.dim}Or run with --json for machine-readable output.${C.reset}\n`);

  // Mark tasks as running
  for (const task of readyTasks) {
    task.status = TASK_STATES.RUNNING;
    task.started_at = new Date().toISOString();
  }
  writeJSON(tasksPath(project), taskData);
  emitHook('task:pre-update', { project, step: currentStep.id, tasks: readyTasks.map(t => t.id) });

  console.log(`${C.green}✅ ${readyTasks.length} tasks marked as RUNNING.${C.reset}`);
}

function cmdRunStatus(args) {
  const project = resolveProject(null);
  const taskData = readJSON(tasksPath(project));
  const stepData = readJSON(stepsPath(project));

  if (!stepData?.steps?.length) {
    console.log('No steps. Run: xm-build steps compute');
    return;
  }

  console.log(`\n${C.bold}🚀 Execution Status${C.reset}\n`);

  let allDone = true;
  for (const step of stepData.steps) {
    const tasks = step.tasks.map(id => taskData.tasks.find(t => t.id === id)).filter(Boolean);
    const completed = tasks.filter(t => t.status === TASK_STATES.COMPLETED).length;
    const running = tasks.filter(t => t.status === TASK_STATES.RUNNING).length;
    const failed = tasks.filter(t => t.status === TASK_STATES.FAILED).length;

    let icon = '⬜';
    if (completed === tasks.length) icon = '✅';
    else if (running > 0) icon = '🔵';
    else if (failed > 0) icon = '❌';

    if (completed < tasks.length) allDone = false;

    console.log(`  ${icon} Step ${step.id}: ${renderBar(completed, tasks.length, 12)}${failed ? ` ${C.red}${failed} failed${C.reset}` : ''}${running ? ` ${C.blue}${running} running${C.reset}` : ''}`);

    for (const t of tasks) {
      const tIcon = { completed: '✅', failed: '❌', running: '🔵', pending: '⬜', ready: '🟡' }[t.status] || '⬜';
      const dur = t.started_at
        ? ` ${C.dim}${fmtDuration((t.completed_at ? new Date(t.completed_at) : new Date()) - new Date(t.started_at))}${C.reset}`
        : '';
      const retry = t.retry_count ? ` ${C.yellow}(retry ${t.retry_count})${C.reset}` : '';
      console.log(`    ${tIcon} ${t.id}: ${t.name}${dur}${retry}`);
    }
  }

  if (allDone) {
    console.log(`\n${C.green}${C.bold}✅ All steps completed! Run: xm-build phase next${C.reset}`);
  }

  // Circuit breaker status
  const cb = getCircuitState(project);
  if (cb.state !== 'closed') {
    console.log(`\n  ${C.red}⚡ Circuit breaker: ${cb.state.toUpperCase()}${C.reset}`);
    if (cb.cooldown_until) console.log(`  ${C.dim}Cooldown until: ${cb.cooldown_until}${C.reset}`);
  }

  console.log('');
}

// ── Export ────────────────────────────────────────────────────────────

function cmdExport(args) {
  const { opts } = parseOptions(args);
  const format = opts.format || 'md';
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const taskData = readJSON(tasksPath(project));
  const stepData = readJSON(stepsPath(project));
  const decisionsData = readJSON(decisionsPath(project));
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);
  const outputDir = opts.output || '.';

  if (format === 'csv') {
    // Google Sheets / Excel compatible
    const header = 'ID,Name,Status,Size,Dependencies,Phase,Created,Completed';
    const rows = (taskData?.tasks || []).map(t =>
      `${t.id},"${t.name}",${t.status},${t.size},"${t.depends_on.join(';')}",${currentPhase?.name || ''},${t.created_at || ''},${t.completed_at || ''}`
    );
    const csv = [header, ...rows].join('\n');
    const file = join(outputDir, `${project}-tasks.csv`);
    writeFileSync(file, csv, 'utf8');
    console.log(`✅ Exported ${rows.length} tasks to ${file}`);
    return;
  }

  if (format === 'jira') {
    // Jira bulk import JSON
    const issues = (taskData?.tasks || []).map(t => ({
      summary: t.name,
      issueType: 'Task',
      priority: t.size === 'large' ? 'High' : t.size === 'small' ? 'Low' : 'Medium',
      status: t.status === 'completed' ? 'Done' : t.status === 'running' ? 'In Progress' : 'To Do',
      labels: [`xm-build`, `step-${findTaskStep(t.id, stepData)}`],
      description: `xm-build task ${t.id}\nSize: ${t.size}\nDependencies: ${t.depends_on.join(', ') || 'none'}`,
    }));
    const file = join(outputDir, `${project}-jira.json`);
    writeJSON(file, { issues });
    console.log(`✅ Exported ${issues.length} issues to ${file} (Jira format)`);
    return;
  }

  if (format === 'confluence') {
    // Confluence wiki markup
    const lines = [
      `h1. ${manifest.display_name || project}`,
      '',
      `*Phase:* ${currentPhase?.label || '?'}`,
      `*Created:* ${manifest.created_at?.slice(0, 10)}`,
      '',
      'h2. Tasks',
      '|| ID || Name || Status || Size || Dependencies ||',
    ];
    for (const t of (taskData?.tasks || [])) {
      const statusIcon = t.status === 'completed' ? '(/)' : t.status === 'failed' ? '(x)' : '(?)';
      lines.push(`| ${t.id} | ${t.name} | ${statusIcon} ${t.status} | ${t.size} | ${t.depends_on.join(', ') || '-'} |`);
    }
    if (stepData?.steps?.length) {
      lines.push('', 'h2. Steps');
      for (const s of stepData.steps) {
        lines.push(`* *Step ${s.id}:* ${s.tasks.join(', ')}`);
      }
    }
    if (decisionsData?.decisions?.length) {
      lines.push('', 'h2. Decisions');
      for (const d of decisionsData.decisions) {
        lines.push(`* *${d.title}* (${d.phase}): ${d.rationale || ''}`);
      }
    }
    const file = join(outputDir, `${project}-confluence.wiki`);
    writeFileSync(file, lines.join('\n'), 'utf8');
    console.log(`✅ Exported to ${file} (Confluence wiki)`);
    return;
  }

  // Default: markdown
  const lines = [
    `# ${manifest.display_name || project}`,
    '',
    `**Phase:** ${currentPhase?.label || '?'}`,
    `**Created:** ${manifest.created_at?.slice(0, 10)}`,
    '',
    '## Tasks',
    '',
    '| ID | Name | Status | Size | Deps |',
    '|----|------|--------|------|------|',
  ];
  for (const t of (taskData?.tasks || [])) {
    const icon = { completed: '✅', failed: '❌', running: '🔵', pending: '⬜', ready: '🟡' }[t.status] || '⬜';
    lines.push(`| ${t.id} | ${t.name} | ${icon} ${t.status} | ${t.size} | ${t.depends_on.join(', ') || '-'} |`);
  }
  if (stepData?.steps?.length) {
    lines.push('', '## Steps', '');
    for (const s of stepData.steps) {
      const taskNames = s.tasks.map(id => {
        const t = taskData?.tasks?.find(t => t.id === id);
        return t ? `${id}: ${t.name}` : id;
      });
      lines.push(`- **Step ${s.id}:** ${taskNames.join(', ')}`);
    }
  }
  if (decisionsData?.decisions?.length) {
    lines.push('', '## Decisions', '');
    for (const d of decisionsData.decisions) {
      lines.push(`- **${d.title}** (${d.phase}): ${d.rationale || ''}`);
    }
  }
  const md = lines.join('\n') + '\n';
  const file = join(outputDir, `${project}-report.md`);
  writeFileSync(file, md, 'utf8');
  console.log(`✅ Exported to ${file}`);
}

function findTaskStep(taskId, stepData) {
  if (!stepData?.steps) return '?';
  const step = stepData.steps.find(s => s.tasks.includes(taskId));
  return step ? step.id : '?';
}

// ── Import ───────────────────────────────────────────────────────────

function cmdImport(args) {
  const { opts, positional } = parseOptions(args);
  const format = opts.from || 'csv';
  const file = positional[0];
  const project = resolveProject(null);

  if (!file) {
    console.error('Usage: xm-build import <file> [--from csv|jira|md]');
    process.exit(1);
  }

  if (!existsSync(file)) {
    console.error(`❌ File not found: ${file}`);
    process.exit(1);
  }

  const data = readJSON(tasksPath(project)) || { tasks: [] };

  if (format === 'csv') {
    const content = readFileSync(file, 'utf8');
    const lines = content.trim().split('\n');
    const header = lines[0].toLowerCase();

    // Detect column positions
    const cols = header.split(',').map(c => c.trim().replace(/"/g, ''));
    const nameIdx = cols.findIndex(c => ['name', 'summary', 'title', '이름'].includes(c));
    const sizeIdx = cols.findIndex(c => ['size', 'priority', '크기'].includes(c));
    const depsIdx = cols.findIndex(c => ['dependencies', 'deps', '의존성'].includes(c));

    if (nameIdx === -1) {
      console.error('❌ CSV must have a "name" or "summary" column.');
      process.exit(1);
    }

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      const name = parts[nameIdx]?.trim();
      if (!name) continue;

      const size = sizeIdx >= 0 ? normSize(parts[sizeIdx]?.trim()) : 'medium';
      const deps = depsIdx >= 0 ? (parts[depsIdx]?.trim().split(';').filter(Boolean)) : [];
      const id = `t${data.tasks.length + 1}`;

      data.tasks.push({
        id, name, depends_on: deps, size,
        status: TASK_STATES.PENDING,
        created_at: new Date().toISOString(),
      });
      imported++;
    }

    writeJSON(tasksPath(project), data);
    console.log(`✅ Imported ${imported} tasks from ${file}`);
    return;
  }

  if (format === 'jira') {
    const jiraData = readJSON(file);
    const issues = jiraData?.issues || jiraData || [];
    let imported = 0;

    for (const issue of (Array.isArray(issues) ? issues : [])) {
      const name = issue.summary || issue.fields?.summary || issue.name;
      if (!name) continue;

      const priority = issue.priority || issue.fields?.priority?.name || 'Medium';
      const size = normSize(priority);
      const id = `t${data.tasks.length + 1}`;

      data.tasks.push({
        id, name, depends_on: [], size,
        status: TASK_STATES.PENDING,
        created_at: new Date().toISOString(),
        source: 'jira',
        source_key: issue.key || issue.id || null,
      });
      imported++;
    }

    writeJSON(tasksPath(project), data);
    console.log(`✅ Imported ${imported} tasks from ${file} (Jira)`);
    return;
  }

  console.error(`❌ Unsupported format: ${format}. Use: csv, jira`);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'; // escaped quote ""
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { result.push(current); current = ''; i++; continue; }
      current += ch;
      i++;
    }
  }
  result.push(current);
  return result;
}

function normSize(val) {
  if (!val) return 'medium';
  const v = val.toLowerCase();
  if (['small', 'low', '간단', 's'].includes(v)) return 'small';
  if (['large', 'high', '복잡', 'l', 'xl'].includes(v)) return 'large';
  return 'medium';
}

// ── Plan (auto-decompose support) ────────────────────────────────────

function cmdPlan(args) {
  const goal = args.join(' ');
  const project = resolveProject(null);

  if (!goal) {
    // Show current plan
    const taskData = readJSON(tasksPath(project));
    const stepData = readJSON(stepsPath(project));
    if (!taskData?.tasks?.length) {
      console.log('No plan yet. Use: /xm-build plan "목표를 설명하세요"');
      return;
    }
    taskList(project);
    if (stepData?.steps?.length) stepsStatus(project);
    return;
  }

  // Output goal as JSON for the skill to parse and generate tasks
  const manifest = readJSON(manifestPath(project));
  const output = {
    action: 'auto-plan',
    project,
    goal,
    current_phase: PHASES.find(p => p.id === manifest?.current_phase)?.name,
    existing_tasks: readJSON(tasksPath(project))?.tasks?.length || 0,
    templates_available: existsSync(templatesDir())
      ? readdirSync(join(templatesDir(), 'tasks')).map(f => f.replace('.md', ''))
      : [],
    // Research artifacts for informed planning
    has_context: existsSync(join(contextDir(project), 'CONTEXT.md')),
    has_requirements: existsSync(join(contextDir(project), 'REQUIREMENTS.md')),
    context_summary: existsSync(join(contextDir(project), 'CONTEXT.md'))
      ? readMD(join(contextDir(project), 'CONTEXT.md'))?.slice(0, 2000)
      : null,
    requirements_summary: existsSync(join(contextDir(project), 'REQUIREMENTS.md'))
      ? readMD(join(contextDir(project), 'REQUIREMENTS.md'))?.slice(0, 2000)
      : null,
    roadmap_summary: existsSync(join(contextDir(project), 'ROADMAP.md'))
      ? readMD(join(contextDir(project), 'ROADMAP.md'))?.slice(0, 2000)
      : null,
  };

  console.log(JSON.stringify(output, null, 2));
}

// ── Alias Install ────────────────────────────────────────────────────

function cmdAlias(args) {
  const sub = args[0] || 'install';
  if (sub === 'install') {
    const cliPath = resolve(__filename);
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // PowerShell profile
      const psProfile = join(homedir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
      const psAlias = `\n# xm-build alias\nfunction xmb { node "${cliPath}" @args }\n`;

      const existing = existsSync(psProfile) ? readFileSync(psProfile, 'utf8') : '';
      if (existing.includes('function xmb')) {
        console.log(`✅ Alias "xmb" already installed in PowerShell profile`);
        return;
      }

      mkdirSync(dirname(psProfile), { recursive: true });
      appendFileSync(psProfile, psAlias, 'utf8');
      console.log(`✅ Alias "xmb" installed in PowerShell profile`);
      console.log(`   Restart PowerShell or run: . $PROFILE`);
      console.log(`   Then use: xmb status, xmb init, etc.`);
    } else {
      // Unix: zsh/bash
      const shell = process.env.SHELL || '/bin/zsh';
      const rcFile = shell.includes('zsh')
        ? join(homedir(), '.zshrc')
        : join(homedir(), '.bashrc');

      const alias = `\n# xm-build alias\nalias xmb='node ${cliPath}'\n`;
      const completion = `complete -W "init list status phase gate tasks steps checkpoint context close quality watch dashboard export import plan forecast decisions templates mode alias help" xmb 2>/dev/null\n`;

      const existing = existsSync(rcFile) ? readFileSync(rcFile, 'utf8') : '';
      if (existing.includes("alias xmb=")) {
        console.log(`✅ Alias "xmb" already installed in ${basename(rcFile)}`);
        return;
      }

      appendFileSync(rcFile, alias + completion, 'utf8');
      console.log(`✅ Alias "xmb" installed in ${basename(rcFile)}`);
      console.log(`   Run: source ${rcFile}`);
      console.log(`   Then use: xmb status, xmb init, etc.`);
    }
  } else if (sub === 'remove') {
    console.log(`Remove the "xmb" alias from your shell profile.`);
  }
}

// ── Quality (manual run) ─────────────────────────────────────────────

function cmdQuality(args) {
  const project = resolveProject(null);
  console.log(`${C.bold}🔍 Running quality checks...${C.reset}\n`);
  const results = detectAndRunQualityChecks(project);

  if (results.length === 0) {
    console.log(`  ${C.dim}No test/lint/build tools detected.${C.reset}`);
    return;
  }

  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.check}${r.passed ? '' : `\n     ${C.red}${r.output.slice(0, 200)}${C.reset}`}`);
  }

  const passCount = results.filter(r => r.passed).length;
  console.log(`\n${renderBar(passCount, results.length)} quality checks`);
}

// ── Watch Mode ───────────────────────────────────────────────────────

function cmdWatch(args) {
  const { opts } = parseOptions(args);
  const interval = parseInt(opts.interval || '5', 10) * 1000;

  console.log(`${C.dim}Watching every ${interval / 1000}s... (Ctrl+C to stop)${C.reset}`);

  const render = () => {
    process.stdout.write('\x1b[2J\x1b[H'); // ANSI clear
    try {
      cmdStatus([]);
      const project = resolveProject(null);
      const stepData = readJSON(stepsPath(project));
      if (stepData?.steps?.length) {
        stepsStatus(project);
      }
    } catch { /* ignore */ }
  };

  render();
  const timer = setInterval(render, interval);
  process.on('SIGINT', () => { clearInterval(timer); console.log('\n👋 Watch stopped.'); process.exit(0); });
}

// ── Dashboard (multi-project) ────────────────────────────────────────

function cmdDashboard() {
  const dir = projectsDir();
  if (!existsSync(dir)) { console.log('No projects.'); return; }
  const projects = readdirSync(dir).filter(d => existsSync(manifestPath(d)));
  if (projects.length === 0) { console.log('No projects.'); return; }

  console.log(`\n${C.bold}${C.cyan}📊 xm-build Dashboard${C.reset}\n`);

  const header = `  ${C.bold}${'Project'.padEnd(20)} ${'Phase'.padEnd(12)} ${'Tasks'.padEnd(12)} Health${C.reset}`;
  console.log(header);
  console.log(`  ${'─'.repeat(55)}`);

  for (const p of projects) {
    const m = readJSON(manifestPath(p));
    const phase = PHASES.find(ph => ph.id === m.current_phase);
    const taskData = readJSON(tasksPath(p));
    const total = taskData?.tasks?.length || 0;
    const done = taskData?.tasks?.filter(t => t.status === TASK_STATES.COMPLETED).length || 0;
    const failed = taskData?.tasks?.filter(t => t.status === TASK_STATES.FAILED).length || 0;

    let health = '🟢';
    if (failed > 0) health = '🔴';
    else if (total > 0 && done < total / 2) health = '🟡';

    const taskStr = total > 0 ? `${done}/${total}` : '-';
    console.log(`  ${p.padEnd(20)} ${(phase?.label || '?').padEnd(12)} ${taskStr.padEnd(12)} ${health}`);
  }
  console.log('');
}

// ── Metrics Report ───────────────────────────────────────────────────

function cmdMetrics(args) {
  const mp = metricsPath();
  if (!existsSync(mp)) {
    console.log('No metrics recorded yet.');
    return;
  }

  const lines = readFileSync(mp, 'utf8').trim().split('\n').filter(Boolean);
  const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  const phases = entries.filter(e => e.type === 'phase_complete');
  const tasks = entries.filter(e => e.type === 'task_complete');

  console.log(`\n${C.bold}📈 Metrics${C.reset}\n`);

  if (phases.length > 0) {
    console.log(`${C.bold}Phase Durations:${C.reset}`);
    const byPhase = {};
    for (const p of phases) {
      if (!byPhase[p.phase]) byPhase[p.phase] = [];
      byPhase[p.phase].push(p.duration_ms);
    }
    for (const [phase, durations] of Object.entries(byPhase)) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      console.log(`  ${phase.padEnd(12)} avg: ${fmtDuration(avg)}  (${durations.length} runs)`);
    }
    console.log('');
  }

  if (tasks.length > 0) {
    const totalMs = tasks.reduce((a, t) => a + t.duration_ms, 0);
    const avgMs = totalMs / tasks.length;
    console.log(`${C.bold}Task Velocity:${C.reset}`);
    console.log(`  ${tasks.length} tasks completed, avg: ${fmtDuration(avgMs)}/task`);
    if (totalMs > 0) {
      const tasksPerHour = (tasks.length / (totalMs / 3600000)).toFixed(1);
      console.log(`  ${tasksPerHour} tasks/hour`);
    }
    console.log('');
  }
}

// ── Phase Context (enhanced) ─────────────────────────────────────────

function cmdPhaseContext(args) {
  const project = resolveProject(args[0] || null);
  const manifest = readJSON(manifestPath(project));
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);
  const phaseName = currentPhase?.name || 'research';

  const ctx = loadPhaseContext(project, phaseName);
  console.log(`\n${C.bold}Phase-Aware Context: ${currentPhase?.label}${C.reset}`);
  console.log(`${C.dim}Only loading keys relevant to this phase:${C.reset}`);
  console.log(`  Keys: ${(CONTEXT_MANIFESTS[phaseName] || []).join(', ')}\n`);
  console.log(JSON.stringify(ctx, null, 2).slice(0, 1000));
  console.log('');
}

// ── Help ──────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${C.bold}xm-build${C.reset} — Phase-Based Project Harness CLI

${C.bold}Project:${C.reset}
  init <name>                    Create a new project
  list                           List all projects
  status [project]               Show project status (with progress bar)
  next                           Smart workflow routing — what to do next
  handoff [--restore]            Save/restore session state for continuity

${C.bold}Research Phase:${C.reset}
  discuss [--mode interview]     Gather requirements via interview or assumptions
  research [goal]                Parallel agent investigation (stack/features/arch/pitfalls)

${C.bold}Plan Phase:${C.reset}
  plan ["goal"]                  Show plan or auto-decompose goal into tasks
  plan-check                     Validate plan across 8 quality dimensions
  phase <next|set|status>        Manage phases
  gate <pass|fail> [message]     Resolve current phase gate

${C.bold}Execute Phase:${C.reset}
  tasks <add|list|remove|update> Manage tasks
  steps <compute|status|next>    DAG-based step management
  run                            Execute next step via agent orchestration
  checkpoint <type> [message]    Record a checkpoint

${C.bold}Verify & Close:${C.reset}
  quality                        Run quality checks (test/lint/build)
  verify-coverage                Check requirement coverage across tasks
  context [project]              Generate context brief
  close [--summary "..."]        Close project with summary

${C.bold}Analysis & Utilities:${C.reset}
  context-usage                  Show project artifact token usage
  save <type>                    Save artifact (context|requirements|roadmap|project|plan)
  watch [--interval N]           Auto-refresh status every N seconds
  dashboard                      Multi-project overview
  metrics                        Show phase/task analytics
  phase-context                  Show phase-aware context loading
  alias install                  Install 'xmb' shell alias
  help                           Show this help

${C.bold}Phase Lifecycle:${C.reset}
  Research → Plan → Execute → Verify → Close

${C.bold}Examples:${C.reset}
  xmb init my-api
  xmb discuss --mode interview
  xmb research "Build a REST API with auth"
  xmb plan "Build a REST API with auth and CRUD"
  xmb plan-check
  xmb next
  xmb tasks add "Create DB schema" --size small
  xmb steps compute
  xmb run
  xmb verify-coverage
  xmb handoff
  xmb context-usage
`);
}

// ── Interactive Mode ─────────────────────────────────────────────────

function createRL() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function pickMenu(rl, title, options) {
  console.log(`\n${title}\n`);
  for (let i = 0; i < options.length; i++) {
    console.log(`  ${i + 1}) ${options[i].label}`);
  }
  console.log('  0) Exit\n');

  while (true) {
    const answer = await ask(rl, '  → ');
    const num = parseInt(answer.trim(), 10);
    if (num === 0) return null;
    if (num >= 1 && num <= options.length) return options[num - 1];
    console.log(`  ⚠ 1-${options.length} 또는 0을 입력하세요.`);
  }
}

function getPhaseActions(manifest, config) {
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);
  if (!currentPhase) return [];

  const gateKey = `${currentPhase.name}-exit`;
  const gateType = config.gates?.[gateKey] || 'auto';

  const actions = [];

  switch (currentPhase.name) {
    case 'research':
      actions.push(
        { label: '📝 리서치 노트 보기/편집 안내', action: 'show-notes' },
        { label: '➡️  다음 단계 (Plan)로 이동', action: 'phase-next' },
      );
      break;
    case 'plan':
      actions.push(
        { label: '➕ 태스크 추가', action: 'task-add' },
        { label: '📋 태스크 목록', action: 'task-list' },
        { label: '🔹 Step 계산', action: 'step-compute' },
      );
      if (gateType === 'human-verify') {
        actions.push({ label: '✅ 계획 승인 (gate pass)', action: 'gate-pass' });
      }
      actions.push({ label: '➡️  다음 단계 (Execute)로 이동', action: 'phase-next' });
      break;
    case 'execute':
      actions.push(
        { label: '🔹 Step 상태 확인', action: 'step-status' },
        { label: '▶️  다음 Step 활성화', action: 'step-next' },
        { label: '✏️  태스크 상태 변경', action: 'task-update' },
        { label: '➡️  다음 단계 (Verify)로 이동', action: 'phase-next' },
      );
      break;
    case 'verify':
      actions.push(
        { label: '📌 체크포인트 기록', action: 'checkpoint' },
        { label: '📄 Context Brief 생성', action: 'context' },
        { label: '➡️  다음 단계 (Close)로 이동', action: 'phase-next' },
      );
      break;
    case 'close':
      actions.push(
        { label: '🏁 프로젝트 종료', action: 'close' },
      );
      break;
  }

  return actions;
}

async function interactiveTaskAdd(rl, project) {
  const name = await ask(rl, '  태스크 이름: ');
  if (!name.trim()) { console.log('  ⚠ 이름이 비어있습니다.'); return; }

  const depsInput = await ask(rl, '  의존성 (예: t1,t2, 없으면 Enter): ');
  const deps = depsInput.trim() ? depsInput.trim().split(',').map(d => d.trim()) : [];

  const sizeChoice = await pickMenu(rl, '  태스크 크기:', [
    { label: 'Small', value: 'small' },
    { label: 'Medium', value: 'medium' },
    { label: 'Large', value: 'large' },
  ]);
  const size = sizeChoice?.value || 'medium';

  const args = [name.trim()];
  if (deps.length) args.push('--deps', deps.join(','));
  args.push('--size', size);
  taskAdd(project, args);
}

async function interactiveTaskUpdate(rl, project) {
  const data = readJSON(tasksPath(project));
  if (!data?.tasks?.length) { console.log('  태스크가 없습니다.'); return; }

  // Show tasks
  taskList(project);

  const id = await ask(rl, '  변경할 태스크 ID (예: t1): ');
  if (!id.trim()) return;

  const statusChoice = await pickMenu(rl, '  새 상태:', [
    { label: '🟡 Ready', value: 'ready' },
    { label: '🔵 Running', value: 'running' },
    { label: '✅ Completed', value: 'completed' },
    { label: '❌ Failed', value: 'failed' },
  ]);
  if (!statusChoice) return;

  taskUpdate(project, [id.trim(), '--status', statusChoice.value]);
}

async function interactiveCheckpoint(rl, project) {
  const typeChoice = await pickMenu(rl, '  체크포인트 유형:', [
    { label: 'Auto (자동 검증)', value: 'auto' },
    { label: 'Human-verify (수동 확인)', value: 'human-verify' },
    { label: 'Human-action (사용자 행동)', value: 'human-action' },
    { label: 'Quality (품질 게이트)', value: 'quality' },
  ]);
  if (!typeChoice) return;

  const message = await ask(rl, '  메시지 (선택): ');
  cmdCheckpoint([typeChoice.value, ...(message.trim() ? [message.trim()] : [])]);
}

async function interactiveDashboard() {
  const rl = createRL();
  const config = loadConfig();

  try {
    // Check if any project exists
    const current = findCurrentProject();

    if (!current) {
      console.log('\n⚙️  xm-build — Phase-Based Project Harness\n');
      console.log('  프로젝트가 없습니다.\n');
      const name = await ask(rl, '  새 프로젝트 이름 (취소: Enter): ');
      if (name.trim()) {
        cmdInit([name.trim()]);
      }
      rl.close();
      return;
    }

    // Main loop
    let running = true;
    while (running) {
      // Show status
      cmdStatus([current]);

      const manifest = readJSON(manifestPath(current));
      const actions = getPhaseActions(manifest, config);

      // Add common actions
      const allActions = [
        ...actions,
        { label: '─────────────────', action: 'separator' },
        { label: '📊 전체 상태 보기', action: 'status' },
        { label: '📄 Context Brief 생성', action: 'context' },
        { label: '📋 프로젝트 목록', action: 'list' },
        { label: '🆕 새 프로젝트 생성', action: 'new-project' },
      ].filter(a => a.action !== 'separator');

      const choice = await pickMenu(rl, '🔧 액션 선택:', allActions);

      if (!choice) { running = false; break; }

      switch (choice.action) {
        case 'phase-next':
          phaseNext([current]);
          break;

        case 'gate-pass': {
          const msg = await ask(rl, '  승인 메시지 (선택): ');
          cmdGate(['pass', ...(msg.trim() ? [msg.trim()] : [])]);
          break;
        }

        case 'task-add':
          await interactiveTaskAdd(rl, current);
          break;

        case 'task-list':
          taskList(current);
          break;

        case 'task-update':
          await interactiveTaskUpdate(rl, current);
          break;

        case 'step-compute':
          stepsCompute(current);
          break;

        case 'step-status':
          stepsStatus(current);
          break;

        case 'step-next':
          stepsNext(current);
          break;

        case 'checkpoint':
          await interactiveCheckpoint(rl, current);
          break;

        case 'context':
          cmdContext([current]);
          break;

        case 'show-notes': {
          const notesFile = join(phaseDir(current, '01-research'), 'notes.md');
          console.log(`\n📝 리서치 노트: ${notesFile}`);
          console.log(readMD(notesFile) || '  (비어있음)');
          break;
        }

        case 'close': {
          const summary = await ask(rl, '  종료 요약 (선택): ');
          cmdClose(summary.trim() ? ['--summary', summary.trim()] : []);
          running = false;
          break;
        }

        case 'status':
          cmdStatus([current]);
          break;

        case 'list':
          cmdList();
          break;

        case 'new-project': {
          const name = await ask(rl, '  프로젝트 이름: ');
          if (name.trim()) cmdInit([name.trim()]);
          break;
        }
      }

      if (running) {
        const cont = await ask(rl, '\n  계속하려면 Enter (종료: q): ');
        if (cont.trim().toLowerCase() === 'q') running = false;
      }
    }
  } finally {
    rl.close();
  }

  console.log('\n👋 xm-build 종료.\n');
}

async function interactiveInit() {
  const rl = createRL();
  try {
    const name = await ask(rl, '  프로젝트 이름: ');
    if (name.trim()) {
      cmdInit([name.trim()]);
    } else {
      console.log('  ⚠ 이름이 비어있습니다.');
    }
  } finally {
    rl.close();
  }
}

async function interactiveTasksAdd() {
  const project = resolveProject(null);
  const rl = createRL();
  try {
    let adding = true;
    while (adding) {
      await interactiveTaskAdd(rl, project);
      const more = await ask(rl, '\n  태스크 더 추가? (y/N): ');
      if (more.trim().toLowerCase() !== 'y') adding = false;
    }
  } finally {
    rl.close();
  }
}

// ── New Commands: discuss, research, plan-check, next, handoff, verify-coverage, context-usage, save ──

function cmdDiscuss(args) {
  const { opts } = parseOptions(args);
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const mode = opts.mode || 'interview'; // interview | assumptions

  // Output JSON for the skill to process
  const output = {
    action: 'discuss',
    project,
    mode,
    goal: manifest.display_name || project,
    current_phase: PHASES.find(p => p.id === manifest.current_phase)?.name,
    existing_context: existsSync(join(contextDir(project), 'CONTEXT.md'))
      ? readMD(join(contextDir(project), 'CONTEXT.md'))?.slice(0, 500)
      : null,
  };

  console.log(JSON.stringify(output, null, 2));
}

function cmdResearch(args) {
  const { opts, positional } = parseOptions(args);
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const goal = positional.join(' ') || manifest.display_name || project;

  const output = {
    action: 'research',
    project,
    goal,
    agents: parseInt(opts.agents || String(getAgentCount())),
    perspectives: ['stack', 'features', 'architecture', 'pitfalls'],
    model: opts.model || 'sonnet',
    existing_requirements: existsSync(join(contextDir(project), 'REQUIREMENTS.md'))
      ? readMD(join(contextDir(project), 'REQUIREMENTS.md'))?.slice(0, 500)
      : null,
    existing_context: existsSync(join(contextDir(project), 'CONTEXT.md'))
      ? readMD(join(contextDir(project), 'CONTEXT.md'))?.slice(0, 500)
      : null,
  };

  console.log(JSON.stringify(output, null, 2));
}

function cmdPlanCheck(args) {
  const project = resolveProject(null);
  const taskData = readJSON(tasksPath(project));
  const requirements = readMD(join(contextDir(project), 'REQUIREMENTS.md'));
  const context = readMD(join(contextDir(project), 'CONTEXT.md'));

  const checks = [];
  const tasks = taskData?.tasks || [];

  // 1. Atomicity: each task should be completable in one session
  for (const t of tasks) {
    if (t.size === 'large' && !t.depends_on?.length) {
      checks.push({ dim: 'atomicity', level: 'warn', task: t.id, msg: `Task "${t.name}" is large with no dependencies — consider splitting` });
    }
  }

  // 2. Dependencies: no orphan deps
  const ids = new Set(tasks.map(t => t.id));
  for (const t of tasks) {
    for (const dep of (t.depends_on || [])) {
      if (!ids.has(dep)) {
        checks.push({ dim: 'dependencies', level: 'error', task: t.id, msg: `Unknown dependency "${dep}"` });
      }
    }
  }

  // 3. Cycle detection
  try {
    computeSteps(tasks);
  } catch (e) {
    checks.push({ dim: 'dependencies', level: 'error', msg: e.message });
  }

  // 4. Requirements coverage (if REQUIREMENTS.md exists)
  if (requirements) {
    const reqIds = [...requirements.matchAll(/^-\s*\[R(\d+)\]/gm)].map(m => `R${m[1]}`);
    if (reqIds.length > 0) {
      const taskText = tasks.map(t => t.name).join(' ');
      for (const rid of reqIds) {
        if (!taskText.includes(rid)) {
          checks.push({ dim: 'coverage', level: 'warn', msg: `Requirement ${rid} not referenced in any task name` });
        }
      }
    }
  }

  // 5. Size distribution
  const sizes = { small: 0, medium: 0, large: 0 };
  for (const t of tasks) sizes[t.size || 'medium']++;
  if (tasks.length > 0 && sizes.large / tasks.length > 0.5) {
    checks.push({ dim: 'granularity', level: 'warn', msg: `>50% tasks are large — consider decomposing further` });
  }

  // 6. Task count sanity
  if (tasks.length === 0) {
    checks.push({ dim: 'completeness', level: 'error', msg: 'No tasks defined' });
  } else if (tasks.length < 3) {
    checks.push({ dim: 'completeness', level: 'warn', msg: 'Very few tasks — plan may be too coarse' });
  }

  // 7. Context fit: CONTEXT.md should exist if discuss was done
  if (!context) {
    checks.push({ dim: 'context', level: 'warn', msg: 'No CONTEXT.md found — run discuss first for better plans' });
  }

  // 8. Naming: tasks should start with a verb
  const verbPattern = /^(add|create|implement|design|setup|configure|write|build|test|fix|update|remove|refactor|migrate|deploy|integrate|validate|analyze|research|review|document)/i;
  for (const t of tasks) {
    if (!verbPattern.test(t.name)) {
      checks.push({ dim: 'naming', level: 'info', task: t.id, msg: `"${t.name}" — consider starting with a verb` });
    }
  }

  // Output
  const errors = checks.filter(c => c.level === 'error');
  const warns = checks.filter(c => c.level === 'warn');

  console.log(`\n${C.bold}Plan Check — ${tasks.length} tasks${C.reset}\n`);

  const dims = ['atomicity', 'dependencies', 'coverage', 'granularity', 'completeness', 'context', 'naming', 'overall'];
  for (const dim of dims) {
    const dimChecks = checks.filter(c => c.dim === dim);
    if (dimChecks.length === 0) {
      console.log(`  [pass] ${dim}`);
    } else {
      const hasError = dimChecks.some(c => c.level === 'error');
      const icon = hasError ? '[FAIL]' : '[warn]';
      console.log(`  ${icon} ${dim}`);
      for (const c of dimChecks) {
        const lvl = c.level === 'error' ? C.red : c.level === 'warn' ? C.yellow : C.dim;
        console.log(`     ${lvl}${c.task ? `[${c.task}] ` : ''}${c.msg}${C.reset}`);
      }
    }
  }

  console.log('');
  if (errors.length > 0) {
    console.log(`  ${C.red}${errors.length} errors — fix before proceeding${C.reset}`);
  } else if (warns.length > 0) {
    console.log(`  ${C.yellow}${warns.length} warnings — review recommended${C.reset}`);
  } else {
    console.log(`  ${C.green}All checks passed${C.reset}`);
  }

  // Save results
  writeJSON(join(phaseDir(project, '02-plan'), 'plan-check.json'), {
    timestamp: new Date().toISOString(),
    tasks_count: tasks.length,
    checks,
    passed: errors.length === 0,
  });

  console.log('');
}

function cmdNext(args) {
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const phase = PHASES.find(p => p.id === manifest.current_phase);
  const taskData = readJSON(tasksPath(project));
  const contextExists = existsSync(join(contextDir(project), 'CONTEXT.md'));
  const reqExists = existsSync(join(contextDir(project), 'REQUIREMENTS.md'));
  const planCheckExists = existsSync(join(phaseDir(project, '02-plan'), 'plan-check.json'));

  console.log(`\n${C.bold}Next Step${C.reset}\n`);
  console.log(`  Project: ${manifest.display_name || project}`);
  console.log(`  Phase:   ${phase?.label || '?'}\n`);

  switch (phase?.name) {
    case 'research': {
      if (!contextExists) {
        console.log(`  ${C.yellow}-> Run: xm-build discuss${C.reset}`);
        console.log(`    Gather requirements through interview or assumptions mode`);
      } else if (!reqExists) {
        console.log(`  ${C.yellow}-> Run: xm-build research${C.reset}`);
        console.log(`    4 parallel agents will investigate stack, features, architecture, pitfalls`);
      } else {
        console.log(`  ${C.green}-> Run: xm-build phase next${C.reset}`);
        console.log(`    Research artifacts ready — proceed to Plan phase`);
      }
      break;
    }
    case 'plan': {
      const tasks = taskData?.tasks || [];
      if (tasks.length === 0) {
        console.log(`  ${C.yellow}-> Run: xm-build plan "goal description"${C.reset}`);
        console.log(`    Decompose the goal into atomic tasks`);
      } else if (!planCheckExists) {
        console.log(`  ${C.yellow}-> Run: xm-build plan-check${C.reset}`);
        console.log(`    Validate plan across 8 dimensions`);
      } else {
        const checkResult = readJSON(join(phaseDir(project, '02-plan'), 'plan-check.json'));
        if (!checkResult?.passed) {
          console.log(`  ${C.yellow}-> Fix plan-check errors, then: xm-build plan-check${C.reset}`);
        } else {
          console.log(`  ${C.green}-> Run: xm-build phase next${C.reset}`);
          console.log(`    Plan validated — proceed to Execute phase`);
        }
      }
      break;
    }
    case 'execute': {
      const stepData = readJSON(stepsPath(project));
      if (!stepData?.steps?.length) {
        console.log(`  ${C.yellow}-> Run: xm-build steps compute${C.reset}`);
        console.log(`    Calculate execution order from task dependencies`);
      } else {
        const allDone = (taskData?.tasks || []).every(t =>
          [TASK_STATES.COMPLETED, TASK_STATES.CANCELLED].includes(t.status)
        );
        if (allDone) {
          console.log(`  ${C.green}-> Run: xm-build phase next${C.reset}`);
          console.log(`    All tasks completed — proceed to Verify phase`);
        } else {
          console.log(`  ${C.yellow}-> Run: xm-build run${C.reset}`);
          console.log(`    Execute next step via agent orchestration`);
        }
      }
      break;
    }
    case 'verify': {
      console.log(`  ${C.yellow}-> Run: xm-build quality${C.reset}`);
      console.log(`    Run test/lint/build checks`);
      console.log(`    Then: xm-build verify-coverage`);
      break;
    }
    case 'close': {
      console.log(`  ${C.yellow}-> Run: xm-build close --summary "..."${C.reset}`);
      console.log(`    Finalize the project`);
      break;
    }
    default:
      console.log(`  ${C.dim}Unknown phase state${C.reset}`);
  }
  console.log('');
}

function cmdHandoff(args) {
  const { opts } = parseOptions(args);
  const project = resolveProject(null);
  const handoffPath = join(projectDir(project), 'HANDOFF.json');

  if (opts.restore || args[0] === '--restore') {
    // Restore
    if (!existsSync(handoffPath)) {
      console.log('No handoff file found.');
      return;
    }
    const handoff = readJSON(handoffPath);
    console.log(`\n${C.bold}Session Handoff — ${handoff.project}${C.reset}`);
    console.log(`  Saved: ${handoff.saved_at}`);
    console.log(`  Phase: ${handoff.phase}`);
    console.log(`\n${C.bold}Summary:${C.reset}`);
    console.log(`  ${handoff.summary}`);
    if (handoff.pending_tasks?.length) {
      console.log(`\n${C.bold}Pending tasks:${C.reset}`);
      for (const t of handoff.pending_tasks) {
        console.log(`  [ ] ${t.id}: ${t.name}`);
      }
    }
    if (handoff.recent_decisions?.length) {
      console.log(`\n${C.bold}Recent decisions:${C.reset}`);
      for (const d of handoff.recent_decisions) {
        console.log(`  * ${d}`);
      }
    }
    console.log('');
    return;
  }

  // Save handoff
  const manifest = readJSON(manifestPath(project));
  const phase = PHASES.find(p => p.id === manifest.current_phase);
  const taskData = readJSON(tasksPath(project));
  const decisions = readJSON(join(contextDir(project), 'decisions.json'));

  const pendingTasks = (taskData?.tasks || [])
    .filter(t => ![TASK_STATES.COMPLETED, TASK_STATES.CANCELLED].includes(t.status))
    .map(t => ({ id: t.id, name: t.name, status: t.status }));

  const recentDecisions = (decisions?.decisions || [])
    .slice(-5)
    .map(d => d.title);

  const completedCount = (taskData?.tasks || []).filter(t => t.status === TASK_STATES.COMPLETED).length;
  const totalCount = (taskData?.tasks || []).length;

  const handoff = {
    project,
    phase: phase?.label || manifest.current_phase,
    saved_at: new Date().toISOString(),
    summary: `Phase: ${phase?.label}. Tasks: ${completedCount}/${totalCount} completed. ${pendingTasks.length} remaining.`,
    pending_tasks: pendingTasks,
    recent_decisions: recentDecisions,
    context_files: {
      has_context: existsSync(join(contextDir(project), 'CONTEXT.md')),
      has_requirements: existsSync(join(contextDir(project), 'REQUIREMENTS.md')),
      has_roadmap: existsSync(join(contextDir(project), 'ROADMAP.md')),
    },
  };

  writeJSON(handoffPath, handoff);
  console.log(`Handoff saved for "${project}"`);
  console.log(`   Restore in new session: xm-build handoff --restore`);
}

function cmdVerifyCoverage(args) {
  const project = resolveProject(null);
  const requirements = readMD(join(contextDir(project), 'REQUIREMENTS.md'));
  const taskData = readJSON(tasksPath(project));
  const tasks = taskData?.tasks || [];

  if (!requirements) {
    console.log('No REQUIREMENTS.md found. Run: xm-build research');
    return;
  }

  // Extract requirement IDs from REQUIREMENTS.md
  // Expected format: - [R1] Description or - [REQ-1] Description
  const reqPattern = /^-\s*\[(R(?:EQ-?)?\d+)\]\s*(.+)/gm;
  const reqs = [];
  let match;
  while ((match = reqPattern.exec(requirements)) !== null) {
    reqs.push({ id: match[1], desc: match[2].trim() });
  }

  if (reqs.length === 0) {
    console.log(`${C.yellow}No structured requirements found in REQUIREMENTS.md${C.reset}`);
    console.log(`  Expected format: - [R1] Description`);
    return;
  }

  console.log(`\n${C.bold}Requirement Coverage${C.reset}\n`);

  let covered = 0;
  let uncovered = 0;

  for (const req of reqs) {
    // Check if any task references this requirement
    const found = tasks.some(t =>
      t.name.includes(req.id) ||
      t.name.toLowerCase().includes(req.desc.toLowerCase().slice(0, 30))
    );

    if (found) {
      console.log(`  [covered] [${req.id}] ${req.desc.slice(0, 60)}`);
      covered++;
    } else {
      console.log(`  [missing] [${req.id}] ${req.desc.slice(0, 60)} ${C.red}— no matching task${C.reset}`);
      uncovered++;
    }
  }

  console.log(`\n  Coverage: ${covered}/${reqs.length} (${Math.round(covered/reqs.length*100)}%)`);
  if (uncovered > 0) {
    console.log(`  ${C.yellow}${uncovered} requirements not covered — add tasks or update task names${C.reset}`);
  } else {
    console.log(`  ${C.green}All requirements covered${C.reset}`);
  }

  writeJSON(join(phaseDir(project, '04-verify'), 'coverage-results.json'), {
    timestamp: new Date().toISOString(),
    total: reqs.length,
    covered,
    uncovered,
    details: reqs.map(r => ({ ...r, covered: tasks.some(t => t.name.includes(r.id)) })),
  });

  console.log('');
}

function cmdContextUsage(args) {
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));

  // Estimate context size by counting characters in project artifacts
  let totalChars = 0;
  const files = [];

  const checkFile = (path, label) => {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf8');
      totalChars += content.length;
      files.push({ label, chars: content.length, tokens: Math.round(content.length / 4) });
    }
  };

  checkFile(join(contextDir(project), 'CONTEXT.md'), 'CONTEXT.md');
  checkFile(join(contextDir(project), 'REQUIREMENTS.md'), 'REQUIREMENTS.md');
  checkFile(join(contextDir(project), 'ROADMAP.md'), 'ROADMAP.md');
  checkFile(join(contextDir(project), 'PROJECT.md'), 'PROJECT.md');
  checkFile(join(contextDir(project), 'decisions.md'), 'Decisions');
  checkFile(join(contextDir(project), 'brief.md'), 'Brief');
  checkFile(tasksPath(project), 'Tasks JSON');
  checkFile(stepsPath(project), 'Steps JSON');

  // Check phase artifacts
  for (const phase of PHASES) {
    const planPath = join(phaseDir(project, phase.id), `${phase.name}-PLAN.md`);
    checkFile(planPath, `${phase.label} Plan`);
  }

  const totalTokens = Math.round(totalChars / 4);
  const maxTokens = 200000; // Claude's context window estimate
  const usedPct = Math.round((totalTokens / maxTokens) * 100);

  console.log(`\n${C.bold}Context Usage — ${project}${C.reset}\n`);
  console.log(`  Total: ~${totalTokens.toLocaleString()} tokens (${usedPct}% of ~200K window)\n`);

  // Sort by size
  files.sort((a, b) => b.tokens - a.tokens);
  for (const f of files) {
    const bar = '#'.repeat(Math.max(1, Math.round(f.tokens / (totalTokens || 1) * 20)));
    console.log(`  ${f.label.padEnd(20)} ${C.dim}~${f.tokens.toLocaleString().padStart(6)} tokens${C.reset} ${C.cyan}${bar}${C.reset}`);
  }

  console.log('');
  if (usedPct > 75) {
    console.log(`  ${C.red}High context usage — consider: xm-build handoff${C.reset}`);
  } else if (usedPct > 35) {
    console.log(`  ${C.yellow}Moderate context usage — monitor growth${C.reset}`);
  } else {
    console.log(`  ${C.green}Context usage is healthy${C.reset}`);
  }
  console.log('');
}

function cmdSaveArtifact(args) {
  const { opts, positional } = parseOptions(args);
  const project = resolveProject(null);
  const type = positional[0]; // context, requirements, roadmap, project, plan

  if (!type) {
    console.error('Usage: xm-build save <context|requirements|roadmap|project|plan> [--content "..."]');
    process.exit(1);
  }

  // Content from stdin or --content flag
  let content = opts.content || '';
  if (!content && !process.stdin.isTTY) {
    content = readFileSync(0, 'utf8'); // read from stdin
  }

  if (!content) {
    console.error('No content provided. Use --content or pipe via stdin.');
    process.exit(1);
  }

  const paths = {
    'context': join(contextDir(project), 'CONTEXT.md'),
    'requirements': join(contextDir(project), 'REQUIREMENTS.md'),
    'roadmap': join(contextDir(project), 'ROADMAP.md'),
    'project': join(contextDir(project), 'PROJECT.md'),
    'plan': join(phaseDir(project, '02-plan'), `plan-PLAN.md`),
  };

  const dest = paths[type];
  if (!dest) {
    console.error(`Unknown artifact type: "${type}". Valid: ${Object.keys(paths).join(', ')}`);
    process.exit(1);
  }

  writeMD(dest, content);
  console.log(`Saved ${type} artifact: ${dest}`);
}

// ── Flag extraction ─────────────────────────────────────────────────

/**
 * Extract --project <name> from argv so callers can use either:
 *   xm-build status attendance-dashboard          (positional)
 *   xm-build status --project attendance-dashboard (named flag)
 */
function extractFlags(rawArgs) {
  const cleaned = [];
  let projectFlag = null;
  for (let i = 0; i < rawArgs.length; i++) {
    if ((rawArgs[i] === '--project' || rawArgs[i] === '-p') && i + 1 < rawArgs.length) {
      projectFlag = rawArgs[++i];
    } else if (rawArgs[i].startsWith('--project=')) {
      projectFlag = rawArgs[i].slice('--project='.length);
    } else if (rawArgs[i] === '--global') {
      // already handled above, skip
    } else {
      cleaned.push(rawArgs[i]);
    }
  }
  return { cleaned, projectFlag };
}

const { cleaned: _cleanedArgv, projectFlag: _projectFlag } = extractFlags(process.argv.slice(2));

// ── Main Router ──────────────────────────────────────────────────────

const [cmd, ...args] = _cleanedArgv;

// Inject --project flag value as first positional arg when no explicit project is given
if (_projectFlag && args.length === 0) {
  args.unshift(_projectFlag);
} else if (_projectFlag) {
  // If args already have values but first one doesn't look like a project name,
  // prepend the flag value so resolveProject picks it up
  const first = args[0];
  if (first && first.startsWith('-')) {
    args.unshift(_projectFlag);
  }
}

switch (cmd) {
  case 'init':
    if (args.length === 0) { await interactiveInit(); } else { cmdInit(args); }
    break;
  case 'list':       cmdList(); break;
  case 'status':     cmdStatus(args); break;
  case 'phase':      cmdPhase(args); break;
  case 'gate':       cmdGate(args); break;
  case 'tasks':
    if (args[0] === 'add' && args.length <= 1) { await interactiveTasksAdd(); }
    else { cmdTasks(args); }
    break;
  case 'steps':      cmdSteps(args); break;
  case 'checkpoint': cmdCheckpoint(args); break;
  case 'context':       cmdContext(args); break;
  case 'close':         cmdClose(args); break;
  case 'quality':       cmdQuality(args); break;
  case 'templates':     cmdTemplates(args); break;
  case 'decisions':     cmdDecisions(args); break;
  case 'summarize':     cmdSummarize(args); break;
  case 'forecast':      cmdForecast(args); break;
  case 'run':            cmdRun(args); break;
  case 'mode':           cmdMode(args); break;
  case 'export':         cmdExport(args); break;
  case 'import':         cmdImport(args); break;
  case 'plan':           cmdPlan(args); break;
  case 'discuss':        cmdDiscuss(args); break;
  case 'research':       cmdResearch(args); break;
  case 'plan-check':     cmdPlanCheck(args); break;
  case 'next':           cmdNext(args); break;
  case 'handoff':        cmdHandoff(args); break;
  case 'verify-coverage': cmdVerifyCoverage(args); break;
  case 'context-usage':  cmdContextUsage(args); break;
  case 'save':           cmdSaveArtifact(args); break;
  case 'run-status':     cmdRunStatus(args); break;
  case 'watch':         cmdWatch(args); break;
  case 'dashboard':     cmdDashboard(); break;
  case 'metrics':       cmdMetrics(args); break;
  case 'phase-context': cmdPhaseContext(args); break;
  case 'alias':         cmdAlias(args); break;
  case 'circuit-breaker': {
    const project = resolveProject(args[1]);
    if (args[0] === 'reset') { resetCircuitBreaker(project); }
    else if (args[0] === 'status') {
      const cb = getCircuitState(project);
      console.log(`⚡ Circuit breaker: ${cb.state} (failures: ${cb.consecutive_failures})`);
      if (cb.cooldown_until) console.log(`  Cooldown until: ${cb.cooldown_until}`);
    }
    else { console.error('Usage: xm-build circuit-breaker <reset|status>'); }
    break;
  }
  case 'help':
  case '--help':
  case '-h':            printHelp(); break;
  default:
    if (!cmd) {
      await interactiveDashboard();
    } else {
      console.error(`❌ Unknown command: "${cmd}". Run: xm-build help`);
      process.exit(1);
    }
}
