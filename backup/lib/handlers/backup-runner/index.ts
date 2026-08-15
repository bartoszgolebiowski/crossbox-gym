import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { z } from 'zod';
import { createBackupForTable, deleteBackups, discoverTaggedTables, listBackupsForTable, selectBackupsToDelete } from '../../backup-core';

const backupRunnerEnvironmentSchema = z.object({
  BACKUP_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
});

export interface BackupRunnerEvent {
  /** Explicit table names to back up; when omitted, discovers all tagged tables. */
  tableNames?: string[];
}

export interface BackupRunnerResult {
  backedUp: { tableName: string; backupArn: string }[];
  failed: { tableName: string; error: string }[];
  deleted: string[];
}

const ddb = new DynamoDBClient({});
const tagging = new ResourceGroupsTaggingAPIClient({});

export async function handler(event: BackupRunnerEvent = {}): Promise<BackupRunnerResult> {
  const env = backupRunnerEnvironmentSchema.parse(process.env);

  const tableNames = event.tableNames?.length
    ? event.tableNames
    : (await discoverTaggedTables(tagging)).map((t) => t.tableName);

  const result: BackupRunnerResult = { backedUp: [], failed: [], deleted: [] };

  for (const tableName of tableNames) {
    try {
      const { backupArn } = await createBackupForTable(ddb, tableName);
      result.backedUp.push({ tableName, backupArn });
    } catch (error) {
      console.error(`[backup-runner] Failed to back up "${tableName}":`, error);
      result.failed.push({ tableName, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Retention cleanup runs independently per table so one failure doesn't block the others.
  for (const tableName of tableNames) {
    try {
      const backups = await listBackupsForTable(ddb, tableName);
      const toDelete = selectBackupsToDelete(backups, env.BACKUP_RETENTION_DAYS);
      const { deleted, failed } = await deleteBackups(ddb, toDelete);
      result.deleted.push(...deleted);
      for (const f of failed) {
        console.error(`[backup-runner] Failed to delete backup "${f.backupArn}":`, f.error);
      }
    } catch (error) {
      console.error(`[backup-runner] Failed to process retention for "${tableName}":`, error);
    }
  }

  return result;
}
