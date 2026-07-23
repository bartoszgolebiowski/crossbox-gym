/**
 * Resolves CloudFormation stack outputs for a deployed CDK stack, so integration tests never
 * hardcode resource identifiers (API URLs, table names, queue URLs, ARNs, etc.).
 *
 * Usage:
 *   const outputs = await getStackOutputs();
 *   const apiUrl = outputs.ApiBaseUrl;
 *
 * Stack name / region resolution order: --stack / --region CLI flags, then STACK_NAME /
 * AWS_REGION env vars. Throws if neither is provided, or if the stack/output is missing.
 */
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function resolveStackName(): string {
  const stackName = argValue("--stack") ?? process.env.STACK_NAME;
  if (!stackName) {
    throw new Error(
      "Missing stack name. Pass --stack <StackName> or set STACK_NAME env var."
    );
  }
  return stackName;
}

function resolveRegion(): string | undefined {
  return argValue("--region") ?? process.env.AWS_REGION;
}

let cachedOutputs: Record<string, string> | undefined;

/** Fetches (and caches for the process lifetime) all CfnOutputs of the target stack. */
export async function getStackOutputs(): Promise<Record<string, string>> {
  if (cachedOutputs) return cachedOutputs;

  const stackName = resolveStackName();
  const region = resolveRegion();
  const client = new CloudFormationClient({ region });

  const result = await client.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = result.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack "${stackName}" not found in region ${region ?? "(default)"}.`);
  }

  const outputs: Record<string, string> = {};
  for (const output of stack.Outputs ?? []) {
    if (output.OutputKey && output.OutputValue) {
      outputs[output.OutputKey] = output.OutputValue;
    }
  }

  cachedOutputs = outputs;
  return outputs;
}

/** Fetches a single required output, throwing a clear error if it's missing. */
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
