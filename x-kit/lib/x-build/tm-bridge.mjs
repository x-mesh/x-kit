/**
 * tm-bridge.mjs — best-effort telemetry bridge from x-kit into term-mesh.
 *
 * SOURCE OF TRUTH: x-trace/lib/x-trace/tm-bridge.mjs
 * Synced copies (scripts/sync-bundle.sh): x-build/lib/x-build/tm-bridge.mjs,
 * x-kit/lib/x-trace/tm-bridge.mjs, x-kit/lib/x-build/tm-bridge.mjs.
 *
 * Contract: docs/term-mesh-integration.md.
 *
 * Invariant ("works with Claude Code alone"): every function is fire-and-forget.
 * No term-mesh sockets → silent no-op. A failing socket warns ONCE per process
 * on stderr, then stays silent (x-humble L6 compromise: telemetry must be
 * visible when it first breaks but must never fail or spam the main flow).
 * Nothing here throws, and nothing blocks the caller beyond SOCKET_TIMEOUT_MS.
 */

import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { execFile } from 'node:child_process';
import { basename, join } from 'node:path';

const SOCKET_TIMEOUT_MS = 100;
const TM_AGENT_TIMEOUT_MS = 5000;

const warned = { app: false, daemon: false, tmAgent: false };

function warnOnce(which, err) {
  if (warned[which]) return;
  warned[which] = true;
  process.stderr.write(`[tm-bridge] term-mesh ${which} telemetry disabled: ${err?.message || err}\n`);
}

// ── Socket discovery ─────────────────────────────────────────────────

/** Per-pane app socket (line text protocol). Null when not in a term-mesh pane. */
export function appSocketPath() {
  const p = process.env.TERMMESH_SOCKET;
  return p && existsSync(p) ? p : null;
}

/** term-meshd daemon socket (JSON-RPC 2.0, newline-framed). Null when absent. */
export function daemonSocketPath() {
  for (const key of ['TERMMESH_DAEMON_SOCKET', 'TERMMESH_DAEMON_UNIX_PATH']) {
    const p = process.env[key];
    if (p && existsSync(p)) return p;
  }
  const candidates = [];
  if (process.env.TMPDIR) candidates.push(join(process.env.TMPDIR, 'term-meshd.sock'));
  candidates.push('/tmp/term-meshd.sock');
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function isTermMeshSession() {
  return appSocketPath() !== null || daemonSocketPath() !== null;
}

/** Project slug used as the synthetic team name (`xk:<slug>`) in daemon events. */
export function projectSlug() {
  return basename(process.cwd()) || 'xm';
}

// ── Wire helpers (fire-and-forget) ───────────────────────────────────

function sendLine(path, line, which) {
  try {
    const sock = createConnection({ path });
    sock.setTimeout(SOCKET_TIMEOUT_MS);
    sock.on('timeout', () => sock.destroy());
    sock.on('error', (err) => {
      sock.destroy();
      warnOnce(which, err);
    });
    // Response is read best-effort only to let the server finish; content ignored.
    sock.on('data', () => sock.end());
    sock.write(line.endsWith('\n') ? line : line + '\n');
  } catch (err) {
    warnOnce(which, err);
  }
}

/** One-line sanitize for positional args in the app-socket text protocol. */
function sanitize(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function paneTarget() {
  const tab = process.env.TERMMESH_TAB_ID;
  return tab ? ` --tab=${tab}` : '';
}

// ── Pane telemetry (app socket) ──────────────────────────────────────

/** set_status <key> <value> — status pill on the pane's tab. */
export function paneSetStatus(key, value, { icon, color } = {}) {
  const path = appSocketPath();
  if (!path) return;
  let cmd = `set_status ${sanitize(key)} ${sanitize(value)}`;
  if (icon) cmd += ` --icon=${sanitize(icon)}`;
  if (color) cmd += ` --color=${sanitize(color)}`;
  sendLine(path, cmd + paneTarget(), 'app');
}

/** set_progress <0.0-1.0> — titlebar progress bar. */
export function paneSetProgress(value, label) {
  const path = appSocketPath();
  if (!path) return;
  const v = Math.min(1, Math.max(0, Number(value) || 0));
  let cmd = `set_progress ${v.toFixed(3)}`;
  if (label) cmd += ` --label=${sanitize(label)}`;
  sendLine(path, cmd + paneTarget(), 'app');
}

export function paneClearProgress() {
  const path = appSocketPath();
  if (!path) return;
  sendLine(path, 'clear_progress' + paneTarget(), 'app');
}

// ── Daemon events (JSON-RPC events.publish) ──────────────────────────

/**
 * Publish a daemon event so `tm-agent wait/watch` subscribers see x-kit
 * transitions. kind: 'task_status' | 'reply'. fields per socket.rs
 * events.publish: {team, agent, task_id, status, prev_status, header}.
 */
export function publishDaemonEvent(kind, fields = {}) {
  const path = daemonSocketPath();
  if (!path) return;
  const req = { jsonrpc: '2.0', id: 1, method: 'events.publish', params: { kind, ...fields } };
  sendLine(path, JSON.stringify(req), 'daemon');
}

// ── Trace mirroring (called from trace-writer.traceAppend) ───────────

/**
 * Mirror one trace entry to the pane + daemon bus. Cheap gate first: both
 * sockets absent → immediate return (the common non-term-mesh case).
 * `entry` is the full JSONL record (with session_id/ts already attached).
 */
export function mirrorTraceEntry(entry) {
  const app = appSocketPath();
  const daemon = daemonSocketPath();
  if (!app && !daemon) return;
  try {
    const sid = entry.session_id || 'xm';
    const skill = entry.skill || String(sid).split('-')[0];
    const team = `xk:${projectSlug()}`;

    switch (entry.type) {
      case 'session_start':
        paneSetStatus('xm', `▶ ${skill}`);
        publishDaemonEvent('task_status', {
          team, agent: 'leader', task_id: sid, status: 'in_progress', prev_status: 'pending',
        });
        break;
      case 'fan_out':
        paneSetStatus('xm', `${skill}: fan-out ×${entry.count ?? '?'}`);
        break;
      case 'agent_call':
      case 'agent_step':
        paneSetStatus('xm', `${skill}: ${entry.role || 'agent'} ${entry.status || ''}`);
        break;
      case 'synthesize':
        paneSetStatus('xm', `${skill}: synthesize`);
        break;
      case 'checkpoint':
        paneSetStatus('xm', `${skill}: ${entry.label || entry.name || 'checkpoint'}`);
        break;
      case 'session_end': {
        const ok = (entry.status || 'success') === 'success';
        paneSetStatus('xm', `${ok ? '✓' : '✗'} ${skill} (${entry.status || 'success'})`);
        paneClearProgress();
        publishDaemonEvent('task_status', {
          team, agent: 'leader', task_id: sid,
          status: ok ? 'completed' : 'failed', prev_status: 'in_progress',
        });
        break;
      }
      default:
        break;
    }
    // Optional explicit progress on any entry: {progress: 0..1, progress_label?}
    if (typeof entry.progress === 'number' && Number.isFinite(entry.progress)) {
      paneSetProgress(entry.progress, entry.progress_label || skill);
    }
  } catch (err) {
    warnOnce('app', err);
  }
}

// ── Budget kill-switch (daemon HTTP) ─────────────────────────────────

/**
 * Toggle term-meshd's budget auto-stop (POST /api/budget/auto-stop).
 * Called by the cost engine when the budget is exceeded so pane agents pause
 * instead of burning past the cap. Fire-and-forget; no-op outside term-mesh.
 */
export function postBudgetAutoStop(enabled = true) {
  if (!isTermMeshSession()) return;
  try {
    const addr = process.env.TERM_MESH_HTTP_ADDR || '127.0.0.1:9876';
    const [host, port] = addr.split(':');
    const body = JSON.stringify({ enabled });
    import('node:http').then(({ request }) => {
      const req = request({
        host,
        port: Number(port) || 9876,
        path: '/api/budget/auto-stop',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
        timeout: 500,
      }, (res) => res.resume());
      req.on('timeout', () => req.destroy());
      req.on('error', (err) => warnOnce('daemon', err));
      req.end(body);
    }).catch((err) => warnOnce('daemon', err));
  } catch (err) {
    warnOnce('daemon', err);
  }
}

// ── Task-board mirror (shells to tm-agent) ───────────────────────────

function tmAgentCreateTask(title, deps) {
  return new Promise((resolve) => {
    const args = ['task', 'create', title];
    if (deps.length) args.push('--deps', deps.join(','));
    execFile('tm-agent', args, { timeout: TM_AGENT_TIMEOUT_MS }, (err, stdout) => {
      if (err) {
        warnOnce('tmAgent', err);
        return resolve(null);
      }
      // team.task.create result JSON — accept either {"id":"..."} or {"task":{"id":...}}.
      const m = String(stdout).match(/"id"\s*:\s*"([^"]+)"/);
      resolve(m ? m[1] : null);
    });
  });
}

/**
 * Mirror an x-build tasks.json task list onto the term-mesh task board
 * (dependency-ordered, idempotent via each task's `tm_task_id` backref).
 * Returns {mirrored, skipped, idMap} — idMap: x-build id → tm task id.
 * No term-mesh session or no tm-agent binary → {mirrored:0, ...} silently.
 */
export async function mirrorTaskBoard(tasks) {
  const result = { mirrored: 0, skipped: 0, idMap: {} };
  if (!isTermMeshSession() || !Array.isArray(tasks) || tasks.length === 0) return result;

  for (const t of tasks) {
    if (t.tm_task_id) result.idMap[t.id] = t.tm_task_id;
  }
  // Dependency-ordered passes: create a task only once all deps have tm ids.
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const t of tasks) {
      if (result.idMap[t.id]) continue;
      const deps = t.depends_on || [];
      const depIds = deps.map(d => result.idMap[d]).filter(Boolean);
      if (depIds.length !== deps.length) continue; // deps not mirrored yet
      const title = `[xb:${t.id}] ${t.name || t.title || t.id}`;
      const tmId = await tmAgentCreateTask(title, depIds);
      if (tmId === null && warned.tmAgent) return result; // tm-agent unusable — stop early
      if (tmId) {
        result.idMap[t.id] = tmId;
        t.tm_task_id = tmId;
        result.mirrored += 1;
        progressed = true;
      }
    }
  }
  result.skipped = tasks.length - result.mirrored;
  return result;
}
