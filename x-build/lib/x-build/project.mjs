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
  existsSync, readdirSync, mkdirSync, join,
  createRL, ask, pickMenu,
  parseOptions,
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

export function cmdStatus(args) {
  const name = resolveProject(args[0], { autoInit: true });
  const manifest = readJSON(manifestPath(name));
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
