#!/usr/bin/env node
// Prototype: golden-set batch eval
// Usage: node batch-eval.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(__dirname, 'golden/refine.jsonl');
const RUBRIC = path.join(__dirname, 'rubrics/refine-quality.yaml');
const OUT_DIR = path.join(__dirname, 'out');

function callClaude(prompt, model = 'haiku') {
  const out = execFileSync(
    'claude',
    ['-p', prompt, '--model', model, '--output-format', 'text'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  return out.trim();
}

function loadGolden() {
  return fs
    .readFileSync(GOLDEN, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
}

function simulateRefine(input, context) {
  const prompt = `You are simulating a "refine" strategy: brainstorm 3 distinct approaches, then synthesize the best final answer.

Input: ${input}
Context: ${JSON.stringify(context)}

Output format:
## Approach A
(1-2 sentences)
## Approach B
(1-2 sentences)
## Approach C
(1-2 sentences)
## Final synthesized answer
(concrete, actionable — use numbers/code where relevant)`;
  return callClaude(prompt, 'haiku');
}

function judge(output, rubricYaml, caseInfo) {
  const prompt = `You are an evaluation judge. Score the output below using the rubric.

RUBRIC (YAML):
${rubricYaml}

CASE:
  input: ${caseInfo.input}
  context: ${JSON.stringify(caseInfo.context)}
  expected_traits: ${JSON.stringify(caseInfo.expected_traits)}
  anti_traits: ${JSON.stringify(caseInfo.anti_traits)}

OUTPUT TO EVALUATE:
${output}

Return STRICT JSON only (no markdown fences):
{
  "specificity": <1-10 int>,
  "specificity_reason": "<one sentence>",
  "trade_off_awareness": <1-10 int>,
  "trade_off_awareness_reason": "<one sentence>",
  "expected_hits": [<trait strings that appeared>],
  "anti_hits": [<anti-trait strings that appeared>]
}`;
  const raw = callClaude(prompt, 'sonnet');
  // strip markdown fences if any
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return { error: 'parse-failed', raw: cleaned.slice(0, 500) };
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rubricYaml = fs.readFileSync(RUBRIC, 'utf8');
  const cases = loadGolden();

  const results = [];
  for (const c of cases) {
    console.error(`\n[${c.id}] generating refine output...`);
    const t0 = Date.now();
    const output = simulateRefine(c.input, c.context);
    const genMs = Date.now() - t0;
    fs.writeFileSync(path.join(OUT_DIR, `${c.id}.output.md`), output);

    console.error(`[${c.id}] judging (sonnet)...`);
    const t1 = Date.now();
    const scores = judge(output, rubricYaml, c);
    const judgeMs = Date.now() - t1;

    const expectedCoverage = scores.expected_hits
      ? scores.expected_hits.length / c.expected_traits.length
      : 0;
    const antiHits = scores.anti_hits ? scores.anti_hits.length : 0;

    const row = {
      id: c.id,
      specificity: scores.specificity,
      trade_off_awareness: scores.trade_off_awareness,
      expected_coverage: `${Math.round(expectedCoverage * 100)}% (${scores.expected_hits?.length || 0}/${c.expected_traits.length})`,
      anti_hits: antiHits,
      gen_ms: genMs,
      judge_ms: judgeMs,
      reasons: {
        specificity: scores.specificity_reason,
        trade_off: scores.trade_off_awareness_reason,
      },
    };
    results.push(row);
    fs.writeFileSync(path.join(OUT_DIR, `${c.id}.scores.json`), JSON.stringify(scores, null, 2));
    console.error(`[${c.id}] spec=${row.specificity} tradeoff=${row.trade_off_awareness} coverage=${row.expected_coverage} anti=${row.anti_hits}`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(results, null, 2));
  console.error('\n=== SUMMARY ===');
  for (const r of results) {
    console.error(`${r.id}: spec=${r.specificity}/10, tradeoff=${r.trade_off_awareness}/10, coverage=${r.expected_coverage}, anti=${r.anti_hits} (gen ${r.gen_ms}ms, judge ${r.judge_ms}ms)`);
  }
}

main();
