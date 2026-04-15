#!/usr/bin/env node
/**
 * sync-push.mjs — Push .xm/ data to x-sync server
 * Usage: node sync-push.mjs [--project PROJECT_ID]
 */

import { readFileSync, readdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readSyncConfig, getMachineId } from './sync-config.mjs';

// Resolve .xm/ directory (worktree-aware — same logic as shared-config.mjs)
function resolveXmDir() {
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

// Recursively scan .xm/ for syncable files
// Include: traces/*.jsonl, op/*.json, probe/**/*.json, build/projects/**/*, solver/**/*
// Exclude: .sync-queue/, run/, config.json.bak, *.tmp
function scanXmFiles(xmDir) {
  const files = [];
  const SKIP = new Set(['run', '.sync-queue', 'node_modules']);
  const EXCLUDE_FILES = new Set(['config.json']); // per-machine local settings

  function walk(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.active') continue;
      if (entry.name.endsWith('.tmp') || entry.name.endsWith('.bak')) continue;
      if (EXCLUDE_FILES.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const content = readFileSync(fullPath, 'utf8');
        const hash = createHash('sha256').update(content).digest('hex');
        files.push({ path: relPath, content, hash });
      }
    }
  }

  walk(xmDir, '');
  return files;
}

// Drain .sync-queue if exists
function drainQueue(xmDir) {
  const queueDir = join(xmDir, '.sync-queue');
  if (!existsSync(queueDir)) return [];
  const queued = [];
  for (const f of readdirSync(queueDir).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      queued.push(JSON.parse(readFileSync(join(queueDir, f), 'utf8')));
      // Delete after reading
      unlinkSync(join(queueDir, f));
    } catch {}
  }
  return queued;
}

// Main
async function main() {
  const config = readSyncConfig();
  if (!config.server_url || !config.api_key) {
    console.error('x-sync not configured. Run: x-sync setup  (or edit ~/.xm/sync.json)');
    process.exit(1);
  }

  const xmDir = resolveXmDir();
  if (!existsSync(xmDir)) {
    console.error('No .xm/ directory found.');
    process.exit(1);
  }

  const projectId = process.argv.includes('--project')
    ? process.argv[process.argv.indexOf('--project') + 1]
    : basename(resolve(xmDir, '..'));

  const machineId = getMachineId();
  const files = scanXmFiles(xmDir);

  console.log(`[x-sync push] ${files.length} files from ${projectId} (${machineId})`);

  if (files.length === 0) {
    console.log('[x-sync push] Nothing to push.');
    return;
  }

  try {
    const res = await fetch(`${config.server_url}/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.api_key,
      },
      body: JSON.stringify({ machine_id: machineId, project_id: projectId, files }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[x-sync push] Server error ${res.status}: ${err}`);
      process.exit(1);
    }

    const result = await res.json();
    console.log(`[x-sync push] accepted: ${result.accepted}, skipped: ${result.skipped}`);
  } catch (err) {
    console.error(`[x-sync push] Failed: ${err.message}`);
    // Queue for later
    // (queue implementation is in t4 — SessionEnd hook)
    process.exit(1);
  }
}

main();
