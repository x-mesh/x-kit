/**
 * x-projects-registry.mjs — machine-local project registry at ~/.xm/projects.json
 *
 * Schema:
 *   {
 *     "version": 1,
 *     "updated_at": "ISO8601",
 *     "projects": [
 *       { "id": "<basename>", "path": "<canonical>", "name": "<display>",
 *         "added_at": "ISO8601", "last_seen": "ISO8601",
 *         "tags": [], "archived": false }
 *     ]
 *   }
 *
 * Identity: canonical project path. Worktrees of the same repo collapse to the
 * main working tree path so they register as a single entry.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, renameSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, basename, dirname } from 'node:path';
import { execSync } from 'node:child_process';

export const REGISTRY_PATH = join(homedir(), '.xm', 'projects.json');
const SCHEMA_VERSION = 1;

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg',
  'dist', 'build', 'target', 'out', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', '.tox',
  '.cache', '.claude', '.xm',
]);

function nowIso() { return new Date().toISOString(); }

function emptyRegistry() {
  return { version: SCHEMA_VERSION, updated_at: nowIso(), projects: [] };
}

export function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return emptyRegistry();
  try {
    const obj = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.projects)) return emptyRegistry();
    if (obj.version !== SCHEMA_VERSION) return emptyRegistry();
    return obj;
  } catch {
    return emptyRegistry();
  }
}

export function saveRegistry(reg) {
  reg.updated_at = nowIso();
  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  const tmp = REGISTRY_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(reg, null, 2) + '\n');
  renameSync(tmp, REGISTRY_PATH);
}

/**
 * Resolve the canonical project path for `cwd`.
 * If cwd is a git worktree, returns the main worktree path. Otherwise returns cwd.
 */
export function resolveCanonicalPath(cwd) {
  const abs = resolve(cwd);
  try {
    const commonDir = execSync('git rev-parse --git-common-dir', {
      cwd: abs, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const absCommon = resolve(abs, commonDir);
    if (basename(absCommon) === '.git') {
      return dirname(absCommon);
    }
  } catch { /* not in a git repo */ }
  return abs;
}

/**
 * Detect whether `cwd` (or its main repo) owns a .xm/.
 * Returns the canonical project path that owns the .xm/, or null.
 */
export function detectXmOwner(cwd) {
  const canonical = resolveCanonicalPath(cwd);
  if (existsSync(join(canonical, '.xm'))) return canonical;
  const abs = resolve(cwd);
  if (abs !== canonical && existsSync(join(abs, '.xm'))) return abs;
  return null;
}

function findEntry(reg, path) {
  return reg.projects.find((p) => p.path === path) || null;
}

/**
 * Idempotent register: bumps last_seen if entry exists; inserts otherwise.
 * Skips when no .xm/ is reachable from cwd.
 */
export function registerProject(cwd, opts = {}) {
  const owner = detectXmOwner(cwd);
  if (!owner) return { action: 'skipped', reason: 'no .xm/' };

  const reg = loadRegistry();
  const existing = findEntry(reg, owner);
  if (existing) {
    existing.last_seen = nowIso();
    if (opts.unarchive && existing.archived) existing.archived = false;
    saveRegistry(reg);
    return { action: 'updated', entry: existing };
  }

  const entry = {
    id: opts.id || basename(owner),
    path: owner,
    name: opts.name || basename(owner),
    added_at: nowIso(),
    last_seen: nowIso(),
    tags: opts.tags || [],
    archived: false,
  };
  reg.projects.push(entry);
  saveRegistry(reg);
  return { action: 'added', entry };
}

export function removeProject(idOrPath) {
  const reg = loadRegistry();
  const before = reg.projects.length;
  reg.projects = reg.projects.filter((p) => p.id !== idOrPath && p.path !== idOrPath);
  if (reg.projects.length === before) return { action: 'not_found' };
  saveRegistry(reg);
  return { action: 'removed', count: before - reg.projects.length };
}

export function archiveProject(idOrPath, archived = true) {
  const reg = loadRegistry();
  const entry = reg.projects.find((p) => p.id === idOrPath || p.path === idOrPath);
  if (!entry) return { action: 'not_found' };
  entry.archived = archived;
  saveRegistry(reg);
  return { action: 'archived', entry };
}

/** Drop entries whose path no longer exists or has no .xm/. */
export function gcRegistry({ dryRun = false } = {}) {
  const reg = loadRegistry();
  const stale = [];
  const kept = [];
  for (const p of reg.projects) {
    if (existsSync(join(p.path, '.xm'))) kept.push(p);
    else stale.push(p);
  }
  if (!dryRun && stale.length > 0) {
    reg.projects = kept;
    saveRegistry(reg);
  }
  return { stale, kept };
}

/** Recursively scan rootDir for `.xm/` projects, collapsing worktrees. */
export function scanForProjects(rootDir, maxDepth = 4) {
  const results = new Set();
  const root = resolve(rootDir);

  function visit(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      const xmPath = join(fullPath, '.xm');
      if (existsSync(xmPath)) {
        try {
          if (statSync(xmPath).isDirectory()) {
            const canonical = resolveCanonicalPath(fullPath);
            results.add(existsSync(join(canonical, '.xm')) ? canonical : fullPath);
            continue;
          }
        } catch { /* skip */ }
      }
      visit(fullPath, depth + 1);
    }
  }

  if (existsSync(join(root, '.xm'))) {
    const canonical = resolveCanonicalPath(root);
    results.add(existsSync(join(canonical, '.xm')) ? canonical : root);
  } else {
    visit(root, 1);
  }
  return [...results];
}

export function importProjects(rootDir, { depth = 4, dryRun = false } = {}) {
  const found = scanForProjects(rootDir, depth);
  const summary = { added: [], updated: [], total: found.length };
  if (dryRun) {
    summary.dryRun = true;
    summary.found = found;
    return summary;
  }
  for (const path of found) {
    const result = registerProject(path);
    if (result.action === 'added') summary.added.push(result.entry);
    else if (result.action === 'updated') summary.updated.push(result.entry);
  }
  return summary;
}
