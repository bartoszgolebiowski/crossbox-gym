import { spawnSync } from 'node:child_process';

if (!process.env.STRIPE_TEST_SECRET_KEY) {
  console.error('STRIPE_TEST_SECRET_KEY is required to run live Stripe sandbox tests.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'test/stripe-sandbox.test.ts'], {
    stdio: 'inherit',
    env: { ...process.env, RUN_STRIPE_LIVE_TESTS: 'true' },
  });
  process.exitCode = result.status ?? 1;
}
