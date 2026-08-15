import { DeleteBackupCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { BackupSummary } from '../lib/backup-core';
import {
    findMostRecentCompletedBackup,
    restoreTableFromBackup,
    waitForBackupCompleted,
    waitForTableActive,
} from '../lib/backup-core';
import { validateBackupScriptsEnv } from '../scripts/lib/env';
import { getBackupStackOutputs } from '../scripts/lib/stack-outputs';
import { createTaggedTestTable, deleteTableIfExists, scanAllItems, seedItems } from './lib/test-helpers';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollForBackup(ddb: DynamoDBClient, tableName: string, timeoutMs = 60_000): Promise<BackupSummary | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const backup = await findMostRecentCompletedBackup(ddb, tableName);
    if (backup) return backup;
    await sleep(3000);
  }
  return undefined;
}

describe('DynamoDB backup + restore', () => {
  const env = validateBackupScriptsEnv(process.env);
  const ddb = new DynamoDBClient({ region: env.AWS_REGION });
  const doc = DynamoDBDocumentClient.from(ddb);
  const tagging = new ResourceGroupsTaggingAPIClient({ region: env.AWS_REGION });
  const lambda = new LambdaClient({ region: env.AWS_REGION });

  const seededItems = [
    { PK: 'ITEM#1', value: 'alpha' },
    { PK: 'ITEM#2', value: 'beta' },
  ];

  let testTableName: string;
  let restoredTableName: string | undefined;
  let backupArn: string | undefined;

  before(async () => {
    const table = await createTaggedTestTable(ddb, tagging);
    testTableName = table.tableName;
    await seedItems(doc, testTableName, seededItems);
  });

  after(async () => {
    if (backupArn) await ddb.send(new DeleteBackupCommand({ BackupArn: backupArn })).catch(() => undefined);
    if (restoredTableName) await deleteTableIfExists(ddb, restoredTableName);
    if (testTableName) await deleteTableIfExists(ddb, testTableName);
  });

  test('backs up a tagged table, restores it, and preserves its data', async () => {
    const outputs = await getBackupStackOutputs();
    const functionName = outputs.BackupRunnerFunctionName;
    assert.ok(functionName, 'Expected BackupRunnerFunctionName in stack outputs; run "npm run deploy" first.');

    // Target only the disposable test table so real dev tables are never touched by this test.
    const invokeRes = await lambda.send(
      new InvokeCommand({
        FunctionName: functionName!,
        Payload: Buffer.from(JSON.stringify({ tableNames: [testTableName] })),
      })
    );
    assert.equal(invokeRes.FunctionError, undefined, 'Backup runner invocation should not throw');

    const backup = await pollForBackup(ddb, testTableName);
    assert.ok(backup?.BackupArn, 'Expected a backup to have been created for the test table');
    backupArn = backup!.BackupArn!;
    await waitForBackupCompleted(ddb, backupArn);

    const restored = await restoreTableFromBackup(ddb, testTableName, backupArn);
    restoredTableName = restored.newTableName;
    await waitForTableActive(ddb, restoredTableName);

    const restoredItems = await scanAllItems(doc, restoredTableName);
    assert.deepEqual(
      restoredItems.map((i) => i.PK).sort(),
      seededItems.map((i) => i.PK).sort()
    );

    const originalItems = await scanAllItems(doc, testTableName);
    assert.equal(originalItems.length, seededItems.length, 'Original table must be untouched by the restore');
  });
});
