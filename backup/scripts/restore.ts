import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { restoreTableFromBackup, waitForTableActive } from '../lib/backup-core';
import { validateBackupScriptsEnv } from './lib/env';

async function main() {
  const [tableName, backupArn] = process.argv.slice(2);
  if (!tableName) {
    console.error('Usage: tsx scripts/restore.ts <table-name> [backup-arn]');
    process.exitCode = 1;
    return;
  }

  const env = validateBackupScriptsEnv(process.env);
  const ddb = new DynamoDBClient({ region: env.AWS_REGION });

  console.log(`Restoring "${tableName}"${backupArn ? ` from ${backupArn}` : ' from its most recent backup'}...`);
  const { newTableName, backupArn: usedBackupArn } = await restoreTableFromBackup(ddb, tableName, backupArn);

  console.log(`Restore started -> new table "${newTableName}" (from backup ${usedBackupArn}). Waiting for it to become ACTIVE...`);
  await waitForTableActive(ddb, newTableName);

  console.log(`\n✅ Restored table ready: ${newTableName}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
