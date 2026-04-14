#!/usr/bin/env node
// Option-3 PoC: mine existing .xm/traces/ for "usage signals" that could correlate with eval scores.
// No instrumentation added. Pure offline analysis.
//
// Signals extracted per session:
//   - duration_ms (total session wall time)
//   - agent_count
//   - status (success | error)
//   - time_to_next_session (gap until user started another x-kit session — proxy for "was output digested or abandoned?")
//   - followup_same_skill (did user re-invoke the same skill within 10min? proxy for rerun/dissatisfaction)
//   - followed_by_eval (did user run x-eval within 30min? proxy for "wanted to measure")

import fs from 'node:fs';
import path from 'node:path';

const TRACE_DIR = path.join(process.cwd(), '.xm/traces');

function parseJsonl(p) {
  return fs.readFileSync(p, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function summarizeSession(lines) {
  const start = lines.find((l) => l.type === 'session_start');
  const end = lines.find((l) => l.type === 'session_end');
  if (!start) return null;
  const steps = lines.filter((l) => l.type === 'agent_step');
  return {
    session_id: start.session_id,
    skill: start.skill,
    args: start.args || {},
    start_ts: start.ts,
    end_ts: end?.ts || steps[steps.length - 1]?.ts || start.ts,
    duration_ms: end?.total_duration_ms ?? null,
    agent_count: steps.length,
    status: end?.status ?? 'unknown',
  };
}

function main() {
  if (!fs.existsSync(TRACE_DIR)) { console.error('No .xm/traces/ found'); process.exit(1); }
  const files = fs.readdirSync(TRACE_DIR).filter((f) => f.endsWith('.jsonl'));
  const sessions = files.map((f) => summarizeSession(parseJsonl(path.join(TRACE_DIR, f)))).filter(Boolean);
  sessions.sort((a, b) => new Date(a.start_ts) - new Date(b.start_ts));

  // Augment: time_to_next, followup_same_skill, followed_by_eval
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const next = sessions[i + 1];
    s.time_to_next_ms = next ? new Date(next.start_ts) - new Date(s.end_ts) : null;
    s.followup_same_skill = false;
    s.followed_by_eval = false;
    const myEnd = new Date(s.end_ts);
    for (let j = i + 1; j < sessions.length; j++) {
      const gap = new Date(sessions[j].start_ts) - myEnd;
      if (gap > 30 * 60 * 1000) break;
      if (sessions[j].skill === s.skill && gap <= 10 * 60 * 1000) s.followup_same_skill = true;
      if (sessions[j].skill === 'x-eval') s.followed_by_eval = true;
    }
  }

  // Group by skill + summarize
  const bySkill = {};
  for (const s of sessions) {
    if (!bySkill[s.skill]) bySkill[s.skill] = [];
    bySkill[s.skill].push(s);
  }

  const median = (a) => { const s = [...a].filter((x) => typeof x === 'number' && !isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

  console.error(`=== Session Summary (${sessions.length} sessions) ===\n`);
  console.error('  skill          n    status   agents(med)  duration_s(med)  followup%  -> eval%  next_gap_s(med)');
  console.error('  ' + '─'.repeat(95));
  for (const skill of Object.keys(bySkill).sort()) {
    const arr = bySkill[skill];
    const n = arr.length;
    const okPct = Math.round(arr.filter((s) => s.status === 'success').length / n * 100);
    const medAgents = median(arr.map((s) => s.agent_count));
    const medDur = median(arr.map((s) => s.duration_ms));
    const pctFollowup = Math.round(arr.filter((s) => s.followup_same_skill).length / n * 100);
    const pctEval = Math.round(arr.filter((s) => s.followed_by_eval).length / n * 100);
    const medGap = median(arr.map((s) => s.time_to_next_ms));
    console.error(
      `  ${skill.padEnd(14)} ${String(n).padEnd(4)} ${(okPct + '%').padEnd(8)} ${String(medAgents).padEnd(12)} ${(medDur != null ? (medDur / 1000).toFixed(1) : 'n/a').padEnd(16)} ${(pctFollowup + '%').padEnd(10)} ${(pctEval + '%').padEnd(8)} ${medGap != null ? (medGap / 1000).toFixed(0) : 'n/a'}`,
    );
  }

  // Focus on x-op: does strategy type correlate with followup/eval rate?
  const xopSessions = (bySkill['x-op'] || []);
  if (xopSessions.length) {
    console.error(`\n=== x-op breakdown by strategy (${xopSessions.length} sessions) ===`);
    const byStrat = {};
    for (const s of xopSessions) {
      const k = s.args.strategy || '(none)';
      if (!byStrat[k]) byStrat[k] = [];
      byStrat[k].push(s);
    }
    console.error('  strategy         n    followup%  ->eval%  agents(med)  dur_s(med)');
    console.error('  ' + '─'.repeat(70));
    for (const k of Object.keys(byStrat).sort()) {
      const a = byStrat[k];
      const n = a.length;
      const pf = Math.round(a.filter((s) => s.followup_same_skill).length / n * 100);
      const pe = Math.round(a.filter((s) => s.followed_by_eval).length / n * 100);
      const ma = median(a.map((s) => s.agent_count));
      const md = median(a.map((s) => s.duration_ms));
      console.error(`  ${k.padEnd(16)} ${String(n).padEnd(4)} ${(pf + '%').padEnd(10)} ${(pe + '%').padEnd(8)} ${String(ma).padEnd(12)} ${md != null ? (md / 1000).toFixed(1) : 'n/a'}`);
    }
  }

  console.error('\n=== Signal validity notes ===');
  console.error('- followup_same_skill within 10min: proxy for "output not satisfactory → rerun". High% = warning sign.');
  console.error('- followed_by_eval within 30min: proxy for "user wanted to measure the output". May indicate doubt OR care.');
  console.error('- time_to_next gap: short gap = working actively; long gap = paused/abandoned. Median stabilizes outliers.');
  console.error('- CAVEAT: these are session-level proxies, not per-output quality signals. Need real correlation study with scores to validate.');

  fs.writeFileSync(path.join(path.dirname(TRACE_DIR), '..', 'prototypes/eval-v2/out-traces-analysis.json'), JSON.stringify(sessions, null, 2));
  console.error(`\n[wrote] prototypes/eval-v2/out-traces-analysis.json (${sessions.length} sessions)`);
}

main();
