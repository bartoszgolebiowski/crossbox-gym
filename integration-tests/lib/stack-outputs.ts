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

export type StackOutputs = Record<string, string>;

const cache = new Map<string, StackOutputs>();

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function resolveStackName(): string {
  const stackName = argValue("--stack") ?? process.env.STACK_NAME ?? "CrossboxGymStack";
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

/** Fetches and caches all CfnOutput values for the target stack. */
export async function getStackOutputs(): Promise<StackOutputs> {
  const stackName = resolveStackName();
  const region = resolveRegion();
  const cacheKey = `${stackName}@${region}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const cfn = new CloudFormationClient({ region });
  const { Stacks } = await cfn.send(
    new DescribeStacksCommand({ StackName: stackName })
  );

  const stack = Stacks?.[0];
  if (!stack) {
    throw new Error(
      `Stack "${stackName}" not found in ${region}. Has 'cdk deploy ${stackName}' been run?`
    );
  }

  const outputs: Output[] = stack.Outputs ?? [];
  if (outputs.length === 0) {
    throw new Error(
      `Stack "${stackName}" exists but has no outputs.`
    );
  }

  const result: StackOutputs = {};
  for (const o of outputs) {
    if (o.OutputKey && o.OutputValue) {
      result[o.OutputKey] = o.OutputValue;
    }
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
