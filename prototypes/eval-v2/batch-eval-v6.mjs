#!/usr/bin/env node
// V6: full pipeline (gen + judge) on diverse domains (frontend, ML, devops)
// Uses rubric v3 (strict) + same 3 personas as v3 (sre/security/performance)

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '../..');
const GOLDEN = path.join(__dirname, 'golden/diverse.jsonl');
const RUBRIC = path.join(__dirname, 'rubrics/refine-quality-v3.yaml');
const OUT_DIR = path.join(__dirname, 'out-v6');
const PERSONAS = ['sre', 'security', 'performance'];
const SEEDS = 2;

async function callClaude(prompt, model) {
  const { stdout } = await execFileP('claude', ['-p', prompt, '--model', model, '--output-format', 'text'], { maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}
const loadGolden = () => fs.readFileSync(GOLDEN, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const loadSlim = (p) => fs.readFileSync(path.join(REPO, 'x-kit/agents/slim', `${p}-agent.md`), 'utf8');

async function direct(c) {
  return callClaude(`Provide a direct, concrete, actionable answer. Use specific numbers and code where relevant.

Input: ${c.input}
Context: ${JSON.stringify(c.context)}

Answer:`, 'haiku');
}

async function personaCall(persona, c) {
  return callClaude(`You are a specialist. Use the following rules as your perspective when answering.

=== YOUR SPECIALIST RULES ===
${loadSlim(persona)}
=== END RULES ===

From this specialist's perspective, give a concrete, actionable answer with specific numbers and trade-offs.

Input: ${c.input}
Context: ${JSON.stringify(c.context)}

Answer (as ${persona} specialist):`, 'haiku');
}

async function broadcast(c) {
  const outs = await Promise.all(PERSONAS.map((p) => personaCall(p, c).then((o) => ({ persona: p, out: o }))));
  const synth = await callClaude(`You are synthesizing perspectives from 3 specialists into one best answer.

Input: ${c.input}
Context: ${JSON.stringify(c.context)}

${outs.map((p) => `=== ${p.persona.toUpperCase()} PERSPECTIVE ===\n${p.out}`).join('\n\n')}

Synthesize these into a single concrete, actionable final answer. Preserve the strongest specific numbers/code from each perspective. Surface trade-offs between perspectives explicitly.

Final answer:`, 'haiku');
  return synth;
}

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

Return STRICT JSON only (no markdown fences). Be strict about context_fitness and specificity — numbers must be derived from context, not generic defaults.
{
  "specificity": <1-10 int>,
  "specificity_reason": "<one sentence>",
  "trade_off_awareness": <1-10 int>,
  "context_fitness": <1-10 int>,
  "context_fitness_reason": "<one sentence>",
  "expected_hits": [<trait strings that appeared>],
  "anti_hits": [<anti-trait strings that appeared>]
}`;
  const raw = await callClaude(prompt, 'sonnet');
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch { return { error: 'parse-failed', raw: cleaned.slice(0, 400) }; }
}

async function runOne(c, strategy, seed, rubricYaml) {
  const output = strategy === 'direct' ? await direct(c) : await broadcast(c);
  fs.writeFileSync(path.join(OUT_DIR, `${c.id}.${strategy}.s${seed}.output.md`), output);
  const scores = await judge(output, rubricYaml, c);
  fs.writeFileSync(path.join(OUT_DIR, `${c.id}.${strategy}.s${seed}.scores.json`), JSON.stringify(scores, null, 2));
  return {
    case_id: c.id, strategy, seed,
    spec: scores.specificity, trade: scores.trade_off_awareness, ctx: scores.context_fitness,
    expected_hits: scores.expected_hits?.length || 0, expected_total: c.expected_traits.length,
    anti_hits: scores.anti_hits?.length || 0,
    chars: output.length,
    ctx_reason: scores.context_fitness_reason,
  };
}

const mean = (a) => { const v = a.filter((x) => typeof x === 'number'); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null; };
const stdev = (a) => { const v = a.filter((x) => typeof x === 'number'); if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((p, c) => p + (c - m) ** 2, 0) / v.length); };

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rubricYaml = fs.readFileSync(RUBRIC, 'utf8');
  const cases = loadGolden();
  const jobs = [];
  for (const c of cases) for (const s of ['direct', 'broadcast']) for (let seed = 1; seed <= SEEDS; seed++) jobs.push({ c, strategy: s, seed });

  console.error(`Diverse-domain test: ${jobs.length} jobs (${cases.length} cases × 2 strategies × ${SEEDS} seeds), personas=${PERSONAS.join('/')}, rubric=v3`);
  const t0 = Date.now();
  const results = await Promise.all(jobs.map((j) => runOne(j.c, j.strategy, j.seed, rubricYaml).catch((e) => ({ error: String(e), ...j }))));
  const totalMs = Date.now() - t0;
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));

  const agg = {};
  for (const r of results) {
    if (r.error) continue;
    const key = `${r.case_id}|${r.strategy}`;
    if (!agg[key]) agg[key] = { case_id: r.case_id, strategy: r.strategy, spec: [], trade: [], ctx: [], cov: [], chars: [] };
    agg[key].spec.push(r.spec); agg[key].trade.push(r.trade); agg[key].ctx.push(r.ctx);
    agg[key].cov.push(r.expected_hits / r.expected_total); agg[key].chars.push(r.chars);
  }

  console.error(`\n=== DIVERSE DOMAINS (total ${(totalMs / 1000).toFixed(1)}s) ===\n`);
  console.error('case               strat     spec(μ±σ)    trade(μ±σ)   ctx(μ±σ)    cov     chars');
  console.error('─'.repeat(90));
  for (const k of Object.keys(agg).sort()) {
    const a = agg[k];
    console.error(
      `${a.case_id.padEnd(18)} ${a.strategy.padEnd(9)} ${`${mean(a.spec)?.toFixed(1)}±${stdev(a.spec).toFixed(1)}`.padEnd(12)} ${`${mean(a.trade)?.toFixed(1)}±${stdev(a.trade).toFixed(1)}`.padEnd(12)} ${`${mean(a.ctx)?.toFixed(1)}±${stdev(a.ctx).toFixed(1)}`.padEnd(11)} ${((mean(a.cov) * 100).toFixed(0) + '%').padEnd(7)} ${Math.round(mean(a.chars))}`,
    );
  }

  console.error('\n=== STRATEGY AVG ===');
  for (const strat of ['direct', 'broadcast']) {
    const rs = results.filter((r) => !r.error && r.strategy === strat);
    console.error(`  ${strat.padEnd(10)} spec=${mean(rs.map((r) => r.spec))?.toFixed(2)} trade=${mean(rs.map((r) => r.trade))?.toFixed(2)} ctx=${mean(rs.map((r) => r.ctx))?.toFixed(2)} cov=${(mean(rs.map((r) => r.expected_hits / r.expected_total)) * 100).toFixed(0)}%`);
  }

  console.error('\n=== CTX REASONS ===');
  for (const r of results) {
    if (r.error) continue;
    console.error(`  ${r.case_id.padEnd(18)} ${r.strategy.padEnd(9)} s${r.seed} ctx=${r.ctx}: ${(r.ctx_reason || '').slice(0, 130)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
