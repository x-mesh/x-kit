/**
 * x-build/tasks — Task management + execution
 */

import {
  PHASES, TASK_STATES, STATUS_ALIASES, C,
  ROLE_MODEL_MAP_HR, XM_GLOBAL, PLUGIN_ROOT, ROOT,
  readJSON, writeJSON, modifyJSON, readMD,
  manifestPath, tasksPath, stepsPath, contextDir, phaseDir, decisionsPath, projectDir,
  resolveProject, logDecision, appendMetric, emitHook,
  parseOptions, renderBar, fmtDuration,
  estimateTaskCost,
  gitAutoCommit, gitRollbackTask,
  updateCircuitBreaker, isCircuitOpen, scheduleRetry,
  getCircuitState, resetCircuitBreaker,
  existsSync, join, mkdirSync,
  createRL, ask, pickMenu,
} from './core.mjs';

// ── cmdTasks ────────────────────────────────────────────────────────

export function cmdTasks(args) {
  const sub = args[0];
  if (!sub || !['add', 'list', 'remove', 'update', 'done-criteria'].includes(sub)) {
    console.error('Usage: x-build tasks <add|list|remove|update|done-criteria> [args]');
    process.exit(1);
  }

  const project = resolveProject(null);

  if (sub === 'add') return taskAdd(project, args.slice(1));
  if (sub === 'list') return taskList(project);
  if (sub === 'remove') return taskRemove(project, args.slice(1));
  if (sub === 'update') return taskUpdate(project, args.slice(1));
  if (sub === 'done-criteria') return taskDoneCriteria(project);
}

export function taskDoneCriteria(project) {
  const data = readJSON(tasksPath(project));
  if (!data?.tasks?.length) {
    console.log('No tasks defined. Run: x-build tasks add <name>');
    return;
  }

  const prdPath = join(phaseDir(project, '02-plan'), 'PRD.md');
  const prd = readMD(prdPath);

  if (!prd) {
    console.log(`${C.yellow}No PRD found. done_criteria works best with PRD acceptance criteria.${C.reset}`);
    console.log(`  Set manually: x-build tasks update <id> --done-criteria "criteria"`);
    return;
  }

  const acSection = prd.match(/##\s*(?:8\.)?\s*Acceptance Criteria[\s\S]*?(?=##\s*\d|$)/i);
  const acItems = acSection ? [...acSection[0].matchAll(/- \[[ x]\] (.+)/gi)].map(m => m[1].trim()) : [];

  const acByRid = new Map();
  for (const ac of acItems) {
    const acLower = ac.toLowerCase();
    const rids = [...acLower.matchAll(/r\d+/g)].map(m => m[0]);
    for (const rid of rids) {
      if (!acByRid.has(rid)) acByRid.set(rid, []);
      acByRid.get(rid).push(ac);
    }
  }

  let updated = 0;
  for (const task of data.tasks) {
    if (task.done_criteria?.length) continue;

    const reqIds = [...(task.name.matchAll(/\[R\d+\]/g))].map(m => m[0].replace(/[\[\]]/g, '').toLowerCase());
    const criteria = [];

    for (const rid of reqIds) {
      const matched = acByRid.get(rid);
      if (matched) criteria.push(...matched);
    }

    if (criteria.length === 0) {
      criteria.push(`${task.name} completes successfully on happy path`);
    }

    // Size-based test expectations
    const testCriteria = {
      small: ['Unit test passes for core logic'],
      medium: ['Unit tests pass', 'Integration test covers main flow'],
      large: ['Unit tests pass (80%+ coverage)', 'Integration tests pass', 'E2E test covers critical path'],
    };
    criteria.push(...(testCriteria[task.size] || testCriteria.medium));

    // Domain-specific criteria based on task name keywords
    const nameLower = task.name.toLowerCase();
    if (/\b(auth|login|security|jwt|oauth|session)\b/.test(nameLower)) {
      criteria.push('No OWASP Top 10 vulnerabilities (SQLi, XSS, CSRF)');
    }
    if (/\b(api|endpoint|route|rest|graphql)\b/.test(nameLower)) {
      criteria.push('Error responses (4xx, 5xx) are handled and documented');
    }
    if (/\b(database|migration|schema|model)\b/.test(nameLower)) {
      criteria.push('Rollback scenario verified');
    }
    if (/\b(ui|frontend|component|page|view)\b/.test(nameLower)) {
      criteria.push('Renders correctly on target browsers/viewports');
    }

    // NFR criteria from PRD Section 4
    const nfrSection = prd.match(/##\s*(?:4\.)?\s*Non.?Functional[\s\S]*?(?=##\s*\d|$)/i);
    if (nfrSection) {
      const nfr = nfrSection[0];
      if (/performance|latency|response.?time/i.test(nfr) && /\b(api|endpoint|server)\b/.test(nameLower)) {
        const perfTarget = nfr.match(/(\d+\s*ms|\d+\s*s(?:ec)?)/i);
        criteria.push(perfTarget ? `Response time meets target: ${perfTarget[1]}` : 'Performance target met');
      }
    }

    task.done_criteria = criteria;
    updated++;
  }

  if (updated > 0) writeJSON(tasksPath(project), data);
  console.log(`\n✅ done_criteria generated for ${updated} tasks\n`);

  for (const task of data.tasks) {
    if (task.done_criteria) {
      console.log(`  ${task.id}: ${task.done_criteria}`);
    }
  }
  console.log('');
}

export function taskAdd(project, args) {
  const { opts, positional } = parseOptions(args);
  const name = positional.join(' ');

  if (!name) {
    console.error('Usage: x-build tasks add <name> [--deps t1,t2] [--size small|medium|large] [--strategy refine] [--rubric general]');
    process.exit(1);
  }

  const data = readJSON(tasksPath(project)) || { tasks: [] };
  const maxNum = data.tasks.reduce((max, t) => {
    const n = parseInt(t.id?.replace('t', ''), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const id = `t${maxNum + 1}`;
  const deps = opts.deps ? opts.deps.split(',').map(d => d.trim()) : [];
  const size = opts.size || 'medium';

  const validIds = new Set(data.tasks.map(t => t.id));
  for (const dep of deps) {
    if (!validIds.has(dep)) {
      console.error(`❌ Unknown dependency: "${dep}". Known: ${[...validIds].join(', ') || 'none'}`);
      process.exit(1);
    }
  }

  const role = opts.role || null;
  const strategy = opts.strategy || null;
  const rubric = opts.rubric || null;
  const team = opts.team || null;
  const rawCriteria = opts['done-criteria'] || null;
  const doneCriteria = rawCriteria ? rawCriteria.split(';').map(c => c.trim()).filter(Boolean) : null;

  const task = {
    id,
    name,
    depends_on: deps,
    size,
    role,
    strategy,
    rubric,
    team,
    score: null,
    done_criteria: doneCriteria,
    status: TASK_STATES.PENDING,
    created_at: new Date().toISOString(),
  };

  // Scope creep detection: check against PRD Out of Scope
  const prdPath = join(phaseDir(project, '02-plan'), 'PRD.md');
  if (existsSync(prdPath)) {
    const prd = readMD(prdPath);
    const oosSection = prd?.match(/##\s*(?:6\.)?\s*Out of Scope[\s\S]*?(?=##\s*\d|$)/i);
    if (oosSection) {
      const oosItems = oosSection[0].match(/- (.+)/g)?.map(m => m.slice(2).trim().toLowerCase()) || [];
      const nameLower = name.toLowerCase();
      const scopeHit = oosItems.find(item => {
        const words = item.split(/\s+/).filter(w => w.length > 3);
        return words.some(w => nameLower.includes(w));
      });
      if (scopeHit) {
        console.log(`${C.yellow}⚠ Scope warning: "${name}" may overlap with Out of Scope item: "${scopeHit}"${C.reset}`);
        console.log(`${C.dim}  If intentional, proceed. Otherwise consider removing this task.${C.reset}`);
      }
    }
  }

  data.tasks.push(task);
  writeJSON(tasksPath(project), data);
  console.log(`✅ Task added: ${id} — ${name}${deps.length ? ` (deps: ${deps.join(', ')})` : ''}`);
}

export function taskList(project) {
  const data = readJSON(tasksPath(project));
  if (!data?.tasks?.length) {
    console.log('No tasks defined. Run: x-build tasks add <name>');
    return;
  }

  console.log(`\n📋 Tasks (${data.tasks.length}):\n`);

  const stateIcon = {
    [TASK_STATES.PENDING]: '⬜',
    [TASK_STATES.READY]: '🟡',
    [TASK_STATES.RUNNING]: '🔵',
    [TASK_STATES.COMPLETED]: '✅',
    [TASK_STATES.FAILED]: '❌',
    [TASK_STATES.CANCELLED]: '⛔',
  };

  const scoredTasks = [];
  for (const task of data.tasks) {
    const icon = stateIcon[task.status] || '⬜';
    const deps = task.depends_on.length ? ` ← [${task.depends_on.join(', ')}]` : '';
    const size = task.size ? ` (${task.size})` : '';
    const scoreStr = task.score != null ? ` Score: ${task.score}/10` : '';
    const scoreWarn = task.score != null && task.score < 7 ? ' ⚠' : '';
    const strategyStr = task.strategy ? ` ${C.yellow}[${task.strategy}]${C.reset}` : '';
    console.log(`  ${icon} ${task.id}: ${task.name}${size}${deps}${scoreStr}${scoreWarn}${strategyStr}`);
    if (task.score != null) scoredTasks.push(task);
  }

  if (scoredTasks.length > 0) {
    const avg = scoredTasks.reduce((s, t) => s + t.score, 0) / scoredTasks.length;
    const belowThreshold = scoredTasks.filter(t => t.score < 7).length;
    const color = avg >= 7 ? C.green : avg >= 5 ? C.yellow : C.red;
    console.log(`\n  📊 Quality: ${color}${avg.toFixed(1)}/10 avg${C.reset} (${scoredTasks.length} scored${belowThreshold ? `, ${C.yellow}${belowThreshold} below 7.0${C.reset}` : ''})`);
  }
  console.log('');
}

export function taskRemove(project, args) {
  const id = args[0];
  if (!id) {
    console.error('Usage: x-build tasks remove <task-id>');
    process.exit(1);
  }

  const data = readJSON(tasksPath(project));
  const idx = data.tasks.findIndex(t => t.id === id);
  if (idx === -1) {
    console.error(`❌ Task "${id}" not found.`);
    process.exit(1);
  }

  const dependents = data.tasks.filter(t => t.depends_on.includes(id));
  if (dependents.length > 0) {
    console.error(`❌ Cannot remove "${id}" — depended on by: ${dependents.map(t => t.id).join(', ')}`);
    process.exit(1);
  }

  data.tasks.splice(idx, 1);
  writeJSON(tasksPath(project), data);
  console.log(`✅ Task "${id}" removed.`);
}

export function taskUpdate(project, args) {
  const { opts, positional } = parseOptions(args);
  const id = positional[0];
  const rawStatus = opts.status;

  if (!id || (!rawStatus && opts.score === undefined && opts['done-criteria'] === undefined)) {
    console.error('Usage: x-build tasks update <task-id> --status <pending|ready|running|completed|failed>');
    console.error('       x-build tasks update <task-id> --score <number>');
    console.error('       x-build tasks update <task-id> --done-criteria "criteria text"');
    process.exit(1);
  }

  // Use modifyJSON for atomic read-modify-write (parallel agent safe)
  let taskFound = false;
  let oldStatus, newStatus, updatedFields = [];

  modifyJSON(tasksPath(project), (data) => {
    if (!data) { console.error('❌ No tasks data found.'); process.exit(1); }
    const task = data.tasks.find(t => t.id === id);
    if (!task) { console.error(`❌ Task "${id}" not found.`); process.exit(1); }
    taskFound = true;

    if (opts.score !== undefined) {
      task.score = parseFloat(opts.score);
      updatedFields.push(`score: ${task.score}`);
    }

    if (opts['done-criteria'] !== undefined) {
      if (typeof opts['done-criteria'] !== 'string') {
        console.error('❌ --done-criteria requires a value. Usage: --done-criteria "criteria text"');
        process.exit(1);
      }
      task.done_criteria = opts['done-criteria'].split(';').map(c => c.trim()).filter(Boolean);
      updatedFields.push('done_criteria updated');
    }

    if (!rawStatus) return data;

    newStatus = STATUS_ALIASES[rawStatus] || rawStatus;
    if (!Object.values(TASK_STATES).includes(newStatus)) {
      console.error(`❌ Invalid status: "${rawStatus}". Valid: ${Object.values(TASK_STATES).join(', ')}`);
      process.exit(1);
    }

    oldStatus = task.status;
    task.status = newStatus;
    if (newStatus === TASK_STATES.COMPLETED) task.completed_at = new Date().toISOString();
    if (newStatus === TASK_STATES.RUNNING) task.started_at = new Date().toISOString();
    if (newStatus === TASK_STATES.FAILED) {
      task.failed_at = new Date().toISOString();
      if (opts['error-msg']) task.error_message = opts['error-msg'];
    }
    return data;
  });

  if (!rawStatus) {
    console.log(`✅ Task "${id}" ${updatedFields.join(', ')}`);
    return;
  }

  emitHook('task:post-update', { project, taskId: id, from: oldStatus, to: newStatus });

  if (newStatus === TASK_STATES.COMPLETED) {
    const manifest = readJSON(manifestPath(project));
    const phase = PHASES.find(p => p.id === manifest?.current_phase);
    const sha = gitAutoCommit(project, task, phase?.name || 'unknown');
    if (sha) {
      task.commit_sha = sha;
      writeJSON(tasksPath(project), data);
      console.log(`  ${C.dim}📎 commit: ${sha.slice(0, 8)}${C.reset}`);
    }
    if (task.started_at) {
      appendMetric({
        type: 'task_complete', project, taskId: id, taskName: task.name,
        duration_ms: new Date(task.completed_at) - new Date(task.started_at),
        timestamp: task.completed_at,
      });
    }
  }

  if (newStatus === TASK_STATES.FAILED) {
    updateCircuitBreaker(project, true);

    if (opts.rollback !== 'false' && task.commit_sha) {
      const rolled = gitRollbackTask(task);
      if (rolled) console.log(`  ${C.dim}🔄 rolled back to ${task.commit_sha.slice(0, 8)}${C.reset}`);
    }

    if (opts.retry !== 'false') {
      const scheduled = scheduleRetry(project, task, data);
      if (!scheduled) {
        // Retry exhausted — mark dependent tasks as blocked
        for (const t of data.tasks) {
          if (t.depends_on?.includes(id) && t.status === TASK_STATES.PENDING) {
            t.blocked_by = id;
            console.log(`  ${C.yellow}⚠ ${t.id} blocked by failed ${id}${C.reset}`);
          }
        }
        writeJSON(tasksPath(project), data);
      }
    }
  }

  if (newStatus === TASK_STATES.COMPLETED) {
    updateCircuitBreaker(project, false);

    const allTasks = data.tasks;
    const completedCount = allTasks.filter(t => t.status === TASK_STATES.COMPLETED).length;
    const failedCount = allTasks.filter(t => t.status === TASK_STATES.FAILED).length;
    if (completedCount + failedCount === allTasks.length && allTasks.length > 0) {
      const durations = allTasks
        .filter(t => t.started_at && t.completed_at)
        .map(t => new Date(t.completed_at) - new Date(t.started_at));
      const scores = allTasks.filter(t => t.score != null).map(t => t.score);
      appendMetric({
        type: 'run_complete', project, task_count: allTasks.length,
        completed: completedCount, failed: failedCount,
        total_duration_ms: durations.reduce((a, b) => a + b, 0),
        avg_quality_score: scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : null,
        timestamp: new Date().toISOString(),
      });
    }
  }

  console.log(`✅ Task "${id}" → ${newStatus}`);
}

// ── DAG & Steps ─────────────────────────────────────────────────────

export function computeSteps(tasks) {
  if (tasks.length === 0) return [];

  const adj = new Map();
  const indegree = new Map();
  const taskMap = new Map();

  for (const t of tasks) {
    adj.set(t.id, []);
    indegree.set(t.id, 0);
    taskMap.set(t.id, t);
  }

  for (const t of tasks) {
    for (const dep of t.depends_on) {
      if (!adj.has(dep)) continue;
      adj.get(dep).push(t.id);
      indegree.set(t.id, indegree.get(t.id) + 1);
    }
  }

  const steps = [];
  const remaining = new Set(tasks.map(t => t.id));
  let stepNum = 1;

  while (remaining.size > 0) {
    const ready = [];
    for (const id of remaining) {
      if (indegree.get(id) === 0) ready.push(id);
    }

    if (ready.length === 0) {
      const cycleNodes = [...remaining].join(', ');
      throw new Error(`Circular dependency detected among: ${cycleNodes}`);
    }

    steps.push({
      id: stepNum,
      tasks: ready,
      status: 'pending',
    });

    for (const id of ready) {
      remaining.delete(id);
      for (const succ of adj.get(id)) {
        indegree.set(succ, indegree.get(succ) - 1);
      }
    }

    stepNum++;
  }

  return steps;
}

export function cmdSteps(args) {
  const sub = args[0];
  if (!sub || !['compute', 'status', 'next'].includes(sub)) {
    console.error('Usage: x-build steps <compute|status|next> [project]');
    process.exit(1);
  }

  const project = resolveProject(args[1] || null, { autoInit: true });

  if (sub === 'compute') return stepsCompute(project);
  if (sub === 'status') return stepsStatus(project);
  if (sub === 'next') return stepsNext(project);
}

export function stepsCompute(project) {
  const data = readJSON(tasksPath(project));
  if (!data?.tasks?.length) {
    console.error('❌ No tasks defined. Run: x-build tasks add <name>');
    process.exit(1);
  }

  try {
    const steps = computeSteps(data.tasks);
    writeJSON(stepsPath(project), { steps, computed_at: new Date().toISOString() });

    console.log(`✅ ${steps.length} steps computed from ${data.tasks.length} tasks:\n`);
    for (const step of steps) {
      const taskNames = step.tasks.map(id => {
        const t = data.tasks.find(t => t.id === id);
        return `${id}: ${t?.name || '?'}`;
      });
      console.log(`  🔹 Step ${step.id}: [${taskNames.join(', ')}]`);
    }
    console.log('');
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

export function stepsStatus(project) {
  const stepData = readJSON(stepsPath(project));
  const taskData = readJSON(tasksPath(project));

  if (!stepData?.steps?.length) {
    console.log('No steps computed. Run: x-build steps compute');
    return;
  }

  console.log(`\n🔹 Steps (${stepData.steps.length}):\n`);

  for (const step of stepData.steps) {
    const taskDetails = step.tasks.map(id => {
      const t = taskData.tasks.find(t => t.id === id);
      const icon = {
        pending: '⬜', ready: '🟡', running: '🔵',
        completed: '✅', failed: '❌', cancelled: '⛔',
      }[t?.status || 'pending'];
      return `${icon} ${id}`;
    });

    const allDone = step.tasks.every(id => {
      const t = taskData.tasks.find(t => t.id === id);
      return t?.status === TASK_STATES.COMPLETED;
    });
    const anyRunning = step.tasks.some(id => {
      const t = taskData.tasks.find(t => t.id === id);
      return t?.status === TASK_STATES.RUNNING;
    });

    let stepIcon = '⬜';
    if (allDone) stepIcon = '✅';
    else if (anyRunning) stepIcon = '🔵';

    console.log(`  ${stepIcon} Step ${step.id}: ${taskDetails.join('  ')}`);
  }
  console.log('');
}

export function stepsNext(project) {
  const stepData = readJSON(stepsPath(project));
  const taskData = readJSON(tasksPath(project));

  if (!stepData?.steps?.length) {
    console.log('No steps computed. Run: x-build steps compute');
    return;
  }

  for (const step of stepData.steps) {
    const pendingTasks = step.tasks.filter(id => {
      const t = taskData.tasks.find(t => t.id === id);
      return t && [TASK_STATES.PENDING, TASK_STATES.READY].includes(t.status);
    });

    if (pendingTasks.length > 0) {
      for (const id of pendingTasks) {
        const t = taskData.tasks.find(t => t.id === id);
        if (t) t.status = TASK_STATES.READY;
      }
      writeJSON(tasksPath(project), taskData);

      console.log(`🔹 Step ${step.id} ready — ${pendingTasks.length} tasks:`);
      for (const id of pendingTasks) {
        const t = taskData.tasks.find(t => t.id === id);
        console.log(`  🟡 ${id}: ${t?.name}`);
      }
      return;
    }
  }

  console.log('✅ All steps completed.');
}

// ── Strategy Suggestion ────────────────────────────────────────────

const STRATEGY_KEYWORDS = [
  { pattern: /\b(review|audit|check|inspect)\b/i, strategy: 'review' },
  { pattern: /\b(design|plan|architect)\b/i, strategy: 'refine' },
  { pattern: /\b(compare|evaluate|versus|vs)\b/i, strategy: 'debate' },
  { pattern: /\b(investigate|analyze|debug|diagnose)\b/i, strategy: 'investigate' },
  { pattern: /\b(security|vulnerability|pentest|attack)\b/i, strategy: 'red-team' },
  { pattern: /\b(brainstorm|ideate|explore ideas)\b/i, strategy: 'brainstorm' },
];

function suggestStrategy(taskName) {
  for (const { pattern, strategy } of STRATEGY_KEYWORDS) {
    if (pattern.test(taskName)) return strategy;
  }
  return null;
}

// ── Execution Engine ────────────────────────────────────────────────

function buildAgentPrompt(project, task, briefContent, decisionsContent, { manifest, taskData, stepData } = {}) {
  manifest = manifest || readJSON(manifestPath(project));
  const lines = [
    `## Task: ${task.name}`,
    `ID: ${task.id} | Size: ${task.size} | Project: ${manifest?.display_name || project}`,
    '',
  ];

  // Done criteria — definition of done
  if (task.done_criteria?.length) {
    lines.push('## Definition of Done');
    for (const c of task.done_criteria) {
      lines.push(`- [ ] ${c}`);
    }
    lines.push('');
  }

  // Step progress context
  try {
    const steps = stepData || readJSON(stepsPath(project));
    if (steps?.steps?.length) {
      const stepIdx = steps.steps.findIndex(s => Array.isArray(s.tasks) && s.tasks.includes(task.id));
      if (stepIdx >= 0) {
        lines.push(`Step: ${stepIdx + 1}/${steps.steps.length}`, '');
      }
    }
  } catch { /* steps.json optional */ }

  if (briefContent) {
    lines.push('## Project Context', briefContent, '');
  }

  if (decisionsContent) {
    lines.push(decisionsContent, '');
  }

  if (task.depends_on?.length > 0) {
    const tasks = taskData || readJSON(tasksPath(project));
    lines.push('## Completed Dependencies');
    for (const depId of task.depends_on) {
      const dep = tasks?.tasks?.find(t => t.id === depId);
      if (dep) lines.push(`- ${dep.id}: ${dep.name} (${dep.status})`);
    }
    lines.push('');
  }

  if (task.template) {
    const templateFile = join(phaseDir(project, '02-plan'), `${task.template}.md`);
    if (existsSync(templateFile)) {
      lines.push('## Task Template', readMD(templateFile).slice(0, 1500), '');
    }
  }

  lines.push(
    '## Instructions',
    `Complete the task "${task.name}" as described above.`,
    'Follow existing code patterns and conventions.',
    'Write clean, tested code.',
    '',
    '## On Completion',
    `After completing this task, run: node ${PLUGIN_ROOT}/lib/x-build-cli.mjs tasks update ${task.id} --status completed`,
    `If the task fails, run: node ${PLUGIN_ROOT}/lib/x-build-cli.mjs tasks update ${task.id} --status failed`,
  );

  return lines.join('\n');
}

export function cmdRun(args) {
  const { opts } = parseOptions(args);
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  if (!manifest) {
    console.error('❌ No project found. Run: x-build init <name>');
    process.exit(1);
  }
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);

  if (currentPhase?.name !== 'execute') {
    console.error(`❌ Cannot run — current phase is "${currentPhase?.label}", must be Execute.`);
    console.log(`\n  📍 Next steps:`);
    console.log(`     1. Review plan:   x-build plan-check`);
    console.log(`     2. Advance phase: x-build phase next`);
    console.log(`     3. Then run:      x-build run\n`);
    process.exit(1);
  }

  if (isCircuitOpen(project)) {
    console.error(`❌ Circuit breaker is OPEN. Wait for cooldown or reset manually.`);
    process.exit(1);
  }

  const taskData = readJSON(tasksPath(project));
  const stepData = readJSON(stepsPath(project));

  if (!stepData?.steps?.length) {
    console.error('❌ No steps computed. Run: x-build steps compute');
    process.exit(1);
  }

  let currentStep = null;
  for (const step of stepData.steps) {
    const hasPending = step.tasks.some(id => {
      const t = taskData.tasks.find(t => t.id === id);
      return t && ![TASK_STATES.COMPLETED, TASK_STATES.CANCELLED].includes(t.status);
    });
    if (hasPending) {
      currentStep = step;
      break;
    }
  }

  if (!currentStep) {
    console.log('✅ All steps completed. Run: x-build phase next');
    return;
  }

  const readyTasks = [];
  for (const id of currentStep.tasks) {
    const t = taskData.tasks.find(t => t.id === id);
    if (t && [TASK_STATES.PENDING, TASK_STATES.READY].includes(t.status)) {
      if (t.next_retry_at && new Date(t.next_retry_at) > new Date()) {
        continue;
      }
      const depsOk = t.depends_on.every(depId => {
        const dep = taskData.tasks.find(d => d.id === depId);
        return dep?.status === TASK_STATES.COMPLETED;
      });
      if (depsOk) {
        t.status = TASK_STATES.READY;
        readyTasks.push(t);
      }
    }
  }
  writeJSON(tasksPath(project), taskData);

  if (readyTasks.length === 0) {
    console.log(`⏳ No ready tasks in Step ${currentStep.id}. Some may be waiting for retries or dependencies.`);
    return;
  }

  // Generate context brief inline (avoid circular import with misc.mjs)
  const briefContent = (() => {
    try {
      const briefLines = [
        `# ${manifest.display_name || project} — Context Brief`,
        '',
        `**Phase:** ${currentPhase?.label || manifest.current_phase}`,
        '',
      ];
      if (taskData?.tasks?.length > 0) {
        const _done = taskData.tasks.filter(t => t.status === TASK_STATES.COMPLETED).length;
        briefLines.push(`## Tasks: ${_done}/${taskData.tasks.length} completed`, '');
      }
      return briefLines.join('\n');
    } catch { return ''; }
  })();

  const decisionsData = readJSON(decisionsPath(project));
  const decisionsContent = decisionsData?.decisions?.length
    ? '## Key Decisions\n' + decisionsData.decisions.slice(-5).map(d =>
        `- **${d.title}** (${d.phase}): ${d.rationale || ''}`
      ).join('\n')
    : '';

  if (opts.json) {
    const ROLE_MODEL_MAP = {
      architect: 'opus', reviewer: 'opus', security: 'opus',
      executor: 'sonnet', designer: 'sonnet', debugger: 'sonnet',
      explorer: 'haiku', writer: 'haiku',
    };
    const plan = readyTasks.map(task => {
      const role = task.role || (task.size === 'large' ? 'deep-executor' : 'executor');
      const model = ROLE_MODEL_MAP[role] || (task.size === 'large' ? 'opus' : 'sonnet');
      const entry = {
        task_id: task.id,
        task_name: task.name,
        size: task.size,
        role,
        agent_type: role === 'deep-executor' || model === 'opus' ? 'deep-executor' : 'executor',
        model,
        prompt: buildAgentPrompt(project, task, briefContent, decisionsContent, { manifest, taskData, stepData }),
        on_complete: `node ${join(PLUGIN_ROOT, 'lib', 'x-build-cli.mjs')}${XM_GLOBAL ? ' --global' : ''} tasks update ${task.id} --status completed`,
        on_fail: `node ${join(PLUGIN_ROOT, 'lib', 'x-build-cli.mjs')}${XM_GLOBAL ? ' --global' : ''} tasks update ${task.id} --status failed`,
      };
      if (task.strategy) {
        entry.strategy = task.strategy;
        entry.strategy_hint = `Use /x-op ${task.strategy} for this task`;
      } else {
        const suggested = suggestStrategy(task.name);
        if (suggested) entry.strategy_suggestion = suggested;
      }
      if (task.team) {
        entry.team = task.team;
        entry.team_hint = `Use /x-agent team assign ${task.team} "${task.name}"`;
      }
      return entry;
    });

    const output = {
      project,
      step: currentStep.id,
      total_steps: stepData.steps.length,
      tasks: plan,
      parallel: readyTasks.length > 1,
    };

    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Human-readable output
  console.log(`\n${C.bold}🚀 Execution Plan — Step ${currentStep.id}/${stepData.steps.length}${C.reset}\n`);

  const cost = readyTasks.reduce((sum, t) => {
    const role = t.role || (t.size === 'large' ? 'deep-executor' : 'executor');
    const model = ROLE_MODEL_MAP_HR[role] || (t.size === 'large' ? 'opus' : 'sonnet');
    return sum + estimateTaskCost(t, model).cost_usd;
  }, 0);
  console.log(`  Tasks: ${readyTasks.length} (${readyTasks.length > 1 ? 'parallel' : 'sequential'})`);
  console.log(`  Estimated cost: ${C.yellow}$${cost.toFixed(3)}${C.reset}\n`);

  for (const task of readyTasks) {
    const role = task.role || (task.size === 'large' ? 'deep-executor' : 'executor');
    const model = ROLE_MODEL_MAP_HR[role] || (task.size === 'large' ? 'opus' : 'sonnet');
    const strategyTag = task.strategy ? ` ${C.yellow}[${task.strategy}]${C.reset}` : '';
    const teamTag = task.team ? ` ${C.cyan}[team:${task.team}]${C.reset}` : '';
    console.log(`  🔹 ${C.bold}${task.id}${C.reset}: ${task.name} → ${C.cyan}${role} (${model})${C.reset}${strategyTag}${teamTag}`);
  }

  const allTasks = taskData.tasks;
  const doneCount = allTasks.filter(t => t.status === TASK_STATES.COMPLETED).length;
  const totalCount = allTasks.length;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  console.log(`\n  📊 Progress: ${doneCount}/${totalCount} tasks (${pct}%) | Step ${currentStep.id}/${stepData.steps.length}`);
  console.log(`${C.dim}  To execute, the /x-build skill will spawn agents for each task.${C.reset}`);
  console.log(`${C.dim}  Or run with --json for machine-readable output.${C.reset}\n`);

  for (const task of readyTasks) {
    task.status = TASK_STATES.RUNNING;
    task.started_at = new Date().toISOString();
  }
  writeJSON(tasksPath(project), taskData);
  emitHook('task:pre-update', { project, step: currentStep.id, tasks: readyTasks.map(t => t.id) });

  console.log(`${C.green}✅ ${readyTasks.length} tasks marked as RUNNING.${C.reset}`);
}

export function cmdRunStatus(args) {
  const project = resolveProject(null);
  const taskData = readJSON(tasksPath(project));
  const stepData = readJSON(stepsPath(project));

  if (!stepData?.steps?.length) {
    console.log('No steps. Run: x-build steps compute');
    return;
  }

  console.log(`\n${C.bold}🚀 Execution Status${C.reset}\n`);

  let allDone = true;
  for (const step of stepData.steps) {
    const tasks = step.tasks.map(id => taskData.tasks.find(t => t.id === id)).filter(Boolean);
    const completed = tasks.filter(t => t.status === TASK_STATES.COMPLETED).length;
    const running = tasks.filter(t => t.status === TASK_STATES.RUNNING).length;
    const failed = tasks.filter(t => t.status === TASK_STATES.FAILED).length;

    let icon = '⬜';
    if (completed === tasks.length) icon = '✅';
    else if (running > 0) icon = '🔵';
    else if (failed > 0) icon = '❌';

    if (completed < tasks.length) allDone = false;

    console.log(`  ${icon} Step ${step.id}: ${renderBar(completed, tasks.length, 12)}${failed ? ` ${C.red}${failed} failed${C.reset}` : ''}${running ? ` ${C.blue}${running} running${C.reset}` : ''}`);

    for (const t of tasks) {
      const tIcon = { completed: '✅', failed: '❌', running: '🔵', pending: '⬜', ready: '🟡' }[t.status] || '⬜';
      const dur = t.started_at
        ? ` ${C.dim}${fmtDuration((t.completed_at ? new Date(t.completed_at) : new Date()) - new Date(t.started_at))}${C.reset}`
        : '';
      const retry = t.retry_count ? ` ${C.yellow}(retry ${t.retry_count})${C.reset}` : '';
      console.log(`    ${tIcon} ${t.id}: ${t.name}${dur}${retry}`);
    }
  }

  if (allDone) {
    console.log(`\n${C.green}${C.bold}✅ All steps completed! Run: x-build phase next${C.reset}`);
  }

  const cb = getCircuitState(project);
  if (cb.state !== 'closed') {
    console.log(`\n  ${C.red}⚡ Circuit breaker: ${cb.state.toUpperCase()}${C.reset}`);
    if (cb.cooldown_until) console.log(`  ${C.dim}Cooldown until: ${cb.cooldown_until}${C.reset}`);
  }

  console.log('');
}

// ── Interactive ─────────────────────────────────────────────────────

export async function interactiveTaskAdd(rl, project) {
  const name = await ask(rl, '  태스크 이름: ');
  if (!name.trim()) { console.log('  ⚠ 이름이 비어있습니다.'); return; }

  const depsInput = await ask(rl, '  의존성 (예: t1,t2, 없으면 Enter): ');
  const deps = depsInput.trim() ? depsInput.trim().split(',').map(d => d.trim()) : [];

  const sizeChoice = await pickMenu(rl, '  태스크 크기:', [
    { label: 'Small', value: 'small' },
    { label: 'Medium', value: 'medium' },
    { label: 'Large', value: 'large' },
  ]);
  const size = sizeChoice?.value || 'medium';

  const args = [name.trim()];
  if (deps.length) args.push('--deps', deps.join(','));
  args.push('--size', size);
  taskAdd(project, args);
}

export async function interactiveTaskUpdate(rl, project) {
  const data = readJSON(tasksPath(project));
  if (!data?.tasks?.length) { console.log('  태스크가 없습니다.'); return; }

  taskList(project);

  const id = await ask(rl, '  변경할 태스크 ID (예: t1): ');
  if (!id.trim()) return;

  const statusChoice = await pickMenu(rl, '  새 상태:', [
    { label: '🟡 Ready', value: 'ready' },
    { label: '🔵 Running', value: 'running' },
    { label: '✅ Completed', value: 'completed' },
    { label: '❌ Failed', value: 'failed' },
  ]);
  if (!statusChoice) return;

  taskUpdate(project, [id.trim(), '--status', statusChoice.value]);
}

export async function interactiveTasksAdd() {
  const project = resolveProject(null);
  const rl = createRL();
  try {
    let adding = true;
    while (adding) {
      await interactiveTaskAdd(rl, project);
      const more = await ask(rl, '\n  태스크 더 추가? (y/N): ');
      if (more.trim().toLowerCase() !== 'y') adding = false;
    }
  } finally {
    rl.close();
  }
}
