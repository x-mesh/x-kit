#!/usr/bin/env node
// V8: triple-judge (sonnet/opus/haiku) re-scoring of v7 outputs with rubric v4
// Goal: fix judge drift on trade_off by making the dimension verifiable (cost/alt/failure count)
// Reuses v7 outputs — no regeneration cost.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const V7_DIR = path.join(__dirname, 'out-v7');
const OUT_DIR = path.join(__dirname, 'out-v8');
const RUBRIC = path.join(__dirname, 'rubrics/refine-quality-v4.yaml');

const CASES = {
  'refine-001': {
    input: '결제 실패 시 재시도 로직을 설계해줘',
    context: { domain: 'payment', scale: '10K TPS' },
    expected_traits: ['idempotency key', 'exponential backoff with specific numbers', 'dead letter queue', '4xx vs 5xx classification'],
    anti_traits: ['infinite retry', 'simple while loop', 'retry count only without interval'],
  },
  'diverse-ml': {
    input: '7B LLM 서빙의 p99 latency를 500ms 아래로 낮추는 설계',
    context: { model_size: '7B', gpu: 'A100 80GB', target_p99_ms: 500, target_qps: 10 },
    expected_traits: ['batching strategy with timeout', 'KV cache', 'speculative decoding or quantization', 'continuous batching (vLLM etc)'],
    anti_traits: ['naive sequential inference', 'no batching', 'float32 only', 'no kv cache'],
  },
};

async function callClaude(prompt, model) {
  const { stdout } = await execFileP('claude', ['-p', prompt, '--model', model, '--output-format', 'text'], { maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

async function judge(output, rubricYaml, c, judgeModel) {
  const prompt = `You are an evaluation judge. Score the output using the rubric v4.

RUBRIC:
${rubricYaml}

CASE:
  input: ${c.input}
  context: ${JSON.stringify(c.context)}
  expected_traits: ${JSON.stringify(c.expected_traits)}
  anti_traits: ${JSON.stringify(c.anti_traits)}

OUTPUT TO EVALUATE:
${output}

For trade_off_awareness, explicitly list which of {cost, alternatives, failure_modes} are present.
Return STRICT JSON only (no markdown fences).
{
  "specificity": <1-10 int>,
  "trade_off_awareness": <1-10 int>,
  "trade_off_elements": {"cost": <bool>, "alternatives": <bool>, "failure_modes": <bool>},
  "context_fitness": <1-10 int>,
  "expected_hits": [<trait strings>],
  "anti_hits": [<anti-trait strings>]
}`;
  const raw = await callClaude(prompt, judgeModel);
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch { return { error: 'parse-failed', specificity: null, trade_off_awareness: null, context_fitness: null }; }
}

function listOutputs() {
  const files = fs.readdirSync(V7_DIR).filter((f) => f.endsWith('.output.md'));
  return files.map((f) => {
    const m = f.match(/^(.+?)\.(.+?)\.s(\d+)\.output\.md$/);
    if (!m) return null;
    return { case_id: m[1], strategy: m[2], seed: parseInt(m[3], 10), file: path.join(V7_DIR, f) };
  }).filter(Boolean);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rubricYaml = fs.readFileSync(RUBRIC, 'utf8');
  const items = listOutputs();
  const judges = ['sonnet', 'opus', 'haiku'];

  console.error(`V8: re-judging ${items.length} outputs × ${judges.length} judges = ${items.length * judges.length} judgments`);
  const t0 = Date.now();

  const jobs = [];
  for (const it of items) for (const j of judges) jobs.push({ ...it, judge: j });

  const results = await Promise.all(jobs.map(async (j) => {
    const c = CASES[j.case_id];
    if (!c) return { error: 'unknown-case', ...j };
    const output = fs.readFileSync(j.file, 'utf8');
    const scores = await judge(output, rubricYaml, c, j.judge);
    fs.writeFileSync(path.join(OUT_DIR, `${j.case_id}.${j.strategy}.s${j.seed}.${j.judge}.json`), JSON.stringify(scores, null, 2));
    return {
      case_id: j.case_id, strategy: j.strategy, seed: j.seed, judge: j.judge,
      spec: scores.specificity, trade: scores.trade_off_awareness, ctx: scores.context_fitness,
      elements: scores.trade_off_elements || {},
    };
  }));

  const totalMs = Date.now() - t0;
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));

  // ==== Judge agreement analysis ====
  const byOutput = {};
  for (const r of results) {
    if (r.error) continue;
    const k = `${r.case_id}|${r.strategy}|${r.seed}`;
    if (!byOutput[k]) byOutput[k] = {};
    byOutput[k][r.judge] = r;
  }

  console.error(`\n=== V8 RESULTS (${(totalMs / 1000).toFixed(1)}s) ===\n`);

  // Pairwise correlations (Pearson) for each dim across all outputs
  const pearson = (xs, ys) => {
    const n = xs.length; if (n < 2) return NaN;
    const mx = xs.reduce((p, c) => p + c, 0) / n;
    const my = ys.reduce((p, c) => p + c, 0) / n;
    const num = xs.map((x, i) => (x - mx) * (ys[i] - my)).reduce((p, c) => p + c, 0);
    const dx = Math.sqrt(xs.map((x) => (x - mx) ** 2).reduce((p, c) => p + c, 0));
    const dy = Math.sqrt(ys.map((y) => (y - my) ** 2).reduce((p, c) => p + c, 0));
    return dx && dy ? num / (dx * dy) : NaN;
  };

  const pairs = [['sonnet', 'opus'], ['sonnet', 'haiku'], ['opus', 'haiku']];
  const dims = ['spec', 'trade', 'ctx'];

  console.error('Pairwise judge correlation (r) + MAE:');
  console.error('  pair              dim     r       MAE');
  console.error('  ' + '─'.repeat(45));
  for (const [a, b] of pairs) {
    for (const dim of dims) {
      const xs = [], ys = [];
      for (const k of Object.keys(byOutput)) {
        const va = byOutput[k][a]?.[dim];
        const vb = byOutput[k][b]?.[dim];
        if (typeof va === 'number' && typeof vb === 'number') { xs.push(va); ys.push(vb); }
      }
      const r = pearson(xs, ys);
      const mae = xs.length ? xs.reduce((acc, x, i) => acc + Math.abs(x - ys[i]), 0) / xs.length : NaN;
      console.error(`  ${(a + '↔' + b).padEnd(16)} ${dim.padEnd(6)} ${r.toFixed(3).padEnd(7)} ${mae.toFixed(2)}`);
    }
  }

  // Trade-off element agreement (bool triple)
  console.error('\nTrade-off element agreement (3-way vote stats):');
  console.error('  element        3-way-agree  mean-positive');
  let totalAgree = { cost: 0, alternatives: 0, failure_modes: 0 };
  let totalPos = { cost: 0, alternatives: 0, failure_modes: 0 };
  let n = 0;
  for (const k of Object.keys(byOutput)) {
    const e1 = byOutput[k].sonnet?.elements;
    const e2 = byOutput[k].opus?.elements;
    const e3 = byOutput[k].haiku?.elements;
    if (!e1 || !e2 || !e3) continue;
    n++;
    for (const key of ['cost', 'alternatives', 'failure_modes']) {
      const votes = [e1[key], e2[key], e3[key]];
      if (votes.every((v) => v === true) || votes.every((v) => v === false)) totalAgree[key]++;
      totalPos[key] += votes.filter(Boolean).length / 3;
    }
  }
  for (const key of ['cost', 'alternatives', 'failure_modes']) {
    console.error(`  ${key.padEnd(14)} ${`${(totalAgree[key] / n * 100).toFixed(0)}%`.padEnd(12)} ${(totalPos[key] / n * 100).toFixed(0)}%`);
  }

  // Strategy ranking by median score (robust to judge drift)
  console.error('\n=== STRATEGY MEDIAN SCORES (across 3 judges + 3 seeds) ===');
  const median = (a) => { const s = [...a].filter((x) => typeof x === 'number').sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const byStrat = {};
  for (const r of results) {
    if (r.error) continue;
    const k = `${r.case_id}|${r.strategy}`;
    if (!byStrat[k]) byStrat[k] = { spec: [], trade: [], ctx: [] };
    byStrat[k].spec.push(r.spec); byStrat[k].trade.push(r.trade); byStrat[k].ctx.push(r.ctx);
  }
  console.error('  case             strategy         spec  trade  ctx');
  console.error('  ' + '─'.repeat(55));
  for (const k of Object.keys(byStrat).sort()) {
    const [cid, s] = k.split('|');
    const a = byStrat[k];
    console.error(`  ${cid.padEnd(16)} ${s.padEnd(16)} ${median(a.spec)}     ${median(a.trade)}      ${median(a.ctx)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
