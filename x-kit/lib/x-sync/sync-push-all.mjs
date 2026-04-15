#!/usr/bin/env node
/**
 * sync-push-all.mjs — Push all .xm/ projects under a root directory
 * Usage: node sync-push-all.mjs [--root ~/work] [--dry-run]
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { isSyncConfigured } from './sync-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUSH_SCRIPT = join(__dirname, 'sync-push.mjs');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ROOT = (() => {
  const idx = args.indexOf('--root');
  return resolve(idx !== -1 ? args[idx + 1] : join(process.env.HOME, 'work'));
})();

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.cache']);
const MAX_DEPTH = 4;

function findXmProjects(dir, depth = 0) {
  if (depth > MAX_DEPTH) return [];
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }

  for (const entry of entries) {
    if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    const xmPath = join(fullPath, '.xm');
    if (existsSync(xmPath) && statSync(xmPath).isDirectory()) {
      results.push({ path: fullPath, name: basename(fullPath) });
      continue; // don't recurse into projects
    }
    results.push(...findXmProjects(fullPath, depth + 1));
  }
  return results;
}

if (!isSyncConfigured()) {
  console.error('[sync-push-all] x-sync not configured.');
  console.error('  Run: x-sync setup    (configure server URL + API key)');
  console.error('  Or edit ~/.xm/sync.json directly.');
  process.exit(1);
}

const projects = findXmProjects(ROOT);

console.log(`[sync-push-all] Found ${projects.length} projects under ${ROOT}\n`);

if (projects.length === 0) {
  console.log('No .xm/ projects found.');
  process.exit(0);
}

for (const p of projects) {
  console.log(`  → ${p.name} (${p.path})`);
}

if (DRY_RUN) {
  console.log('\n[dry-run] No files pushed.');
  process.exit(0);
}

console.log('');

let success = 0;
let failed = 0;

for (const p of projects) {
  try {
    const output = execSync(`node "${PUSH_SCRIPT}"`, {
      cwd: p.path,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(output.trim());
    success++;
  } catch (e) {
    console.error(`[sync-push-all] ❌ ${p.name}: ${e.stderr?.trim() || e.message}`);
    failed++;
  }
}

console.log(`\n[sync-push-all] Done — ${success} pushed, ${failed} failed`);
