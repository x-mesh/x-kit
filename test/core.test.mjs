import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '..', 'x-build', 'lib', 'x-build-cli.mjs');

function run(args, opts = {}) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    env: { ...process.env, XKIT_SERVER: undefined, ...opts.env },
    encoding: 'utf8',
    timeout: 10000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

function setupProject(tmp, name = 'test-proj') {
  run(['init', name], { cwd: tmp });
  return name;
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ── Phase lifecycle ───────────────────────────────────────────────

describe('phase lifecycle', () => {
  test('init starts at research phase', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      const manifest = readJSON(join(tmp, '.xm', 'build', 'projects', name, 'manifest.json'));
      expect(manifest.current_phase).toBe('01-research');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('phase status shows current phase', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['phase', 'status'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Research');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('phase set jumps to target phase', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      run(['phase', 'set', 'plan'], { cwd: tmp });
      const manifest = readJSON(join(tmp, '.xm', 'build', 'projects', name, 'manifest.json'));
      expect(manifest.current_phase).toBe('02-plan');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('gate pass records approval', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['gate', 'pass', 'Looks good'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('pass');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Task CRUD ─────────────────────────────────────────────────────

describe('task CRUD', () => {
  test('add + list + remove workflow', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      run(['tasks', 'add', 'Task B', '--deps', 't1'], { cwd: tmp });

      const r = run(['tasks', 'list'], { cwd: tmp });
      expect(r.stdout).toContain('Task A');
      expect(r.stdout).toContain('Task B');
      expect(r.stdout).toContain('t1');

      // Can't remove t1 because t2 depends on it
      const r2 = run(['tasks', 'remove', 't1'], { cwd: tmp });
      expect(r2.exitCode).not.toBe(0);

      // Can remove t2 (no dependents)
      const r3 = run(['tasks', 'remove', 't2'], { cwd: tmp });
      expect(r3.exitCode).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('update status transitions', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      run(['tasks', 'update', 't1', '--status', 'running'], { cwd: tmp });

      const tasks = readJSON(join(tmp, '.xm', 'build', 'projects', name, 'phases', '02-plan', 'tasks.json'));
      const t1 = tasks.tasks.find(t => t.id === 't1');
      expect(t1.status).toBe('running');
      expect(t1.started_at).toBeTruthy();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('failed status records failed_at timestamp', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      run(['tasks', 'update', 't1', '--status', 'failed', '--retry', 'false'], { cwd: tmp });

      const tasks = readJSON(join(tmp, '.xm', 'build', 'projects', name, 'phases', '02-plan', 'tasks.json'));
      const t1 = tasks.tasks.find(t => t.id === 't1');
      expect(t1.status).toBe('failed');
      expect(t1.failed_at).toBeTruthy();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('invalid status rejected', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      const r = run(['tasks', 'update', 't1', '--status', 'invalid'], { cwd: tmp });
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('Invalid status');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Steps (DAG) ───────────────────────────────────────────────────

describe('DAG steps', () => {
  test('steps compute creates step groups', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      run(['tasks', 'add', 'Task B'], { cwd: tmp });
      run(['tasks', 'add', 'Task C', '--deps', 't1,t2'], { cwd: tmp });

      const r = run(['steps', 'compute'], { cwd: tmp });
      expect(r.exitCode).toBe(0);

      const steps = readJSON(join(tmp, '.xm', 'build', 'projects', name, 'phases', '02-plan', 'steps.json'));
      expect(steps.steps.length).toBe(2); // Step 1: t1,t2 (parallel), Step 2: t3
      expect(steps.steps[0].tasks).toContain('t1');
      expect(steps.steps[0].tasks).toContain('t2');
      expect(steps.steps[1].tasks).toContain('t3');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('unknown dependency rejected on add', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['tasks', 'add', 'Task A', '--deps', 't99'], { cwd: tmp });
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('Unknown dependency');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Circuit breaker ───────────────────────────────────────────────

describe('circuit breaker', () => {
  test('status shows closed by default', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['circuit-breaker', 'status'], { cwd: tmp });
      expect(r.stdout).toContain('closed');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('reset restores closed state', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      run(['circuit-breaker', 'reset'], { cwd: tmp });
      const r = run(['circuit-breaker', 'status'], { cwd: tmp });
      expect(r.stdout).toContain('closed');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Cost estimation ───────────────────────────────────────────────

describe('cost estimation', () => {
  test('estimateTaskCost returns multiplied costs for complex tasks', async () => {
    const { estimateTaskCost } = await import('../x-build/lib/x-build/core.mjs');

    const simple = estimateTaskCost({ name: 'Setup config', size: 'small', depends_on: [] }, 'sonnet');
    const complex = estimateTaskCost({
      name: 'Security auth review',
      size: 'large',
      depends_on: ['t1', 't2', 't3'],
      strategy: 'review',
    }, 'opus');

    expect(simple.confidence).toBe('high');
    expect(simple.multiplier).toBeCloseTo(1.0, 1);

    expect(complex.confidence).toBe('low');
    expect(complex.multiplier).toBeGreaterThan(1.5);
    expect(complex.cost_usd).toBeGreaterThan(simple.cost_usd);
  });
});

// ── Export/Import ─────────────────────────────────────────────────

describe('export', () => {
  test('export md creates report file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      const r = run(['export', '--format', 'md'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Exported');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('export csv creates csv file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A', '--size', 'large'], { cwd: tmp });
      const r = run(['export', '--format', 'csv'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Exported');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Misc commands ─────────────────────────────────────────────────

describe('misc commands', () => {
  test('next recommends action', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['next'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Next Step');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('context generates brief', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['context'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Context Brief');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('decisions add + list', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      run(['decisions', 'add', 'Use PostgreSQL', '--type', 'architecture', '--rationale', 'Team expertise'], { cwd: tmp });
      const r = run(['decisions', 'list'], { cwd: tmp });
      expect(r.stdout).toContain('PostgreSQL');
      expect(r.stdout).toContain('Team expertise');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('close summarizes project', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['close', '--summary', 'Completed MVP'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
