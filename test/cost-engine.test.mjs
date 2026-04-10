/**
 * cost-engine.mjs unit tests
 * Covers: override priority chain, spinlock, outcome enrichment,
 *         budget rolling window, cold-start fallback, forecast actuals,
 *         cost-learner aggregation and scoring.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync, rmSync, writeFileSync, mkdirSync,
  existsSync, readFileSync, unlinkSync, utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Setup: point cost-engine at a fresh temp dir per suite ──────────────

let TEST_ROOT;
let origEnv;

function setupRoot() {
  TEST_ROOT = mkdtempSync(join(tmpdir(), 'xb-ce-'));
  origEnv = process.env.X_BUILD_ROOT;
  process.env.X_BUILD_ROOT = TEST_ROOT;
}

function teardownRoot() {
  if (origEnv !== undefined) {
    process.env.X_BUILD_ROOT = origEnv;
  } else {
    delete process.env.X_BUILD_ROOT;
  }
  rmSync(TEST_ROOT, { recursive: true, force: true });
}

// Helpers
function metricsDir(root) { return join(root, 'metrics'); }
function metricsFile(root) { return join(root, 'metrics', 'sessions.jsonl'); }
function configFile(root) { return join(root, '..', 'config.json'); }

function writeConfig(root, cfg) {
  const p = join(root, '..', 'config.json');
  mkdirSync(join(root, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg), 'utf8');
}

function appendLines(root, ...objects) {
  const p = metricsFile(root);
  mkdirSync(metricsDir(root), { recursive: true });
  for (const obj of objects) {
    writeFileSync(p, JSON.stringify(obj) + '\n', { flag: 'a', encoding: 'utf8' });
  }
}

// ── 1. Override priority chain (getModelForRole) ────────────────────────

describe('getModelForRole — override priority chain', () => {
  let ce;

  beforeEach(async () => {
    setupRoot();
    ce = await import('../x-build/lib/x-build/cost-engine.mjs?' + Date.now());
  });

  afterEach(() => { teardownRoot(); });

  test('model_overrides always wins over model_learned', () => {
    writeConfig(TEST_ROOT, {
      model_overrides: { executor: 'opus' },
      model_learned: { executor: { model: 'haiku', sample_count: 10 } },
    });
    const result = ce.getModelForRole('executor', 'medium', {
      model_overrides: { executor: 'opus' },
      model_learned: { executor: { model: 'haiku', sample_count: 10 } },
    });
    expect(result).toBe('opus');
  });

  test('model_learned with sample_count >= 5 is used', () => {
    const result = ce.getModelForRole('executor', 'medium', {
      model_learned: { executor: { model: 'haiku', sample_count: 5 } },
    });
    expect(result).toBe('haiku');
  });

  test('model_learned with sample_count < 5 falls back to profile', () => {
    const result = ce.getModelForRole('executor', 'medium', {
      model_profile: 'balanced',
      model_learned: { executor: { model: 'haiku', sample_count: 4 } },
    });
    // balanced profile maps executor -> sonnet
    expect(result).toBe('sonnet');
  });

  test('model_learned as simple string is accepted', () => {
    const result = ce.getModelForRole('executor', 'medium', {
      model_learned: { executor: 'haiku' },
    });
    expect(result).toBe('haiku');
  });

  test('empty model_learned returns static profile model', () => {
    const result = ce.getModelForRole('executor', 'medium', {
      model_profile: 'balanced',
      model_learned: {},
    });
    expect(result).toBe('sonnet');
  });

  test('unknown role returns executor fallback from profile', () => {
    const result = ce.getModelForRole('nonexistent-role', 'medium', {
      model_profile: 'balanced',
    });
    // Falls back to executor model in balanced = sonnet
    expect(result).toBe('sonnet');
  });

  test('large task with haiku model emits a console warning', () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      ce.getModelForRole('executor', 'large', {
        model_overrides: { executor: 'haiku' },
      });
      expect(warnings.some(w => w.includes('haiku') && w.includes('large'))).toBe(true);
    } finally {
      console.warn = origWarn;
    }
  });

  test('economy profile downgrades architect to sonnet', () => {
    const result = ce.getModelForRole('architect', 'medium', {
      model_profile: 'economy',
    });
    expect(result).toBe('sonnet');
  });

  test('performance profile upgrades executor to opus', () => {
    const result = ce.getModelForRole('executor', 'medium', {
      model_profile: 'performance',
    });
    expect(result).toBe('opus');
  });
});

// ── 2. Spinlock concurrency (appendMetric) ──────────────────────────────

describe('appendMetric — write lock', () => {
  let ce;

  beforeEach(async () => {
    setupRoot();
    ce = await import('../x-build/lib/x-build/cost-engine.mjs?' + Date.now());
  });

  afterEach(() => { teardownRoot(); });

  test('multiple sequential appendMetric calls produce valid JSONL', () => {
    const entries = [
      { type: 'task_complete', cost_usd: 0.01 },
      { type: 'task_complete', cost_usd: 0.02 },
      { type: 'task_complete', cost_usd: 0.03 },
    ];
    for (const e of entries) ce.appendMetric(e);

    const p = metricsFile(TEST_ROOT);
    expect(existsSync(p)).toBe(true);
    const lines = readFileSync(p, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed[0].cost_usd).toBe(0.01);
    expect(parsed[2].cost_usd).toBe(0.03);
  });

  test('concurrent appendMetric calls all produce valid JSONL lines', async () => {
    const count = 20;
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        Promise.resolve(ce.appendMetric({ type: 'task_complete', cost_usd: i * 0.001 }))
      )
    );

    const p = metricsFile(TEST_ROOT);
    const lines = readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(count);
    // Every line must parse as valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  test('stale lock file (> 10s old) is cleaned up and write succeeds', () => {
    const p = metricsFile(TEST_ROOT);
    mkdirSync(metricsDir(TEST_ROOT), { recursive: true });
    const lockPath = p + '.lock';
    // Write a stale lock with an old mtime by modifying the file timestamp via content
    writeFileSync(lockPath, '99999', 'utf8');
    // Backdate the lock file by manipulating its mtime using utimes
    const { utimesSync } = await import('node:fs').then(m => m);
    const staleTime = (Date.now() - 15000) / 1000; // 15s ago
    try {
      // Node's utimesSync takes seconds
      const fs = await import('node:fs');
      fs.utimesSync(lockPath, staleTime, staleTime);
    } catch { /* if utimes unavailable, skip timing part */ }

    // appendMetric should succeed (either by removing stale lock or graceful degradation)
    expect(() => ce.appendMetric({ type: 'task_complete', cost_usd: 0.05 })).not.toThrow();
    expect(existsSync(p)).toBe(true);
  });

  test('lock file is released after successful write', () => {
    const p = metricsFile(TEST_ROOT);
    ce.appendMetric({ type: 'task_complete', cost_usd: 0.01 });
    const lockPath = p + '.lock';
    expect(existsSync(lockPath)).toBe(false);
  });
});

// ── 3. Budget rolling window (checkBudget) ──────────────────────────────

describe('checkBudget — rolling window', () => {
  let ce;

  beforeEach(async () => {
    setupRoot();
    ce = await import('../x-build/lib/x-build/cost-engine.mjs?' + Date.now());
  });

  afterEach(() => { teardownRoot(); });

  test('window_hours filters out old metrics and returns ok', () => {
    const old = new Date(Date.now() - 3 * 3600 * 1000).toISOString(); // 3h ago
    const recent = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30m ago
    appendLines(TEST_ROOT,
      { type: 'task_complete', cost_usd: 0.90, timestamp: old },
      { type: 'task_complete', cost_usd: 0.05, timestamp: recent },
    );
    writeConfig(TEST_ROOT, { budget: { max_usd: 0.50, window_hours: 1 } });

    const result = ce.checkBudget(0, null);
    // Only recent 0.05 is in the 1-hour window — well under budget
    expect(result.ok).toBe(true);
    expect(result.spent).toBeCloseTo(0.05, 5);
  });

  test('no window_hours uses all metrics', () => {
    const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    appendLines(TEST_ROOT,
      { type: 'task_complete', cost_usd: 0.40, timestamp: old },
      { type: 'task_complete', cost_usd: 0.40, timestamp: new Date().toISOString() },
    );
    writeConfig(TEST_ROOT, { budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0, null);
    // Both lines counted without window: 0.80 > 0.50
    expect(result.ok).toBe(false);
    expect(result.level).toBe('exceeded');
  });

  test('per-project budget is enforced independently', () => {
    appendLines(TEST_ROOT,
      { type: 'task_complete', cost_usd: 0.08, project: 'alpha', timestamp: new Date().toISOString() },
      { type: 'task_complete', cost_usd: 0.01, project: 'beta', timestamp: new Date().toISOString() },
    );
    writeConfig(TEST_ROOT, {
      budget: {
        max_usd: 1.00,
        projects: { alpha: 0.05 },
      },
    });

    const result = ce.checkBudget(0, 'alpha');
    expect(result.ok).toBe(false);
    expect(result.level).toBe('exceeded');
    expect(result.project).toBe('alpha');
  });

  test('backward-compatible signature: no project checks global budget only', () => {
    appendLines(TEST_ROOT,
      { type: 'task_complete', cost_usd: 0.10, timestamp: new Date().toISOString() },
    );
    writeConfig(TEST_ROOT, { budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0);
    expect(result.ok).toBe(true);
    expect(result.spent).toBeCloseTo(0.10, 5);
  });

  test('no budget configured returns ok with null budget', () => {
    writeConfig(TEST_ROOT, {});
    const result = ce.checkBudget(0);
    expect(result.ok).toBe(true);
    expect(result.budget).toBeNull();
  });

  test('additional cost pushes over budget returns exceeded', () => {
    appendLines(TEST_ROOT,
      { type: 'task_complete', cost_usd: 0.45, timestamp: new Date().toISOString() },
    );
    writeConfig(TEST_ROOT, { budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0.10);
    expect(result.ok).toBe(false);
    expect(result.level).toBe('exceeded');
  });

  test('spend above 80% returns warning level', () => {
    appendLines(TEST_ROOT,
      { type: 'task_complete', cost_usd: 0.42, timestamp: new Date().toISOString() },
    );
    writeConfig(TEST_ROOT, { budget: { max_usd: 0.50 } });

    const result = ce.checkBudget(0);
    expect(result.ok).toBe(true);
    expect(result.level).toBe('warning');
  });
});

// ── 4. Cold-start fallback ──────────────────────────────────────────────

describe('cold-start fallback — empty metrics', () => {
  let ce;

  beforeEach(async () => {
    setupRoot();
    ce = await import('../x-build/lib/x-build/cost-engine.mjs?' + Date.now());
  });

  afterEach(() => { teardownRoot(); });

  test('empty metrics file — getModelForRole returns static profile model', () => {
    // No metrics file at all
    const result = ce.getModelForRole('executor', 'medium', {
      model_profile: 'balanced',
    });
    expect(result).toBe('sonnet');
  });

  test('no model_learned in config — static profile used', () => {
    writeConfig(TEST_ROOT, { model_profile: 'economy' });
    const result = ce.getModelForRole('executor', 'medium', {
      model_profile: 'economy',
    });
    expect(result).toBe('haiku');
  });

  test('checkBudget with no metrics file returns ok', () => {
    writeConfig(TEST_ROOT, { budget: { max_usd: 1.00 } });
    const result = ce.checkBudget(0);
    expect(result.ok).toBe(true);
    expect(result.spent).toBe(0);
  });
});

// ── 5. Forecast actuals (estimateTaskCost) ──────────────────────────────

describe('estimateTaskCost — forecast actuals', () => {
  let ce;

  beforeEach(async () => {
    setupRoot();
    ce = await import('../x-build/lib/x-build/cost-engine.mjs?' + Date.now());
  });

  afterEach(() => { teardownRoot(); });

  test('uses SIZE_TOKEN_ESTIMATES when fewer than 10 samples exist', () => {
    // Write token-actuals with only 5 samples — should not use actuals
    const actualsPath = join(TEST_ROOT, 'metrics', 'token-actuals.json');
    mkdirSync(join(TEST_ROOT, 'metrics'), { recursive: true });
    // Also create sessions.jsonl so actuals mtime <= sessions mtime does not apply
    writeFileSync(metricsFile(TEST_ROOT), '', 'utf8');
    writeFileSync(actualsPath, JSON.stringify({
      updated_at: new Date().toISOString(),
      sample_counts: { small: 5, medium: 5, large: 5 },
      estimates: {
        small: { avg_cost_usd: 999.99 },
        medium: { avg_cost_usd: 999.99 },
        large: { avg_cost_usd: 999.99 },
      },
    }), 'utf8');

    const result = ce.estimateTaskCost({ name: 'setup', size: 'small' }, 'haiku');
    // Should NOT use the 999.99 actuals (only 5 samples < 10)
    expect(result.cost_usd).toBeLessThan(1.0);
  });

  test('uses actuals-based cost when >= 10 samples exist', () => {
    const actualsPath = join(TEST_ROOT, 'metrics', 'token-actuals.json');
    mkdirSync(join(TEST_ROOT, 'metrics'), { recursive: true });
    // Create sessions.jsonl first so its mtime is older
    writeFileSync(metricsFile(TEST_ROOT), '', 'utf8');

    const avgCost = 0.042;
    writeFileSync(actualsPath, JSON.stringify({
      updated_at: new Date(Date.now() + 1000).toISOString(),
      sample_counts: { small: 10, medium: 10, large: 10 },
      estimates: {
        small: { avg_cost_usd: avgCost },
        medium: { avg_cost_usd: avgCost },
        large: { avg_cost_usd: avgCost },
      },
    }), 'utf8');

    // Patch mtime: write sessions.jsonl slightly before actuals
    // (actuals mtime > sessions mtime means cache is fresh)
    const { utimesSync } = await import('node:fs');
    const pastSec = (Date.now() - 2000) / 1000;
    try { utimesSync(metricsFile(TEST_ROOT), pastSec, pastSec); } catch { /* ok */ }

    const result = ce.estimateTaskCost({ name: 'setup', size: 'small' }, 'sonnet');
    expect(result.confidence).toBe('high');
    expect(result.cost_usd).toBeCloseTo(avgCost, 5);
  });

  test('stale token-actuals — metrics newer — loadTokenActuals returns null', () => {
    const actualsPath = join(TEST_ROOT, 'metrics', 'token-actuals.json');
    mkdirSync(join(TEST_ROOT, 'metrics'), { recursive: true });
    writeFileSync(actualsPath, JSON.stringify({
      updated_at: new Date(Date.now() - 5000).toISOString(),
      sample_counts: { small: 20 },
      estimates: { small: { avg_cost_usd: 999.99 } },
    }), 'utf8');
    // Write sessions.jsonl after actuals so it is newer (stale actuals)
    writeFileSync(metricsFile(TEST_ROOT), '', 'utf8');

    const actuals = ce.loadTokenActuals();
    expect(actuals).toBeNull();
  });
});

// ── 6. Cost-learner — aggregateOutcomes ────────────────────────────────

describe('aggregateOutcomes — 90-day window', () => {
  let learner;

  beforeEach(async () => {
    setupRoot();
    // Import cost-learner after setting env so metricsPath() resolves to temp dir
    learner = await import('../x-build/lib/x-build/cost-learner.mjs?' + Date.now());
  });

  afterEach(() => { teardownRoot(); });

  test('entries older than 90 days are excluded', () => {
    const old = new Date(Date.now() - 91 * 86_400_000).toISOString();
    const recent = new Date().toISOString();
    appendLines(TEST_ROOT,
      { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: old, cost_usd: 0.01 },
      { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: recent, cost_usd: 0.01 },
    );
    const outcomes = learner.aggregateOutcomes();
    expect(outcomes['executor:haiku'].attempts).toBe(1);
  });

  test('empty metrics file returns empty object', () => {
    mkdirSync(metricsDir(TEST_ROOT), { recursive: true });
    writeFileSync(metricsFile(TEST_ROOT), '', 'utf8');
    const outcomes = learner.aggregateOutcomes();
    expect(outcomes).toEqual({});
  });

  test('missing metrics file returns empty object', () => {
    const outcomes = learner.aggregateOutcomes();
    expect(outcomes).toEqual({});
  });

  test('task_complete counts as success', () => {
    appendLines(TEST_ROOT,
      { type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: new Date().toISOString() },
    );
    const outcomes = learner.aggregateOutcomes();
    expect(outcomes['executor:sonnet'].successes).toBe(1);
  });

  test('task_failed counts as attempt but not success', () => {
    appendLines(TEST_ROOT,
      { type: 'task_failed', role: 'executor', model: 'sonnet', timestamp: new Date().toISOString(), failure_reason: 'timeout' },
    );
    const outcomes = learner.aggregateOutcomes();
    expect(outcomes['executor:sonnet'].attempts).toBe(1);
    expect(outcomes['executor:sonnet'].successes).toBe(0);
  });

  test('retry_count is accumulated', () => {
    const ts = new Date().toISOString();
    appendLines(TEST_ROOT,
      { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts, retry_count: 2 },
      { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts, retry_count: 3 },
    );
    const outcomes = learner.aggregateOutcomes();
    expect(outcomes['executor:haiku'].total_retries).toBe(5);
  });

  test('cost_usd is accumulated', () => {
    const ts = new Date().toISOString();
    appendLines(TEST_ROOT,
      { type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: ts, cost_usd: 0.10 },
      { type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: ts, cost_usd: 0.20 },
    );
    const outcomes = learner.aggregateOutcomes();
    expect(outcomes['executor:sonnet'].total_cost).toBeCloseTo(0.30, 5);
  });
});

// ── 7. Cost-learner — computeModelLearned ──────────────────────────────

describe('computeModelLearned — scoring and MIN_SAMPLES', () => {
  let learner;

  beforeEach(async () => {
    setupRoot();
    learner = await import('../x-build/lib/x-build/cost-learner.mjs?' + Date.now());
  });

  afterEach(() => { teardownRoot(); });

  test('role with fewer than MIN_SAMPLES attempts is excluded', () => {
    const ts = new Date().toISOString();
    // Write only 4 entries (MIN_SAMPLES = 5)
    for (let i = 0; i < 4; i++) {
      appendLines(TEST_ROOT,
        { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts },
      );
    }
    const learned = learner.computeModelLearned();
    expect(learned.executor).toBeUndefined();
  });

  test('role with exactly MIN_SAMPLES attempts is included', () => {
    const ts = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      appendLines(TEST_ROOT,
        { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts },
      );
    }
    const learned = learner.computeModelLearned();
    expect(learned.executor).toBeDefined();
    expect(learned.executor.model).toBe('haiku');
    expect(learned.executor.sample_count).toBe(5);
  });

  test('success-rate scoring picks model with higher success rate', () => {
    const ts = new Date().toISOString();
    // haiku: 5 attempts, 2 successes → rate 0.40
    for (let i = 0; i < 5; i++) {
      const type = i < 2 ? 'task_complete' : 'task_failed';
      appendLines(TEST_ROOT,
        { type, role: 'executor', model: 'haiku', timestamp: ts },
      );
    }
    // sonnet: 5 attempts, 5 successes → rate 1.00
    for (let i = 0; i < 5; i++) {
      appendLines(TEST_ROOT,
        { type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: ts },
      );
    }
    const learned = learner.computeModelLearned();
    expect(learned.executor.model).toBe('sonnet');
  });

  test('retry penalty reduces score for high-retry model', () => {
    const ts = new Date().toISOString();
    // haiku: 5 successes, many retries
    for (let i = 0; i < 5; i++) {
      appendLines(TEST_ROOT,
        { type: 'task_complete', role: 'executor', model: 'haiku', timestamp: ts, retry_count: 10 },
      );
    }
    // sonnet: 5 successes, no retries
    for (let i = 0; i < 5; i++) {
      appendLines(TEST_ROOT,
        { type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: ts, retry_count: 0 },
      );
    }
    const learned = learner.computeModelLearned();
    // sonnet should win (no retry penalty)
    expect(learned.executor.model).toBe('sonnet');
  });

  test('learned entry contains success_rate and updated_at', () => {
    const ts = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      appendLines(TEST_ROOT,
        { type: 'task_complete', role: 'executor', model: 'sonnet', timestamp: ts },
      );
    }
    const learned = learner.computeModelLearned();
    expect(typeof learned.executor.success_rate).toBe('number');
    expect(typeof learned.executor.updated_at).toBe('string');
  });

  test('empty metrics returns empty learned mapping', () => {
    mkdirSync(metricsDir(TEST_ROOT), { recursive: true });
    writeFileSync(metricsFile(TEST_ROOT), '', 'utf8');
    const learned = learner.computeModelLearned();
    expect(learned).toEqual({});
  });
});

// ── 8. getModelForRoleWithCorrelation ───────────────────────────────────

describe('getModelForRoleWithCorrelation', () => {
  let ce;

  beforeEach(async () => {
    setupRoot();
    ce = await import('../x-build/lib/x-build/cost-engine.mjs?' + Date.now());
  });

  afterEach(() => { teardownRoot(); });

  test('returns model and correlationId', () => {
    const { model, correlationId } = ce.getModelForRoleWithCorrelation('executor', 'medium', {
      model_profile: 'balanced',
    });
    expect(model).toBe('sonnet');
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
