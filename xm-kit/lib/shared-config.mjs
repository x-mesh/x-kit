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
  agent_level: 'medium',
  agent_profiles: {
    min:    { max_agents: 2, description: '최소 에이전트, 토큰 절약' },
    medium: { max_agents: 4, description: '균형 (기본값)' },
    max:    { max_agents: 8, description: '최대 병렬, 토큰 무제한' },
  },
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
    agent_profiles: {
      ...DEFAULT_CONFIG.agent_profiles,
      ...(data?.agent_profiles ?? {}),
    },
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
 * Resolve agent_level to actual max_agents number.
 * 'min' → 2, 'medium' → 4, 'max' → 8
 */
export function getAgentCount(opts = {}) {
  const config = readSharedConfig(opts);
  const level = config.agent_level ?? 'medium';
  const profiles = config.agent_profiles ?? DEFAULT_CONFIG.agent_profiles;
  const profile = profiles[level] ?? profiles['medium'];
  return profile.max_agents;
}

/**
 * Shorthand for getSharedValue('mode'). Defaults to 'developer'.
 */
export function getMode(opts = {}) {
  return getSharedValue('mode', opts) ?? 'developer';
}
