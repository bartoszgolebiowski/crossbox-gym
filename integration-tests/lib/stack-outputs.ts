/**
 * Resolves CloudFormation stack outputs for a deployed stack.
 *
 * Usage in integration tests:
 *   import { getStackOutputs, requireOutput } from "./lib/stack-outputs";
 *
 *   const apiUrl = await requireOutput("ApiUrl");
 *   const table = await requireOutput("MainTableName");
 */

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import * as fs from 'fs';
import * as path from 'path';
import { resolveIntegrationTestEnv } from './env';

export type StackOutputs = Record<string, string>;

const cache = new Map<string, StackOutputs>();

function resolveStackName(): string {
  const { STACK_NAME } = resolveIntegrationTestEnv();
  if (!STACK_NAME) {
    throw new Error('Missing stack name. Pass --stack <StackName> or set STACK_NAME env var.');
  }
  return STACK_NAME;
}

function resolveRegion(): string {
  const { AWS_REGION } = resolveIntegrationTestEnv();
  return AWS_REGION;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; message?: string };
  const retryableNames = ['ThrottlingException', 'TooManyRequestsException', 'TimeoutError', 'RequestTimeout'];
  if (retryableNames.includes(e.name ?? '')) return true;
  const message = (e.message ?? '').toLowerCase();
  return message.includes('throttling') || message.includes('rate exceeded') || message.includes('timeout');
}

async function describeStackWithRetry(
  cfn: CloudFormationClient,
  stackName: string,
  maxAttempts = 3
): Promise<import('@aws-sdk/client-cloudformation').Stack | undefined> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
      return Stacks?.[0];
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && isRetryableError(error)) {
        console.warn(`[stack-outputs] DescribeStacks ${stackName} throttled, retrying (${attempt}/${maxAttempts})...`);
        await sleep(2 ** attempt * 250);
      } else {
        break;
      }
    }
  }
  console.warn(`[stack-outputs] Failed to describe stack ${stackName}:`, lastError);
  return undefined;
}

/** Fetches and caches all CfnOutput values for the target stacks. */
export async function getStackOutputs(): Promise<StackOutputs> {
  const stackName = resolveStackName();
  const region = resolveRegion();
  const cacheKey = `${stackName}@${region}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 1. Try reading local cdk-outputs.json first
  let merged: StackOutputs = {};
  try {
    const outputsPath = path.join(__dirname, '../../cdk-outputs.json');
    if (fs.existsSync(outputsPath)) {
      const data = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
      for (const key of Object.keys(data)) {
        merged = { ...merged, ...data[key] };
      }
    }
  } catch (e) {
    // Fall back to CloudFormation SDK
  }

  if (!merged.ApiUrl && merged.ExportsOutputFnGetAttHttpApiF5A9A8A7ApiEndpoint082134F8) {
    merged.ApiUrl = merged.ExportsOutputFnGetAttHttpApiF5A9A8A7ApiEndpoint082134F8;
  }
  if (!merged.UserPoolId && merged.ExportsOutputRefUserPool6BA7E5F296FD7236) {
    merged.UserPoolId = merged.ExportsOutputRefUserPool6BA7E5F296FD7236;
  }
  if (!merged.UserPoolClientId && merged.ExportsOutputRefUserPoolClient2F5918F753847A55) {
    merged.UserPoolClientId = merged.ExportsOutputRefUserPoolClient2F5918F753847A55;
  }
  if (!merged.MainTableName && merged.ExportsOutputRefMainTable74195DAB4503BD7E) {
    merged.MainTableName = merged.ExportsOutputRefMainTable74195DAB4503BD7E;
  }
  if (!merged.EntryLogsTableName && merged.ExportsOutputRefEntryLogs619EADFEEEBA8359) {
    merged.EntryLogsTableName = merged.ExportsOutputRefEntryLogs619EADFEEEBA8359;
  }
  if (!merged.AuditLogsTableName && merged.ExportsOutputRefAuditLogsB945E340FCD35647) {
    merged.AuditLogsTableName = merged.ExportsOutputRefAuditLogsB945E340FCD35647;
  }
  if (!merged.UnlockQueueUrl && merged.ExportsOutputRefUnlockQueue18021AA5E426E411) {
    merged.UnlockQueueUrl = merged.ExportsOutputRefUnlockQueue18021AA5E426E411;
  }
  if (!merged.UnlockOutboxDispatcherFunctionName && merged.ExportsOutputRefUnlockOutboxDispatcherC1739C5034016AEF) {
    merged.UnlockOutboxDispatcherFunctionName = merged.ExportsOutputRefUnlockOutboxDispatcherC1739C5034016AEF;
  }
  if (!merged.VerifyEntryFunctionName && merged.ExportsOutputFnGetAttVerifyEntryACD6A33CArnA9006F02) {
    merged.VerifyEntryFunctionName = merged.ExportsOutputFnGetAttVerifyEntryACD6A33CArnA9006F02;
  }

  const prefix = stackName.replace(/Stack$/, '');

  // 2. Query CloudFormation API if required outputs are missing
  if (
    !merged.ApiUrl ||
    !merged.UserPoolId ||
    !merged.MainTableName ||
    !merged.SecretNameOutput ||
    !merged.AppCloudFrontUrl
  ) {
    const cfn = new CloudFormationClient({ region });
    const possibleStackNames = [
      `${prefix}FrontendStack`,
      `${prefix}ApiStack`,
      `${prefix}DataStack`,
      `${prefix}IotStack`,
    ];
    // Only query the literal stackName if it looks like a real stack
    if (stackName.endsWith('Stack')) {
      possibleStackNames.push(stackName);
    }

    for (const name of possibleStackNames) {
      const stack = await describeStackWithRetry(cfn, name);
      if (stack && stack.Outputs) {
        for (const o of stack.Outputs) {
          if (o.OutputKey && o.OutputValue) {
            merged[o.OutputKey] = o.OutputValue;
          }
        }
      }
    }
  }

  if (Object.keys(merged).length === 0) {
    throw new Error(
      `No active stacks or stack outputs found for "${prefix}" in region ${region}. Run 'npm run deploy' first.`
    );
  }

  cache.set(cacheKey, merged);
  return merged;
}

/** Fetches a single required output, throwing a clear error if missing. */
export async function requireOutput(key: string): Promise<string> {
  const outputs = await getStackOutputs();
  const value = outputs[key];
  if (!value) {
    throw new Error(`Stack output "${key}" not found. Available outputs: ${Object.keys(outputs).join(', ')}`);
  }
  return value;
}
