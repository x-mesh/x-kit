#!/usr/bin/env node
// .claude/hooks/trace-session.mjs
//
// Auto-record session_start (PreToolUse) and session_end (PostToolUse) for x-kit skills.
// Semantic trace entries (agent_call, fan_out, etc.) remain LLM best-effort via SKILL.md.
//
// Usage in settings.json:
//   PreToolUse  → node trace-session.mjs pre
//   PostToolUse → node trace-session.mjs post

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TRACED_PREFIXES = ['x-kit:x-'];

function isTracedSkill(skill) {
  return TRACED_PREFIXES.some((p) => skill.startsWith(p));
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

function pad2(n) { return String(n).padStart(2, '0'); }

function makeSessionId(skillName) {
  const now = new Date();
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const hex = crypto.randomBytes(2).toString('hex');
  return `${skillName}-${date}-${time}-${hex}`;
}

async function main() {
  const phase = process.argv[2]; // 'pre' or 'post'
  if (!phase) process.exit(0);

  let input;
  try {
    const raw = await readStdin();
    input = raw ? JSON.parse(raw) : {};
  } catch {
    process.exit(0);
  }

  const skill = input.tool_input?.skill;
  if (typeof skill !== 'string' || !isTracedSkill(skill)) {
    process.exit(0);
  }

  const projectRoot = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const tracesDir = path.join(projectRoot, '.xm', 'traces');
  const activeFile = path.join(tracesDir, '.active');
  const skillName = skill.replace('x-kit:', '');

  try {
    if (phase === 'pre') {
      const sessionId = makeSessionId(skillName);
      fs.mkdirSync(tracesDir, { recursive: true });

      const entry = JSON.stringify({
        type: 'session_start',
        session_id: sessionId,
        ts: new Date().toISOString(),
        v: 1,
        skill: skillName,
        args: input.tool_input?.args || '',
      });

      fs.appendFileSync(path.join(tracesDir, `${sessionId}.jsonl`), entry + '\n');
      fs.writeFileSync(activeFile, sessionId);

    } else if (phase === 'post') {
      if (!fs.existsSync(activeFile)) process.exit(0);

      const sessionId = fs.readFileSync(activeFile, 'utf8').trim();
      if (!sessionId) process.exit(0);

      const traceFile = path.join(tracesDir, `${sessionId}.jsonl`);
      if (!fs.existsSync(traceFile)) process.exit(0);

      // Read session_start to calculate duration
      let durationMs = 0;
      try {
        const first = fs.readFileSync(traceFile, 'utf8').split('\n')[0];
        const start = JSON.parse(first);
        durationMs = Date.now() - new Date(start.ts).getTime();
      } catch { /* best-effort */ }

      // Count agent_step entries for agent_count
      let agentCount = 0;
      try {
        const lines = fs.readFileSync(traceFile, 'utf8').split('\n').filter(Boolean);
        agentCount = lines.filter((l) => l.includes('"agent_step"')).length;
      } catch { /* best-effort */ }

      const entry = JSON.stringify({
        type: 'session_end',
        session_id: sessionId,
        ts: new Date().toISOString(),
        v: 1,
        status: 'success',
        total_duration_ms: durationMs,
        agent_count: agentCount,
      });

      try { fs.appendFileSync(traceFile, entry + '\n'); } catch { /* best-effort */ }
      try { fs.unlinkSync(activeFile); } catch { /* best-effort */ }
    }
  } catch {
    // Trace is best-effort — never block skill execution.
  }

  process.exit(0);
}

main();
