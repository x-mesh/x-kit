// tm-bridge — fire-and-forget term-mesh telemetry bridge
// Invariant under test: no term-mesh session → everything is a silent no-op;
// with sockets present → correct wire format on the app/daemon sockets.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const bridge = await import('../x-trace/lib/x-trace/tm-bridge.mjs');

let dir;
const savedEnv = {};
const ENV_KEYS = ['TERMMESH_SOCKET', 'TERMMESH_DAEMON_SOCKET', 'TERMMESH_DAEMON_UNIX_PATH', 'TMPDIR', 'TERMMESH_TAB_ID', 'XM_ROOT'];

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  dir = mkdtempSync(join(tmpdir(), 'tm-bridge-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

/** Start a unix-socket server that records received lines. */
function startServer(sockPath, reply = 'OK\n') {
  const lines = [];
  const server = createServer((conn) => {
    let buf = '';
    conn.on('data', (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        lines.push(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
        conn.write(reply);
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(sockPath, () => resolve({ server, lines }));
  });
}

const settle = (ms = 150) => new Promise(r => setTimeout(r, ms));

describe('no term-mesh session (the invariant)', () => {
  test('all telemetry functions are silent no-ops', () => {
    expect(bridge.appSocketPath()).toBeNull();
    expect(() => {
      bridge.paneSetStatus('xm', 'hello world');
      bridge.paneSetProgress(0.5, 'half');
      bridge.paneClearProgress();
      bridge.publishDaemonEvent('task_status', { team: 'xk:t', task_id: 's1', status: 'in_progress' });
      bridge.mirrorTraceEntry({ type: 'session_start', skill: 'op', session_id: 'op-1' });
    }).not.toThrow();
  });

  test('mirrorTaskBoard mirrors nothing', async () => {
    const res = await bridge.mirrorTaskBoard([{ id: 't1', name: 'a', depends_on: [] }]);
    expect(res.mirrored).toBe(0);
  });

  test('traceAppend still writes JSONL (never throws)', async () => {
    process.env.XM_ROOT = dir;
    const { traceAppend } = await import('../x-trace/lib/x-trace/trace-writer.mjs');
    traceAppend('op-test-1', { type: 'session_start', skill: 'op' });
    const file = join(dir, 'traces', 'op-test-1.jsonl');
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8').trim()).type).toBe('session_start');
  });
});

describe('app socket wire format', () => {
  test('paneSetStatus writes a set_status line with --tab target', async () => {
    const sockPath = join(dir, 'app.sock');
    const { server, lines } = await startServer(sockPath);
    process.env.TERMMESH_SOCKET = sockPath;
    process.env.TERMMESH_TAB_ID = 'ABC-123';

    bridge.paneSetStatus('xm', 'op: refine r2/4', { icon: 'bolt' });
    await settle();
    server.close();

    expect(lines).toContain('set_status xm op: refine r2/4 --icon=bolt --tab=ABC-123');
  });

  test('paneSetProgress clamps and formats value', async () => {
    const sockPath = join(dir, 'app2.sock');
    const { server, lines } = await startServer(sockPath);
    process.env.TERMMESH_SOCKET = sockPath;

    bridge.paneSetProgress(1.7, 'over');
    await settle();
    server.close();

    expect(lines).toContain('set_progress 1.000 --label=over');
  });

  test('mirrorTraceEntry maps session_start to a status pill', async () => {
    const sockPath = join(dir, 'app3.sock');
    const { server, lines } = await startServer(sockPath);
    process.env.TERMMESH_SOCKET = sockPath;

    bridge.mirrorTraceEntry({ type: 'session_start', skill: 'op', session_id: 'op-x' });
    await settle();
    server.close();

    expect(lines.some(l => l.startsWith('set_status xm ▶ op'))).toBe(true);
  });
});

describe('daemon socket wire format', () => {
  test('publishDaemonEvent sends valid events.publish JSON-RPC', async () => {
    const sockPath = join(dir, 'daemon.sock');
    const { server, lines } = await startServer(sockPath, '{"jsonrpc":"2.0","id":1,"result":{"published":true}}\n');
    process.env.TERMMESH_DAEMON_SOCKET = sockPath;

    bridge.publishDaemonEvent('task_status', {
      team: 'xk:proj', agent: 'leader', task_id: 'op-1', status: 'in_progress', prev_status: 'pending',
    });
    await settle();
    server.close();

    expect(lines.length).toBe(1);
    const req = JSON.parse(lines[0]);
    expect(req.method).toBe('events.publish');
    expect(req.params.kind).toBe('task_status');
    expect(req.params.team).toBe('xk:proj');
    expect(req.params.task_id).toBe('op-1');
  });
});

describe('budget kill-switch', () => {
  test('postBudgetAutoStop POSTs /api/budget/auto-stop when in a session', async () => {
    const { createServer: createHttpServer } = await import('node:http');
    const sockPath = join(dir, 'app5.sock');
    const { server: appServer } = await startServer(sockPath);
    process.env.TERMMESH_SOCKET = sockPath; // session gate

    const hits = [];
    const http = createHttpServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        hits.push({ method: req.method, url: req.url, body });
        res.end('{"auto_stop":true}');
      });
    });
    await new Promise(r => http.listen(0, '127.0.0.1', r));
    process.env.TERM_MESH_HTTP_ADDR = `127.0.0.1:${http.address().port}`;

    bridge.postBudgetAutoStop(true);
    await settle(300);
    http.close();
    appServer.close();
    delete process.env.TERM_MESH_HTTP_ADDR;

    expect(hits.length).toBe(1);
    expect(hits[0].method).toBe('POST');
    expect(hits[0].url).toBe('/api/budget/auto-stop');
    expect(JSON.parse(hits[0].body)).toEqual({ enabled: true });
  });

  test('no-op outside a term-mesh session', async () => {
    expect(() => bridge.postBudgetAutoStop(true)).not.toThrow();
  });
});

describe('mirrorTaskBoard idempotency', () => {
  test('tasks with tm_task_id backrefs are not re-created', async () => {
    // Fake a session so the gate passes; tm-agent binary is absent, so any
    // NEW task creation would fail — all-linked input must succeed untouched.
    process.env.TERMMESH_SOCKET = join(dir, 'nonexist.sock');
    const sockPath = join(dir, 'app4.sock');
    const { server } = await startServer(sockPath);
    process.env.TERMMESH_SOCKET = sockPath;

    const tasks = [
      { id: 't1', name: 'a', depends_on: [], tm_task_id: 'TM-1' },
      { id: 't2', name: 'b', depends_on: ['t1'], tm_task_id: 'TM-2' },
    ];
    const res = await bridge.mirrorTaskBoard(tasks);
    server.close();

    expect(res.mirrored).toBe(0);
    expect(res.idMap).toEqual({ t1: 'TM-1', t2: 'TM-2' });
  });
});
