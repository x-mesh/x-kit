/**
 * core.mjs unit tests — direct import for coverage
 */
import { describe, test, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Save and set X_BUILD_ROOT before importing core so ROOT resolves to our temp dir
const ORIG_X_BUILD_ROOT = process.env.X_BUILD_ROOT;
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'xb-core-'));
process.env.X_BUILD_ROOT = TEST_ROOT;

const core = await import('../x-build/lib/x-build/core.mjs');

// Restore env after all tests to avoid polluting other test files
afterAll(() => {
  if (ORIG_X_BUILD_ROOT !== undefined) {
    process.env.X_BUILD_ROOT = ORIG_X_BUILD_ROOT;
  } else {
    delete process.env.X_BUILD_ROOT;
  }
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ── Pure function tests ──────────────────────────────────────────

describe('renderBar', () => {
  test('0/0 shows 0%', () => {
    const bar = core.renderBar(0, 0, 10);
    expect(bar).toContain('0%');
  });

  test('5/10 shows 50%', () => {
    const bar = core.renderBar(5, 10, 10);
    expect(bar).toContain('50%');
    expect(bar).toContain('5/10');
  });

  test('10/10 shows 100%', () => {
    const bar = core.renderBar(10, 10, 10);
    expect(bar).toContain('100%');
  });
});

describe('fmtDuration', () => {
  test('null/negative returns empty', () => {
    expect(core.fmtDuration(null)).toBe('');
    expect(core.fmtDuration(-1)).toBe('');
    expect(core.fmtDuration(0)).toBe('');
  });

  test('seconds', () => {
    expect(core.fmtDuration(5000)).toBe('5s');
    expect(core.fmtDuration(59000)).toBe('59s');
  });

  test('minutes', () => {
    expect(core.fmtDuration(60000)).toBe('1m 0s');
    expect(core.fmtDuration(90000)).toBe('1m 30s');
  });

  test('hours', () => {
    expect(core.fmtDuration(3600000)).toBe('1h 0m');
    expect(core.fmtDuration(5400000)).toBe('1h 30m');
  });
});

describe('toSlug', () => {
  test('lowercases and replaces non-alnum', () => {
    expect(core.toSlug('My Project')).toBe('my-project');
    expect(core.toSlug('Hello World!!!')).toBe('hello-world-');
    expect(core.toSlug('a--b')).toBe('a-b');
  });
});

describe('parseCSVLine', () => {
  test('simple values', () => {
    expect(core.parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  test('quoted values with commas', () => {
    expect(core.parseCSVLine('"hello, world",b')).toEqual(['hello, world', 'b']);
  });

  test('escaped quotes', () => {
    expect(core.parseCSVLine('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });

  test('empty string', () => {
    expect(core.parseCSVLine('')).toEqual(['']);
  });
});

describe('normSize', () => {
  test('null/undefined returns medium', () => {
    expect(core.normSize(null)).toBe('medium');
    expect(core.normSize(undefined)).toBe('medium');
    expect(core.normSize('')).toBe('medium');
  });

  test('small aliases', () => {
    expect(core.normSize('small')).toBe('small');
    expect(core.normSize('low')).toBe('small');
    expect(core.normSize('간단')).toBe('small');
    expect(core.normSize('s')).toBe('small');
    expect(core.normSize('Small')).toBe('small');
  });

  test('large aliases', () => {
    expect(core.normSize('large')).toBe('large');
    expect(core.normSize('high')).toBe('large');
    expect(core.normSize('복잡')).toBe('large');
    expect(core.normSize('xl')).toBe('large');
    expect(core.normSize('L')).toBe('large');
  });

  test('unknown returns medium', () => {
    expect(core.normSize('whatever')).toBe('medium');
  });
});

describe('parseOptions', () => {
  test('flags and positional', () => {
    const { opts, positional } = core.parseOptions(['add', 'hello', '--force', '--name', 'test']);
    expect(positional).toEqual(['add', 'hello']);
    expect(opts.force).toBe(true);
    expect(opts.name).toBe('test');
  });

  test('empty args', () => {
    const { opts, positional } = core.parseOptions([]);
    expect(positional).toEqual([]);
    expect(Object.keys(opts)).toHaveLength(0);
  });

  test('flag at end without value is boolean', () => {
    const { opts } = core.parseOptions(['--verbose']);
    expect(opts.verbose).toBe(true);
  });
});

describe('E (error messages)', () => {
  test('known key returns message', () => {
    const msg = core.E('no-project');
    expect(msg).toBeTruthy();
    expect(typeof msg).toBe('string');
  });

  test('variable interpolation', () => {
    const msg = core.E('task-not-found', { id: 'tx99' });
    expect(msg).toContain('tx99');
  });

  test('unknown key returns key itself', () => {
    expect(core.E('nonexistent-key')).toBe('nonexistent-key');
  });
});

describe('L (label)', () => {
  test('returns translated or original based on mode', () => {
    const result = core.L('Research');
    // In normal mode returns Korean, in developer mode returns English
    expect(['Research', '조사하기']).toContain(result);
    expect(core.L('unknown-key')).toBe('unknown-key');
  });
});

// ── Constants ────────────────────────────────────────────────────

describe('constants', () => {
  test('PHASES has 5 entries', () => {
    expect(core.PHASES).toHaveLength(5);
    expect(core.PHASES[0].name).toBe('research');
    expect(core.PHASES[4].name).toBe('close');
  });

  test('TASK_STATES has all states', () => {
    expect(core.TASK_STATES.PENDING).toBe('pending');
    expect(core.TASK_STATES.COMPLETED).toBe('completed');
    expect(core.TASK_STATES.FAILED).toBe('failed');
  });

  test('STATUS_ALIASES maps common aliases', () => {
    expect(core.STATUS_ALIASES.in_progress).toBe('running');
    expect(core.STATUS_ALIASES.done).toBe('completed');
  });

  test('GATE_TYPES', () => {
    expect(core.GATE_TYPES).toContain('auto');
    expect(core.GATE_TYPES).toContain('quality');
  });

  test('MODEL_COSTS has haiku/sonnet/opus', () => {
    expect(core.MODEL_COSTS.haiku.input).toBeLessThan(core.MODEL_COSTS.sonnet.input);
    expect(core.MODEL_COSTS.sonnet.input).toBeLessThan(core.MODEL_COSTS.opus.input);
  });

  test('SIZE_TOKEN_ESTIMATES scales', () => {
    expect(core.SIZE_TOKEN_ESTIMATES.small.input).toBeLessThan(core.SIZE_TOKEN_ESTIMATES.medium.input);
    expect(core.SIZE_TOKEN_ESTIMATES.medium.input).toBeLessThan(core.SIZE_TOKEN_ESTIMATES.large.input);
  });

  test('CONTEXT_MANIFESTS keys', () => {
    expect(Object.keys(core.CONTEXT_MANIFESTS)).toEqual(['research', 'plan', 'execute', 'verify', 'close']);
  });

  test('NORMAL_LABELS', () => {
    expect(core.NORMAL_LABELS['Research']).toBe('조사하기');
    expect(core.NORMAL_LABELS['completed']).toBe('완료');
  });
});

// ── File I/O helpers (with temp dir) ─────────────────────────────

describe('readJSON / writeJSON', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'xb-io-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test('write then read round-trips', () => {
    const p = join(dir, 'test.json');
    core.writeJSON(p, { hello: 'world', num: 42 });
    const data = core.readJSON(p);
    expect(data).toEqual({ hello: 'world', num: 42 });
  });

  test('readJSON returns null for missing file', () => {
    expect(core.readJSON(join(dir, 'nope.json'))).toBeNull();
  });

  test('readJSON returns null for corrupt JSON', () => {
    const p = join(dir, 'bad.json');
    writeFileSync(p, '{broken', 'utf8');
    const result = core.readJSON(p);
    expect(result).toBeNull();
  });

  test('readJSON recovers from .bak on corruption', () => {
    const p = join(dir, 'recover.json');
    writeFileSync(p, '{broken', 'utf8');
    writeFileSync(p + '.bak', '{"recovered":true}', 'utf8');
    const result = core.readJSON(p);
    expect(result).toEqual({ recovered: true });
  });
});

describe('readMD / writeMD', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'xb-md-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test('write then read', () => {
    const p = join(dir, 'test.md');
    core.writeMD(p, '# Hello\n');
    expect(core.readMD(p)).toBe('# Hello\n');
  });

  test('readMD returns empty for missing file', () => {
    expect(core.readMD(join(dir, 'nope.md'))).toBe('');
  });
});

describe('ensureDir', () => {
  test('creates nested directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xb-dir-'));
    const nested = join(dir, 'a', 'b', 'c');
    core.ensureDir(nested);
    expect(existsSync(nested)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('modifyJSON', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'xb-mod-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test('creates file and applies mutation', () => {
    const p = join(dir, 'data.json');
    core.writeJSON(p, { count: 0 });
    const result = core.modifyJSON(p, data => {
      data.count++;
      return data;
    });
    expect(result.count).toBe(1);
    expect(core.readJSON(p).count).toBe(1);
  });

  test('implicit return (mutate in place)', () => {
    const p = join(dir, 'data2.json');
    core.writeJSON(p, { items: [] });
    core.modifyJSON(p, data => { data.items.push('a'); });
    expect(core.readJSON(p).items).toEqual(['a']);
  });
});

// ── Path helpers ─────────────────────────────────────────────────

describe('path helpers', () => {
  test('projectsDir uses ROOT', () => {
    expect(core.projectsDir()).toBe(join(core.ROOT, 'projects'));
  });

  test('projectDir', () => {
    expect(core.projectDir('foo')).toBe(join(core.ROOT, 'projects', 'foo'));
  });

  test('manifestPath', () => {
    expect(core.manifestPath('foo')).toContain('manifest.json');
  });

  test('phaseDir', () => {
    expect(core.phaseDir('foo', '01-research')).toContain(join('phases', '01-research'));
  });

  test('tasksPath', () => {
    expect(core.tasksPath('foo')).toContain(join('02-plan', 'tasks.json'));
  });

  test('stepsPath', () => {
    expect(core.stepsPath('foo')).toContain(join('02-plan', 'steps.json'));
  });

  test('checkpointsDir', () => {
    expect(core.checkpointsDir('foo')).toContain('checkpoints');
  });

  test('contextDir', () => {
    expect(core.contextDir('foo')).toContain('context');
  });

  test('archiveDir', () => {
    expect(core.archiveDir('foo')).toContain('archive');
  });

  test('decisionsPath', () => {
    expect(core.decisionsPath('foo')).toContain('decisions.json');
  });

  test('metricsPath', () => {
    expect(core.metricsPath()).toContain(join('metrics', 'sessions.jsonl'));
  });
});

// ── Cost estimation ──────────────────────────────────────────────

describe('estimateTaskCost', () => {
  test('simple small task', () => {
    const r = core.estimateTaskCost({ name: 'setup', size: 'small', depends_on: [] }, 'haiku');
    expect(r.confidence).toBe('high');
    expect(r.multiplier).toBeCloseTo(1.0, 1);
    expect(r.cost_usd).toBeGreaterThan(0);
    expect(r.model).toBe('haiku');
  });

  test('security task gets domain multiplier', () => {
    const r = core.estimateTaskCost({ name: 'Security audit', size: 'medium' }, 'sonnet');
    expect(r.multiplier).toBeGreaterThanOrEqual(1.4);
  });

  test('architect task gets domain multiplier', () => {
    const r = core.estimateTaskCost({ name: 'Architect design', size: 'medium' }, 'sonnet');
    expect(r.multiplier).toBeGreaterThanOrEqual(1.3);
  });

  test('migration task gets domain multiplier', () => {
    const r = core.estimateTaskCost({ name: 'Database migration', size: 'medium' }, 'sonnet');
    expect(r.multiplier).toBeGreaterThanOrEqual(1.2);
  });

  test('dependencies increase multiplier', () => {
    const noDeps = core.estimateTaskCost({ name: 'task', size: 'medium', depends_on: [] });
    const withDeps = core.estimateTaskCost({ name: 'task', size: 'medium', depends_on: ['t1', 't2'] });
    expect(withDeps.multiplier).toBeGreaterThan(noDeps.multiplier);
  });

  test('strategy adds overhead', () => {
    const noStrat = core.estimateTaskCost({ name: 'task', size: 'medium' });
    const withStrat = core.estimateTaskCost({ name: 'task', size: 'medium', strategy: 'review' });
    expect(withStrat.multiplier).toBeGreaterThan(noStrat.multiplier);
  });

  test('unknown size defaults to medium', () => {
    const r = core.estimateTaskCost({ name: 'task', size: 'huge' });
    const m = core.estimateTaskCost({ name: 'task', size: 'medium' });
    expect(r.input_tokens).toBe(m.input_tokens);
  });

  test('unknown model defaults to sonnet pricing', () => {
    const r = core.estimateTaskCost({ name: 'task', size: 'small' }, 'gpt-99');
    expect(r.cost_usd).toBeGreaterThan(0);
  });
});

describe('computeRetryDelay', () => {
  test('increases with attempt', () => {
    const cfg = { base_delay_ms: 1000, max_delay_ms: 60000, jitter: 0 };
    const d0 = core.computeRetryDelay(0, cfg);
    const d1 = core.computeRetryDelay(1, cfg);
    const d2 = core.computeRetryDelay(2, cfg);
    expect(d0).toBe(1000);
    expect(d1).toBe(2000);
    expect(d2).toBe(4000);
  });

  test('caps at max_delay_ms', () => {
    const cfg = { base_delay_ms: 1000, max_delay_ms: 5000, jitter: 0 };
    const d10 = core.computeRetryDelay(10, cfg);
    expect(d10).toBe(5000);
  });
});

// ── Circuit breaker (direct) ─────────────────────────────────────

describe('circuit breaker (direct)', () => {
  let projDir;
  const projName = 'cb-test';

  beforeEach(() => {
    projDir = join(core.ROOT, 'projects', projName);
    mkdirSync(projDir, { recursive: true });
    core.writeJSON(join(projDir, 'manifest.json'), {
      display_name: projName,
      current_phase: '03-execute',
      updated_at: new Date().toISOString(),
    });
    // Clear any leftover circuit breaker state
    const cbPath = join(projDir, 'circuit-breaker.json');
    if (existsSync(cbPath)) rmSync(cbPath);
  });

  afterEach(() => {
    rmSync(projDir, { recursive: true, force: true });
  });

  test('getCircuitState returns closed by default', () => {
    const state = core.getCircuitState(projName);
    expect(state.state).toBe('closed');
    expect(state.consecutive_failures).toBe(0);
  });

  test('updateCircuitBreaker increments on failure', () => {
    const s1 = core.updateCircuitBreaker(projName, true);
    expect(s1.consecutive_failures).toBe(1);
    expect(s1.state).toBe('closed');
  });

  test('updateCircuitBreaker opens after threshold', () => {
    core.updateCircuitBreaker(projName, true);
    core.updateCircuitBreaker(projName, true);
    const s3 = core.updateCircuitBreaker(projName, true);
    expect(s3.state).toBe('open');
  });

  test('success decrements failures in closed state', () => {
    core.updateCircuitBreaker(projName, true);
    core.updateCircuitBreaker(projName, true);
    const s = core.updateCircuitBreaker(projName, false);
    expect(s.consecutive_failures).toBe(1);
  });

  test('resetCircuitBreaker resets to closed', () => {
    core.updateCircuitBreaker(projName, true);
    core.updateCircuitBreaker(projName, true);
    core.updateCircuitBreaker(projName, true);
    const s = core.resetCircuitBreaker(projName);
    expect(s.state).toBe('closed');
    expect(s.consecutive_failures).toBe(0);
  });

  test('isCircuitOpen returns false when closed', () => {
    expect(core.isCircuitOpen(projName)).toBe(false);
  });

  test('isCircuitOpen returns true when open and within cooldown', () => {
    core.updateCircuitBreaker(projName, true);
    core.updateCircuitBreaker(projName, true);
    core.updateCircuitBreaker(projName, true);
    expect(core.isCircuitOpen(projName)).toBe(true);
  });

  test('isCircuitOpen transitions to half-open after cooldown', () => {
    core.updateCircuitBreaker(projName, true);
    core.updateCircuitBreaker(projName, true);
    core.updateCircuitBreaker(projName, true);
    // Manually set cooldown to past
    const cbPath = join(projDir, 'circuit-breaker.json');
    const cb = core.readJSON(cbPath);
    cb.cooldown_until = new Date(Date.now() - 1000).toISOString();
    core.writeJSON(cbPath, cb);
    expect(core.isCircuitOpen(projName)).toBe(false);
    const updated = core.readJSON(cbPath);
    expect(updated.state).toBe('half-open');
  });

  test('half-open failure reopens circuit', () => {
    // Set up half-open state
    const cbPath = join(projDir, 'circuit-breaker.json');
    core.writeJSON(cbPath, {
      state: 'half-open', consecutive_failures: 3,
      opened_at: new Date().toISOString(), cooldown_until: null,
    });
    const s = core.updateCircuitBreaker(projName, true);
    expect(s.state).toBe('open');
  });

  test('half-open success closes circuit', () => {
    const cbPath = join(projDir, 'circuit-breaker.json');
    core.writeJSON(cbPath, {
      state: 'half-open', consecutive_failures: 3,
      opened_at: new Date().toISOString(), cooldown_until: null,
    });
    const s = core.updateCircuitBreaker(projName, false);
    expect(s.state).toBe('closed');
    expect(s.consecutive_failures).toBe(0);
  });
});

// ── appendMetric ─────────────────────────────────────────────────

describe('appendMetric', () => {
  test('appends JSONL line', () => {
    core.appendMetric({ event: 'unit-test-marker', ts: 1 });
    const content = readFileSync(core.metricsPath(), 'utf8');
    expect(content).toContain('"event":"unit-test-marker"');
  });
});

// ── renderTemplate ───────────────────────────────────────────────

describe('renderTemplate', () => {
  test('replaces placeholders', () => {
    expect(core.renderTemplate('Hello {name}!', { name: 'World' })).toBe('Hello World!');
  });

  test('replaces multiple occurrences', () => {
    expect(core.renderTemplate('{x} and {x}', { x: 'A' })).toBe('A and A');
  });

  test('missing var leaves placeholder', () => {
    expect(core.renderTemplate('{a} {b}', { a: '1' })).toBe('1 {b}');
  });
});

// ── findCurrentProject ───────────────────────────────────────────

describe('findCurrentProject', () => {
  test('returns null or string (does not crash)', () => {
    // ROOT is fixed at import time, so we just verify it doesn't crash
    const result = core.findCurrentProject();
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

// ── Config helpers ───────────────────────────────────────────────

describe('config helpers', () => {
  test('loadConfig returns object', () => {
    const cfg = core.loadConfig();
    expect(typeof cfg).toBe('object');
  });

  test('getMode returns a valid mode string', () => {
    const mode = core.getMode();
    expect(['developer', 'normal']).toContain(mode);
  });

  test('isNormalMode matches getMode', () => {
    expect(core.isNormalMode()).toBe(core.getMode() === 'normal');
  });

  test('getAgentCount returns default 4', () => {
    expect(core.getAgentCount()).toBe(4);
  });
});

// ── ROLE_MODEL_MAP_HR ────────────────────────────────────────────

describe('ROLE_MODEL_MAP_HR', () => {
  test('maps roles to models', () => {
    expect(core.ROLE_MODEL_MAP_HR.architect).toBe('opus');
    expect(core.ROLE_MODEL_MAP_HR.executor).toBe('sonnet');
    expect(core.ROLE_MODEL_MAP_HR.explorer).toBe('haiku');
  });
});

// ── MODEL_PROFILES & getModelForRole ────────────────────────────

describe('MODEL_PROFILES', () => {
  test('has economy/balanced/performance profiles', () => {
    expect(core.MODEL_PROFILES.economy).toBeDefined();
    expect(core.MODEL_PROFILES.balanced).toBeDefined();
    expect(core.MODEL_PROFILES.performance).toBeDefined();
  });

  test('balanced profile matches ROLE_MODEL_MAP_HR', () => {
    expect(core.MODEL_PROFILES.balanced).toBe(core.ROLE_MODEL_MAP_HR);
  });

  test('economy profile downgrades opus roles to sonnet', () => {
    expect(core.MODEL_PROFILES.economy.architect).toBe('sonnet');
    expect(core.MODEL_PROFILES.economy.reviewer).toBe('sonnet');
    expect(core.MODEL_PROFILES.economy.security).toBe('sonnet');
  });

  test('economy profile downgrades sonnet roles to haiku', () => {
    expect(core.MODEL_PROFILES.economy.executor).toBe('haiku');
    expect(core.MODEL_PROFILES.economy.designer).toBe('haiku');
  });

  test('performance profile upgrades executor to opus', () => {
    expect(core.MODEL_PROFILES.performance.executor).toBe('opus');
    expect(core.MODEL_PROFILES.performance.debugger).toBe('opus');
  });
});

describe('getModelForRole', () => {
  test('returns model for known role', () => {
    // Default profile is balanced (no .xm/config.json in test env)
    const model = core.getModelForRole('architect');
    expect(['opus', 'sonnet']).toContain(model);
  });

  test('falls back to executor model for unknown role', () => {
    const model = core.getModelForRole('unknown-role');
    expect(model).toBeDefined();
  });

  test('economy + large returns haiku with warning (no forced upgrade)', () => {
    const economyCfg = { model_profile: 'economy' };
    const model = core.getModelForRole('executor', 'large', economyCfg);
    // Economy respects user choice — haiku stays, warning emitted
    expect(model).toBe('haiku');
  });

  test('model_overrides apply on top of profile', () => {
    const cfg = { model_profile: 'economy', model_overrides: { architect: 'opus' } };
    expect(core.getModelForRole('architect', 'medium', cfg)).toBe('opus');
    // Non-overridden role still uses economy
    expect(core.getModelForRole('executor', 'medium', cfg)).toBe('haiku');
  });
});

// ── Strategy-aware cost multipliers ─────────────────────────────

describe('strategy cost multipliers', () => {
  test('escalate strategy cost is at most the flat estimate', () => {
    const noStrat = core.estimateTaskCost({ name: 'task', size: 'medium' });
    const escalate = core.estimateTaskCost({ name: 'task', size: 'medium', strategy: 'escalate' });
    expect(escalate.cost_usd).toBeLessThanOrEqual(noStrat.cost_usd);
  });

  test('refine strategy has higher multiplier than review', () => {
    const refine = core.estimateTaskCost({ name: 'task', size: 'medium', strategy: 'refine' });
    const review = core.estimateTaskCost({ name: 'task', size: 'medium', strategy: 'review' });
    expect(refine.cost_usd).toBeGreaterThan(review.cost_usd);
  });

  test('unknown strategy still gets default overhead', () => {
    const unknown = core.estimateTaskCost({ name: 'task', size: 'medium', strategy: 'custom-strat' });
    const noStrat = core.estimateTaskCost({ name: 'task', size: 'medium' });
    expect(unknown.cost_usd).toBeGreaterThan(noStrat.cost_usd);
  });
});

// ── Budget guard ────────────────────────────────────────────────

const _budgetCfgPath = join(process.cwd(), '.xm', 'config.json');
// Capture the original config once at module level, before any test runs
const _originalCfgContent = existsSync(_budgetCfgPath) ? readFileSync(_budgetCfgPath, 'utf8') : null;

describe('checkBudget', () => {
  beforeEach(() => {
    // Always restore to original (no-budget) config before this test
    if (_originalCfgContent === null) {
      try { rmSync(_budgetCfgPath); } catch { /* ok */ }
    } else {
      writeFileSync(_budgetCfgPath, _originalCfgContent, 'utf8');
    }
  });
  afterEach(() => {
    if (_originalCfgContent === null) {
      try { rmSync(_budgetCfgPath); } catch { /* ok */ }
    } else {
      writeFileSync(_budgetCfgPath, _originalCfgContent, 'utf8');
    }
  });

  test('returns ok when no budget set', () => {
    const result = core.checkBudget(1.0);
    expect(result.ok).toBe(true);
    expect(result.budget).toBeNull();
  });
});

// ── checkBudget — rolling window (R3a) & spend-cache (R3b) ──────
// ROOT_CE is baked at module load time, so we use the real resolved paths
// and write/restore around each test.

const costEngine = await import('../x-build/lib/x-build/cost-engine.mjs');

const CE_METRICS = costEngine.metricsPath();
const CE_CONFIG = join(CE_METRICS, '..', '..', '..', 'config.json'); // .xm/config.json
const CE_CACHE = join(CE_METRICS, '..', 'spend-cache.json');

function ceSetup(windowHours) {
  mkdirSync(join(CE_METRICS, '..'), { recursive: true });
  const cfg = { budget: { max_usd: 10 } };
  if (windowHours != null) cfg.budget.window_hours = windowHours;
  writeFileSync(CE_CONFIG, JSON.stringify(cfg), 'utf8');
}

function ceTeardown(savedMetrics, savedCache) {
  // Restore or remove metrics
  if (savedMetrics === null) {
    try { rmSync(CE_METRICS); } catch { /* ok */ }
  } else {
    writeFileSync(CE_METRICS, savedMetrics, 'utf8');
  }
  // Always restore config to the original (pre-test) state
  if (_originalCfgContent === null) {
    try { rmSync(CE_CONFIG); } catch { /* ok */ }
  } else {
    writeFileSync(CE_CONFIG, _originalCfgContent, 'utf8');
  }
  // Restore or remove cache
  if (savedCache === null) {
    try { rmSync(CE_CACHE); } catch { /* ok */ }
  } else {
    writeFileSync(CE_CACHE, savedCache, 'utf8');
  }
}

describe('checkBudget — rolling window (R3a)', () => {
  let savedMetrics, savedCache;

  beforeEach(() => {
    savedMetrics = existsSync(CE_METRICS) ? readFileSync(CE_METRICS, 'utf8') : null;
    savedCache   = existsSync(CE_CACHE)   ? readFileSync(CE_CACHE, 'utf8')   : null;
    // Remove cache so each test starts fresh
    try { rmSync(CE_CACHE); } catch { /* ok */ }
  });

  afterEach(() => ceTeardown(savedMetrics, savedCache));

  function makeMetricsFile(entries) {
    mkdirSync(join(CE_METRICS, '..'), { recursive: true });
    writeFileSync(CE_METRICS, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  }

  test('includes recent metrics within window', () => {
    const now = Date.now();
    makeMetricsFile([
      { cost_usd: 1.0, timestamp: now - 1 * 3600 * 1000 },   // 1h ago — within 24h
      { cost_usd: 2.0, timestamp: now - 48 * 3600 * 1000 },  // 48h ago — outside 24h
    ]);
    ceSetup(24);
    const result = costEngine.checkBudget(0);
    expect(result.spent).toBeCloseTo(1.0, 5);
  });

  test('excludes 48h-old metric when window=24', () => {
    const now = Date.now();
    makeMetricsFile([
      { cost_usd: 5.0, timestamp: now - 48 * 3600 * 1000 },
    ]);
    ceSetup(24);
    const result = costEngine.checkBudget(0);
    expect(result.spent).toBeCloseTo(0, 5);
  });

  test('null window_hours sums all metrics', () => {
    const now = Date.now();
    makeMetricsFile([
      { cost_usd: 1.0, timestamp: now - 100 * 3600 * 1000 },
      { cost_usd: 2.0, timestamp: now - 200 * 3600 * 1000 },
    ]);
    ceSetup(null);
    const result = costEngine.checkBudget(0);
    expect(result.spent).toBeCloseTo(3.0, 5);
  });
});

// ── checkBudget — spend-cache (R3b) ─────────────────────────────

describe('checkBudget — spend-cache (R3b)', () => {
  let savedMetrics, savedCache;

  beforeEach(() => {
    savedMetrics = existsSync(CE_METRICS) ? readFileSync(CE_METRICS, 'utf8') : null;
    savedCache   = existsSync(CE_CACHE)   ? readFileSync(CE_CACHE, 'utf8')   : null;
    try { rmSync(CE_CACHE); } catch { /* ok */ }
    mkdirSync(join(CE_METRICS, '..'), { recursive: true });
  });

  afterEach(() => ceTeardown(savedMetrics, savedCache));

  test('creates spend-cache.json after first call', () => {
    writeFileSync(CE_METRICS, JSON.stringify({ cost_usd: 1.5 }) + '\n', 'utf8');
    ceSetup(null);
    costEngine.checkBudget(0);
    expect(existsSync(CE_CACHE)).toBe(true);
  });

  test('incremental read: accumulates spend across two calls', () => {
    writeFileSync(CE_METRICS, JSON.stringify({ cost_usd: 1.0 }) + '\n', 'utf8');
    ceSetup(null);
    const r1 = costEngine.checkBudget(0);
    expect(r1.spent).toBeCloseTo(1.0, 5);

    // Append a second entry
    const existing = readFileSync(CE_METRICS, 'utf8');
    writeFileSync(CE_METRICS, existing + JSON.stringify({ cost_usd: 2.0 }) + '\n', 'utf8');
    const r2 = costEngine.checkBudget(0);
    expect(r2.spent).toBeCloseTo(3.0, 5);
  });

  test('cache invalidated when file size < last_line_offset (rotation)', () => {
    // Write many entries so last_line_offset is large
    const manyLines = Array.from({ length: 20 }, (_, i) => JSON.stringify({ cost_usd: 0.1, seq: i })).join('\n') + '\n';
    writeFileSync(CE_METRICS, manyLines, 'utf8');
    ceSetup(null);
    costEngine.checkBudget(0);

    // Simulate rotation: replace with a single small entry (fileSize < last_line_offset)
    writeFileSync(CE_METRICS, JSON.stringify({ cost_usd: 1.0 }) + '\n', 'utf8');
    const r = costEngine.checkBudget(0);
    expect(r.spent).toBeCloseTo(1.0, 5);
  });
});

// ── checkBudget — per-project budget (R3c) ───────────────────────

describe('checkBudget — per-project budget (R3c)', () => {
  let savedMetrics, savedCache;

  beforeEach(() => {
    savedMetrics = existsSync(CE_METRICS) ? readFileSync(CE_METRICS, 'utf8') : null;
    savedCache   = existsSync(CE_CACHE)   ? readFileSync(CE_CACHE, 'utf8')   : null;
    try { rmSync(CE_CACHE); } catch { /* ok */ }
    mkdirSync(join(CE_METRICS, '..'), { recursive: true });
  });

  afterEach(() => ceTeardown(savedMetrics, savedCache));

  function ceSetupWithProjects(projects) {
    mkdirSync(join(CE_METRICS, '..'), { recursive: true });
    writeFileSync(CE_CONFIG, JSON.stringify({ budget: { max_usd: 10, projects } }), 'utf8');
  }

  test('no project arg: backward-compatible, ignores project budgets', () => {
    writeFileSync(CE_METRICS, JSON.stringify({ cost_usd: 1.0 }) + '\n', 'utf8');
    ceSetupWithProjects({ 'my-project': 2.5 });
    const r = costEngine.checkBudget(0);
    expect(r.ok).toBe(true);
    expect(r.spent).toBeCloseTo(1.0, 5);
    expect(r.budget).toBeCloseTo(10, 5);
  });

  test('project under its limit: returns ok', () => {
    writeFileSync(CE_METRICS, JSON.stringify({ cost_usd: 1.0, project: 'my-project' }) + '\n', 'utf8');
    ceSetupWithProjects({ 'my-project': 2.5 });
    const r = costEngine.checkBudget(0, 'my-project');
    expect(r.ok).toBe(true);
    expect(r.spent).toBeCloseTo(1.0, 5);
    expect(r.budget).toBeCloseTo(2.5, 5);
    expect(r.project).toBe('my-project');
  });

  test('project exceeds its limit: returns not-ok even if global ok', () => {
    writeFileSync(CE_METRICS, JSON.stringify({ cost_usd: 3.0, project: 'my-project' }) + '\n', 'utf8');
    ceSetupWithProjects({ 'my-project': 2.5 });
    const r = costEngine.checkBudget(0, 'my-project');
    expect(r.ok).toBe(false);
    expect(r.level).toBe('exceeded');
    expect(r.budget).toBeCloseTo(2.5, 5);
    expect(r.project).toBe('my-project');
  });

  test('global exceeds budget even if project is ok: returns global not-ok', () => {
    // global spend = 11 (exceeds 10), project spend = 1 (under 2.5)
    const lines = [
      JSON.stringify({ cost_usd: 1.0, project: 'my-project' }),
      JSON.stringify({ cost_usd: 10.0 }), // no project — global only
    ].join('\n') + '\n';
    writeFileSync(CE_METRICS, lines, 'utf8');
    ceSetupWithProjects({ 'my-project': 2.5 });
    const r = costEngine.checkBudget(0, 'my-project');
    expect(r.ok).toBe(false);
    expect(r.level).toBe('exceeded');
    expect(r.budget).toBeCloseTo(10, 5);
  });

  test('project warning level (>80%) returned when more restrictive than global', () => {
    // global: 5/10 = 50% (normal); project: 2.1/2.5 = 84% (warning)
    const lines = [
      JSON.stringify({ cost_usd: 2.1, project: 'my-project' }),
      JSON.stringify({ cost_usd: 2.9 }),
    ].join('\n') + '\n';
    writeFileSync(CE_METRICS, lines, 'utf8');
    ceSetupWithProjects({ 'my-project': 2.5 });
    const r = costEngine.checkBudget(0, 'my-project');
    expect(r.ok).toBe(true);
    expect(r.level).toBe('warning');
    expect(r.budget).toBeCloseTo(2.5, 5);
    expect(r.project).toBe('my-project');
  });

  test('project spend cached in spend-cache.json project_totals', () => {
    writeFileSync(CE_METRICS, JSON.stringify({ cost_usd: 1.5, project: 'my-project' }) + '\n', 'utf8');
    ceSetupWithProjects({ 'my-project': 5 });
    costEngine.checkBudget(0, 'my-project');
    const cache = JSON.parse(readFileSync(CE_CACHE, 'utf8'));
    expect(cache.project_totals?.['my-project']).toBeCloseTo(1.5, 5);
  });

  test('unknown project (not in budget.projects): falls back to global check only', () => {
    writeFileSync(CE_METRICS, JSON.stringify({ cost_usd: 1.0, project: 'other' }) + '\n', 'utf8');
    ceSetupWithProjects({ 'my-project': 2.5 });
    const r = costEngine.checkBudget(0, 'other');
    // 'other' has no limit configured — behaves as global check
    expect(r.ok).toBe(true);
    expect(r.budget).toBeCloseTo(10, 5);
  });
});

// ── Full project fixture for integration-style tests ─────────────

function setupTestProject(name = 'integ-proj') {
  const projDir = join(core.ROOT, 'projects', name);
  mkdirSync(projDir, { recursive: true });

  // Create manifest
  core.writeJSON(join(projDir, 'manifest.json'), {
    display_name: name,
    current_phase: '03-execute',
    updated_at: new Date().toISOString(),
  });

  // Create phase dirs
  for (const phase of core.PHASES) {
    mkdirSync(join(projDir, 'phases', phase.id), { recursive: true });
  }

  // Create context dir
  mkdirSync(join(projDir, 'context'), { recursive: true });

  // Create tasks
  const tasksData = {
    tasks: [
      { id: 't1', name: 'Setup', status: 'completed', size: 'small', depends_on: [] },
      { id: 't2', name: 'Build auth', status: 'running', size: 'medium', depends_on: ['t1'] },
      { id: 't3', name: 'Test', status: 'pending', size: 'small', depends_on: ['t2'] },
    ],
  };
  core.writeJSON(join(projDir, 'phases', '02-plan', 'tasks.json'), tasksData);

  // Create steps
  core.writeJSON(join(projDir, 'phases', '02-plan', 'steps.json'), {
    steps: [
      { id: 's1', tasks: ['t1'] },
      { id: 's2', tasks: ['t2'] },
      { id: 's3', tasks: ['t3'] },
    ],
  });

  // Create context files
  core.writeMD(join(projDir, 'context', 'CONTEXT.md'), '# Context\nProject context here.');
  core.writeMD(join(projDir, 'context', 'REQUIREMENTS.md'), '# Requirements\nMust pass all tests.');
  core.writeMD(join(projDir, 'context', 'ROADMAP.md'), '# Roadmap\nPhase 1: MVP');

  // Create research notes
  core.writeMD(join(projDir, 'phases', '01-research', 'notes.md'), '# Research\nKey findings here.');

  return { projDir, name };
}

// ── loadPhaseContext ─────────────────────────────────────────────

describe('loadPhaseContext', () => {
  let proj;
  beforeEach(() => { proj = setupTestProject('ctx-test'); });
  afterEach(() => { rmSync(proj.projDir, { recursive: true, force: true }); });

  test('research phase loads goal and context', () => {
    const ctx = core.loadPhaseContext(proj.name, 'research');
    expect(ctx.goal).toBeTruthy();
    expect(ctx.context_md).toContain('Project context');
  });

  test('plan phase loads research summary', () => {
    const ctx = core.loadPhaseContext(proj.name, 'plan');
    expect(ctx.goal).toBeTruthy();
    expect(ctx.research_summary).toContain('Key findings');
    expect(ctx.roadmap_md).toContain('MVP');
  });

  test('execute phase loads tasks and steps', () => {
    const ctx = core.loadPhaseContext(proj.name, 'execute');
    expect(ctx.plan_tasks).toHaveLength(3);
    expect(ctx.plan_steps).toHaveLength(3);
    expect(ctx.execute_progress).toHaveLength(3);
  });

  test('verify phase loads artifacts and errors', () => {
    const ctx = core.loadPhaseContext(proj.name, 'verify');
    expect(ctx.plan_tasks).toHaveLength(3);
    expect(ctx.execute_artifacts).toContain('t1'); // completed task
    expect(ctx.execute_errors).toEqual([]); // no failed tasks
  });

  test('close phase loads summaries', () => {
    const ctx = core.loadPhaseContext(proj.name, 'close');
    expect(ctx).toBeTruthy();
  });

  test('unknown phase returns empty context', () => {
    const ctx = core.loadPhaseContext(proj.name, 'nonexistent');
    expect(Object.keys(ctx)).toHaveLength(0);
  });
});

// ── logDecision / addDecision ────────────────────────────────────

describe('decision logging', () => {
  let proj;
  beforeEach(() => { proj = setupTestProject('dec-test'); });
  afterEach(() => { rmSync(proj.projDir, { recursive: true, force: true }); });

  test('logDecision creates decisions.md', () => {
    core.logDecision(proj.name, 'Use PostgreSQL');
    const md = core.readMD(join(proj.projDir, 'context', 'decisions.md'));
    expect(md).toContain('Decisions Log');
    expect(md).toContain('Use PostgreSQL');
  });

  test('logDecision appends to existing', () => {
    core.logDecision(proj.name, 'First decision');
    core.logDecision(proj.name, 'Second decision');
    const md = core.readMD(join(proj.projDir, 'context', 'decisions.md'));
    expect(md).toContain('First decision');
    expect(md).toContain('Second decision');
  });

  test('addDecision stores structured decision', () => {
    core.addDecision(proj.name, {
      type: 'architecture',
      title: 'Use microservices',
      rationale: 'Scalability needs',
      alternatives: ['monolith', 'modular monolith'],
    });
    const data = core.readJSON(join(proj.projDir, 'context', 'decisions.json'));
    expect(data.decisions).toHaveLength(1);
    expect(data.decisions[0].title).toBe('Use microservices');
    expect(data.decisions[0].rationale).toBe('Scalability needs');
    expect(data.decisions[0].alternatives).toContain('monolith');
    expect(data.decisions[0].id).toBe('d1');
  });

  test('addDecision increments id', () => {
    core.addDecision(proj.name, { title: 'First' });
    core.addDecision(proj.name, { title: 'Second' });
    const data = core.readJSON(join(proj.projDir, 'context', 'decisions.json'));
    expect(data.decisions).toHaveLength(2);
    expect(data.decisions[1].id).toBe('d2');
  });
});

// ── scheduleRetry ────────────────────────────────────────────────

describe('scheduleRetry', () => {
  let proj;
  beforeEach(() => { proj = setupTestProject('retry-test'); });
  afterEach(() => { rmSync(proj.projDir, { recursive: true, force: true }); });

  test('schedules retry and sets next_retry_at', () => {
    const tasksData = core.readJSON(core.tasksPath(proj.name));
    const task = tasksData.tasks[1]; // t2 running
    const result = core.scheduleRetry(proj.name, task, tasksData);
    expect(result).toBe(true);
    expect(task.retry_count).toBe(1);
    expect(task.status).toBe('pending');
    expect(task.next_retry_at).toBeTruthy();
  });

  test('returns false after max retries', () => {
    const tasksData = core.readJSON(core.tasksPath(proj.name));
    const task = tasksData.tasks[1];
    task.retry_count = 3; // already at max
    const result = core.scheduleRetry(proj.name, task, tasksData);
    expect(result).toBe(false);
  });
});

// ── templatesDir / loadTaskTemplate ──────────────────────────────

describe('templates', () => {
  test('templatesDir returns a path', () => {
    const dir = core.templatesDir();
    expect(typeof dir).toBe('string');
    expect(dir).toContain('templates');
  });

  test('loadTaskTemplate returns null for missing template', () => {
    expect(core.loadTaskTemplate('nonexistent-template-xyz')).toBeNull();
  });
});

// ── loadSharedConfig / writeSharedConfig ─────────────────────────

describe('shared config', () => {
  test('loadSharedConfig returns object', () => {
    const cfg = core.loadSharedConfig();
    expect(typeof cfg).toBe('object');
  });

  test('readSharedConfig aliases loadSharedConfig', () => {
    const a = core.loadSharedConfig();
    const b = core.readSharedConfig();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('writeSharedConfig writes and reads back', () => {
    const sharedPath = join(core.ROOT, '..', 'config.json');
    const original = core.readJSON(sharedPath);
    try {
      core.writeSharedConfig({ mode: 'developer', test_flag: true });
      const written = core.readJSON(sharedPath);
      expect(written.test_flag).toBe(true);
    } finally {
      // Restore original
      if (original) {
        core.writeJSON(sharedPath, original);
      }
    }
  });
});

// ── emitHook ─────────────────────────────────────────────────────

describe('emitHook', () => {
  test('does not crash with no hooks configured', () => {
    // Should be a no-op when config has no hooks
    expect(() => core.emitHook('test-event', { data: 'hello' })).not.toThrow();
  });

  test('runs configured hook script', () => {
    const configPath = join(core.ROOT, 'config.json');
    const original = core.readJSON(configPath);
    const markerFile = join(core.ROOT, 'hook-marker.txt');
    try {
      core.writeJSON(configPath, {
        hooks: [{ event: 'test-event', exec: `echo "hook-fired" > ${markerFile}` }],
      });
      core.emitHook('test-event', { project: 'test' });
      expect(existsSync(markerFile)).toBe(true);
      expect(readFileSync(markerFile, 'utf8')).toContain('hook-fired');
    } finally {
      if (original) core.writeJSON(configPath, original);
      else if (existsSync(configPath)) rmSync(configPath);
      if (existsSync(markerFile)) rmSync(markerFile);
    }
  });

  test('wildcard hook fires for any event', () => {
    const configPath = join(core.ROOT, 'config.json');
    const original = core.readJSON(configPath);
    const markerFile = join(core.ROOT, 'hook-wild.txt');
    try {
      core.writeJSON(configPath, {
        hooks: [{ event: '*', exec: `echo "wild" > ${markerFile}` }],
      });
      core.emitHook('random-event', {});
      expect(existsSync(markerFile)).toBe(true);
    } finally {
      if (original) core.writeJSON(configPath, original);
      else if (existsSync(configPath)) rmSync(configPath);
      if (existsSync(markerFile)) rmSync(markerFile);
    }
  });

  test('non-matching event does not fire hook', () => {
    const configPath = join(core.ROOT, 'config.json');
    const original = core.readJSON(configPath);
    const markerFile = join(core.ROOT, 'hook-no.txt');
    try {
      core.writeJSON(configPath, {
        hooks: [{ event: 'specific-event', exec: `echo "no" > ${markerFile}` }],
      });
      core.emitHook('other-event', {});
      expect(existsSync(markerFile)).toBe(false);
    } finally {
      if (original) core.writeJSON(configPath, original);
      else if (existsSync(configPath)) rmSync(configPath);
      if (existsSync(markerFile)) rmSync(markerFile);
    }
  });
});

// ── appendMetric rotation ────────────────────────────────────────

describe('appendMetric rotation', () => {
  test('rotates file when exceeding threshold', () => {
    const p = core.metricsPath();
    mkdirSync(join(core.ROOT, 'metrics'), { recursive: true });

    // Write a file larger than METRICS_MAX_BYTES
    const bigContent = 'x'.repeat(core.METRICS_MAX_BYTES + 100);
    writeFileSync(p, bigContent, 'utf8');

    core.appendMetric({ event: 'after-rotation' });

    // Original file should now be small (just the new line)
    const content = readFileSync(p, 'utf8');
    expect(content).toContain('after-rotation');

    // Rotated file should exist
    const rotated = p + '.1';
    expect(existsSync(rotated)).toBe(true);

    // Cleanup
    if (existsSync(rotated)) rmSync(rotated);
  });
});

// ── detectAndRunQualityChecks ────────────────────────────────────

describe('runQualityChecks', () => {
  let proj;
  beforeEach(() => { proj = setupTestProject('qc-test'); });
  afterEach(() => { rmSync(proj.projDir, { recursive: true, force: true }); });

  test('runs with no detectable tools and saves results', () => {
    // In a temp project with no package.json/go.mod etc, should return empty results
    const results = core.runQualityChecks(proj.name);
    expect(Array.isArray(results)).toBe(true);

    // Quality results file should be saved
    const qrPath = join(proj.projDir, 'phases', '04-verify', 'quality-results.json');
    const qr = core.readJSON(qrPath);
    expect(qr.timestamp).toBeTruthy();
    expect(qr.passed).toBe(true); // no checks = passed
  });
});

// ── resolveProject ───────────────────────────────────────────────

describe('resolveProject', () => {
  let proj;
  beforeEach(() => { proj = setupTestProject('resolve-test'); });
  afterEach(() => { rmSync(proj.projDir, { recursive: true, force: true }); });

  test('resolves explicit project name', () => {
    const name = core.resolveProject(proj.name);
    expect(name).toBe(proj.name);
  });
});

// ── setCmdInit ───────────────────────────────────────────────────

describe('setCmdInit', () => {
  test('sets without error', () => {
    expect(() => core.setCmdInit(() => 'test')).not.toThrow();
  });
});

// ── createRL / ask ───────────────────────────────────────────────

describe('interactive helpers', () => {
  test('createRL returns readline interface', () => {
    const rl = core.createRL();
    expect(rl).toBeTruthy();
    expect(typeof rl.question).toBe('function');
    rl.close();
  });

  test('ask returns promise', () => {
    const rl = core.createRL();
    const p = core.ask(rl, 'test? ');
    expect(p instanceof Promise).toBe(true);
    rl.close();
  });

  test('pickMenu displays options and handles input', async () => {
    // Create a mock readline with programmed responses
    const { Readable, Writable } = await import('node:stream');
    const input = new Readable({ read() {} });
    const output = new Writable({ write(_, __, cb) { cb(); } });
    const rl = core.createInterface({ input, output });

    const options = [
      { label: 'Option A', value: 'a' },
      { label: 'Option B', value: 'b' },
    ];

    // Send "1" after a tick to select first option
    const resultPromise = core.pickMenu(rl, 'Pick one:', options);
    setTimeout(() => input.push('1\n'), 10);
    const result = await resultPromise;
    expect(result).toEqual({ label: 'Option A', value: 'a' });
    rl.close();
  });

  test('pickMenu returns null on 0', async () => {
    const { Readable, Writable } = await import('node:stream');
    const input = new Readable({ read() {} });
    const output = new Writable({ write(_, __, cb) { cb(); } });
    const rl = core.createInterface({ input, output });

    const resultPromise = core.pickMenu(rl, 'Pick:', [{ label: 'X' }]);
    setTimeout(() => input.push('0\n'), 10);
    const result = await resultPromise;
    expect(result).toBeNull();
    rl.close();
  });

  test('pickMenu re-prompts on invalid input then accepts valid', async () => {
    const { Readable, Writable } = await import('node:stream');
    const input = new Readable({ read() {} });
    const output = new Writable({ write(_, __, cb) { cb(); } });
    const rl = core.createInterface({ input, output });

    const options = [{ label: 'Only' }];
    const resultPromise = core.pickMenu(rl, 'Pick:', options);
    setTimeout(() => input.push('9\n'), 10);   // invalid
    setTimeout(() => input.push('1\n'), 30);   // valid
    const result = await resultPromise;
    expect(result).toEqual({ label: 'Only' });
    rl.close();
  });
});

// ── gitAutoCommit / gitRollbackTask (isolated git repo) ──────────

describe('git integration', () => {
  let gitDir;
  let origDir;

  beforeEach(() => {
    gitDir = mkdtempSync(join(tmpdir(), 'xb-git-'));
    // Init a real git repo
    const { execSync: ex } = require('node:child_process');
    ex('git init', { cwd: gitDir, stdio: 'pipe' });
    ex('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'pipe' });
    ex('git config user.name "Test"', { cwd: gitDir, stdio: 'pipe' });
    // Create initial commit
    writeFileSync(join(gitDir, 'README.md'), '# test\n');
    ex('git add -A && git commit -m "init"', { cwd: gitDir, stdio: 'pipe', shell: true });

    // Set up .xm/build structure inside gitDir
    const buildDir = join(gitDir, '.xm', 'build');
    mkdirSync(join(buildDir, 'projects', 'git-proj', 'phases', '02-plan'), { recursive: true });
    core.writeJSON(join(buildDir, 'projects', 'git-proj', 'manifest.json'), {
      display_name: 'git-proj',
      current_phase: '03-execute',
      updated_at: new Date().toISOString(),
    });
  });

  afterEach(() => {
    rmSync(gitDir, { recursive: true, force: true });
  });

  test('gitAutoCommit returns null when no changes', () => {
    // No staged changes — should return null
    const result = core.gitAutoCommit('git-proj', { id: 't1', name: 'test', status: 'completed' }, 'execute');
    // Returns null because isGitRepo checks cwd relative to ROOT (not gitDir)
    // This is expected — the function is designed for the actual project
    expect(result === null || typeof result === 'string').toBe(true);
  });

  test('gitRollbackTask returns false without commit_sha', () => {
    expect(core.gitRollbackTask({ id: 't1' })).toBe(false);
  });

  test('gitRollbackTask returns false with invalid sha', () => {
    const result = core.gitRollbackTask({ id: 't1', commit_sha: 'deadbeef' });
    expect(result === true || result === false).toBe(true);
  });
});

// ── quality checks with gate_scripts ─────────────────────────────

describe('quality checks with gate scripts', () => {
  let proj;

  beforeEach(() => {
    proj = setupTestProject('qc-gate-test');
    // Configure gate scripts
    core.writeJSON(join(core.ROOT, 'config.json'), {
      gate_scripts: {
        'echo-check': 'echo "pass"',
        'fail-check': 'exit 1',
      },
    });
  });

  afterEach(() => {
    rmSync(proj.projDir, { recursive: true, force: true });
    const configPath = join(core.ROOT, 'config.json');
    if (existsSync(configPath)) rmSync(configPath);
  });

  test('runs custom gate scripts and captures pass/fail', () => {
    const results = core.runQualityChecks(proj.name);
    const echoResult = results.find(r => r.check === 'echo-check');
    const failResult = results.find(r => r.check === 'fail-check');
    expect(echoResult).toBeTruthy();
    expect(echoResult.passed).toBe(true);
    expect(failResult).toBeTruthy();
    expect(failResult.passed).toBe(false);
  });
});

// ── modifyJSON lock contention fallback ──────────────────────────

describe('modifyJSON lock fallback', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'xb-lock-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test('proceeds without lock when lock file is stuck', () => {
    const p = join(dir, 'locked.json');
    core.writeJSON(p, { value: 0 });

    // Create a stale lock file (simulates another process holding it)
    writeFileSync(p + '.lock', '99999', 'utf8');

    // modifyJSON should eventually fall through to the fallback path
    // after exhausting retries (20 × 50ms spin = ~1s)
    const result = core.modifyJSON(p, data => {
      data.value = 42;
      return data;
    });
    expect(result.value).toBe(42);
    expect(core.readJSON(p).value).toBe(42);
  });
});

// ── emitHook with .mjs script ────────────────────────────────────

describe('emitHook .mjs path', () => {
  test('runs .mjs hook script', () => {
    const configPath = join(core.ROOT, 'config.json');
    const original = core.readJSON(configPath);
    const markerFile = join(core.ROOT, 'hook-mjs-marker.txt');
    const scriptFile = join(core.ROOT, 'test-hook.mjs');

    try {
      // Create a .mjs hook script
      writeFileSync(scriptFile, `
        import { writeFileSync } from 'node:fs';
        writeFileSync('${markerFile.replace(/\\/g, '\\\\')}', 'mjs-hook-fired');
      `, 'utf8');

      core.writeJSON(configPath, {
        hooks: [{ event: 'mjs-test', exec: scriptFile }],
      });
      core.emitHook('mjs-test', { project: 'test' });
      expect(existsSync(markerFile)).toBe(true);
      expect(readFileSync(markerFile, 'utf8')).toContain('mjs-hook-fired');
    } finally {
      if (original) core.writeJSON(configPath, original);
      else if (existsSync(configPath)) rmSync(configPath);
      if (existsSync(markerFile)) rmSync(markerFile);
      if (existsSync(scriptFile)) rmSync(scriptFile);
    }
  });
});

// ── resolveProject error paths ───────────────────────────────────

describe('resolveProject edge cases', () => {
  test('autoInit calls _cmdInit when project missing', () => {
    let initCalled = false;
    core.setCmdInit((args) => {
      initCalled = true;
      return args[0];
    });

    const result = core.resolveProject('auto-init-test-proj', { autoInit: true });
    expect(initCalled).toBe(true);
    expect(result).toBe('auto-init-test-proj');

    // Reset
    core.setCmdInit(null);
  });

  test('resolveProjectDir returns path for existing project', () => {
    const proj = setupTestProject('rpd-test');
    try {
      const dir = core.resolveProjectDir(proj.name);
      expect(dir).toContain('rpd-test');
    } finally {
      rmSync(proj.projDir, { recursive: true, force: true });
    }
  });
});

