#!/usr/bin/env node

/**
 * x-build setup script
 * Initializes .xm/build/ in the current working directory
 * (aligned with CLI ROOT resolution: cwd/.xm/build/)
 */

import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const CWD = process.cwd();
const TARGET = join(CWD, '.xm', 'build');

if (existsSync(TARGET)) {
  console.log('✅ .xm/build/ already exists in this directory.');
  process.exit(0);
}

mkdirSync(TARGET, { recursive: true });
mkdirSync(join(TARGET, 'projects'), { recursive: true });

// Copy default config to shared .xm/ location (where CLI reads it)
const sharedConfig = join(CWD, '.xm', 'config.json');
if (!existsSync(sharedConfig)) {
  const defaultConfig = join(PLUGIN_ROOT, 'lib', 'default-config.json');
  if (existsSync(defaultConfig)) {
    copyFileSync(defaultConfig, sharedConfig);
  } else {
    writeFileSync(sharedConfig, JSON.stringify({
      gates: {
        "research-exit": "auto",
        "plan-exit": "human-verify",
        "execute-exit": "auto",
        "verify-exit": "quality",
        "close-exit": "auto"
      },
      execution: { parallel: true, max_concurrent: 3 }
    }, null, 2) + '\n');
  }
}

// Create .xm/.gitignore — selective: exclude ephemeral data, keep config/decisions/probes
const xmGitignore = join(CWD, '.xm', '.gitignore');
if (!existsSync(xmGitignore)) {
  writeFileSync(xmGitignore, [
    '# Ephemeral / personal data — excluded from version control',
    'metrics/',
    'traces/',
    'memory/',
    'humble/',
    'op-checkpoints/',
    'state/',
    '',
    '# Kept in git: config.json, build/projects/, probe/',
    '',
  ].join('\n'));
  console.log('✅ Created .xm/.gitignore (selective exclusion)');
}

console.log('✅ .xm/build/ initialized.');
console.log(`   Config: ${sharedConfig}`);
console.log('   Run: /x-build init <project-name>');
