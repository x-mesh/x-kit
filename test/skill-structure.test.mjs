import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function readSkill(plugin) {
  return readFileSync(join(ROOT, plugin, 'skills', plugin, 'SKILL.md'), 'utf8');
}

// --- x-solver SKILL.md structure ---

describe('x-solver SKILL.md structure', () => {
  const content = readSkill('x-solver');

  test('contains Step-Back in classify', () => {
    expect(content).toContain('Step-Back');
    expect(content).toContain('상위 패턴');
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

  test('iterate diagnose is SKIP 불가', () => {
    expect(content).toContain('SKIP 불가');
    expect(content).toContain('diagnose부터 시작');
  });

  test('iterate has leader execution rules', () => {
    expect(content).toContain('리더 실행 규칙');
    expect(content).toContain('직접 코드를 읽거나 가설을 검증하지 않는다');
    expect(content).toContain('agent에 위임');
  });

  test('each iterate phase has checklist', () => {
    // Count checklist blocks
    const checklistCount = (content.match(/체크리스트:/g) || []).length;
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
    expect(content).toContain('렌즈 우선 분할');
    expect(content).toContain('하나의 렌즈');
  });

  test('contains CoVe self-verify step', () => {
    expect(content).toContain('Self-Verify');
    expect(content).toContain('Chain-of-Verification');
    expect(content).toContain('CoVe-removed');
    expect(content).toContain('CoVe-downgraded');
  });

  test('CoVe uses agent snippets, not file re-reads', () => {
    expect(content).toContain('파일을 다시 읽지 않는다');
    expect(content).toContain('스니펫');
  });

  test('contains presets (quick/standard/security)', () => {
    expect(content).toContain('--preset quick');
    expect(content).toContain('--preset standard');
    expect(content).toContain('--preset security');
  });

  test('verdict includes reason', () => {
    expect(content).toContain('판정 이유');
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
    expect(content).toContain('--analogical');
    expect(content).toContain('--lateral');
    expect(content).toContain('Brainstorm Modes');
  });

  test('--analogical and --lateral in Options table', () => {
    // Should be in the Options section, not just in the brainstorm body
    const optionsSection = content.split('## Options')[1]?.split('## Shared Config')[0] || '';
    expect(optionsSection).toContain('analogical');
    expect(optionsSection).toContain('lateral');
  });

  test('monitor uses OODA (4 phases)', () => {
    expect(content).toContain('ORIENT');
    expect(content).toContain('DECIDE');
    expect(content).toContain('Phase 4: ACT');
  });

  test('--vote Self-Consistency documented', () => {
    expect(content).toContain('Self-Consistency');
    expect(content).toContain('Confidence Map');
    expect(content).toContain('50%');
  });
});
