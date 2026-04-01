/**
 * x-build/misc — Miscellaneous commands
 */

import {
  PHASES, TASK_STATES, C, ROOT, PLUGIN_ROOT,
  readJSON, writeJSON, readMD, writeMD,
  manifestPath, phaseStatusPath, tasksPath, stepsPath, contextDir, phaseDir,
  projectDir, decisionsPath, metricsPath, templatesDir,
  resolveProject, addDecision, loadPhaseContext,
  loadConfig, parseOptions, renderBar, fmtDuration,
  CONTEXT_MANIFESTS,
  existsSync, join, readdirSync, mkdirSync, readFileSync, appendFileSync,
  homedir, tmpdir, resolve, basename, dirname, fileURLToPath,
  isNormalMode, getMode,
} from './core.mjs';
import { stepsStatus } from './tasks.mjs';

// ── cmdAlias ────────────────────────────────────────────────────────

export function cmdAlias(args) {
  const sub = args[0] || 'install';
  if (sub === 'install') {
    // Use x-build-cli.mjs path (entry point, not core.mjs)
    const cliPath = resolve(PLUGIN_ROOT, 'lib', 'x-build-cli.mjs');
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      const psProfile = join(homedir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
      const psAlias = `\n# x-build alias\nfunction xmb { node "${cliPath}" @args }\n`;

      const existing = existsSync(psProfile) ? readFileSync(psProfile, 'utf8') : '';
      if (existing.includes('function xmb')) {
        console.log(`✅ Alias "xmb" already installed in PowerShell profile`);
        return;
      }

      mkdirSync(dirname(psProfile), { recursive: true });
      appendFileSync(psProfile, psAlias, 'utf8');
      console.log(`✅ Alias "xmb" installed in PowerShell profile`);
      console.log(`   Restart PowerShell or run: . $PROFILE`);
      console.log(`   Then use: xmb status, xmb init, etc.`);
    } else {
      const shell = process.env.SHELL || '/bin/zsh';
      const rcFile = shell.includes('zsh')
        ? join(homedir(), '.zshrc')
        : join(homedir(), '.bashrc');

      const alias = `\n# x-build alias\nalias xmb='node ${cliPath}'\n`;
      const completion = `complete -W "init list status phase gate tasks steps checkpoint context close quality watch dashboard export import plan forecast decisions templates mode alias help" xmb 2>/dev/null\n`;

      const existing = existsSync(rcFile) ? readFileSync(rcFile, 'utf8') : '';
      if (existing.includes("alias xmb=")) {
        console.log(`✅ Alias "xmb" already installed in ${basename(rcFile)}`);
        return;
      }

      appendFileSync(rcFile, alias + completion, 'utf8');
      console.log(`✅ Alias "xmb" installed in ${basename(rcFile)}`);
      console.log(`   Run: source ${rcFile}`);
      console.log(`   Then use: xmb status, xmb init, etc.`);
    }
  } else if (sub === 'remove') {
    console.log(`Remove the "xmb" alias from your shell profile.`);
  }
}

// ── cmdDemo ─────────────────────────────────────────────────────────

export function cmdDemo(args) {
  const demoDir = join(tmpdir(), `x-build-demo-${Date.now()}`);
  mkdirSync(demoDir, { recursive: true });

  const startTime = Date.now();
  const projectName = 'demo';

  const demoRoot = join(demoDir, '.xm', 'build');
  mkdirSync(join(demoRoot, 'projects', projectName), { recursive: true });

  const manifest = {
    name: projectName,
    created_at: new Date().toISOString(),
    current_phase: '02-plan',
    gates: {},
  };
  writeJSON(join(demoRoot, 'projects', projectName, 'manifest.json'), manifest);

  console.log(`\n🎮 ${C.bold}x-build Demo${C.reset}`);
  console.log(`   Demo directory: ${demoDir}`);
  console.log(`   Project: ${projectName}\n`);

  const output = {
    action: 'demo',
    project: projectName,
    demo_dir: demoDir,
    goal: 'Create a simple Node.js CLI tool that counts words in a file',
    suggested_tasks: [
      { name: 'Create package.json with bin entry [R1]', size: 'small' },
      { name: 'Implement word counter module [R2]', size: 'small' },
      { name: 'Create CLI entry point with arg parsing [R3]', size: 'small', deps: ['t1', 't2'] },
    ],
    instructions: 'Register the suggested tasks, compute steps, set phase to execute, then run. Use Quick Mode flow.',
  };

  console.log(JSON.stringify(output, null, 2));
  console.log(`\n${C.dim}Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s${C.reset}`);
}

// ── cmdWatch ────────────────────────────────────────────────────────

export function cmdWatch(args) {
  const { opts } = parseOptions(args);
  const interval = parseInt(opts.interval || '5', 10) * 1000;

  console.log(`${C.dim}Watching every ${interval / 1000}s... (Ctrl+C to stop)${C.reset}`);

  const render = () => {
    process.stdout.write('\x1b[2J\x1b[H');
    try {
      // Lazy import to avoid circular
      import('./project.mjs').then(m => {
        m.cmdStatus([]);
        const project = resolveProject(null);
        const stepData = readJSON(stepsPath(project));
        if (stepData?.steps?.length) {
          stepsStatus(project);
        }
      });
    } catch { /* ignore */ }
  };

  render();
  const timer = setInterval(render, interval);
  process.on('SIGINT', () => { clearInterval(timer); console.log('\n👋 Watch stopped.'); process.exit(0); });
}

// ── cmdMetrics ──────────────────────────────────────────────────────

export function cmdMetrics(args) {
  const mp = metricsPath();
  if (!existsSync(mp)) {
    console.log('No metrics recorded yet.');
    return;
  }

  const lines = readFileSync(mp, 'utf8').trim().split('\n').filter(Boolean);
  const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  const phases = entries.filter(e => e.type === 'phase_complete');
  const tasks = entries.filter(e => e.type === 'task_complete');

  console.log(`\n${C.bold}📈 Metrics${C.reset}\n`);

  if (phases.length > 0) {
    console.log(`${C.bold}Phase Durations:${C.reset}`);
    const byPhase = {};
    for (const p of phases) {
      if (!byPhase[p.phase]) byPhase[p.phase] = [];
      byPhase[p.phase].push(p.duration_ms);
    }
    for (const [phase, durations] of Object.entries(byPhase)) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      console.log(`  ${phase.padEnd(12)} avg: ${fmtDuration(avg)}  (${durations.length} runs)`);
    }
    console.log('');
  }

  if (tasks.length > 0) {
    const totalMs = tasks.reduce((a, t) => a + t.duration_ms, 0);
    const avgMs = totalMs / tasks.length;
    console.log(`${C.bold}Task Velocity:${C.reset}`);
    console.log(`  ${tasks.length} tasks completed, avg: ${fmtDuration(avgMs)}/task`);
    if (totalMs > 0) {
      const tasksPerHour = (tasks.length / (totalMs / 3600000)).toFixed(1);
      console.log(`  ${tasksPerHour} tasks/hour`);
    }
    console.log('');
  }
}

// ── cmdMode ─────────────────────────────────────────────────────────

export function cmdMode(args) {
  const sub = args[0];
  const isGlobal = args.includes('--global');

  if (!sub || sub === 'show') {
    const mode = getMode();
    console.log(`\n현재 모드: ${C.bold}${mode === 'normal' ? '🟢 일반인 모드' : '🔧 개발자 모드'}${C.reset}`);
    if (mode === 'normal') {
      console.log(`  모든 안내가 쉬운 말로 표시됩니다.`);
    } else {
      console.log(`  기술 용어가 그대로 표시됩니다.`);
    }
    console.log(`\n  변경: xmb mode developer | xmb mode normal\n`);
    return;
  }

  const modeValue = sub;
  if (!['developer', 'normal'].includes(modeValue)) {
    console.error('Usage: x-build mode <developer|normal>');
    process.exit(1);
  }

  // Always write to global config (~/.xm/config.json)
  const globalPath = join(homedir(), '.xm', 'config.json');
  const globalDir = join(homedir(), '.xm');
  if (!existsSync(globalDir)) mkdirSync(globalDir, { recursive: true });
  const globalConfig = readJSON(globalPath) || {};
  globalConfig.mode = modeValue;
  writeJSON(globalPath, globalConfig);

  const scope = '';
  if (modeValue === 'normal') {
    console.log(`\n🟢 일반인 모드로 전환했습니다${scope}.`);
    console.log(`   앞으로 모든 안내가 이해하기 쉬운 말로 표시됩니다.\n`);
  } else {
    console.log(`\n🔧 Developer mode activated${scope}.`);
    console.log(`   Technical terminology will be used.\n`);
  }
}

// ── cmdContext ───────────────────────────────────────────────────────

export function cmdContext(args) {
  const project = resolveProject(args[0] || null, { autoInit: true });
  const manifest = readJSON(manifestPath(project));
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);
  const taskData = readJSON(tasksPath(project));
  const stepData = readJSON(stepsPath(project));
  const decisions = readMD(join(contextDir(project), 'decisions.md'));

  const lines = [
    `# ${manifest.display_name || project} — Context Brief`,
    '',
    `**Phase:** ${currentPhase?.label || manifest.current_phase}`,
    `**Updated:** ${new Date().toISOString().slice(0, 19)}`,
    '',
  ];

  lines.push('## Phase Status');
  for (const phase of PHASES) {
    const status = readJSON(phaseStatusPath(project, phase.id));
    const icon = status?.status === 'completed' ? '✅' : status?.status === 'active' ? '🔵' : '⬜';
    lines.push(`- ${icon} ${phase.label}`);
  }
  lines.push('');

  if (taskData?.tasks?.length > 0) {
    const total = taskData.tasks.length;
    const done = taskData.tasks.filter(t => t.status === TASK_STATES.COMPLETED).length;
    lines.push(`## Tasks: ${done}/${total} completed`);

    if (stepData?.steps?.length > 0) {
      lines.push(`Steps: ${stepData.steps.length}`);
    }
    lines.push('');
  }

  if (decisions.trim().length > 30) {
    const decisionLines = decisions.split('\n').filter(l => l.startsWith('- '));
    const recent = decisionLines.slice(-5);
    if (recent.length > 0) {
      lines.push('## Recent Decisions');
      lines.push(...recent);
      lines.push('');
    }
  }

  const brief = lines.join('\n');
  writeMD(join(contextDir(project), 'brief.md'), brief);

  console.log(brief);
  console.log(`📄 Brief saved to: ${join(contextDir(project), 'brief.md')}`);
}

// ── cmdPhaseContext ──────────────────────────────────────────────────

export function cmdPhaseContext(args) {
  const project = resolveProject(args[0] || null, { autoInit: true });
  const manifest = readJSON(manifestPath(project));
  const currentPhase = PHASES.find(p => p.id === manifest.current_phase);
  const phaseName = currentPhase?.name || 'research';

  const ctx = loadPhaseContext(project, phaseName);
  console.log(`\n${C.bold}Phase-Aware Context: ${currentPhase?.label}${C.reset}`);
  console.log(`${C.dim}Only loading keys relevant to this phase:${C.reset}`);
  console.log(`  Keys: ${(CONTEXT_MANIFESTS[phaseName] || []).join(', ')}\n`);
  console.log(JSON.stringify(ctx, null, 2).slice(0, 1000));
  console.log('');
}

// ── cmdDecisions ────────────────────────────────────────────────────

export function cmdDecisions(args) {
  const sub = args[0];
  const project = resolveProject(null);

  if (!sub || sub === 'list') {
    const data = readJSON(decisionsPath(project));
    if (!data?.decisions?.length) {
      console.log('No decisions recorded. Run: x-build decisions add "title" --rationale "why"');
      return;
    }

    console.log(`\n${C.bold}📜 Decisions (${data.decisions.length})${C.reset}\n`);
    for (const d of data.decisions) {
      const typeIcon = { decision: '🔷', architecture: '🏗️', tradeoff: '⚖️', constraint: '🔒', pivot: '🔄' }[d.type] || '🔷';
      console.log(`  ${typeIcon} ${C.bold}${d.id}${C.reset}: ${d.title} ${C.dim}(${d.phase}, ${d.timestamp.slice(0, 10)})${C.reset}`);
      if (d.rationale) console.log(`     ${C.dim}Why: ${d.rationale}${C.reset}`);
      if (d.alternatives?.length) console.log(`     ${C.dim}Rejected: ${d.alternatives.join(', ')}${C.reset}`);
    }
    console.log('');
    return;
  }

  if (sub === 'add') {
    const { opts, positional } = parseOptions(args.slice(1));
    const title = positional.join(' ');
    if (!title) {
      console.error('Usage: x-build decisions add "title" [--type decision|architecture|tradeoff] [--rationale "why"] [--alternatives "a,b"]');
      process.exit(1);
    }
    const alts = opts.alternatives ? opts.alternatives.split(',').map(a => a.trim()) : [];
    addDecision(project, { type: opts.type, title, rationale: opts.rationale, alternatives: alts });
    console.log(`✅ Decision recorded: ${title}`);
    return;
  }

  if (sub === 'inject') {
    const data = readJSON(decisionsPath(project));
    if (!data?.decisions?.length) {
      console.log('No decisions to inject.');
      return;
    }
    const lines = ['## Key Decisions', ''];
    for (const d of data.decisions.slice(-10)) {
      lines.push(`- **${d.title}** (${d.phase}): ${d.rationale || 'no rationale'}`);
    }
    const injection = lines.join('\n');
    console.log(injection);
    return;
  }

  console.error('Usage: x-build decisions <list|add|inject>');
}

// ── cmdTemplates ────────────────────────────────────────────────────

export function cmdTemplates(args) {
  const sub = args[0];

  if (!sub || sub === 'list') {
    ensureTemplates();
    console.log(`\n${C.bold}📝 Templates${C.reset}\n`);

    const tDir = templatesDir();
    const tasksDir = join(tDir, 'tasks');
    const researchDir = join(tDir, 'research');

    if (existsSync(tasksDir)) {
      console.log(`${C.bold}Task Templates:${C.reset}`);
      for (const f of readdirSync(tasksDir).filter(f => f.endsWith('.md'))) {
        const content = readMD(join(tasksDir, f));
        const firstLine = content.split('\n').find(l => l.startsWith('# '))?.slice(2) || f;
        const size = content.match(/## Size: (\w+)/)?.[1] || '?';
        console.log(`  📋 ${f.replace('.md', '').padEnd(20)} ${C.dim}(${size})${C.reset}  ${firstLine}`);
      }
    }

    if (existsSync(researchDir)) {
      console.log(`\n${C.bold}Research Templates:${C.reset}`);
      for (const f of readdirSync(researchDir).filter(f => f.endsWith('.md'))) {
        const content = readMD(join(researchDir, f));
        const firstLine = content.split('\n').find(l => l.startsWith('# '))?.slice(2) || f;
        console.log(`  🔬 ${f.replace('.md', '').padEnd(20)} ${firstLine}`);
      }
    }
    console.log('');
    return;
  }

  if (sub === 'use') {
    const templateName = args[1];
    if (!templateName) {
      console.error('Usage: x-build templates use <template-name>');
      process.exit(1);
    }

    ensureTemplates();
    const project = resolveProject(null);

    let templatePath = join(templatesDir(), 'tasks', `${templateName}.md`);
    let dest = 'plan';
    if (!existsSync(templatePath)) {
      templatePath = join(templatesDir(), 'research', `${templateName}.md`);
      dest = 'research';
    }
    if (!existsSync(templatePath)) {
      console.error(`❌ Template "${templateName}" not found. Run: x-build templates list`);
      process.exit(1);
    }

    const content = readMD(templatePath);
    const destDir = dest === 'plan'
      ? phaseDir(project, '02-plan')
      : phaseDir(project, '01-research');
    const destFile = join(destDir, `${templateName}.md`);

    writeMD(destFile, content);
    console.log(`✅ Template "${templateName}" applied to ${destFile}`);

    if (dest === 'plan') {
      const sizeMatch = content.match(/## Size: (\w+)/);
      const titleMatch = content.match(/^# (.+)/m);
      const size = sizeMatch?.[1] || 'medium';
      const name = titleMatch?.[1] || templateName;

      const data = readJSON(tasksPath(project)) || { tasks: [] };
      const id = `t${data.tasks.length + 1}`;
      data.tasks.push({
        id, name, depends_on: [], size,
        status: 'pending',
        created_at: new Date().toISOString(),
        template: templateName,
      });
      writeJSON(tasksPath(project), data);
      console.log(`  ➕ Task "${id}: ${name}" added (${size})`);
    }

    return;
  }

  if (sub === 'init') {
    ensureTemplates();
    console.log(`✅ Templates initialized at ${templatesDir()}`);
    return;
  }

  console.error('Usage: x-build templates <list|use|init>');
}

function ensureTemplates() {
  const dir = templatesDir();
  const tasksDir = join(dir, 'tasks');
  const researchDir = join(dir, 'research');

  if (existsSync(join(tasksDir, 'add-auth.md'))) return;

  mkdirSync(tasksDir, { recursive: true });
  mkdirSync(researchDir, { recursive: true });

  const taskTemplates = {
    'add-auth.md': `# Add Authentication
## Variants: jwt | oauth2 | api-key | session
## Size: medium
## Checklist
- [ ] Choose auth strategy
- [ ] Implement login/signup endpoints
- [ ] Add token validation middleware
- [ ] Implement token refresh
- [ ] Add rate limiting to auth endpoints
- [ ] Hash passwords (bcrypt, argon2)
## Common Pitfalls
- Storing plain-text passwords
- Missing token expiry
- No rate limiting on login (brute-force risk)
- Leaking tokens in logs
`,
    'setup-ci.md': `# Setup CI/CD
## Variants: github-actions | gitlab-ci | jenkins
## Size: small
## Checklist
- [ ] Create CI config file
- [ ] Add lint step
- [ ] Add test step with coverage
- [ ] Add build step
- [ ] Configure caching (node_modules, go mod, etc.)
- [ ] Add branch protection rules
## Common Pitfalls
- No caching → slow builds
- Missing env vars in CI
- Flaky tests blocking deploys
`,
    'add-tests.md': `# Add Test Suite
## Variants: unit | integration | e2e
## Size: medium
## Checklist
- [ ] Install test framework
- [ ] Configure test runner
- [ ] Write unit tests for core logic
- [ ] Add integration tests for API endpoints
- [ ] Set up test database/fixtures
- [ ] Add coverage reporting (>80%)
## Common Pitfalls
- Mocking too much (tests pass, prod fails)
- No test isolation (shared state)
- Missing edge cases and error paths
`,
    'add-docker.md': `# Add Docker Support
## Size: small
## Checklist
- [ ] Create Dockerfile (multi-stage build)
- [ ] Create .dockerignore
- [ ] Create docker-compose.yml
- [ ] Add health check endpoint
- [ ] Configure environment variables
- [ ] Test build locally
## Common Pitfalls
- Running as root in container
- Copying node_modules into image
- Missing .dockerignore → huge images
`,
    'db-migration.md': `# Database Migration
## Size: medium
## Checklist
- [ ] Design schema changes
- [ ] Write up migration (forward)
- [ ] Write down migration (rollback)
- [ ] Test on staging/dev first
- [ ] Back up production data
- [ ] Plan zero-downtime migration
## Common Pitfalls
- No rollback plan
- Locking tables during migration
- Data loss from column drops
`,
  };

  for (const [name, content] of Object.entries(taskTemplates)) {
    writeMD(join(tasksDir, name), content);
  }

  writeMD(join(researchDir, 'tech-compare.md'), `# Technology Comparison: {TOPIC}

## Evaluation Criteria
| Criteria | Weight | Option A | Option B | Option C |
|----------|--------|----------|----------|----------|
| Performance | 30% | | | |
| DX / Ergonomics | 25% | | | |
| Ecosystem / Community | 20% | | | |
| Maintenance burden | 15% | | | |
| License / Cost | 10% | | | |

## Weighted Score
| Option | Total Score | Recommendation |
|--------|------------|----------------|
| A | | |
| B | | |
| C | | |

## Decision
**Chosen:**
**Rationale:**
`);

  writeMD(join(researchDir, 'security-audit.md'), `# Security Audit: {TARGET}

## OWASP Top 10 Check
- [ ] A01: Broken Access Control
- [ ] A02: Cryptographic Failures
- [ ] A03: Injection
- [ ] A04: Insecure Design
- [ ] A05: Security Misconfiguration
- [ ] A06: Vulnerable Components
- [ ] A07: Auth Failures
- [ ] A08: Data Integrity Failures
- [ ] A09: Logging Failures
- [ ] A10: SSRF

## Findings
| # | Severity | Location | Issue | Fix |
|---|----------|----------|-------|-----|
| 1 | | | | |

## Recommendation

`);
}

// ── printHelp ───────────────────────────────────────────────────────

export function printHelp() {
  console.log(`
${C.bold}x-build${C.reset} — Phase-Based Project Harness CLI

${C.bold}Project:${C.reset}
  init <name>                    Create a new project
  list                           List all projects
  status [project]               Show project status (with progress bar)
  next                           Smart workflow routing — what to do next
  handoff [--restore]            Save/restore session state for continuity

${C.bold}Research Phase:${C.reset}
  discuss [--mode interview|assumptions|critique|validate|adapt] [--round N]
                                 Phase-aware deliberation (interview/critique/validate/adapt)
  research [goal]                Parallel agent investigation (stack/features/arch/pitfalls)

${C.bold}Plan Phase:${C.reset}
  plan ["goal"]                  Show plan or auto-decompose goal into tasks
  plan-check [--strict]          Validate plan across 9 dimensions (--strict: coverage errors block gate)
  prd-gate [--threshold N]       Judge panel PRD quality evaluation (default threshold: 7)
  consensus [--round N]          4-agent consensus review (architect/critic/planner/security)
  phase <next|set|status>        Manage phases
  gate <pass|fail> [message]     Resolve current phase gate

${C.bold}Execute Phase:${C.reset}
  tasks <add|list|remove|update|done-criteria> Manage tasks
    tasks add "name" [--strategy refine] [--team eng] [--done-criteria "..."]  Add task
    tasks update <id> --score 7.8 [--done-criteria "..."]         Update task
    tasks done-criteria                                           Auto-derive from PRD
  steps <compute|status|next>    DAG-based step management
  run                            Execute next step via agent orchestration
  checkpoint <type> [message]    Record a checkpoint

${C.bold}Verify & Close:${C.reset}
  quality                        Run quality checks (test/lint/build)
  verify-coverage                Check requirement coverage across tasks
  verify-traceability            R# ↔ Task ↔ AC ↔ Done Criteria matrix
  verify-contracts               Check task done_criteria fulfillment
  context [project]              Generate context brief
  close [--summary "..."]        Close project with summary

${C.bold}Analysis & Utilities:${C.reset}
  context-usage                  Show project artifact token usage
  save <type>                    Save artifact (context|requirements|roadmap|project|plan)
  watch [--interval N]           Auto-refresh status every N seconds
  dashboard                      Multi-project overview
  metrics                        Show phase/task analytics
  phase-context                  Show phase-aware context loading
  alias install                  Install 'xmb' shell alias
  help                           Show this help

${C.bold}Phase Lifecycle:${C.reset}
  Research → Plan → Execute → Verify → Close

${C.bold}Examples:${C.reset}
  xmb init my-api
  xmb discuss --mode interview
  xmb research "Build a REST API with auth"
  xmb plan "Build a REST API with auth and CRUD"
  xmb plan-check
  xmb next
  xmb tasks add "Create DB schema" --size small
  xmb steps compute
  xmb run
  xmb verify-coverage
  xmb handoff
  xmb context-usage
`);
}
