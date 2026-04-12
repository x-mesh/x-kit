#!/usr/bin/env node
// V3: real multi-persona broadcast vs direct (faithful to x-op refine)
// 3 personas pulled from x-kit/agents/slim/, each gets the input with persona-specific framing,
// then a synthesis call combines all three into a final answer.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '../..');
const GOLDEN = path.join(__dirname, 'golden/refine.jsonl');
const RUBRIC = path.join(__dirname, 'rubrics/refine-quality.yaml');
const OUT_DIR = path.join(__dirname, 'out-v3');

const SEEDS = 2;
const PERSONAS = ['sre', 'security', 'performance'];

async function callClaude(prompt, model) {
  const { stdout } = await execFileP(
    'claude',
    ['-p', prompt, '--model', model, '--output-format', 'text'],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout.trim();
}

function loadSlim(persona) {
  return fs.readFileSync(path.join(REPO, 'x-kit/agents/slim', `${persona}-agent.md`), 'utf8');
}
function loadGolden() {
  return fs.readFileSync(GOLDEN, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}

async function directStrategy(c) {
  const prompt = `Provide a direct, concrete, actionable answer. Use specific numbers and code where relevant.

Input: ${c.input}
Context: ${JSON.stringify(c.context)}

Answer:`;
  return callClaude(prompt, 'haiku');
}

async function personaCall(persona, c) {
  const slim = loadSlim(persona);
  const prompt = `You are a specialist. Use the following rules as your perspective when answering.

=== YOUR SPECIALIST RULES ===
${slim}
=== END RULES ===

From this specialist's perspective, give a concrete, actionable answer with specific numbers and trade-offs.

Input: ${c.input}
Context: ${JSON.stringify(c.context)}

Answer (as ${persona} specialist):`;
  return callClaude(prompt, 'haiku');
}

async function broadcastRefine(c) {
  const personaOutputs = await Promise.all(PERSONAS.map((p) => personaCall(p, c).then((out) => ({ persona: p, out }))));
  const synthesisPrompt = `You are synthesizing perspectives from 3 specialists into one best answer.

Input: ${c.input}
Context: ${JSON.stringify(c.context)}

${personaOutputs.map((p) => `=== ${p.persona.toUpperCase()} PERSPECTIVE ===\n${p.out}`).join('\n\n')}

Synthesize these into a single concrete, actionable final answer. Preserve the strongest specific numbers/code from each perspective. Surface trade-offs between perspectives explicitly.

Final answer:`;
  const synthesis = await callClaude(synthesisPrompt, 'haiku');
  return { synthesis, personaOutputs };
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

Return STRICT JSON only (no markdown fences):
{
  "specificity": <1-10 int>,
  "trade_off_awareness": <1-10 int>,
  "expected_hits": [<trait strings that appeared>],
  "anti_hits": [<anti-trait strings that appeared>]
}`;
  const raw = await callClaude(prompt, 'sonnet');
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { error: 'parse-failed', specificity: null, trade_off_awareness: null, expected_hits: [], anti_hits: [] };
  }
}

async function runOne(c, strategy, seed, rubricYaml) {
  const t0 = Date.now();
  let output;
  let personaOutputs = null;
  if (strategy === 'direct') output = await directStrategy(c);
  else if (strategy === 'broadcast') {
    const res = await broadcastRefine(c);
    output = res.synthesis;
    personaOutputs = res.personaOutputs;
  } else throw new Error('unknown strategy');
  const genMs = Date.now() - t0;
  const t1 = Date.now();
  const scores = await judge(output, rubricYaml, c);
  const judgeMs = Date.now() - t1;

  fs.writeFileSync(path.join(OUT_DIR, `${c.id}.${strategy}.s${seed}.output.md`), output);
  if (personaOutputs) {
    fs.writeFileSync(
      path.join(OUT_DIR, `${c.id}.${strategy}.s${seed}.personas.md`),
      personaOutputs.map((p) => `# ${p.persona}\n\n${p.out}`).join('\n\n---\n\n'),
    );
  }
  return {
    case_id: c.id,
    strategy,
    seed,
    specificity: scores.specificity,
    trade_off: scores.trade_off_awareness,
    expected_hits: scores.expected_hits?.length || 0,
    expected_total: c.expected_traits.length,
    anti_hits: scores.anti_hits?.length || 0,
    gen_ms: genMs,
    judge_ms: judgeMs,
    output_chars: output.length,
  };
}

function mean(arr) {
  const vals = arr.filter((v) => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
function std(arr) {
  const vals = arr.filter((v) => typeof v === 'number');
  if (vals.length < 2) return 0;
  const m = mean(vals);
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rubricYaml = fs.readFileSync(RUBRIC, 'utf8');
  const cases = loadGolden();
  const strategies = ['direct', 'broadcast'];

  const jobs = [];
  for (const c of cases) for (const s of strategies) for (let seed = 1; seed <= SEEDS; seed++) jobs.push({ c, strategy: s, seed });

  console.error(`Running ${jobs.length} jobs in parallel (${cases.length} cases × ${strategies.length} strategies × ${SEEDS} seeds)...`);
  console.error(`Broadcast uses personas: ${PERSONAS.join(', ')}`);

  const t0 = Date.now();
  const results = await Promise.all(jobs.map((j) => runOne(j.c, j.strategy, j.seed, rubricYaml).catch((e) => ({ error: String(e), ...j }))));
  const totalMs = Date.now() - t0;

  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(results, null, 2));

  const agg = {};
  for (const r of results) {
    if (r.error) continue;
    const key = `${r.case_id}|${r.strategy}`;
    if (!agg[key]) agg[key] = { case_id: r.case_id, strategy: r.strategy, spec: [], trade_off: [], coverage: [], anti: [], chars: [] };
    agg[key].spec.push(r.specificity);
    agg[key].trade_off.push(r.trade_off);
    agg[key].coverage.push(r.expected_hits / r.expected_total);
    agg[key].anti.push(r.anti_hits);
    agg[key].chars.push(r.output_chars);
  }

  console.error(`\n=== RESULTS (total ${(totalMs / 1000).toFixed(1)}s, ${jobs.length} jobs, personas=${PERSONAS.join('/')}) ===\n`);
  console.error('case         strat       spec(μ±σ)    trade(μ±σ)   coverage   anti   chars');
  console.error('─'.repeat(82));
  for (const k of Object.keys(agg).sort()) {
    const a = agg[k];
    console.error(
      `${a.case_id.padEnd(12)} ${a.strategy.padEnd(10)} ${`${mean(a.spec)?.toFixed(1)}±${std(a.spec).toFixed(1)}`.padEnd(12)} ${`${mean(a.trade_off)?.toFixed(1)}±${std(a.trade_off).toFixed(1)}`.padEnd(12)} ${((mean(a.coverage) * 100).toFixed(0) + '%').padEnd(10)} ${String(a.anti.reduce((x, y) => x + y, 0)).padEnd(6)} ${Math.round(mean(a.chars))}`,
    );
  }

  console.error('\n=== STRATEGY AVG ===');
  for (const strat of strategies) {
    const rs = results.filter((r) => !r.error && r.strategy === strat);
    const spec = mean(rs.map((r) => r.specificity));
    const trade = mean(rs.map((r) => r.trade_off));
    const cov = mean(rs.map((r) => r.expected_hits / r.expected_total));
    const chars = mean(rs.map((r) => r.output_chars));
    const genMs = mean(rs.map((r) => r.gen_ms));
    console.error(`  ${strat.padEnd(10)} spec=${spec?.toFixed(2)} trade=${trade?.toFixed(2)} coverage=${(cov * 100).toFixed(0)}%  chars=${Math.round(chars)}  gen=${Math.round(genMs)}ms`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
