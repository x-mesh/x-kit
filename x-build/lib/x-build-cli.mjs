#!/usr/bin/env node

/**
 * x-build — Phase-Based Project Harness CLI
 * term-mesh 생태계의 프로젝트 라이프사이클 관리 도구
 *
 * Usage: node <plugin-root>/lib/x-build-cli.mjs <command> [args] [options]
 */

import { resolveProject, resetCircuitBreaker, getCircuitState } from './x-build/core.mjs';
import { cmdInit, cmdList, cmdStatus, cmdClose, cmdDashboard, interactiveInit, interactiveDashboard } from './x-build/project.mjs';
import { cmdPhase, cmdGate, cmdCheckpoint } from './x-build/phase.mjs';
import { cmdTasks, cmdSteps, cmdRun, cmdRunStatus, interactiveTasksAdd } from './x-build/tasks.mjs';
import { cmdPlan, cmdPlanCheck, cmdPrdGate, cmdConsensus, cmdDiscuss, cmdResearch, cmdForecast, cmdNext, cmdHandoff, cmdSummarize, cmdSaveArtifact, cmdContextUsage } from './x-build/plan.mjs';
import { cmdQuality, cmdVerifyCoverage, cmdVerifyContracts } from './x-build/verify.mjs';
import { cmdExport, cmdImport } from './x-build/export.mjs';
import { cmdAlias, cmdDemo, cmdWatch, cmdMetrics, cmdMode, cmdContext, cmdPhaseContext, cmdDecisions, cmdTemplates, printHelp } from './x-build/misc.mjs';

// Skip top-level execution when imported by x-kit-server
if (process.env.XKIT_SERVER !== '1') {

// ── Flag extraction ─────────────────────────────────────────────────

function extractFlags(rawArgs) {
  const cleaned = [];
  let projectFlag = null;
  for (let i = 0; i < rawArgs.length; i++) {
    if ((rawArgs[i] === '--project' || rawArgs[i] === '-p') && i + 1 < rawArgs.length) {
      projectFlag = rawArgs[++i];
    } else if (rawArgs[i].startsWith('--project=')) {
      projectFlag = rawArgs[i].slice('--project='.length);
    } else if (rawArgs[i] === '--global') {
      // already handled in core.mjs, skip
    } else {
      cleaned.push(rawArgs[i]);
    }
  }
  return { cleaned, projectFlag };
}

const { cleaned: _cleanedArgv, projectFlag: _projectFlag } = extractFlags(process.argv.slice(2));

// ── Main Router ─────────────────────────────────────────────────────

const [cmd, ...args] = _cleanedArgv;

if (_projectFlag && args.length === 0) {
  args.unshift(_projectFlag);
} else if (_projectFlag) {
  const first = args[0];
  if (first && first.startsWith('-')) {
    args.unshift(_projectFlag);
  }
}

switch (cmd) {
  case 'init':
    if (args.length === 0) { await interactiveInit(); } else { cmdInit(args); }
    break;
  case 'list':       cmdList(); break;
  case 'status':     cmdStatus(args); break;
  case 'phase':      cmdPhase(args); break;
  case 'gate':       cmdGate(args); break;
  case 'tasks':
    if (args[0] === 'add' && args.length <= 1) { await interactiveTasksAdd(); }
    else { cmdTasks(args); }
    break;
  case 'steps':      cmdSteps(args); break;
  case 'checkpoint': cmdCheckpoint(args); break;
  case 'context':       cmdContext(args); break;
  case 'close':         cmdClose(args); break;
  case 'quality':       cmdQuality(args); break;
  case 'templates':     cmdTemplates(args); break;
  case 'decisions':     cmdDecisions(args); break;
  case 'summarize':     cmdSummarize(args); break;
  case 'forecast':      cmdForecast(args); break;
  case 'run':            cmdRun(args); break;
  case 'mode':           cmdMode(args); break;
  case 'export':         cmdExport(args); break;
  case 'import':         cmdImport(args); break;
  case 'plan':           cmdPlan(args); break;
  case 'discuss':        cmdDiscuss(args); break;
  case 'research':       cmdResearch(args); break;
  case 'plan-check':     cmdPlanCheck(args); break;
  case 'prd-gate':       cmdPrdGate(args); break;
  case 'consensus':      cmdConsensus(args); break;
  case 'next':           cmdNext(args); break;
  case 'handoff':        cmdHandoff(args); break;
  case 'verify-coverage': cmdVerifyCoverage(args); break;
  case 'verify-contracts': cmdVerifyContracts(args); break;
  case 'context-usage':  cmdContextUsage(args); break;
  case 'save':           cmdSaveArtifact(args); break;
  case 'run-status':     cmdRunStatus(args); break;
  case 'watch':         cmdWatch(args); break;
  case 'dashboard':     cmdDashboard(); break;
  case 'metrics':       cmdMetrics(args); break;
  case 'phase-context': cmdPhaseContext(args); break;
  case 'alias':         cmdAlias(args); break;
  case 'demo':          cmdDemo(args); break;
  case 'circuit-breaker': {
    const project = resolveProject(args[1]);
    if (args[0] === 'reset') { resetCircuitBreaker(project); }
    else if (args[0] === 'status') {
      const cb = getCircuitState(project);
      console.log(`⚡ Circuit breaker: ${cb.state} (failures: ${cb.consecutive_failures})`);
      if (cb.cooldown_until) console.log(`  Cooldown until: ${cb.cooldown_until}`);
    }
    else { console.error('Usage: x-build circuit-breaker <reset|status>'); }
    break;
  }
  case 'help':
  case '--help':
  case '-h':            printHelp(); break;
  default:
    if (!cmd) {
      await interactiveDashboard();
    } else {
      console.error(`❌ Unknown command: "${cmd}". Run: x-build help`);
      process.exit(1);
    }
}
} // end XKIT_SERVER guard
