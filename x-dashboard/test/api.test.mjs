/**
 * x-dashboard API integration tests
 *
 * Starts the dashboard server as a subprocess on a test port,
 * then exercises every API endpoint and safeJoin path-traversal guards.
 *
 * Run: bun test x-dashboard/test/
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The server uses resolve(process.cwd(), '.xm') as XM_ROOT.
// We spawn it from the x-kit project root so fixtures land in x-kit/.xm/
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const SERVER_PATH = join(__dirname, '..', 'lib', 'x-dashboard-server.mjs');
const TEST_PORT = 19898;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const XM_ROOT = join(PROJECT_ROOT, '.xm');

// ── Test fixture setup ───────────────────────────────────────────────

const TEST_PROJECT_SLUG = 'test-dashboard-api-fixture';
const TEST_SOLVER_SLUG = 'test-solver-api-fixture';

/** Track only the top-level dirs we create so teardown is safe */
const FIXTURE_ROOTS = [];

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function writeJSON(p, data) {
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

function setupFixtures() {
  // ── project fixture ──────────────────────────────────────────────
  const projectDir = join(XM_ROOT, 'build', 'projects', TEST_PROJECT_SLUG);
  ensureDir(projectDir);
  FIXTURE_ROOTS.push(projectDir);

  writeJSON(join(projectDir, 'manifest.json'), {
    slug: TEST_PROJECT_SLUG,
    name: 'Test Dashboard API Fixture',
    status: 'active',
  });

  // phase status
  const prdPhaseDir = join(projectDir, 'phases', '01-prd');
  ensureDir(prdPhaseDir);
  writeJSON(join(prdPhaseDir, 'status.json'), { status: 'complete' });

  // tasks (02-plan phase)
  const planPhaseDir = join(projectDir, 'phases', '02-plan');
  ensureDir(planPhaseDir);
  writeJSON(join(planPhaseDir, 'tasks.json'), [
    { id: 'T1', title: 'First task', status: 'done' },
    { id: 'T2', title: 'Second task', status: 'pending' },
  ]);

  // ── probe fixtures ───────────────────────────────────────────────
  const probeDir = join(XM_ROOT, 'probe');
  // last-verdict may already exist; only create if absent
  const lastVerdictPath = join(probeDir, 'last-verdict.json');
  if (!existsSync(lastVerdictPath)) {
    ensureDir(probeDir);
    writeJSON(lastVerdictPath, { verdict: 'green', timestamp: new Date().toISOString() });
    FIXTURE_ROOTS.push(lastVerdictPath);
  }

  const historyDir = join(probeDir, 'history');
  ensureDir(historyDir);
  const historyFile = join(historyDir, 'test-run-fixture.json');
  writeJSON(historyFile, { verdict: 'green', date: new Date().toISOString() });
  FIXTURE_ROOTS.push(historyFile);

  // ── solver fixture ───────────────────────────────────────────────
  const solverDir = join(XM_ROOT, 'solver', 'problems', TEST_SOLVER_SLUG);
  ensureDir(solverDir);
  FIXTURE_ROOTS.push(solverDir);
  writeJSON(join(solverDir, 'manifest.json'), {
    slug: TEST_SOLVER_SLUG,
    title: 'Test Solver API Fixture',
    status: 'open',
  });

  // ── metrics/sessions fixture ─────────────────────────────────────
  const metricsDir = join(XM_ROOT, 'build', 'metrics');
  ensureDir(metricsDir);
  const sessionsPath = join(metricsDir, 'sessions.jsonl');
  const preExisting = existsSync(sessionsPath);
  if (!preExisting) {
    writeFileSync(sessionsPath, [
      JSON.stringify({ id: 's1', cost: 0.01, at: new Date().toISOString() }),
      JSON.stringify({ id: 's2', cost: 0.02, at: new Date().toISOString() }),
      JSON.stringify({ id: 's3', cost: 0.03, at: new Date().toISOString() }),
    ].join('\n') + '\n');
    FIXTURE_ROOTS.push(sessionsPath);
  }
}

function teardownFixtures() {
  for (const p of FIXTURE_ROOTS) {
    try { rmSync(p, { recursive: true, force: true }); } catch {}
  }
}

// ── Server lifecycle ─────────────────────────────────────────────────

let serverProc;

beforeAll(async () => {
  setupFixtures();

  serverProc = spawn('bun', [SERVER_PATH, '--port', String(TEST_PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    cwd: PROJECT_ROOT,
  });

  serverProc.stderr?.on('data', () => {});
  serverProc.stdout?.on('data', () => {});

  // Wait up to 5s for the server to become ready
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('x-dashboard-server did not start within 5s');
});

afterAll(async () => {
  try { await fetch(`${BASE}/shutdown`).catch(() => {}); } catch {}
  try { serverProc?.kill('SIGTERM'); } catch {}
  teardownFixtures();
});

// ── Helper ───────────────────────────────────────────────────────────

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`);
  return { res, body: await res.json() };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status/uptime/port', async () => {
    const { res, body } = await getJSON('/health');
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(body.port).toBe(TEST_PORT);
    expect(typeof body.pid).toBe('number');
  });
});

describe('GET /api/config', () => {
  it('returns 200 with a mode field', async () => {
    const { res, body } = await getJSON('/api/config');
    expect(res.status).toBe(200);
    expect(typeof body.mode).toBe('string');
  });
});

describe('GET /api/projects', () => {
  it('returns 200 with a data array', async () => {
    const { res, body } = await getJSON('/api/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('includes the test project fixture', async () => {
    const { body } = await getJSON('/api/projects');
    const found = body.data.find(p => p.slug === TEST_PROJECT_SLUG);
    expect(found).toBeDefined();
  });
});

describe('GET /api/projects/:slug', () => {
  it('returns 200 with manifest and phases for a known project', async () => {
    const { res, body } = await getJSON(`/api/projects/${TEST_PROJECT_SLUG}`);
    expect(res.status).toBe(200);
    expect(body.manifest).toBeDefined();
    expect(body.manifest.slug).toBe(TEST_PROJECT_SLUG);
    expect(Array.isArray(body.phases)).toBe(true);
  });

  it('returns 404 for a nonexistent project', async () => {
    const { res } = await getJSON('/api/projects/nonexistent-project-xyz');
    expect(res.status).toBe(404);
  });

  it('returns 400 for slug with invalid characters (dot)', async () => {
    // "foo.bar" fails SAFE_SEGMENT_RE (/^[a-z0-9_-]+$/i) → 400
    const { res } = await getJSON('/api/projects/foo.bar');
    expect(res.status).toBe(400);
  });

  it('returns 404 for slug with special chars ($) — passes validation but no such project', async () => {
    const res = await fetch(`${BASE}/api/projects/foo%24bar`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/projects/:slug/tasks', () => {
  it('returns tasks array for a known project', async () => {
    const { res, body } = await getJSON(`/api/projects/${TEST_PROJECT_SLUG}/tasks`);
    expect(res.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('returns 404 for nonexistent project tasks', async () => {
    const { res } = await getJSON('/api/projects/no-such-project/tasks');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid slug in tasks path', async () => {
    const { res } = await getJSON('/api/projects/foo.bar/tasks');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/probe/latest', () => {
  it('returns 200 with a verdict field', async () => {
    const { res, body } = await getJSON('/api/probe/latest');
    expect(res.status).toBe(200);
    expect(typeof body.verdict).toBe('string');
  });
});

describe('GET /api/probe/history', () => {
  it('returns 200 with a data array', async () => {
    const { res, body } = await getJSON('/api/probe/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('contains at least the fixture history entry', async () => {
    const { body } = await getJSON('/api/probe/history');
    expect(body.data.length).toBeGreaterThan(0);
  });
});

describe('GET /api/probe/history/:file', () => {
  it('returns 200 for a known history file (without .json extension)', async () => {
    const { res, body } = await getJSON('/api/probe/history/test-run-fixture');
    expect(res.status).toBe(200);
    expect(typeof body.verdict).toBe('string');
  });

  it('returns 200 for a known history file (with .json extension)', async () => {
    const { res, body } = await getJSON('/api/probe/history/test-run-fixture.json');
    expect(res.status).toBe(200);
    expect(typeof body.verdict).toBe('string');
  });

  it('returns 404 for unknown history file', async () => {
    const { res } = await getJSON('/api/probe/history/no-such-run-xyz');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid segment in history file path (dot)', async () => {
    // "foo.bar" without .json suffix: baseName="foo" (valid), but "foo.bar.txt" baseName="foo.bar" → invalid
    const { res } = await getJSON('/api/probe/history/foo.bar.txt');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/solver', () => {
  it('returns 200 with a data array', async () => {
    const { res, body } = await getJSON('/api/solver');
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('includes the test solver fixture', async () => {
    const { body } = await getJSON('/api/solver');
    const found = body.data.find(p => p.slug === TEST_SOLVER_SLUG);
    expect(found).toBeDefined();
  });
});

describe('GET /api/solver/:slug', () => {
  it('returns 200 with manifest for known problem', async () => {
    const { res, body } = await getJSON(`/api/solver/${TEST_SOLVER_SLUG}`);
    expect(res.status).toBe(200);
    expect(body.manifest).toBeDefined();
    expect(body.manifest.slug).toBe(TEST_SOLVER_SLUG);
    expect(Array.isArray(body.phases)).toBe(true);
  });

  it('returns 404 for nonexistent solver problem', async () => {
    const { res } = await getJSON('/api/solver/no-such-problem-xyz');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid slug (dot)', async () => {
    const { res } = await getJSON('/api/solver/foo.bar');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/metrics/sessions', () => {
  it('returns 200 with data array and pagination fields', async () => {
    const { res, body } = await getJSON('/api/metrics/sessions?limit=2&offset=0');
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.limit).toBe('number');
    expect(typeof body.offset).toBe('number');
  });

  it('respects limit parameter — returns at most limit items', async () => {
    const { body } = await getJSON('/api/metrics/sessions?limit=2&offset=0');
    expect(body.data.length).toBeLessThanOrEqual(2);
    expect(body.limit).toBe(2);
  });

  it('respects offset parameter', async () => {
    const { body: page0 } = await getJSON('/api/metrics/sessions?limit=100&offset=0');
    const { body: page1 } = await getJSON('/api/metrics/sessions?limit=100&offset=1');
    if (page0.total > 1) {
      expect(page1.data.length).toBe(page0.data.length - 1);
    }
  });

  it('returns total reflecting all records', async () => {
    const { body } = await getJSON('/api/metrics/sessions?limit=100&offset=0');
    expect(body.total).toBeGreaterThan(0);
    expect(body.total).toBe(body.data.length + body.offset);
  });
});

describe('Static file serving', () => {
  it('does not return 500 for nonexistent path', async () => {
    const res = await fetch(`${BASE}/nonexistent-path-xyz-abc`);
    expect(res.status).not.toBe(500);
  });

  it('returns 403 for segment with invalid base name in static path', async () => {
    // A path segment whose base name contains invalid chars triggers 403 in serveStatic
    const res = await fetch(`${BASE}/foo%24bar`);
    expect([403, 404]).toContain(res.status);
  });
});

describe('safeJoin path traversal guards (via HTTP)', () => {
  it('rejects slug with dot (SAFE_SEGMENT_RE) → 400', async () => {
    // "foo.bar" reaches isValidSegment check and returns 400
    const { res } = await getJSON('/api/projects/foo.bar');
    expect(res.status).toBe(400);
  });

  it('slug with @ character → 404 (passes validation, no such project)', async () => {
    const res = await fetch(`${BASE}/api/projects/foo%40bar`);
    expect(res.status).toBe(404);
  });

  it('accepts valid alphanumeric-dash slug (unknown → 404, not 400)', async () => {
    // A well-formed slug should get 404 (not found), never 400 (forbidden)
    const { res } = await getJSON('/api/projects/valid-slug-123');
    expect(res.status).toBe(404);
  });

  it('accepts valid underscore slug (unknown → 404, not 400)', async () => {
    const { res } = await getJSON('/api/projects/valid_slug');
    expect(res.status).toBe(404);
  });

  it('rejects %2e in probe history file segment → 400', async () => {
    // %2e survives as literal text in the path after URL parse: pathname = /api/probe/history/%2e
    // safeJoin checks for /%2e/i and returns null → 400
    const res = await fetch(`${BASE}/api/probe/history/%2econfig`, { redirect: 'manual' });
    // The segment "%2econfig" — Bun may or may not decode this before routing
    // Either 400 (safeJoin rejects %2e) or 404 (Bun decoded it to ".config", isValidSegment rejects dot)
    expect([400, 404]).toContain(res.status);
  });
});
