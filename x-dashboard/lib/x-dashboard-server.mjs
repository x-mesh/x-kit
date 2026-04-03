#!/usr/bin/env bun
/**
 * x-dashboard-server.mjs — Bun HTTP server for xm-dashboard
 *
 * Architecture: Bun HTTP server → serves static files from public/ + JSON API
 * Pattern: follows x-kit-server.mjs for PID file management and shutdown
 *
 * Usage: bun x-dashboard-server.mjs [--port N] [--session]
 *
 * Mode A (default):  standalone, no idle timeout
 * Mode B (--session): 60 min idle timeout
 */

import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

// ── Config ──────────────────────────────────────────────────────────

const DEFAULT_PORT = 19841;
const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const VERSION = '0.1.0';

const args = process.argv.slice(2);
const PORT = parseInt(getArg('--port') ?? String(DEFAULT_PORT), 10);
const SESSION_MODE = args.includes('--session');
const RUN_DIR = join(homedir(), '.xm', 'run');
const PID_FILE = join(RUN_DIR, 'xdashboard-server.pid');
const SERVER_DIR = resolve(dirname(new URL(import.meta.url).pathname));
const PUBLIC_DIR = resolve(SERVER_DIR, '..', 'public');

const startedAt = Date.now();

// ── safeJoin ────────────────────────────────────────────────────────

/**
 * Safely join path segments under a base directory.
 * Returns null if the resolved path escapes the base (path traversal).
 *
 * @param {string} base - Absolute base directory
 * @param {...string} segments - Path segments to join
 * @returns {string|null} Resolved path or null if traversal detected
 */
function safeJoin(base, ...segments) {
  const resolvedBase = resolve(base);
  // Reject any segment containing percent-encoded traversal sequences
  for (const seg of segments) {
    if (/%2e/i.test(seg) || /%2f/i.test(seg)) return null;
  }
  const resolvedTarget = resolve(base, ...segments);
  if (!resolvedTarget.startsWith(resolvedBase + '/') && resolvedTarget !== resolvedBase) {
    return null;
  }
  return resolvedTarget;
}

// ── Segment Validation ──────────────────────────────────────────────

const SAFE_SEGMENT_RE = /^[a-z0-9_-]+$/i;

function isValidSegment(segment) {
  return SAFE_SEGMENT_RE.test(segment);
}

// ── Idle Timer (Session Mode only) ──────────────────────────────────

let idleTimer = null;
let lastActivity = Date.now();

function resetIdleTimer() {
  lastActivity = Date.now();
  if (!SESSION_MODE) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.log(`[x-dashboard-server] Idle for ${SESSION_IDLE_TIMEOUT_MS / 1000}s, shutting down.`);
    shutdown();
  }, SESSION_IDLE_TIMEOUT_MS);
}

// ── MIME Types ──────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
};

function getMime(filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

// ── Static File Serving ──────────────────────────────────────────────

async function serveStatic(urlPath) {
  // Normalize: / -> /index.html
  const normalizedPath = urlPath === '/' ? '/index.html' : urlPath;

  // Split and validate each segment
  const segments = normalizedPath.split('/').filter(Boolean);
  for (const seg of segments) {
    // Allow file extensions: validate base name only
    const base = seg.includes('.') ? seg.slice(0, seg.lastIndexOf('.')) : seg;
    if (base && !isValidSegment(base)) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  const filePath = safeJoin(PUBLIC_DIR, ...segments);
  if (!filePath) {
    return new Response('Forbidden', { status: 403 });
  }

  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(file, {
    headers: { 'Content-Type': getMime(filePath) },
  });
}

// ── HTTP Server ─────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',

  async fetch(req) {
    resetIdleTimer();
    const url = new URL(req.url);
    const path = url.pathname;

    // ── /health ──────────────────────────────────────────────────
    if (path === '/health') {
      return Response.json({
        status: 'ok',
        version: VERSION,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        port: PORT,
        pid: process.pid,
      });
    }

    // ── /api/health ──────────────────────────────────────────────
    if (path === '/api/health') {
      return Response.json({
        status: 'ok',
        version: VERSION,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        port: PORT,
        pid: process.pid,
        mode: SESSION_MODE ? 'session' : 'standalone',
      });
    }

    // ── /shutdown ────────────────────────────────────────────────
    if (path === '/shutdown') {
      setTimeout(() => shutdown(), 100);
      return Response.json({ status: 'shutting_down' });
    }

    // ── Static files ─────────────────────────────────────────────
    if (req.method === 'GET') {
      return serveStatic(path);
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

// ── Process Management ──────────────────────────────────────────────

function checkDuplicateInstance() {
  if (!existsSync(PID_FILE)) return;

  let existing;
  try {
    existing = JSON.parse(Bun.file(PID_FILE).toString());
  } catch {
    return; // Corrupt PID file — proceed
  }

  const pid = existing?.pid;
  if (!pid) return;

  // Check if process is alive
  try {
    process.kill(pid, 0);
    // Process exists — warn and exit
    console.error(`[x-dashboard-server] Already running (pid: ${pid}, port: ${existing.port})`);
    console.error(`[x-dashboard-server] Stop it first: kill ${pid}`);
    process.exit(1);
  } catch {
    // Process not alive — stale PID file, remove and proceed
    console.log(`[x-dashboard-server] Removing stale PID file (pid: ${pid} not found)`);
    removePIDFile();
  }
}

function writePIDFile() {
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(PID_FILE, JSON.stringify({
    pid: process.pid,
    port: PORT,
    startedAt: new Date().toISOString(),
    version: VERSION,
    mode: SESSION_MODE ? 'session' : 'standalone',
  }, null, 2) + '\n', { mode: 0o600 });
}

function removePIDFile() {
  try { unlinkSync(PID_FILE); } catch {}
}

function shutdown() {
  console.log('[x-dashboard-server] Shutting down...');
  removePIDFile();
  server.stop();
  process.exit(0);
}

// Signal handlers
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ── Browser Open ─────────────────────────────────────────────────────

function openBrowser(url) {
  try {
    const platform = process.platform;
    if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else if (platform === 'linux') {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    } else if (platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore', shell: true });
    }
  } catch {
    // Non-fatal — browser open is best-effort
  }
}

// ── Startup ─────────────────────────────────────────────────────────

checkDuplicateInstance();
writePIDFile();
resetIdleTimer();

const dashboardUrl = `http://127.0.0.1:${PORT}`;
console.log(`[x-dashboard-server] Started on ${dashboardUrl} (pid: ${process.pid})`);
console.log(`[x-dashboard-server] Serving static files from: ${PUBLIC_DIR}`);
console.log(`[x-dashboard-server] Mode: ${SESSION_MODE ? `session (idle timeout: ${SESSION_IDLE_TIMEOUT_MS / 60000}m)` : 'standalone'}`);
console.log(`[x-dashboard-server] PID file: ${PID_FILE}`);

openBrowser(dashboardUrl);

// ── Helpers ─────────────────────────────────────────────────────────

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}
