#!/usr/bin/env node
/**
 * x-kit-client.mjs — Thin CLI client for x-kit persistent server
 *
 * Usage: node x-kit-client.mjs <plugin> <args...>
 *   e.g. node x-kit-client.mjs x-build status
 *        node x-kit-client.mjs x-build tasks add "my task" --size medium
 *
 * Flow:
 *   1. Read PID file → get port
 *   2. If server not running → auto-start (lazy start)
 *   3. POST /exec with plugin + args
 *   4. Print stdout, stderr; exit with same code
 *   5. On failure → fallback to direct node execution
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync, spawnSync } from 'node:child_process';

const RUN_DIR = join(homedir(), '.xm', 'run');
const PID_FILE = join(RUN_DIR, 'xkit-server.pid');
const REQUEST_TIMEOUT_MS = 30000;
const HEALTH_TIMEOUT_MS = 2000;
const LIB_DIR = resolve(dirname(new URL(import.meta.url).pathname), '..');

// ── Parse Arguments ─────────────────────────────────────────────────

const allArgs = process.argv.slice(2);

// Special: server management commands
if (allArgs[0] === 'server') {
  await handleServerCommand(allArgs.slice(1));
  process.exit(0);
}

// Plugin + command args
const plugin = allArgs[0] ?? 'x-build';
const cmdArgs = allArgs.slice(1);

// ── Main Flow ───────────────────────────────────────────────────────

const port = await ensureServer();
if (port) {
  const ok = await execViaServer(port, plugin, cmdArgs);
  if (ok) process.exit(ok.exitCode);
}

// Fallback to direct execution
execDirect(plugin, cmdArgs);

// ── Server Communication ────────────────────────────────────────────

async function ensureServer() {
  // Check if server is running
  const port = await getServerPort();
  if (port) return port;

  // Try to start
  const started = await autoStart();
  if (started) return started;

  return null; // fallback
}

async function getServerPort() {
  const info = readPIDFile();
  if (!info) return null;

  // Verify alive
  try {
    process.kill(info.pid, 0);
  } catch {
    // Stale PID
    return null;
  }

  // Health check
  const health = await quickHealth(info.port);
  if (health) return info.port;

  return null;
}

async function autoStart() {
  const bunPath = findBun();
  if (!bunPath) return null;

  const serverPath = resolve(dirname(new URL(import.meta.url).pathname), 'x-kit-server.mjs');
  if (!existsSync(serverPath)) return null;

  try {
    const { spawn } = await import('node:child_process');
    const child = spawn(bunPath, [serverPath], {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
    });
    child.unref();

    // Wait for ready
    const deadline = Date.now() + 5000;
    const port = 19840;
    while (Date.now() < deadline) {
      const health = await quickHealth(port);
      if (health) return port;
      await sleep(200);
    }
  } catch {}

  return null;
}

async function execViaServer(port, plugin, args) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(`http://127.0.0.1:${port}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plugin,
        args,
        cwd: process.cwd(),
        env: extractEnvOverrides(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const result = await res.json();

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    return { exitCode: result.exitCode ?? 0 };
  } catch {
    return null; // trigger fallback
  }
}

// ── Direct Execution Fallback ───────────────────────────────────────

function execDirect(plugin, args) {
  const cliPath = join(LIB_DIR, `${plugin}-cli.mjs`);
  if (!existsSync(cliPath)) {
    process.stderr.write(`Error: CLI not found for plugin "${plugin}" at ${cliPath}\n`);
    process.exit(1);
  }

  const result = spawnSync('node', [cliPath, ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  process.exit(result.status ?? 1);
}

// ── Server Management Commands ──────────────────────────────────────

async function handleServerCommand(args) {
  const subcmd = args[0];

  if (subcmd === 'status') {
    const info = readPIDFile();
    if (!info) {
      console.log('Server is not running.');
      return;
    }
    const health = await quickHealth(info.port);
    if (health) {
      console.log(`Server running (pid: ${health.pid}, port: ${info.port}, uptime: ${health.uptime}s)`);
    } else {
      console.log('Server PID file exists but not responding.');
    }
    return;
  }

  if (subcmd === 'stop') {
    const info = readPIDFile();
    if (!info) {
      console.log('Server is not running.');
      return;
    }
    try {
      await fetch(`http://127.0.0.1:${info.port}/shutdown`);
      console.log('Server shutdown requested.');
    } catch {
      try { process.kill(info.pid, 'SIGTERM'); } catch {}
      console.log('Server terminated.');
    }
    return;
  }

  if (subcmd === 'start') {
    const port = await autoStart();
    if (port) {
      console.log(`Server started on port ${port}.`);
    } else {
      console.log('Failed to start server. Is bun installed?');
    }
    return;
  }

  console.log('Usage: x-kit-client server <start|stop|status>');
}

// ── Helpers ─────────────────────────────────────────────────────────

function readPIDFile() {
  if (!existsSync(PID_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PID_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function quickHealth(port) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

function findBun() {
  const candidates = [
    join(homedir(), '.bun', 'bin', 'bun'),
    '/usr/local/bin/bun',
    '/opt/homebrew/bin/bun',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  try {
    return execSync('which bun', { encoding: 'utf8' }).trim() || null;
  } catch {}
  return null;
}

function extractEnvOverrides() {
  const relevant = {};
  for (const key of ['X_BUILD_ROOT', 'XM_ROOT', 'CLAUDE_PLUGIN_ROOT']) {
    if (process.env[key]) relevant[key] = process.env[key];
  }
  return relevant;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
