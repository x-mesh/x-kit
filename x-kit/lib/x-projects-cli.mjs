#!/usr/bin/env node
/**
 * x-projects-cli.mjs — CLI surface for the project registry at ~/.xm/projects.json
 *
 * Subcommands: list, add, remove, archive, unarchive, import, gc, register
 */

import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  loadRegistry, registerProject, removeProject, archiveProject,
  gcRegistry, importProjects, REGISTRY_PATH,
} from './x-projects-registry.mjs';

function expandHome(p) {
  if (!p) return p;
  return p.replace(/^~(?=$|\/)/, homedir());
}

function getFlag(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) return true;
  return v;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function listCmd(args) {
  const json = hasFlag(args, '--json');
  const showArchived = hasFlag(args, '--archived');
  const reg = loadRegistry();
  const items = reg.projects.filter((p) => showArchived || !p.archived);

  if (json) {
    process.stdout.write(JSON.stringify({ projects: items }, null, 2) + '\n');
    return 0;
  }

  if (items.length === 0) {
    process.stdout.write('No projects registered. Run `x-kit project import` or `x-kit project add` to populate.\n');
    return 0;
  }

  process.stdout.write(`📋 Registered projects (${items.length}${showArchived ? ', incl. archived' : ''})\n\n`);
  const idW = Math.max(2, ...items.map((p) => p.id.length));
  for (const p of items) {
    const flag = p.archived ? '📦' : '  ';
    process.stdout.write(`  ${flag} ${p.id.padEnd(idW)}  ${fmtDate(p.last_seen)}  ${p.path}\n`);
  }
  return 0;
}

function addCmd(args) {
  const path = expandHome(args[0] || process.cwd());
  const id = getFlag(args, '--id');
  const name = getFlag(args, '--name');
  const result = registerProject(path, {
    id: typeof id === 'string' ? id : undefined,
    name: typeof name === 'string' ? name : undefined,
    unarchive: true,
  });
  if (result.action === 'skipped') {
    process.stderr.write(`⚠ Skipped: ${path} — ${result.reason}\n`);
    return 1;
  }
  const verb = result.action === 'added' ? '➕ added' : '🔄 updated';
  process.stdout.write(`${verb}  ${result.entry.id}  ${result.entry.path}\n`);
  return 0;
}

function removeCmd(args) {
  const target = args[0];
  if (!target) {
    process.stderr.write('Usage: x-kit project remove <id|path>\n');
    return 2;
  }
  const result = removeProject(target);
  if (result.action === 'not_found') {
    process.stderr.write(`Not found: ${target}\n`);
    return 1;
  }
  process.stdout.write(`🗑  removed ${result.count} entry(ies)\n`);
  return 0;
}

function archiveCmd(args, archived) {
  const target = args[0];
  if (!target) {
    process.stderr.write(`Usage: x-kit project ${archived ? 'archive' : 'unarchive'} <id|path>\n`);
    return 2;
  }
  const result = archiveProject(target, archived);
  if (result.action === 'not_found') {
    process.stderr.write(`Not found: ${target}\n`);
    return 1;
  }
  process.stdout.write(`${archived ? '📦 archived' : '📤 unarchived'} ${result.entry.id}\n`);
  return 0;
}

function importCmd(args) {
  const root = expandHome(getFlag(args, '--scan') || args[0] || '~/work');
  const depth = parseInt(getFlag(args, '--depth') || '4', 10);
  const dryRun = hasFlag(args, '--dry-run');

  const result = importProjects(resolve(root), { depth, dryRun });

  if (dryRun) {
    process.stdout.write(`🔍 [dry-run] Found ${result.total} project(s) under ${root} (depth ${depth}):\n`);
    for (const p of result.found) process.stdout.write(`  • ${p}\n`);
    process.stdout.write('\nRe-run without --dry-run to register.\n');
    return 0;
  }

  process.stdout.write(`📥 Import from ${root} (depth ${depth})\n`);
  process.stdout.write(`   Total: ${result.total}  Added: ${result.added.length}  Updated: ${result.updated.length}\n`);
  for (const e of result.added) process.stdout.write(`   ➕ ${e.id}  ${e.path}\n`);
  return 0;
}

function gcCmd(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const result = gcRegistry({ dryRun });
  if (result.stale.length === 0) {
    process.stdout.write('✅ No stale entries.\n');
    return 0;
  }
  process.stdout.write(`${dryRun ? '🔍 [dry-run] Would remove' : '🗑  Removed'} ${result.stale.length} stale entry(ies):\n`);
  for (const p of result.stale) process.stdout.write(`   • ${p.id}  ${p.path}\n`);
  return 0;
}

function registerCmd(args) {
  // Internal — used by the dispatcher self-register hook. Silent on no-op.
  const cwd = args[0] || process.cwd();
  const quiet = hasFlag(args, '--quiet');
  const result = registerProject(cwd);
  if (!quiet && result.action === 'added') {
    process.stderr.write(`[x-kit] auto-registered project: ${result.entry.id} (${result.entry.path})\n`);
  }
  return 0;
}

function helpCmd() {
  process.stdout.write(`x-kit project — manage the project registry at ${REGISTRY_PATH}

Usage:
  x-kit project list [--json] [--archived]
  x-kit project add [<path>] [--id <id>] [--name <name>]
  x-kit project remove <id|path>
  x-kit project archive <id|path>
  x-kit project unarchive <id|path>
  x-kit project import [<root> | --scan <root>] [--depth N] [--dry-run]
  x-kit project gc [--dry-run]
  x-kit project register [<cwd>] [--quiet]      (internal, used by dispatcher)
`);
  return 0;
}

const sub = process.argv[2] || 'help';
const rest = process.argv.slice(3);

let code = 0;
switch (sub) {
  case 'list': case 'ls': code = listCmd(rest); break;
  case 'add': code = addCmd(rest); break;
  case 'remove': case 'rm': code = removeCmd(rest); break;
  case 'archive': code = archiveCmd(rest, true); break;
  case 'unarchive': code = archiveCmd(rest, false); break;
  case 'import': code = importCmd(rest); break;
  case 'gc': code = gcCmd(rest); break;
  case 'register': code = registerCmd(rest); break;
  case 'help': case '--help': case '-h': code = helpCmd(); break;
  default:
    process.stderr.write(`Unknown subcommand: ${sub}\nRun: x-kit project help\n`);
    code = 2;
}
process.exit(code);
