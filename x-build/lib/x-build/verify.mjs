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
