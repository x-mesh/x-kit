/**
 * shared-config.mjs — Shared config utilities for x-kit tools
 * Provides read/write access to .xm/config.json for x-build, x-solver, x-op.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

// ── Defaults ──────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  mode: 'developer',
  agent_max_count: 4,
  pipelines: {},
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

// ── Interactive Config ──────────────────────────────────────────────

const C = {
  bold: '\x1b[1m', dim: '\x1b[2m', reset: '\x1b[0m',
  green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', red: '\x1b[31m',
};

// Keys that default to local (.xm/) instead of global (~/.xm/)
const LOCAL_DEFAULT_KEYS = new Set(['budget']);

function resolveScope(key, opts) {
  if (opts.local) return { global: false };
  if (opts.global) return { global: true };
  // budget defaults to local, everything else to global
  if (LOCAL_DEFAULT_KEYS.has(key?.split('.')[0])) return { global: false };
  return { global: true };
}

function createRL() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function setNestedKey(obj, key, value) {
  const parts = key.split('.');
  const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
  if (parts.some(p => forbidden.has(p))) throw new Error(`Invalid config key: ${key}`);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function getNestedKey(obj, key) {
  return key.split('.').reduce((o, k) => o?.[k], obj);
}

/**
 * cmdConfig — Interactive and CLI config management.
 *
 * Usage:
 *   cmdConfig([])                    → interactive wizard
 *   cmdConfig(['show'])              → show current config
 *   cmdConfig(['set', key, value])   → set a key
 *   cmdConfig(['get', key])          → get a key
 *   cmdConfig(['reset'])             → reset to defaults
 *
 * Flags: --local (project .xm/), --global (~/.xm/)
 * Default scope: global (except budget → local)
 */
export async function cmdConfig(args = [], flags = {}) {
  const sub = args[0];

  if (!sub) return interactiveConfig(flags);
  if (sub === 'show') return showConfig(flags);
  if (sub === 'get' && args[1]) return getConfig(args[1], flags);
  if (sub === 'set' && args[1] != null && args[2] != null) return setConfig(args[1], args[2], flags);
  if (sub === 'reset') return resetConfig(flags);

  console.log(`${C.red}Unknown config command: ${sub}${C.reset}`);
  console.log(`Usage: config [show|set <key> <value>|get <key>|reset]`);
}

function showConfig(flags) {
  const globalCfg = readSharedConfig({ global: true });
  const localPath = join(resolveSharedRoot(), 'config.json');
  const localCfg = readJSON(localPath);

  console.log(`\n${C.bold}⚙️  x-kit 설정${C.reset}\n`);

  console.log(`${C.dim}Global (~/.xm/config.json):${C.reset}`);
  const globalPath = join(homedir(), '.xm', 'config.json');
  const rawGlobal = readJSON(globalPath) ?? {};
  if (Object.keys(rawGlobal).length === 0) {
    console.log(`  ${C.dim}(설정 없음 — 기본값 사용)${C.reset}`);
  } else {
    for (const [k, v] of Object.entries(rawGlobal)) {
      console.log(`  ${C.cyan}${k}${C.reset}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
  }

  console.log(`\n${C.dim}Local (.xm/config.json):${C.reset}`);
  if (!localCfg || Object.keys(localCfg).length === 0) {
    console.log(`  ${C.dim}(설정 없음)${C.reset}`);
  } else {
    for (const [k, v] of Object.entries(localCfg)) {
      console.log(`  ${C.cyan}${k}${C.reset}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
  }

  console.log(`\n${C.dim}Effective (merged):${C.reset}`);
  const effective = readSharedConfig();
  for (const [k, v] of Object.entries(effective)) {
    console.log(`  ${C.cyan}${k}${C.reset}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
  console.log('');
}

function getConfig(key, flags) {
  const config = readSharedConfig(resolveScope(key, flags));
  const val = getNestedKey(config, key);
  if (val === undefined) {
    console.log(`${C.dim}(not set)${C.reset}`);
  } else {
    console.log(typeof val === 'object' ? JSON.stringify(val, null, 2) : val);
  }
}

function setConfig(key, rawValue, flags) {
  let value = rawValue;
  // Parse JSON values
  if (rawValue.startsWith('{') || rawValue.startsWith('[')) {
    try { value = JSON.parse(rawValue); } catch { /* keep as string */ }
  } else if (rawValue === 'true') value = true;
  else if (rawValue === 'false') value = false;
  else if (rawValue.trim() !== '' && !isNaN(rawValue) && isFinite(Number(rawValue))) value = Number(rawValue);

  const scope = resolveScope(key, flags);
  const root = resolveSharedRoot(scope);
  const configPath = join(root, 'config.json');
  const existing = readJSON(configPath) ?? {};
  setNestedKey(existing, key, value);
  writeJSONAtomic(configPath, existing);

  const scopeLabel = scope.global ? 'global' : 'local';
  console.log(`${C.green}✅${C.reset} ${C.cyan}${key}${C.reset} = ${typeof value === 'object' ? JSON.stringify(value) : value} ${C.dim}(${scopeLabel})${C.reset}`);
}

function resetConfig(flags) {
  const scope = flags.local ? {} : { global: true };
  const root = resolveSharedRoot(scope);
  const configPath = join(root, 'config.json');
  writeJSONAtomic(configPath, {});
  const scopeLabel = scope.global ? 'global' : 'local';
  console.log(`${C.green}✅${C.reset} 설정 초기화 완료 ${C.dim}(${scopeLabel})${C.reset}`);
}

async function interactiveConfig(flags) {
  const rl = createRL();
  const config = readSharedConfig({ global: true });

  console.log(`\n${C.bold}⚙️  x-kit 설정${C.reset}\n`);
  console.log(`  모델 프로필: ${C.cyan}${config.model_profile || 'balanced'}${C.reset}`);
  console.log(`  에이전트 수: ${C.cyan}${config.agent_max_count ?? 4}${C.reset}`);
  console.log(`  예산 한도:   ${C.cyan}${config.budget?.max_usd ? '$' + config.budget.max_usd : '없음'}${C.reset}`);
  console.log(`  모드:        ${C.cyan}${config.mode || 'developer'}${C.reset}`);

  console.log(`\n  설정할 항목을 선택하세요:\n`);
  console.log(`  ${C.bold}1)${C.reset} 모델 프로필     economy / balanced / performance`);
  console.log(`  ${C.bold}2)${C.reset} 예산 한도       세션당 최대 비용 ($)`);
  console.log(`  ${C.bold}3)${C.reset} 에이전트 수     병렬 에이전트 수 (1-10)`);
  console.log(`  ${C.bold}4)${C.reset} 모드            developer / normal`);
  console.log(`  ${C.bold}5)${C.reset} 역할별 오버라이드`);
  console.log(`  ${C.bold}0)${C.reset} 나가기\n`);

  try {
    const choice = (await ask(rl, '  선택: ')).trim();

    if (choice === '1') await configProfile(rl, config);
    else if (choice === '2') await configBudget(rl, config);
    else if (choice === '3') await configAgentCount(rl, config);
    else if (choice === '4') await configMode(rl, config);
    else if (choice === '5') await configOverrides(rl, config);
  } finally {
    rl.close();
  }
}

async function configProfile(rl, config) {
  const current = config.model_profile || 'balanced';
  console.log(`\n  모델 프로필을 선택하세요:\n`);
  console.log(`  ${C.bold}1)${C.reset} economy      — 저렴 (architect:sonnet, executor:haiku) ~60-70% 절감`);
  console.log(`  ${C.bold}2)${C.reset} balanced     — 기본 (architect:opus, executor:sonnet)${current === 'balanced' ? ` ${C.green}← 현재${C.reset}` : ''}`);
  console.log(`  ${C.bold}3)${C.reset} performance  — 강력 (architect:opus, executor:opus) 2-5x 비용\n`);

  const ch = (await ask(rl, '  선택: ')).trim();
  const profiles = { '1': 'economy', '2': 'balanced', '3': 'performance' };
  const profile = profiles[ch];
  if (!profile) { console.log(`  ${C.dim}취소됨${C.reset}`); return; }

  writeSharedConfig('model_profile', profile, { global: true });
  console.log(`  ${C.green}✅${C.reset} 모델 프로필: ${current} → ${C.cyan}${profile}${C.reset} ${C.dim}(global)${C.reset}`);
}

async function configBudget(rl, config) {
  const current = config.budget?.max_usd;
  const prompt = current ? `  세션 예산 ($, 0=무제한) [현재: $${current}]: ` : '  세션 예산 ($, 0=무제한): ';
  const input = (await ask(rl, prompt)).trim();

  if (!input) { console.log(`  ${C.dim}변경 없음${C.reset}`); return; }
  const val = Number(input);
  if (isNaN(val)) { console.log(`  ${C.red}숫자를 입력하세요${C.reset}`); return; }

  const budget = val <= 0 ? null : val;
  // budget defaults to local scope
  writeSharedConfig('budget', { max_usd: budget }, { global: false });
  console.log(`  ${C.green}✅${C.reset} 예산 한도: ${budget ? '$' + budget.toFixed(2) : '무제한'} ${C.dim}(local)${C.reset}`);
}

async function configAgentCount(rl, config) {
  const current = config.agent_max_count ?? 4;
  const input = (await ask(rl, `  에이전트 수 (1-10) [현재: ${current}]: `)).trim();

  if (!input) { console.log(`  ${C.dim}변경 없음${C.reset}`); return; }
  const val = Number(input);
  if (isNaN(val) || val < 1 || val > 10 || !Number.isInteger(val)) {
    console.log(`  ${C.red}1-10 사이 정수를 입력하세요${C.reset}`); return;
  }

  writeSharedConfig('agent_max_count', val, { global: true });
  console.log(`  ${C.green}✅${C.reset} 에이전트 수: ${current} → ${C.cyan}${val}${C.reset} ${C.dim}(global)${C.reset}`);
}

async function configMode(rl, config) {
  const current = config.mode || 'developer';
  console.log(`\n  모드를 선택하세요:\n`);
  console.log(`  ${C.bold}1)${C.reset} developer  — 기술 용어, 간결${current === 'developer' ? ` ${C.green}← 현재${C.reset}` : ''}`);
  console.log(`  ${C.bold}2)${C.reset} normal     — 쉬운 한국어${current === 'normal' ? ` ${C.green}← 현재${C.reset}` : ''}\n`);

  const ch = (await ask(rl, '  선택: ')).trim();
  const modes = { '1': 'developer', '2': 'normal' };
  const mode = modes[ch];
  if (!mode) { console.log(`  ${C.dim}취소됨${C.reset}`); return; }

  writeSharedConfig('mode', mode, { global: true });
  console.log(`  ${C.green}✅${C.reset} 모드: ${current} → ${C.cyan}${mode}${C.reset} ${C.dim}(global)${C.reset}`);
}

async function configOverrides(rl, config) {
  const roles = ['architect', 'reviewer', 'security', 'executor', 'designer', 'debugger', 'explorer', 'writer'];
  const models = ['haiku', 'sonnet', 'opus'];
  const current = config.model_overrides || {};

  console.log(`\n  역할별 모델 오버라이드 (프로필 위에 적용):\n`);
  for (const role of roles) {
    const override = current[role];
    console.log(`  ${role.padEnd(12)} ${override ? `${C.yellow}${override}${C.reset}` : `${C.dim}(프로필 기본)${C.reset}`}`);
  }

  console.log(`\n  형식: role=model (예: architect=opus)  /  clear로 초기화  /  Enter로 나가기\n`);

  while (true) {
    const input = (await ask(rl, '  > ')).trim();
    if (!input) break;
    if (input === 'clear') {
      writeSharedConfig('model_overrides', {}, { global: true });
      console.log(`  ${C.green}✅${C.reset} 오버라이드 초기화 ${C.dim}(global)${C.reset}`);
      break;
    }
    const [role, model] = input.split('=').map(s => s.trim());
    if (!roles.includes(role)) { console.log(`  ${C.red}알 수 없는 역할: ${role}${C.reset}`); continue; }
    if (!models.includes(model)) { console.log(`  ${C.red}모델: haiku, sonnet, opus 중 선택${C.reset}`); continue; }

    const overrides = { ...(readSharedConfig({ global: true }).model_overrides || {}), [role]: model };
    writeSharedConfig('model_overrides', overrides, { global: true });
    console.log(`  ${C.green}✅${C.reset} ${role} → ${C.cyan}${model}${C.reset} ${C.dim}(global)${C.reset}`);
  }
}
