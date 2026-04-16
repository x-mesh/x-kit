/**
 * cost-engine.mjs unit tests
 * Covers: override priority chain, spinlock, outcome enrichment,
 *         budget rolling window, cold-start fallback, forecast actuals,
 *         cost-learner aggregation and scoring.
 *
 * Design note: ROOT_CE in cost-engine is evaluated once at module load time
 * from process.env.X_BUILD_ROOT. Static ESM imports are hoisted and evaluated
 * before any top-level statements, so we MUST use dynamic import() after
 * setting X_BUILD_ROOT to control the root path.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync, rmSync, writeFileSync, mkdirSync,
  existsSync, readFileSync, utimesSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

// ── One shared temp root — created and injected before dynamic imports ──────

const ORIG_X_BUILD_ROOT = process.env.X_BUILD_ROOT;
const TEST_ROOT = mkdtempSync(join(tmpdir(), 'xb-ce-'));
process.env.X_BUILD_ROOT = TEST_ROOT;

// Dynamic imports so ROOT_CE sees TEST_ROOT
const ce      = await import('../x-build/lib/x-build/cost-engine.mjs');
const learner  = await import('../x-build/lib/x-build/cost-learner.mjs');

afterAll(() => {
  if (ORIG_X_BUILD_ROOT !== undefined) {
    process.env.X_BUILD_ROOT = ORIG_X_BUILD_ROOT;
  } else {
    delete process.env.X_BUILD_ROOT;
  }
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ── Derived path helpers (delegated to module so we never hardcode them) ─────

function metricsFile()      { return ce.metricsPath(); }
function metricsDir()       { return dirname(ce.metricsPath()); }
function tokenActualsPath() { return join(metricsDir(), 'token-actuals.json'); }
function configPath()       { return join(TEST_ROOT, '..', 'config.json'); }

// ── Test helpers ──────────────────────────────────────────────────────────────

function writeConfig(cfg) {
  mkdirSync(dirname(configPath()), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg), 'utf8');
}

function clearConfig() {
  try { rmSync(configPath()); } catch { /* ok if missing */ }
}

function appendLines(...objects) {
  const p = metricsFile();
  mkdirSync(metricsDir(), { recursive: true });
  for (const obj of objects) {
    writeFileSync(p, JSON.stringify(obj) + '\n', { flag: 'a', encoding: 'utf8' });
  }
}

function clearMetrics() {
  try { rmSync(metricsFile()); }             catch { /* ok */ }
  try { rmSync(metricsFile() + '.lock'); }   catch { /* ok */ }
  try { rmSync(ce.spendCachePath()); }       catch { /* ok */ }
  try { rmSync(tokenActualsPath()); }        catch { /* ok */ }
}

// ── 1. Override priority chain (getModelForRole) ──────────────────────────────

describe('getModelForRole — override priority chain', () => {
  afterEach(() => { clearConfig(); clearMetrics(); });

  test('model_overrides always wins over model_learned', () => {
    const result = ce.getModelForRole('executor', 'medium', {
      model_overrides: { executor: 'opus' },
      model_learned:   { executor: { model: 'haiku', sample_count: 10 } },
    });
    expect(result).toBe('opus');
  });

  test('model_learned with sample_count >= 5 is used when no override present', () => {
    const result = ce.getModelForRole('executor', 'medium', {
      model_learned: { executor: { model: 'haiku', sample_count: 5 } },
    });
    expect(result).toBe('haiku');
  });

  test('model_learned with sample_count < 5 falls back to static profile', () => {
    const result = ce.getModelForRole('executor', 'medium', {
      model_profile: 'default',
      model_learned: { executor: { model: 'haiku', sample_count: 4 } },
    });
    expect(result).toBe('opus');
  });

  test('model_learned as simple string is accepted', () => {
    const result = ce.getModelForRole('executor', 'medium', {
      model_learned: { executor: 'haiku' },
    });
    expect(result).toBe('haiku');
  });

  test('empty model_learned returns static profile model', () => {
    const result = ce.getModelForRole('executor', 'medium', {
      model_profile: 'default',
      model_learned: {},
    });
    expect(result).toBe('opus');
  });

  test('unknown role falls back to executor model from profile', () => {
    const result = ce.getModelForRole('nonexistent-role', 'medium', {
      model_profile: 'default',
    });
    // default.executor = opus; unknown role uses that fallback
    expect(result).toBe('opus');
  });

  test('large task with haiku-mapped role emits a console warning', () => {
    const warnings = [];
    const orig = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      // economy profile maps explorer -> haiku (writer too)
      ce.getModelForRole('explorer', 'large', { model_profile: 'economy' });
      expect(warnings.some(w => w.includes('haiku') && w.includes('large'))).toBe(true);
    } finally {
      console.warn = orig;
    }
  });

  test('economy profile keeps architect on sonnet (cost-conscious)', () => {
    expect(ce.getModelForRole('architect', 'medium', { model_profile: 'economy' })).toBe('sonnet');
  });

  test('max profile upgrades executor to opus', () => {
    expect(ce.getModelForRole('executor', 'medium', { model_profile: 'max' })).toBe('opus');
  });

  test('legacy "balanced" is accepted and resolves to default', () => {
    expect(ce.getModelForRole('executor', 'medium', { model_profile: 'balanced' })).toBe('opus');
  });

  test('legacy "performance" is accepted and resolves to max', () => {
    expect(ce.getModelForRole('designer', 'medium', { model_profile: 'performance' })).toBe('opus');
  });

  test('model_overrides wins even when model_learned has large sample_count', () => {
    const result = ce.getModelForRole('architect', 'medium', {
      model_overrides: { architect: 'haiku' },
      model_learned:   { architect: { model: 'opus', sample_count: 100 } },
    });
    expect(result).toBe('haiku');
  });
});

// ── 2. Spinlock concurrency (appendMetric) ────────────────────────────────────

describe('appendMetric — write lock', () => {
  beforeEach(() => { clearMetrics(); });
  afterEach(() => { clearMetrics(); });

  test('multiple sequential appendMetric calls produce valid JSONL', () => {
    const entries = [
      { type: 'task_complete', cost_usd: 0.01 },
      { type: 'task_complete', cost_usd: 0.02 },
      { type: 'task_complete', cost_usd: 0.03 },
    ];
    for (const e of entries) ce.appendMetric(e);

    expect(existsSync(metricsFile())).toBe(true);
    const lines = readFileSync(metricsFile(), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed[0].cost_usd).toBe(0.01);
    expect(parsed[2].cost_usd).toBe(0.03);
  });

  test('20 rapid appendMetric calls each produce a valid JSON line', () => {
    for (let i = 0; i < 20; i++) {
      ce.appendMetric({ type: 'task_complete', cost_usd: i * 0.001 });
    }
    const lines = readFileSync(metricsFile(), 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(20);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  test('stale lock file (> 10s old) is cleaned up and write succeeds', () => {
    mkdirSync(metricsDir(), { recursive: true });
    const lockPath = metricsFile() + '.lock';
    writeFileSync(lockPath, '99999', 'utf8');
    // Backdate lock mtime to simulate stale lock
    const staleTimeSec = (Date.now() - 15_000) / 1000;
    try { utimesSync(lockPath, staleTimeSec, staleTimeSec); } catch { /* skip if unavailable */ }

    expect(() => ce.appendMetric({ type: 'task_complete', cost_usd: 0.05 })).not.toThrow();
    expect(existsSync(metricsFile())).toBe(true);
  });

  test('lock file is released after a successful write', () => {
    ce.appendMetric({ type: 'task_complete', cost_usd: 0.01 });
    expect(existsSync(metricsFile() + '.lock')).toBe(false);
  });
});

// ── 3. Budget rolling window (checkBudget) ────────────────────────────────────

describe('checkBudget — rolling window', () => {
  beforeEach(() => { clearMetrics(); clearConfig(); });
  afterEach(() => { clearMetrics(); clearConfig(); });

  test('window_hours filters out metrics older than the window', () => {
    const old    = new Date(Date.now() - 3 * 3_600_000).toISOString();  // 3h ago
    const recent = new Date(Date.now() -     30 * 60_000).toISOString(); // 30m ago
    appendLines(
      { type: 'task_complete', cost_usd: 0.90, timestamp: old },
      { type: 'task_complete', cost_usd: 0.05, timestamp: recent },
    );
    writeConfig({ budget: { max_usd: 0.50, window_hours: 1 } });

    const result = ce.checkBudget(0, null);
    expect(result.ok).toBe(true);
    expect(result.spent).toBeCloseTo(0.05, 5);
  });

  test('no window_hours uses all metrics regardless of age', () => {
    const old = new Date(Date.now() - 48 * 3_600_000).toISOString();
    appendLines(
      { type: 'task_complete', cost_usd: 0.40, timestamp: old },
      { type: 'task_complete', cost_usd: 0.40, timestamp: new Date().toISOString() },
    );
    writeConfig({ budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0, null);
    expect(result.ok).toBe(false);
    expect(result.level).toBe('exceeded');
  });

  test('per-project budget is enforced independently of global budget', () => {
    appendLines(
      { type: 'task_complete', cost_usd: 0.08, project: 'alpha', timestamp: new Date().toISOString() },
      { type: 'task_complete', cost_usd: 0.01, project: 'beta',  timestamp: new Date().toISOString() },
    );
    writeConfig({ budget: { max_usd: 1.00, projects: { alpha: 0.05 } } });

    const result = ce.checkBudget(0, 'alpha');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('exceeded');
    expect(result.project).toBe('alpha');
  });

  test('backward-compatible call without project argument checks global budget only', () => {
    appendLines(
      { type: 'task_complete', cost_usd: 0.10, timestamp: new Date().toISOString() },
    );
    writeConfig({ budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0);
    expect(result.ok).toBe(true);
    expect(result.spent).toBeCloseTo(0.10, 5);
  });

  test('no budget configured returns ok with null budget', () => {
    writeConfig({});
    const result = ce.checkBudget(0);
    expect(result.ok).toBe(true);
    expect(result.budget).toBeNull();
  });

  test('additional cost that pushes total over budget returns exceeded', () => {
    appendLines(
      { type: 'task_complete', cost_usd: 0.45, timestamp: new Date().toISOString() },
    );
    writeConfig({ budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0.10);
    expect(result.ok).toBe(false);
    expect(result.level).toBe('exceeded');
  });

  test('spend above 80% of budget returns warning level', () => {
    appendLines(
      { type: 'task_complete', cost_usd: 0.42, timestamp: new Date().toISOString() },
    );
    writeConfig({ budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0);
    expect(result.ok).toBe(true);
    expect(result.level).toBe('warning');
  });
});

// ── 4. Cold-start fallback ────────────────────────────────────────────────────

describe('cold-start fallback — empty or missing metrics', () => {
  beforeEach(() => { clearMetrics(); clearConfig(); });
  afterEach(() => { clearMetrics(); clearConfig(); });

  test('no metrics file — getModelForRole returns static profile model', () => {
    expect(ce.getModelForRole('executor', 'medium', { model_profile: 'default' })).toBe('opus');
  });

  test('no model_learned in config — static profile is used', () => {
    expect(ce.getModelForRole('executor', 'medium', { model_profile: 'economy' })).toBe('sonnet');
  });

  test('checkBudget with no metrics file returns ok with spent = 0', () => {
    writeConfig({ budget: { max_usd: 1.00 } });
    const result = ce.checkBudget(0);
    expect(result.ok).toBe(true);
    expect(result.spent).toBe(0);
  });
});

// ── 5. Forecast actuals (estimateTaskCost + loadTokenActuals) ─────────────────

describe('estimateTaskCost — forecast actuals', () => {
  beforeEach(() => { clearMetrics(); clearConfig(); });
  afterEach(() => { clearMetrics(); clearConfig(); });

  test('fewer than 10 samples — uses SIZE_TOKEN_ESTIMATES pricing not actuals', () => {
    mkdirSync(metricsDir(), { recursive: true });
    // sessions.jsonl older than token-actuals (fresh actuals but only 5 samples)
    writeFileSync(metricsFile(), '', 'utf8');
    const pastSec = (Date.now() - 5_000) / 1000;
    try { utimesSync(metricsFile(), pastSec, pastSec); } catch { /* ok */ }

    writeFileSync(tokenActualsPath(), JSON.stringify({
      updated_at: new Date().toISOString(),
      sample_counts: { small: 5, medium: 5, large: 5 },
      estimates: {
        small:  { avg_cost_usd: 999.99 },
        medium: { avg_cost_usd: 999.99 },
        large:  { avg_cost_usd: 999.99 },
      },
    }), 'utf8');

    const result = ce.estimateTaskCost({ name: 'setup', size: 'small' }, 'haiku');
    // sample_count 5 < 10 — must not use the 999.99 actuals
    expect(result.cost_usd).toBeLessThan(1.0);
  });

  test('10 or more samples — uses actuals cost and returns confidence=high', () => {
    mkdirSync(metricsDir(), { recursive: true });
    writeFileSync(metricsFile(), '', 'utf8');
    const pastSec = (Date.now() - 5_000) / 1000;
    try { utimesSync(metricsFile(), pastSec, pastSec); } catch { /* ok */ }

    const avgCost = 0.042;
    writeFileSync(tokenActualsPath(), JSON.stringify({
      updated_at: new Date().toISOString(),
      sample_counts: { small: 10, medium: 10, large: 10 },
      estimates: {
        small:  { avg_cost_usd: avgCost },
        medium: { avg_cost_usd: avgCost },
        large:  { avg_cost_usd: avgCost },
      },
    }), 'utf8');

    const result = ce.estimateTaskCost({ name: 'setup', size: 'small' }, 'sonnet');
    expect(result.confidence).toBe('high');
    expect(result.cost_usd).toBeCloseTo(avgCost, 5);
  });

  test('stale token-actuals (metrics newer) — loadTokenActuals returns null', () => {
    mkdirSync(metricsDir(), { recursive: true });
    // Write token-actuals first with an older mtime
    writeFileSync(tokenActualsPath(), JSON.stringify({
      updated_at: new Date(Date.now() - 10_000).toISOString(),
      sample_counts: { small: 20 },
      estimates: { small: { avg_cost_usd: 999.99 } },
    }), 'utf8');
    const staleActualsSec = (Date.now() - 5_000) / 1000;
    try { utimesSync(tokenActualsPath(), staleActualsSec, staleActualsSec); } catch { /* ok */ }

    // Write sessions.jsonl after so it has a newer mtime (makes actuals stale)
    writeFileSync(metricsFile(), '', 'utf8');

    expect(ce.loadTokenActuals()).toBeNull();
  });
});

// ── 6. cost-learner — aggregateOutcomes ──────────────────────────────────────

describe('aggregateOutcomes — 90-day window', () => {
  beforeEach(() => { clearMetrics(); });
  afterEach(() => { clearMetrics(); });

  test('entries older than 90 days are excluded', () => {
    const old    = new Date(Date.now() - 91 * 86_400_000).toISOString();
    const recent = new Date().toISOString();
    appendLines(
      { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: old,    cost_usd: 0.01 },
      { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: recent, cost_usd: 0.01 },
    );
    expect(learner.aggregateOutcomes()['executor:haiku'].attempts).toBe(1);
  });

  test('empty metrics file returns empty object', () => {
    mkdirSync(metricsDir(), { recursive: true });
    writeFileSync(metricsFile(), '', 'utf8');
    expect(learner.aggregateOutcomes()).toEqual({});
  });

  test('missing metrics file returns empty object', () => {
    expect(learner.aggregateOutcomes()).toEqual({});
  });

  test('task_complete entry counts as a success', () => {
    appendLines({ type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: new Date().toISOString() });
    const outcomes = learner.aggregateOutcomes();
    expect(outcomes['executor:sonnet'].successes).toBe(1);
    expect(outcomes['executor:sonnet'].attempts).toBe(1);
  });

  test('task_failed entry counts as attempt but not as success', () => {
    appendLines({ type: 'task_failed', role: 'executor', model: 'sonnet', timestamp: new Date().toISOString(), failure_reason: 'timeout' });
    const outcomes = learner.aggregateOutcomes();
    expect(outcomes['executor:sonnet'].attempts).toBe(1);
    expect(outcomes['executor:sonnet'].successes).toBe(0);
  });

  test('retry_count values are accumulated across entries', () => {
    const ts = new Date().toISOString();
    appendLines(
      { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts, retry_count: 2 },
      { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts, retry_count: 3 },
    );
    expect(learner.aggregateOutcomes()['executor:haiku'].total_retries).toBe(5);
  });

  test('cost_usd values are accumulated across entries', () => {
    const ts = new Date().toISOString();
    appendLines(
      { type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: ts, cost_usd: 0.10 },
      { type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: ts, cost_usd: 0.20 },
    );
    expect(learner.aggregateOutcomes()['executor:sonnet'].total_cost).toBeCloseTo(0.30, 5);
  });

  test('custom windowDays parameter narrows the effective window', () => {
    const old    = new Date(Date.now() - 10 * 86_400_000).toISOString(); // 10 days ago
    const recent = new Date().toISOString();
    appendLines(
      { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: old },
      { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: recent },
    );
    // 5-day window: only the recent entry should be counted
    expect(learner.aggregateOutcomes(5)['executor:haiku'].attempts).toBe(1);
  });
});

// ── 7. cost-learner — computeModelLearned ────────────────────────────────────

describe('computeModelLearned — scoring and MIN_SAMPLES', () => {
  beforeEach(() => { clearMetrics(); });
  afterEach(() => { clearMetrics(); });

  test('role with fewer than MIN_SAMPLES (5) attempts is excluded', () => {
    const ts = new Date().toISOString();
    for (let i = 0; i < 4; i++) {
      appendLines({ type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts });
    }
    expect(learner.computeModelLearned().executor).toBeUndefined();
  });

  test('role with exactly MIN_SAMPLES (5) attempts is included', () => {
    const ts = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      appendLines({ type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts });
    }
    const learned = learner.computeModelLearned();
    expect(learned.executor).toBeDefined();
    expect(learned.executor.model).toBe('haiku');
    expect(learned.executor.sample_count).toBe(5);
  });

  test('model with higher success rate is selected over lower-rate model', () => {
    const ts = new Date().toISOString();
    // haiku: 5 attempts, 2 successes — rate 0.40
    for (let i = 0; i < 5; i++) {
      appendLines({ type: i < 2 ? 'task_complete' : 'task_failed', role: 'executor', model: 'haiku', timestamp: ts });
    }
    // sonnet: 5 attempts, 5 successes — rate 1.00
    for (let i = 0; i < 5; i++) {
      appendLines({ type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: ts });
    }
    expect(learner.computeModelLearned().executor.model).toBe('sonnet');
  });

  test('high retry count penalises score and causes model to lose to zero-retry model', () => {
    const ts = new Date().toISOString();
    // haiku: 100% success but heavy retries → penalised
    for (let i = 0; i < 5; i++) {
      appendLines({ type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts, retry_count: 10 });
    }
    // sonnet: 100% success, no retries → wins
    for (let i = 0; i < 5; i++) {
      appendLines({ type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: ts, retry_count: 0 });
    }
    expect(learner.computeModelLearned().executor.model).toBe('sonnet');
  });

  test('learned entry contains success_rate (number) and updated_at (string)', () => {
    const ts = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      appendLines({ type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: ts });
    }
    const entry = learner.computeModelLearned().executor;
    expect(typeof entry.success_rate).toBe('number');
    expect(typeof entry.updated_at).toBe('string');
  });

  test('empty metrics file returns empty learned mapping', () => {
    mkdirSync(metricsDir(), { recursive: true });
    writeFileSync(metricsFile(), '', 'utf8');
    expect(learner.computeModelLearned()).toEqual({});
  });

  test('multiple roles are learned independently', () => {
    const ts = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      appendLines({ type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts });
      appendLines({ type: 'task_complete', role: 'reviewer', model: 'opus',  timestamp: ts });
    }
    const learned = learner.computeModelLearned();
    expect(learned.executor.model).toBe('haiku');
    expect(learned.reviewer.model).toBe('opus');
  });
});

// ── 8. cmdForecastUpdate ──────────────────────────────────────────────────────

describe('cmdForecastUpdate', () => {
  beforeEach(() => { clearMetrics(); clearConfig(); });
  afterEach(() => { clearMetrics(); clearConfig(); });

  test('cmdForecastUpdate creates token-actuals.json', () => {
    const ts = new Date().toISOString();
    appendLines(
      { type: 'task_complete', cost_usd: 0.10, size: 'small', timestamp: ts },
      { type: 'task_complete', cost_usd: 0.20, size: 'small', timestamp: ts },
    );
    ce.cmdForecastUpdate();
    const actualsPath = join(metricsDir(), 'token-actuals.json');
    expect(existsSync(actualsPath)).toBe(true);
    const data = JSON.parse(readFileSync(actualsPath, 'utf8'));
    expect(data.sample_counts.small).toBe(2);
    expect(data.estimates.small.avg_cost_usd).toBeCloseTo(0.15, 5);
  });
});

// ── 9. refreshModelLearned ────────────────────────────────────────────────────

describe('refreshModelLearned — model_learned config update', () => {
  beforeEach(() => { clearMetrics(); clearConfig(); });
  afterEach(() => { clearMetrics(); clearConfig(); });

  test('metrics with >= 5 samples for a role updates config with model_learned', async () => {
    const ts = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      appendLines({ type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts });
    }
    writeConfig({ budget: { max_usd: 1.0 } });

    const result = await ce.refreshModelLearned();
    expect(result).not.toBeNull();
    expect(result.executor).toBeDefined();
    expect(result.executor.model).toBe('haiku');
    expect(result.executor.sample_count).toBeGreaterThanOrEqual(5);

    // Config file must have been updated with model_learned
    const written = JSON.parse(readFileSync(configPath(), 'utf8'));
    expect(written.model_learned).toBeDefined();
    expect(written.model_learned.executor.model).toBe('haiku');
  });

  test('empty metrics returns null and does not write model_learned to config', async () => {
    mkdirSync(metricsDir(), { recursive: true });
    writeFileSync(metricsFile(), '', 'utf8');
    writeConfig({});

    const result = await ce.refreshModelLearned();
    expect(result).toBeNull();

    // model_learned must not appear in config
    const written = JSON.parse(readFileSync(configPath(), 'utf8'));
    expect(written.model_learned).toBeUndefined();
  });

  test('missing metrics file returns null', async () => {
    writeConfig({});
    const result = await ce.refreshModelLearned();
    expect(result).toBeNull();
  });

  test('fewer than 5 samples returns null', async () => {
    const ts = new Date().toISOString();
    for (let i = 0; i < 4; i++) {
      appendLines({ type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: ts });
    }
    writeConfig({});
    const result = await ce.refreshModelLearned();
    expect(result).toBeNull();
  });
});

// ── 10. computeTokenActuals — direct unit tests ───────────────────────────────

describe('computeTokenActuals — averages from metrics', () => {
  beforeEach(() => { clearMetrics(); clearConfig(); });
  afterEach(() => { clearMetrics(); clearConfig(); });

  test('returns null when metrics file does not exist', () => {
    expect(ce.computeTokenActuals()).toBeNull();
  });

  test('known task_complete entries produce correct per-size averages', () => {
    const ts = new Date().toISOString();
    appendLines(
      { type: 'task_complete', cost_usd: 0.10, size: 'small',  timestamp: ts },
      { type: 'task_complete', cost_usd: 0.20, size: 'small',  timestamp: ts },
      { type: 'task_complete', cost_usd: 0.30, size: 'medium', timestamp: ts },
    );

    const result = ce.computeTokenActuals();
    expect(result).not.toBeNull();
    expect(result.estimates.small.avg_cost_usd).toBeCloseTo(0.15, 5);
    expect(result.estimates.medium.avg_cost_usd).toBeCloseTo(0.30, 5);
    expect(result.sample_counts.small).toBe(2);
    expect(result.sample_counts.medium).toBe(1);
  });

  test('empty metrics file returns result with zero sample_counts', () => {
    mkdirSync(metricsDir(), { recursive: true });
    writeFileSync(metricsFile(), '', 'utf8');

    const result = ce.computeTokenActuals();
    expect(result).not.toBeNull();
    expect(result.sample_counts.small).toBe(0);
    expect(result.sample_counts.medium).toBe(0);
    expect(result.sample_counts.large).toBe(0);
  });

  test('entries without size field are excluded from averages', () => {
    const ts = new Date().toISOString();
    appendLines(
      { type: 'task_complete', cost_usd: 0.50, timestamp: ts },           // no size
      { type: 'task_complete', cost_usd: 0.10, size: 'large', timestamp: ts },
    );
    const result = ce.computeTokenActuals();
    expect(result.sample_counts.large).toBe(1);
    expect(result.estimates.large.avg_cost_usd).toBeCloseTo(0.10, 5);
  });

  test('task_failed entries are excluded from averages', () => {
    const ts = new Date().toISOString();
    appendLines(
      { type: 'task_failed',   cost_usd: 0.99, size: 'small', timestamp: ts },
      { type: 'task_complete', cost_usd: 0.05, size: 'small', timestamp: ts },
    );
    const result = ce.computeTokenActuals();
    expect(result.sample_counts.small).toBe(1);
    expect(result.estimates.small.avg_cost_usd).toBeCloseTo(0.05, 5);
  });

  test('result includes updated_at timestamp string', () => {
    const ts = new Date().toISOString();
    appendLines({ type: 'task_complete', cost_usd: 0.05, size: 'small', timestamp: ts });
    const result = ce.computeTokenActuals();
    expect(typeof result.updated_at).toBe('string');
    expect(() => new Date(result.updated_at)).not.toThrow();
  });
});

// ── 12. checkBudget — 80% boundary precision ──────────────────────────────────

describe('checkBudget — 80% boundary precision', () => {
  beforeEach(() => { clearMetrics(); clearConfig(); });
  afterEach(() => { clearMetrics(); clearConfig(); });

  test('spend at exactly 80% of budget returns normal level (boundary is exclusive)', () => {
    // pct > 80 is the condition; exactly 80% does NOT trigger warning → normal
    appendLines(
      { type: 'task_complete', cost_usd: 0.40, timestamp: new Date().toISOString() },
    );
    writeConfig({ budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0);
    expect(result.ok).toBe(true);
    expect(result.level).toBe('normal');
  });

  test('spend just below 80% of budget returns normal level', () => {
    // 0.3999 / 0.50 = 79.98% → normal
    appendLines(
      { type: 'task_complete', cost_usd: 0.3999, timestamp: new Date().toISOString() },
    );
    writeConfig({ budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0);
    expect(result.ok).toBe(true);
    expect(result.level).toBe('normal');
  });

  test('spend just above 80% of budget returns warning level', () => {
    // 0.4001 / 0.50 = 80.02% → warning
    appendLines(
      { type: 'task_complete', cost_usd: 0.4001, timestamp: new Date().toISOString() },
    );
    writeConfig({ budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0);
    expect(result.ok).toBe(true);
    expect(result.level).toBe('warning');
  });

  test('additionalCost pushing total to exactly 80% returns normal (boundary is exclusive)', () => {
    // pct > 80 is the condition; exactly 80% does NOT trigger warning → normal
    appendLines(
      { type: 'task_complete', cost_usd: 0.30, timestamp: new Date().toISOString() },
    );
    writeConfig({ budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0.10);
    expect(result.ok).toBe(true);
    expect(result.level).toBe('normal');
  });

  test('additionalCost pushing total just above 100% returns exceeded', () => {
    appendLines(
      { type: 'task_complete', cost_usd: 0.49, timestamp: new Date().toISOString() },
    );
    writeConfig({ budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0.02);
    expect(result.ok).toBe(false);
    expect(result.level).toBe('exceeded');
  });
});

// ── 13. getModelForRoleWithCorrelation ─────────────────────────────────────────

describe('getModelForRoleWithCorrelation', () => {
  test('returns model and a ce-prefixed correlationId', () => {
    const { model, correlationId } = ce.getModelForRoleWithCorrelation('executor', 'medium', {
      model_profile: 'default',
    });
    expect(model).toBe('opus');
    expect(typeof correlationId).toBe('string');
    expect(correlationId.startsWith('ce-')).toBe(true);
  });

  test('each call produces a unique correlationId', () => {
    const ids = new Set();
    for (let i = 0; i < 10; i++) {
      const { correlationId } = ce.getModelForRoleWithCorrelation('executor', 'medium', {});
      ids.add(correlationId);
    }
    expect(ids.size).toBe(10);
  });
});
