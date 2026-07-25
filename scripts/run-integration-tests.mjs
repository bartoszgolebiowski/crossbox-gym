#!/usr/bin/env node

// Integration Test Orchestrator (FULL & FAST modes)
// Usage:
//   npm run test:integration:fast  (reuses stack, incremental deploy, leaves stack up)
//   npm run test:integration:full  (clean destroy -> deploy -> seed -> test -> destroy)

import { execSync } from "node:child_process";
import { parseArgs } from "node:util";
import fs from "node:fs";

if (fs.existsSync(".env")) {
  try {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile(".env");
    } else {
      const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [k, ...v] = trimmed.split("=");
          if (k && !process.env[k.trim()]) {
            process.env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
          }
        }
      }
    }
  } catch (e) {
    // Ignore .env parsing errors
  }
}

const { values } = parseArgs({
  options: {
    stack: { type: "string" },
    region: { type: "string" },
    mode: { type: "string" },
  },
  strict: false,
});

const MODE = values.mode ?? process.env.TEST_MODE ?? "fast";
const STACK = values.stack ?? process.env.STACK_NAME ?? (MODE === "full" ? "CrossboxGymTestStack" : "CrossboxGymDevStack");
const REGION = values.region ?? process.env.AWS_REGION ?? "eu-central-1";

const run = (cmd) => {
  console.log(`\n▶  ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, AWS_REGION: REGION, STACK_NAME: STACK } });
};

let testExitCode = 1;

console.log(`\n🚀 Running Integration Tests in [${MODE.toUpperCase()}] Mode for Stack: ${STACK}\n`);

try {
  if (MODE === "full") {
    // FULL MODE: Wipe existing stack first for 100% clean environment
    console.log("🧹 [FULL MODE] Wiping existing stack before clean build...");
    try {
      run(`npx cdk destroy ${STACK} -c stackName=${STACK} --force`);
    } catch {
      // Ignore if stack doesn't exist
    }
  }

  // 1. Deploy (Incremental update in FAST mode, fresh deploy in FULL mode)
  console.log(`⚡ Deploying ${MODE === "fast" ? "incremental updates" : "fresh stack"}...`);
  run(`npx cdk deploy ${STACK} -c isTestEnvironment=true -c stackName=${STACK} --require-approval never --outputs-file cdk-outputs.json`);

  // 2. Seed admin user and HMAC keys
  try {
    run(`npx tsx scripts/seed-admin.ts`);
  } catch (e) {
    console.error("⚠ Seeding failed:", e.message);
  }

  // 3. Run integration test suite
  try {
    run(`node --import tsx --test "integration-tests/*.test.ts" -- --stack ${STACK} --region ${REGION}`);
    testExitCode = 0;
  } catch {
    testExitCode = 1;
  }
} finally {
  if (MODE === "full") {
    // FULL MODE: Always destroy stack afterward
    console.log("\n🧹 [FULL MODE] Destroying stack after test run...\n");
    try {
      run(`npx cdk destroy ${STACK} -c stackName=${STACK} --force`);
    } catch (e) {
      console.error("⚠ cdk destroy failed:", e.message);
    }
  } else {
    console.log(`\n✅ [FAST MODE] Stack ${STACK} kept active for fast iterative testing.\n`);
  }
}

process.exit(testExitCode);

