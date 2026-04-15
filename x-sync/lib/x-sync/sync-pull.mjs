#!/usr/bin/env node
/**
 * sync-pull.mjs — Pull .xm/ data from x-sync server
 * Usage: node sync-pull.mjs [--project PROJECT_ID] [--since TIMESTAMP]
 *
 * Multi-user merge strategy:
 *   - Unique-path files (traces, op, probe): overwrite (no conflict possible)
 *   - Shared-path files (manifest.json etc): machine-namespaced on pull
 *     e.g. manifest.json → manifest.{machine_id}.json
 *   - config.json: excluded from sync (per-machine local preference)
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { readSyncConfig } from './sync-config.mjs';

// Files excluded from sync (per-machine local settings)
const SYNC_EXCLUDE = new Set(['config.json']);

// Convert path to machine-namespaced: "dir/file.json" → "dir/file.{machineId}.json"
function namespacePath(filePath, machineId) {
  const ext = extname(filePath);
  if (ext) {
    return filePath.slice(0, -ext.length) + '.' + machineId + ext;
  }
  return filePath + '.' + machineId;
}

// Resolve .xm/ (same as sync-push)
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

// Read last pull timestamp from .xm/.sync-state.json
function readLastPull(xmDir) {
  const statePath = join(xmDir, '.sync-state.json');
  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    return state.last_pull ?? 0;
  } catch {
    return 0;
  }
}

// Save last pull timestamp
function saveLastPull(xmDir, serverTime) {
  const statePath = join(xmDir, '.sync-state.json');
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ last_pull: serverTime }) + '\n', 'utf8');
}

async function main() {
  const config = readSyncConfig();
  if (!config.server_url || !config.api_key) {
    console.error('x-sync not configured. Run: x-sync setup  (or edit ~/.xm/sync.json)');
    process.exit(1);
  }

  const xmDir = resolveXmDir();
  const projectId = process.argv.includes('--project')
    ? process.argv[process.argv.indexOf('--project') + 1]
    : basename(resolve(xmDir, '..'));

  // Since: CLI flag > last pull state > 0
  let since = 0;
  if (process.argv.includes('--since')) {
    since = parseInt(process.argv[process.argv.indexOf('--since') + 1], 10);
  } else {
    since = readLastPull(xmDir);
  }

  console.log(`[x-sync pull] project=${projectId} since=${since ? new Date(since).toISOString() : 'all'}`);

  try {
    const url = `${config.server_url}/sync/pull?project_id=${encodeURIComponent(projectId)}&since=${since}`;
    const res = await fetch(url, {
      headers: { 'X-Api-Key': config.api_key },
    });

    if (!res.ok) {
      console.error(`[x-sync pull] Server error ${res.status}`);
      process.exit(1);
    }

    const data = await res.json();
    const files = data.files ?? [];

    if (files.length === 0) {
      console.log('[x-sync pull] Already up to date.');
    } else {
      // Group files by path to detect shared paths (multiple machines → same path)
      const byPath = new Map();
      for (const f of files) {
        if (f.machine_id === config.machine_id) continue; // skip own
        if (SYNC_EXCLUDE.has(f.path) || SYNC_EXCLUDE.has(basename(f.path))) continue; // skip excluded
        if (!byPath.has(f.path)) byPath.set(f.path, []);
        byPath.get(f.path).push(f);
      }

      let written = 0;
      let namespaced = 0;
      const skippedOwn = files.filter(f => f.machine_id === config.machine_id).length;
      const skippedExcluded = files.filter(f =>
        f.machine_id !== config.machine_id &&
        (SYNC_EXCLUDE.has(f.path) || SYNC_EXCLUDE.has(basename(f.path)))
      ).length;

      for (const [path, versions] of byPath) {
        const localExists = existsSync(join(xmDir, path));
        const needsNamespace = versions.length > 1 || localExists;

        if (!needsNamespace) {
          // Single remote, no local file — write directly
          const f = versions[0];
          const targetPath = join(xmDir, f.path);
          mkdirSync(dirname(targetPath), { recursive: true });
          writeFileSync(targetPath, f.content, 'utf8');
          written++;
        } else {
          // Multiple machines or local exists — namespace by machine_id
          for (const f of versions) {
            const targetPath = join(xmDir, namespacePath(f.path, f.machine_id));
            mkdirSync(dirname(targetPath), { recursive: true });
            writeFileSync(targetPath, f.content, 'utf8');
            written++;
            namespaced++;
          }
        }
      }

      const parts = [`${written} files written`];
      if (namespaced > 0) parts.push(`${namespaced} namespaced`);
      if (skippedOwn > 0) parts.push(`${skippedOwn} skipped (own machine)`);
      if (skippedExcluded > 0) parts.push(`${skippedExcluded} excluded`);
      console.log(`[x-sync pull] ${parts.join(', ')}`);
    }

    // Save server_time for next pull
    if (data.server_time) {
      saveLastPull(xmDir, data.server_time);
    }
  } catch (err) {
    console.error(`[x-sync pull] Failed: ${err.message}`);
    process.exit(1);
  }
}

main();
