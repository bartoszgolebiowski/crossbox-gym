#!/usr/bin/env node

// Integration Test Suite Runner
// Assumes the CDK stack is ALREADY deployed (via `npm run deploy`).
// Usage:
//   npm run test:integration

import { execSync } from "node:child_process";
import { parseArgs } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

if (fs.existsSync(path.join(rootDir, ".env"))) {
  try {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile(path.join(rootDir, ".env"));
    } else {
      const lines = fs.readFileSync(path.join(rootDir, ".env"), "utf8").split(/\r?\n/);
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
  },
  strict: false,
});

const STACK = values.stack ?? process.env.STACK_NAME ?? "CrossboxGymDev";
const prefix = STACK.replace(/Stack$/, "");
const REGION = values.region ?? process.env.AWS_REGION ?? "eu-central-1";

let outputsPath = path.join(rootDir, "cdk-outputs.json");
if (!fs.existsSync(outputsPath)) {
  const altPath = path.join(rootDir, "outputs.json");
  if (fs.existsSync(altPath)) {
    fs.copyFileSync(altPath, outputsPath);
  }
}

if (!fs.existsSync(outputsPath)) {
  console.error(`\n❌ Error: cdk-outputs.json not found in ${rootDir}.`);
  console.error(`Please run 'npm run deploy' first to deploy your stack before running integration tests.\n`);
  process.exit(1);
}

const run = (cmd) => {
  console.log(`\n▶  ${cmd}\n`);
  execSync(cmd, { cwd: rootDir, stdio: "inherit", env: { ...process.env, AWS_REGION: REGION, STACK_NAME: prefix } });
};

console.log(`\n🚀 Executing Integration Tests against Deployed Stack: [${prefix}]\n`);

// 1. Ensure admin user and HMAC keys are seeded
console.log(`⚡ Seeding admin user & security HMAC keys...`);
try {
  run(`npx tsx scripts/seed-admin.ts`);
} catch (e) {
  console.warn("⚠ Seeding step emitted a warning:", e.message);
}

// 2. Execute live integration test suite
let testExitCode = 0;
try {
  run(`node --import tsx --test "integration-tests/*.test.ts" -- --stack ${prefix} --region ${REGION}`);
  console.log(`\n✅ Integration tests completed successfully!\n`);
} catch {
  testExitCode = 1;
  console.error(`\n❌ Integration test execution failed.\n`);
}

process.exit(testExitCode);
