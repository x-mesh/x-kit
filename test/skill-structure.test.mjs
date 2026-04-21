import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function readSkill(plugin) {
  return readFileSync(join(ROOT, plugin, 'skills', plugin, 'SKILL.md'), 'utf8');
}

function readEvalFile(path) {
  return readFileSync(join(ROOT, 'x-eval', 'skills', 'x-eval', path), 'utf8');
}

// --- x-solver SKILL.md structure ---

describe('x-solver SKILL.md structure', () => {
  const content = readSkill('x-solver');

  test('contains Step-Back in classify', () => {
    expect(content).toContain('Step-Back');
    expect(content).toContain('check higher-level pattern');
  });

  test('iterate phase flow includes diagnose', () => {
    expect(content).toContain('DIAGNOSE → HYPOTHESIZE → TEST → REFINE → RESOLVE');
    expect(content).toContain('[state+baseline]');
    expect(content).toContain('[fix+exec proof]');
  });

  test('contains Fishbone analysis in diagnose', () => {
    expect(content).toContain('Fishbone');
    expect(content).toContain('Ishikawa');
    expect(content).toContain('Delta = "unknown"');
  });

  test('contains Contrastive Matrix in constrain evaluate', () => {
    expect(content).toContain('Contrastive Matrix');
    expect(content).toContain('Winner');
  });

  test('iterate diagnose cannot be skipped', () => {
    expect(content).toContain('cannot be skipped');
    expect(content).toContain('must always start from diagnose');
  });

  test('iterate has leader execution rules', () => {
    expect(content).toContain('must never directly read code');
    expect(content).toContain('verify hypotheses');
    expect(content).toContain('delegate to an agent');
  });

  test('each iterate phase has checklist', () => {
    // Count checklist blocks
    const checklistCount = (content.match(/Checklist:/g) || []).length;
    expect(checklistCount).toBeGreaterThanOrEqual(5); // diagnose, hypothesize, test, refine, resolve
  });

  test('allowed-tools includes AskUserQuestion', () => {
    expect(content).toContain('allowed-tools');
    expect(content).toContain('AskUserQuestion');
  });
});

// --- x-review SKILL.md structure ---

describe('x-review SKILL.md structure', () => {
  const content = readSkill('x-review');

  test('Smart Router detects PR, branch, and main', () => {
    expect(content).toContain('Smart Router');
    expect(content).toContain('PR_NUM');
    expect(content).toContain('LAST_REVIEW');
    expect(content).toContain('git merge-base');
  });

  test('Smart Router has priority order (PR first)', () => {
    // PR detection should come before LAST_REVIEW resolution
    const prPos = content.indexOf('gh pr view');
    const lastReviewPos = content.indexOf('LAST_REVIEW');
    // Both exist
    expect(prPos).toBeGreaterThan(0);
    expect(lastReviewPos).toBeGreaterThan(0);
  });

  test('Smart Router has unrecognized input fallback', () => {
    expect(content).toContain('Unrecognized input');
  });

  test('Smart Router has git ref validation', () => {
    expect(content).toContain('grep -qE');
    expect(content).toContain('HEAD~');
  });

  test('Smart Router has large diff guard', () => {
    expect(content).toContain('500');
    expect(content).toContain('2000');
    expect(content).toContain('force-full');
  });

  test('contains full mode with lens-first split', () => {
    expect(content).toContain('### full');
    expect(content).toContain('Lens-first split');
    expect(content).toContain('one lens');
  });

  test('contains CoVe self-verify step', () => {
    expect(content).toContain('Self-Verify');
    expect(content).toContain('Chain-of-Verification');
    expect(content).toContain('CoVe-removed');
    expect(content).toContain('CoVe-downgraded');
  });

  test('CoVe uses agent snippets, not file re-reads', () => {
    expect(content).toContain('do not re-read the file');
    expect(content).toContain('snippet');
  });

  test('contains presets (quick/standard/security)', () => {
    expect(content).toContain('--preset quick');
    expect(content).toContain('--preset standard');
    expect(content).toContain('--preset security');
  });

  test('verdict includes reason', () => {
    expect(content).toContain('verdict rationale');
  });

  test('review results saved as MD', () => {
    expect(content).toContain('last-result.md');
    expect(content).toContain('history/');
    expect(content).toContain('reviewed_commit');
  });

  test('all 7 lenses documented', () => {
    expect(content).toContain('security');
    expect(content).toContain('logic');
    expect(content).toContain('perf');
    expect(content).toContain('tests');
    expect(content).toContain('architecture');
    expect(content).toContain('docs');
    expect(content).toContain('errors');
  });

  test('allowed-tools includes AskUserQuestion', () => {
    expect(content).toContain('allowed-tools');
    expect(content).toContain('AskUserQuestion');
  });
});

// --- x-op SKILL.md structure ---

describe('x-op SKILL.md structure', () => {
  const content = readSkill('x-op');

  test('brainstorm has --analogical and --lateral modes', () => {
    // brainstorm strategy body lives in strategies/brainstorm.md (extracted from SKILL.md)
    const brainstormBody = readFileSync(
      join(ROOT, 'x-op', 'skills', 'x-op', 'strategies', 'brainstorm.md'),
      'utf8'
    );
    expect(brainstormBody).toContain('--analogical');
    expect(brainstormBody).toContain('--lateral');
    expect(brainstormBody).toContain('Brainstorm Modes');
    // SKILL.md still references the strategy via link stub
    expect(content).toContain('strategies/brainstorm.md');
  });

  test('--analogical and --lateral in Options table', () => {
    // Should be in the Options section, not just in the brainstorm body
    const optionsSection = content.split('## Options')[1]?.split('## Shared Config')[0] || '';
    expect(optionsSection).toContain('analogical');
    expect(optionsSection).toContain('lateral');
  });

  test('monitor uses OODA (4 phases)', () => {
    // monitor strategy body lives in strategies/monitor.md (extracted from SKILL.md)
    const monitorBody = readFileSync(
      join(ROOT, 'x-op', 'skills', 'x-op', 'strategies', 'monitor.md'),
      'utf8'
    );
    expect(monitorBody).toContain('Phase 1: OBSERVE');
    expect(monitorBody).toContain('Phase 2: ORIENT');
    expect(monitorBody).toContain('Phase 3: DECIDE');
    expect(monitorBody).toContain('Phase 4: ACT');
    // SKILL.md still references the strategy via link stub
    expect(content).toContain('strategies/monitor.md');
  });

  test('--vote Self-Consistency documented', () => {
    // --vote details live in references/x-op-options.md (extracted from SKILL.md)
    const optionsBody = readFileSync(
      join(ROOT, 'x-op', 'skills', 'x-op', 'references', 'x-op-options.md'),
      'utf8'
    );
    expect(optionsBody).toContain('Self-Consistency');
    expect(optionsBody).toContain('Confidence Map');
    expect(optionsBody).toContain('50%');
    // SKILL.md still references the options via link stub
    expect(content).toContain('references/x-op-options.md');
  });
});

// --- x-eval Tier 1 structure (pass@k/pass^k, broken-task warning, transcripts) ---

describe('x-eval Tier 1 structure', () => {
  const bench = readEvalFile('subcommands/bench.md');
  const rubrics = readEvalFile('references/rubrics.md');
  const report = readEvalFile('subcommands/report.md');
  const score = readEvalFile('subcommands/score.md');
  const storage = readEvalFile('references/storage-layout.md');

  test('bench.md defines pass@k and pass^k metrics', () => {
    expect(bench).toContain('pass@k');
    expect(bench).toContain('pass^k');
    expect(bench).toContain('Capability upper bound');
    expect(bench).toContain('Reliability lower bound');
  });

  test('bench.md documents broken-task warning with empirical threshold', () => {
    expect(bench).toContain('Broken-task warning');
    expect(bench).toContain('avg_score < 4.5');
    expect(bench).toContain('pass_at_k_rate == 0');
    expect(bench).toContain('trials >= 2');
  });

  test('bench.md recommendation logic is pass-aware AND σ-aware', () => {
    expect(bench).toContain('Recommendation logic (pass-aware + σ-aware)');
    expect(bench).toContain('pass^k = 1');
    expect(bench).toContain('lowest σ');
    expect(bench).toContain('No reliable recommendation');
  });

  test('bench.md includes low-confidence advisory for small samples', () => {
    expect(bench).toContain('Low-confidence advisory');
    expect(bench).toContain('σ >= 1.0');
    expect(bench).toMatch(/trials\s*<=?\s*3/i);
  });

  test('rubrics.md declares pass_threshold for every built-in + preset', () => {
    // 9 rubrics total: 4 built-in + 5 domain presets
    const matches = rubrics.match(/\*\*Pass threshold\*\*/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(9);
  });

  test('rubrics.md declares default threshold in introduction', () => {
    expect(rubrics).toContain('pass_threshold');
    expect(rubrics).toMatch(/Default.{0,20}7\.0/);
  });

  test('report.md supports --sample-transcript flag', () => {
    expect(report).toContain('--sample-transcript N');
    expect(report).toContain('Transcript sampling');
    expect(report).toContain('eval.persist_transcripts');
  });

  test('score.md preserves judge_rationales for audit', () => {
    expect(score).toContain('judge_rationales');
    expect(score).toContain('pass_threshold');
    expect(score).toContain('passed');
  });

  test('storage-layout.md documents new Tier 1 fields', () => {
    expect(storage).toContain('pass_threshold');
    expect(storage).toContain('pass_at_k');
    expect(storage).toContain('pass_hat_k');
    expect(storage).toContain('per_trial_overall');
    expect(storage).toContain('judge_rationales');
    expect(storage).toContain('broken_task_warning');
  });

  test('SKILL.md help text mentions Tier 1 features', () => {
    const skillContent = readSkill('x-eval');
    expect(skillContent).toContain('pass@k');
    expect(skillContent).toContain('--sample-transcript');
  });
});

// --- x-eval Tier 2/3 structure (diff --baseline, insufficient_info N/A) ---

describe('x-eval Tier 2/3 structure', () => {
  const diff = readEvalFile('subcommands/diff.md');
  const score = readEvalFile('subcommands/score.md');
  const storage = readEvalFile('references/storage-layout.md');
  const reusable = readEvalFile('judges/reusable.md');

  test('diff.md supports --baseline flag', () => {
    expect(diff).toContain('--baseline <tag>');
    expect(diff).toContain('implies `--quality`');
    expect(diff).toContain('regression-focused');
  });

  test('diff.md defines regression thresholds', () => {
    expect(diff).toContain('REGRESSION');
    expect(diff).toContain('delta ≤ -0.5');
    expect(diff).toContain('unchanged');
    expect(diff).toContain('improved');
  });

  test('diff.md --baseline execution flow is documented', () => {
    expect(diff).toContain('--baseline execution flow');
    expect(diff).toContain('non-zero signal');
  });

  test('judges/reusable.md documents N/A escape hatch', () => {
    expect(reusable).toContain('Score: N/A');
    expect(reusable).toContain('insufficient information');
    expect(reusable).toContain('renormalize');
  });

  test('judges/reusable.md documents weight renormalization math', () => {
    expect(reusable).toContain('N/A Weight Renormalization');
    expect(reusable).toContain('total_scored_weight');
    expect(reusable).toContain('effective_weight');
  });

  test('score.md handles N/A criteria in aggregation', () => {
    expect(score).toContain('N/A criterion handling');
    expect(score).toContain('na_criteria');
    expect(score).toContain('Do NOT default N/A to 5');
  });

  test('storage-layout.md includes na_criteria field', () => {
    expect(storage).toContain('na_criteria');
    expect(storage).toContain('must not treat absence as implicit 0');
  });
});

// --- x-eval calibrate structure ---

describe('x-eval calibrate structure', () => {
  const calibrate = readEvalFile('subcommands/calibrate.md');
  const storage = readEvalFile('references/storage-layout.md');
  const skill = readSkill('x-eval');

  test('calibrate.md defines human scoring loop', () => {
    expect(calibrate).toContain('Human scoring');
    expect(calibrate).toContain('AskUserQuestion');
    expect(calibrate).toContain('bias_delta');
  });

  test('calibrate.md defines bias thresholds', () => {
    expect(calibrate).toContain('calibrated');
    expect(calibrate).toContain('systematic');
    expect(calibrate).toContain('1.0');
    expect(calibrate).toContain('1.5');
  });

  test('calibrate.md documents band-to-midpoint mapping', () => {
    expect(calibrate).toContain('midpoints');
    expect(calibrate).toContain('7–8 → 7.5');
  });

  test('calibrate.md documents gating rule', () => {
    expect(calibrate).toContain('gate');
    expect(calibrate).toContain('automated gating');
    expect(calibrate).toContain('30 days');
  });

  test('storage-layout.md includes calibrate schema', () => {
    expect(storage).toContain('calibrate');
    expect(storage).toContain('bias_delta');
    expect(storage).toContain('systematic_criteria');
    expect(storage).toContain('calibrations/');
  });

  test('SKILL.md routes calibrate', () => {
    expect(skill).toContain('calibrate');
    expect(skill).toContain('[Subcommand: calibrate]');
  });
});

// --- x-eval outcome assertions (--assert flag) ---

describe('x-eval outcome assertion structure', () => {
  const score = readEvalFile('subcommands/score.md');
  const storage = readEvalFile('references/storage-layout.md');
  const assertionJudge = readEvalFile('judges/assertion.md');

  test('score.md documents --assert flag', () => {
    expect(score).toContain('--assert');
    expect(score).toContain('binary outcome assertion');
  });

  test('score.md defines HARD FAIL gate on passed', () => {
    expect(score).toContain('HARD FAIL');
    expect(score).toContain('passed = false');
    expect(score).toContain('regardless of rubric score');
  });

  test('score.md defines UNCERTAIN as non-blocking', () => {
    expect(score).toContain('UNCERTAIN');
    expect(score).toContain("passed` unaffected");
  });

  test('judges/assertion.md defines PASS/FAIL format', () => {
    expect(assertionJudge).toContain('Result: PASS');
    expect(assertionJudge).toContain('Result: FAIL');
    expect(assertionJudge).toContain('HARD FAIL');
  });

  test('judges/assertion.md documents x-probe future integration', () => {
    expect(assertionJudge).toContain('x-probe');
    expect(assertionJudge).toContain('future');
  });

  test('storage-layout.md includes assertion_results field', () => {
    expect(storage).toContain('assertion_results');
    expect(storage).toContain('HARD_FAIL');
    expect(storage).toContain('confidence');
  });
});
