#!/usr/bin/env node
/**
 * Deploys the stack, runs the integration test suite against it, then always destroys the
 * stack afterward (even if the tests fail) so no billable resources are left behind.
 *
 * Usage:
 *   npm run test:integration -- --stack <StackName> --region <region>
 *
 * SAFETY: this command DESTROYS the named stack when the run finishes, success or failure.
 * Only ever point it at a dedicated, disposable integration-test stack instance/name — never
 * a shared or production deployment. Confirm the stack name with the user before every run.
 */
import { spawnSync } from "node:child_process";

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const stackName = argValue("--stack") ?? process.env.STACK_NAME;
const region = argValue("--region") ?? process.env.AWS_REGION;

if (!stackName) {
  console.error("Missing --stack <StackName> (or STACK_NAME env var).");
  process.exit(1);
}

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...(region ? { AWS_REGION: region } : {}) },
  });
  return result.status ?? 1;
}

let testExitCode = 1;

const deployExitCode = run("npx", ["cdk", "deploy", stackName, "--require-approval", "never"]);
if (deployExitCode !== 0) {
  console.error("cdk deploy failed; aborting before running tests (nothing to tear down).");
  process.exit(deployExitCode);
}

try {
  const regionArgs = region ? ["--region", region] : [];
  testExitCode = run("node", [
    "--import",
    "tsx",
    "--test",
    "integration-tests/**/*.test.ts",
    "--stack",
    stackName,
    ...regionArgs,
  ]);
} finally {
  console.log(`\nTearing down stack "${stackName}" (deploy/test lifecycle finished)...`);
  const destroyExitCode = run("npx", ["cdk", "destroy", stackName, "--force"]);
  if (destroyExitCode !== 0) {
    console.error(
      `WARNING: cdk destroy exited with code ${destroyExitCode}. Manually verify stack "${stackName}" was removed to avoid ongoing AWS charges.`
    );
  }
}

process.exit(testExitCode);
