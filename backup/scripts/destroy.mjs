#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';

if (fs.existsSync('.env')) {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile('.env');
    }
  } catch (e) {
    // Ignore .env parsing errors
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code ?? 1}.`))));
  });
}

console.log('\n🧹 Destroying CrossboxGymBackupStack\n');
await run('npx', ['cdk', 'destroy', 'CrossboxGymBackupStack', '--force']);
console.log('\n✅ Backup stack destroyed.\n');
