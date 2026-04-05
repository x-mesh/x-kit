/**
 * sync-config.mjs — Sync configuration for x-kit cross-machine sync
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname } from 'node:os';
import { randomBytes } from 'node:crypto';

const SYNC_CONFIG_PATH = join(homedir(), '.xm', 'sync.json');

const DEFAULT_CONFIG = {
  machine_id: null,
  server_url: null,
  api_key: null,
};

/** Read sync config, auto-generate machine_id if missing.
 *  Environment variables override file values:
 *    XM_SYNC_SERVER_URL → server_url
 *    XM_SYNC_API_KEY    → api_key
 *    XM_SYNC_MACHINE_ID → machine_id
 */
export function readSyncConfig() {
  let config = { ...DEFAULT_CONFIG };
  try {
    config = { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(SYNC_CONFIG_PATH, 'utf8')) };
  } catch {}

  // Environment variable overrides
  if (process.env.XM_SYNC_SERVER_URL) config.server_url = process.env.XM_SYNC_SERVER_URL;
  if (process.env.XM_SYNC_API_KEY)    config.api_key = process.env.XM_SYNC_API_KEY;
  if (process.env.XM_SYNC_MACHINE_ID) config.machine_id = process.env.XM_SYNC_MACHINE_ID;

  if (!config.machine_id) {
    config.machine_id = `${hostname()}-${randomBytes(2).toString('hex')}`;
    writeSyncConfig(config);
  }
  return config;
}

/** Write sync config */
export function writeSyncConfig(config) {
  const dir = join(homedir(), '.xm');
  mkdirSync(dir, { recursive: true });
  writeFileSync(SYNC_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/** Get machine_id (auto-generates if needed) */
export function getMachineId() {
  return readSyncConfig().machine_id;
}

/** Check if sync is configured (has server_url + api_key) */
export function isSyncConfigured() {
  const config = readSyncConfig();
  return !!(config.server_url && config.api_key);
}
