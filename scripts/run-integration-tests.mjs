#!/usr/bin/env node

// deploy -> test -> destroy orchestrator
// Usage: node scripts/run-integration-tests.mjs --stack <StackName> --region <region>

import { execSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    stack: { type: "string" },
    region: { type: "string" },
  },
  strict: false,
});

const STACK = values.stack ?? process.env.STACK_NAME ?? "CrossboxGymTestStack";
const REGION = values.region ?? process.env.AWS_REGION ?? "eu-central-1";

const run = (cmd) => {
  console.log(`\n▶  ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, AWS_REGION: REGION, STACK_NAME: STACK } });
};

let testExitCode = 1;

try {
  // 1. Deploy stack with test environment flag and stack name context
  run(`npm run cdk -- deploy ${STACK} -c isTestEnvironment=true -c stackName=${STACK} --require-approval never --outputs-file cdk-outputs.json`);

  // 2. Seed admin user and HMAC keys
  try {
    run(`npx tsx scripts/seed-admin.ts`);
  } catch (e) {
    console.error("⚠ Seeding failed:", e.message);
  }

  // 3. Run integration test suite
  try {
    run(`node --import tsx --test "integration-tests/main-flow.test.ts" -- --stack ${STACK} --region ${REGION}`);
    testExitCode = 0;
  } catch {
    testExitCode = 1;
  }
} finally {
  // 4. ALWAYS destroy stack
  console.log("\n🧹 Destroying stack (always runs, even if tests failed)...\n");
  try {
    run(`npm run cdk -- destroy ${STACK} -c stackName=${STACK} --force`);
  } catch (e) {
    console.error("⚠ cdk destroy failed:", e.message);
  }
}

process.exit(testExitCode);
