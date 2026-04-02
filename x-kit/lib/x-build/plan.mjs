/**
 * x-build/plan — Planning + deliberation commands
 */

import {
  PHASES, TASK_STATES, C, ROOT,
  readJSON, writeJSON, readMD, writeMD,
  manifestPath, tasksPath, stepsPath, contextDir, phaseDir, projectDir, decisionsPath, archiveDir,
  resolveProject,
  loadConfig, parseOptions, fmtDuration, estimateTaskCost,
  existsSync, join, readFileSync, mkdirSync,
  getAgentCount, isNormalMode,
  templatesDir,
  readdirSync,
} from './core.mjs';
import { taskList } from './tasks.mjs';
import { stepsStatus, computeSteps } from './tasks.mjs';

// ── cmdPlan ─────────────────────────────────────────────────────────

export function cmdPlan(args) {
  const goal = args.join(' ');
  const project = resolveProject(null);

  if (!goal) {
    const taskData = readJSON(tasksPath(project));
    const stepData = readJSON(stepsPath(project));
    if (!taskData?.tasks?.length) {
      console.log('No plan yet. Use: /x-build plan "목표를 설명하세요"');
      return;
    }
    taskList(project);
    if (stepData?.steps?.length) stepsStatus(project);
    return;
  }

  const manifest = readJSON(manifestPath(project));
  const output = {
    action: 'auto-plan',
    project,
    goal,
    current_phase: PHASES.find(p => p.id === manifest?.current_phase)?.name,
    existing_tasks: readJSON(tasksPath(project))?.tasks?.length || 0,
    templates_available: existsSync(templatesDir())
      ? readdirSync(join(templatesDir(), 'tasks')).map(f => f.replace('.md', ''))
      : [],
    has_context: existsSync(join(contextDir(project), 'CONTEXT.md')),
    has_requirements: existsSync(join(contextDir(project), 'REQUIREMENTS.md')),
    context_summary: existsSync(join(contextDir(project), 'CONTEXT.md'))
      ? readMD(join(contextDir(project), 'CONTEXT.md'))?.slice(0, 2000)
      : null,
    requirements_summary: existsSync(join(contextDir(project), 'REQUIREMENTS.md'))
      ? readMD(join(contextDir(project), 'REQUIREMENTS.md'))?.slice(0, 2000)
      : null,
    roadmap_summary: existsSync(join(contextDir(project), 'ROADMAP.md'))
      ? readMD(join(contextDir(project), 'ROADMAP.md'))?.slice(0, 2000)
      : null,
  };

  console.log(JSON.stringify(output, null, 2));
}

// ── cmdPlanCheck ────────────────────────────────────────────────────

export function cmdPlanCheck(args) {
  const strict = args.includes('--strict');
  const project = resolveProject(null);
  const taskData = readJSON(tasksPath(project));
  const requirements = readMD(join(contextDir(project), 'REQUIREMENTS.md'));
  const context = readMD(join(contextDir(project), 'CONTEXT.md'));

  const checks = [];
  const tasks = taskData?.tasks || [];

  // 1. Atomicity
  for (const t of tasks) {
    if (t.size === 'large' && !t.depends_on?.length) {
      checks.push({ dim: 'atomicity', level: 'warn', task: t.id, msg: `Task "${t.name}" is large with no dependencies — consider splitting` });
    }
  }
  // G4: Flag excessive large tasks regardless of dependencies
  const largeTasks = tasks.filter(t => t.size === 'large');
  if (largeTasks.length >= 3) {
    checks.push({ dim: 'atomicity', level: 'warn', msg: `${largeTasks.length} large tasks — consider splitting: ${largeTasks.map(t => t.id).join(', ')}` });
  }

  // 2. Dependencies
  const ids = new Set(tasks.map(t => t.id));
  for (const t of tasks) {
    for (const dep of (t.depends_on || [])) {
      if (!ids.has(dep)) {
        checks.push({ dim: 'dependencies', level: 'error', task: t.id, msg: `Unknown dependency "${dep}"` });
      }
    }
  }

  // 3. Cycle detection
  try {
    computeSteps(tasks);
  } catch (e) {
    checks.push({ dim: 'dependencies', level: 'error', msg: e.message });
  }

  // 4. Requirements coverage
  if (requirements) {
    const reqIds = [...requirements.matchAll(/^-\s*\[R(\d+)\]/gm)].map(m => `R${m[1]}`);
    if (reqIds.length > 0) {
      // G2: Search task names AND done_criteria for R# references
      const taskText = tasks.map(t => [t.name, ...(t.done_criteria || [])].join(' ')).join(' ');
      for (const rid of reqIds) {
        if (!taskText.includes(rid)) {
          checks.push({ dim: 'coverage', level: strict ? 'error' : 'warn', msg: `Requirement ${rid} not referenced in any task name or done_criteria` });
        }
      }
    }
  }

  // 5. Size distribution
  const sizes = { small: 0, medium: 0, large: 0 };
  for (const t of tasks) sizes[t.size || 'medium']++;
  if (tasks.length > 0 && sizes.large / tasks.length > 0.5) {
    checks.push({ dim: 'granularity', level: 'warn', msg: `>50% tasks are large — consider decomposing further` });
  }
  // G6: Upper bound — too many tasks is also a smell
  if (tasks.length > 15) {
    checks.push({ dim: 'granularity', level: 'warn', msg: `${tasks.length} tasks — plan may be over-decomposed. Consider merging related small tasks` });
  }

  // 6. Task count sanity
  if (tasks.length === 0) {
    checks.push({ dim: 'completeness', level: 'error', msg: 'No tasks defined' });
  } else if (tasks.length < 3) {
    checks.push({ dim: 'completeness', level: 'warn', msg: 'Very few tasks — plan may be too coarse' });
  }

  // 7. Context fit
  if (!context) {
    checks.push({ dim: 'context', level: 'warn', msg: 'No CONTEXT.md found — run discuss first for better plans' });
  }

  // 8. Naming
  // G7: Extended verb list
  const verbPattern = /^(add|create|implement|design|setup|configure|write|build|test|fix|update|remove|refactor|migrate|deploy|integrate|validate|analyze|research|review|document|optimize|enable|extract|scaffold|evaluate|generate|define|extend|replace|monitor|provision|secure|audit|prepare|ensure|initialize|bootstrap|wire|connect|expose|handle)/i;
  for (const t of tasks) {
    if (!verbPattern.test(t.name)) {
      checks.push({ dim: 'naming', level: 'info', task: t.id, msg: `"${t.name}" — consider starting with a verb` });
    }
  }

  // 9. Tech-leakage
  const TECH_TERMS = 'React|Vue|Angular|Next\\.?js|Express|FastAPI|Django|Flask|Spring|Rails|Laravel|PostgreSQL|MySQL|MongoDB|Redis|Kafka|RabbitMQ|Docker|Kubernetes|AWS|GCP|Azure|Vercel|Supabase|Firebase|SQLite|GraphQL|gRPC|Prisma|Drizzle|TypeORM|Sequelize|Zod|Joi|JWT|OAuth|Tailwind|Vite|Webpack|Rollup|esbuild|Playwright|Jest|Vitest|pytest|JUnit|SwiftUI|UIKit|Jetpack\\s*Compose|Flutter|Dart|Kotlin|Swift|Go|Rust|Python|TypeScript|Node\\.?js|Deno|Bun';
  const declaredTechs = new Set();
  if (context) {
    const techRe = new RegExp(`\\b(${TECH_TERMS})\\b`, 'gi');
    const techMatches = context.match(techRe) || [];
    for (const m of techMatches) declaredTechs.add(m.toLowerCase());
  }
  const prdPath = join(phaseDir(project, '02-plan'), 'PRD.md');
  const prd = readMD(prdPath);
  if (prd) {
    const constraintSection = prd.match(/## 3\. Constraints[\s\S]*?(?=## \d|$)/);
    if (constraintSection) {
      const techRe = new RegExp(`\\b(${TECH_TERMS})\\b`, 'gi');
      const prdTechs = constraintSection[0].match(techRe) || [];
      for (const m of prdTechs) declaredTechs.add(m.toLowerCase());
    }
  }
  for (const t of tasks) {
    const techRe = new RegExp(`\\b(${TECH_TERMS})\\b`, 'gi');
    const found = t.name.match(techRe) || [];
    for (const tech of found) {
      if (!declaredTechs.has(tech.toLowerCase())) {
        checks.push({ dim: 'tech-leakage', level: 'warn', task: t.id, msg: `"${tech}" is not declared in CONTEXT.md or PRD Constraints — consider using intent instead of implementation` });
      }
    }
  }

  // 10. Scope clarity — done_criteria 미설정 경고
  for (const t of tasks) {
    if (!t.done_criteria?.length) {
      checks.push({ dim: 'scope-clarity', level: 'warn', task: t.id, msg: `"${t.name}" has no done_criteria — completion is ambiguous. Run: tasks done-criteria` });
    }
  }

  // G1: Scope guard — check task names against PRD "Out of Scope" items
  const prdForScope = prd || readMD(join(contextDir(project), 'PRD.md'));
  if (prdForScope) {
    const oosMatch = prdForScope.match(/## 6[\.\s]*Out of Scope([\s\S]*?)(?=\n## \d|$)/i);
    if (oosMatch) {
      const stopWords = new Set(['that','this','will','with','from','have','should','would','could','also','only','more','than','each','been','were','does','into','other','their','about','being','after','before','these','those','through','between','first','which','where','while','under','since','during','without','within','until','above','below','along','across','around','against','among','beyond','during','except','inside','outside','toward','upon','using','including']);
      const oosKeywords = (oosMatch[1].match(/\b\w{4,}\b/g) || []).map(w => w.toLowerCase()).filter(w => !stopWords.has(w));
      if (oosKeywords.length > 0) {
        for (const t of tasks) {
          const nameWords = t.name.toLowerCase().split(/\s+/);
          const hits = oosKeywords.filter(kw => nameWords.includes(kw));
          if (hits.length >= 2) {
            checks.push({ dim: 'scope-clarity', level: 'warn', task: t.id, msg: `"${t.name}" may overlap with Out of Scope (matched: ${hits.join(', ')})` });
          }
        }
      }
    }
  }

  // 11. Risk ordering — G3: Use actual DAG step position instead of array index
  try {
    const steps = computeSteps(tasks);
    const totalSteps = steps.length;
    if (totalSteps > 1) {
      for (const t of tasks) {
        if (t.size === 'large' && !t.depends_on?.length) {
          const stepIdx = steps.findIndex(s => s.includes(t.id));
          if (stepIdx > totalSteps / 2) {
            checks.push({ dim: 'risk-ordering', level: 'warn', task: t.id, msg: `Large root task "${t.name}" is in DAG step ${stepIdx + 1}/${totalSteps} — consider front-loading high-risk work` });
          }
        }
      }
    }
  } catch (e) { /* cycle already caught in deps check */ }

  // Output
  const errors = checks.filter(c => c.level === 'error');
  const warns = checks.filter(c => c.level === 'warn');

  console.log(`\n${C.bold}Plan Check — ${tasks.length} tasks${C.reset}\n`);

  const dims = ['atomicity', 'dependencies', 'coverage', 'granularity', 'completeness', 'context', 'naming', 'tech-leakage', 'scope-clarity', 'risk-ordering', 'overall'];
  for (const dim of dims) {
    const dimChecks = checks.filter(c => c.dim === dim);
    if (dimChecks.length === 0) {
      console.log(`  [pass] ${dim}`);
    } else {
      const hasError = dimChecks.some(c => c.level === 'error');
      const icon = hasError ? '[FAIL]' : '[warn]';
      console.log(`  ${icon} ${dim}`);
      for (const c of dimChecks) {
        const lvl = c.level === 'error' ? C.red : c.level === 'warn' ? C.yellow : C.dim;
        console.log(`     ${lvl}${c.task ? `[${c.task}] ` : ''}${c.msg}${C.reset}`);
      }
    }
  }

  console.log('');
  if (errors.length > 0) {
    console.log(`  ${C.red}${errors.length} errors — fix before proceeding${C.reset}`);
  } else if (warns.length > 0) {
    console.log(`  ${C.yellow}${warns.length} warnings — review recommended${C.reset}`);
  } else {
    console.log(`  ${C.green}All checks passed${C.reset}`);
  }

  writeJSON(join(phaseDir(project, '02-plan'), 'plan-check.json'), {
    timestamp: new Date().toISOString(),
    tasks_count: tasks.length,
    checks,
    passed: errors.length === 0,
  });

  console.log('');
}

// ── cmdDiscuss ──────────────────────────────────────────────────────

export function cmdDiscuss(args) {
  const { opts, positional } = parseOptions(args);
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const mode = opts.mode || 'interview';
  const round = parseInt(opts.round || '1');
  const maxRounds = parseInt(opts['max-rounds'] || '3');

  const phaseName = PHASES.find(p => p.id === manifest.current_phase)?.name;

  const output = {
    action: 'discuss',
    project,
    mode,
    round,
    max_rounds: maxRounds,
    goal: manifest.display_name || project,
    current_phase: phaseName,
    existing_context: existsSync(join(contextDir(project), 'CONTEXT.md'))
      ? readMD(join(contextDir(project), 'CONTEXT.md'))?.slice(0, 500)
      : null,
  };

  if (mode === 'interview') {
    const prevPath = join(phaseDir(project, '01-research'), `discuss-interview-r${round - 1}.json`);
    if (round > 1 && existsSync(prevPath)) {
      output.previous_round = readJSON(prevPath);
    }
    output.completeness_dimensions = [
      'functional_requirements', 'non_functional_requirements', 'constraints',
      'error_handling', 'security', 'performance', 'data_model', 'integrations',
    ];
  } else if (mode === 'validate') {
    output.requirements = existsSync(join(contextDir(project), 'REQUIREMENTS.md'))
      ? readMD(join(contextDir(project), 'REQUIREMENTS.md')) : null;
    output.roadmap = existsSync(join(contextDir(project), 'ROADMAP.md'))
      ? readMD(join(contextDir(project), 'ROADMAP.md')) : null;
    output.context_full = existsSync(join(contextDir(project), 'CONTEXT.md'))
      ? readMD(join(contextDir(project), 'CONTEXT.md')) : null;
  } else if (mode === 'critique') {
    const prdPath = join(phaseDir(project, '02-plan'), 'PRD.md');
    output.prd = existsSync(prdPath) ? readMD(prdPath) : null;
    output.tasks = readJSON(tasksPath(project))?.tasks || [];
    output.requirements = existsSync(join(contextDir(project), 'REQUIREMENTS.md'))
      ? readMD(join(contextDir(project), 'REQUIREMENTS.md')) : null;
    output.plan_check = readJSON(join(phaseDir(project, '02-plan'), 'plan-check.json'));
    const prevCritiquePath = join(phaseDir(project, '02-plan'), `discuss-critique-r${round - 1}.json`);
    if (round > 1 && existsSync(prevCritiquePath)) {
      output.previous_round = readJSON(prevCritiquePath);
    }
  } else if (mode === 'adapt') {
    output.tasks = readJSON(tasksPath(project))?.tasks || [];
    output.steps = readJSON(join(projectDir(project), 'steps.json'));
    const progressPath = join(phaseDir(project, '03-execute'), 'progress.json');
    output.progress = existsSync(progressPath) ? readJSON(progressPath) : null;
    output.topic = positional.join(' ') || null;
  }

  const discussDir = mode === 'critique'
    ? phaseDir(project, '02-plan')
    : mode === 'adapt'
      ? phaseDir(project, '03-execute')
      : phaseDir(project, '01-research');
  const resultPath = join(discussDir, `discuss-${mode}.json`);
  if (existsSync(resultPath)) {
    output.previous_result = readJSON(resultPath);
  }

  console.log(JSON.stringify(output, null, 2));
}

// ── cmdResearch ─────────────────────────────────────────────────────

export function cmdResearch(args) {
  const { opts, positional } = parseOptions(args);
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const goal = positional.join(' ') || manifest.display_name || project;

  const output = {
    action: 'research',
    project,
    goal,
    agents: parseInt(opts.agents || String(getAgentCount())),
    perspectives: ['stack', 'features', 'architecture', 'pitfalls'],
    model: opts.model || 'sonnet',
    existing_requirements: existsSync(join(contextDir(project), 'REQUIREMENTS.md'))
      ? readMD(join(contextDir(project), 'REQUIREMENTS.md'))?.slice(0, 500)
      : null,
    existing_context: existsSync(join(contextDir(project), 'CONTEXT.md'))
      ? readMD(join(contextDir(project), 'CONTEXT.md'))?.slice(0, 500)
      : null,
  };

  console.log(JSON.stringify(output, null, 2));
}

// ── cmdPrdGate ─────────────────────────────────────────────────

export function cmdPrdGate(args) {
  const { opts } = parseOptions(args);
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));

  const prdPath = join(phaseDir(project, '02-plan'), 'PRD.md');
  const prd = readMD(prdPath);
  if (!prd) {
    console.error('❌ No PRD.md found. Create a PRD first during the Plan phase.');
    process.exit(1);
  }

  const requirements = readMD(join(contextDir(project), 'REQUIREMENTS.md'));
  const context = readMD(join(contextDir(project), 'CONTEXT.md'));
  const taskData = readJSON(tasksPath(project));
  const planCheck = readJSON(join(phaseDir(project, '02-plan'), 'plan-check.json'));
  const threshold = parseInt(opts.threshold || '7');

  const rubric = [
    { criterion: 'completeness', weight: 0.25, description: 'All requirements are addressed with acceptance criteria' },
    { criterion: 'feasibility', weight: 0.20, description: 'Tasks are realistic given constraints and tech stack' },
    { criterion: 'atomicity', weight: 0.20, description: 'Tasks are properly decomposed and independently executable' },
    { criterion: 'clarity', weight: 0.20, description: 'PRD is unambiguous — no room for misinterpretation' },
    { criterion: 'risk-coverage', weight: 0.15, description: 'Edge cases, failure modes, and risks are identified' },
  ];

  const output = {
    action: 'prd-gate',
    project,
    goal: manifest.display_name || project,
    threshold,
    judges: parseInt(opts.judges || '3'),
    rubric,
    prd,
    requirements: requirements?.slice(0, 3000) || null,
    context_summary: context?.slice(0, 1500) || null,
    tasks_count: taskData?.tasks?.length || 0,
    plan_check_passed: planCheck?.passed ?? null,
    result_path: join(phaseDir(project, '02-plan'), 'prd-gate.json'),
  };

  console.log(JSON.stringify(output, null, 2));
}

// ── cmdConsensus ───────────────────────────────────────────────

export function cmdConsensus(args) {
  const { opts } = parseOptions(args);
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));

  const prdPath = join(phaseDir(project, '02-plan'), 'PRD.md');
  const prd = readMD(prdPath);
  if (!prd) {
    console.error('❌ No PRD.md found. Create a PRD first during the Plan phase.');
    process.exit(1);
  }

  const requirements = readMD(join(contextDir(project), 'REQUIREMENTS.md'));
  const round = parseInt(opts.round || '1');
  const maxRounds = parseInt(opts['max-rounds'] || '3');

  const prevPath = join(phaseDir(project, '02-plan'), `consensus-r${round - 1}.json`);
  const previousRound = (round > 1 && existsSync(prevPath)) ? readJSON(prevPath) : null;

  const agents = [
    {
      role: 'architect',
      model: 'opus',
      prompt_focus: [
        'Module boundaries are clear',
        'Interfaces and dependencies are defined',
        'No missing architectural decisions',
      ],
    },
    {
      role: 'critic',
      model: 'sonnet',
      prompt_focus: [
        'No missing requirements or scenarios',
        'No contradictions between sections',
        'Risks are not underestimated',
      ],
    },
    {
      role: 'planner',
      model: 'opus',
      prompt_focus: [
        'Structure is decomposable into tasks',
        'Success criteria are measurable',
        'Timeline and cost are realistic',
      ],
    },
    {
      role: 'security',
      model: 'sonnet',
      prompt_focus: [
        'Security requirements are not missing',
        'Risk mitigations are concrete and actionable',
        'Sensitive data handling is specified',
      ],
    },
  ];

  const output = {
    action: 'consensus',
    project,
    goal: manifest.display_name || project,
    round,
    max_rounds: maxRounds,
    agents,
    prd,
    requirements: requirements?.slice(0, 3000) || null,
    previous_round: previousRound,
    result_path: join(phaseDir(project, '02-plan'), `consensus-r${round}.json`),
  };

  console.log(JSON.stringify(output, null, 2));
}

// ── cmdForecast ─────────────────────────────────────────────────────

export function cmdForecast(args) {
  const project = resolveProject(null);
  const taskData = readJSON(tasksPath(project));
  const config = loadConfig();
  const defaultModel = config.models?.executor || 'sonnet';

  if (!taskData?.tasks?.length) {
    console.log('No tasks to forecast. Run: x-build tasks add <name>');
    return;
  }

  console.log(`\n${C.bold}💰 Cost Forecast${C.reset} ${C.dim}(model: ${defaultModel})${C.reset}\n`);

  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const task of taskData.tasks) {
    if (task.status === TASK_STATES.COMPLETED || task.status === TASK_STATES.CANCELLED) continue;

    const model = task.size === 'large' ? 'opus' : defaultModel;
    const est = estimateTaskCost(task, model);
    totalCost += est.cost_usd;
    totalInput += est.input_tokens;
    totalOutput += est.output_tokens;

    const costStr = `$${est.cost_usd.toFixed(3)}`;
    const confIcon = est.confidence === 'high' ? '' : est.confidence === 'medium' ? ' ~' : ' ≈';
    const multStr = est.multiplier > 1.05 ? ` ${C.dim}(×${est.multiplier.toFixed(1)})${C.reset}` : '';
    console.log(`  ${task.id}: ${task.name.padEnd(30)} ${C.dim}${task.size.padEnd(8)}${C.reset} ${model.padEnd(8)} ${C.yellow}${costStr}${confIcon}${C.reset}${multStr}`);
  }

  console.log(`  ${'─'.repeat(60)}`);
  console.log(`  ${'Total'.padEnd(30)} ${' '.repeat(17)} ${C.bold}${C.yellow}$${totalCost.toFixed(3)}${C.reset}`);
  console.log(`  ${C.dim}Input: ~${(totalInput / 1000).toFixed(0)}K tokens, Output: ~${(totalOutput / 1000).toFixed(0)}K tokens${C.reset}`);
  console.log(`  ${C.dim}Confidence: ≈ = low (complex/strategy), ~ = medium, (blank) = high${C.reset}`);

  const budget = config.budget?.max_usd;
  if (budget) {
    const pct = (totalCost / budget * 100).toFixed(0);
    const color = totalCost > budget ? C.red : totalCost > budget * 0.8 ? C.yellow : C.green;
    console.log(`  ${color}Budget: $${totalCost.toFixed(2)} / $${budget} (${pct}%)${C.reset}`);
  }

  console.log('');
}

// ── cmdNext ─────────────────────────────────────────────────────────

/**
 * resolveNext — Determine the next action based on current phase + artifact state.
 * Pure state → recommendation function. No side effects.
 */
function R(en, ko) { return isNormalMode() ? ko : en; }

function resolveNext(project) {
  const manifest = readJSON(manifestPath(project));
  const phase = PHASES.find(p => p.id === manifest.current_phase);
  const taskData = readJSON(tasksPath(project));
  const contextExists = existsSync(join(contextDir(project), 'CONTEXT.md'));
  const reqExists = existsSync(join(contextDir(project), 'REQUIREMENTS.md'));
  const roadmapExists = existsSync(join(contextDir(project), 'ROADMAP.md'));
  const prdExists = existsSync(join(contextDir(project), 'PRD.md'));
  const planCheckPath = join(phaseDir(project, '02-plan'), 'plan-check.json');
  const planCheckExists = existsSync(planCheckPath);

  const artifacts = { context: contextExists, requirements: reqExists, roadmap: roadmapExists, prd: prdExists, plan_check: planCheckExists };
  const base = { project: manifest.display_name || project, phase: phase?.name || 'unknown', artifacts };

  switch (phase?.name) {
    case 'research': {
      if (!contextExists) {
        return { ...base, action: 'discuss', args: ['--mode', 'interview'], reason: R('No CONTEXT.md found. Start requirements interview.', '요구사항을 정리하는 인터뷰를 시작하세요.') };
      }
      if (!reqExists) {
        return { ...base, action: 'research', args: [], reason: R('CONTEXT.md exists but no REQUIREMENTS.md. Run parallel research.', '요구사항 문서가 없습니다. 조사를 시작하세요.') };
      }
      return { ...base, action: 'phase', args: ['next'], reason: R('Research artifacts ready. Advance to Plan phase.', '조사가 끝났습니다. 계획 단계로 넘어가세요.'), ready: true };
    }
    case 'plan': {
      const tasks = taskData?.tasks || [];
      if (tasks.length === 0) {
        let goal = null;
        if (prdExists) {
          const prd = readMD(join(contextDir(project), 'PRD.md'));
          const goalMatch = prd.match(/^## 1\. Goal\s*\n+(.+)/m);
          if (goalMatch) goal = goalMatch[1].trim();
        }
        if (!goal && contextExists) {
          const ctx = readMD(join(contextDir(project), 'CONTEXT.md'));
          const goalMatch = ctx.match(/^## Goal\s*\n+(.+)/m);
          if (goalMatch) goal = goalMatch[1].trim();
        }
        return { ...base, action: 'plan', args: goal ? [goal] : [], reason: goal ? R(`Auto-extracted goal: "${goal}"`, `목표를 자동으로 찾았습니다: "${goal}"`) : R('No tasks yet. Run plan with a goal.', '할 일이 없습니다. 목표를 정해서 계획을 세우세요.'), goal };
      }
      if (!planCheckExists) {
        return { ...base, action: 'plan-check', args: [], reason: R(`${tasks.length} tasks defined but not validated. Run plan-check.`, `할 일 ${tasks.length}개가 있지만 검증되지 않았습니다. 계획을 점검하세요.`), task_count: tasks.length };
      }
      const checkResult = readJSON(planCheckPath);
      if (!checkResult?.passed) {
        return { ...base, action: 'plan-check', args: [], reason: R('Plan-check failed. Fix issues and re-run.', '계획 점검에서 문제가 발견되었습니다. 수정 후 다시 점검하세요.'), plan_check_passed: false };
      }
      return { ...base, action: 'phase', args: ['next'], reason: R('Plan validated. Advance to Execute phase.', '계획이 확인되었습니다. 실행 단계로 넘어가세요.'), ready: true };
    }
    case 'execute': {
      const stepData = readJSON(stepsPath(project));
      if (!stepData?.steps?.length) {
        return { ...base, action: 'steps', args: ['compute'], reason: R('No steps computed. Calculate execution order.', '실행 순서가 아직 없습니다. 순서를 계산하세요.') };
      }
      const allDone = (taskData?.tasks || []).every(t =>
        [TASK_STATES.COMPLETED, TASK_STATES.CANCELLED].includes(t.status)
      );
      if (allDone) {
        return { ...base, action: 'phase', args: ['next'], reason: R('All tasks completed. Advance to Verify phase.', '모든 할 일이 끝났습니다. 확인 단계로 넘어가세요.'), ready: true };
      }
      return { ...base, action: 'run', args: [], reason: R('Execute next step via agent orchestration.', '다음 할 일을 실행하세요.') };
    }
    case 'verify': {
      return { ...base, action: 'quality', args: [], reason: R('Run test/lint/build checks, then verify-coverage.', '테스트와 품질 검사를 실행하세요.') };
    }
    case 'close': {
      return { ...base, action: 'close', args: ['--summary'], reason: R('Finalize the project.', '프로젝트를 마무리하세요.') };
    }
    default:
      return { ...base, action: null, args: [], reason: 'Unknown phase state.' };
  }
}

export function cmdNext(args) {
  const project = resolveProject(null);
  const jsonMode = args.includes('--json');
  const result = resolveNext(project);

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const manifest = readJSON(manifestPath(project));
  const phase = PHASES.find(p => p.id === manifest.current_phase);

  console.log(`\n${C.bold}Next Step${C.reset}\n`);
  console.log(`  Project: ${manifest.display_name || project}`);
  console.log(`  Phase:   ${phase?.label || '?'}\n`);

  const color = result.ready ? C.green : C.yellow;
  const cmd = result.action === 'phase' ? `x-build ${result.action} ${result.args.join(' ')}` :
              result.action === 'plan' && result.goal ? `x-build plan "${result.goal}"` :
              `x-build ${result.action}${result.args.length ? ' ' + result.args.join(' ') : ''}`;
  console.log(`  ${color}-> Run: ${cmd}${C.reset}`);
  console.log(`    ${result.reason}`);
  console.log('');
}

// ── cmdHandoff ──────────────────────────────────────────────────────

export function cmdHandoff(args) {
  const { opts } = parseOptions(args);
  const project = resolveProject(null);
  const handoffPath = join(projectDir(project), 'HANDOFF.json');

  if (opts.restore || args[0] === '--restore') {
    if (!existsSync(handoffPath)) {
      console.log('No handoff file found.');
      return;
    }
    const handoff = readJSON(handoffPath);
    console.log(`\n${C.bold}Session Handoff — ${handoff.project}${C.reset}`);
    console.log(`  Saved: ${handoff.saved_at}`);
    console.log(`  Phase: ${handoff.phase}`);
    console.log(`\n${C.bold}Summary:${C.reset}`);
    console.log(`  ${handoff.summary}`);
    if (handoff.pending_tasks?.length) {
      console.log(`\n${C.bold}Pending tasks:${C.reset}`);
      for (const t of handoff.pending_tasks) {
        console.log(`  [ ] ${t.id}: ${t.name}`);
      }
    }
    if (handoff.recent_decisions?.length) {
      console.log(`\n${C.bold}Recent decisions:${C.reset}`);
      for (const d of handoff.recent_decisions) {
        console.log(`  * ${d}`);
      }
    }
    console.log('');
    return;
  }

  // Save handoff
  const manifest = readJSON(manifestPath(project));
  const phase = PHASES.find(p => p.id === manifest.current_phase);
  const taskData = readJSON(tasksPath(project));
  const decisions = readJSON(decisionsPath(project));

  const pendingTasks = (taskData?.tasks || [])
    .filter(t => ![TASK_STATES.COMPLETED, TASK_STATES.CANCELLED].includes(t.status))
    .map(t => ({ id: t.id, name: t.name, status: t.status }));

  const recentDecisions = (decisions?.decisions || [])
    .slice(-5)
    .map(d => d.title);

  const completedCount = (taskData?.tasks || []).filter(t => t.status === TASK_STATES.COMPLETED).length;
  const totalCount = (taskData?.tasks || []).length;

  const handoff = {
    project,
    phase: phase?.label || manifest.current_phase,
    saved_at: new Date().toISOString(),
    summary: `Phase: ${phase?.label}. Tasks: ${completedCount}/${totalCount} completed. ${pendingTasks.length} remaining.`,
    pending_tasks: pendingTasks,
    recent_decisions: recentDecisions,
    context_files: {
      has_context: existsSync(join(contextDir(project), 'CONTEXT.md')),
      has_requirements: existsSync(join(contextDir(project), 'REQUIREMENTS.md')),
      has_roadmap: existsSync(join(contextDir(project), 'ROADMAP.md')),
    },
  };

  writeJSON(handoffPath, handoff);
  console.log(`Handoff saved for "${project}"`);
  console.log(`   Restore in new session: x-build handoff --restore`);
}

// ── cmdSummarize ────────────────────────────────────────────────────

export function cmdSummarize(args) {
  const project = resolveProject(null);
  const stepData = readJSON(stepsPath(project));
  const taskData = readJSON(tasksPath(project));

  if (!stepData?.steps?.length) {
    console.log('No steps to summarize.');
    return;
  }

  console.log(`\n${C.bold}📋 Step Summaries${C.reset}\n`);

  let totalCompleted = 0;
  let totalFailed = 0;
  let totalDuration = 0;

  for (const step of stepData.steps) {
    const summary = _summarizeStep(project, step.id, taskData, stepData);
    if (!summary) continue;

    totalCompleted += summary.completed;
    totalFailed += summary.failed;

    const durations = summary.tasks.filter(t => t.duration_ms).map(t => t.duration_ms);
    const stepDuration = durations.reduce((a, b) => a + b, 0);
    totalDuration += stepDuration;

    const icon = summary.completed === summary.total_tasks ? '✅' :
                 summary.failed > 0 ? '❌' : '⬜';

    console.log(`  ${icon} Step ${step.id}: ${summary.completed}/${summary.total_tasks} tasks ${C.dim}(${fmtDuration(stepDuration)})${C.reset}`);
    for (const t of summary.tasks) {
      const tIcon = { completed: '✅', failed: '❌', running: '🔵', pending: '⬜', ready: '🟡' }[t.status] || '⬜';
      const dur = t.duration_ms ? ` ${C.dim}${fmtDuration(t.duration_ms)}${C.reset}` : '';
      console.log(`    ${tIcon} ${t.id}: ${t.name}${dur}`);
    }
  }

  console.log(`\n${C.bold}Total:${C.reset} ${totalCompleted} completed, ${totalFailed} failed, ${fmtDuration(totalDuration)} elapsed\n`);
}

function _summarizeStep(project, stepId, taskData, stepData) {
  if (!stepData?.steps || !taskData?.tasks) return null;

  const step = stepData.steps.find(s => s.id === stepId);
  if (!step) return null;

  const taskDetails = step.tasks.map(id => {
    const t = taskData.tasks.find(t => t.id === id);
    return {
      id,
      name: t?.name || '?',
      status: t?.status || 'unknown',
      duration_ms: t?.completed_at && t?.started_at
        ? new Date(t.completed_at) - new Date(t.started_at)
        : null,
    };
  });

  const summary = {
    step_id: stepId,
    total_tasks: taskDetails.length,
    completed: taskDetails.filter(t => t.status === 'completed').length,
    failed: taskDetails.filter(t => t.status === 'failed').length,
    tasks: taskDetails,
    summarized_at: new Date().toISOString(),
  };

  // Archive full step data
  const aDir = archiveDir(project);
  mkdirSync(aDir, { recursive: true });
  writeJSON(join(aDir, `step-${stepId}.json`), summary);

  return summary;
}

// ── cmdSaveArtifact ─────────────────────────────────────────────────

export function cmdSaveArtifact(args) {
  const { opts, positional } = parseOptions(args);
  const project = resolveProject(null);
  const type = positional[0];

  if (!type) {
    console.error('Usage: x-build save <context|requirements|roadmap|project|plan> [--content "..."]');
    process.exit(1);
  }

  let content = opts.content || '';
  if (!content && !process.stdin.isTTY) {
    content = readFileSync(0, 'utf8');
  }

  if (!content) {
    console.error('No content provided. Use --content or pipe via stdin.');
    process.exit(1);
  }

  const paths = {
    'context': join(contextDir(project), 'CONTEXT.md'),
    'requirements': join(contextDir(project), 'REQUIREMENTS.md'),
    'roadmap': join(contextDir(project), 'ROADMAP.md'),
    'project': join(contextDir(project), 'PROJECT.md'),
    'plan': join(phaseDir(project, '02-plan'), `plan-PLAN.md`),
  };

  const dest = paths[type];
  if (!dest) {
    console.error(`Unknown artifact type: "${type}". Valid: ${Object.keys(paths).join(', ')}`);
    process.exit(1);
  }

  writeMD(dest, content);
  console.log(`Saved ${type} artifact: ${dest}`);
}

// ── cmdContextUsage ─────────────────────────────────────────────────

export function cmdContextUsage(args) {
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));

  let totalChars = 0;
  const files = [];

  const checkFile = (path, label) => {
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf8');
      totalChars += content.length;
      files.push({ label, chars: content.length, tokens: Math.round(content.length / 4) });
    }
  };

  checkFile(join(contextDir(project), 'CONTEXT.md'), 'CONTEXT.md');
  checkFile(join(contextDir(project), 'REQUIREMENTS.md'), 'REQUIREMENTS.md');
  checkFile(join(contextDir(project), 'ROADMAP.md'), 'ROADMAP.md');
  checkFile(join(contextDir(project), 'PROJECT.md'), 'PROJECT.md');
  checkFile(join(contextDir(project), 'decisions.md'), 'Decisions');
  checkFile(join(contextDir(project), 'brief.md'), 'Brief');
  checkFile(tasksPath(project), 'Tasks JSON');
  checkFile(stepsPath(project), 'Steps JSON');

  for (const phase of PHASES) {
    const planPath = join(phaseDir(project, phase.id), `${phase.name}-PLAN.md`);
    checkFile(planPath, `${phase.label} Plan`);
  }

  const totalTokens = Math.round(totalChars / 4);
  const maxTokens = 200000;
  const usedPct = Math.round((totalTokens / maxTokens) * 100);

  console.log(`\n${C.bold}Context Usage — ${project}${C.reset}\n`);
  console.log(`  Total: ~${totalTokens.toLocaleString()} tokens (${usedPct}% of ~200K window)\n`);

  files.sort((a, b) => b.tokens - a.tokens);
  for (const f of files) {
    const bar = '#'.repeat(Math.max(1, Math.round(f.tokens / (totalTokens || 1) * 20)));
    console.log(`  ${f.label.padEnd(20)} ${C.dim}~${f.tokens.toLocaleString().padStart(6)} tokens${C.reset} ${C.cyan}${bar}${C.reset}`);
  }

  console.log('');
  if (usedPct > 75) {
    console.log(`  ${C.red}High context usage — consider: x-build handoff${C.reset}`);
  } else if (usedPct > 35) {
    console.log(`  ${C.yellow}Moderate context usage — monitor growth${C.reset}`);
  } else {
    console.log(`  ${C.green}Context usage is healthy${C.reset}`);
  }
  console.log('');
}
