#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import fs from 'node:fs';

if (fs.existsSync('.env')) {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile('.env');
    } else {
      const lines = fs.readFileSync('.env', 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [k, ...v] = trimmed.split('=');
          if (k && !process.env[k.trim()]) {
            process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
          }
        }
      }
    }
  } catch (e) {
    // Ignore .env parsing errors
  }
}

const { values, positionals } = parseArgs({
  options: {
    stacks: { type: 'string', short: 's' },
    stackPrefix: { type: 'string' },
    force: { type: 'boolean', default: true },
  },
  strict: false,
});

const rawStacks = values.stacks || positionals.find(p => !p.startsWith('-')) || process.env.STACKS || 'all';
const rawPrefix = values.stackPrefix || process.env.STACK_PREFIX || process.env.STACK_NAME || 'CrossboxGymDev';
const prefix = rawPrefix.replace(/Stack$/, '');

const stackMap = {
  data: `${prefix}DataStack`,
  api: `${prefix}ApiStack`,
  frontend: `${prefix}FrontendStack`,
  ui: `${prefix}FrontendStack`,
};

let selectedStacks = [];
if (rawStacks.toLowerCase() === 'all' || rawStacks.trim() === '*') {
  // Destroy in reverse dependency order: Frontend -> Api -> Data
  selectedStacks = [`${prefix}FrontendStack`, `${prefix}ApiStack`, `${prefix}DataStack`].join(' ');
} else {
  const parts = rawStacks.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const matched = parts.map(p => stackMap[p] || `${prefix}${p.charAt(0).toUpperCase() + p.slice(1)}Stack`);
  selectedStacks = matched.join(' ');
}

console.log(`\n🧹 CrossBox Multi-Stack Destruction Manager`);
console.log(`📌 Target Prefix : ${prefix}`);
console.log(`🗑 Target Stacks : ${selectedStacks}\n`);

const cmd = `npx cdk destroy ${selectedStacks} --force`;

console.log(`▶ ${cmd}\n`);
execSync(cmd, { stdio: 'inherit' });

console.log(`\n✅ Stack destruction completed!\n`);
