/**
 * x-build/phase — Phase lifecycle commands
 */

import {
  PHASES, TASK_STATES, GATE_TYPES, C,
  readJSON, writeJSON, readMD,
  manifestPath, phaseStatusPath, tasksPath, contextDir, phaseDir, checkpointsDir,
  projectDir, decisionsPath,
  resolveProject, logDecision, appendMetric, emitHook,
  loadConfig, parseOptions, E,
  existsSync, join, resolve, ROOT,
  spawnSync,
  runQualityChecks,
  ask, pickMenu,
} from './core.mjs';

// ── cmdPhase ────────────────────────────────────────────────────────

export function cmdPhase(args) {
  const sub = args[0];
  if (!sub || !['next', 'set', 'status'].includes(sub)) {
    console.error('Usage: x-build phase <next|set|status> [args]');
    process.exit(1);
  }

  if (sub === 'status') {
    // Delegate to cmdStatus from project module — caller handles this in entry point
    // For direct use, import dynamically
    return import('./project.mjs').then(m => m.cmdStatus(args.slice(1)));
  }

  if (sub === 'next') {
    return phaseNext(args.slice(1));
  }

  if (sub === 'set') {
    return phaseSet(args.slice(1));
  }
}

export function phaseNext(args) {
  const project = resolveProject(args[0], { autoInit: true });
  const manifest = readJSON(manifestPath(project));
  const config = loadConfig();
  const currentIdx = PHASES.findIndex(p => p.id === manifest.current_phase);

  if (currentIdx === -1) {
    console.error(`❌ ${E('invalid-phase')}`);
    process.exit(1);
  }

  const currentPhase = PHASES[currentIdx];
  const gateKey = `${currentPhase.name}-exit`;
  const gateType = config.gates?.[gateKey] || 'auto';

  if (gateType === 'human-verify') {
    const status = readJSON(phaseStatusPath(project, currentPhase.id));
    if (status?.gate_passed !== true) {
      console.log(`⛔ Gate "${gateKey}" requires human verification.`);
      console.log(`   Run: x-build gate pass [message]`);
      return;
    }
  }

  // Research-exit: verify artifacts exist + optional validation
  if (currentPhase.name === 'research' && gateType === 'human-verify') {
    const hasContext = existsSync(join(contextDir(project), 'CONTEXT.md'));
    const hasReqs = existsSync(join(contextDir(project), 'REQUIREMENTS.md'));
    if (!hasContext && !hasReqs) {
      console.log(`⚠️  No research artifacts found. Recommended:`);
      console.log(`   1. x-build discuss`);
      console.log(`   2. x-build research`);
      console.log(`   Then: x-build gate pass`);
      return;
    }
    const validateResult = readJSON(join(phaseDir(project, '01-research'), 'discuss-validate.json'));
    if (!validateResult) {
      console.log(`${C.dim}💡 Tip: Run "x-build discuss --mode validate" to verify requirements completeness before proceeding.${C.reset}`);
    } else if (validateResult.verdict === 'incomplete') {
      console.log(`⚠️  Validation found gaps: ${validateResult.summary || 'see discuss-validate.json'}`);
      console.log(`   Run: x-build discuss --mode interview --round ${(validateResult.round || 1) + 1} to fill gaps`);
      console.log(`   Or: x-build gate pass to proceed anyway`);
    }
  }

  // Plan-exit: verify plan-check passed + optional critique
  if (currentPhase.name === 'plan' && gateType === 'human-verify') {
    const prdPath = join(phaseDir(project, '02-plan'), 'PRD.md');
    if (!existsSync(prdPath)) {
      console.error('⚠ PRD not generated yet. Run: /x-build plan to generate PRD first.');
    }
    const tasks = readJSON(tasksPath(project));
    if (!tasks?.tasks?.length) {
      console.log(`⚠️  No tasks defined. Run: x-build plan "goal"`);
      return;
    }
    const planCheck = readJSON(join(phaseDir(project, '02-plan'), 'plan-check.json'));
    if (!planCheck) {
      console.log(`⚠️  Plan not validated. Run: x-build plan-check`);
      console.log(`   Then: x-build gate pass`);
      return;
    }
    if (!planCheck.passed) {
      console.log(`⚠️  Plan check has errors. Fix them first.`);
      return;
    }
    const critiqueResult = readJSON(join(phaseDir(project, '02-plan'), 'discuss-critique.json'));
    if (!critiqueResult) {
      console.log(`${C.dim}💡 Tip: Run "x-build discuss --mode critique" for strategic review before proceeding.${C.reset}`);
    } else if (critiqueResult.verdict === 'revise') {
      console.log(`⚠️  Critique recommends revision: ${critiqueResult.summary || 'see discuss-critique.json'}`);
      console.log(`   Run: x-build discuss --mode critique --round ${(critiqueResult.round || 1) + 1} to address concerns`);
      console.log(`   Or: x-build gate pass to proceed anyway`);
    }
  }

  // Quality gate
  if (gateType === 'quality') {
    console.log(`🔍 Running quality checks...`);
    const results = runQualityChecks(project);
    if (results.length === 0) {
      console.log(`  ${C.dim}(no checks detected — gate passes)${C.reset}`);
    } else {
      for (const r of results) {
        console.log(`  ${r.passed ? '✅' : '❌'} ${r.check}${r.passed ? '' : `: ${r.output.slice(0, 100)}`}`);
      }
      if (!results.every(r => r.passed)) {
        console.log(`\n⛔ Quality gate failed. Fix issues and retry.`);
        return;
      }
      console.log(`  ${C.green}All checks passed.${C.reset}`);
    }
  }

  // Custom gate scripts
  if (!GATE_TYPES.includes(gateType)) {
    const scripts = config.gate_scripts || {};
    if (scripts[gateType]) {
      console.log(`🔍 Running custom gate: ${gateType}...`);
      const out = spawnSync(scripts[gateType], [], { shell: true, cwd: resolve(ROOT, '..'), stdio: 'pipe' });
      if (out.status !== 0) {
        console.log(`⛔ Custom gate "${gateType}" failed.`);
        return;
      }
      console.log(`  ${C.green}Custom gate passed.${C.reset}`);
    }
  }

  if (currentIdx >= PHASES.length - 1) {
    console.log('✅ Already at final phase (Close).');
    return;
  }

  // Emit pre-exit hook
  emitHook('phase:pre-exit', { project, phase: currentPhase.name });

  // Auto-handoff: save structured state before transitioning
  try {
    // Inline a minimal handoff to avoid circular import
    _autoHandoff(project);
    console.log(`📋 Phase handoff auto-saved for ${currentPhase.label || currentPhase.name}`);
  } catch (e) {
    console.log(`⚠️  Auto-handoff skipped: ${e.message}`);
  }

  // Complete current phase (with rollback on failure)
  const now = new Date().toISOString();
  const currentStatus = readJSON(phaseStatusPath(project, currentPhase.id));
  const nextPhase = PHASES[currentIdx + 1];
  const nextStatus = readJSON(phaseStatusPath(project, nextPhase.id));

  const prevCurrentStatus = JSON.parse(JSON.stringify(currentStatus));
  const prevNextStatus = JSON.parse(JSON.stringify(nextStatus));
  const prevManifest = JSON.parse(JSON.stringify(manifest));

  try {
    currentStatus.status = 'completed';
    currentStatus.completed_at = now;
    writeJSON(phaseStatusPath(project, currentPhase.id), currentStatus);

    nextStatus.status = 'active';
    nextStatus.started_at = now;
    writeJSON(phaseStatusPath(project, nextPhase.id), nextStatus);

    manifest.current_phase = nextPhase.id;
    manifest.updated_at = now;
    writeJSON(manifestPath(project), manifest);
  } catch (err) {
    console.error(`  ${C.red}❌ Phase transition failed: ${err.message}. Rolling back...${C.reset}`);
    try {
      writeJSON(phaseStatusPath(project, currentPhase.id), prevCurrentStatus);
      writeJSON(phaseStatusPath(project, nextPhase.id), prevNextStatus);
      writeJSON(manifestPath(project), prevManifest);
      console.error(`  ${C.yellow}⚠ Rollback complete. Phase unchanged.${C.reset}`);
    } catch { console.error(`  ${C.red}⚠ Rollback also failed. Manual recovery may be needed.${C.reset}`); }
    return;
  }

  logDecision(project, `Phase transition: ${currentPhase.label} → ${nextPhase.label}`);
  emitHook('phase:post-enter', { project, phase: nextPhase.name, from: currentPhase.name });

  if (currentStatus.started_at) {
    appendMetric({
      type: 'phase_complete', project, phase: currentPhase.name,
      duration_ms: new Date(now) - new Date(currentStatus.started_at),
      timestamp: now,
    });
  }

  console.log(`✅ ${currentPhase.label} → ${nextPhase.label}`);

  const nextGateKey = `${nextPhase.name}-exit`;
  const nextGateType = config.gates?.[nextGateKey] || 'auto';
  if (nextGateType !== 'auto') {
    console.log(`   Exit gate: ${nextGateType}`);
  }
}

// Minimal handoff logic inlined to avoid circular dependency with plan.mjs

function _autoHandoff(project) {
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

  const handoffPath = join(projectDir(project), 'HANDOFF.json');
  writeJSON(handoffPath, handoff);
}

function phaseSet(args) {
  const phaseName = args[0];
  const project = resolveProject(args[1], { autoInit: true });

  if (!phaseName) {
    console.error('Usage: x-build phase set <phase-name> [project]');
    process.exit(1);
  }

  const target = PHASES.find(p => p.name === phaseName || p.id === phaseName);
  if (!target) {
    console.error(`❌ ${E('unknown-phase', { name: phaseName })} Valid: ${PHASES.map(p => p.name).join(', ')}`);
    process.exit(1);
  }

  const manifest = readJSON(manifestPath(project));
  const now = new Date().toISOString();

  for (const phase of PHASES) {
    const status = readJSON(phaseStatusPath(project, phase.id));
    if (phase.id < target.id) {
      status.status = 'completed';
      if (!status.completed_at) status.completed_at = now;
      if (!status.started_at) status.started_at = now;
    } else if (phase.id === target.id) {
      status.status = 'active';
      if (!status.started_at) status.started_at = now;
      status.completed_at = null;
    } else {
      status.status = 'pending';
      status.started_at = null;
      status.completed_at = null;
    }
    writeJSON(phaseStatusPath(project, phase.id), status);
  }

  manifest.current_phase = target.id;
  manifest.updated_at = now;
  writeJSON(manifestPath(project), manifest);

  logDecision(project, `Phase set to: ${target.label}`);
  console.log(`📍 Phase set to: ${target.label}`);
}

// ── cmdGate ─────────────────────────────────────────────────────────

export function cmdGate(args) {
  const action = args[0];
  if (!action || !['pass', 'fail'].includes(action)) {
    console.error('Usage: x-build gate <pass|fail> [message] [project]');
    process.exit(1);
  }

  const message = args.slice(1).filter(a => !a.startsWith('--')).join(' ') || null;
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);

  if (!currentPhase) {
    console.error('❌ Invalid current phase.');
    process.exit(1);
  }

  const status = readJSON(phaseStatusPath(project, currentPhase.id));
  const now = new Date().toISOString();

  if (action === 'pass') {
    status.gate_passed = true;
    status.gate_message = message;
    status.gate_at = now;
    writeJSON(phaseStatusPath(project, currentPhase.id), status);

    const checkpoint = {
      type: 'gate-pass',
      phase: currentPhase.name,
      message,
      timestamp: now,
    };
    writeJSON(join(checkpointsDir(project), `${now.replace(/[:.]/g, '-')}-gate-pass.json`), checkpoint);

    logDecision(project, `Gate passed: ${currentPhase.label}${message ? ` — ${message}` : ''}`);
    console.log(`✅ Gate passed for ${currentPhase.label}.`);
    console.log(`   Run: x-build phase next`);
  } else {
    status.gate_passed = false;
    status.gate_message = message;
    status.gate_at = now;
    writeJSON(phaseStatusPath(project, currentPhase.id), status);

    const checkpoint = {
      type: 'gate-fail',
      phase: currentPhase.name,
      message,
      timestamp: now,
    };
    writeJSON(join(checkpointsDir(project), `${now.replace(/[:.]/g, '-')}-gate-fail.json`), checkpoint);

    logDecision(project, `Gate failed: ${currentPhase.label}${message ? ` — ${message}` : ''}`);
    console.log(`❌ Gate failed for ${currentPhase.label}.`);
  }
}

// ── cmdCheckpoint ───────────────────────────────────────────────────

export function cmdCheckpoint(args) {
  const { opts, positional } = parseOptions(args);
  const type = positional[0];
  const message = positional.slice(1).join(' ') || opts.message || '';

  if (!type || !GATE_TYPES.includes(type)) {
    console.error(`Usage: x-build checkpoint <${GATE_TYPES.join('|')}> [message]`);
    process.exit(1);
  }

  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const now = new Date().toISOString();

  const checkpoint = {
    type,
    phase: PHASES.find(p => p.id === manifest.current_phase)?.name || manifest.current_phase,
    message,
    timestamp: now,
  };

  writeJSON(join(checkpointsDir(project), `${now.replace(/[:.]/g, '-')}-${type}.json`), checkpoint);
  logDecision(project, `Checkpoint [${type}]: ${message || '(no message)'}`);
  console.log(`📌 Checkpoint recorded: [${type}] ${message || '(no message)'}`);
}

export async function interactiveCheckpoint(rl, project) {
  const typeChoice = await pickMenu(rl, '  체크포인트 유형:', [
    { label: 'Auto (자동 검증)', value: 'auto' },
    { label: 'Human-verify (수동 확인)', value: 'human-verify' },
    { label: 'Human-action (사용자 행동)', value: 'human-action' },
    { label: 'Quality (품질 게이트)', value: 'quality' },
  ]);
  if (!typeChoice) return;

  const message = await ask(rl, '  메시지 (선택): ');
  cmdCheckpoint([typeChoice.value, ...(message.trim() ? [message.trim()] : [])]);
}
