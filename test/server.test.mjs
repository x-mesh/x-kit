import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, '..', 'x-kit', 'lib', 'server', 'x-kit-server.mjs');
const TEST_PORT = 19899;
const BASE = `http://127.0.0.1:${TEST_PORT}`;

let serverProc;

beforeAll(async () => {
  serverProc = spawn('bun', [SERVER_PATH, '--port', String(TEST_PORT), '--idle-timeout', '60000'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    cwd: join(__dirname, '..', 'x-kit', 'lib'),
  });

  // Wait for server ready
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Server did not start within 5s');
});

afterAll(() => {
  try { serverProc?.kill('SIGTERM'); } catch {}
});

describe('x-kit-server', () => {
  test('GET /health returns status ok', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.pid).toBeNumber();
    expect(body.port).toBe(TEST_PORT);
  });

  test('GET /config returns config object', async () => {
    const res = await fetch(`${BASE}/config`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeObject();
  });

  test('PUT /config sets a value', async () => {
    const res = await fetch(`${BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'test_key', value: 'test_value' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.config.test_key).toBe('test_value');
  });

  test('POST /exec rejects invalid plugin name', async () => {
    const res = await fetch(`${BASE}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: '../etc/passwd', args: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid plugin name');
  });

  test('POST /exec rejects plugin with dots', async () => {
    const res = await fetch(`${BASE}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: 'x-build.evil', args: [] }),
    });
    expect(res.status).toBe(400);
  });

  test('POST /exec accepts valid plugin name and returns response', async () => {
    const res = await fetch(`${BASE}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: 'x-build', args: ['list'] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('exitCode');
    expect(body).toHaveProperty('stdout');
    expect(body).toHaveProperty('stderr');
  });

  test('POST /exec returns error for unknown plugin', async () => {
    const res = await fetch(`${BASE}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plugin: 'nonexistent-plugin', args: [] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exitCode).toBe(1);
  });

  test('GET /unknown returns 404', async () => {
    const res = await fetch(`${BASE}/unknown`);
    expect(res.status).toBe(404);
  });
});

// Separate describe to ensure shutdown runs last
describe('x-kit-server shutdown', () => {
  test('POST /shutdown triggers shutdown', async () => {
    const res = await fetch(`${BASE}/shutdown`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('shutting_down');
  });
});
