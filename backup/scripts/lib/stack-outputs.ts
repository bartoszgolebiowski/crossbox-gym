import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import * as fs from 'fs';
import * as path from 'path';
import { validateBackupScriptsEnv } from './env';

export type StackOutputs = Record<string, string>;

let cached: StackOutputs | undefined;

function setCache(outputs: StackOutputs): StackOutputs {
  cached = outputs;
  return cached;
}

/** Reads backup/cdk-outputs.json first (fast path), falling back to a live CloudFormation lookup. */
export async function getBackupStackOutputs(): Promise<StackOutputs> {
  if (cached) return cached;

  const env = validateBackupScriptsEnv(process.env);

  const outputsPath = path.join(__dirname, '..', '..', 'cdk-outputs.json');
  if (fs.existsSync(outputsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
      const stackOutputs = data[env.STACK_NAME];
      if (stackOutputs) {
        return setCache(stackOutputs);
      }
    } catch (e) {
      // Fall back to CloudFormation
    }
  }

  const cfn = new CloudFormationClient({ region: env.AWS_REGION });
  const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: env.STACK_NAME }));
  const outputs: StackOutputs = {};
  for (const output of Stacks?.[0]?.Outputs ?? []) {
    if (output.OutputKey && output.OutputValue) outputs[output.OutputKey] = output.OutputValue;
  }
  return setCache(outputs);
}
