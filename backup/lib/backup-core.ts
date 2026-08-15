import type { BackupSummary } from '@aws-sdk/client-dynamodb';
import {
    CreateBackupCommand,
    DeleteBackupCommand,
    DescribeBackupCommand,
    DescribeTableCommand,
    DynamoDBClient,
    ListBackupsCommand,
    ResourceNotFoundException,
    RestoreTableFromBackupCommand,
} from '@aws-sdk/client-dynamodb';
import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';

export type { BackupSummary };

const BACKUP_NAME_PREFIX = 'crossbox-gym-';

export interface TaggedTable {
  tableName: string;
  tableArn: string;
}

function tableNameFromArn(arn: string): string {
  const match = /table\/([^/]+)$/.exec(arn);
  if (!match) throw new Error(`Unexpected DynamoDB table ARN: ${arn}`);
  return match[1];
}

function timestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Discovers DynamoDB tables tagged `crossbox-gym-backup=true`. */
export async function discoverTaggedTables(
  taggingClient: ResourceGroupsTaggingAPIClient,
): Promise<TaggedTable[]> {
  const tagFilters = [{ Key: 'crossbox-gym-backup', Values: ['true'] }];

  const tables: TaggedTable[] = [];
  let paginationToken: string | undefined;
  do {
    const res = await taggingClient.send(
      new GetResourcesCommand({
        ResourceTypeFilters: ['dynamodb:table'],
        TagFilters: tagFilters,
        PaginationToken: paginationToken,
      })
    );
    for (const mapping of res.ResourceTagMappingList ?? []) {
      if (!mapping.ResourceARN) continue;
      tables.push({ tableArn: mapping.ResourceARN, tableName: tableNameFromArn(mapping.ResourceARN) });
    }
    paginationToken = res.PaginationToken || undefined;
  } while (paginationToken);

  return tables;
}

export function buildBackupName(tableName: string, now = new Date()): string {
  return `${BACKUP_NAME_PREFIX}${tableName}-${timestamp(now)}`;
}

export async function createBackupForTable(
  client: DynamoDBClient,
  tableName: string,
  maxRetries = 10
): Promise<{ backupArn: string; backupName: string }> {
  const backupName = buildBackupName(tableName);
  let attempt = 0;
  while (true) {
    try {
      const res = await client.send(new CreateBackupCommand({ TableName: tableName, BackupName: backupName }));
      const backupArn = res.BackupDetails?.BackupArn;
      if (!backupArn) throw new Error(`CreateBackup for "${tableName}" did not return a BackupArn`);
      return { backupArn, backupName };
    } catch (error: any) {
      const isEnablingBackups =
        error?.name === 'ContinuousBackupsUnavailableException' ||
        error?.__type?.endsWith('ContinuousBackupsUnavailableException') ||
        error?.message?.includes('ContinuousBackupsUnavailableException') ||
        error?.message?.includes('Backups are being enabled');

      if (isEnablingBackups && attempt < maxRetries) {
        attempt++;
        await sleep(3000);
        continue;
      }
      throw error;
    }
  }
}

/** Lists only backups created by this project (name prefix `crossbox-gym-`), across all pages. */
export async function listBackupsForTable(client: DynamoDBClient, tableName: string): Promise<BackupSummary[]> {
  const summaries: BackupSummary[] = [];
  let exclusiveStartBackupArn: string | undefined;
  do {
    const res = await client.send(
      new ListBackupsCommand({ TableName: tableName, ExclusiveStartBackupArn: exclusiveStartBackupArn })
    );
    summaries.push(...(res.BackupSummaries ?? []));
    exclusiveStartBackupArn = res.LastEvaluatedBackupArn;
  } while (exclusiveStartBackupArn);

  return summaries.filter((b) => b.BackupName?.startsWith(BACKUP_NAME_PREFIX));
}

/** Pure retention rule: which of this project's backups are older than the retention window. */
export function selectBackupsToDelete(backups: BackupSummary[], retentionDays: number, now = new Date()): BackupSummary[] {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return backups.filter(
    (b) => b.BackupName?.startsWith(BACKUP_NAME_PREFIX) && (b.BackupCreationDateTime?.getTime() ?? 0) < cutoff
  );
}

export async function deleteBackups(
  client: DynamoDBClient,
  backups: BackupSummary[]
): Promise<{ deleted: string[]; failed: { backupArn: string; error: string }[] }> {
  const deleted: string[] = [];
  const failed: { backupArn: string; error: string }[] = [];
  for (const backup of backups) {
    if (!backup.BackupArn) continue;
    try {
      await client.send(new DeleteBackupCommand({ BackupArn: backup.BackupArn }));
      deleted.push(backup.BackupArn);
    } catch (error) {
      failed.push({ backupArn: backup.BackupArn, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { deleted, failed };
}

export async function findMostRecentCompletedBackup(
  client: DynamoDBClient,
  tableName: string
): Promise<BackupSummary | undefined> {
  const backups = await listBackupsForTable(client, tableName);
  const completed = backups.filter((b) => b.BackupStatus === 'AVAILABLE');
  completed.sort((a, b) => (b.BackupCreationDateTime?.getTime() ?? 0) - (a.BackupCreationDateTime?.getTime() ?? 0));
  return completed[0];
}

async function tableExists(client: DynamoDBClient, tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) return false;
    throw error;
  }
}

export function buildRestoredTableName(tableName: string, now = new Date()): string {
  return `${tableName}-restore-${timestamp(now)}`;
}

/** Restores a table into a new, timestamped table name; refuses to overwrite an existing table. */
export async function restoreTableFromBackup(
  client: DynamoDBClient,
  tableName: string,
  backupArn?: string
): Promise<{ newTableName: string; backupArn: string }> {
  const resolvedBackupArn = backupArn ?? (await findMostRecentCompletedBackup(client, tableName))?.BackupArn;
  if (!resolvedBackupArn) {
    throw new Error(`No completed backup found for table "${tableName}"`);
  }

  const newTableName = buildRestoredTableName(tableName);
  if (await tableExists(client, newTableName)) {
    throw new Error(`Refusing to overwrite existing table "${newTableName}"`);
  }

  await client.send(new RestoreTableFromBackupCommand({ TargetTableName: newTableName, BackupArn: resolvedBackupArn }));
  return { newTableName, backupArn: resolvedBackupArn };
}

export async function waitForTableActive(client: DynamoDBClient, tableName: string, timeoutMs = 5 * 60 * 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await client.send(new DescribeTableCommand({ TableName: tableName }));
    if (res.Table?.TableStatus === 'ACTIVE') return;
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for table "${tableName}" to become ACTIVE`);
}

export async function waitForBackupCompleted(client: DynamoDBClient, backupArn: string, timeoutMs = 2 * 60 * 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await client.send(new DescribeBackupCommand({ BackupArn: backupArn }));
    const status = res.BackupDescription?.BackupDetails?.BackupStatus;
    if (status === 'AVAILABLE') return;
    if (status === 'DELETED') throw new Error(`Backup "${backupArn}" was deleted before completing`);
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for backup "${backupArn}" to complete`);
}
