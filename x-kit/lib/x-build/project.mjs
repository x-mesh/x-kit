/**
 * x-build/project — Project management commands
 */

import {
  PHASES, TASK_STATES, C,
  readJSON, writeJSON, readMD, writeMD,
  manifestPath, phaseStatusPath, tasksPath, stepsPath, contextDir, projectDir,
  projectsDir, checkpointsDir, phaseDir, toSlug,
  resolveProject, findCurrentProject, logDecision,
  loadConfig, isNormalMode, L, renderBar, fmtDuration,
  setCmdInit,
  existsSync, readdirSync, mkdirSync, join, readFileSync, writeFileSync,
  createRL, ask, pickMenu,
  parseOptions,
  decisionsPath, metricsPath,
  execSync,
} from './core.mjs';

// ── cmdInit ─────────────────────────────────────────────────────────

export function cmdInit(args) {
  const name = args[0];
  if (!name) {
    console.error('Usage: x-build init <project-name>');
    process.exit(1);
  }

  const slug = toSlug(name);

  if (existsSync(manifestPath(slug))) {
    console.error(`❌ Project "${slug}" already exists.`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const manifest = {
    name: slug,
    display_name: name,
    current_phase: '01-research',
    created_at: now,
    updated_at: now,
  };

  writeJSON(manifestPath(slug), manifest);

  for (const phase of PHASES) {
    const status = {
      phase: phase.name,
      status: phase.id === '01-research' ? 'active' : 'pending',
      started_at: phase.id === '01-research' ? now : null,
      completed_at: null,
    };
    writeJSON(phaseStatusPath(slug, phase.id), status);
  }

  writeMD(join(contextDir(slug), 'brief.md'), `# ${name} — Context Brief\n\nProject initialized at ${now}.\n`);
  writeMD(join(contextDir(slug), 'decisions.md'), `# ${name} — Decisions Log\n\n`);

  writeMD(join(phaseDir(slug, '01-research'), 'notes.md'), `# Research Notes\n\n`);
  writeMD(join(phaseDir(slug, '02-plan'), 'roadmap.md'), `# Roadmap\n\n`);
  writeJSON(tasksPath(slug), { tasks: [] });
  writeMD(join(phaseDir(slug, '04-verify'), 'checklist.md'), `# Verification Checklist\n\n`);
  writeMD(join(phaseDir(slug, '05-close'), 'summary.md'), `# Project Summary\n\n`);

  mkdirSync(checkpointsDir(slug), { recursive: true });

  console.log(`✅ Project "${slug}" initialized.`);
  console.log(`📁 ${projectDir(slug)}`);
  console.log(`📍 Current phase: Research`);
  return slug;
}

// Register cmdInit for resolveProject's autoInit
setCmdInit(cmdInit);

// ── cmdList ─────────────────────────────────────────────────────────

export function cmdList() {
  const dir = projectsDir();
  if (!existsSync(dir)) {
    console.log('No projects found.');
    return;
  }
  const projects = readdirSync(dir).filter(d => existsSync(manifestPath(d)));
  if (projects.length === 0) {
    console.log('No projects found.');
    return;
  }

  console.log('Projects:\n');
  for (const p of projects) {
    const m = readJSON(manifestPath(p));
    const phase = PHASES.find(ph => ph.id === m.current_phase);
    console.log(`  ${p}  →  ${phase?.label || m.current_phase}  (${m.created_at.slice(0, 10)})`);
  }
}

// ── cmdStatus ───────────────────────────────────────────────────────

// ── buildProjectState ─────────────────────────────────────────────
// Single source of truth: assembles project state from distributed files.
// Consumed by: cmdStatus --json, dashboard /api/state/, cmdStatus --save.

export function buildProjectState(project) {
  const manifest = readJSON(manifestPath(project));
  if (!manifest) return null;

  const phase = PHASES.find(p => p.id === manifest.current_phase);
  const taskData = readJSON(tasksPath(project));
  const tasks = taskData?.tasks || [];
  const decisionsData = readJSON(decisionsPath(project));
  const decisions = decisionsData?.decisions || [];

  // Phase progress
  const phases = PHASES.map(p => {
    const s = readJSON(phaseStatusPath(project, p.id));
    return { id: p.id, name: p.name, label: p.label, status: s?.status || 'pending', started_at: s?.started_at || null, completed_at: s?.completed_at || null };
  });
  const completedPhases = phases.filter(p => p.status === 'completed').length;

  // Task progress
  const completed = tasks.filter(t => t.status === TASK_STATES.COMPLETED).length;
  const failed = tasks.filter(t => t.status === TASK_STATES.FAILED).length;
  const pending = tasks.filter(t => ![TASK_STATES.COMPLETED, TASK_STATES.CANCELLED].includes(t.status));

  // Cost from metrics
  let spent = 0;
  try {
    const mp = metricsPath();
    if (existsSync(mp)) {
      const lines = readFileSync(mp, 'utf8').trim().split('\n');
      for (const line of lines) {
        try { const m = JSON.parse(line); if (typeof m.cost_usd === 'number' && m.project === project) spent += m.cost_usd; } catch {}
      }
    }
  } catch {}

  // Context files
  const contextFiles = {
    context: existsSync(join(contextDir(project), 'CONTEXT.md')),
    requirements: existsSync(join(contextDir(project), 'REQUIREMENTS.md')),
    roadmap: existsSync(join(contextDir(project), 'ROADMAP.md')),
    prd: existsSync(join(contextDir(project), 'PRD.md')),
  };

  // Steps
  const stData = readJSON(stepsPath(project));
  const stepsTotal = stData?.steps?.length || 0;
  const stepsDone = stData?.steps?.filter(w => w.tasks.every(id => tasks.find(t => t.id === id)?.status === TASK_STATES.COMPLETED)).length || 0;

  // Quality
  const scoredTasks = tasks.filter(t => t.score != null);
  const avgScore = scoredTasks.length > 0 ? scoredTasks.reduce((s, t) => s + t.score, 0) / scoredTasks.length : null;

  return {
    project,
    display_name: manifest.display_name || project,
    phase: { id: phase?.id, name: phase?.name, label: phase?.label },
    phase_progress: { completed: completedPhases, total: PHASES.length },
    tasks: {
      total: tasks.length,
      completed,
      failed,
      pending: pending.map(t => ({ id: t.id, name: t.name, status: t.status, deps: t.depends_on || [] })),
    },
    steps: { total: stepsTotal, completed: stepsDone },
    cost: { spent: Math.round(spent * 10000) / 10000 },
    quality: avgScore != null ? { avg_score: Math.round(avgScore * 10) / 10 } : null,
    recent_decisions: decisions.slice(-5).map(d => d.title || d.message || ''),
    context_files: contextFiles,
    created_at: manifest.created_at,
    updated_at: manifest.updated_at,
    built_at: new Date().toISOString(),
  };
}

// ── stateToMarkdown ───────────────────────────────────────────────

function stateToMarkdown(state) {
  if (!state) return '# STATE\n\nNo project found.\n';
  const lines = [];
  lines.push(`# STATE: ${state.display_name}`);
  lines.push('');
  lines.push(`- **Phase:** ${state.phase.label} (${state.phase_progress.completed}/${state.phase_progress.total})`);
  lines.push(`- **Created:** ${state.created_at?.slice(0, 10) || '?'}`);
  lines.push(`- **Built:** ${state.built_at?.slice(0, 19) || '?'}`);
  lines.push('');

  // Tasks
  if (state.tasks.total > 0) {
    lines.push(`## Tasks (${state.tasks.completed}/${state.tasks.total})`);
    if (state.tasks.failed > 0) lines.push(`- Failed: ${state.tasks.failed}`);
    if (state.tasks.pending.length > 0) {
      lines.push('');
      lines.push('### Pending');
      for (const t of state.tasks.pending) {
        const deps = t.deps.length > 0 ? ` (deps: ${t.deps.join(', ')})` : '';
        lines.push(`- [${t.id}] ${t.name} — ${t.status}${deps}`);
      }
    }
    lines.push('');
  }

  // Steps
  if (state.steps.total > 0) {
    lines.push(`## Steps: ${state.steps.completed}/${state.steps.total}`);
    lines.push('');
  }

  // Cost
  if (state.cost.spent > 0) {
    lines.push(`## Cost: $${state.cost.spent.toFixed(4)}`);
    lines.push('');
  }

  // Quality
  if (state.quality) {
    lines.push(`## Quality: ${state.quality.avg_score}/10`);
    lines.push('');
  }

  // Decisions
  if (state.recent_decisions.length > 0) {
    lines.push('## Recent Decisions');
    for (const d of state.recent_decisions) lines.push(`- ${d}`);
    lines.push('');
  }

  // Context files
  lines.push('## Artifacts');
  for (const [k, v] of Object.entries(state.context_files)) {
    lines.push(`- ${k}: ${v ? '✅' : '⬜'}`);
  }
  lines.push('');

  return lines.join('\n');
}

export function cmdStatus(args) {
  const opts = parseOptions(args);
  const isJson = args.includes('--json');
  const isSave = args.includes('--save');
  const name = resolveProject(opts.positional[0] || args.find(a => !a.startsWith('--')), { autoInit: true });
  const manifest = readJSON(manifestPath(name));
  if (!manifest) {
    if (isJson) { console.log(JSON.stringify({ error: 'no_project' })); return; }
    console.log('No project found. Run: x-build init <name>');
    return;
  }

  // --json: output structured state for API/Claude consumption
  if (isJson) {
    const state = buildProjectState(name);
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  // --save: generate STATE.md file
  if (isSave) {
    const state = buildProjectState(name);
    const md = stateToMarkdown(state);
    const statePath = join(projectDir(name), 'STATE.md');
    writeFileSync(statePath, md, 'utf8');
    console.log(`✅ STATE.md saved: ${statePath}`);
    return;
  }

  const config = loadConfig();

  const completedPhases = PHASES.filter(p => {
    const s = readJSON(phaseStatusPath(name, p.id));
    return s?.status === 'completed';
  }).length;

  const normal = isNormalMode();

  if (normal) {
    console.log(`\n${C.bold}${C.cyan}📋 프로젝트: ${manifest.display_name || name}${C.reset}`);
    console.log(`   시작일: ${manifest.created_at.slice(0, 10)}  전체 진행률: ${renderBar(completedPhases, PHASES.length, 15)}`);
  } else {
    console.log(`\n${C.bold}${C.cyan}📋 ${manifest.display_name || name}${C.reset}`);
    console.log(`   Created: ${manifest.created_at.slice(0, 10)}  ${renderBar(completedPhases, PHASES.length, 15)}`);
  }
  console.log('');

  for (const phase of PHASES) {
    const status = readJSON(phaseStatusPath(name, phase.id));
    const isCurrent = phase.id === manifest.current_phase;
    const gateKey = `${phase.name}-exit`;
    const gateType = config.gates?.[gateKey] || 'auto';

    let icon = '⬜';
    let color = C.dim;
    let stateLabel = normal ? '아직 안 함' : '';
    if (status?.status === 'completed') { icon = '✅'; color = C.green; stateLabel = normal ? '완료!' : ''; }
    else if (status?.status === 'active') { icon = '🔵'; color = C.blue; stateLabel = normal ? '지금 하는 중' : ''; }
    else if (status?.status === 'failed') { icon = '❌'; color = C.red; stateLabel = normal ? '문제 발생' : ''; }

    let dur = '';
    if (status?.started_at) {
      const end = status.completed_at ? new Date(status.completed_at) : new Date();
      const elapsed = end - new Date(status.started_at);
      dur = normal ? ` ${C.dim}(${fmtDuration(elapsed)} 걸림)${C.reset}` : ` ${C.dim}(${fmtDuration(elapsed)})${C.reset}`;
    }

    const marker = isCurrent ? ` ${C.yellow}← 여기${C.reset}` : '';
    const gate = status?.status !== 'completed' ? ` ${C.dim}[${L(gateType)}]${C.reset}` : '';
    const label = normal ? L(phase.label) : phase.label;
    const extra = stateLabel && normal ? ` ${C.dim}${stateLabel}${C.reset}` : '';
    console.log(`  ${icon} ${color}${label}${C.reset}${gate}${dur}${extra}${marker}`);
  }

  // Show task summary if in plan/execute phase
  if (['02-plan', '03-execute'].includes(manifest.current_phase)) {
    const tasks = readJSON(tasksPath(name));
    if (tasks?.tasks?.length > 0) {
      const total = tasks.tasks.length;
      const done = tasks.tasks.filter(t => t.status === TASK_STATES.COMPLETED).length;
      const failed = tasks.tasks.filter(t => t.status === TASK_STATES.FAILED).length;
      const taskLabel = normal ? '할 일' : 'Tasks';
      const failLabel = normal ? `${failed}개 문제` : `${failed} failed`;
      console.log(`\n📊 ${taskLabel}: ${renderBar(done, total)}${failed ? ` ${C.red}(${failLabel})${C.reset}` : ''}`);

      const scoredTasks = tasks.tasks.filter(t => t.score != null);
      if (scoredTasks.length > 0) {
        const avg = scoredTasks.reduce((s, t) => s + t.score, 0) / scoredTasks.length;
        const belowThreshold = scoredTasks.filter(t => t.score < 7).length;
        console.log(`\n  Project Quality: ${avg.toFixed(1)}/10 avg${belowThreshold > 0 ? ` (${belowThreshold} below threshold)` : ''}`);
      }
    }

    const stData = readJSON(stepsPath(name));
    if (stData?.steps?.length > 0) {
      const doneSteps = stData.steps.filter(w => {
        const taskData = readJSON(tasksPath(name));
        return w.tasks.every(id => taskData?.tasks?.find(t => t.id === id)?.status === TASK_STATES.COMPLETED);
      }).length;
      console.log(`🔹 Steps: ${renderBar(doneSteps, stData.steps.length, 10)}`);
    }
  }

  // Next action suggestion based on current phase
  const phase = PHASES.find(p => p.id === manifest.current_phase);
  const suggestions = {
    research: ['x-build discuss --mode interview', 'x-build research'],
    plan: ['x-build plan "goal"', 'x-build plan-check', 'x-build phase next'],
    execute: ['x-build run', 'x-build run-status'],
    verify: ['x-build quality', 'x-build verify-coverage', 'x-build verify-traceability'],
    close: ['x-build close --summary "..."'],
  };
  const normalHints = {
    research: '요구사항을 정리하는 인터뷰를 시작합니다',
    plan: '목표를 할 일 목록으로 나눕니다',
    execute: '다음 할 일을 실행합니다',
    verify: '결과물을 검사합니다',
    close: '프로젝트를 마무리합니다',
  };
  const actions = suggestions[phase?.name] || [];
  if (actions.length > 0) {
    const label = normal ? '💡 다음 단계' : '💡 Next';
    const hint = normal && normalHints[phase?.name] ? ` ${C.dim}— ${normalHints[phase.name]}${C.reset}` : '';
    console.log(`  ${label}: ${C.cyan}${actions[0]}${C.reset}${hint}`);
  }

  console.log('');
}

// ── cmdClose ────────────────────────────────────────────────────────

export function cmdClose(args) {
  const { opts } = parseOptions(args);
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const now = new Date().toISOString();

  for (const phase of PHASES) {
    const status = readJSON(phaseStatusPath(project, phase.id));
    if (phase.id === '05-close') {
      status.status = 'active';
      status.started_at = now;
    } else if (status.status !== 'completed') {
      status.status = 'completed';
      status.completed_at = now;
    }
    writeJSON(phaseStatusPath(project, phase.id), status);
  }

  manifest.current_phase = '05-close';
  manifest.updated_at = now;

  const taskData = readJSON(tasksPath(project));
  const total = taskData?.tasks?.length || 0;
  const done = taskData?.tasks?.filter(t => t.status === TASK_STATES.COMPLETED).length || 0;
  const decisions = readMD(join(contextDir(project), 'decisions.md'));

  const summaryContent = opts.summary || '';
  const summary = [
    `# Project Summary: ${manifest.display_name || project}`,
    '',
    `**Created:** ${manifest.created_at.slice(0, 10)}`,
    `**Closed:** ${now.slice(0, 10)}`,
    `**Tasks:** ${done}/${total} completed`,
    '',
    summaryContent ? `## Summary\n${summaryContent}\n` : '',
    '## Decisions',
    decisions.split('\n').filter(l => l.startsWith('- ')).join('\n') || '(none)',
    '',
  ].join('\n');

  writeMD(join(phaseDir(project, '05-close'), 'summary.md'), summary);

  const closeStatus = readJSON(phaseStatusPath(project, '05-close'));
  closeStatus.status = 'completed';
  closeStatus.completed_at = now;
  writeJSON(phaseStatusPath(project, '05-close'), closeStatus);
  manifest.current_phase = '05-close';
  writeJSON(manifestPath(project), manifest);

  logDecision(project, `Project closed.${summaryContent ? ` Summary: ${summaryContent}` : ''}`);
  console.log(`✅ Project "${project}" closed.`);
  console.log(`📄 Summary: ${join(phaseDir(project, '05-close'), 'summary.md')}`);
}

// ── cmdDashboard ────────────────────────────────────────────────────

export function cmdDashboard() {
  const dir = projectsDir();
  if (!existsSync(dir)) { console.log('No projects.'); return; }
  const projects = readdirSync(dir).filter(d => existsSync(manifestPath(d)));
  if (projects.length === 0) { console.log('No projects.'); return; }

  console.log(`\n${C.bold}${C.cyan}📊 x-build Dashboard${C.reset}\n`);

  const header = `  ${C.bold}${'Project'.padEnd(20)} ${'Phase'.padEnd(12)} ${'Tasks'.padEnd(12)} Health${C.reset}`;
  console.log(header);
  console.log(`  ${'─'.repeat(55)}`);

  for (const p of projects) {
    const m = readJSON(manifestPath(p));
    const phase = PHASES.find(ph => ph.id === m.current_phase);
    const taskData = readJSON(tasksPath(p));
    const total = taskData?.tasks?.length || 0;
    const done = taskData?.tasks?.filter(t => t.status === TASK_STATES.COMPLETED).length || 0;
    const failed = taskData?.tasks?.filter(t => t.status === TASK_STATES.FAILED).length || 0;

    let health = '🟢';
    if (failed > 0) health = '🔴';
    else if (total > 0 && done < total / 2) health = '🟡';

    const taskStr = total > 0 ? `${done}/${total}` : '-';
    console.log(`  ${p.padEnd(20)} ${(phase?.label || '?').padEnd(12)} ${taskStr.padEnd(12)} ${health}`);
  }
  console.log('');
}

// ── Interactive ─────────────────────────────────────────────────────

export async function interactiveInit() {
  const rl = createRL();
  try {
    const name = await ask(rl, '  프로젝트 이름: ');
    if (name.trim()) {
      cmdInit([name.trim()]);
    } else {
      console.log('  ⚠ 이름이 비어있습니다.');
    }
  } finally {
    rl.close();
  }
}

export async function interactiveDashboard() {
  const rl = createRL();
  const config = loadConfig();

  try {
    const current = findCurrentProject();

    if (!current) {
      console.log('\n⚙️  x-build — Phase-Based Project Harness\n');
      console.log('  프로젝트가 없습니다.\n');
      const name = await ask(rl, '  새 프로젝트 이름 (취소: Enter): ');
      if (name.trim()) {
        cmdInit([name.trim()]);
      }
      rl.close();
      return;
    }

    // Import needed functions lazily to avoid circular deps
    const { taskList, taskUpdate } = await import('./tasks.mjs');
    const { stepsCompute, stepsStatus, stepsNext } = await import('./tasks.mjs');
    const { cmdCheckpoint } = await import('./phase.mjs');
    const { cmdGate } = await import('./phase.mjs');

    let running = true;
    while (running) {
      cmdStatus([current]);

      const manifest = readJSON(manifestPath(current));
      const actions = getPhaseActions(manifest, config);

      const allActions = [
        ...actions,
        { label: '─────────────────', action: 'separator' },
        { label: '📊 전체 상태 보기', action: 'status' },
        { label: '📄 Context Brief 생성', action: 'context' },
        { label: '📋 프로젝트 목록', action: 'list' },
        { label: '🆕 새 프로젝트 생성', action: 'new-project' },
      ].filter(a => a.action !== 'separator');

      const choice = await pickMenu(rl, '🔧 액션 선택:', allActions);

      if (!choice) { running = false; break; }

      switch (choice.action) {
        case 'phase-next': {
          const { phaseNext } = await import('./phase.mjs');
          phaseNext([current]);
          break;
        }

        case 'gate-pass': {
          const msg = await ask(rl, '  승인 메시지 (선택): ');
          cmdGate(['pass', ...(msg.trim() ? [msg.trim()] : [])]);
          break;
        }

        case 'task-add': {
          const { interactiveTaskAdd } = await import('./tasks.mjs');
          await interactiveTaskAdd(rl, current);
          break;
        }

        case 'task-list':
          taskList(current);
          break;

        case 'task-update': {
          const { interactiveTaskUpdate } = await import('./tasks.mjs');
          await interactiveTaskUpdate(rl, current);
          break;
        }

        case 'step-compute':
          stepsCompute(current);
          break;

        case 'step-status':
          stepsStatus(current);
          break;

        case 'step-next':
          stepsNext(current);
          break;

        case 'checkpoint': {
          const { interactiveCheckpoint } = await import('./phase.mjs');
          await interactiveCheckpoint(rl, current);
          break;
        }

        case 'context': {
          const { cmdContext } = await import('./misc.mjs');
          cmdContext([current]);
          break;
        }

        case 'show-notes': {
          const notesFile = join(phaseDir(current, '01-research'), 'notes.md');
          console.log(`\n📝 리서치 노트: ${notesFile}`);
          console.log(readMD(notesFile) || '  (비어있음)');
          break;
        }

        case 'close': {
          const summary = await ask(rl, '  종료 요약 (선택): ');
          cmdClose(summary.trim() ? ['--summary', summary.trim()] : []);
          running = false;
          break;
        }

        case 'status':
          cmdStatus([current]);
          break;

        case 'list':
          cmdList();
          break;

        case 'new-project': {
          const name = await ask(rl, '  프로젝트 이름: ');
          if (name.trim()) cmdInit([name.trim()]);
          break;
        }
      }

      if (running) {
        const cont = await ask(rl, '\n  계속하려면 Enter (종료: q): ');
        if (cont.trim().toLowerCase() === 'q') running = false;
      }
    }
  } finally {
    rl.close();
  }

  console.log('\n👋 x-build 종료.\n');
}

// ── cmdHandoffFull ───────────────────────────────────────────────────

export function cmdHandoffFull(args) {
  const opts = parseOptions(args);

  // Git info
  let branch = '', lastCommits = [], uncommittedFiles = [], ahead = 0, behind = 0, commitsToday = [];
  try {
    branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    lastCommits = execSync('git log --oneline -5', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    uncommittedFiles = execSync('git status --short', { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(l => l.trim());
    const ab = execSync('git rev-list --left-right --count origin/' + branch + '...HEAD 2>/dev/null || echo "0 0"', { encoding: 'utf8' }).trim().split(/\s+/);
    behind = parseInt(ab[0]) || 0;
    ahead = parseInt(ab[1]) || 0;
    commitsToday = execSync('git log --oneline --since="24 hours ago"', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch {}

  // Active projects
  const activeProjects = [];
  const allDecisions = [];
  const projDir = projectsDir();
  if (existsSync(projDir)) {
    for (const entry of readdirSync(projDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const mPath = join(projDir, entry.name, 'manifest.json');
      if (!existsSync(mPath)) continue;
      try {
        const manifest = JSON.parse(readFileSync(mPath, 'utf8'));
        const phase = PHASES.find(p => p.id === manifest.current_phase);

        // Tasks
        let taskTotal = 0, taskCompleted = 0, pendingTasks = [];
        const phasesDir = join(projDir, entry.name, 'phases');
        if (existsSync(phasesDir)) {
          for (const ph of readdirSync(phasesDir, { withFileTypes: true })) {
            if (!ph.isDirectory()) continue;
            const tp = join(phasesDir, ph.name, 'tasks.json');
            if (existsSync(tp)) {
              try {
                const td = JSON.parse(readFileSync(tp, 'utf8'));
                const tasks = td.tasks || [];
                taskTotal = tasks.length;
                taskCompleted = tasks.filter(t => t.status === 'completed').length;
                pendingTasks = tasks.filter(t => !['completed', 'cancelled'].includes(t.status)).map(t => t.name).slice(0, 3);
              } catch {}
              break;
            }
          }
        }

        // Decisions
        const dmPath = join(projDir, entry.name, 'context', 'decisions.md');
        const djPath = join(projDir, entry.name, 'context', 'decisions.json');
        let decs = [];
        if (existsSync(djPath)) {
          try { decs = (JSON.parse(readFileSync(djPath, 'utf8')).decisions || []).slice(-3).map(d => ({ what: d.title || d.message, why: d.rationale || '' })); } catch {}
        } else if (existsSync(dmPath)) {
          try { decs = readFileSync(dmPath, 'utf8').split('\n').filter(l => l.startsWith('- ')).slice(-3).map(l => ({ what: l.slice(2).trim(), why: '' })); } catch {}
        }
        for (const d of decs) allDecisions.push({ ...d, project: entry.name });

        const isClosed = manifest.current_phase === '05-close';
        if (!isClosed) {
          activeProjects.push({
            name: entry.name,
            phase: phase?.label || manifest.current_phase,
            tasks: `${taskCompleted}/${taskTotal}`,
            pending: pendingTasks,
          });
        }
      } catch {}
    }
  }

  // Recent traces
  const traces = [];
  const tracesDir = join(process.cwd(), '.xm', 'traces');
  if (existsSync(tracesDir)) {
    const files = readdirSync(tracesDir).filter(f => f.endsWith('.jsonl')).sort().reverse().slice(0, 5);
    for (const f of files) {
      try {
        const lines = readFileSync(join(tracesDir, f), 'utf8').trim().split('\n');
        const first = JSON.parse(lines[0]);
        const agentCount = lines.filter(l => l.includes('"agent_step"')).length;
        traces.push({ name: f.replace('.jsonl', ''), skill: first.skill || first.source || '?', agents: agentCount });
      } catch {}
    }
  }

  // Quality scores from .xm/eval
  const qualityScores = {};
  const evalDir = join(process.cwd(), '.xm', 'eval', 'results');
  if (existsSync(evalDir)) {
    const files = readdirSync(evalDir).filter(f => f.endsWith('-score.json')).sort().reverse().slice(0, 3);
    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(join(evalDir, f), 'utf8'));
        if (data.target && data.overall) qualityScores[data.target] = data.overall;
      } catch {}
    }
  }

  // Test status
  let testStatus = null;
  try {
    const result = execSync('bun test 2>&1 | tail -3', { encoding: 'utf8', timeout: 60000 });
    const match = result.match(/(\d+)\s+pass/);
    const failMatch = result.match(/(\d+)\s+fail/);
    if (match) testStatus = `${match[1]} pass, ${failMatch ? failMatch[1] : 0} fail`;
  } catch {}

  // Key files (most changed recently)
  let keyFiles = [];
  try {
    keyFiles = execSync('git diff --stat HEAD~10 -- "*.mjs" "*.js" "*.ts" 2>/dev/null | head -5', { encoding: 'utf8' })
      .trim().split('\n').filter(l => l.includes('|')).map(l => l.split('|')[0].trim()).slice(0, 5);
  } catch {}

  const reason = args.find(a => !a.startsWith('--')) || opts.reason || opts.summary || null;

  const state = {
    v: 1,
    saved_at: new Date().toISOString(),

    where: {
      branch,
      last_commits: lastCommits.slice(0, 5),
      uncommitted_files: uncommittedFiles.slice(0, 10),
      ahead, behind,
    },

    what_done: commitsToday.slice(0, 10),

    what_remains: {
      active_projects: activeProjects,
      uncommitted: uncommittedFiles.filter(l => l.startsWith('M') || l.startsWith('??') || l.startsWith(' M')).map(l => l.replace(/^[A-Z? ]+/, '').trim()).slice(0, 10),
      ideas: [],
    },

    decisions: allDecisions.slice(-10),

    context: {
      current_focus: reason || (commitsToday.length > 0 ? commitsToday[0].replace(/^[a-f0-9]+ /, '') : ''),
      blockers: [],
      key_files: keyFiles,
      test_status: testStatus,
      quality_scores: qualityScores,
    },

    why_stopped: reason || 'Session handoff',
  };

  // Save
  const buildDir = join(process.cwd(), '.xm', 'build');
  mkdirSync(buildDir, { recursive: true });
  const statePath = join(buildDir, 'SESSION-STATE.json');
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');

  console.log(`✅ Session state saved: ${statePath}`);
  console.log(`   Branch: ${branch} (+${ahead} ahead)`);
  console.log(`   Commits today: ${commitsToday.length}`);
  console.log(`   Active projects: ${activeProjects.length}`);
  console.log(`   Decisions: ${allDecisions.length}`);
  if (uncommittedFiles.length) console.log(`   Uncommitted: ${uncommittedFiles.length} files`);
}

// ── cmdHandon ────────────────────────────────────────────────────────

function _timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function cmdHandon(args) {
  const isJson = args.includes('--json');
  const statePath = join(process.cwd(), '.xm', 'build', 'SESSION-STATE.json');

  if (!existsSync(statePath)) {
    if (isJson) { console.log(JSON.stringify({ error: 'no_session_state' })); return; }
    console.log('No session state found. Run: xmb handoff --full');
    return;
  }

  let state;
  try { state = JSON.parse(readFileSync(statePath, 'utf8')); } catch {
    console.log('Error reading SESSION-STATE.json');
    return;
  }

  if (isJson) {
    let newCommits = [];
    try {
      const lastHash = (state.where?.last_commits?.[0] || '').split(' ')[0];
      if (lastHash) {
        newCommits = execSync(`git log --oneline ${lastHash}..HEAD 2>/dev/null`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      }
    } catch {}
    state.since_handoff = { new_commits: newCommits.length, commits: newCommits.slice(0, 5) };
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  // Pretty print
  const ago = state.saved_at ? _timeAgo(state.saved_at) : '?';

  console.log(`\n${C.bold}📋 Session Restore${C.reset} — saved ${ago}\n`);

  // Where
  console.log(`  ${C.cyan}📍 Branch:${C.reset} ${state.where?.branch || '?'} (+${state.where?.ahead || 0} ahead, -${state.where?.behind || 0} behind)`);
  if (state.where?.last_commits?.length) {
    console.log(`     Last: ${C.dim}${state.where.last_commits[0]}${C.reset}`);
  }

  // What done
  if (state.what_done?.length) {
    console.log(`\n  ${C.green}✅ Done${C.reset} (${state.what_done.length} commits):`);
    for (const c of state.what_done.slice(0, 5)) {
      console.log(`     ${C.dim}${c}${C.reset}`);
    }
    if (state.what_done.length > 5) console.log(`     ${C.dim}... +${state.what_done.length - 5} more${C.reset}`);
  }

  // What remains
  if (state.what_remains?.active_projects?.length) {
    console.log(`\n  ${C.yellow}📌 Active Projects:${C.reset}`);
    for (const p of state.what_remains.active_projects) {
      console.log(`     ${p.name}  ${C.dim}${p.phase}  ${p.tasks} tasks${C.reset}`);
      if (p.pending?.length) {
        for (const t of p.pending) console.log(`       ${C.dim}→ ${t}${C.reset}`);
      }
    }
  }
  if (state.what_remains?.uncommitted?.length) {
    console.log(`\n  ${C.red}📝 Uncommitted:${C.reset} ${state.what_remains.uncommitted.length} files`);
    for (const f of state.what_remains.uncommitted.slice(0, 5)) {
      console.log(`     ${C.dim}${f}${C.reset}`);
    }
  }
  if (state.what_remains?.ideas?.length) {
    console.log(`\n  ${C.blue}💡 Ideas:${C.reset}`);
    for (const idea of state.what_remains.ideas) console.log(`     ${C.dim}${idea}${C.reset}`);
  }

  // Decisions
  if (state.decisions?.length) {
    console.log(`\n  ${C.cyan}🔒 Decisions:${C.reset}`);
    for (const d of state.decisions.slice(0, 5)) {
      console.log(`     • ${d.what}${d.why ? ` ${C.dim}(${d.why})${C.reset}` : ''}`);
    }
  }

  // Context
  if (state.context) {
    console.log(`\n  ${C.bold}🎯 Focus:${C.reset} ${state.context.current_focus || '—'}`);
    if (state.context.test_status) console.log(`     Tests: ${state.context.test_status}`);
    if (state.context.quality_scores && Object.keys(state.context.quality_scores).length) {
      for (const [k, v] of Object.entries(state.context.quality_scores)) {
        console.log(`     Quality: ${k} → ${v}/10`);
      }
    }
  }

  // Why stopped
  if (state.why_stopped) {
    console.log(`\n  ${C.dim}💤 Stopped: ${state.why_stopped}${C.reset}`);
  }

  // Since handoff
  let newCommits = 0;
  try {
    const lastHash = (state.where?.last_commits?.[0] || '').split(' ')[0];
    if (lastHash) {
      newCommits = parseInt(execSync(`git rev-list --count ${lastHash}..HEAD 2>/dev/null`, { encoding: 'utf8' }).trim()) || 0;
    }
  } catch {}

  let currentUncommitted = 0;
  try {
    currentUncommitted = execSync('git status --short', { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length;
  } catch {}

  console.log(`\n  ${C.dim}Since handoff: ${newCommits} new commits, ${currentUncommitted} uncommitted files${C.reset}`);
  console.log('');
}

function getPhaseActions(manifest, config) {
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);
  if (!currentPhase) return [];

  const gateKey = `${currentPhase.name}-exit`;
  const gateType = config.gates?.[gateKey] || 'auto';

  const actions = [];

  switch (currentPhase.name) {
    case 'research':
      actions.push(
        { label: '📝 리서치 노트 보기/편집 안내', action: 'show-notes' },
        { label: '➡️  다음 단계 (Plan)로 이동', action: 'phase-next' },
      );
      break;
    case 'plan':
      actions.push(
        { label: '➕ 태스크 추가', action: 'task-add' },
        { label: '📋 태스크 목록', action: 'task-list' },
        { label: '🔹 Step 계산', action: 'step-compute' },
      );
      if (gateType === 'human-verify') {
        actions.push({ label: '✅ 계획 승인 (gate pass)', action: 'gate-pass' });
      }
      actions.push({ label: '➡️  다음 단계 (Execute)로 이동', action: 'phase-next' });
      break;
    case 'execute':
      actions.push(
        { label: '🔹 Step 상태 확인', action: 'step-status' },
        { label: '▶️  다음 Step 활성화', action: 'step-next' },
        { label: '✏️  태스크 상태 변경', action: 'task-update' },
        { label: '➡️  다음 단계 (Verify)로 이동', action: 'phase-next' },
      );
      break;
    case 'verify':
      actions.push(
        { label: '📌 체크포인트 기록', action: 'checkpoint' },
        { label: '📄 Context Brief 생성', action: 'context' },
        { label: '➡️  다음 단계 (Close)로 이동', action: 'phase-next' },
      );
      break;
    case 'close':
      actions.push(
        { label: '🏁 프로젝트 종료', action: 'close' },
      );
      break;
  }

  return actions;
}
