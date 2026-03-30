/**
 * x-build/export — Export/Import commands
 */

import {
  PHASES, TASK_STATES, C,
  readJSON, writeJSON, readMD,
  manifestPath, tasksPath, stepsPath, phaseDir, contextDir, decisionsPath,
  resolveProject, parseOptions,
  existsSync, join, readFileSync, writeFileSync,
  parseCSVLine, normSize,
} from './core.mjs';

// ── cmdExport ───────────────────────────────────────────────────────

export function cmdExport(args) {
  const { opts } = parseOptions(args);
  const format = opts.format || 'md';
  const project = resolveProject(null);
  const manifest = readJSON(manifestPath(project));
  const taskData = readJSON(tasksPath(project));
  const stepData = readJSON(stepsPath(project));
  const decisionsData = readJSON(decisionsPath(project));
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);
  const outputDir = opts.output || '.';

  if (format === 'csv') {
    const header = 'ID,Name,Status,Size,Dependencies,Phase,Created,Completed';
    const rows = (taskData?.tasks || []).map(t =>
      `${t.id},"${t.name}",${t.status},${t.size},"${t.depends_on.join(';')}",${currentPhase?.name || ''},${t.created_at || ''},${t.completed_at || ''}`
    );
    const csv = [header, ...rows].join('\n');
    const file = join(outputDir, `${project}-tasks.csv`);
    writeFileSync(file, csv, 'utf8');
    console.log(`✅ Exported ${rows.length} tasks to ${file}`);
    return;
  }

  if (format === 'jira') {
    const issues = (taskData?.tasks || []).map(t => ({
      summary: t.name,
      issueType: 'Task',
      priority: t.size === 'large' ? 'High' : t.size === 'small' ? 'Low' : 'Medium',
      status: t.status === 'completed' ? 'Done' : t.status === 'running' ? 'In Progress' : 'To Do',
      labels: [`x-build`, `step-${findTaskStep(t.id, stepData)}`],
      description: `x-build task ${t.id}\nSize: ${t.size}\nDependencies: ${t.depends_on.join(', ') || 'none'}`,
    }));
    const file = join(outputDir, `${project}-jira.json`);
    writeJSON(file, { issues });
    console.log(`✅ Exported ${issues.length} issues to ${file} (Jira format)`);
    return;
  }

  if (format === 'confluence') {
    const lines = [
      `h1. ${manifest.display_name || project}`,
      '',
      `*Phase:* ${currentPhase?.label || '?'}`,
      `*Created:* ${manifest.created_at?.slice(0, 10)}`,
      '',
      'h2. Tasks',
      '|| ID || Name || Status || Size || Dependencies ||',
    ];
    for (const t of (taskData?.tasks || [])) {
      const statusIcon = t.status === 'completed' ? '(/)' : t.status === 'failed' ? '(x)' : '(?)';
      lines.push(`| ${t.id} | ${t.name} | ${statusIcon} ${t.status} | ${t.size} | ${t.depends_on.join(', ') || '-'} |`);
    }
    if (stepData?.steps?.length) {
      lines.push('', 'h2. Steps');
      for (const s of stepData.steps) {
        lines.push(`* *Step ${s.id}:* ${s.tasks.join(', ')}`);
      }
    }
    if (decisionsData?.decisions?.length) {
      lines.push('', 'h2. Decisions');
      for (const d of decisionsData.decisions) {
        lines.push(`* *${d.title}* (${d.phase}): ${d.rationale || ''}`);
      }
    }
    const file = join(outputDir, `${project}-confluence.wiki`);
    writeFileSync(file, lines.join('\n'), 'utf8');
    console.log(`✅ Exported to ${file} (Confluence wiki)`);
    return;
  }

  // Default: markdown
  const lines = [
    `# ${manifest.display_name || project}`,
    '',
    `**Phase:** ${currentPhase?.label || '?'}`,
    `**Created:** ${manifest.created_at?.slice(0, 10)}`,
    '',
    '## Tasks',
    '',
    '| ID | Name | Status | Size | Deps |',
    '|----|------|--------|------|------|',
  ];
  for (const t of (taskData?.tasks || [])) {
    const icon = { completed: '✅', failed: '❌', running: '🔵', pending: '⬜', ready: '🟡' }[t.status] || '⬜';
    lines.push(`| ${t.id} | ${t.name} | ${icon} ${t.status} | ${t.size} | ${t.depends_on.join(', ') || '-'} |`);
  }
  if (stepData?.steps?.length) {
    lines.push('', '## Steps', '');
    for (const s of stepData.steps) {
      const taskNames = s.tasks.map(id => {
        const t = taskData?.tasks?.find(t => t.id === id);
        return t ? `${id}: ${t.name}` : id;
      });
      lines.push(`- **Step ${s.id}:** ${taskNames.join(', ')}`);
    }
  }
  if (decisionsData?.decisions?.length) {
    lines.push('', '## Decisions', '');
    for (const d of decisionsData.decisions) {
      lines.push(`- **${d.title}** (${d.phase}): ${d.rationale || ''}`);
    }
  }
  const md = lines.join('\n') + '\n';
  const file = join(outputDir, `${project}-report.md`);
  writeFileSync(file, md, 'utf8');
  console.log(`✅ Exported to ${file}`);
}

function findTaskStep(taskId, stepData) {
  if (!stepData?.steps) return '?';
  const step = stepData.steps.find(s => s.tasks.includes(taskId));
  return step ? step.id : '?';
}

// ── cmdImport ───────────────────────────────────────────────────────

export function cmdImport(args) {
  const { opts, positional } = parseOptions(args);
  const format = opts.from || 'csv';
  const file = positional[0];
  const project = resolveProject(null);

  if (!file) {
    console.error('Usage: x-build import <file> [--from csv|jira|md]');
    process.exit(1);
  }

  if (!existsSync(file)) {
    console.error(`❌ File not found: ${file}`);
    process.exit(1);
  }

  const data = readJSON(tasksPath(project)) || { tasks: [] };

  if (format === 'csv') {
    const content = readFileSync(file, 'utf8');
    const lines = content.trim().split('\n');
    const header = lines[0].toLowerCase();

    const cols = header.split(',').map(c => c.trim().replace(/"/g, ''));
    const nameIdx = cols.findIndex(c => ['name', 'summary', 'title', '이름'].includes(c));
    const sizeIdx = cols.findIndex(c => ['size', 'priority', '크기'].includes(c));
    const depsIdx = cols.findIndex(c => ['dependencies', 'deps', '의존성'].includes(c));

    if (nameIdx === -1) {
      console.error('❌ CSV must have a "name" or "summary" column.');
      process.exit(1);
    }

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      const name = parts[nameIdx]?.trim();
      if (!name) continue;

      const size = sizeIdx >= 0 ? normSize(parts[sizeIdx]?.trim()) : 'medium';
      const deps = depsIdx >= 0 ? (parts[depsIdx]?.trim().split(';').filter(Boolean)) : [];
      const id = `t${data.tasks.length + 1}`;

      data.tasks.push({
        id, name, depends_on: deps, size,
        status: TASK_STATES.PENDING,
        created_at: new Date().toISOString(),
      });
      imported++;
    }

    writeJSON(tasksPath(project), data);
    console.log(`✅ Imported ${imported} tasks from ${file}`);
    return;
  }

  if (format === 'jira') {
    const jiraData = readJSON(file);
    const issues = jiraData?.issues || jiraData || [];
    let imported = 0;

    for (const issue of (Array.isArray(issues) ? issues : [])) {
      const name = issue.summary || issue.fields?.summary || issue.name;
      if (!name) continue;

      const priority = issue.priority || issue.fields?.priority?.name || 'Medium';
      const size = normSize(priority);
      const id = `t${data.tasks.length + 1}`;

      data.tasks.push({
        id, name, depends_on: [], size,
        status: TASK_STATES.PENDING,
        created_at: new Date().toISOString(),
        source: 'jira',
        source_key: issue.key || issue.id || null,
      });
      imported++;
    }

    writeJSON(tasksPath(project), data);
    console.log(`✅ Imported ${imported} tasks from ${file} (Jira)`);
    return;
  }

  console.error(`❌ Unsupported format: ${format}. Use: csv, jira`);
}
