// getExecutionBackend / isTermMeshSession — backend resolution precedence
// Contract: docs/term-mesh-integration.md
// Precedence: XK_BACKEND env → execution_backend config → auto-detect

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const cfg = await import('../x-build/lib/shared-config.mjs');

let xmRoot;
const savedEnv = {};
const ENV_KEYS = ['XK_BACKEND', 'TERMMESH_SOCKET', 'XM_ROOT'];

function writeConfig(obj) {
  writeFileSync(join(xmRoot, 'config.json'), JSON.stringify(obj, null, 2));
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  xmRoot = mkdtempSync(join(tmpdir(), 'xk-backend-'));
  mkdirSync(xmRoot, { recursive: true });
  process.env.XM_ROOT = xmRoot;
});

afterEach(() => {
  rmSync(xmRoot, { recursive: true, force: true });
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('isTermMeshSession', () => {
  test('true when TERMMESH_SOCKET is set', () => {
    process.env.TERMMESH_SOCKET = '/tmp/does-not-need-to-exist.sock';
    expect(cfg.isTermMeshSession()).toBe(true);
  });
  // No false-case assertion for the /tmp scan: a real term-mesh socket on the
  // host would make it flaky. The 'auto' tests below pin detection via env.
});

describe('getExecutionBackend', () => {
  test('default (no env, no config) is auto: native without a session', () => {
    // Guard: skip silently if the host actually runs term-mesh.
    if (cfg.isTermMeshSession()) return;
    expect(cfg.getExecutionBackend()).toBe('native');
  });

  test('auto resolves to term-mesh when TERMMESH_SOCKET is set', () => {
    process.env.TERMMESH_SOCKET = '/tmp/fake.sock';
    expect(cfg.getExecutionBackend()).toBe('term-mesh');
  });

  test('config native wins over detected session', () => {
    process.env.TERMMESH_SOCKET = '/tmp/fake.sock';
    writeConfig({ execution_backend: 'native' });
    expect(cfg.getExecutionBackend()).toBe('native');
  });

  test('config term-mesh forces even without a session', () => {
    writeConfig({ execution_backend: 'term-mesh' });
    expect(cfg.getExecutionBackend()).toBe('term-mesh');
  });

  test('XK_BACKEND env beats config', () => {
    writeConfig({ execution_backend: 'term-mesh' });
    process.env.XK_BACKEND = 'native';
    expect(cfg.getExecutionBackend()).toBe('native');
  });

  test('XK_BACKEND=auto falls through to detection, ignoring config', () => {
    writeConfig({ execution_backend: 'native' });
    process.env.XK_BACKEND = 'auto';
    process.env.TERMMESH_SOCKET = '/tmp/fake.sock';
    expect(cfg.getExecutionBackend()).toBe('term-mesh');
  });

  test('invalid env value is ignored (falls back to config)', () => {
    process.env.XK_BACKEND = 'tmux';
    writeConfig({ execution_backend: 'native' });
    process.env.TERMMESH_SOCKET = '/tmp/fake.sock';
    expect(cfg.getExecutionBackend()).toBe('native');
  });

  test('invalid config value behaves as auto', () => {
    writeConfig({ execution_backend: 'yes-please' });
    process.env.TERMMESH_SOCKET = '/tmp/fake.sock';
    expect(cfg.getExecutionBackend()).toBe('term-mesh');
  });
});
