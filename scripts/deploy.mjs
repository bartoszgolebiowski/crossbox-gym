#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { deployEnvSchema, validateEnv } from './lib/env.mjs';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    let interrupted = false;

    const stopChild = (signal) => {
      if (interrupted) return;
      interrupted = true;

      if (process.platform === 'win32') {
        spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        child.kill(signal);
      }
    };

    const onSigint = () => stopChild('SIGINT');
    const onSigterm = () => stopChild('SIGTERM');
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);

    const cleanup = () => {
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
    };

    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('exit', (code, signal) => {
      cleanup();
      if (interrupted) {
        reject(new Error(`Deployment interrupted${signal ? ` by ${signal}` : ''}.`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? 1}.`));
      }
    });
  });
}

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
            process.env[k.trim()] = v
              .join('=')
              .trim()
              .replace(/^["']|["']$/g, '');
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
    output: { type: 'string' },
    hotswap: { type: 'boolean', default: false },
    buildUi: { type: 'boolean', default: true },
  },
  strict: false,
});

const env = validateEnv(deployEnvSchema, process.env);
const rawStacks = values.stacks || positionals.find((p) => !p.startsWith('-')) || env.STACKS;
const rawPrefix = values.stackPrefix || env.STACK_NAME || 'CrossboxGymDev';
const cdkOutputDir = values.output || process.env.CDK_OUTDIR || 'cdk.out.deploy';
const prefix = rawPrefix.replace(/Stack$/, '');

const stackMap = {
  data: `${prefix}DataStack`,
  api: `${prefix}ApiStack`,
  frontend: `${prefix}FrontendStack`,
  ui: `${prefix}FrontendStack`,
  iot: `${prefix}IotStack`,
};

let selectedStacks = [];
if (rawStacks.toLowerCase() === 'all' || rawStacks.trim() === '*') {
  selectedStacks = [`${prefix}DataStack`, `${prefix}ApiStack`, `${prefix}FrontendStack`, `${prefix}IotStack`].join(' ');
} else {
  const parts = rawStacks
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const matched = parts.map((p) => stackMap[p] || `${prefix}${p.charAt(0).toUpperCase() + p.slice(1)}Stack`);
  selectedStacks = matched.join(' ');
}

console.log(`\n🚀 CrossBox Multi-Stack Deployment Manager`);
console.log(`📌 Target Prefix : ${prefix}`);
console.log(`📦 Target Stacks : ${selectedStacks}`);
console.log(`📁 CDK Output    : ${cdkOutputDir}`);
if (values.hotswap) console.log(`⚡ Mode          : HOTSWAP ENABLED (Instant Lambda Code Push)\n`);

// Build UI if frontend stack is being deployed or all stacks
const isFrontendIncluded = selectedStacks.includes('FrontendStack');
if (isFrontendIncluded && values.buildUi !== false) {
  console.log(`\n📦 Building UI frontends before deployment...`);
  await run('npm', ['run', 'build:ui']);
}

const cdkArgs = [
  'cdk',
  'deploy',
  ...selectedStacks.split(' '),
  ...(values.hotswap ? ['--hotswap'] : []),
  '--require-approval',
  'never',
  '--output',
  cdkOutputDir,
  '--outputs-file',
  'cdk-outputs.json',
];

console.log(`\n▶ npx ${cdkArgs.join(' ')}\n`);
await run('npx', cdkArgs);

console.log(`\n✅ Deployment finished successfully! Outputs updated in cdk-outputs.json\n`);
