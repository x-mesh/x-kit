#!/usr/bin/env bun
/**
 * x-dashboard-server.mjs — Bun HTTP server for xm-dashboard
 *
 * Architecture: Bun HTTP server → serves static files from public/ + JSON API
 * Pattern: follows x-kit-server.mjs for PID file management and shutdown
 *
 * Usage: bun x-dashboard-server.mjs [--port N] [--session] [--scan <dir>]
 *
 * Mode A (default):  standalone, no idle timeout
 * Mode B (--session): 60 min idle timeout
 * Mode C (--scan <dir>): multi-root workspace mode
 */

import { writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

// ── Config ──────────────────────────────────────────────────────────

const DEFAULT_PORT = 19841;
const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const VERSION = process.env.XM_SYNC_VERSION ?? '0.1.0';

const args = process.argv.slice(2);
const STOP_MODE = args.includes('--stop');
const PORT = parseInt(getArg('--port') ?? String(DEFAULT_PORT), 10);
const SESSION_MODE = args.includes('--session');
const SCAN_DIR = getArg('--scan');
const RUN_DIR = join(homedir(), '.xm', 'run');
const PID_FILE = join(RUN_DIR, 'xdashboard-server.pid');
const SERVER_DIR = resolve(dirname(new URL(import.meta.url).pathname));
const PUBLIC_DIR = resolve(SERVER_DIR, '..', 'public');

const XM_ROOT = resolveProjectXm();

/** Resolve .xm/ — prefer local, fallback to main repo for worktrees */
function resolveProjectXm() {
  const local = resolve(process.cwd(), '.xm');
  if (existsSync(local)) return local;
  try {
    const commonDir = execSync('git rev-parse --git-common-dir', {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const mainXm = resolve(process.cwd(), commonDir, '..', '.xm');
    if (existsSync(mainXm)) return mainXm;
  } catch {}
  return local;
}

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

const SAFE_SEGMENT_RE = /^[^./\\]+$/;

function isValidSegment(segment) {
  return SAFE_SEGMENT_RE.test(segment);
}

// ── ETag Helpers ────────────────────────────────────────────────────

function hashSimple(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h.toString(36);
}

function jsonResponseWithETag(data, req, status = 200) {
  const body = JSON.stringify(data);
  const etag = `"${body.length.toString(36)}-${hashSimple(body)}"`;
  if (req && req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { 'ETag': etag, 'Cache-Control': 'no-cache' } });
  }
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'ETag': etag,
      'Cache-Control': 'no-cache',
    },
  });
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

// ── M1: WorkspaceScanner ─────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

/**
 * Recursively scan rootDir for directories containing .xm/
 * @param {string} rootDir - Absolute path to scan
 * @param {number} maxDepth - Maximum recursion depth (default 4)
 * @returns {Array<{id: string, name: string, path: string, xmRoot: string}>}
 */
/** Check if dir is a git worktree (.git is a file, not a directory) */
function isGitWorktree(dir) {
  try {
    const st = statSync(join(dir, '.git'));
    return st.isFile();
  } catch {
    return false;
  }
}

/** For a worktree dir, resolve the main repo's .xm/ path (or null) */
function getMainRepoXm(dir) {
  try {
    const content = readFileSync(join(dir, '.git'), 'utf8').trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (!match) return null;
    const gitdir = resolve(dir, match[1]);

    // Strategy 1: gitdir path exists — walk up 3 levels from .git/worktrees/<name>
    const mainRoot1 = resolve(gitdir, '..', '..', '..');
    const mainXm1 = join(mainRoot1, '.xm');
    if (existsSync(mainXm1)) return mainXm1;

    // Strategy 2: gitdir path is stale (repo renamed) — read commondir from
    // the actual worktree entry inside the real repo's .git/worktrees/<name>/
    // The gitdir pattern is always .../.git/worktrees/<name>, so extract
    // the worktree name and search for it in sibling repos
    const wtMatch = gitdir.match(/(.+)\/\.git\/worktrees\/([^/]+)$/);
    if (wtMatch) {
      const wtName = wtMatch[2];
      // Scan parent dir for a repo that owns this worktree
      const parentDir = dirname(dir);
      try {
        for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const candidate = join(parentDir, entry.name, '.git', 'worktrees', wtName);
          if (existsSync(candidate)) {
            const mainXm2 = join(parentDir, entry.name, '.xm');
            if (existsSync(mainXm2)) return mainXm2;
          }
        }
      } catch {}
    }

    return null;
  } catch {
    return null;
  }
}

function scanWorkspaces(rootDir, maxDepth = 4) {
  const results = [];

  function scan(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      const xmPath = join(fullPath, '.xm');
      if (existsSync(xmPath)) {
        try {
          const stat = statSync(xmPath);
          if (stat.isDirectory()) {
            // Skip worktrees whose main repo has its own .xm/
            if (isGitWorktree(fullPath) && getMainRepoXm(fullPath)) {
              continue;
            }
            const id = basename(fullPath);
            results.push({
              id,
              name: id,
              path: fullPath,
              xmRoot: xmPath,
            });
            // Don't recurse into a workspace — scan its siblings instead
            continue;
          }
        } catch {
          // stat failed, skip
        }
      }
      scan(fullPath, depth + 1);
    }
  }

  // Also check rootDir itself
  const rootXm = join(rootDir, '.xm');
  if (existsSync(rootXm)) {
    try {
      const stat = statSync(rootXm);
      if (stat.isDirectory()) {
        // Skip if rootDir itself is a worktree with main repo .xm/
        if (isGitWorktree(rootDir) && getMainRepoXm(rootDir)) {
          scan(rootDir, 1);
        } else {
          const id = basename(rootDir);
          results.push({ id, name: id, path: rootDir, xmRoot: rootXm });
        }
      }
    } catch {}
  } else {
    scan(rootDir, 1);
  }

  return results;
}

// ── M2: WorkspaceRegistry ────────────────────────────────────────────

let workspaces = [];

function getWorkspace(wsId) {
  return workspaces.find(w => w.id === wsId);
}

function getAllWorkspaces() {
  return workspaces;
}

// ── M3: ScopedAPI helpers ────────────────────────────────────────────

function resolveXmRoot(wsId) {
  const ws = getWorkspace(wsId);
  return ws ? ws.xmRoot : null;
}

// ── Route handler functions (accept xmRoot parameter) ────────────────

function handleConfig(xmRoot, req) {
  const filePath = safeJoin(xmRoot, 'config.json');
  if (!filePath) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!existsSync(filePath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);
  try {
    return jsonResponseWithETag(JSON.parse(readFileSync(filePath, 'utf8')), req);
  } catch {
    return jsonResponseWithETag({ error: 'parse_error', file: 'config.json' }, req, 500);
  }
}

function extractGoal(projectDir) {
  for (const file of ['context/CONTEXT.md', 'context/brief.md']) {
    const fp = safeJoin(projectDir, file);
    if (!fp || !existsSync(fp)) continue;
    try {
      const content = readFileSync(fp, 'utf8');
      const m = content.match(/^##\s*Goal\s*\n+(.+)/m);
      if (m) return m[1].trim().slice(0, 200);
    } catch {}
  }
  return null;
}

function handleProjects(xmRoot, req) {
  const projectsDir = safeJoin(xmRoot, 'build', 'projects');
  if (!projectsDir || !existsSync(projectsDir)) return jsonResponseWithETag({ data: [] }, req);
  const manifests = [];
  for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const projectDir = safeJoin(projectsDir, entry.name);
    const manifestPath = safeJoin(projectDir, 'manifest.json');
    if (!manifestPath || !existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifest.goal = extractGoal(projectDir);
      manifests.push(manifest);
    } catch {}
  }
  return jsonResponseWithETag({ data: manifests }, req);
}

function handleProjectTasks(xmRoot, slug, req) {
  if (!isValidSegment(slug)) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  const filePath = safeJoin(xmRoot, 'build', 'projects', slug, 'phases', '02-plan', 'tasks.json');
  if (!filePath) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!existsSync(filePath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);
  try {
    return jsonResponseWithETag(JSON.parse(readFileSync(filePath, 'utf8')), req);
  } catch {
    return jsonResponseWithETag({ error: 'parse_error', file: 'tasks.json' }, req, 500);
  }
}

function handleProjectDetail(xmRoot, slug, req) {
  if (!isValidSegment(slug)) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  const projectDir = safeJoin(xmRoot, 'build', 'projects', slug);
  if (!projectDir || !existsSync(projectDir)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);

  const manifestPath = safeJoin(projectDir, 'manifest.json');
  if (!manifestPath || !existsSync(manifestPath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return jsonResponseWithETag({ error: 'parse_error', file: 'manifest.json' }, req, 500);
  }

  let circuitBreaker = null;
  const cbPath = safeJoin(projectDir, 'circuit-breaker.json');
  if (cbPath && existsSync(cbPath)) {
    try { circuitBreaker = JSON.parse(readFileSync(cbPath, 'utf8')); } catch {}
  }

  let handoff = null;
  const handoffPath = safeJoin(projectDir, 'HANDOFF.json');
  if (handoffPath && existsSync(handoffPath)) {
    try { handoff = JSON.parse(readFileSync(handoffPath, 'utf8')); } catch {}
  }

  const phases = [];
  const phasesDir = safeJoin(projectDir, 'phases');
  if (phasesDir && existsSync(phasesDir)) {
    for (const entry of readdirSync(phasesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const statusPath = safeJoin(phasesDir, entry.name, 'status.json');
      if (!statusPath || !existsSync(statusPath)) continue;
      try {
        phases.push({ phase: entry.name, ...JSON.parse(readFileSync(statusPath, 'utf8')) });
      } catch {}
    }
  }

  const context = [];
  const contextDir = safeJoin(projectDir, 'context');
  if (contextDir && existsSync(contextDir)) {
    for (const entry of readdirSync(contextDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const mdPath = safeJoin(contextDir, entry.name);
      if (!mdPath) continue;
      try {
        context.push({ name: entry.name, content: readFileSync(mdPath, 'utf8') });
      } catch {}
    }
  }

  // Also collect MD files from phase directories (PRD, roadmap, notes, summaries, checklists)
  const phasesMdDir = safeJoin(projectDir, 'phases');
  if (phasesMdDir && existsSync(phasesMdDir)) {
    for (const phaseEntry of readdirSync(phasesMdDir, { withFileTypes: true })) {
      if (!phaseEntry.isDirectory()) continue;
      const phaseDir = safeJoin(phasesMdDir, phaseEntry.name);
      if (!phaseDir) continue;
      for (const file of readdirSync(phaseDir)) {
        if (!file.endsWith('.md')) continue;
        const mdPath = safeJoin(phaseDir, file);
        if (!mdPath) continue;
        try {
          context.push({ name: `${phaseEntry.name}/${file}`, content: readFileSync(mdPath, 'utf8') });
        } catch {}
      }
    }
  }

  // Decisions — try decisions.json first, fallback to decisions.md
  let decisions = [];
  const decisionsJsonPath = safeJoin(projectDir, 'context', 'decisions.json');
  if (decisionsJsonPath && existsSync(decisionsJsonPath)) {
    try {
      const dd = JSON.parse(readFileSync(decisionsJsonPath, 'utf8'));
      decisions = (dd.decisions || []).slice(-5);
    } catch {}
  }
  if (decisions.length === 0) {
    // Fallback: parse decisions.md for bullet items
    const decisionsMdPath = safeJoin(projectDir, 'context', 'decisions.md');
    if (decisionsMdPath && existsSync(decisionsMdPath)) {
      try {
        const md = readFileSync(decisionsMdPath, 'utf8');
        const lines = md.split('\n').filter(l => l.startsWith('- ')).slice(-5);
        decisions = lines.map(l => ({ title: l.slice(2).trim() }));
      } catch {}
    }
  }

  // Steps + Tasks — search all phase dirs for steps.json/tasks.json
  let steps = { total: 0, completed: 0 };
  let allTasks = [];
  const phasesSearchDir = safeJoin(projectDir, 'phases');
  if (phasesSearchDir && existsSync(phasesSearchDir)) {
    for (const entry of readdirSync(phasesSearchDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sp = safeJoin(phasesSearchDir, entry.name, 'steps.json');
      const tp = safeJoin(phasesSearchDir, entry.name, 'tasks.json');
      if (sp && existsSync(sp) && steps.total === 0) {
        try {
          const sd = JSON.parse(readFileSync(sp, 'utf8'));
          const td = (tp && existsSync(tp)) ? JSON.parse(readFileSync(tp, 'utf8')) : { tasks: [] };
          allTasks = td.tasks || [];
          steps.total = sd.steps?.length || 0;
          steps.completed = (sd.steps || []).filter(w => w.tasks.every(id => allTasks.find(t => t.id === id)?.status === 'completed')).length;
        } catch {}
      } else if (tp && existsSync(tp) && allTasks.length === 0) {
        try { allTasks = JSON.parse(readFileSync(tp, 'utf8')).tasks || []; } catch {}
      }
    }
  }

  // Cost from metrics
  let cost = 0;
  const metricsDir = safeJoin(xmRoot, 'build', 'metrics');
  const metricsFile = metricsDir ? safeJoin(metricsDir, 'sessions.jsonl') : null;
  if (metricsFile && existsSync(metricsFile)) {
    try {
      const lines = readFileSync(metricsFile, 'utf8').trim().split('\n');
      for (const line of lines) {
        try {
          const m = JSON.parse(line);
          if (typeof m.cost_usd === 'number' && m.project === slug) cost += m.cost_usd;
        } catch {}
      }
    } catch {}
  }

  // Quality (avg score from tasks found above)
  let quality = null;
  const scored = allTasks.filter(t => t.score != null);
  if (scored.length > 0) quality = scored.reduce((s, t) => s + t.score, 0) / scored.length;

  return jsonResponseWithETag({ manifest, circuitBreaker, handoff, phases, context, decisions, steps, cost: Math.round(cost * 10000) / 10000, quality }, req);
}

function handleSessionState(xmRoot, req) {
  const buildDir = safeJoin(xmRoot, 'build', 'projects');
  const projects = [];

  if (buildDir && existsSync(buildDir)) {
    for (const entry of readdirSync(buildDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const mPath = safeJoin(buildDir, entry.name, 'manifest.json');
      if (!mPath || !existsSync(mPath)) continue;
      try {
        const manifest = JSON.parse(readFileSync(mPath, 'utf8'));

        // Find tasks
        let taskTotal = 0, taskCompleted = 0, taskFailed = 0;
        const phasesDir = safeJoin(buildDir, entry.name, 'phases');
        if (phasesDir && existsSync(phasesDir)) {
          for (const ph of readdirSync(phasesDir, { withFileTypes: true })) {
            if (!ph.isDirectory()) continue;
            const tp = safeJoin(phasesDir, ph.name, 'tasks.json');
            if (tp && existsSync(tp)) {
              try {
                const td = JSON.parse(readFileSync(tp, 'utf8'));
                const tasks = td.tasks || [];
                taskTotal = tasks.length;
                taskCompleted = tasks.filter(t => t.status === 'completed').length;
                taskFailed = tasks.filter(t => t.status === 'failed').length;
              } catch {}
              break;
            }
          }
        }

        // Decisions
        let decisions = [];
        const djPath = safeJoin(buildDir, entry.name, 'context', 'decisions.json');
        const dmPath = safeJoin(buildDir, entry.name, 'context', 'decisions.md');
        if (djPath && existsSync(djPath)) {
          try { decisions = (JSON.parse(readFileSync(djPath, 'utf8')).decisions || []).slice(-3); } catch {}
        } else if (dmPath && existsSync(dmPath)) {
          try { decisions = readFileSync(dmPath, 'utf8').split('\n').filter(l => l.startsWith('- ')).slice(-3).map(l => ({ title: l.slice(2).trim() })); } catch {}
        }

        projects.push({
          name: entry.name,
          display_name: manifest.display_name || entry.name,
          phase: manifest.current_phase,
          tasks: { total: taskTotal, completed: taskCompleted, failed: taskFailed },
          decisions: decisions.map(d => d.title || d.message || d),
          created_at: manifest.created_at,
          updated_at: manifest.updated_at,
        });
      } catch {}
    }
  }

  // Sort by updated_at desc
  projects.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

  // Active = not in close phase
  const active = projects.filter(p => p.phase !== '05-close');
  const recent = projects.filter(p => p.phase === '05-close').slice(0, 5);

  // All decisions from active projects
  const allDecisions = [];
  for (const p of active) {
    for (const d of p.decisions) {
      allDecisions.push({ project: p.name, decision: d });
    }
  }

  // SESSION-STATE.json (workspace-level handoff from /x-handoff)
  let sessionHandoff = null;
  const sessionStatePath = safeJoin(xmRoot, 'build', 'SESSION-STATE.json');
  if (sessionStatePath && existsSync(sessionStatePath)) {
    try { sessionHandoff = JSON.parse(readFileSync(sessionStatePath, 'utf8')); } catch {}
  }

  return jsonResponseWithETag({ active, recent, decisions: allDecisions.slice(-10), session_handoff: sessionHandoff, generated_at: new Date().toISOString() }, req);
}

function handleProbeLatest(xmRoot, req) {
  const filePath = safeJoin(xmRoot, 'probe', 'last-verdict.json');
  if (!filePath) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!existsSync(filePath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);
  try {
    return jsonResponseWithETag(JSON.parse(readFileSync(filePath, 'utf8')), req);
  } catch {
    return jsonResponseWithETag({ error: 'parse_error', file: 'last-verdict.json' }, req, 500);
  }
}

function handleProbeHistoryFile(xmRoot, file, req) {
  const baseName = file.endsWith('.json') ? file.slice(0, -5) : file;
  if (!isValidSegment(baseName)) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  const fileName = file.endsWith('.json') ? file : file + '.json';
  const filePath = safeJoin(xmRoot, 'probe', 'history', fileName);
  if (!filePath) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!existsSync(filePath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);
  try {
    return jsonResponseWithETag(JSON.parse(readFileSync(filePath, 'utf8')), req);
  } catch {
    return jsonResponseWithETag({ error: 'parse_error', file: fileName }, req, 500);
  }
}

function readProbeFile(xmRoot, param) {
  if (param === 'latest') {
    const filePath = safeJoin(xmRoot, 'probe', 'last-verdict.json');
    if (!filePath) return { error: 'forbidden', status: 400 };
    if (!existsSync(filePath)) return { error: 'not_found', status: 404 };
    try {
      return { data: JSON.parse(readFileSync(filePath, 'utf8')), file: 'latest' };
    } catch {
      return { error: 'parse_error', status: 500 };
    }
  }
  const baseName = param.endsWith('.json') ? param.slice(0, -5) : param;
  // Allow date-based names like 2026-04-03-xm-web-dashboard
  const PROBE_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;
  if (!PROBE_SEGMENT_RE.test(baseName)) return { error: 'forbidden', status: 400 };
  const fileName = param.endsWith('.json') ? param : param + '.json';
  const filePath = safeJoin(xmRoot, 'probe', 'history', fileName);
  if (!filePath) return { error: 'forbidden', status: 400 };
  if (!existsSync(filePath)) return { error: 'not_found', status: 404 };
  try {
    return { data: JSON.parse(readFileSync(filePath, 'utf8')), file: fileName };
  } catch {
    return { error: 'parse_error', status: 500 };
  }
}

function setDiff(a, b) {
  return {
    added: b.filter(x => !a.includes(x)),
    removed: a.filter(x => !b.includes(x)),
    unchanged: a.filter(x => b.includes(x)),
  };
}

function diffVerdicts(a, b) {
  const diff = {
    verdict: { a: a.verdict, b: b.verdict, changed: a.verdict !== b.verdict },
    idea: { a: a.idea, b: b.idea },
    recommendation: { a: a.recommendation, b: b.recommendation, changed: a.recommendation !== b.recommendation },
    premises: { added: [], removed: [], changed: [], unchanged: [] },
    evidence_summary: { a: a.evidence_summary, b: b.evidence_summary },
  };

  const aPremises = a.premises || [];
  const bPremises = b.premises || [];

  const bMatched = new Set();
  for (const ap of aPremises) {
    const matchIdx = bPremises.findIndex((bp, i) => !bMatched.has(i) && (bp.statement === ap.statement || bp.id === ap.id));
    if (matchIdx !== -1) {
      bMatched.add(matchIdx);
      const match = bPremises[matchIdx];
      if (ap.status !== match.status || ap.final_grade !== match.final_grade) {
        diff.premises.changed.push({ a: ap, b: match });
      } else {
        diff.premises.unchanged.push(match);
      }
    } else {
      diff.premises.removed.push(ap);
    }
  }
  for (let i = 0; i < bPremises.length; i++) {
    if (!bMatched.has(i)) diff.premises.added.push(bPremises[i]);
  }

  diff.evidence_gaps = setDiff(a.evidence_gaps || [], b.evidence_gaps || []);
  diff.risks = setDiff(a.risks || [], b.risks || []);
  diff.kill_criteria = setDiff(a.kill_criteria || [], b.kill_criteria || []);

  return diff;
}

function handleProbeDiff(xmRoot, url, req) {
  const aParam = url.searchParams.get('a');
  const bParam = url.searchParams.get('b');
  if (!aParam || !bParam) return jsonResponseWithETag({ error: 'missing_param', required: ['a', 'b'] }, req, 400);

  const aResult = readProbeFile(xmRoot, decodeURIComponent(aParam));
  if (aResult.error) return jsonResponseWithETag({ error: aResult.error, file: aParam }, req, aResult.status);

  const bResult = readProbeFile(xmRoot, decodeURIComponent(bParam));
  if (bResult.error) return jsonResponseWithETag({ error: bResult.error, file: bParam }, req, bResult.status);

  const diff = diffVerdicts(aResult.data, bResult.data);
  return jsonResponseWithETag({
    a: { file: aResult.file, idea: aResult.data.idea, verdict: aResult.data.verdict },
    b: { file: bResult.file, idea: bResult.data.idea, verdict: bResult.data.verdict },
    diff,
  }, req);
}

function handleProbeHistory(xmRoot, req) {
  const historyDir = safeJoin(xmRoot, 'probe', 'history');
  if (!historyDir || !existsSync(historyDir)) return jsonResponseWithETag({ data: [] }, req);
  const results = [];
  for (const entry of readdirSync(historyDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = safeJoin(historyDir, entry.name);
    if (!filePath) continue;
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      parsed._file = entry.name;
      results.push(parsed);
    } catch {}
  }
  results.sort((a, b) => {
    const da = a.date ?? a.timestamp ?? a.created_at ?? '';
    const db = b.date ?? b.timestamp ?? b.created_at ?? '';
    return db < da ? -1 : db > da ? 1 : 0;
  });
  return jsonResponseWithETag({ data: results }, req);
}

// ── x-op result handlers ───────────────────────────────────────────

function handleOpList(xmRoot, req) {
  const opDir = safeJoin(xmRoot, 'op');
  if (!opDir || !existsSync(opDir)) return jsonResponseWithETag({ data: [] }, req);
  const results = [];
  for (const entry of readdirSync(opDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = safeJoin(opDir, entry.name);
    if (!filePath) continue;
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      parsed._file = entry.name;
      results.push(parsed);
    } catch {}
  }
  results.sort((a, b) => {
    const da = a.completed_at ?? a.created_at ?? '';
    const db = b.completed_at ?? b.created_at ?? '';
    return db < da ? -1 : db > da ? 1 : 0;
  });
  return jsonResponseWithETag({ data: results }, req);
}

function handleOpDetail(xmRoot, file, req) {
  const baseName = file.endsWith('.json') ? file.slice(0, -5) : file;
  if (!isValidSegment(baseName)) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  const fileName = file.endsWith('.json') ? file : file + '.json';
  const filePath = safeJoin(xmRoot, 'op', fileName);
  if (!filePath || !existsSync(filePath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    return jsonResponseWithETag(data, req);
  } catch {
    return jsonResponseWithETag({ error: 'parse_error' }, req, 500);
  }
}

function handleSolverList(xmRoot, req) {
  const solverDir = safeJoin(xmRoot, 'solver', 'problems');
  if (!solverDir || !existsSync(solverDir)) return jsonResponseWithETag({ data: [] }, req);
  const manifests = [];
  for (const entry of readdirSync(solverDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = safeJoin(solverDir, entry.name, 'manifest.json');
    if (!manifestPath || !existsSync(manifestPath)) continue;
    try {
      manifests.push(JSON.parse(readFileSync(manifestPath, 'utf8')));
    } catch {}
  }
  return jsonResponseWithETag({ data: manifests }, req);
}

function handleSolverDetail(xmRoot, slug, req) {
  if (!isValidSegment(slug)) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  const problemDir = safeJoin(xmRoot, 'solver', 'problems', slug);
  if (!problemDir || !existsSync(problemDir)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);

  const manifestPath = safeJoin(problemDir, 'manifest.json');
  if (!manifestPath || !existsSync(manifestPath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return jsonResponseWithETag({ error: 'parse_error', file: 'manifest.json' }, req, 500);
  }

  const phases = [];
  const phasesDir = safeJoin(problemDir, 'phases');
  if (phasesDir && existsSync(phasesDir)) {
    for (const entry of readdirSync(phasesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const phaseDir = safeJoin(phasesDir, entry.name);
      if (!phaseDir) continue;
      const phaseData = { phase: entry.name, files: {} };
      for (const file of readdirSync(phaseDir)) {
        const filePath = safeJoin(phaseDir, file);
        if (!filePath) continue;
        try {
          const content = readFileSync(filePath, 'utf8');
          if (file.endsWith('.json')) {
            phaseData.files[file] = JSON.parse(content);
          } else {
            phaseData.files[file] = content;
          }
        } catch {}
      }
      if (Object.keys(phaseData.files).length > 0) {
        phases.push(phaseData);
      }
    }
  }

  return jsonResponseWithETag({ manifest, phases }, req);
}

// ── x-review handlers ──────────────────────────────────────────────

function handleReviewLast(xmRoot, req) {
  const reviewDir = safeJoin(xmRoot, 'review');
  if (!reviewDir) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);

  const result = { json: null, md: null };

  const jsonPath = safeJoin(reviewDir, 'last-result.json');
  if (jsonPath && existsSync(jsonPath)) {
    try { result.json = JSON.parse(readFileSync(jsonPath, 'utf8')); } catch {}
  }
  const mdPath = safeJoin(reviewDir, 'last-result.md');
  if (mdPath && existsSync(mdPath)) {
    try { result.md = readFileSync(mdPath, 'utf8'); } catch {}
  }

  if (!result.json && !result.md) {
    return jsonResponseWithETag({ error: 'not_found' }, req, 404);
  }
  return jsonResponseWithETag(result, req);
}

function handleReviewHistory(xmRoot, req) {
  const historyDir = safeJoin(xmRoot, 'review', 'history');
  if (!historyDir || !existsSync(historyDir)) return jsonResponseWithETag({ data: [] }, req);

  const results = [];
  for (const entry of readdirSync(historyDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = safeJoin(historyDir, entry.name);
    if (!filePath) continue;
    try {
      const content = readFileSync(filePath, 'utf8');
      // Parse MD header block produced by x-review
      const titleMatch = content.match(/^# x-review: (.+?) — (.+)$/m);
      const dateMatch = content.match(/^- Date: (.+)$/m);
      const branchMatch = content.match(/^- Branch: (.+)$/m);
      const lensesMatch = content.match(/^- Lenses: (.+)$/m);
      const findingsMatch = content.match(/^- Findings: (.+)$/m);
      results.push({
        file: entry.name,
        target: titleMatch?.[1] ?? entry.name,
        verdict: titleMatch?.[2] ?? 'unknown',
        date: dateMatch?.[1] ?? '',
        branch: branchMatch?.[1] ?? '',
        lenses: lensesMatch?.[1] ?? '',
        findings_summary: findingsMatch?.[1] ?? '',
      });
    } catch {}
  }
  results.sort((a, b) => (b.date || b.file).localeCompare(a.date || a.file));
  return jsonResponseWithETag({ data: results }, req);
}

function handleReviewHistoryFile(xmRoot, file, req) {
  if (!/^[a-zA-Z0-9._-]+\.md$/.test(file)) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  const filePath = safeJoin(xmRoot, 'review', 'history', file);
  if (!filePath) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!existsSync(filePath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);
  try {
    return jsonResponseWithETag({ file, content: readFileSync(filePath, 'utf8') }, req);
  } catch {
    return jsonResponseWithETag({ error: 'read_error' }, req, 500);
  }
}

// ── x-eval handlers ────────────────────────────────────────────────

const EVAL_CATEGORIES = new Set(['results', 'benchmarks', 'diffs', 'rubrics']);

function handleEvalList(xmRoot, req) {
  const evalDir = safeJoin(xmRoot, 'eval');
  const categories = { results: [], benchmarks: [], diffs: [], rubrics: [] };
  if (!evalDir || !existsSync(evalDir)) return jsonResponseWithETag({ categories }, req);

  for (const cat of EVAL_CATEGORIES) {
    const catDir = safeJoin(evalDir, cat);
    if (!catDir || !existsSync(catDir)) continue;
    const items = [];
    try {
      for (const entry of readdirSync(catDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const filePath = safeJoin(catDir, entry.name);
        if (!filePath) continue;
        let summary = null;
        let timestamp = null;
        if (entry.name.endsWith('.json')) {
          try {
            const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
            timestamp = parsed.timestamp ?? parsed.created_at ?? null;
            summary = {
              type: parsed.type ?? null,
              rubric: parsed.rubric ?? null,
              overall: parsed.overall ?? null,
              verdict: parsed.verdict ?? null,
              from: parsed.from ?? null,
              to: parsed.to ?? null,
              name: parsed.name ?? null,
            };
          } catch {}
        }
        items.push({ file: entry.name, timestamp, summary });
      }
    } catch {}
    items.sort((a, b) => (b.timestamp || b.file).localeCompare(a.timestamp || a.file));
    categories[cat] = items;
  }
  return jsonResponseWithETag({ categories }, req);
}

function handleEvalFile(xmRoot, category, file, req) {
  if (!EVAL_CATEGORIES.has(category)) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!/^[a-zA-Z0-9._-]+\.(json|md)$/.test(file)) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  const filePath = safeJoin(xmRoot, 'eval', category, file);
  if (!filePath) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!existsSync(filePath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);
  try {
    const raw = readFileSync(filePath, 'utf8');
    if (file.endsWith('.json')) {
      return jsonResponseWithETag({ category, file, json: JSON.parse(raw) }, req);
    }
    return jsonResponseWithETag({ category, file, content: raw }, req);
  } catch {
    return jsonResponseWithETag({ error: 'parse_error', file }, req, 500);
  }
}

// ── x-humble handlers ──────────────────────────────────────────────

const HUMBLE_KINDS = new Set(['lessons', 'retrospectives']);

function handleHumbleList(xmRoot, req) {
  const humbleDir = safeJoin(xmRoot, 'humble');
  const kinds = { lessons: [], retrospectives: [] };
  if (!humbleDir || !existsSync(humbleDir)) return jsonResponseWithETag({ kinds }, req);

  for (const kind of HUMBLE_KINDS) {
    const kindDir = safeJoin(humbleDir, kind);
    if (!kindDir || !existsSync(kindDir)) continue;
    const items = [];
    try {
      for (const entry of readdirSync(kindDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const filePath = safeJoin(kindDir, entry.name);
        if (!filePath) continue;
        let summary = null;
        let timestamp = null;
        if (entry.name.endsWith('.json')) {
          try {
            const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
            timestamp = parsed.timestamp ?? parsed.created_at ?? parsed.updated_at ?? null;
            summary = {
              title: parsed.title ?? null,
              type: parsed.type ?? null,
              status: parsed.status ?? null,
              confirmed_count: parsed.confirmed_count ?? null,
              tags: Array.isArray(parsed.tags) ? parsed.tags : null,
            };
          } catch {}
        } else if (entry.name.endsWith('.md')) {
          try {
            const content = readFileSync(filePath, 'utf8').slice(0, 800);
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const dateMatch = content.match(/^- Date: (.+)$/m);
            timestamp = dateMatch?.[1] ?? null;
            summary = { title: titleMatch?.[1] ?? null };
          } catch {}
        }
        items.push({ file: entry.name, timestamp, summary });
      }
    } catch {}
    items.sort((a, b) => (b.timestamp || b.file).localeCompare(a.timestamp || a.file));
    kinds[kind] = items;
  }
  return jsonResponseWithETag({ kinds }, req);
}

function handleHumbleFile(xmRoot, kind, file, req) {
  if (!HUMBLE_KINDS.has(kind)) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!/^[a-zA-Z0-9._-]+\.(json|md)$/.test(file)) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  const filePath = safeJoin(xmRoot, 'humble', kind, file);
  if (!filePath) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!existsSync(filePath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);
  try {
    const raw = readFileSync(filePath, 'utf8');
    if (file.endsWith('.json')) {
      return jsonResponseWithETag({ kind, file, json: JSON.parse(raw) }, req);
    }
    return jsonResponseWithETag({ kind, file, content: raw }, req);
  } catch {
    return jsonResponseWithETag({ error: 'parse_error', file }, req, 500);
  }
}

function handleSearch(xmRoot, url, req) {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) return jsonResponseWithETag({ data: [] }, req);

  const qLower = q.toLowerCase();
  const results = [];

  function snippet(text, keyword) {
    const idx = text.toLowerCase().indexOf(keyword);
    if (idx === -1) return null;
    const start = Math.max(0, idx - 25);
    const end = Math.min(text.length, idx + keyword.length + 25);
    let s = text.slice(start, end);
    if (start > 0) s = '…' + s;
    if (end < text.length) s = s + '…';
    return s;
  }

  function matchesAny(strings, kw) {
    return strings.some(s => s && s.toLowerCase().includes(kw));
  }

  // Search projects
  const projectsDir = safeJoin(xmRoot, 'build', 'projects');
  if (projectsDir && existsSync(projectsDir)) {
    for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectSlug = entry.name;
      const projectDir = safeJoin(projectsDir, projectSlug);
      if (!projectDir) continue;

      // manifest.json — project name + display_name
      const manifestPath = safeJoin(projectDir, 'manifest.json');
      if (manifestPath && existsSync(manifestPath)) {
        try {
          const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
          const fields = [m.name, m.display_name, m.description].filter(Boolean);
          if (matchesAny(fields, qLower)) {
            const matchField = fields.find(f => f && f.toLowerCase().includes(qLower)) ?? '';
            results.push({
              type: 'project',
              name: m.display_name || m.name || projectSlug,
              match: snippet(matchField, qLower) ?? matchField.slice(0, 80),
              url: `#/projects/${projectSlug}`,
            });
          }
        } catch {}
      }

      // tasks.json — task names
      const tasksPath = safeJoin(projectDir, 'phases', '02-plan', 'tasks.json');
      if (tasksPath && existsSync(tasksPath)) {
        try {
          const tasksData = JSON.parse(readFileSync(tasksPath, 'utf8'));
          const tasks = Array.isArray(tasksData) ? tasksData
            : Array.isArray(tasksData?.tasks) ? tasksData.tasks
            : Array.isArray(tasksData?.data) ? tasksData.data : [];
          for (const task of tasks) {
            const fields = [task.name, task.id, task.done_criteria].filter(Boolean);
            if (matchesAny(fields, qLower)) {
              const matchField = fields.find(f => f && f.toLowerCase().includes(qLower)) ?? '';
              results.push({
                type: 'task',
                name: task.name || task.id || '—',
                project: projectSlug,
                match: snippet(matchField, qLower) ?? matchField.slice(0, 80),
                url: `#/projects/${projectSlug}`,
              });
            }
          }
        } catch {}
      }

      // context/*.md — doc content
      const contextDir = safeJoin(projectDir, 'context');
      if (contextDir && existsSync(contextDir)) {
        for (const mdEntry of readdirSync(contextDir, { withFileTypes: true })) {
          if (!mdEntry.isFile() || !mdEntry.name.endsWith('.md')) continue;
          const mdPath = safeJoin(contextDir, mdEntry.name);
          if (!mdPath) continue;
          try {
            const content = readFileSync(mdPath, 'utf8');
            if (content.toLowerCase().includes(qLower)) {
              results.push({
                type: 'doc',
                name: mdEntry.name,
                project: projectSlug,
                match: snippet(content, qLower) ?? content.slice(0, 80),
                url: `#/projects/${projectSlug}`,
              });
            }
          } catch {}
        }
      }
    }
  }

  // Search probes — last-verdict.json + history/*.json
  const probeFiles = [];
  const lastVerdictPath = safeJoin(xmRoot, 'probe', 'last-verdict.json');
  if (lastVerdictPath && existsSync(lastVerdictPath)) {
    probeFiles.push({ path: lastVerdictPath, file: 'latest' });
  }
  const probeHistoryDir = safeJoin(xmRoot, 'probe', 'history');
  if (probeHistoryDir && existsSync(probeHistoryDir)) {
    for (const entry of readdirSync(probeHistoryDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const fp = safeJoin(probeHistoryDir, entry.name);
      if (fp) probeFiles.push({ path: fp, file: entry.name });
    }
  }
  for (const { path: fp, file } of probeFiles) {
    try {
      const p = JSON.parse(readFileSync(fp, 'utf8'));
      const fields = [p.idea, p.recommendation, ...(Array.isArray(p.premises) ? p.premises.map(pr => pr.statement) : [])].filter(Boolean);
      if (matchesAny(fields, qLower)) {
        const matchField = fields.find(f => f && f.toLowerCase().includes(qLower)) ?? '';
        results.push({
          type: 'probe',
          name: p.idea || file,
          match: snippet(matchField, qLower) ?? matchField.slice(0, 80),
          url: `#/probes/${encodeURIComponent(file)}`,
        });
      }
    } catch {}
  }

  // Search solvers — solver/problems/*/manifest.json
  const solverDir = safeJoin(xmRoot, 'solver', 'problems');
  if (solverDir && existsSync(solverDir)) {
    for (const entry of readdirSync(solverDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = safeJoin(solverDir, entry.name, 'manifest.json');
      if (!manifestPath || !existsSync(manifestPath)) continue;
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const fields = [m.name, m.display_name, m.problem].filter(Boolean);
        if (matchesAny(fields, qLower)) {
          const matchField = fields.find(f => f && f.toLowerCase().includes(qLower)) ?? '';
          results.push({
            type: 'solver',
            name: m.display_name || m.name || entry.name,
            match: snippet(matchField, qLower) ?? matchField.slice(0, 80),
            url: `#/solvers/${entry.name}`,
          });
        }
      } catch {}
    }
  }

  return jsonResponseWithETag({ data: results }, req);
}

// ── R3: Traces API ────────────────────────────────────────────────────

const MODEL_PRICING = {
  haiku:  { input: 0.80 / 1_000_000, output: 4.00 / 1_000_000 },
  sonnet: { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
  opus:   { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 },
};

function resolveModelKey(model) {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.includes('haiku'))  return 'haiku';
  if (m.includes('opus'))   return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  return null;
}

function parseJsonlFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function handleTraces(xmRoot, req) {
  const tracesDir = safeJoin(xmRoot, 'traces');

  // Read active pointer
  let active = null;
  const activeFile = tracesDir ? safeJoin(xmRoot, 'traces', '.active') : null;
  if (activeFile && existsSync(activeFile)) {
    try { active = readFileSync(activeFile, 'utf8').trim(); } catch {}
  }

  if (!tracesDir || !existsSync(tracesDir)) {
    return jsonResponseWithETag({ traces: [], active }, req);
  }

  let entries;
  try {
    entries = readdirSync(tracesDir, { withFileTypes: true });
  } catch {
    return jsonResponseWithETag({ traces: [], active }, req);
  }

  const traces = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    const filePath = safeJoin(tracesDir, entry.name);
    if (!filePath) continue;

    let lineCount = 0;
    let firstEntry = null;
    let lastEntry = null;
    try {
      const lines = readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
      lineCount = lines.length;
      if (lines.length > 0) {
        try { firstEntry = JSON.parse(lines[0]); } catch {}
        try { lastEntry = JSON.parse(lines[lines.length - 1]); } catch {}
      }
    } catch {
      continue;
    }

    // Parse name and date from filename: {name}-{YYYYMMDD-HHMMSS}.jsonl
    const nameMatch = entry.name.match(/^(.+)-(\d{8}-\d{6})\.jsonl$/);
    const name = nameMatch ? nameMatch[1] : entry.name.replace(/\.jsonl$/, '');
    const dateStr = nameMatch ? nameMatch[2].slice(0, 4) + '-' + nameMatch[2].slice(4, 6) + '-' + nameMatch[2].slice(6, 8) : null;

    const startTime = firstEntry?.timestamp ?? null;
    let duration = null;
    let status = 'active';
    if (lastEntry && lastEntry.type === 'session_end') {
      status = 'completed';
      if (firstEntry?.timestamp && lastEntry?.timestamp) {
        duration = new Date(lastEntry.timestamp) - new Date(firstEntry.timestamp);
      }
      if (duration == null && lastEntry?.duration_ms != null) {
        duration = lastEntry.duration_ms;
      }
    }

    // Calculate per-trace cost from agent_call/agent_step entries
    let traceCost = 0;
    let traceTokensIn = 0;
    let traceTokensOut = 0;
    let agentCount = 0;
    try {
      const allLines = readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
      for (const raw of allLines) {
        let ln;
        try { ln = JSON.parse(raw); } catch { continue; }
        if (ln.type !== 'agent_call' && ln.type !== 'agent_step') continue;
        agentCount++;
        const inTok = ln.input_tokens_est ?? ln.tokens_est?.input ?? 0;
        const outTok = ln.output_tokens_est ?? ln.tokens_est?.output ?? 0;
        traceTokensIn += inTok;
        traceTokensOut += outTok;
        const mk = resolveModelKey(ln.agent?.model ?? ln.model);
        const pr = mk ? MODEL_PRICING[mk] : null;
        if (pr) traceCost += inTok * pr.input + outTok * pr.output;
      }
    } catch {}

    traces.push({
      file: entry.name,
      name,
      date: dateStr,
      entryCount: lineCount,
      duration,
      status,
      startTime,
      cost: traceCost,
      tokens: { input: traceTokensIn, output: traceTokensOut },
      agents: agentCount,
    });
  }

  // Sort newest first
  traces.sort((a, b) => (b.startTime ?? '') < (a.startTime ?? '') ? -1 : 1);

  return jsonResponseWithETag({ traces, active }, req);
}

function handleTraceDetail(xmRoot, file, req, url) {
  // Allow filenames like name-20260403-120000.jsonl or name-20260403-120000-a3f1.jsonl
  const TRACE_FILE_RE = /^[a-zA-Z0-9._-]+-\d{8}-\d{6}(-[a-f0-9]{4})?\.jsonl$/;
  if (!TRACE_FILE_RE.test(file)) {
    return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  }

  const filePath = safeJoin(xmRoot, 'traces', file);
  if (!filePath) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!existsSync(filePath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);

  const limit = Math.max(1, parseInt(url.searchParams.get('limit') ?? '200', 10));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));

  const entries = parseJsonlFile(filePath);
  const total = entries.length;
  return jsonResponseWithETag({
    entries: entries.slice(offset, offset + limit),
    total,
    limit,
    offset,
    file,
  }, req);
}

// ── R5: Costs API ─────────────────────────────────────────────────────

function handleCosts(xmRoot, req) {
  const tracesDir = safeJoin(xmRoot, 'traces');
  if (!tracesDir || !existsSync(tracesDir)) {
    return jsonResponseWithETag({
      totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0,
      byModel: {}, byDate: [],
    }, req);
  }

  let entries;
  try {
    entries = readdirSync(tracesDir, { withFileTypes: true });
  } catch {
    return jsonResponseWithETag({
      totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0,
      byModel: {}, byDate: [],
    }, req);
  }

  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const byModel = {};
  const byDateMap = {};

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
    const filePath = safeJoin(tracesDir, entry.name);
    if (!filePath) continue;

    const lines = parseJsonlFile(filePath);
    for (const line of lines) {
      if (line.type !== 'agent_call' && line.type !== 'agent_step') continue;
      const inputTokens = line.input_tokens_est ?? line.tokens_est?.input ?? 0;
      const outputTokens = line.output_tokens_est ?? line.tokens_est?.output ?? 0;
      if (!inputTokens && !outputTokens) continue;

      const modelKey = resolveModelKey(line.agent?.model ?? line.model);
      const pricing = modelKey ? MODEL_PRICING[modelKey] : null;
      const cost = pricing
        ? inputTokens * pricing.input + outputTokens * pricing.output
        : 0;

      totalCost += cost;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      if (modelKey) {
        if (!byModel[modelKey]) byModel[modelKey] = { cost: 0, inputTokens: 0, outputTokens: 0 };
        byModel[modelKey].cost += cost;
        byModel[modelKey].inputTokens += inputTokens;
        byModel[modelKey].outputTokens += outputTokens;
      }

      // Date from timestamp
      const ts = line.timestamp;
      if (ts) {
        const date = ts.slice(0, 10); // YYYY-MM-DD
        if (!byDateMap[date]) byDateMap[date] = { date, cost: 0, inputTokens: 0, outputTokens: 0 };
        byDateMap[date].cost += cost;
        byDateMap[date].inputTokens += inputTokens;
        byDateMap[date].outputTokens += outputTokens;
      }
    }
  }

  const byDate = Object.values(byDateMap).sort((a, b) => a.date < b.date ? -1 : 1);

  return jsonResponseWithETag({
    totalCost, totalInputTokens, totalOutputTokens, byModel, byDate,
  }, req);
}

function handleMetricsSessions(xmRoot, url, req) {
  const limit = Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));
  const filePath = safeJoin(xmRoot, 'build', 'metrics', 'sessions.jsonl');
  if (!filePath) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!existsSync(filePath)) return jsonResponseWithETag({ data: [], total: 0 }, req);
  try {
    const lines = readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
    const parsed = [];
    for (const line of lines) {
      try { parsed.push(JSON.parse(line)); } catch {}
    }
    const total = parsed.length;
    return jsonResponseWithETag({ data: parsed.slice(offset, offset + limit), total, limit, offset }, req);
  } catch {
    return jsonResponseWithETag({ error: 'parse_error', file: 'sessions.jsonl' }, req, 500);
  }
}

function handleMemoryList(xmRoot, url, req) {
  const indexPath = safeJoin(xmRoot, 'memory', 'index.json');
  if (!indexPath || !existsSync(indexPath)) {
    return jsonResponseWithETag({ decisions: [], total: 0 }, req);
  }
  let entries;
  try {
    const raw = JSON.parse(readFileSync(indexPath, 'utf8'));
    entries = Array.isArray(raw) ? raw : (Array.isArray(raw.decisions) ? raw.decisions : []);
  } catch {
    return jsonResponseWithETag({ error: 'parse_error', file: 'index.json' }, req, 500);
  }

  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const typeFilter = (url.searchParams.get('type') ?? '').trim().toLowerCase();

  let result = entries;
  if (q) {
    result = result.filter(e => {
      const title = (e.title ?? '').toLowerCase();
      const why = (e.why ?? '').toLowerCase();
      const tags = Array.isArray(e.tags) ? e.tags.join(' ').toLowerCase() : '';
      return title.includes(q) || why.includes(q) || tags.includes(q);
    });
  }
  if (typeFilter) {
    result = result.filter(e => (e.type ?? '').toLowerCase() === typeFilter);
  }

  return jsonResponseWithETag({ decisions: result, total: result.length }, req);
}

function handleMemoryDetail(xmRoot, id, req) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  }
  const mdPath = safeJoin(xmRoot, 'memory', 'memories', id + '.md');
  if (!mdPath) return jsonResponseWithETag({ error: 'forbidden' }, req, 400);
  if (!existsSync(mdPath)) return jsonResponseWithETag({ error: 'not_found' }, req, 404);

  let content;
  try {
    content = readFileSync(mdPath, 'utf8');
  } catch {
    return jsonResponseWithETag({ error: 'read_error' }, req, 500);
  }

  let meta = null;
  const resolvedIndex = safeJoin(xmRoot, 'memory', 'index.json');
  if (resolvedIndex && existsSync(resolvedIndex)) {
    try {
      const raw = JSON.parse(readFileSync(resolvedIndex, 'utf8'));
      const idx = Array.isArray(raw) ? raw : (Array.isArray(raw.decisions) ? raw.decisions : []);
      meta = idx.find(e => e.id === id) ?? null;
    } catch {}
  }

  return jsonResponseWithETag({ id, content, meta }, req);
}

// ── M4: WorkspaceAPI helpers ─────────────────────────────────────────

function countDirEntries(dirPath) {
  if (!dirPath || !existsSync(dirPath)) return 0;
  try {
    return readdirSync(dirPath).length;
  } catch {
    return 0;
  }
}

function getWorkspaceStats(ws) {
  const projectsDir = safeJoin(ws.xmRoot, 'build', 'projects');
  const probeHistoryDir = safeJoin(ws.xmRoot, 'probe', 'history');
  const solverDir = safeJoin(ws.xmRoot, 'solver', 'problems');

  // Calculate total cost from traces
  let totalCost = 0;
  const tracesDir = safeJoin(ws.xmRoot, 'traces');
  if (tracesDir && existsSync(tracesDir)) {
    try {
      for (const entry of readdirSync(tracesDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
        const fp = safeJoin(tracesDir, entry.name);
        if (!fp) continue;
        try {
          const lines = readFileSync(fp, 'utf8').split('\n').filter(l => l.trim());
          for (const raw of lines) {
            let ln;
            try { ln = JSON.parse(raw); } catch { continue; }
            if (ln.type !== 'agent_call' && ln.type !== 'agent_step') continue;
            const inTok = ln.input_tokens_est ?? ln.tokens_est?.input ?? 0;
            const outTok = ln.output_tokens_est ?? ln.tokens_est?.output ?? 0;
            const mk = resolveModelKey(ln.agent?.model ?? ln.model);
            const pr = mk ? MODEL_PRICING[mk] : null;
            if (pr) totalCost += inTok * pr.input + outTok * pr.output;
          }
        } catch {}
      }
    } catch {}
  }

  return {
    projects: countDirEntries(projectsDir),
    probes: countDirEntries(probeHistoryDir),
    solvers: countDirEntries(solverDir),
    cost: Math.round(totalCost * 1000) / 1000,
  };
}

// ── Stop Mode (early exit — must run before server starts) ───────────

if (STOP_MODE) {
  if (!existsSync(PID_FILE)) {
    console.log('[x-dashboard-server] Not running (no PID file found)');
    process.exit(0);
  }

  let existing;
  try {
    existing = JSON.parse(readFileSync(PID_FILE, 'utf8'));
  } catch {
    console.error('[x-dashboard-server] Could not read PID file');
    process.exit(1);
  }

  const pid = existing?.pid;
  if (!pid) {
    console.error('[x-dashboard-server] PID file is malformed');
    process.exit(1);
  }

  // Check if alive
  try {
    process.kill(pid, 0);
  } catch {
    console.log(`[x-dashboard-server] Process ${pid} is not running (stale PID file)`);
    unlinkSync(PID_FILE);
    process.exit(0);
  }

  console.log(`[x-dashboard-server] Stopping pid ${pid} (port ${existing.port})...`);
  process.kill(pid, 'SIGTERM');

  // Wait up to 5s for the process to exit
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      console.log('[x-dashboard-server] Stopped.');
      process.exit(0);
    }
    const wait = Date.now() + 100;
    while (Date.now() < wait) {}
  }

  console.error(`[x-dashboard-server] Process ${pid} did not exit within 5s`);
  process.exit(1);
}

// ── Pre-start checks ─────────────────────────────────────────────────

checkDuplicateInstance();

// ── HTTP Server ─────────────────────────────────────────────────────

let server;
server = Bun.serve({
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
      const cwd = process.cwd();
      const projectName = cwd.split('/').pop();
      return Response.json({
        status: 'ok',
        version: VERSION,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        port: PORT,
        pid: process.pid,
        mode: SESSION_MODE ? 'session' : 'standalone',
        cwd,
        project: projectName,
        xmRoot: XM_ROOT,
        workspaces: workspaces.length,
        multiRoot: !!SCAN_DIR || workspaces.length > 1,
      });
    }

    // ── /shutdown ────────────────────────────────────────────────
    if (path === '/shutdown') {
      setTimeout(() => shutdown(), 100);
      return Response.json({ status: 'shutting_down' });
    }

    // ── POST /api/rescan — Re-scan workspaces ──────────────────
    if (req.method === 'POST' && path === '/api/rescan') {
      if (SCAN_DIR) {
        workspaces = scanWorkspaces(resolve(SCAN_DIR));
        console.log(`[x-dashboard-server] Rescan: ${workspaces.length} workspaces from ${SCAN_DIR}`);
      }
      return Response.json({ workspaces: workspaces.length });
    }

    // ── JSON API ─────────────────────────────────────────────────
    if (req.method === 'GET' && path.startsWith('/api/')) {

      // ── M4: GET /api/workspaces ──────────────────────────────
      if (path === '/api/workspaces') {
        const data = workspaces.map(ws => ({
          id: ws.id,
          name: ws.name,
          path: ws.path,
          stats: getWorkspaceStats(ws),
        }));
        return jsonResponseWithETag(data, req);
      }

      // ── M4: GET /api/workspaces/:wsId ────────────────────────
      const workspaceDetailMatch = path.match(/^\/api\/workspaces\/([^/]+)$/);
      if (workspaceDetailMatch) {
        const wsId = decodeURIComponent(workspaceDetailMatch[1]);
        const ws = getWorkspace(wsId);
        if (!ws) return jsonResponseWithETag({ error: 'workspace_not_found' }, req, 404);
        return jsonResponseWithETag({
          id: ws.id,
          name: ws.name,
          path: ws.path,
          xmRoot: ws.xmRoot,
          stats: getWorkspaceStats(ws),
        }, req);
      }

      // ── M3: Scoped routes /api/ws/:wsId/... ──────────────────
      const wsPrefix = path.match(/^\/api\/ws\/([^/]+)(\/.*)?$/);
      if (wsPrefix) {
        const wsId = decodeURIComponent(wsPrefix[1]);
        const subPath = wsPrefix[2] ?? '/';
        const xmRoot = resolveXmRoot(wsId);
        if (!xmRoot) return jsonResponseWithETag({ error: 'workspace_not_found' }, req, 404);

        // GET /api/ws/:wsId/config
        if (subPath === '/config') {
          return handleConfig(xmRoot, req);
        }

        // GET /api/ws/:wsId/projects
        if (subPath === '/projects') {
          return handleProjects(xmRoot, req);
        }

        // GET /api/ws/:wsId/projects/:slug/tasks
        const wsTasksMatch = subPath.match(/^\/projects\/([^/]+)\/tasks$/);
        if (wsTasksMatch) {
          const slug = decodeURIComponent(wsTasksMatch[1]);
          return handleProjectTasks(xmRoot, slug, req);
        }

        // GET /api/ws/:wsId/projects/:slug
        const wsProjectMatch = subPath.match(/^\/projects\/([^/]+)$/);
        if (wsProjectMatch) {
          const slug = decodeURIComponent(wsProjectMatch[1]);
          return handleProjectDetail(xmRoot, slug, req);
        }

        // GET /api/ws/:wsId/probe/latest
        if (subPath === '/probe/latest') {
          return handleProbeLatest(xmRoot, req);
        }

        // GET /api/ws/:wsId/probe/diff?a=<file>&b=<file>
        if (subPath === '/probe/diff') {
          return handleProbeDiff(xmRoot, url, req);
        }

        // GET /api/ws/:wsId/probe/history/:file
        const wsProbeFileMatch = subPath.match(/^\/probe\/history\/([^/]+)$/);
        if (wsProbeFileMatch) {
          const file = decodeURIComponent(wsProbeFileMatch[1]);
          return handleProbeHistoryFile(xmRoot, file, req);
        }

        // GET /api/ws/:wsId/probe/history
        if (subPath === '/probe/history') {
          return handleProbeHistory(xmRoot, req);
        }

        // GET /api/ws/:wsId/op
        if (subPath === '/op') {
          return handleOpList(xmRoot, req);
        }

        // GET /api/ws/:wsId/op/:file
        const wsOpMatch = subPath.match(/^\/op\/([^/]+)$/);
        if (wsOpMatch) {
          const file = decodeURIComponent(wsOpMatch[1]);
          return handleOpDetail(xmRoot, file, req);
        }

        // GET /api/ws/:wsId/solver
        if (subPath === '/solver') {
          return handleSolverList(xmRoot, req);
        }

        // GET /api/ws/:wsId/solver/:slug
        const wsSolverMatch = subPath.match(/^\/solver\/([^/]+)$/);
        if (wsSolverMatch) {
          const slug = decodeURIComponent(wsSolverMatch[1]);
          return handleSolverDetail(xmRoot, slug, req);
        }

        // GET /api/ws/:wsId/search
        if (subPath === '/search') {
          return handleSearch(xmRoot, url, req);
        }

        // GET /api/ws/:wsId/metrics/sessions
        if (subPath === '/metrics/sessions') {
          return handleMetricsSessions(xmRoot, url, req);
        }

        // GET /api/ws/:wsId/traces
        if (subPath === '/traces') {
          return handleTraces(xmRoot, req);
        }

        // GET /api/ws/:wsId/traces/:file
        const wsTraceFileMatch = subPath.match(/^\/traces\/([^/]+)$/);
        if (wsTraceFileMatch) {
          const file = decodeURIComponent(wsTraceFileMatch[1]);
          return handleTraceDetail(xmRoot, file, req, url);
        }

        // GET /api/ws/:wsId/costs
        if (subPath === '/costs') {
          return handleCosts(xmRoot, req);
        }

        // GET /api/ws/:wsId/memory
        if (subPath === '/memory') {
          return handleMemoryList(xmRoot, url, req);
        }

        // GET /api/ws/:wsId/memory/:id
        const wsMemoryDetailMatch = subPath.match(/^\/memory\/([^/]+)$/);
        if (wsMemoryDetailMatch) {
          const id = decodeURIComponent(wsMemoryDetailMatch[1]);
          return handleMemoryDetail(xmRoot, id, req);
        }

        // GET /api/ws/:wsId/review/last
        if (subPath === '/review/last') {
          return handleReviewLast(xmRoot, req);
        }

        // GET /api/ws/:wsId/review/history/:file  (must come before /review/history)
        const wsReviewFileMatch = subPath.match(/^\/review\/history\/([^/]+)$/);
        if (wsReviewFileMatch) {
          const file = decodeURIComponent(wsReviewFileMatch[1]);
          return handleReviewHistoryFile(xmRoot, file, req);
        }

        // GET /api/ws/:wsId/review/history
        if (subPath === '/review/history') {
          return handleReviewHistory(xmRoot, req);
        }

        // GET /api/ws/:wsId/eval/:category/:file
        const wsEvalFileMatch = subPath.match(/^\/eval\/([^/]+)\/([^/]+)$/);
        if (wsEvalFileMatch) {
          const category = decodeURIComponent(wsEvalFileMatch[1]);
          const file = decodeURIComponent(wsEvalFileMatch[2]);
          return handleEvalFile(xmRoot, category, file, req);
        }

        // GET /api/ws/:wsId/eval
        if (subPath === '/eval') {
          return handleEvalList(xmRoot, req);
        }

        // GET /api/ws/:wsId/humble/:kind/:file
        const wsHumbleFileMatch = subPath.match(/^\/humble\/([^/]+)\/([^/]+)$/);
        if (wsHumbleFileMatch) {
          const kind = decodeURIComponent(wsHumbleFileMatch[1]);
          const file = decodeURIComponent(wsHumbleFileMatch[2]);
          return handleHumbleFile(xmRoot, kind, file, req);
        }

        // GET /api/ws/:wsId/humble
        if (subPath === '/humble') {
          return handleHumbleList(xmRoot, req);
        }

        // GET /api/ws/:wsId/session-state
        if (subPath === '/session-state') {
          return handleSessionState(xmRoot, req);
        }

        // GET /api/ws/:wsId/sync
        if (subPath === '/sync') {
          return handleSync(req);
        }

        return jsonResponseWithETag({ error: 'not_found' }, req, 404);
      }

      // ── Legacy unscoped routes (backward compatible) ──────────

      // GET /api/config
      if (path === '/api/config') {
        return handleConfig(XM_ROOT, req);
      }

      // GET /api/projects
      if (path === '/api/projects') {
        return handleProjects(XM_ROOT, req);
      }

      // GET /api/projects/:slug/tasks
      const tasksMatch = path.match(/^\/api\/projects\/([^/]+)\/tasks$/);
      if (tasksMatch) {
        const slug = decodeURIComponent(tasksMatch[1]);
        return handleProjectTasks(XM_ROOT, slug, req);
      }

      // GET /api/projects/:slug
      const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch) {
        const slug = decodeURIComponent(projectMatch[1]);
        return handleProjectDetail(XM_ROOT, slug, req);
      }

      // GET /api/probe/latest
      if (path === '/api/probe/latest') {
        return handleProbeLatest(XM_ROOT, req);
      }

      // GET /api/probe/diff?a=<file>&b=<file>
      if (path === '/api/probe/diff') {
        return handleProbeDiff(XM_ROOT, url, req);
      }

      // GET /api/probe/history/:file  (must come before /api/probe/history)
      const probeFileMatch = path.match(/^\/api\/probe\/history\/([^/]+)$/);
      if (probeFileMatch) {
        const file = decodeURIComponent(probeFileMatch[1]);
        return handleProbeHistoryFile(XM_ROOT, file, req);
      }

      // GET /api/probe/history
      if (path === '/api/probe/history') {
        return handleProbeHistory(XM_ROOT, req);
      }

      // GET /api/op
      if (path === '/api/op') {
        return handleOpList(XM_ROOT, req);
      }

      // GET /api/op/:file
      const opMatch = path.match(/^\/api\/op\/([^/]+)$/);
      if (opMatch) {
        const file = decodeURIComponent(opMatch[1]);
        return handleOpDetail(XM_ROOT, file, req);
      }

      // GET /api/solver
      if (path === '/api/solver') {
        return handleSolverList(XM_ROOT, req);
      }

      // GET /api/solver/:slug
      const solverMatch = path.match(/^\/api\/solver\/([^/]+)$/);
      if (solverMatch) {
        const slug = decodeURIComponent(solverMatch[1]);
        return handleSolverDetail(XM_ROOT, slug, req);
      }

      // GET /api/session-state
      if (path === '/api/session-state') {
        return handleSessionState(XM_ROOT, req);
      }

      // GET /api/search?q=keyword
      if (path === '/api/search') {
        return handleSearch(XM_ROOT, url, req);
      }

      // GET /api/metrics/sessions
      if (path === '/api/metrics/sessions') {
        return handleMetricsSessions(XM_ROOT, url, req);
      }

      // GET /api/traces
      if (path === '/api/traces') {
        return handleTraces(XM_ROOT, req);
      }

      // GET /api/traces/:file
      const tracesFileMatch = path.match(/^\/api\/traces\/([^/]+)$/);
      if (tracesFileMatch) {
        const file = decodeURIComponent(tracesFileMatch[1]);
        return handleTraceDetail(XM_ROOT, file, req, url);
      }

      // GET /api/costs
      if (path === '/api/costs') {
        return handleCosts(XM_ROOT, req);
      }

      // GET /api/memory
      if (path === '/api/memory') {
        return handleMemoryList(XM_ROOT, url, req);
      }

      // GET /api/memory/:id
      const memoryDetailMatch = path.match(/^\/api\/memory\/([^/]+)$/);
      if (memoryDetailMatch) {
        const id = decodeURIComponent(memoryDetailMatch[1]);
        return handleMemoryDetail(XM_ROOT, id, req);
      }

      // GET /api/review/last
      if (path === '/api/review/last') {
        return handleReviewLast(XM_ROOT, req);
      }

      // GET /api/review/history/:file  (must come before /api/review/history)
      const reviewFileMatch = path.match(/^\/api\/review\/history\/([^/]+)$/);
      if (reviewFileMatch) {
        const file = decodeURIComponent(reviewFileMatch[1]);
        return handleReviewHistoryFile(XM_ROOT, file, req);
      }

      // GET /api/review/history
      if (path === '/api/review/history') {
        return handleReviewHistory(XM_ROOT, req);
      }

      // GET /api/eval/:category/:file
      const evalFileMatch = path.match(/^\/api\/eval\/([^/]+)\/([^/]+)$/);
      if (evalFileMatch) {
        const category = decodeURIComponent(evalFileMatch[1]);
        const file = decodeURIComponent(evalFileMatch[2]);
        return handleEvalFile(XM_ROOT, category, file, req);
      }

      // GET /api/eval
      if (path === '/api/eval') {
        return handleEvalList(XM_ROOT, req);
      }

      // GET /api/humble/:kind/:file
      const humbleFileMatch = path.match(/^\/api\/humble\/([^/]+)\/([^/]+)$/);
      if (humbleFileMatch) {
        const kind = decodeURIComponent(humbleFileMatch[1]);
        const file = decodeURIComponent(humbleFileMatch[2]);
        return handleHumbleFile(XM_ROOT, kind, file, req);
      }

      // GET /api/humble
      if (path === '/api/humble') {
        return handleHumbleList(XM_ROOT, req);
      }

      // GET /api/sync
      if (path === '/api/sync') {
        return handleSync(req);
      }
    }

    // ── Static files ─────────────────────────────────────────────
    if (req.method === 'GET') {
      return serveStatic(path);
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

// ── Sync Handler ───────────────────────────────────────────────────

async function handleSync(req) {
  const syncConfigPath = join(homedir(), '.xm', 'sync.json');
  const syncStatePath = join(XM_ROOT, '.sync-state.json');

  // Read local config
  let config = { machine_id: null, server_url: null, api_key: null };
  try { config = JSON.parse(readFileSync(syncConfigPath, 'utf8')); } catch {}
  // Env overrides (same as sync-config.mjs)
  if (process.env.XM_SYNC_SERVER_URL) config.server_url = process.env.XM_SYNC_SERVER_URL;
  if (process.env.XM_SYNC_API_KEY) config.api_key = process.env.XM_SYNC_API_KEY;
  // Auto-detect co-located x-sync server (same container)
  if (!config.server_url && process.env.XM_SYNC_DATA_DIR) {
    config.server_url = 'http://localhost:19842';
    config.api_key = config.api_key || '';
  }

  // Read sync state
  let syncState = { last_pull: 0 };
  try { syncState = JSON.parse(readFileSync(syncStatePath, 'utf8')); } catch {}

  const configured = !!(config.server_url);
  const result = {
    configured,
    machine_id: config.machine_id || 'server',
    server_url: config.server_url ? config.server_url.replace(/\/+$/, '') : null,
    last_pull: syncState.last_pull || 0,
    server: null,
  };

  // Probe sync server
  if (configured) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${result.server_url}/dashboard/health`, {
        headers: config.api_key ? { 'X-Api-Key': config.api_key } : {},
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const health = await res.json();
        // Also fetch projects
        const projRes = await fetch(`${result.server_url}/dashboard/projects`, {
          headers: config.api_key ? { 'X-Api-Key': config.api_key } : {},
        });
        const projects = projRes.ok ? await projRes.json() : [];
        result.server = { ...health, projects };
      }
    } catch {}
  }

  return jsonResponseWithETag(result, req);
}

// ── Process Management ──────────────────────────────────────────────

function checkDuplicateInstance() {
  if (!existsSync(PID_FILE)) return;

  let existing;
  try {
    existing = JSON.parse(readFileSync(PID_FILE, 'utf8'));
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

writePIDFile();
resetIdleTimer();

// ── M2: Workspace initialization ─────────────────────────────────────
// Priority: --scan flag > ~/.xm/projects.json registry > scan_roots > single cwd mode
function loadProjectRegistry() {
  const path = join(homedir(), '.xm', 'projects.json');
  if (!existsSync(path)) return [];
  try {
    const obj = JSON.parse(readFileSync(path, 'utf8'));
    if (!obj || !Array.isArray(obj.projects)) return [];
    return obj.projects.filter((p) => !p.archived && existsSync(join(p.path, '.xm')));
  } catch {
    return [];
  }
}

if (SCAN_DIR) {
  workspaces = scanWorkspaces(resolve(SCAN_DIR));
  console.log(`[x-dashboard-server] Multi-root: ${workspaces.length} workspaces from ${SCAN_DIR}`);
} else {
  const registered = loadProjectRegistry();
  if (registered.length > 0) {
    workspaces = registered.map((p) => ({
      id: p.id,
      name: p.name || p.id,
      path: p.path,
      xmRoot: join(p.path, '.xm'),
    }));
    console.log(`[x-dashboard-server] Registry: ${workspaces.length} project(s) from ~/.xm/projects.json`);
  } else {
    // Legacy fallback: ~/.xm/config.json scan_roots
    const globalConfigPath = join(homedir(), '.xm', 'config.json');
    let scanRoots = null;
    try {
      const globalConfig = JSON.parse(readFileSync(globalConfigPath, 'utf8'));
      if (Array.isArray(globalConfig.scan_roots) && globalConfig.scan_roots.length > 0) {
        scanRoots = globalConfig.scan_roots;
      }
    } catch {}

    if (scanRoots) {
      workspaces = [];
      for (const root of scanRoots) {
        const resolved = resolve(root.replace(/^~/, homedir()));
        workspaces.push(...scanWorkspaces(resolved));
      }
      const seen = new Set();
      workspaces = workspaces.filter(w => {
        if (seen.has(w.xmRoot)) return false;
        seen.add(w.xmRoot);
        return true;
      });
      console.log(`[x-dashboard-server] Multi-root: ${workspaces.length} workspaces from scan_roots: ${scanRoots.join(', ')}`);
    } else {
      workspaces = [{ id: basename(process.cwd()), name: basename(process.cwd()), path: process.cwd(), xmRoot: XM_ROOT }];
      console.log('[x-dashboard-server] Single-project mode. Tip: run `x-kit project import` to register projects globally.');
    }
  }
}

const dashboardUrl = `http://127.0.0.1:${PORT}`;
console.log(`[x-dashboard-server] Started on ${dashboardUrl} (pid: ${process.pid})`);
console.log(`[x-dashboard-server] Serving static files from: ${PUBLIC_DIR}`);
console.log(`[x-dashboard-server] Mode: ${SESSION_MODE ? `session (idle timeout: ${SESSION_IDLE_TIMEOUT_MS / 60000}m)` : 'standalone'}`);
console.log(`[x-dashboard-server] PID file: ${PID_FILE}`);

// Skip browser open in test/CI environments or when NO_BROWSER is set
if (!process.env.NO_BROWSER && !process.env.CI && !process.env.BUN_TEST) {
  openBrowser(dashboardUrl);
}

// ── Helpers ─────────────────────────────────────────────────────────

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}
