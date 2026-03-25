/**
 * shared-config.mjs — Shared config utilities for xm-kit tools
 * Provides read/write access to .xm/config.json for xm-build, xm-solver, xm-op.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

// ── Defaults ──────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  mode: 'developer',
  agent_max_count: 4,
};

// ── Internal helpers ──────────────────────────────────────────────────

function readJSON(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJSONAtomic(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, filePath);
}

function mergeWithDefaults(data) {
  return {
    ...DEFAULT_CONFIG,
    ...data,
  };
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Resolve the .xm/ root directory.
 * Priority: XM_ROOT env var → opts.global (~/.xm/) → cwd/.xm/
 */
export function resolveSharedRoot(opts = {}) {
  if (process.env.XM_ROOT) {
    return process.env.XM_ROOT;
  }
  if (opts.global) {
    return join(homedir(), '.xm');
  }
  return join(process.cwd(), '.xm');
}

/**
 * Read .xm/config.json and merge with defaults.
 * Fallback chain: project (.xm/) → global (~/.xm/) → defaults.
 * Pass opts.global to force reading from ~/.xm/ only.
 */
export function readSharedConfig(opts = {}) {
  const root = resolveSharedRoot(opts);
  const configPath = join(root, 'config.json');
  let raw = readJSON(configPath);

  // Fallback to global config if project config not found
  if (!raw && !opts.global && !process.env.XM_ROOT) {
    const globalPath = join(homedir(), '.xm', 'config.json');
    raw = readJSON(globalPath);
  }

  return mergeWithDefaults(raw ?? {});
}

/**
 * Set a single key in .xm/config.json.
 * Reads existing config, sets key, writes back atomically.
 */
export function writeSharedConfig(key, value, opts = {}) {
  const root = resolveSharedRoot(opts);
  const configPath = join(root, 'config.json');
  const existing = readJSON(configPath) ?? {};
  existing[key] = value;
  writeJSONAtomic(configPath, existing);
}

/**
 * Read a single key from .xm/config.json (with defaults applied).
 */
export function getSharedValue(key, opts = {}) {
  const config = readSharedConfig(opts);
  return config[key];
}

/**
 * Get the maximum agent count.
 * Reads agent_max_count from config. Default: 4.
 */
export function getAgentCount(opts = {}) {
  const config = readSharedConfig(opts);
  return config.agent_max_count ?? 4;
}

/**
 * Shorthand for getSharedValue('mode'). Defaults to 'developer'.
 */
export function getMode(opts = {}) {
  return getSharedValue('mode', opts) ?? 'developer';
}
