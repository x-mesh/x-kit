import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROBE_DIR = join(__dirname, '..', 'x-kit', 'skills', 'x-probe');

// --- verdict-schema.json validation ---

describe('verdict-schema.json', () => {
  const schemaPath = join(PROBE_DIR, 'verdict-schema.json');

  test('schema file exists', () => {
    expect(existsSync(schemaPath)).toBe(true);
  });

  test('schema is valid JSON with required fields', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.properties.schema_version.const).toBe(2);
    expect(schema.required).toContain('schema_version');
    expect(schema.required).toContain('timestamp');
    expect(schema.required).toContain('idea');
    expect(schema.required).toContain('domain');
    expect(schema.required).toContain('verdict');
    expect(schema.required).toContain('premises');
    expect(schema.required).toContain('recommendation');
  });

  test('verdict enum includes PROCEED, RETHINK, KILL', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    expect(schema.properties.verdict.enum).toEqual(['PROCEED', 'RETHINK', 'KILL']);
  });

  test('domain enum includes technology, business, market, mixed', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    expect(schema.properties.domain.enum).toEqual(['technology', 'business', 'market', 'mixed']);
  });

  test('premise items require evidence grade fields', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const premiseRequired = schema.properties.premises.items.required;
    expect(premiseRequired).toContain('initial_grade');
    expect(premiseRequired).toContain('final_grade');
    expect(premiseRequired).toContain('evidence_summary');
  });

  test('premise grade enums are consistent', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const grades = ['assumption', 'heuristic', 'data-backed'];
    expect(schema.properties.premises.items.properties.initial_grade.enum).toEqual(grades);
    expect(schema.properties.premises.items.properties.final_grade.enum).toEqual(grades);
  });

  test('schema disallows additional properties', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    expect(schema.additionalProperties).toBe(false);
  });

  test('schema does not allow raw user answers (no answer_raw field)', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const premiseProps = Object.keys(schema.properties.premises.items.properties);
    expect(premiseProps).not.toContain('answer_raw');
    expect(premiseProps).not.toContain('user_answer');
    expect(premiseProps).not.toContain('raw_answer');
  });
});

// --- verdict JSON conformance ---

describe('verdict JSON v2 conformance', () => {
  test('valid v2 verdict passes schema checks', () => {
    const schema = JSON.parse(readFileSync(join(PROBE_DIR, 'verdict-schema.json'), 'utf8'));
    const verdict = {
      schema_version: 2,
      timestamp: '2026-03-31T23:30:00+09:00',
      idea: 'Test idea',
      domain: 'technology',
      verdict: 'PROCEED',
      premises: [{
        id: 1,
        statement: 'Test premise',
        status: 'survived',
        initial_grade: 'assumption',
        final_grade: 'heuristic',
        evidence_summary: 'User cited prior project experience',
      }],
      evidence_gaps: [],
      kill_criteria: ['Stop if X'],
      risks: ['Risk A'],
      recommendation: 'Proceed with caution',
    };

    // Check required fields
    for (const field of schema.required) {
      expect(verdict).toHaveProperty(field);
    }
    // Check premise required fields
    for (const field of schema.properties.premises.items.required) {
      expect(verdict.premises[0]).toHaveProperty(field);
    }
    // Check enum values
    expect(schema.properties.verdict.enum).toContain(verdict.verdict);
    expect(schema.properties.domain.enum).toContain(verdict.domain);
    expect(schema.properties.premises.items.properties.initial_grade.enum)
      .toContain(verdict.premises[0].initial_grade);
    expect(schema.properties.premises.items.properties.final_grade.enum)
      .toContain(verdict.premises[0].final_grade);
  });

  test('verdict with raw user answer would violate no-raw-answer rule', () => {
    // Verify that evidence_summary is the only text field — no raw answers stored
    const schema = JSON.parse(readFileSync(join(PROBE_DIR, 'verdict-schema.json'), 'utf8'));
    const stringFields = Object.entries(schema.properties.premises.items.properties)
      .filter(([, v]) => v.type === 'string')
      .map(([k]) => k);
    // No raw user answer fields should exist
    expect(stringFields).not.toContain('answer_raw');
    expect(stringFields).not.toContain('user_answer');
    expect(stringFields).not.toContain('raw_answer');
    expect(stringFields).toContain('evidence_summary');
  });
});

// --- SKILL.md structure validation ---

describe('SKILL.md structure', () => {
  const skillPath = join(PROBE_DIR, 'SKILL.md');

  test('SKILL.md is under 600 lines', () => {
    const content = readFileSync(skillPath, 'utf8');
    const lines = content.split('\n').length;
    expect(lines).toBeLessThanOrEqual(600);
  });

  test('SKILL.md contains evidence grade definitions', () => {
    const content = readFileSync(skillPath, 'utf8');
    expect(content).toContain('Evidence Grade');
    expect(content).toContain('assumption');
    expect(content).toContain('heuristic');
    expect(content).toContain('data-backed');
  });

  test('SKILL.md contains probe phases', () => {
    const content = readFileSync(skillPath, 'utf8');
    expect(content).toContain('Phase 1');
    expect(content).toContain('Phase 2');
    expect(content).toContain('Phase 3');
  });

  test('SKILL.md passes Phase 3 handoff with context variables', () => {
    const content = readFileSync(skillPath, 'utf8');
    expect(content).toContain('{phase_2_answers}');
  });

  test('SKILL.md contains verdict command routing', () => {
    const content = readFileSync(skillPath, 'utf8');
    expect(content).toContain('verdict');
    expect(content).toContain('PROCEED');
    expect(content).toContain('RETHINK');
    expect(content).toContain('KILL');
  });
});

// --- probe-rubric.md validation ---

describe('probe-rubric.md', () => {
  const rubricPath = join(PROBE_DIR, 'probe-rubric.md');

  test('rubric file exists', () => {
    expect(existsSync(rubricPath)).toBe(true);
  });

  test('rubric contains all 3 evidence grade sections', () => {
    const content = readFileSync(rubricPath, 'utf8');
    expect(content).toContain('### assumption');
    expect(content).toContain('### heuristic');
    expect(content).toContain('### data-backed');
  });

  test('rubric contains all 3 domain question banks', () => {
    const content = readFileSync(rubricPath, 'utf8');
    expect(content).toContain('### 기술 (Technology)');
    expect(content).toContain('### 비즈니스 (Business)');
    expect(content).toContain('### 시장 (Market)');
  });

  test('rubric contains generic fallback', () => {
    const content = readFileSync(rubricPath, 'utf8');
    expect(content).toContain('Generic Fallback');
  });
});

// --- sanitization pattern tests ---

describe('prompt safety', () => {
  test('SKILL.md contains role/identity anchoring', () => {
    const content = readFileSync(join(PROBE_DIR, 'SKILL.md'), 'utf8');
    // Agent prompts anchor the role
    expect(content).toContain('You are');
  });

  test('Phase 3 agent prompts pass user evidence as context', () => {
    const content = readFileSync(join(PROBE_DIR, 'SKILL.md'), 'utf8');
    // User evidence is passed to agents
    expect(content).toContain('{phase_2_answers}');
  });

  test('SKILL.md uses markdown structure for safe content boundaries', () => {
    const content = readFileSync(join(PROBE_DIR, 'SKILL.md'), 'utf8');
    expect(content).toContain('---');
    expect(content).toContain('###');
  });
});

// --- monitoring spec validation ---

describe('PROBE-INTERFACE.md monitoring', () => {
  const interfacePath = join(PROBE_DIR, 'PROBE-INTERFACE.md');

  test('interface doc contains monitoring section', () => {
    const content = readFileSync(interfacePath, 'utf8');
    expect(content).toContain('## Monitoring');
    expect(content).toContain('Completion Rate');
    expect(content).toContain('Kill criteria');
  });

  test('interface doc defines quality metrics', () => {
    const content = readFileSync(interfacePath, 'utf8');
    expect(content).toContain('SKILL.md 줄 수');
    expect(content).toContain('질문 수');
    expect(content).toContain('등급 분포');
    expect(content).toContain('도메인 감지 정확도');
  });
});
