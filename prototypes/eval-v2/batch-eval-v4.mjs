#!/usr/bin/env node
// V4: rejudge v3 outputs with new rubric (adds context_fitness)
// Reuses out-v3/*.output.md to avoid regeneration cost.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(__dirname, 'golden/refine.jsonl');
const RUBRIC = path.join(__dirname, 'rubrics/refine-quality-v2.yaml');
const OUT_SRC = path.join(__dirname, 'out-v3');
const OUT_DIR = path.join(__dirname, 'out-v4');

async function callClaude(prompt, model) {
  const { stdout } = await execFileP('claude', ['-p', prompt, '--model', model, '--output-format', 'text'], { maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}
function loadGolden() { return fs.readFileSync(GOLDEN, 'utf8').trim().split('\n').map((l) => JSON.parse(l)); }

async function judge(output, rubricYaml, c) {
  const prompt = `You are an evaluation judge. Score the output below using the rubric.

RUBRIC (YAML):
${rubricYaml}

CASE:
  input: ${c.input}
  context: ${JSON.stringify(c.context)}
  expected_traits: ${JSON.stringify(c.expected_traits)}
  anti_traits: ${JSON.stringify(c.anti_traits)}

OUTPUT TO EVALUATE:
${output}

Return STRICT JSON only (no markdown fences). Be strict about context_fitness — ask "if the context values were different, would the answer be different?" If not, score low.
{
  "specificity": <1-10 int>,
  "trade_off_awareness": <1-10 int>,
  "context_fitness": <1-10 int>,
  "context_fitness_reason": "<one sentence — which context values are actually used in the answer>",
  "expected_hits": [<trait strings that appeared>],
  "anti_hits": [<anti-trait strings that appeared>]
}`;
  const raw = await callClaude(prompt, 'sonnet');
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch { return { error: 'parse-failed', raw: cleaned.slice(0, 500) }; }
}

function mean(arr) { const v = arr.filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function std(arr) { const v = arr.filter((x) => typeof x === 'number'); if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); }

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rubricYaml = fs.readFileSync(RUBRIC, 'utf8');
  const cases = loadGolden();
  const strategies = ['direct', 'broadcast'];
  const SEEDS = 2;

  const jobs = [];
  for (const c of cases) for (const s of strategies) for (let seed = 1; seed <= SEEDS; seed++) {
    const outputFile = path.join(OUT_SRC, `${c.id}.${s}.s${seed}.output.md`);
    if (!fs.existsSync(outputFile)) continue;
    jobs.push({ c, strategy: s, seed, outputFile });
  }

  console.error(`Rejudging ${jobs.length} outputs with rubric v2 (adds context_fitness)...`);
  const t0 = Date.now();
  const results = await Promise.all(jobs.map(async (j) => {
    const output = fs.readFileSync(j.outputFile, 'utf8');
    const scores = await judge(output, rubricYaml, j.c);
    fs.writeFileSync(path.join(OUT_DIR, `${j.c.id}.${j.strategy}.s${j.seed}.scores.json`), JSON.stringify(scores, null, 2));
    return { case_id: j.c.id, strategy: j.strategy, seed: j.seed, ...scores };
  }));
  const totalMs = Date.now() - t0;

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));

  const agg = {};
  for (const r of results) {
    const key = `${r.case_id}|${r.strategy}`;
    if (!agg[key]) agg[key] = { case_id: r.case_id, strategy: r.strategy, spec: [], trade: [], ctx: [] };
    agg[key].spec.push(r.specificity);
    agg[key].trade.push(r.trade_off_awareness);
    agg[key].ctx.push(r.context_fitness);
  }

  console.error(`\n=== REJUDGED WITH CONTEXT_FITNESS (total ${(totalMs / 1000).toFixed(1)}s) ===\n`);
  console.error('case         strat       spec(μ±σ)    trade(μ±σ)   ctx_fit(μ±σ)');
  console.error('─'.repeat(72));
  for (const k of Object.keys(agg).sort()) {
    const a = agg[k];
    console.error(
      `${a.case_id.padEnd(12)} ${a.strategy.padEnd(10)} ${`${mean(a.spec)?.toFixed(1)}±${std(a.spec).toFixed(1)}`.padEnd(12)} ${`${mean(a.trade)?.toFixed(1)}±${std(a.trade).toFixed(1)}`.padEnd(12)} ${`${mean(a.ctx)?.toFixed(1)}±${std(a.ctx).toFixed(1)}`.padEnd(12)}`,
    );
  }

  console.error('\n=== STRATEGY AVG ===');
  for (const strat of strategies) {
    const rs = results.filter((r) => r.strategy === strat);
    console.error(`  ${strat.padEnd(10)} spec=${mean(rs.map((r) => r.specificity))?.toFixed(2)} trade=${mean(rs.map((r) => r.trade_off_awareness))?.toFixed(2)} ctx_fit=${mean(rs.map((r) => r.context_fitness))?.toFixed(2)}`);
  }

  // Show per-case context_fitness reasons for inspection
  console.error('\n=== CONTEXT_FITNESS REASONS ===');
  for (const r of results) {
    console.error(`  ${r.case_id} ${r.strategy} s${r.seed} ctx=${r.context_fitness}: ${r.context_fitness_reason?.slice(0, 140)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
