/**
 * Resolves CloudFormation stack outputs for a deployed stack.
 *
 * Usage in integration tests:
 *   import { getStackOutputs, requireOutput } from "./lib/stack-outputs";
 *
 *   const apiUrl = await requireOutput("ApiUrl");
 *   const table = await requireOutput("MainTableName");
 */

import {
  CloudFormationClient,
  DescribeStacksCommand,
  type Output,
} from "@aws-sdk/client-cloudformation";
import * as fs from "fs";
import * as path from "path";

export type StackOutputs = Record<string, string>;

const cache = new Map<string, StackOutputs>();

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function resolveStackName(): string {
  const stackName = argValue("--stack") ?? process.env.STACK_NAME ?? "CrossboxGymDev";
  if (!stackName) {
    throw new Error(
      "Missing stack name. Pass --stack <StackName> or set STACK_NAME env var."
    );
  }
  return stackName;
}

function resolveRegion(): string {
  return argValue("--region") ?? process.env.AWS_REGION ?? "eu-central-1";
}

/** Fetches and caches all CfnOutput values for the target stacks. */
export async function getStackOutputs(): Promise<StackOutputs> {
  const stackName = resolveStackName();
  const region = resolveRegion();
  const cacheKey = `${stackName}@${region}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 1. Try reading local cdk-outputs.json first
  try {
    const outputsPath = path.join(__dirname, "../../cdk-outputs.json");
    if (fs.existsSync(outputsPath)) {
      const data = JSON.parse(fs.readFileSync(outputsPath, "utf8"));
      let merged: StackOutputs = {};
      for (const key of Object.keys(data)) {
        merged = { ...merged, ...data[key] };
      }
      if (Object.keys(merged).length > 0) {
        cache.set(cacheKey, merged);
        return merged;
      }
    }
  } catch (e) {
    // Fall back to CloudFormation SDK
  }

  // 2. Query CloudFormation API for stack outputs
  const cfn = new CloudFormationClient({ region });
  const prefix = stackName.replace(/Stack$/, "");
  const possibleStackNames = [
    `${prefix}FrontendStack`,
    `${prefix}ApiStack`,
    `${prefix}DataStack`,
    stackName,
  ];

  let result: StackOutputs = {};
  let foundAny = false;

  for (const name of possibleStackNames) {
    try {
      const { Stacks } = await cfn.send(
        new DescribeStacksCommand({ StackName: name })
      );
      const stack = Stacks?.[0];
      if (stack && stack.Outputs) {
        foundAny = true;
        for (const o of stack.Outputs) {
          if (o.OutputKey && o.OutputValue) {
            result[o.OutputKey] = o.OutputValue;
          }
        }
      }
    } catch {
      // Ignore individual stack describe failures
    }
  }

  if (!foundAny || Object.keys(result).length === 0) {
    throw new Error(
      `No active stacks or stack outputs found for "${prefix}" in region ${region}. Run 'npm run deploy' first.`
    );
  }

  cache.set(cacheKey, result);
  return result;
}

/** Fetches a single required output, throwing a clear error if missing. */
export async function requireOutput(key: string): Promise<string> {
  const outputs = await getStackOutputs();
  const value = outputs[key];
  if (!value) {
    throw new Error(
      `Stack output "${key}" not found. Available outputs: ${Object.keys(outputs).join(", ")}`
    );
  }
  return value;
}
