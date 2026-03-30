/**
 * x-build/core — Shared utilities, constants, and helpers
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, appendFileSync, renameSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { execSync, spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';

// Re-export node modules that sub-modules need
export { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, appendFileSync, renameSync, statSync };
export { join, resolve, dirname, basename };
export { fileURLToPath };
export { createInterface };
export { execSync, spawnSync };
export { homedir, tmpdir };

// ── ROOT / PLUGIN_ROOT resolution ───────────────────────────────────

const __filename_core = fileURLToPath(import.meta.url);
const __dirname_core = dirname(__filename_core);

// ROOT resolution:
// 1. X_BUILD_ROOT env var (explicit override)
// 2. --global flag → ~/.xm/build/
// 3. default → cwd/.xm/build/
export const XM_GLOBAL = process.argv.includes('--global');
export const ROOT = process.env.X_BUILD_ROOT
  ? resolve(process.env.X_BUILD_ROOT)
  : XM_GLOBAL
    ? resolve(homedir(), '.xm', 'build')
    : resolve(process.cwd(), '.xm', 'build');

// PLUGIN_ROOT: where templates and defaults live
// Original: resolve(__dirname, '..') from x-build-cli.mjs which is at x-kit/lib/
// From x-kit/lib/x-build/core.mjs we need to go up two levels: x-build/ -> lib/ -> x-kit/
export const PLUGIN_ROOT = resolve(__dirname_core, '..', '..');

// ── Constants ────────────────────────────────────────────────────────

export const PHASES = [
  { id: '01-research', name: 'research', label: 'Research' },
  { id: '02-plan',     name: 'plan',     label: 'Plan' },
  { id: '03-execute',  name: 'execute',  label: 'Execute' },
  { id: '04-verify',   name: 'verify',   label: 'Verify' },
  { id: '05-close',    name: 'close',    label: 'Close' },
];

export const TASK_STATES = {
  PENDING: 'pending',
  READY: 'ready',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export const STATUS_ALIASES = {
  in_progress: 'running',
  done: 'completed',
  complete: 'completed',
  cancel: 'cancelled',
  fail: 'failed',
  todo: 'pending',
};

export const GATE_TYPES = ['auto', 'human-verify', 'human-action', 'quality'];

// ── ANSI Colors ──────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
export const C = isTTY ? {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
} : Object.fromEntries(['reset','bold','dim','red','green','yellow','blue','magenta','cyan'].map(k => [k, '']));

export function renderBar(done, total, width = 20) {
  if (total === 0) return `[${C.dim}${'░'.repeat(width)}${C.reset}] 0%`;
  const ratio = done / total;
  const filled = Math.round(ratio * width);
  const pct = Math.round(ratio * 100);
  return `[${C.green}${'█'.repeat(filled)}${C.dim}${'░'.repeat(width - filled)}${C.reset}] ${pct}% ${done}/${total}`;
}

export function fmtDuration(ms) {
  if (!ms || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ── File I/O Helpers ─────────────────────────────────────────────────

export function readJSON(path) {
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

export function writeJSON(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const content = JSON.stringify(data, null, 2) + '\n';
  const tmp = path + '.tmp';
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

export function readMD(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

export function writeMD(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

// ── Config ───────────────────────────────────────────────────────────

export function loadConfig() {
  return readJSON(join(ROOT, 'config.json')) || {};
}

export function loadSharedConfig() {
  const sharedPath = join(ROOT, '..', 'config.json');
  const local = readJSON(sharedPath);
  if (local) return local;
  const globalPath = join(homedir(), '.xm', 'config.json');
  return readJSON(globalPath) || {};
}

export function readSharedConfig() {
  return loadSharedConfig();
}

export function writeSharedConfig(data) {
  const sharedPath = join(ROOT, '..', 'config.json');
  writeJSON(sharedPath, data);
}

export function getMode() {
  const localMode = loadConfig().mode;
  if (localMode) return localMode;
  const sharedMode = loadSharedConfig().mode;
  if (sharedMode) return sharedMode;
  return 'developer';
}

export function getAgentCount() {
  const shared = loadSharedConfig();
  return shared.agent_max_count ?? 4;
}

export function isNormalMode() {
  return getMode() === 'normal';
}

// Normal mode label mappings (simple language)
export const NORMAL_LABELS = {
  'Research': '조사하기',
  'Plan': '계획 세우기',
  'Execute': '실행하기',
  'Verify': '확인하기',
  'Close': '마무리',
  'auto': '자동',
  'human-verify': '직접 확인',
  'human-action': '직접 작업',
  'quality': '품질 검사',
  'pending': '대기 중',
  'ready': '준비됨',
  'running': '진행 중',
  'completed': '완료',
  'failed': '실패',
  'cancelled': '취소됨',
  'small': '간단',
  'medium': '보통',
  'large': '복잡',
};

export function L(key) {
  return isNormalMode() ? (NORMAL_LABELS[key] || key) : key;
}

// ── Path Helpers ─────────────────────────────────────────────────────

export function projectsDir() {
  return join(ROOT, 'projects');
}

export function projectDir(name) {
  return join(projectsDir(), name);
}

export function manifestPath(name) {
  return join(projectDir(name), 'manifest.json');
}

export function phaseDir(project, phaseId) {
  return join(projectDir(project), 'phases', phaseId);
}

export function phaseStatusPath(project, phaseId) {
  return join(phaseDir(project, phaseId), 'status.json');
}

export function tasksPath(project) {
  return join(phaseDir(project, '02-plan'), 'tasks.json');
}

export function stepsPath(project) {
  return join(phaseDir(project, '02-plan'), 'steps.json');
}

export function checkpointsDir(project) {
  return join(projectDir(project), 'checkpoints');
}

export function contextDir(project) {
  return join(projectDir(project), 'context');
}

export function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
}

export function archiveDir(project) {
  return join(projectDir(project), 'archive');
}

export function decisionsPath(project) {
  return join(contextDir(project), 'decisions.json');
}

// ── Metrics ──────────────────────────────────────────────────────────

export function metricsPath() {
  return join(ROOT, 'metrics', 'sessions.jsonl');
}

export const METRICS_MAX_BYTES = 5 * 1024 * 1024; // 5MB rotation threshold

export function appendMetric(data) {
  const p = metricsPath();
  mkdirSync(dirname(p), { recursive: true });
  if (existsSync(p)) {
    try {
      const sz = statSync(p).size;
      if (sz > METRICS_MAX_BYTES) {
        const rotated = p + '.1';
        if (existsSync(rotated)) writeFileSync(rotated, '', 'utf8');
        renameSync(p, rotated);
      }
    } catch { /* ignore rotation errors */ }
  }
  appendFileSync(p, JSON.stringify(data) + '\n', 'utf8');
}

// ── Lifecycle Hooks ──────────────────────────────────────────────────

export function emitHook(event, payload) {
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

// ── Project Resolution ──────────────────────────────────────────────

export function findCurrentProject() {
  const dir = projectsDir();
  if (!existsSync(dir)) return null;
  const projects = readdirSync(dir).filter(d =>
    existsSync(manifestPath(d))
  );
  if (projects.length === 0) return null;
  const withManifest = projects
    .map(p => ({ name: p, manifest: readJSON(manifestPath(p)) }))
    .filter(p => p.manifest && p.manifest.updated_at);
  if (withManifest.length === 0) return null;
  return withManifest
    .sort((a, b) => new Date(b.manifest.updated_at) - new Date(a.manifest.updated_at))
    [0].name;
}

// NOTE: resolveProject needs cmdInit for autoInit, which creates a circular dep.
// We use a late-bound reference that project.mjs will set.
let _cmdInit = null;
export function setCmdInit(fn) { _cmdInit = fn; }

export function resolveProject(explicit, { autoInit = false } = {}) {
  const name = explicit || findCurrentProject();
  if (!name) {
    console.error('❌ No project found. Run: x-build init <project-name>');
    process.exit(1);
  }
  if (!existsSync(manifestPath(name))) {
    if (autoInit && _cmdInit) {
      console.error(`⚡ Project "${name}" not found — auto-initializing...`);
      return _cmdInit([name]);
    }
    console.error(`❌ Project "${name}" not found.`);
    process.exit(1);
  }
  return name;
}

export function resolveProjectDir(name) {
  return projectDir(resolveProject(name));
}

// ── Git Integration ──────────────────────────────────────────────────

function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe', cwd: resolve(ROOT, '..') });
    return true;
  } catch { return false; }
}

export function gitAutoCommit(project, task, phase) {
  if (!isGitRepo()) return null;
  const config = loadConfig();
  if (config.git?.auto_commit === false) return null;

  try {
    const cwd = resolve(ROOT, '..');
    execSync('git add -A', { stdio: 'pipe', cwd });

    const diff = execSync('git diff --cached --name-only', { stdio: 'pipe', cwd }).toString().trim();
    if (!diff) return null;

    const msg = `tm(${phase}/${task.id}): ${task.name} [${task.status.toUpperCase()}]`;
    execSync(`git commit -m ${JSON.stringify(msg)}`, { stdio: 'pipe', cwd });
    const sha = execSync('git rev-parse HEAD', { stdio: 'pipe', cwd }).toString().trim();
    return sha;
  } catch { return null; }
}

export function gitRollbackTask(task) {
  if (!isGitRepo() || !task.commit_sha) return false;
  try {
    const cwd = resolve(ROOT, '..');
    execSync(`git stash push -m "tm-task-${task.id}-failed"`, { stdio: 'pipe', cwd });
    execSync(`git reset --hard ${task.commit_sha}`, { stdio: 'pipe', cwd });
    return true;
  } catch { return false; }
}

// ── Quality Gate Runner ──────────────────────────────────────────────

export function runQualityChecks(project) {
  return detectAndRunQualityChecks(project);
}

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

// ── Circuit Breaker ─────────────────────────────────────────────────

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

export function computeRetryDelay(attempt, cfg) {
  const base = cfg.base_delay_ms * Math.pow(2, attempt);
  const capped = Math.min(base, cfg.max_delay_ms);
  const jitter = capped * cfg.jitter * (Math.random() * 2 - 1);
  return Math.round(capped + jitter);
}

function circuitBreakerPath(project) {
  return join(projectDir(project), 'circuit-breaker.json');
}

export function getCircuitState(project) {
  return readJSON(circuitBreakerPath(project)) || {
    state: 'closed', consecutive_failures: 0,
    opened_at: null, cooldown_until: null,
  };
}

export function updateCircuitBreaker(project, taskFailed) {
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

export function isCircuitOpen(project) {
  const cb = getCircuitState(project);
  if (cb.state !== 'open') return false;

  if (cb.cooldown_until && new Date() > new Date(cb.cooldown_until)) {
    cb.state = 'half-open';
    writeJSON(circuitBreakerPath(project), cb);
    console.log(`  ${C.yellow}⚡ Circuit breaker HALF-OPEN — probe allowed.${C.reset}`);
    return false;
  }

  return true;
}

export function resetCircuitBreaker(project) {
  const cb = { state: 'closed', consecutive_failures: 0, opened_at: null, cooldown_until: null };
  writeJSON(circuitBreakerPath(project), cb);
  console.log(`  ${C.green}⚡ Circuit breaker manually reset to CLOSED.${C.reset}`);
  return cb;
}

export function scheduleRetry(project, task, data) {
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

export function templatesDir() {
  const local = join(ROOT, 'templates');
  if (existsSync(local)) return local;
  return join(PLUGIN_ROOT, 'templates');
}

export function loadTaskTemplate(templateName) {
  const tasksDir = join(templatesDir(), 'tasks');
  const path = join(tasksDir, `${templateName}.md`);
  if (!existsSync(path)) return null;
  return readMD(path);
}

export function renderTemplate(content, vars) {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

// ── parseOptions helper ─────────────────────────────────────────────

export function parseOptions(args) {
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

// ── Context Manifests ───────────────────────────────────────────────

export const CONTEXT_MANIFESTS = {
  research: ['goal', 'constraints', 'context_md', 'requirements_md'],
  plan:     ['goal', 'constraints', 'research_summary', 'context_md', 'requirements_md', 'roadmap_md'],
  execute:  ['plan_tasks', 'plan_steps', 'execute_progress', 'context_md', 'requirements_md'],
  verify:   ['plan_tasks', 'execute_artifacts', 'execute_errors', 'requirements_md'],
  close:    ['verify_report', 'execute_summary'],
};

export function loadPhaseContext(project, phaseName) {
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

// ── Decision Logging ────────────────────────────────────────────────

export function logDecision(project, message) {
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

export function addDecision(project, { type, title, rationale, alternatives, phase }) {
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

// ── Cost Forecasting Helpers ────────────────────────────────────────

export const MODEL_COSTS = {
  'haiku':  { input: 0.25, output: 1.25 },
  'sonnet': { input: 3.00, output: 15.00 },
  'opus':   { input: 15.00, output: 75.00 },
};

export const SIZE_TOKEN_ESTIMATES = {
  small:  { input: 8000,  output: 3000,  turns: 3 },
  medium: { input: 15000, output: 6000,  turns: 6 },
  large:  { input: 30000, output: 12000, turns: 12 },
};

export function estimateTaskCost(task, model = 'sonnet') {
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

export const ROLE_MODEL_MAP_HR = {
  architect: 'opus', reviewer: 'opus', security: 'opus',
  executor: 'sonnet', designer: 'sonnet', debugger: 'sonnet',
  explorer: 'haiku', writer: 'haiku',
};

// ── Interactive helpers ─────────────────────────────────────────────

export function createRL() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

export function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

export async function pickMenu(rl, title, options) {
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

// ── CSV / Size helpers ──────────────────────────────────────────────

export function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
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

export function normSize(val) {
  if (!val) return 'medium';
  const v = val.toLowerCase();
  if (['small', 'low', '간단', 's'].includes(v)) return 'small';
  if (['large', 'high', '복잡', 'l', 'xl'].includes(v)) return 'large';
  return 'medium';
}
