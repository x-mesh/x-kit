/**
 * x-kit-proc.mjs — Process management for x-kit server
 *
 * Handles: PID file, server start/stop, health check, stale PID cleanup, crash recovery
 */

import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync, spawn } from 'node:child_process';

const RUN_DIR = join(homedir(), '.xm', 'run');
const PID_FILE = join(RUN_DIR, 'xkit-server.pid');
const DEFAULT_PORT = 19840;
const STARTUP_TIMEOUT_MS = 5000;
const HEALTH_TIMEOUT_MS = 2000;

// ── PID File ────────────────────────────────────────────────────────

export function readPIDFile() {
  if (!existsSync(PID_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PID_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function cleanStalePID() {
  const info = readPIDFile();
  if (!info) return false;
  if (!isProcessAlive(info.pid)) {
    try { unlinkSync(PID_FILE); } catch {}
    return true; // was stale
  }
  return false; // still alive
}

// ── Health Check ────────────────────────────────────────────────────

export async function healthCheck(port) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) return await res.json();
    return null;
  } catch {
    return null;
  }
}

// ── Server Lifecycle ────────────────────────────────────────────────

export function findBun() {
  // Check common locations
  const candidates = [
    join(homedir(), '.bun', 'bin', 'bun'),
    '/usr/local/bin/bun',
    '/opt/homebrew/bin/bun',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // Try PATH
  try {
    const result = execSync('which bun', { encoding: 'utf8' }).trim();
    if (result) return result;
  } catch {}
  return null;
}

export async function startServer(options = {}) {
  const bunPath = findBun();
  if (!bunPath) return { ok: false, error: 'bun_not_found' };

  // Clean stale PID if any
  cleanStalePID();

  // Check if already running
  const existing = readPIDFile();
  if (existing && isProcessAlive(existing.pid)) {
    const health = await healthCheck(existing.port);
    if (health) return { ok: true, port: existing.port, pid: existing.pid, reused: true };
  }

  const port = options.port ?? DEFAULT_PORT;
  const serverPath = resolve(dirname(new URL(import.meta.url).pathname), 'x-kit-server.mjs');

  const child = spawn(bunPath, [serverPath, '--port', String(port)], {
    detached: true,
    stdio: 'ignore',
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...(options.env ?? {}) },
  });
  child.unref();

  // Wait for server to be ready
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const health = await healthCheck(port);
    if (health) return { ok: true, port, pid: health.pid, reused: false };
    await new Promise(r => setTimeout(r, 200));
  }

  return { ok: false, error: 'startup_timeout' };
}

export async function stopServer() {
  const info = readPIDFile();
  if (!info) return { ok: false, error: 'not_running' };

  // Try graceful shutdown via HTTP
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    await fetch(`http://127.0.0.1:${info.port}/shutdown`, { signal: controller.signal });
    clearTimeout(timeout);
  } catch {}

  // Wait a bit then verify
  await new Promise(r => setTimeout(r, 500));
  if (!isProcessAlive(info.pid)) {
    return { ok: true };
  }

  // Force kill
  try {
    process.kill(info.pid, 'SIGTERM');
    await new Promise(r => setTimeout(r, 1000));
    if (isProcessAlive(info.pid)) {
      process.kill(info.pid, 'SIGKILL');
    }
  } catch {}

  cleanStalePID();
  return { ok: true };
}

export async function serverStatus() {
  const info = readPIDFile();
  if (!info) return { running: false };

  if (!isProcessAlive(info.pid)) {
    cleanStalePID();
    return { running: false, stale_pid_cleaned: true };
  }

  const health = await healthCheck(info.port);
  if (!health) return { running: false, pid_alive: true, health_failed: true };

  return { running: true, ...health };
}
