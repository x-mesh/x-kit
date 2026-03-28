#!/usr/bin/env bun
/**
 * x-kit-server.mjs — Persistent HTTP server for x-kit CLI tools
 *
 * Architecture: Bun HTTP server → import existing CLI modules → serve via HTTP
 * Pattern: gstack-inspired persistent process with idle shutdown
 *
 * Usage: bun x-kit-server.mjs [--port N] [--idle-timeout N]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

// ── Config ──────────────────────────────────────────────────────────

const DEFAULT_PORT = 19840;
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const VERSION = '0.1.0';

const args = process.argv.slice(2);
const PORT = parseInt(getArg('--port') ?? String(DEFAULT_PORT), 10);
const IDLE_TIMEOUT_MS = parseInt(getArg('--idle-timeout') ?? String(DEFAULT_IDLE_TIMEOUT_MS), 10);
const RUN_DIR = join(homedir(), '.xm', 'run');
const PID_FILE = join(RUN_DIR, 'xkit-server.pid');
const LIB_DIR = resolve(dirname(new URL(import.meta.url).pathname), '..');

// Flag to prevent CLI top-level execution on import
process.env.XKIT_SERVER = '1';

// ── Idle Timer ──────────────────────────────────────────────────────

let idleTimer = null;
let lastActivity = Date.now();
const startedAt = Date.now();

function resetIdleTimer() {
  lastActivity = Date.now();
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.log(`[x-kit-server] Idle for ${IDLE_TIMEOUT_MS / 1000}s, shutting down.`);
    shutdown();
  }, IDLE_TIMEOUT_MS);
}

// ── CLI Module Cache (direct import) ────────────────────────────────

const cliRouters = new Map();

async function loadCLIRouter(plugin) {
  if (cliRouters.has(plugin)) return cliRouters.get(plugin);

  const cliPath = join(LIB_DIR, `${plugin}-cli.mjs`);
  if (!existsSync(cliPath)) return null;

  try {
    const mod = await import(cliPath);
    if (typeof mod.route === 'function') {
      cliRouters.set(plugin, { type: 'direct', route: mod.route, CLIError: mod.CLIError });
      return cliRouters.get(plugin);
    }
  } catch {}

  // Fallback: subprocess
  cliRouters.set(plugin, { type: 'subprocess', path: cliPath });
  return cliRouters.get(plugin);
}

// ── Shared Config Cache ─────────────────────────────────────────────

let configCache = null;
let configCacheTime = 0;

function getConfigPath() {
  const xmRoot = process.env.XM_ROOT ?? join(process.cwd(), '.xm');
  return join(xmRoot, 'config.json');
}

function readConfigCached() {
  const configPath = getConfigPath();
  if (configCache && Date.now() - configCacheTime < 5000) {
    return configCache;
  }
  try {
    configCache = JSON.parse(readFileSync(configPath, 'utf8'));
    configCacheTime = Date.now();
  } catch {
    configCache = { mode: 'developer', agent_max_count: 4 };
    configCacheTime = Date.now();
  }
  return configCache;
}

function writeConfigCached(key, value) {
  const config = readConfigCached();
  config[key] = value;
  configCache = config;
  configCacheTime = Date.now();
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// ── Command Execution ───────────────────────────────────────────────

// Mutex: serialize direct-import execution (console/cwd are global state)
let execLock = Promise.resolve();

async function executeCommand(plugin, args, options = {}) {
  const prev = execLock;
  let releaseLock;
  execLock = new Promise(r => { releaseLock = r; });
  await prev;

  try {
    const router = await loadCLIRouter(plugin);
    if (!router) {
      return { exitCode: 1, stdout: '', stderr: `Unknown plugin: ${plugin}` };
    }

    const cwd = options.cwd ?? process.cwd();

    // Direct import mode
    if (router.type === 'direct') {
      const origCwd = process.cwd();
      const stdoutChunks = [];
      const stderrChunks = [];
      const origLog = console.log;
      const origError = console.error;
      const origWrite = process.stdout.write;
      const origErrWrite = process.stderr.write;

      console.log = (...a) => stdoutChunks.push(a.join(' ') + '\n');
      console.error = (...a) => stderrChunks.push(a.join(' ') + '\n');
      process.stdout.write = (chunk) => { stdoutChunks.push(String(chunk)); return true; };
      process.stderr.write = (chunk) => { stderrChunks.push(String(chunk)); return true; };

      const savedEnv = {};
      for (const [k, v] of Object.entries(options.env ?? {})) {
        savedEnv[k] = process.env[k];
        process.env[k] = v;
      }

      let exitCode = 0;
      try {
        process.chdir(cwd);
        await router.route(args);
      } catch (err) {
        if (router.CLIError && err instanceof router.CLIError) {
          stderrChunks.push(err.message + '\n');
          exitCode = err.exitCode;
        } else {
          stderrChunks.push(err.message + '\n');
          exitCode = 1;
        }
      } finally {
        console.log = origLog;
        console.error = origError;
        process.stdout.write = origWrite;
        process.stderr.write = origErrWrite;
        process.chdir(origCwd);
        for (const [k, v] of Object.entries(savedEnv)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }

      return { exitCode, stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') };
    }

    // Subprocess fallback
    const env = { ...process.env, ...(options.env ?? {}) };
    const proc = Bun.spawn(['bun', router.path, ...args], {
      cwd, env, stdout: 'pipe', stderr: 'pipe',
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { exitCode, stdout, stderr };
  } finally {
    releaseLock();
  }
}

// ── HTTP Server ─────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',

  async fetch(req) {
    resetIdleTimer();
    const url = new URL(req.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') {
      return Response.json({
        status: 'ok',
        version: VERSION,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        idle: Math.floor((Date.now() - lastActivity) / 1000),
        pid: process.pid,
        port: PORT,
      });
    }

    // Config endpoints
    if (path === '/config') {
      if (req.method === 'GET') {
        return Response.json(readConfigCached());
      }
      if (req.method === 'PUT') {
        const body = await req.json();
        if (body.key && body.value !== undefined) {
          writeConfigCached(body.key, body.value);
          return Response.json({ ok: true, config: readConfigCached() });
        }
        return Response.json({ error: 'Missing key or value' }, { status: 400 });
      }
    }

    // Shutdown endpoint
    if (path === '/shutdown') {
      setTimeout(() => shutdown(), 100);
      return Response.json({ status: 'shutting_down' });
    }

    // Plugin command execution: POST /exec
    if (path === '/exec' && req.method === 'POST') {
      const body = await req.json();
      const plugin = body.plugin ?? 'x-build';
      const args = body.args ?? [];
      const cwd = body.cwd ?? process.cwd();
      const env = body.env ?? {};

      const result = await executeCommand(plugin, args, { cwd, env });

      return Response.json({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

// ── Process Management ──────────────────────────────────────────────

function writePIDFile() {
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(PID_FILE, JSON.stringify({
    pid: process.pid,
    port: PORT,
    startedAt: new Date().toISOString(),
    version: VERSION,
  }, null, 2) + '\n', { mode: 0o600 });
}

function removePIDFile() {
  try { unlinkSync(PID_FILE); } catch {}
}

function shutdown() {
  console.log('[x-kit-server] Shutting down...');
  removePIDFile();
  server.stop();
  process.exit(0);
}

// Signal handlers
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ── Startup ─────────────────────────────────────────────────────────

writePIDFile();
resetIdleTimer();
console.log(`[x-kit-server] Started on http://127.0.0.1:${PORT} (pid: ${process.pid})`);
console.log(`[x-kit-server] Idle timeout: ${IDLE_TIMEOUT_MS / 1000}s`);
console.log(`[x-kit-server] PID file: ${PID_FILE}`);

// ── Helpers ─────────────────────────────────────────────────────────

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}
