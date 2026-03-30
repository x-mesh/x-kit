/**
 * x-build/verify — Verification commands
 */

import {
  TASK_STATES, C,
  readJSON, writeJSON, readMD,
  tasksPath, contextDir, phaseDir,
  resolveProject, renderBar,
  runQualityChecks,
  existsSync, join,
} from './core.mjs';

// ── cmdQuality ──────────────────────────────────────────────────────

export function cmdQuality(args) {
  const project = resolveProject(null);
  console.log(`${C.bold}🔍 Running quality checks...${C.reset}\n`);
  const results = runQualityChecks(project);

  if (results.length === 0) {
    console.log(`  ${C.dim}No test/lint/build tools detected.${C.reset}`);
    return;
  }

  for (const r of results) {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.check}${r.passed ? '' : `\n     ${C.red}${r.output.slice(0, 200)}${C.reset}`}`);
  }

  const passCount = results.filter(r => r.passed).length;
  console.log(`\n${renderBar(passCount, results.length)} quality checks`);
}

// ── cmdVerifyCoverage ───────────────────────────────────────────────

export function cmdVerifyCoverage(args) {
  const project = resolveProject(null);
  const requirements = readMD(join(contextDir(project), 'REQUIREMENTS.md'));
  const taskData = readJSON(tasksPath(project));
  const tasks = taskData?.tasks || [];

  if (!requirements) {
    console.log('No REQUIREMENTS.md found. Run: x-build research');
    return;
  }

  const reqPattern = /^-\s*\[(R(?:EQ-?)?\d+)\]\s*(.+)/gm;
  const reqs = [];
  let match;
  while ((match = reqPattern.exec(requirements)) !== null) {
    reqs.push({ id: match[1], desc: match[2].trim() });
  }

  if (reqs.length === 0) {
    console.log(`${C.yellow}No structured requirements found in REQUIREMENTS.md${C.reset}`);
    console.log(`  Expected format: - [R1] Description`);
    return;
  }

  console.log(`\n${C.bold}Requirement Coverage${C.reset}\n`);

  let covered = 0;
  let uncovered = 0;

  for (const req of reqs) {
    const found = tasks.some(t =>
      t.name.includes(req.id) ||
      t.name.toLowerCase().includes(req.desc.toLowerCase().slice(0, 30))
    );

    if (found) {
      console.log(`  [covered] [${req.id}] ${req.desc.slice(0, 60)}`);
      covered++;
    } else {
      console.log(`  [missing] [${req.id}] ${req.desc.slice(0, 60)} ${C.red}— no matching task${C.reset}`);
      uncovered++;
    }
  }

  console.log(`\n  Coverage: ${covered}/${reqs.length} (${Math.round(covered/reqs.length*100)}%)`);
  if (uncovered > 0) {
    console.log(`  ${C.yellow}${uncovered} requirements not covered — add tasks or update task names${C.reset}`);
  } else {
    console.log(`  ${C.green}All requirements covered${C.reset}`);
  }

  writeJSON(join(phaseDir(project, '04-verify'), 'coverage-results.json'), {
    timestamp: new Date().toISOString(),
    total: reqs.length,
    covered,
    uncovered,
    details: reqs.map(r => ({ ...r, covered: tasks.some(t => t.name.includes(r.id)) })),
  });

  console.log('');
}

// ── cmdVerifyTraceability ───────────────────────────────────────────

export function cmdVerifyTraceability(args) {
  const project = resolveProject(null);
  const requirements = readMD(join(contextDir(project), 'REQUIREMENTS.md'));
  const prdPath = join(phaseDir(project, '02-plan'), 'PRD.md');
  const prd = readMD(prdPath);
  const taskData = readJSON(tasksPath(project));
  const tasks = taskData?.tasks || [];

  if (!requirements) {
    console.log('No REQUIREMENTS.md found. Run: x-build research');
    return;
  }

  // Parse requirements
  const reqPattern = /^-\s*\[(R(?:EQ-?)?\d+)\]\s*(.+)/gm;
  const reqs = [];
  let match;
  while ((match = reqPattern.exec(requirements)) !== null) {
    reqs.push({ id: match[1], desc: match[2].trim() });
  }

  if (reqs.length === 0) {
    console.log(`${C.yellow}No structured requirements found.${C.reset}`);
    return;
  }

  // Parse PRD acceptance criteria
  const acSection = prd?.match(/##\s*(?:8\.)?\s*Acceptance Criteria[\s\S]*?(?=##\s*\d|$)/i);
  const acItems = acSection ? [...acSection[0].matchAll(/- \[[ x]\] (.+)/gi)].map(m => m[1].trim()) : [];

  console.log(`\n${C.bold}Traceability Matrix${C.reset} — R# ↔ Task ↔ AC ↔ Done Criteria\n`);

  let fullyCovered = 0;
  let partial = 0;
  let gaps = 0;

  for (const req of reqs) {
    const matchedTasks = tasks.filter(t => t.name.includes(req.id));
    const matchedAC = acItems.filter(ac => ac.toLowerCase().includes(req.id.toLowerCase()));
    const hasDoneCriteria = matchedTasks.some(t => t.done_criteria?.length > 0);

    const taskStr = matchedTasks.length > 0
      ? matchedTasks.map(t => t.id).join(', ')
      : `${C.red}NONE${C.reset}`;
    const acStr = matchedAC.length > 0 ? `${matchedAC.length} AC` : `${C.red}NONE${C.reset}`;
    const dcStr = hasDoneCriteria ? '✅' : `${C.yellow}—${C.reset}`;

    const coverage =
      matchedTasks.length > 0 && matchedAC.length > 0 && hasDoneCriteria ? '✅' :
      matchedTasks.length > 0 ? '⚠️' : '❌';

    if (coverage === '✅') fullyCovered++;
    else if (coverage === '⚠️') partial++;
    else gaps++;

    console.log(`  ${coverage} [${req.id}] ${req.desc.slice(0, 40).padEnd(40)} → Tasks: ${taskStr} | AC: ${acStr} | DC: ${dcStr}`);
  }

  console.log(`\n  ${C.bold}Summary${C.reset}: ${fullyCovered} full, ${partial} partial, ${gaps} gaps (${reqs.length} total)`);

  if (gaps > 0) {
    console.log(`  ${C.red}${gaps} requirements have no matching tasks — add tasks or update names${C.reset}`);
  }
  if (partial > 0) {
    console.log(`  ${C.yellow}${partial} requirements missing AC or done_criteria — run: tasks done-criteria${C.reset}`);
  }
  if (gaps === 0 && partial === 0) {
    console.log(`  ${C.green}Full traceability achieved${C.reset}`);
  }

  writeJSON(join(phaseDir(project, '04-verify'), 'traceability.json'), {
    timestamp: new Date().toISOString(),
    total: reqs.length,
    fully_covered: fullyCovered,
    partial,
    gaps,
    matrix: reqs.map(r => ({
      requirement: r.id,
      description: r.desc,
      tasks: tasks.filter(t => t.name.includes(r.id)).map(t => t.id),
      acceptance_criteria: acItems.filter(ac => ac.toLowerCase().includes(r.id.toLowerCase())).length,
      has_done_criteria: tasks.filter(t => t.name.includes(r.id)).some(t => t.done_criteria?.length > 0),
    })),
  });

  console.log('');
}

// ── cmdVerifyContracts ──────────────────────────────────────────────

export function cmdVerifyContracts(args) {
  const project = resolveProject(null);
  const taskData = readJSON(tasksPath(project));
  const tasks = taskData?.tasks || [];

  const withCriteria = tasks.filter(t => t.done_criteria && t.status === 'completed');

  if (withCriteria.length === 0) {
    console.log('No completed tasks with done_criteria found.');
    console.log('  Generate criteria: x-build tasks done-criteria');
    return;
  }

  console.log(`\n${C.bold}Acceptance Contract Verification${C.reset}\n`);

  for (const task of withCriteria) {
    const criteria = Array.isArray(task.done_criteria)
      ? task.done_criteria
      : task.done_criteria.split(';').map(c => c.trim()).filter(Boolean);
    console.log(`  ${task.id}: ${task.name}`);
    for (const c of criteria) {
      console.log(`    ☐ ${c}`);
    }
    console.log('');
  }

  console.log(`${C.yellow}${withCriteria.length} tasks with acceptance contracts listed above.${C.reset}`);
  console.log(`  Verify each criterion manually or delegate to an agent for inspection.`);
  console.log('');
}
