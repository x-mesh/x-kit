#!/usr/bin/env node

/**
 * x-memory — Cross-Session Decision and Pattern Memory CLI
 *
 * Usage: node <plugin-root>/lib/x-memory-cli.mjs <command> [args] [options]
 */

import { cmdSave, cmdShow, cmdList, cmdForget, cmdRecall, cmdInject, cmdExport, cmdImport, cmdStats } from './x-memory/commands.mjs';
import { createSessionId, sessionStart, sessionEnd } from '../../x-kit/lib/x-trace/trace-writer.mjs';

// Skip top-level execution when imported by x-kit-server
if (process.env.XKIT_SERVER !== '1') {

// ── Flag extraction ─────────────────────────────────────────────────

function extractFlags(rawArgs) {
  const cleaned = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--global') {
      // handled in core.mjs ROOT resolution
    } else {
      cleaned.push(rawArgs[i]);
    }
  }
  return cleaned;
}

const cleanedArgv = extractFlags(process.argv.slice(2));
const [cmd, ...args] = cleanedArgv;

// ── Main Router ─────────────────────────────────────────────────────

const traceSessionId = createSessionId('x-memory');
sessionStart(traceSessionId, 'x-memory', { command: args[0] || 'help' });
const traceStartTime = Date.now();

switch (cmd) {
  case 'save':    cmdSave(args); break;
  case 'show':    cmdShow(args); break;
  case 'list':    cmdList(args); break;
  case 'forget':  cmdForget(args); break;
  case 'recall':  cmdRecall(args); break;
  case 'inject':  cmdInject(); break;
  case 'export':  cmdExport(args); break;
  case 'import':  cmdImport(args); break;
  case 'stats':   cmdStats(); break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    if (!cmd) {
      printHelp();
    } else {
      console.error(`❌ Unknown command: "${cmd}". Run: x-memory help`);
      process.exit(1);
    }
}

sessionEnd(traceSessionId, { totalDurationMs: Date.now() - traceStartTime, status: 'success' });

// ── Help ─────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`x-memory — Cross-Session Decision and Pattern Memory

Commands:
  save <title> --type <type>   Save a memory (decision|pattern|failure|learning)
    [--why "..."]              Rationale or summary
    [--tags "t1,t2"]           Comma-separated tags
    [--ttl 30d]                Time-to-live (e.g. 7d, 30d, 90d)
    [--files "a.ts,b.ts"]      Related source files
    [--confidence high|medium|low]
    [--source "x-build:proj"]  Origin context

  recall <query>               Search memories by keyword
  inject                       Auto-inject relevant memories based on context
  list [--type T] [--tag T]    List memories with optional filters
    [--since 7d] [--expired]
  show <id>                    Show full memory content
  forget <id>                  Delete a memory permanently

  export [--format md|json]    Export memories
    [--output <file>]
  import <file>                Import memories from JSON

  stats                        Show memory statistics
  help                         Show this help
`);
}

} // end XKIT_SERVER guard
