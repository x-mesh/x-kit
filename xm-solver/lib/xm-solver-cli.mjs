#!/usr/bin/env node

/**
 * xm-solver — Structured Problem Solving CLI
 * term-mesh 생태계의 범용 문제 해결 도구
 *
 * Usage: node xm-solver-cli.mjs <command> [args] [options]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ROOT resolution:
// 1. XM_SOLVER_ROOT env var (explicit override)
// 2. --global flag → ~/.xm/solver/
// 3. default → cwd/.xm/solver/
const XM_GLOBAL = process.argv.includes('--global');
const ROOT = process.env.XM_SOLVER_ROOT
  ? resolve(process.env.XM_SOLVER_ROOT)
  : XM_GLOBAL
    ? resolve(homedir(), '.xm', 'solver')
    : resolve(process.cwd(), '.xm', 'solver');

const PLUGIN_ROOT = resolve(__dirname, '..');

// ── Constants ────────────────────────────────────────────────────────

const PHASES = [
  { id: '01-intake',   name: 'intake',   label: 'Intake' },
  { id: '02-classify', name: 'classify', label: 'Classify' },
  { id: '03-solve',    name: 'solve',    label: 'Solve' },
  { id: '04-verify',   name: 'verify',   label: 'Verify' },
  { id: '05-close',    name: 'close',    label: 'Close' },
];

const STRATEGIES = {
  DECOMPOSE: 'decompose',
  ITERATE: 'iterate',
  CONSTRAIN: 'constrain',
  PIPELINE: 'pipeline',
};

const STRATEGY_LABELS = {
  decompose: { name: 'Decompose', icon: '🌳', desc: 'Tree-of-Thought: break into sub-problems, solve each, merge' },
  iterate:   { name: 'Iterate',   icon: '🔄', desc: 'Hypothesis → Test → Refine loop for debugging' },
  constrain: { name: 'Constrain', icon: '🎯', desc: 'Constraint satisfaction: define constraints, score candidates' },
  pipeline:  { name: 'Pipeline',  icon: '🔀', desc: 'Auto-detect problem type and route to best strategy' },
};

const SOLVE_PHASES = {
  decompose: ['decompose', 'explore', 'evaluate', 'synthesize'],
  iterate:   ['hypothesize', 'test', 'refine', 'resolve'],
  constrain: ['elicit', 'generate', 'evaluate', 'select'],
  pipeline:  ['classify', 'route', 'meta-verify'],
};

const PROBLEM_STATES = {
  ACTIVE: 'active',
  SOLVED: 'solved',
  CLOSED: 'closed',
  ABANDONED: 'abandoned',
};

// ── ANSI Colors ──────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const C = isTTY ? {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
} : Object.fromEntries(['reset','bold','dim','red','green','yellow','blue','magenta','cyan'].map(k => [k, '']));

function renderBar(done, total, width = 20) {
  if (total === 0) return `[${C.dim}${'░'.repeat(width)}${C.reset}] 0%`;
  const ratio = done / total;
  const filled = Math.round(ratio * width);
  const pct = Math.round(ratio * 100);
  return `[${C.green}${'█'.repeat(filled)}${C.dim}${'░'.repeat(width - filled)}${C.reset}] ${pct}% ${done}/${total}`;
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ── I/O Helpers ──────────────────────────────────────────────────────

function readJSON(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJSON(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function readMD(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function writeMD(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function loadConfig() {
  return readJSON(join(ROOT, 'config.json')) || {};
}

function loadSharedConfig() {
  // Shared config: ROOT is .xm/solver/ → shared = .xm/config.json
  const sharedPath = join(ROOT, '..', 'config.json');
  const local = readJSON(sharedPath);
  if (local) return local;
  // Fallback to global config (~/.xm/config.json)
  const globalPath = join(homedir(), '.xm', 'config.json');
  return readJSON(globalPath) || {};
}

function getMode() {
  // Priority: local config → shared config → default
  const localMode = loadConfig().mode;
  if (localMode) return localMode;
  const sharedMode = loadSharedConfig().mode;
  if (sharedMode) return sharedMode;
  return 'developer';
}

function getAgentCount() {
  const shared = loadSharedConfig();
  return shared.agent_max_count ?? 4;
}

function parseOptions(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        opts[key] = next;
        i++;
      } else {
        opts[key] = true;
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { opts, positional };
}

// ── Path Helpers ─────────────────────────────────────────────────────

function problemsDir() {
  return join(ROOT, 'problems');
}

function problemDir(name) {
  return join(problemsDir(), name);
}

function manifestPath(name) {
  return join(problemDir(name), 'manifest.json');
}

function phaseDir(problem, phaseId) {
  return join(problemDir(problem), 'phases', phaseId);
}

function intakePath(problem) {
  return phaseDir(problem, '01-intake');
}

function classifyPath(problem) {
  return phaseDir(problem, '02-classify');
}

function solvePath(problem) {
  return phaseDir(problem, '03-solve');
}

function verifyPath(problem) {
  return phaseDir(problem, '04-verify');
}

function closePath(problem) {
  return phaseDir(problem, '05-close');
}

// ── Problem Manager ──────────────────────────────────────────────────

function findCurrentProblem() {
  const dir = problemsDir();
  if (!existsSync(dir)) return null;
  const problems = readdirSync(dir).filter(d =>
    existsSync(manifestPath(d))
  );

  // Find most recent active problem
  let latest = null;
  let latestTime = 0;
  for (const p of problems) {
    const m = readJSON(manifestPath(p));
    if (m && m.state === PROBLEM_STATES.ACTIVE) {
      const t = new Date(m.updated_at || m.created_at).getTime();
      if (t > latestTime) {
        latestTime = t;
        latest = p;
      }
    }
  }
  return latest;
}

function requireProblem(args) {
  const { opts } = parseOptions(args || []);
  const problem = opts.problem || findCurrentProblem();
  if (!problem) {
    console.error('❌ No active problem. Run: xm-solver init "description"');
    process.exit(1);
  }
  if (!existsSync(manifestPath(problem))) {
    console.error(`❌ Problem "${problem}" not found.`);
    process.exit(1);
  }
  return problem;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

// ── Init ─────────────────────────────────────────────────────────────

function cmdInit(args) {
  const description = args.join(' ').trim();
  if (!description) {
    console.error('Usage: xm-solver init "problem description"');
    process.exit(1);
  }

  mkdirSync(problemsDir(), { recursive: true });

  const slug = slugify(description) || `problem-${Date.now()}`;
  const dir = problemDir(slug);

  if (existsSync(dir)) {
    console.error(`❌ Problem "${slug}" already exists.`);
    process.exit(1);
  }

  // Create phase directories
  for (const phase of PHASES) {
    mkdirSync(phaseDir(slug, phase.id), { recursive: true });
  }

  // Create manifest
  const manifest = {
    name: slug,
    display_name: description,
    current_phase: '01-intake',
    strategy: null,
    state: PROBLEM_STATES.ACTIVE,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    closed_at: null,
  };
  writeJSON(manifestPath(slug), manifest);

  // Init intake files
  writeMD(join(intakePath(slug), 'description.md'), `# Problem\n\n${description}\n`);
  writeJSON(join(intakePath(slug), 'context.json'), { items: [] });
  writeJSON(join(intakePath(slug), 'constraints.json'), { constraints: [] });

  // Init solve files
  writeJSON(join(solvePath(slug), 'candidates.json'), { candidates: [] });
  writeJSON(join(solvePath(slug), 'strategy-state.json'), {});

  console.log(`\n✅ Problem initialized: ${C.bold}${slug}${C.reset}`);
  console.log(`   ${C.dim}${description}${C.reset}`);
  console.log(`\n   Phase: ${C.cyan}Intake${C.reset}`);
  console.log(`   Next: describe, context add, constraints add, or classify\n`);

  // Output JSON for SKILL.md consumption
  console.log(JSON.stringify({
    action: 'init',
    problem: slug,
    description,
    phase: 'intake',
  }));
}

// ── List ─────────────────────────────────────────────────────────────

function cmdList() {
  const dir = problemsDir();
  if (!existsSync(dir)) {
    console.log('No problems yet. Run: xm-solver init "description"');
    return;
  }

  const problems = readdirSync(dir).filter(d => existsSync(manifestPath(d)));
  if (problems.length === 0) {
    console.log('No problems yet. Run: xm-solver init "description"');
    return;
  }

  console.log(`\n${C.bold}Problems${C.reset} (${problems.length})\n`);

  const stateIcons = {
    active: '🔵', solved: '✅', closed: '⬜', abandoned: '⛔',
  };

  for (const p of problems) {
    const m = readJSON(manifestPath(p));
    const phase = PHASES.find(ph => ph.id === m.current_phase);
    const icon = stateIcons[m.state] || '❓';
    const strategy = m.strategy ? ` [${STRATEGY_LABELS[m.strategy]?.icon || ''}${m.strategy}]` : '';
    console.log(`  ${icon} ${C.bold}${p}${C.reset}${strategy}`);
    console.log(`    ${C.dim}${m.display_name}${C.reset}`);
    console.log(`    Phase: ${phase?.label || m.current_phase}  |  ${m.created_at?.slice(0, 10)}`);
    console.log();
  }
}

// ── Status ───────────────────────────────────────────────────────────

function cmdStatus(args) {
  const problem = requireProblem(args);
  const m = readJSON(manifestPath(problem));
  const phase = PHASES.find(ph => ph.id === m.current_phase);
  const phaseIdx = PHASES.findIndex(ph => ph.id === m.current_phase);

  console.log(`\n${C.bold}Problem: ${m.display_name}${C.reset}`);
  console.log(`  State: ${m.state}  |  Strategy: ${m.strategy || 'not set'}`);
  console.log(`  Created: ${m.created_at?.slice(0, 19)}\n`);

  // Phase progress bar
  const phaseBar = PHASES.map((ph, i) => {
    if (i < phaseIdx) return `${C.green}✓ ${ph.label}${C.reset}`;
    if (i === phaseIdx) return `${C.cyan}▶ ${ph.label}${C.reset}`;
    return `${C.dim}○ ${ph.label}${C.reset}`;
  }).join('  →  ');
  console.log(`  ${phaseBar}\n`);

  // Strategy-specific details
  if (m.strategy) {
    const stratState = readJSON(join(solvePath(problem), 'strategy-state.json'));
    if (stratState && stratState.strategy) {
      const info = STRATEGY_LABELS[m.strategy];
      console.log(`  ${C.bold}Strategy: ${info?.icon} ${info?.name}${C.reset}`);
      if (stratState.current_phase) {
        const phases = SOLVE_PHASES[m.strategy] || [];
        const solveIdx = phases.indexOf(stratState.current_phase);
        console.log(`  Solve phase: ${stratState.current_phase} (${solveIdx + 1}/${phases.length})`);
      }
    }
  }

  // Constraints count
  const constraints = readJSON(join(intakePath(problem), 'constraints.json'));
  if (constraints?.constraints?.length) {
    console.log(`  Constraints: ${constraints.constraints.length}`);
  }

  // Candidates count
  const candidates = readJSON(join(solvePath(problem), 'candidates.json'));
  if (candidates?.candidates?.length) {
    console.log(`  Candidates: ${candidates.candidates.length}`);
  }

  // Classification
  const classification = readJSON(join(classifyPath(problem), 'classification.json'));
  if (classification) {
    console.log(`  Classification: ${classification.recommended_strategy} (confidence: ${Math.round(classification.confidence * 100)}%)`);
  }

  console.log();

  // JSON output for SKILL.md
  console.log(JSON.stringify({
    action: 'status',
    problem,
    phase: phase?.name,
    phase_index: phaseIdx,
    strategy: m.strategy,
    state: m.state,
    constraints_count: constraints?.constraints?.length || 0,
    candidates_count: candidates?.candidates?.length || 0,
  }));
}

// ── Describe ─────────────────────────────────────────────────────────

function cmdDescribe(args) {
  const problem = requireProblem(args);
  const { opts } = parseOptions(args);

  if (!opts.content) {
    // Show current description
    const desc = readMD(join(intakePath(problem), 'description.md'));
    console.log(desc || '(No description set)');
    return;
  }

  writeMD(join(intakePath(problem), 'description.md'), opts.content);
  const m = readJSON(manifestPath(problem));
  m.updated_at = new Date().toISOString();
  writeJSON(manifestPath(problem), m);
  console.log('✅ Description updated.');
}

// ── Context ──────────────────────────────────────────────────────────

function cmdContext(args) {
  const sub = args[0];
  const problem = requireProblem(args.slice(1));
  const contextFile = join(intakePath(problem), 'context.json');

  if (sub === 'add') {
    const { opts } = parseOptions(args.slice(1));
    if (!opts.content) {
      console.error('Usage: xm-solver context add --content "..."');
      process.exit(1);
    }
    const data = readJSON(contextFile) || { items: [] };
    data.items.push({
      id: `ctx-${data.items.length + 1}`,
      content: opts.content,
      type: opts.type || 'text',
      added_at: new Date().toISOString(),
    });
    writeJSON(contextFile, data);
    console.log(`✅ Context added (${data.items.length} items total).`);
  } else if (sub === 'list') {
    const data = readJSON(contextFile) || { items: [] };
    if (data.items.length === 0) {
      console.log('No context items yet.');
      return;
    }
    console.log(`\n${C.bold}Context Items${C.reset} (${data.items.length})\n`);
    for (const item of data.items) {
      console.log(`  ${C.cyan}${item.id}${C.reset} [${item.type}] ${item.added_at?.slice(0, 10)}`);
      console.log(`    ${item.content.slice(0, 100)}${item.content.length > 100 ? '...' : ''}`);
      console.log();
    }
  } else {
    console.error('Usage: xm-solver context <add|list> [--content "..."]');
    process.exit(1);
  }
}

// ── Constraints ──────────────────────────────────────────────────────

function cmdConstraints(args) {
  const sub = args[0];
  const problem = requireProblem(args.slice(1));
  const constraintFile = join(intakePath(problem), 'constraints.json');

  if (sub === 'add') {
    const { opts, positional } = parseOptions(args.slice(1));
    const description = positional.join(' ') || opts.content;
    if (!description) {
      console.error('Usage: xm-solver constraints add "description" [--type hard|soft|preference]');
      process.exit(1);
    }
    const data = readJSON(constraintFile) || { constraints: [] };
    const constraint = {
      id: `c${data.constraints.length + 1}`,
      type: opts.type || 'hard',
      description,
      dimension: opts.dimension || 'general',
      created_at: new Date().toISOString(),
    };
    data.constraints.push(constraint);
    writeJSON(constraintFile, data);
    console.log(`✅ Constraint ${constraint.id} added [${constraint.type}]: ${description}`);
  } else if (sub === 'list') {
    const data = readJSON(constraintFile) || { constraints: [] };
    if (data.constraints.length === 0) {
      console.log('No constraints yet.');
      return;
    }
    const typeIcons = { hard: '🔴', soft: '🟡', preference: '🟢' };
    console.log(`\n${C.bold}Constraints${C.reset} (${data.constraints.length})\n`);
    for (const c of data.constraints) {
      console.log(`  ${typeIcons[c.type] || '⬜'} ${C.bold}${c.id}${C.reset} [${c.type}] ${c.description}`);
    }
    console.log();
  } else if (sub === 'remove') {
    const { positional } = parseOptions(args.slice(1));
    const id = positional[0];
    if (!id) {
      console.error('Usage: xm-solver constraints remove <id>');
      process.exit(1);
    }
    const data = readJSON(constraintFile) || { constraints: [] };
    const idx = data.constraints.findIndex(c => c.id === id);
    if (idx === -1) {
      console.error(`❌ Constraint "${id}" not found.`);
      process.exit(1);
    }
    data.constraints.splice(idx, 1);
    writeJSON(constraintFile, data);
    console.log(`✅ Constraint ${id} removed.`);
  } else {
    console.error('Usage: xm-solver constraints <add|list|remove>');
    process.exit(1);
  }
}

// ── Classify ─────────────────────────────────────────────────────────

function cmdClassify(args) {
  const problem = requireProblem(args);
  const m = readJSON(manifestPath(problem));
  const description = readMD(join(intakePath(problem), 'description.md'));
  const contextData = readJSON(join(intakePath(problem), 'context.json')) || { items: [] };
  const constraintData = readJSON(join(intakePath(problem), 'constraints.json')) || { constraints: [] };

  // Signal detection
  const text = (description + ' ' + contextData.items.map(i => i.content).join(' ')).toLowerCase();
  const signals = {
    has_error: /error|exception|crash|fail|bug|panic|segfault|traceback|에러|오류|버그|실패|누수|leak|broken|깨진|안\s*됨|안\s*됩니다/.test(text),
    has_stack_trace: /at\s+\w|file:?\s*line|\.js:\d+|\.py:\d+|\.go:\d+|traceback|stack\s*trace/.test(text),
    has_code_context: contextData.items.some(i => i.type === 'code' || /```/.test(i.content)),
    has_design_question: /should\s+(i|we)|which|how\s+to\s+design|architecture|approach|best\s+way|어떤|어떻게|설계|아키텍처|방법|선택/.test(text),
    has_tradeoff: /vs\.?|or\s+|tradeoff|trade-off|pros?\s*(and|\/)\s*cons?|장단점|비교|좋을까/.test(text),
    has_performance: /slow|latency|timeout|performance|optimize|bottleneck|memory\s*usage|cpu|throughput|느림|느려|속도|최적화|병목|타임아웃|지연/.test(text),
    has_security: /vulnerab|injection|xss|csrf|auth\s*bypass|exploit|cve|owasp|secret|credential|보안|취약|인증|권한|토큰\s*유출/.test(text),
    has_infra: /deploy|scale|docker|kubernetes|k8s|ci\s*\/?\s*cd|terraform|helm|aws|gcp|azure|배포|스케일|인프라|컨테이너|클라우드/.test(text),
    has_multiple_dims: constraintData.constraints.length >= 3,
    word_count: text.split(/\s+/).length,
    constraint_count: constraintData.constraints.length,
    context_count: contextData.items.length,
  };

  // Complexity scoring
  const complexityScore = signals.word_count + signals.constraint_count * 10 + signals.context_count * 5;
  signals.complexity = complexityScore < 30 ? 'trivial' : complexityScore < 80 ? 'low' : complexityScore < 200 ? 'medium' : 'high';

  // Composite signal score — boost confidence when multiple signals align
  const signalCount = [signals.has_error, signals.has_stack_trace, signals.has_code_context,
    signals.has_design_question, signals.has_tradeoff, signals.has_performance,
    signals.has_security, signals.has_infra, signals.has_multiple_dims].filter(Boolean).length;
  const compositeBoost = signalCount >= 3 ? 0.1 : signalCount >= 2 ? 0.05 : 0;

  // Strategy routing
  let recommended;
  let confidence;
  let reasoning;

  if (signals.has_error && (signals.has_stack_trace || signals.has_code_context)) {
    recommended = STRATEGIES.ITERATE;
    confidence = 0.9;
    reasoning = 'Error/exception signals with code context suggest a debugging scenario';
  } else if (signals.has_error && signals.has_performance) {
    recommended = STRATEGIES.ITERATE;
    confidence = 0.85;
    reasoning = 'Error with performance signals — iterative profiling and fix loop recommended';
  } else if (signals.has_error) {
    recommended = STRATEGIES.ITERATE;
    confidence = 0.75;
    reasoning = 'Error/bug signals detected — iterative hypothesis-test loop recommended';
  } else if (signals.has_performance && !signals.has_design_question) {
    recommended = STRATEGIES.ITERATE;
    confidence = 0.8;
    reasoning = 'Performance issue detected — iterative profiling-measure-optimize loop recommended';
  } else if (signals.has_security) {
    recommended = STRATEGIES.ITERATE;
    confidence = 0.85;
    reasoning = 'Security vulnerability detected — systematic identify-verify-fix loop recommended';
  } else if (signals.has_design_question && signals.has_tradeoff) {
    recommended = STRATEGIES.CONSTRAIN;
    confidence = 0.85;
    reasoning = 'Design question with tradeoff indicators suggest constraint-based evaluation';
  } else if (signals.has_design_question) {
    recommended = STRATEGIES.CONSTRAIN;
    confidence = 0.7;
    reasoning = 'Design question detected — constraint-based evaluation recommended';
  } else if (signals.has_multiple_dims) {
    recommended = STRATEGIES.DECOMPOSE;
    confidence = signals.complexity === 'medium' || signals.complexity === 'high' ? 0.85 : 0.75;
    reasoning = 'Multiple dimensions (3+ constraints) suggest decomposition into sub-problems';
  } else if (signals.complexity === 'trivial' && !signals.has_error && !signals.has_design_question) {
    recommended = 'direct';
    confidence = 0.95;
    reasoning = 'Simple problem — may not need a full solving strategy';
  } else {
    recommended = STRATEGIES.PIPELINE;
    confidence = 0.6;
    reasoning = 'No strong signals detected — pipeline will auto-route after deeper analysis';
  }

  // Apply composite boost (cap at 0.95)
  confidence = Math.min(0.95, confidence + compositeBoost);

  // xm-op strategy recommendations based on signals
  const xmOpRecommendations = [];
  if (signals.has_error && signals.complexity !== 'trivial') xmOpRecommendations.push({ strategy: 'hypothesis', reason: '가설→반증으로 원인 진단' });
  if (signals.has_design_question && !signals.has_tradeoff) xmOpRecommendations.push({ strategy: 'socratic', reason: '질문 기반 요구사항 명확화' });
  if (signals.has_design_question && signals.has_multiple_dims) xmOpRecommendations.push({ strategy: 'persona', reason: '다관점 이해관계자 분석' });
  if (signals.has_security) xmOpRecommendations.push({ strategy: 'red-team', reason: '보안 공격/방어 시뮬레이션' });
  if (signals.has_performance) xmOpRecommendations.push({ strategy: 'hypothesis', reason: '성능 병목 가설 검증' });
  if (signals.has_infra && signals.has_tradeoff) xmOpRecommendations.push({ strategy: 'debate', reason: '인프라 선택지 찬반 토론' });

  const classification = {
    recommended_strategy: recommended,
    confidence,
    reasoning,
    signals,
    composite_boost: compositeBoost,
    xm_op_recommendations: xmOpRecommendations,
    alternative_strategies: Object.values(STRATEGIES).filter(s => s !== recommended),
    classified_at: new Date().toISOString(),
  };

  writeJSON(join(classifyPath(problem), 'classification.json'), classification);

  // Auto-advance phase
  if (m.current_phase === '01-intake') {
    m.current_phase = '02-classify';
    m.updated_at = new Date().toISOString();
    writeJSON(manifestPath(problem), m);
  }

  const info = STRATEGY_LABELS[recommended];
  console.log(`\n${C.bold}Classification Result${C.reset}\n`);
  console.log(`  Recommended: ${info?.icon || '📋'} ${C.bold}${recommended}${C.reset}`);
  console.log(`  Confidence:  ${Math.round(confidence * 100)}%`);
  console.log(`  Reasoning:   ${reasoning}\n`);

  console.log(`  ${C.dim}Signals:${C.reset}`);
  console.log(`    Error: ${signals.has_error}  Stack: ${signals.has_stack_trace}  Code: ${signals.has_code_context}`);
  console.log(`    Design: ${signals.has_design_question}  Tradeoff: ${signals.has_tradeoff}  Multi-dim: ${signals.has_multiple_dims}`);
  console.log(`    Performance: ${signals.has_performance}  Security: ${signals.has_security}  Infra: ${signals.has_infra}`);
  console.log(`    Complexity: ${signals.complexity} (score: ${complexityScore})\n`);

  if (compositeBoost > 0) {
    console.log(`  ${C.dim}Composite boost: +${Math.round(compositeBoost * 100)}% (${signalCount} signals)${C.reset}\n`);
  }

  if (xmOpRecommendations.length > 0) {
    console.log(`  ${C.bold}xm-op Alternatives:${C.reset}`);
    for (const rec of xmOpRecommendations) {
      console.log(`    /xm-op ${rec.strategy} — ${rec.reason}`);
    }
    console.log();
  }

  console.log(`  ${C.yellow}Run: xm-solver strategy set ${recommended}${C.reset}`);
  console.log(`  ${C.dim}Or choose another: xm-solver strategy set <decompose|iterate|constrain|pipeline>${C.reset}\n`);

  // JSON output
  console.log(JSON.stringify({
    action: 'classify',
    problem,
    ...classification,
  }));
}

// ── Strategy ─────────────────────────────────────────────────────────

function cmdStrategy(args) {
  const sub = args[0];
  const problem = requireProblem(args.slice(1));
  const m = readJSON(manifestPath(problem));

  if (sub === 'set') {
    const { positional } = parseOptions(args.slice(1));
    const strategy = positional[0];
    if (!strategy || !Object.values(STRATEGIES).includes(strategy)) {
      console.error(`Usage: xm-solver strategy set <${Object.values(STRATEGIES).join('|')}>`);
      process.exit(1);
    }

    m.strategy = strategy;
    if (m.current_phase === '01-intake' || m.current_phase === '02-classify') {
      m.current_phase = '03-solve';
    }
    m.updated_at = new Date().toISOString();
    writeJSON(manifestPath(problem), m);

    // Initialize strategy state
    const phases = SOLVE_PHASES[strategy];
    writeJSON(join(solvePath(problem), 'strategy-state.json'), {
      strategy,
      current_phase: phases[0],
      phases_completed: [],
      started_at: new Date().toISOString(),
    });

    // For iterate, init iterations
    if (strategy === STRATEGIES.ITERATE) {
      mkdirSync(join(solvePath(problem), 'iterations'), { recursive: true });
      writeJSON(join(solvePath(problem), 'strategy-state.json'), {
        strategy,
        current_phase: 'hypothesize',
        phases_completed: [],
        current_iteration: 0,
        max_iterations: loadConfig().solving?.max_iterations || 3,
        hypotheses: [],
        started_at: new Date().toISOString(),
      });
    }

    // For decompose, init tree
    if (strategy === STRATEGIES.DECOMPOSE) {
      writeJSON(join(solvePath(problem), 'strategy-state.json'), {
        strategy,
        current_phase: 'decompose',
        phases_completed: [],
        tree: {
          id: 'root',
          description: m.display_name,
          children: [],
          status: 'pending',
        },
        max_depth: loadConfig().solving?.max_depth || 2,
        started_at: new Date().toISOString(),
      });
    }

    // For constrain, init matrix
    if (strategy === STRATEGIES.CONSTRAIN) {
      writeJSON(join(solvePath(problem), 'strategy-state.json'), {
        strategy,
        current_phase: 'elicit',
        phases_completed: [],
        constraint_matrix: [],
        started_at: new Date().toISOString(),
      });
    }

    const info = STRATEGY_LABELS[strategy];
    console.log(`\n✅ Strategy set: ${info.icon} ${C.bold}${info.name}${C.reset}`);
    console.log(`   ${info.desc}`);
    console.log(`\n   Phase: ${C.cyan}Solve${C.reset} → ${phases[0]}`);
    console.log(`   Next: xm-solver solve\n`);
  } else if (sub === 'show' || !sub) {
    if (!m.strategy) {
      console.log('No strategy set. Run: xm-solver classify');
      return;
    }
    const info = STRATEGY_LABELS[m.strategy];
    const stratState = readJSON(join(solvePath(problem), 'strategy-state.json'));
    console.log(`\n  Strategy: ${info.icon} ${C.bold}${info.name}${C.reset}`);
    console.log(`  ${info.desc}`);
    if (stratState?.current_phase) {
      const phases = SOLVE_PHASES[m.strategy];
      const idx = phases.indexOf(stratState.current_phase);
      console.log(`  Solve phase: ${stratState.current_phase} (${idx + 1}/${phases.length})`);
      console.log(`  Completed: ${stratState.phases_completed?.join(', ') || 'none'}`);
    }
    console.log();
  } else {
    console.error('Usage: xm-solver strategy <set|show>');
    process.exit(1);
  }
}

// ── Solve ────────────────────────────────────────────────────────────

function cmdSolve(args) {
  const problem = requireProblem(args);
  const { opts } = parseOptions(args);
  const m = readJSON(manifestPath(problem));

  if (!m.strategy) {
    console.error('❌ No strategy set. Run: xm-solver classify or xm-solver strategy set <name>');
    process.exit(1);
  }

  if (m.current_phase !== '03-solve') {
    m.current_phase = '03-solve';
    m.updated_at = new Date().toISOString();
    writeJSON(manifestPath(problem), m);
  }

  const stratState = readJSON(join(solvePath(problem), 'strategy-state.json'));
  const phases = SOLVE_PHASES[m.strategy];
  const currentPhase = stratState.current_phase;
  const description = readMD(join(intakePath(problem), 'description.md'));
  const contextData = readJSON(join(intakePath(problem), 'context.json')) || { items: [] };
  const constraintData = readJSON(join(intakePath(problem), 'constraints.json')) || { constraints: [] };

  // Build context for agent prompts
  const problemContext = [
    description,
    constraintData.constraints.length > 0
      ? '\n## Constraints\n' + constraintData.constraints.map(c => `- [${c.type.toUpperCase()}] ${c.description}`).join('\n')
      : '',
    contextData.items.length > 0
      ? '\n## Additional Context\n' + contextData.items.map(i => i.content).join('\n\n')
      : '',
  ].join('\n');

  // Output JSON for SKILL.md to orchestrate agents
  const output = {
    action: 'solve',
    problem,
    strategy: m.strategy,
    current_phase: currentPhase,
    next_phase: phases[phases.indexOf(currentPhase) + 1] || null,
    step_only: !!opts.step,
    problem_context: problemContext,
    constraints: constraintData.constraints,
    strategy_state: stratState,
    candidates: readJSON(join(solvePath(problem), 'candidates.json'))?.candidates || [],
  };

  console.log(`\n${C.bold}Solving: ${m.display_name}${C.reset}`);
  console.log(`  Strategy: ${STRATEGY_LABELS[m.strategy]?.icon} ${m.strategy}`);
  console.log(`  Phase: ${C.cyan}${currentPhase}${C.reset}`);
  console.log(`  Progress: ${renderBar(phases.indexOf(currentPhase), phases.length)}\n`);

  console.log(JSON.stringify(output));
}

// ── Solve Phase Advance ──────────────────────────────────────────────

function cmdSolveAdvance(args) {
  const problem = requireProblem(args);
  const { opts } = parseOptions(args);
  const m = readJSON(manifestPath(problem));
  const stratState = readJSON(join(solvePath(problem), 'strategy-state.json'));
  const phases = SOLVE_PHASES[m.strategy];
  const currentIdx = phases.indexOf(stratState.current_phase);

  if (!opts.phase) {
    console.error('Usage: xm-solver solve-advance --phase <phase-name>');
    process.exit(1);
  }

  stratState.phases_completed.push(stratState.current_phase);
  stratState.current_phase = opts.phase;
  stratState.updated_at = new Date().toISOString();
  writeJSON(join(solvePath(problem), 'strategy-state.json'), stratState);

  console.log(`✅ Advanced to solve phase: ${opts.phase}`);
}

// ── Solve Status ─────────────────────────────────────────────────────

function cmdSolveStatus(args) {
  const problem = requireProblem(args);
  const m = readJSON(manifestPath(problem));
  const stratState = readJSON(join(solvePath(problem), 'strategy-state.json'));

  if (!m.strategy || !stratState?.strategy) {
    console.log('No active solving session.');
    return;
  }

  const phases = SOLVE_PHASES[m.strategy];
  const info = STRATEGY_LABELS[m.strategy];

  console.log(`\n${C.bold}Solve Status: ${info.icon} ${info.name}${C.reset}\n`);

  for (const ph of phases) {
    const completed = stratState.phases_completed?.includes(ph);
    const current = stratState.current_phase === ph;
    const icon = completed ? `${C.green}✓${C.reset}` : current ? `${C.cyan}▶${C.reset}` : `${C.dim}○${C.reset}`;
    console.log(`  ${icon} ${current ? C.bold : ''}${ph}${current ? C.reset : ''}`);
  }

  // Strategy-specific info
  if (m.strategy === 'iterate' && stratState.hypotheses?.length) {
    console.log(`\n  Hypotheses: ${stratState.hypotheses.length}`);
    console.log(`  Iteration: ${stratState.current_iteration}/${stratState.max_iterations}`);
  }

  if (m.strategy === 'decompose' && stratState.tree?.children?.length) {
    console.log(`\n  Sub-problems: ${stratState.tree.children.length}`);
    const solved = stratState.tree.children.filter(c => c.status === 'solved').length;
    console.log(`  Solved: ${renderBar(solved, stratState.tree.children.length)}`);
  }

  const candidates = readJSON(join(solvePath(problem), 'candidates.json'));
  if (candidates?.candidates?.length) {
    console.log(`\n  Candidates: ${candidates.candidates.length}`);
  }

  console.log();
}

// ── Hypotheses (iterate) ─────────────────────────────────────────────

function cmdHypotheses(args) {
  const sub = args[0];
  const problem = requireProblem(args.slice(1));
  const stratState = readJSON(join(solvePath(problem), 'strategy-state.json'));

  if (!stratState || stratState.strategy !== 'iterate') {
    console.error('❌ Hypotheses only available in iterate strategy.');
    process.exit(1);
  }

  if (sub === 'list' || !sub) {
    const hypos = stratState.hypotheses || [];
    if (hypos.length === 0) {
      console.log('No hypotheses yet.');
      return;
    }
    const statusIcons = {
      pending: '⬜', confirmed: '✅', refuted: '❌', inconclusive: '🟡',
    };
    console.log(`\n${C.bold}Hypotheses${C.reset} (${hypos.length})\n`);
    for (const h of hypos) {
      console.log(`  ${statusIcons[h.status] || '❓'} ${C.bold}${h.id}${C.reset}: ${h.description}`);
      if (h.evidence_for?.length) console.log(`    ${C.green}+${C.reset} ${h.evidence_for.join('; ')}`);
      if (h.evidence_against?.length) console.log(`    ${C.red}-${C.reset} ${h.evidence_against.join('; ')}`);
      console.log();
    }
  } else if (sub === 'add') {
    const { positional, opts } = parseOptions(args.slice(1));
    const description = positional.join(' ') || opts.content;
    if (!description) {
      console.error('Usage: xm-solver hypotheses add "description"');
      process.exit(1);
    }
    if (!stratState.hypotheses) stratState.hypotheses = [];
    stratState.hypotheses.push({
      id: `h${stratState.hypotheses.length + 1}`,
      description,
      status: 'pending',
      evidence_for: [],
      evidence_against: [],
      test_result: null,
    });
    writeJSON(join(solvePath(problem), 'strategy-state.json'), stratState);
    console.log(`✅ Hypothesis h${stratState.hypotheses.length} added.`);
  } else if (sub === 'update') {
    const { positional, opts } = parseOptions(args.slice(1));
    const id = positional[0];
    if (!id) {
      console.error('Usage: xm-solver hypotheses update <id> --status <pending|confirmed|refuted|inconclusive>');
      process.exit(1);
    }
    const h = stratState.hypotheses?.find(h => h.id === id);
    if (!h) {
      console.error(`❌ Hypothesis "${id}" not found.`);
      process.exit(1);
    }
    if (opts.status) h.status = opts.status;
    if (opts.evidence_for) h.evidence_for.push(opts.evidence_for);
    if (opts.evidence_against) h.evidence_against.push(opts.evidence_against);
    if (opts.test_result) h.test_result = opts.test_result;
    writeJSON(join(solvePath(problem), 'strategy-state.json'), stratState);
    console.log(`✅ Hypothesis ${id} updated.`);
  } else {
    console.error('Usage: xm-solver hypotheses <list|add|update>');
    process.exit(1);
  }
}

// ── Tree (decompose) ─────────────────────────────────────────────────

function cmdTree(args) {
  const sub = args[0] || 'show';
  const problem = requireProblem(args.slice(1));
  const stratState = readJSON(join(solvePath(problem), 'strategy-state.json'));

  if (!stratState || stratState.strategy !== 'decompose') {
    console.error('❌ Tree only available in decompose strategy.');
    process.exit(1);
  }

  if (sub === 'show') {
    const tree = stratState.tree;
    if (!tree) {
      console.log('No tree yet. Run: xm-solver solve');
      return;
    }
    console.log(`\n${C.bold}Problem Tree${C.reset}\n`);
    printTree(tree, '');
    console.log();
  } else if (sub === 'add') {
    const { positional, opts } = parseOptions(args.slice(1));
    const description = positional.join(' ') || opts.content;
    if (!description) {
      console.error('Usage: xm-solver tree add "sub-problem description" [--difficulty trivial|medium|hard]');
      process.exit(1);
    }
    if (!stratState.tree.children) stratState.tree.children = [];
    stratState.tree.children.push({
      id: `sp${stratState.tree.children.length + 1}`,
      description,
      difficulty: opts.difficulty || 'medium',
      status: 'pending',
      candidates: [],
      selected: null,
    });
    writeJSON(join(solvePath(problem), 'strategy-state.json'), stratState);
    console.log(`✅ Sub-problem sp${stratState.tree.children.length} added.`);
  } else if (sub === 'update') {
    const { positional, opts } = parseOptions(args.slice(1));
    const id = positional[0];
    if (!id) {
      console.error('Usage: xm-solver tree update <id> --status <pending|solving|solved>');
      process.exit(1);
    }
    const child = stratState.tree.children?.find(c => c.id === id);
    if (!child) {
      console.error(`❌ Sub-problem "${id}" not found.`);
      process.exit(1);
    }
    if (opts.status) child.status = opts.status;
    if (opts.selected) child.selected = opts.selected;
    writeJSON(join(solvePath(problem), 'strategy-state.json'), stratState);
    console.log(`✅ Sub-problem ${id} updated.`);
  } else {
    console.error('Usage: xm-solver tree <show|add|update>');
    process.exit(1);
  }
}

function printTree(node, prefix) {
  const statusIcons = { pending: '⬜', solving: '🔵', solved: '✅' };
  const icon = statusIcons[node.status] || '❓';
  console.log(`${prefix}${icon} ${C.bold}${node.id}${C.reset}: ${node.description}`);
  if (node.difficulty) console.log(`${prefix}   difficulty: ${node.difficulty}`);
  if (node.selected) console.log(`${prefix}   selected: ${node.selected}`);
  if (node.children) {
    for (const child of node.children) {
      printTree(child, prefix + '  ');
    }
  }
}

// ── Candidates ───────────────────────────────────────────────────────

function cmdCandidates(args) {
  const sub = args[0];
  const problem = requireProblem(args.slice(1));
  const candidateFile = join(solvePath(problem), 'candidates.json');

  if (sub === 'list' || !sub) {
    const data = readJSON(candidateFile) || { candidates: [] };
    if (data.candidates.length === 0) {
      console.log('No candidates yet.');
      return;
    }
    console.log(`\n${C.bold}Solution Candidates${C.reset} (${data.candidates.length})\n`);
    for (const c of data.candidates) {
      const sel = c.selected ? ` ${C.green}★ SELECTED${C.reset}` : '';
      console.log(`  ${C.cyan}${c.id}${C.reset}${sel} (from: ${c.source || 'manual'})`);
      if (c.sub_problem) console.log(`    Sub-problem: ${c.sub_problem}`);
      console.log(`    ${c.description}`);
      if (c.scores && Object.keys(c.scores).length > 0) {
        console.log(`    Scores: ${JSON.stringify(c.scores)}`);
      }
      console.log();
    }
  } else if (sub === 'add') {
    const { opts, positional } = parseOptions(args.slice(1));
    const description = positional.join(' ') || opts.content;
    if (!description) {
      console.error('Usage: xm-solver candidates add "description" [--source agent-1] [--sub-problem sp1]');
      process.exit(1);
    }
    const data = readJSON(candidateFile) || { candidates: [] };
    data.candidates.push({
      id: `cand-${data.candidates.length + 1}`,
      source: opts.source || 'manual',
      sub_problem: opts['sub-problem'] || null,
      description,
      details: opts.details || '',
      scores: {},
      selected: false,
      created_at: new Date().toISOString(),
    });
    writeJSON(candidateFile, data);
    console.log(`✅ Candidate cand-${data.candidates.length} added.`);
  } else if (sub === 'select') {
    const { positional } = parseOptions(args.slice(1));
    const id = positional[0];
    if (!id) {
      console.error('Usage: xm-solver candidates select <id>');
      process.exit(1);
    }
    const data = readJSON(candidateFile) || { candidates: [] };
    const cand = data.candidates.find(c => c.id === id);
    if (!cand) {
      console.error(`❌ Candidate "${id}" not found.`);
      process.exit(1);
    }
    // Deselect others
    for (const c of data.candidates) c.selected = false;
    cand.selected = true;
    writeJSON(candidateFile, data);
    console.log(`✅ Candidate ${id} selected.`);
  } else if (sub === 'score') {
    const { positional, opts } = parseOptions(args.slice(1));
    const id = positional[0];
    if (!id || !opts.constraint || !opts.score) {
      console.error('Usage: xm-solver candidates score <id> --constraint c1 --score 8');
      process.exit(1);
    }
    const data = readJSON(candidateFile) || { candidates: [] };
    const cand = data.candidates.find(c => c.id === id);
    if (!cand) {
      console.error(`❌ Candidate "${id}" not found.`);
      process.exit(1);
    }
    cand.scores[opts.constraint] = parseFloat(opts.score);
    writeJSON(candidateFile, data);
    console.log(`✅ Candidate ${id} scored: ${opts.constraint}=${opts.score}`);
  } else {
    console.error('Usage: xm-solver candidates <list|add|select|score>');
    process.exit(1);
  }
}

// ── Phase Management ─────────────────────────────────────────────────

function cmdPhase(args) {
  const sub = args[0];
  const problem = requireProblem(args.slice(1));
  const m = readJSON(manifestPath(problem));
  const currentIdx = PHASES.findIndex(p => p.id === m.current_phase);

  if (sub === 'next') {
    if (currentIdx >= PHASES.length - 1) {
      console.log('Already at the last phase.');
      return;
    }
    const next = PHASES[currentIdx + 1];
    m.current_phase = next.id;
    m.updated_at = new Date().toISOString();
    writeJSON(manifestPath(problem), m);
    console.log(`✅ Advanced to phase: ${C.bold}${next.label}${C.reset}`);
  } else if (sub === 'set') {
    const { positional } = parseOptions(args.slice(1));
    const target = positional[0];
    const phase = PHASES.find(p => p.name === target || p.id === target);
    if (!phase) {
      console.error(`❌ Unknown phase: "${target}". Valid: ${PHASES.map(p => p.name).join(', ')}`);
      process.exit(1);
    }
    m.current_phase = phase.id;
    m.updated_at = new Date().toISOString();
    writeJSON(manifestPath(problem), m);
    console.log(`✅ Phase set to: ${C.bold}${phase.label}${C.reset}`);
  } else {
    const phase = PHASES[currentIdx];
    console.log(`Current phase: ${C.bold}${phase.label}${C.reset} (${phase.id})`);
  }
}

// ── Verify ───────────────────────────────────────────────────────────

function cmdVerify(args) {
  const problem = requireProblem(args);
  const { opts } = parseOptions(args);
  const m = readJSON(manifestPath(problem));

  if (m.current_phase !== '04-verify') {
    m.current_phase = '04-verify';
    m.updated_at = new Date().toISOString();
    writeJSON(manifestPath(problem), m);
  }

  if (opts.manual) {
    // Manual verification
    writeJSON(join(verifyPath(problem), 'verification.json'), {
      method: 'manual',
      passed: true,
      reason: opts.manual,
      verified_at: new Date().toISOString(),
    });
    console.log(`✅ Manually verified: ${opts.manual}`);
    return;
  }

  // Auto verification: check constraints against selected candidate
  const constraintData = readJSON(join(intakePath(problem), 'constraints.json')) || { constraints: [] };
  const candidateData = readJSON(join(solvePath(problem), 'candidates.json')) || { candidates: [] };
  const selected = candidateData.candidates.find(c => c.selected);
  const description = readMD(join(intakePath(problem), 'description.md'));

  const verification = {
    method: 'auto',
    selected_candidate: selected?.id || null,
    constraint_check: [],
    problem_context: description,
    candidate_description: selected?.description || null,
    constraints: constraintData.constraints,
    verified_at: new Date().toISOString(),
  };

  // Check hard constraints
  for (const c of constraintData.constraints) {
    const score = selected?.scores?.[c.id];
    const check = {
      constraint_id: c.id,
      type: c.type,
      description: c.description,
    };

    if (c.type === 'hard') {
      check.passed = score !== undefined ? score > 0 : null;
      check.note = score !== undefined ? `Score: ${score}` : 'Not scored — needs agent verification';
    } else {
      check.score = score || null;
      check.note = score !== undefined ? `Score: ${score}/10` : 'Not scored';
    }

    verification.constraint_check.push(check);
  }

  verification.passed = verification.constraint_check
    .filter(c => c.type === 'hard')
    .every(c => c.passed !== false);

  writeJSON(join(verifyPath(problem), 'verification.json'), verification);

  console.log(`\n${C.bold}Verification${C.reset}\n`);
  if (selected) console.log(`  Selected: ${C.cyan}${selected.id}${C.reset}: ${selected.description}\n`);

  for (const check of verification.constraint_check) {
    const icon = check.passed === true ? '✅' : check.passed === false ? '❌' : '⚠️';
    console.log(`  ${icon} ${check.constraint_id} [${check.type}]: ${check.description}`);
    console.log(`     ${check.note}`);
  }

  console.log(`\n  Overall: ${verification.passed ? `${C.green}PASSED${C.reset}` : `${C.red}NEEDS REVIEW${C.reset}`}\n`);

  // JSON output for SKILL.md
  console.log(JSON.stringify({
    action: 'verify',
    problem,
    ...verification,
  }));
}

// ── Close ────────────────────────────────────────────────────────────

function cmdClose(args) {
  const problem = requireProblem(args);
  const { opts } = parseOptions(args);
  const m = readJSON(manifestPath(problem));

  m.current_phase = '05-close';
  m.state = PROBLEM_STATES.SOLVED;
  m.closed_at = new Date().toISOString();
  m.updated_at = new Date().toISOString();
  writeJSON(manifestPath(problem), m);

  // Save summary
  const candidateData = readJSON(join(solvePath(problem), 'candidates.json')) || { candidates: [] };
  const selected = candidateData.candidates.find(c => c.selected);
  const verification = readJSON(join(verifyPath(problem), 'verification.json'));

  const summary = {
    problem: m.display_name,
    strategy: m.strategy,
    solution: selected?.description || opts.summary || 'No solution recorded',
    verification_passed: verification?.passed || false,
    duration_ms: new Date(m.closed_at).getTime() - new Date(m.created_at).getTime(),
    closed_at: m.closed_at,
    custom_summary: opts.summary || null,
  };

  writeJSON(join(closePath(problem), 'summary.json'), summary);

  console.log(`\n✅ Problem closed: ${C.bold}${m.display_name}${C.reset}`);
  console.log(`   Strategy: ${m.strategy}`);
  console.log(`   Solution: ${summary.solution}`);
  console.log(`   Duration: ${fmtDuration(summary.duration_ms)}\n`);
}

// ── History ──────────────────────────────────────────────────────────

function cmdHistory(args) {
  const dir = problemsDir();
  if (!existsSync(dir)) {
    console.log('No history.');
    return;
  }

  const problems = readdirSync(dir)
    .filter(d => existsSync(manifestPath(d)))
    .map(d => ({ name: d, ...readJSON(manifestPath(d)) }))
    .filter(m => m.state === PROBLEM_STATES.SOLVED || m.state === PROBLEM_STATES.CLOSED)
    .sort((a, b) => new Date(b.closed_at || 0) - new Date(a.closed_at || 0));

  if (problems.length === 0) {
    console.log('No solved problems yet.');
    return;
  }

  console.log(`\n${C.bold}Solved Problems${C.reset} (${problems.length})\n`);
  for (const p of problems) {
    const summary = readJSON(join(closePath(p.name), 'summary.json'));
    const info = STRATEGY_LABELS[p.strategy];
    console.log(`  ${info?.icon || '📋'} ${C.bold}${p.name}${C.reset}`);
    console.log(`    ${p.display_name}`);
    console.log(`    Strategy: ${p.strategy}  |  ${p.closed_at?.slice(0, 10)}`);
    if (summary?.solution) {
      console.log(`    Solution: ${summary.solution.slice(0, 80)}${summary.solution.length > 80 ? '...' : ''}`);
    }
    console.log();
  }
}

// ── Next (Smart Routing) ─────────────────────────────────────────────

function cmdNext(args) {
  const problem = findCurrentProblem();

  if (!problem) {
    console.log(JSON.stringify({
      action: 'next',
      recommendation: 'init',
      message: 'No active problem. Start with: xm-solver init "description"',
    }));
    return;
  }

  const m = readJSON(manifestPath(problem));
  const phase = PHASES.find(p => p.id === m.current_phase);
  let recommendation;
  let message;

  switch (m.current_phase) {
    case '01-intake': {
      const desc = readMD(join(intakePath(problem), 'description.md'));
      const ctx = readJSON(join(intakePath(problem), 'context.json'));
      const constraints = readJSON(join(intakePath(problem), 'constraints.json'));
      if (!desc || desc.trim().length < 20) {
        recommendation = 'describe';
        message = 'Add a detailed problem description: xm-solver describe --content "..."';
      } else {
        recommendation = 'classify';
        message = 'Ready to classify. Run: xm-solver classify';
      }
      break;
    }
    case '02-classify': {
      const classification = readJSON(join(classifyPath(problem), 'classification.json'));
      if (!classification) {
        recommendation = 'classify';
        message = 'Run classification: xm-solver classify';
      } else if (!m.strategy) {
        recommendation = 'strategy set';
        message = `Set strategy (recommended: ${classification.recommended_strategy}): xm-solver strategy set ${classification.recommended_strategy}`;
      } else {
        recommendation = 'phase next';
        message = 'Strategy set. Advance: xm-solver phase next';
      }
      break;
    }
    case '03-solve': {
      const stratState = readJSON(join(solvePath(problem), 'strategy-state.json'));
      const phases = SOLVE_PHASES[m.strategy] || [];
      const currentIdx = phases.indexOf(stratState?.current_phase);
      if (currentIdx < phases.length - 1) {
        recommendation = 'solve';
        message = `Continue solving (${stratState?.current_phase}): xm-solver solve`;
      } else {
        const candidates = readJSON(join(solvePath(problem), 'candidates.json'));
        const hasSelected = candidates?.candidates?.some(c => c.selected);
        if (!hasSelected && candidates?.candidates?.length > 0) {
          recommendation = 'candidates select';
          message = 'Select a solution candidate: xm-solver candidates select <id>';
        } else {
          recommendation = 'phase next';
          message = 'Solving complete. Advance to verify: xm-solver phase next';
        }
      }
      break;
    }
    case '04-verify': {
      const verification = readJSON(join(verifyPath(problem), 'verification.json'));
      if (!verification) {
        recommendation = 'verify';
        message = 'Run verification: xm-solver verify';
      } else if (verification.passed) {
        recommendation = 'close';
        message = 'Verification passed. Close: xm-solver close';
      } else {
        recommendation = 'solve';
        message = 'Verification failed. Return to solve: xm-solver phase set solve';
      }
      break;
    }
    case '05-close': {
      recommendation = 'close';
      message = 'Ready to close: xm-solver close';
      break;
    }
  }

  console.log(`\n${C.bold}Next Step${C.reset}\n`);
  console.log(`  Problem: ${m.display_name}`);
  console.log(`  Phase: ${phase?.label}`);
  console.log(`  ${C.yellow}→ ${message}${C.reset}\n`);

  console.log(JSON.stringify({
    action: 'next',
    problem,
    phase: phase?.name,
    recommendation,
    message,
    strategy: m.strategy,
  }));
}

// ── Handoff ──────────────────────────────────────────────────────────

function cmdHandoff(args) {
  const { opts } = parseOptions(args);

  if (opts.restore) {
    const problem = findCurrentProblem();
    if (!problem) {
      console.log('No active problem to restore.');
      return;
    }
    const handoff = readJSON(join(problemDir(problem), 'handoff.json'));
    if (!handoff) {
      console.log('No handoff data found.');
      return;
    }
    console.log(`\n${C.bold}Restored Session${C.reset}\n`);
    console.log(`  Problem: ${handoff.display_name}`);
    console.log(`  Phase: ${handoff.phase}`);
    console.log(`  Strategy: ${handoff.strategy || 'not set'}`);
    if (handoff.solve_phase) console.log(`  Solve phase: ${handoff.solve_phase}`);
    if (handoff.next_action) console.log(`  Next: ${handoff.next_action}`);
    console.log();

    console.log(JSON.stringify({ action: 'handoff-restore', ...handoff }));
    return;
  }

  const problem = requireProblem(args);
  const m = readJSON(manifestPath(problem));
  const stratState = readJSON(join(solvePath(problem), 'strategy-state.json'));
  const constraintData = readJSON(join(intakePath(problem), 'constraints.json'));
  const candidateData = readJSON(join(solvePath(problem), 'candidates.json'));

  const handoff = {
    problem,
    display_name: m.display_name,
    phase: PHASES.find(p => p.id === m.current_phase)?.name,
    strategy: m.strategy,
    solve_phase: stratState?.current_phase,
    constraints_count: constraintData?.constraints?.length || 0,
    candidates_count: candidateData?.candidates?.length || 0,
    next_action: null,
    saved_at: new Date().toISOString(),
  };

  writeJSON(join(problemDir(problem), 'handoff.json'), handoff);
  console.log(`✅ Handoff saved for: ${m.display_name}`);
}

// ── Mode ─────────────────────────────────────────────────────────────

function cmdMode(args) {
  const sub = args[0];

  if (!sub || sub === 'show') {
    const mode = getMode();
    console.log(`Current mode: ${C.bold}${mode}${C.reset}`);
    return;
  }

  if (!['developer', 'normal'].includes(sub)) {
    console.error('Usage: xm-solver mode <developer|normal>');
    process.exit(1);
  }

  const config = loadConfig();
  config.mode = sub;
  writeJSON(join(ROOT, 'config.json'), config);
  console.log(`✅ Mode set to: ${sub}`);
}

// ── Help ─────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${C.bold}xm-solver${C.reset} — Structured Problem Solving

${C.bold}USAGE${C.reset}
  xm-solver <command> [args] [options]

${C.bold}PROBLEM MANAGEMENT${C.reset}
  init <description>        Create new problem
  list                      List all problems
  status                    Show current problem status
  close [--summary "..."]   Close problem
  history                   Show solved problems
  next                      Smart routing: what to do next
  handoff [--restore]       Save/restore session

${C.bold}INTAKE${C.reset}
  describe --content "..."  Set problem description
  context add --content     Add context
  context list              List context items
  constraints add "..."     Add constraint [--type hard|soft|preference]
  constraints list          List constraints
  constraints remove <id>   Remove constraint

${C.bold}CLASSIFY${C.reset}
  classify                  Auto-classify + recommend strategy
  strategy set <name>       Set strategy (decompose|iterate|constrain|pipeline)
  strategy show             Show current strategy

${C.bold}SOLVE${C.reset}
  solve [--step]            Execute strategy
  solve-status              Show solving progress
  solve-advance --phase X   Advance solve phase
  hypotheses list|add|update  (iterate) Manage hypotheses
  tree show|add|update      (decompose) Manage problem tree
  candidates list|add|select|score  Manage solution candidates

${C.bold}VERIFY & CLOSE${C.reset}
  verify [--manual "reason"]  Verify solution
  phase next|set <name>     Manage phases

${C.bold}SETTINGS${C.reset}
  mode developer|normal     Set display mode
  help                      Show this help
`);
}

// ── Main Router ──────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'init':           cmdInit(args); break;
  case 'list':           cmdList(); break;
  case 'status':         cmdStatus(args); break;
  case 'describe':       cmdDescribe(args); break;
  case 'context':        cmdContext(args); break;
  case 'constraints':    cmdConstraints(args); break;
  case 'classify':       cmdClassify(args); break;
  case 'strategy':       cmdStrategy(args); break;
  case 'solve':          cmdSolve(args); break;
  case 'solve-advance':  cmdSolveAdvance(args); break;
  case 'solve-status':   cmdSolveStatus(args); break;
  case 'hypotheses':     cmdHypotheses(args); break;
  case 'tree':           cmdTree(args); break;
  case 'candidates':     cmdCandidates(args); break;
  case 'phase':          cmdPhase(args); break;
  case 'verify':         cmdVerify(args); break;
  case 'close':          cmdClose(args); break;
  case 'history':        cmdHistory(args); break;
  case 'next':           cmdNext(args); break;
  case 'handoff':        cmdHandoff(args); break;
  case 'mode':           cmdMode(args); break;
  case 'help':
  case '--help':
  case '-h':             printHelp(); break;
  default:
    if (!cmd) {
      printHelp();
    } else {
      console.error(`❌ Unknown command: "${cmd}". Run: xm-solver help`);
      process.exit(1);
    }
}
