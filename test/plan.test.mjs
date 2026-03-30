import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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

function addTasks(tmp, tasks) {
  for (const t of tasks) {
    const args = ['tasks', 'add', t.name];
    if (t.deps) args.push('--deps', t.deps);
    if (t.size) args.push('--size', t.size);
    if (t.strategy) args.push('--strategy', t.strategy);
    if (t.team) args.push('--team', t.team);
    run(args, { cwd: tmp });
  }
}

function writePRD(tmp, name, content) {
  const prdDir = join(tmp, '.xm', 'build', 'projects', name, 'phases', '02-plan');
  mkdirSync(prdDir, { recursive: true });
  writeFileSync(join(prdDir, 'PRD.md'), content);
}

function writeRequirements(tmp, name, content) {
  const ctxDir = join(tmp, '.xm', 'build', 'projects', name, 'context');
  mkdirSync(ctxDir, { recursive: true });
  writeFileSync(join(ctxDir, 'REQUIREMENTS.md'), content);
}

describe('plan-check dimensions', () => {
  test('scope-clarity warns on missing done_criteria', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      addTasks(tmp, [
        { name: 'Implement auth [R1]', size: 'medium' },
      ]);
      const r = run(['plan-check'], { cwd: tmp });
      expect(r.stdout).toContain('scope-clarity');
      expect(r.stdout).toContain('no done_criteria');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('risk-ordering warns on late large root tasks', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      addTasks(tmp, [
        { name: 'Setup config [R1]', size: 'small' },
        { name: 'Build API [R2]', size: 'small' },
        { name: 'Design architecture [R3]', size: 'large' },
      ]);
      const r = run(['plan-check'], { cwd: tmp });
      expect(r.stdout).toContain('risk-ordering');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('tech-leakage dimension exists in output', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      addTasks(tmp, [{ name: 'Setup project [R1]', size: 'small' }]);
      const r = run(['plan-check'], { cwd: tmp });
      expect(r.stdout).toContain('tech-leakage');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('done_criteria generation', () => {
  test('generates domain-specific criteria for auth tasks', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      writePRD(tmp, name, `# PRD\n## 8. Acceptance Criteria\n- [ ] User can login [R1]\n`);
      addTasks(tmp, [{ name: 'Implement JWT auth [R1]', size: 'medium' }]);
      const r = run(['tasks', 'done-criteria'], { cwd: tmp });
      expect(r.stdout).toContain('done_criteria generated');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('forecast', () => {
  test('shows confidence indicators', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      addTasks(tmp, [
        { name: 'Setup basics [R1]', size: 'small' },
        { name: 'Security auth review [R2]', size: 'large', strategy: 'review' },
      ]);
      // Move to plan phase
      run(['phase', 'set', 'plan'], { cwd: tmp });
      run(['steps', 'compute'], { cwd: tmp });
      const r = run(['forecast'], { cwd: tmp });
      expect(r.stdout).toContain('Confidence');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('prd-gate', () => {
  test('outputs JSON with rubric', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      writePRD(tmp, name, '# PRD\n## 1. Goal\nBuild API\n## 8. Acceptance Criteria\n- [ ] Works\n');
      const r = run(['prd-gate'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      const output = JSON.parse(r.stdout);
      expect(output.action).toBe('prd-gate');
      expect(output.rubric).toBeArray();
      expect(output.rubric.length).toBe(5);
      expect(output.threshold).toBe(7);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('fails without PRD', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['prd-gate'], { cwd: tmp });
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('No PRD');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('consensus', () => {
  test('outputs JSON with 4 agents', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      writePRD(tmp, name, '# PRD\n## 1. Goal\nBuild API\n');
      const r = run(['consensus'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      const output = JSON.parse(r.stdout);
      expect(output.action).toBe('consensus');
      expect(output.agents).toBeArray();
      expect(output.agents.length).toBe(4);
      expect(output.agents.map(a => a.role)).toEqual(['architect', 'critic', 'planner', 'security']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('verify-traceability', () => {
  test('shows traceability matrix', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      writeRequirements(tmp, name, '- [R1] User authentication\n- [R2] CRUD API\n');
      addTasks(tmp, [
        { name: 'Implement auth [R1]', size: 'medium' },
      ]);
      const r = run(['verify-traceability'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Traceability Matrix');
      expect(r.stdout).toContain('[R1]');
      expect(r.stdout).toContain('[R2]');
      expect(r.stdout).toContain('gaps');
      // R2 should show as gap
      expect(r.stdout).toContain('NONE');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('task features', () => {
  test('task add with --team stores team field', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      const r = run(['tasks', 'add', 'Build payment [R1]', '--team', 'engineering'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      const r2 = run(['tasks', 'list'], { cwd: tmp });
      expect(r2.stdout).toContain('Build payment');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('task add with --strategy stores strategy field', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Review auth [R1]', '--strategy', 'review'], { cwd: tmp });
      const r = run(['tasks', 'list'], { cwd: tmp });
      expect(r.stdout).toContain('[review]');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('task scoring shows quality summary', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      setupProject(tmp);
      addTasks(tmp, [
        { name: 'Task A [R1]', size: 'small' },
        { name: 'Task B [R2]', size: 'small' },
      ]);
      run(['tasks', 'update', 't1', '--score', '8.0'], { cwd: tmp });
      run(['tasks', 'update', 't2', '--score', '6.5'], { cwd: tmp });
      const r = run(['tasks', 'list'], { cwd: tmp });
      expect(r.stdout).toContain('Quality');
      expect(r.stdout).toContain('avg');
      expect(r.stdout).toContain('below 7.0');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('scope creep detection', () => {
  test('warns when task matches Out of Scope', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const name = setupProject(tmp);
      writePRD(tmp, name, '# PRD\n## 6. Out of Scope\n- Real-time notifications\n- Mobile app\n');
      const r = run(['tasks', 'add', 'Add notifications system [R5]'], { cwd: tmp });
      expect(r.stdout).toContain('Scope warning');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
