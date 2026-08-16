import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripeLiveTestEnvSchema, validateEnv } from './lib/env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

if (fs.existsSync(path.join(rootDir, '.env'))) {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(path.join(rootDir, '.env'));
  }
}

const env = validateEnv(stripeLiveTestEnvSchema, {
  ...process.env,
  RUN_STRIPE_LIVE_TESTS: process.env.RUN_STRIPE_LIVE_TESTS ?? 'true',
});

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'test/stripe-sandbox.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_STRIPE_LIVE_TESTS: 'true' },
});
process.exitCode = result.status ?? 1;
