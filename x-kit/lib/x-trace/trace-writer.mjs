/**
 * trace-writer.mjs — Programmatic trace recording for x-kit CLI tools
 *
 * Usage:
 *   import { createSessionId, traceAppend, sessionStart, sessionEnd, agentStep } from './x-trace/trace-writer.mjs';
 */

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';

const TRACE_DIR_NAME = 'traces';

/** Resolve .xm/traces/ directory — worktree-aware */
function resolveTraceDir() {
  // Check for XM_ROOT env var first
  if (process.env.XM_ROOT) {
    return join(process.env.XM_ROOT, TRACE_DIR_NAME);
  }
  // Check local .xm/
  const local = resolve(process.cwd(), '.xm', TRACE_DIR_NAME);
  if (existsSync(resolve(process.cwd(), '.xm'))) return local;
  // Worktree fallback
  try {
    const commonDir = execSync('git rev-parse --git-common-dir', {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const mainXm = resolve(process.cwd(), commonDir, '..', '.xm');
    if (existsSync(mainXm)) return join(mainXm, TRACE_DIR_NAME);
  } catch {}
  return local;
}

/** Generate session ID: {skill}-{YYYYMMDD}-{HHMMSS}-{4hex} */
export function createSessionId(skill) {
  const now = new Date();
  const date = now.toISOString().replace(/[-:T]/g, '').slice(0, 8);
  const time = now.toISOString().replace(/[-:T]/g, '').slice(8, 14);
  const rand = randomBytes(2).toString('hex');
  return `${skill}-${date}-${time}-${rand}`;
}

/** Append a single JSONL line — never throws */
export function traceAppend(sessionId, entry) {
  try {
    const traceDir = resolveTraceDir();
    mkdirSync(traceDir, { recursive: true });
    const filePath = join(traceDir, `${sessionId}.jsonl`);
    const line = JSON.stringify({ ...entry, session_id: sessionId, ts: new Date().toISOString(), v: 1 });
    appendFileSync(filePath, line + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`[x-trace] write failed: ${err.message}\n`);
  }
}

/** Convenience: write session_start */
export function sessionStart(sessionId, skill, args = {}) {
  traceAppend(sessionId, { type: 'session_start', skill, args });
}

/** Convenience: write session_end */
export function sessionEnd(sessionId, { totalDurationMs = 0, agentCount = 0, status = 'success', tokensEstTotal = null } = {}) {
  const entry = { type: 'session_end', total_duration_ms: totalDurationMs, agent_count: agentCount, status };
  if (tokensEstTotal) entry.tokens_est_total = { ...tokensEstTotal, precision: 'estimate' };
  traceAppend(sessionId, entry);
}

/** Convenience: write agent_step */
export function agentStep(sessionId, { id, parentId = null, role, model, tokensEst = null, durationMs = 0, status = 'success', error = null } = {}) {
  const entry = { type: 'agent_step', id, parent_id: parentId, role, model, duration_ms: durationMs, status };
  if (tokensEst) entry.tokens_est = { ...tokensEst, precision: 'estimate' };
  if (error) entry.error = error;
  traceAppend(sessionId, entry);
}
