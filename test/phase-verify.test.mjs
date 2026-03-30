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

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function setupProject(tmp, name = 'test-proj') {
  run(['init', name], { cwd: tmp });
  return name;
}

function projectPath(tmp, name, ...segments) {
  return join(tmp, '.xm', 'build', 'projects', name, ...segments);
}

// ── Phase transitions ─────────────────────────────────────────────

describe('phase transitions', () => {
  test('phase next auto-advances from research to plan', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      const r = run(['phase', 'next'], { cwd: tmp });
      expect(r.stdout).toContain('Plan');
      const manifest = readJSON(projectPath(tmp, name, 'manifest.json'));
      expect(manifest.current_phase).toBe('02-plan');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('gate pass + phase next advances to plan', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      // Create minimal research artifacts
      writeFileSync(projectPath(tmp, name, 'context', 'CONTEXT.md'), '# Context\nGoal: test');
      run(['gate', 'pass', 'Research done'], { cwd: tmp });
      run(['phase', 'next'], { cwd: tmp });
      const manifest = readJSON(projectPath(tmp, name, 'manifest.json'));
      expect(manifest.current_phase).toBe('02-plan');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('phase set skips directly to execute', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      run(['phase', 'set', 'execute'], { cwd: tmp });
      const manifest = readJSON(projectPath(tmp, name, 'manifest.json'));
      expect(manifest.current_phase).toBe('03-execute');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('phase set to verify', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      run(['phase', 'set', 'verify'], { cwd: tmp });
      const manifest = readJSON(projectPath(tmp, name, 'manifest.json'));
      expect(manifest.current_phase).toBe('04-verify');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('invalid phase sub-command rejected', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['phase', 'invalid'], { cwd: tmp });
      expect(r.exitCode).not.toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Checkpoint ────────────────────────────────────────────────────

describe('checkpoint', () => {
  test('checkpoint records marker', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['checkpoint', 'auto', 'Test checkpoint'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('checkpoint');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Verify coverage ───────────────────────────────────────────────

describe('verify-coverage', () => {
  test('detects covered and uncovered requirements', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      writeFileSync(
        projectPath(tmp, name, 'context', 'REQUIREMENTS.md'),
        '- [R1] User authentication\n- [R2] CRUD API\n- [R3] Admin panel\n'
      );
      run(['tasks', 'add', 'Implement auth [R1]'], { cwd: tmp });
      run(['tasks', 'add', 'Build CRUD API [R2]'], { cwd: tmp });

      const r = run(['verify-coverage'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('[covered]');
      expect(r.stdout).toContain('[missing]');
      expect(r.stdout).toContain('R3');
      expect(r.stdout).toContain('2/3');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('100% coverage shows all covered', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      writeFileSync(
        projectPath(tmp, name, 'context', 'REQUIREMENTS.md'),
        '- [R1] Auth\n- [R2] API\n'
      );
      run(['tasks', 'add', 'Auth [R1]'], { cwd: tmp });
      run(['tasks', 'add', 'API [R2]'], { cwd: tmp });

      const r = run(['verify-coverage'], { cwd: tmp });
      expect(r.stdout).toContain('All requirements covered');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('no requirements file shows message', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['verify-coverage'], { cwd: tmp });
      expect(r.stdout).toContain('No REQUIREMENTS');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Verify traceability ───────────────────────────────────────────

describe('verify-traceability', () => {
  test('full traceability with PRD + tasks + done_criteria', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      writeFileSync(
        projectPath(tmp, name, 'context', 'REQUIREMENTS.md'),
        '- [R1] Auth\n- [R2] API\n'
      );
      writeFileSync(
        projectPath(tmp, name, 'phases', '02-plan', 'PRD.md'),
        '# PRD\n## 8. Acceptance Criteria\n- [ ] User can login [R1]\n- [ ] CRUD works [R2]\n'
      );
      run(['tasks', 'add', 'Auth [R1]', '--done-criteria', 'Login works'], { cwd: tmp });
      run(['tasks', 'add', 'API [R2]', '--done-criteria', 'CRUD works'], { cwd: tmp });

      const r = run(['verify-traceability'], { cwd: tmp });
      expect(r.stdout).toContain('Traceability Matrix');
      expect(r.stdout).toContain('full');

      // Check saved JSON
      const traceFile = projectPath(tmp, name, 'phases', '04-verify', 'traceability.json');
      expect(existsSync(traceFile)).toBe(true);
      const trace = readJSON(traceFile);
      expect(trace.fully_covered).toBe(2);
      expect(trace.gaps).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('partial traceability detected', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      writeFileSync(
        projectPath(tmp, name, 'context', 'REQUIREMENTS.md'),
        '- [R1] Auth\n- [R2] API\n'
      );
      // Task without done_criteria, no PRD AC
      run(['tasks', 'add', 'Auth [R1]'], { cwd: tmp });

      const r = run(['verify-traceability'], { cwd: tmp });
      expect(r.stdout).toContain('partial');
      expect(r.stdout).toContain('gaps');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Verify contracts ──────────────────────────────────────────────

describe('verify-contracts', () => {
  test('lists completed tasks with done_criteria', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Auth [R1]', '--done-criteria', 'Login works;Tests pass'], { cwd: tmp });
      run(['tasks', 'update', 't1', '--status', 'completed'], { cwd: tmp });

      const r = run(['verify-contracts'], { cwd: tmp });
      expect(r.stdout).toContain('Acceptance Contract');
      expect(r.stdout).toContain('Login works');
      expect(r.stdout).toContain('Tests pass');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('no completed tasks shows message', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['verify-contracts'], { cwd: tmp });
      expect(r.stdout).toContain('No completed tasks');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Quality ───────────────────────────────────────────────────────

describe('quality', () => {
  test('quality runs without crash', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['quality'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      // Should show quality check output (might detect no tools)
      expect(r.stdout).toContain('quality');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Handoff ───────────────────────────────────────────────────────

describe('handoff', () => {
  test('handoff saves session state', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      const r = run(['handoff'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(existsSync(projectPath(tmp, name, 'HANDOFF.json'))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('handoff --restore shows saved state', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      run(['handoff'], { cwd: tmp });
      const r = run(['handoff', '--restore'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Task A');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
