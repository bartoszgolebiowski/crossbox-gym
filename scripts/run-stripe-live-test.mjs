import { spawnSync } from 'node:child_process';
import { stripeLiveTestEnvSchema, validateEnv } from './lib/env.mjs';

const env = validateEnv(stripeLiveTestEnvSchema, process.env);

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'test/stripe-sandbox.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_STRIPE_LIVE_TESTS: env.RUN_STRIPE_LIVE_TESTS ? 'true' : 'false' },
});
process.exitCode = result.status ?? 1;
