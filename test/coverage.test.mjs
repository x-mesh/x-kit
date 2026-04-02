/**
 * Additional tests to improve coverage on export.mjs, misc.mjs, and project.mjs
 */
import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '..', 'x-build', 'lib', 'x-build-cli.mjs');

const TEST_HOME = mkdtempSync(join(tmpdir(), 'xb-cov-'));

function run(args, opts = {}) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    env: { ...process.env, XKIT_SERVER: undefined, HOME: TEST_HOME, ...opts.env },
    encoding: 'utf8',
    timeout: 15000,
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

function addTasks(tmp, count = 3) {
  for (let i = 1; i <= count; i++) {
    const args = ['tasks', 'add', `Task ${i}`, '--size', i === 1 ? 'small' : i === 2 ? 'medium' : 'large'];
    if (i > 1) args.push('--deps', `t${i - 1}`);
    run(args, { cwd: tmp });
  }
}

// ── Export tests ────────────────────────────────────────────────────

describe('export', () => {
  test('export markdown format', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-exp-'));
    try {
      setupProject(tmp);
      addTasks(tmp);
      run(['steps', 'compute'], { cwd: tmp });
      const r = run(['export', '--format', 'md', '--output', tmp], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Exported');
      const file = join(tmp, 'test-proj-report.md');
      expect(existsSync(file)).toBe(true);
      const content = readFileSync(file, 'utf8');
      expect(content).toContain('Task 1');
      expect(content).toContain('Step');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('export CSV format', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-exp-'));
    try {
      setupProject(tmp);
      addTasks(tmp);
      const r = run(['export', '--format', 'csv', '--output', tmp], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Exported');
      const file = join(tmp, 'test-proj-tasks.csv');
      expect(existsSync(file)).toBe(true);
      const content = readFileSync(file, 'utf8');
      expect(content).toContain('ID,Name');
      expect(content).toContain('Task 1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('export Jira format', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-exp-'));
    try {
      setupProject(tmp);
      addTasks(tmp);
      const r = run(['export', '--format', 'jira', '--output', tmp], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Jira');
      const file = join(tmp, 'test-proj-jira.json');
      expect(existsSync(file)).toBe(true);
      const data = JSON.parse(readFileSync(file, 'utf8'));
      expect(data.issues.length).toBe(3);
      expect(data.issues[2].priority).toBe('High'); // large → High
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('export Confluence format', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-exp-'));
    try {
      setupProject(tmp);
      addTasks(tmp);
      const r = run(['export', '--format', 'confluence', '--output', tmp], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Confluence');
      const file = join(tmp, 'test-proj-confluence.wiki');
      expect(existsSync(file)).toBe(true);
      const content = readFileSync(file, 'utf8');
      expect(content).toContain('h1.');
      expect(content).toContain('Task 1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('import CSV', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-imp-'));
    try {
      setupProject(tmp);
      const csvFile = join(tmp, 'tasks.csv');
      writeFileSync(csvFile, 'Name,Size,Dependencies\nSetup DB,small,\nAdd API,medium,t1\nTests,large,t1;t2\n');
      const r = run(['import', csvFile, '--from', 'csv'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Imported 3 tasks');
      const list = run(['tasks', 'list'], { cwd: tmp });
      expect(list.stdout).toContain('Setup DB');
      expect(list.stdout).toContain('Add API');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('import Jira JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-imp-'));
    try {
      setupProject(tmp);
      const jiraFile = join(tmp, 'jira.json');
      writeFileSync(jiraFile, JSON.stringify({
        issues: [
          { key: 'PROJ-1', summary: 'Auth module', priority: 'High' },
          { key: 'PROJ-2', summary: 'Dashboard', priority: 'Low' },
        ]
      }));
      const r = run(['import', jiraFile, '--from', 'jira'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Imported 2 tasks');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('import missing file shows error', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-imp-'));
    try {
      setupProject(tmp);
      const r = run(['import', '/nonexistent.csv'], { cwd: tmp });
      expect(r.exitCode).not.toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Misc command tests ──────────────────────────────────────────────

describe('misc commands', () => {
  test('demo runs successfully', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-demo-'));
    try {
      const r = run(['demo'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Demo');
      expect(r.stdout).toContain('demo');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('help command shows usage', () => {
    const r = run(['help']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('x-build');
    expect(r.stdout).toContain('init');
    expect(r.stdout).toContain('tasks');
    expect(r.stdout).toContain('steps');
  });

  test('mode show displays current mode', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-mode-'));
    try {
      setupProject(tmp);
      const r = run(['mode'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toMatch(/모드|mode/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('mode developer sets developer mode', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-mode-'));
    try {
      setupProject(tmp);
      const r = run(['mode', 'developer'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Developer mode');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('mode normal sets normal mode', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-mode-'));
    try {
      setupProject(tmp);
      const r = run(['mode', 'normal'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('일반인 모드');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('mode invalid value rejected', () => {
    const r = run(['mode', 'invalid']);
    expect(r.exitCode).not.toBe(0);
  });

  test('decisions list with no decisions', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-dec-'));
    try {
      setupProject(tmp);
      const r = run(['decisions', 'list'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('No decisions');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('decisions add and list', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-dec-'));
    try {
      setupProject(tmp);
      const add = run(['decisions', 'add', 'Use PostgreSQL', '--rationale', 'Battle-tested', '--type', 'architecture'], { cwd: tmp });
      expect(add.exitCode).toBe(0);
      expect(add.stdout).toContain('Decision recorded');

      const list = run(['decisions', 'list'], { cwd: tmp });
      expect(list.stdout).toContain('Use PostgreSQL');
      expect(list.stdout).toContain('Battle-tested');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('decisions inject', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-dec-'));
    try {
      setupProject(tmp);
      run(['decisions', 'add', 'Use REST', '--rationale', 'simplicity'], { cwd: tmp });
      const r = run(['decisions', 'inject'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Key Decisions');
      expect(r.stdout).toContain('Use REST');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('context generates brief', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-ctx-'));
    try {
      setupProject(tmp);
      addTasks(tmp);
      const r = run(['context'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Context Brief');
      expect(r.stdout).toContain('Phase Status');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('phase-context shows phase-aware loading', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-pctx-'));
    try {
      setupProject(tmp);
      const r = run(['phase-context'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Phase-Aware Context');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('templates init and list', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-tpl-'));
    try {
      setupProject(tmp);
      const init = run(['templates', 'init'], { cwd: tmp });
      expect(init.exitCode).toBe(0);
      expect(init.stdout).toContain('Templates initialized');

      const list = run(['templates', 'list'], { cwd: tmp });
      expect(list.exitCode).toBe(0);
      expect(list.stdout).toContain('add-auth');
      expect(list.stdout).toContain('setup-ci');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('templates use applies a template', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-tpl-'));
    try {
      setupProject(tmp);
      run(['templates', 'init'], { cwd: tmp });
      const r = run(['templates', 'use', 'add-auth'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Template');
      expect(r.stdout).toContain('Task');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('metrics with no data', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-met-'));
    try {
      setupProject(tmp);
      const r = run(['metrics'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('No metrics');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Project command tests ───────────────────────────────────────────

describe('project commands', () => {
  test('list shows projects', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-list-'));
    try {
      setupProject(tmp, 'alpha');
      setupProject(tmp, 'beta');
      const r = run(['list'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('alpha');
      expect(r.stdout).toContain('beta');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('status shows project details', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-stat-'));
    try {
      setupProject(tmp);
      const r = run(['status'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('test-proj');
      expect(r.stdout).toMatch(/Research|조사하기/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('status in plan phase with tasks shows task summary', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-stat-'));
    try {
      setupProject(tmp);
      run(['phase', 'next'], { cwd: tmp }); // move to plan phase
      addTasks(tmp);
      const r = run(['status'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toMatch(/Tasks|할 일/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('close project generates summary', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-close-'));
    try {
      setupProject(tmp);
      addTasks(tmp);
      const r = run(['close', '--summary', 'Completed successfully'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('closed');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('dashboard shows multi-project overview', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-dash-'));
    try {
      setupProject(tmp, 'proj-a');
      setupProject(tmp, 'proj-b');
      const r = run(['dashboard'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Dashboard');
      expect(r.stdout).toContain('proj-a');
      expect(r.stdout).toContain('proj-b');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('init duplicate project fails', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-dup-'));
    try {
      setupProject(tmp, 'same');
      const r = run(['init', 'same'], { cwd: tmp });
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('already exists');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('init without name shows usage', () => {
    const r = run(['init']);
    expect(r.exitCode).not.toBe(0);
  });

  test('phase set advances phases correctly', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-phase-'));
    try {
      setupProject(tmp);
      const r = run(['phase', 'set', 'plan'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      const status = run(['status'], { cwd: tmp });
      expect(status.stdout).toMatch(/Plan|계획 세우기/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Task management tests ───────────────────────────────────────────

describe('task management', () => {
  test('task remove without dependents succeeds', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-rm-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      run(['tasks', 'add', 'Task B'], { cwd: tmp });
      const r = run(['tasks', 'remove', 't2'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('removed');
      const list = run(['tasks', 'list'], { cwd: tmp });
      expect(list.stdout).toContain('Task A');
      expect(list.stdout).not.toContain('Task B');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('task remove with dependents blocked without --cascade', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-rm-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      run(['tasks', 'add', 'Task B', '--deps', 't1'], { cwd: tmp });
      const r = run(['tasks', 'remove', 't1'], { cwd: tmp });
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('depended on by');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('task remove with --cascade removes dependents', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-rm-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      run(['tasks', 'add', 'Task B', '--deps', 't1'], { cwd: tmp });
      run(['tasks', 'add', 'Task C', '--deps', 't2'], { cwd: tmp });
      const r = run(['tasks', 'remove', 't1', '--cascade'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('t1');
      expect(r.stdout).toContain('t2');
      expect(r.stdout).toContain('t3');
      const list = run(['tasks', 'list'], { cwd: tmp });
      expect(list.stdout).not.toContain('Task A');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('task remove nonexistent id fails', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-rm-'));
    try {
      setupProject(tmp);
      const r = run(['tasks', 'remove', 't999'], { cwd: tmp });
      expect(r.exitCode).not.toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('task update status to completed', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-upd-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      const r = run(['tasks', 'update', 't1', '--status', 'completed'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('completed');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('task update status to running', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-upd-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      const r = run(['tasks', 'update', 't1', '--status', 'running'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('running');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('task update with invalid status fails', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-upd-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      const r = run(['tasks', 'update', 't1', '--status', 'bogus'], { cwd: tmp });
      expect(r.exitCode).not.toBe(0);
      expect(r.stderr).toContain('Invalid status');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('task update done-criteria', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-upd-'));
    try {
      setupProject(tmp);
      run(['tasks', 'add', 'Task A'], { cwd: tmp });
      const r = run(['tasks', 'update', 't1', '--done-criteria', 'All tests pass;Coverage > 80%'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('done_criteria');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('tasks add with strategy and rubric', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-strat-'));
    try {
      setupProject(tmp);
      const r = run(['tasks', 'add', 'Review auth', '--strategy', 'review', '--rubric', 'security', '--size', 'large'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('Task added');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('steps status shows step details', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-ss-'));
    try {
      setupProject(tmp);
      addTasks(tmp);
      run(['steps', 'compute'], { cwd: tmp });
      const r = run(['steps', 'status'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toMatch(/Step|step/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('steps next shows next executable step', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-sn-'));
    try {
      setupProject(tmp);
      addTasks(tmp);
      run(['steps', 'compute'], { cwd: tmp });
      const r = run(['steps', 'next'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Phase lifecycle tests ───────────────────────────────────────────

describe('phase lifecycle', () => {
  test('phase next advances from research to plan', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-pn-'));
    try {
      setupProject(tmp);
      const r = run(['phase', 'next'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      const status = run(['status'], { cwd: tmp });
      expect(status.stdout).toMatch(/Plan|계획 세우기/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('phase next through multiple phases', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-pn-'));
    try {
      setupProject(tmp);
      run(['phase', 'next'], { cwd: tmp }); // research → plan
      run(['phase', 'next'], { cwd: tmp }); // plan → execute
      const status = run(['status'], { cwd: tmp });
      expect(status.stdout).toMatch(/Execute|실행하기/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('phase set to execute directly', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-ps-'));
    try {
      setupProject(tmp);
      const r = run(['phase', 'set', 'execute'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      const status = run(['status'], { cwd: tmp });
      expect(status.stdout).toMatch(/Execute|실행하기/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('gate pass and fail', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-gate-'));
    try {
      setupProject(tmp);
      const pass = run(['gate', 'pass', 'Approved by team'], { cwd: tmp });
      expect(pass.exitCode).toBe(0);
      expect(pass.stdout).toMatch(/pass|Gate/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('checkpoint creates a snapshot', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-ckp-'));
    try {
      setupProject(tmp);
      addTasks(tmp);
      const r = run(['checkpoint', 'auto', 'Mid-sprint check'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toMatch(/Checkpoint|checkpoint/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('quality check runs on project', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-qual-'));
    try {
      setupProject(tmp);
      const r = run(['quality'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── Export edge cases ───────────────────────────────────────────────

describe('export edge cases', () => {
  test('export with decisions included', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-expd-'));
    try {
      setupProject(tmp);
      addTasks(tmp);
      run(['decisions', 'add', 'Use REST API', '--rationale', 'simplicity'], { cwd: tmp });
      run(['steps', 'compute'], { cwd: tmp });
      const r = run(['export', '--format', 'md', '--output', tmp], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      const file = join(tmp, 'test-proj-report.md');
      const content = readFileSync(file, 'utf8');
      expect(content).toContain('Decisions');
      expect(content).toContain('Use REST API');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('export confluence with steps and decisions', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-expc-'));
    try {
      setupProject(tmp);
      addTasks(tmp);
      run(['decisions', 'add', 'PostgreSQL', '--rationale', 'reliability'], { cwd: tmp });
      run(['steps', 'compute'], { cwd: tmp });
      const r = run(['export', '--format', 'confluence', '--output', tmp], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      const file = join(tmp, 'test-proj-confluence.wiki');
      const content = readFileSync(file, 'utf8');
      expect(content).toContain('Steps');
      expect(content).toContain('Decisions');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('import with no file argument shows error', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-imp-'));
    try {
      setupProject(tmp);
      const r = run(['import'], { cwd: tmp });
      expect(r.exitCode).not.toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('import unsupported format shows error message', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-imp-'));
    try {
      setupProject(tmp);
      const dummyFile = join(tmp, 'dummy.txt');
      writeFileSync(dummyFile, 'hello');
      const r = run(['import', dummyFile, '--from', 'xml'], { cwd: tmp });
      expect(r.stderr).toContain('Unsupported format');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
