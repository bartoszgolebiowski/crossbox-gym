import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { parseArgs } from 'node:util';
import { discoverTaggedTables, listBackupsForTable } from '../lib/backup-core';
import { validateBackupScriptsEnv } from './lib/env';

async function main() {
  const { values } = parseArgs({ options: { table: { type: 'string' } }, strict: false });
  const env = validateBackupScriptsEnv(process.env);

  const ddb = new DynamoDBClient({ region: env.AWS_REGION });
  const tagging = new ResourceGroupsTaggingAPIClient({ region: env.AWS_REGION });

  const tableNames =
    typeof values.table === 'string'
      ? [values.table]
      : (await discoverTaggedTables(tagging)).map((t) => t.tableName);

  if (tableNames.length === 0) {
    console.log('No tagged tables found.');
    return;
  }

  for (const tableName of tableNames) {
    const backups = await listBackupsForTable(ddb, tableName);
    backups.sort((a, b) => (b.BackupCreationDateTime?.getTime() ?? 0) - (a.BackupCreationDateTime?.getTime() ?? 0));

    console.log(`\n${tableName} (${backups.length} backup${backups.length === 1 ? '' : 's'}):`);
    for (const backup of backups) {
      console.log(
        `  ${backup.BackupName}  ${backup.BackupStatus}  ${backup.BackupCreationDateTime?.toISOString()}  ${backup.BackupArn}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
