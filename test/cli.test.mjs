import { describe, test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '..', 'x-kit', 'lib', 'x-build-cli.mjs');

function run(args, opts = {}) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd: opts.cwd ?? process.cwd(),
    env: { ...process.env, ...opts.env },
    encoding: 'utf8',
    timeout: 10000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

describe('x-build CLI', () => {
  test('help prints usage', () => {
    const r = run(['help']);
    expect(r.stdout + r.stderr).toContain('x-build');
    expect(r.exitCode).toBe(0);
  });

  test('init creates project', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const r = run(['init', 'test-project'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('test-project');
      expect(existsSync(join(tmp, '.xm', 'build', 'projects', 'test-project'))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('status without project shows message', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const r = run(['status'], { cwd: tmp });
      // Should either show "no project" or exit with message
      expect(r.stdout + r.stderr).toBeTruthy();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('demo outputs JSON with action field', () => {
    const r = run(['demo']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('"action": "demo"');
    expect(r.stdout).toContain('suggested_tasks');
    expect(r.stdout).toContain('x-build Demo');
  });

  test('plan without goal shows current plan or message', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      const r = run(['init', 'tp'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      const r2 = run(['plan'], { cwd: tmp });
      expect(r2.stdout + r2.stderr).toBeTruthy();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('plan with goal outputs auto-plan JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      run(['init', 'tp'], { cwd: tmp });
      const r = run(['plan', 'Build a hello world app'], { cwd: tmp });
      expect(r.stdout).toContain('"action": "auto-plan"');
      expect(r.stdout).toContain('Build a hello world app');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('list shows projects', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xb-test-'));
    try {
      run(['init', 'p1'], { cwd: tmp });
      const r = run(['list'], { cwd: tmp });
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('p1');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
