#!/usr/bin/env node
// V7: persona ablation + seed=3 + sonnet/opus judge drift
// Strategies: direct, bcast-1, bcast-3-fixed, bcast-3-matched, bcast-5
// Cases: refine-001 (payment), diverse-ml
// Judges: sonnet + opus on every output

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '../..');
const RUBRIC = path.join(__dirname, 'rubrics/refine-quality-v3.yaml');
const OUT_DIR = path.join(__dirname, 'out-v7');
const SEEDS = 3;

const CASES = [
  {
    id: 'refine-001', input: '결제 실패 시 재시도 로직을 설계해줘',
    context: { domain: 'payment', scale: '10K TPS' },
    expected_traits: ['idempotency key', 'exponential backoff with specific numbers', 'dead letter queue', '4xx vs 5xx classification'],
    anti_traits: ['infinite retry', 'simple while loop', 'retry count only without interval'],
    personas: {
      single: 'performance',
      fixed3: ['sre', 'security', 'performance'],
      matched3: ['database', 'api-designer', 'security'],
      five: ['sre', 'security', 'performance', 'database', 'api-designer'],
    },
  },
  {
    id: 'diverse-ml', input: '7B LLM 서빙의 p99 latency를 500ms 아래로 낮추는 설계',
    context: { model_size: '7B', gpu: 'A100 80GB', target_p99_ms: 500, target_qps: 10 },
    expected_traits: ['batching strategy with timeout', 'KV cache', 'speculative decoding or quantization', 'continuous batching (vLLM etc)'],
    anti_traits: ['naive sequential inference', 'no batching', 'float32 only', 'no kv cache'],
    personas: {
      single: 'performance',
      fixed3: ['sre', 'security', 'performance'],
      matched3: ['mlops', 'performance', 'sre'],
      five: ['sre', 'security', 'performance', 'mlops', 'data-pipeline'],
    },
  },
];

async function callClaude(prompt, model) {
  const { stdout } = await execFileP('claude', ['-p', prompt, '--model', model, '--output-format', 'text'], { maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}
const loadSlim = (p) => fs.readFileSync(path.join(REPO, 'x-kit/agents/slim', `${p}-agent.md`), 'utf8');

async function direct(c) {
  return callClaude(`Provide a direct, concrete, actionable answer. Use specific numbers and code where relevant.

Input: ${c.input}
Context: ${JSON.stringify(c.context)}

Answer:`, 'haiku');
}

async function personaCall(persona, c) {
  return callClaude(`You are a specialist. Use the following rules as your perspective.

=== SPECIALIST RULES ===
${loadSlim(persona)}
=== END ===

From this specialist's perspective, give a concrete, actionable answer with specific numbers and trade-offs.

Input: ${c.input}
Context: ${JSON.stringify(c.context)}

Answer (as ${persona} specialist):`, 'haiku');
}

async function broadcast(c, personas) {
  const outs = await Promise.all(personas.map((p) => personaCall(p, c).then((o) => ({ persona: p, out: o }))));
  return callClaude(`You are synthesizing perspectives from ${personas.length} specialists into one best answer.

Input: ${c.input}
Context: ${JSON.stringify(c.context)}

${outs.map((p) => `=== ${p.persona.toUpperCase()} PERSPECTIVE ===\n${p.out}`).join('\n\n')}

Synthesize these into a single concrete, actionable final answer. Preserve the strongest specific numbers/code from each perspective. Surface trade-offs between perspectives explicitly.

Final answer:`, 'haiku');
}

async function generate(strategy, c) {
  if (strategy === 'direct') return direct(c);
  if (strategy === 'bcast-1') return broadcast(c, [c.personas.single]);
  if (strategy === 'bcast-3-fixed') return broadcast(c, c.personas.fixed3);
  if (strategy === 'bcast-3-matched') return broadcast(c, c.personas.matched3);
  if (strategy === 'bcast-5') return broadcast(c, c.personas.five);
  throw new Error('unknown strategy: ' + strategy);
}

async function judge(output, rubricYaml, c, judgeModel) {
  const prompt = `You are an evaluation judge. Score the output using the rubric.

RUBRIC:
${rubricYaml}

CASE:
  input: ${c.input}
  context: ${JSON.stringify(c.context)}
  expected_traits: ${JSON.stringify(c.expected_traits)}
  anti_traits: ${JSON.stringify(c.anti_traits)}

OUTPUT TO EVALUATE:
${output}

Return STRICT JSON only (no markdown fences). Be strict about specificity and context_fitness — numbers must be derived from context, not generic defaults.
{
  "specificity": <1-10 int>,
  "trade_off_awareness": <1-10 int>,
  "context_fitness": <1-10 int>,
  "expected_hits": [<trait strings>],
  "anti_hits": [<anti-trait strings>]
}`;
  const raw = await callClaude(prompt, judgeModel);
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch { return { error: 'parse-failed', specificity: null, trade_off_awareness: null, context_fitness: null, expected_hits: [], anti_hits: [] }; }
}

async function runOne(c, strategy, seed, rubricYaml) {
  const outputFile = path.join(OUT_DIR, `${c.id}.${strategy}.s${seed}.output.md`);
  const output = await generate(strategy, c);
  fs.writeFileSync(outputFile, output);
  const [sonnetScores, opusScores] = await Promise.all([
    judge(output, rubricYaml, c, 'sonnet'),
    judge(output, rubricYaml, c, 'opus'),
  ]);
  fs.writeFileSync(path.join(OUT_DIR, `${c.id}.${strategy}.s${seed}.sonnet.json`), JSON.stringify(sonnetScores, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `${c.id}.${strategy}.s${seed}.opus.json`), JSON.stringify(opusScores, null, 2));
  return {
    case_id: c.id, strategy, seed, chars: output.length,
    sonnet: { spec: sonnetScores.specificity, trade: sonnetScores.trade_off_awareness, ctx: sonnetScores.context_fitness },
    opus: { spec: opusScores.specificity, trade: opusScores.trade_off_awareness, ctx: opusScores.context_fitness },
  };
}

const mean = (a) => { const v = a.filter((x) => typeof x === 'number'); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null; };
const stdev = (a) => { const v = a.filter((x) => typeof x === 'number'); if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((p, c) => p + (c - m) ** 2, 0) / v.length); };

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rubricYaml = fs.readFileSync(RUBRIC, 'utf8');
  const strategies = ['direct', 'bcast-1', 'bcast-3-fixed', 'bcast-3-matched', 'bcast-5'];

  const jobs = [];
  for (const c of CASES) for (const s of strategies) for (let seed = 1; seed <= SEEDS; seed++) jobs.push({ c, strategy: s, seed });

  console.error(`V7: ${jobs.length} jobs (${CASES.length} cases × ${strategies.length} strategies × ${SEEDS} seeds), dual-judge sonnet+opus`);
  const t0 = Date.now();
  const results = await Promise.all(jobs.map((j) => runOne(j.c, j.strategy, j.seed, rubricYaml).catch((e) => ({ error: String(e), ...j }))));
  const totalMs = Date.now() - t0;
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));

  // Aggregate: by (case, strategy, judge)
  const agg = {};
  for (const r of results) {
    if (r.error) continue;
    for (const judgeKey of ['sonnet', 'opus']) {
      const k = `${r.case_id}|${r.strategy}|${judgeKey}`;
      if (!agg[k]) agg[k] = { case_id: r.case_id, strategy: r.strategy, judge: judgeKey, spec: [], trade: [], ctx: [] };
      agg[k].spec.push(r[judgeKey].spec);
      agg[k].trade.push(r[judgeKey].trade);
      agg[k].ctx.push(r[judgeKey].ctx);
    }
  }

  console.error(`\n=== V7 RESULTS (total ${(totalMs / 1000).toFixed(1)}s, ${jobs.length} jobs × 2 judges = ${jobs.length * 2} judgments) ===\n`);
  for (const cid of [...new Set(results.map((r) => r.case_id))]) {
    console.error(`\nCase: ${cid}`);
    console.error('  strategy           judge    spec(μ±σ)    trade(μ±σ)   ctx(μ±σ)');
    console.error('  ' + '─'.repeat(72));
    for (const strat of strategies) {
      for (const judgeKey of ['sonnet', 'opus']) {
        const a = agg[`${cid}|${strat}|${judgeKey}`];
        if (!a) continue;
        console.error(
          `  ${strat.padEnd(18)} ${judgeKey.padEnd(8)} ${`${mean(a.spec)?.toFixed(1)}±${stdev(a.spec).toFixed(1)}`.padEnd(12)} ${`${mean(a.trade)?.toFixed(1)}±${stdev(a.trade).toFixed(1)}`.padEnd(12)} ${`${mean(a.ctx)?.toFixed(1)}±${stdev(a.ctx).toFixed(1)}`}`,
        );
      }
    }
  }

  // Strategy averages across cases (per judge)
  console.error('\n=== STRATEGY AVG (across both cases) ===');
  for (const judgeKey of ['sonnet', 'opus']) {
    console.error(`\n  [${judgeKey}]`);
    for (const strat of strategies) {
      const rs = results.filter((r) => !r.error && r.strategy === strat);
      console.error(`    ${strat.padEnd(18)} spec=${mean(rs.map((r) => r[judgeKey].spec))?.toFixed(2)} trade=${mean(rs.map((r) => r[judgeKey].trade))?.toFixed(2)} ctx=${mean(rs.map((r) => r[judgeKey].ctx))?.toFixed(2)}`);
    }
  }

  // Judge drift: per (case, strategy, seed), compare sonnet vs opus
  console.error('\n=== JUDGE DRIFT (sonnet vs opus, per dimension) ===');
  const pearson = (xs, ys) => {
    const n = xs.length; if (n < 2) return NaN;
    const mx = xs.reduce((p, c) => p + c, 0) / n;
    const my = ys.reduce((p, c) => p + c, 0) / n;
    const num = xs.map((x, i) => (x - mx) * (ys[i] - my)).reduce((p, c) => p + c, 0);
    const dx = Math.sqrt(xs.map((x) => (x - mx) ** 2).reduce((p, c) => p + c, 0));
    const dy = Math.sqrt(ys.map((y) => (y - my) ** 2).reduce((p, c) => p + c, 0));
    return dx && dy ? num / (dx * dy) : NaN;
  };
  for (const dim of ['spec', 'trade', 'ctx']) {
    const ss = results.filter((r) => !r.error).map((r) => r.sonnet[dim]).filter((v) => typeof v === 'number');
    const oo = results.filter((r) => !r.error).map((r) => r.opus[dim]).filter((v) => typeof v === 'number');
    const n = Math.min(ss.length, oo.length);
    const r = pearson(ss.slice(0, n), oo.slice(0, n));
    const mae = ss.slice(0, n).reduce((a, s, i) => a + Math.abs(s - oo[i]), 0) / n;
    console.error(`  ${dim.padEnd(6)} r=${r.toFixed(3)}  MAE=${mae.toFixed(2)}  sonnet μ=${(ss.reduce((a, b) => a + b, 0) / ss.length).toFixed(2)}  opus μ=${(oo.reduce((a, b) => a + b, 0) / oo.length).toFixed(2)}`);
  }

  // Seed stability: per (case, strategy, judge), σ across seeds
  console.error('\n=== SEED STABILITY (σ ≤ 0.5 = stable, σ > 1.5 = noisy) ===');
  const noisy = Object.values(agg).filter((a) => Math.max(stdev(a.spec), stdev(a.trade), stdev(a.ctx)) > 1.5);
  if (noisy.length === 0) console.error('  ✅ No noisy combos (all σ ≤ 1.5)');
  else for (const a of noisy) console.error(`  ⚠️ ${a.case_id} ${a.strategy} ${a.judge}: spec σ=${stdev(a.spec).toFixed(1)}, trade σ=${stdev(a.trade).toFixed(1)}, ctx σ=${stdev(a.ctx).toFixed(1)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
