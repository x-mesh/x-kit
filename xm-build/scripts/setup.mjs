#!/usr/bin/env node

/**
 * xm-build setup script
 * Initializes .xm-build/ in the current working directory
 */

import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const CWD = process.cwd();
const TARGET = join(CWD, '.xm-build');

if (existsSync(TARGET)) {
  console.log('✅ .xm-build/ already exists in this directory.');
  process.exit(0);
}

mkdirSync(TARGET, { recursive: true });
mkdirSync(join(TARGET, 'projects'), { recursive: true });

// Copy default config
const defaultConfig = join(PLUGIN_ROOT, 'lib', 'default-config.json');
if (existsSync(defaultConfig)) {
  copyFileSync(defaultConfig, join(TARGET, 'config.json'));
} else {
  writeFileSync(join(TARGET, 'config.json'), JSON.stringify({
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

console.log('✅ .xm-build/ initialized.');
console.log(`   Config: ${join(TARGET, 'config.json')}`);
console.log('   Run: /xm-build init <project-name>');
