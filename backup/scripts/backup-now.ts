import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { parseArgs } from 'node:util';
import { validateBackupScriptsEnv } from './lib/env';
import { getBackupStackOutputs } from './lib/stack-outputs';

async function main() {
  const { values } = parseArgs({
    options: { table: { type: 'string', multiple: true } },
    strict: false,
  });

  const env = validateBackupScriptsEnv(process.env);
  const outputs = await getBackupStackOutputs();
  const functionName = outputs.BackupRunnerFunctionName;
  if (!functionName) {
    throw new Error('BackupRunnerFunctionName not found in stack outputs. Run "npm run deploy" first.');
  }

  const payload = values.table?.length ? { tableNames: values.table } : {};
  console.log(`Invoking ${functionName} with payload:`, payload);

  const lambda = new LambdaClient({ region: env.AWS_REGION });
  const res = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    })
  );

  const responsePayload = res.Payload ? Buffer.from(res.Payload).toString('utf8') : '';
  if (res.FunctionError) {
    console.error(`Lambda returned an error: ${res.FunctionError}`);
    console.error(responsePayload);
    process.exitCode = 1;
    return;
  }

  console.log('Result:', JSON.stringify(JSON.parse(responsePayload || '{}'), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
