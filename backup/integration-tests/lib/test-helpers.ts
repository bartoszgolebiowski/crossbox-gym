import {
    CreateTableCommand,
    DeleteTableCommand,
    DescribeTableCommand,
    DynamoDBClient,
    ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { ResourceGroupsTaggingAPIClient, TagResourcesCommand } from '@aws-sdk/client-resource-groups-tagging-api';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

export interface DisposableTestTable {
  tableName: string;
  tableArn: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Creates a small standalone table tagged for backup discovery, isolated from real app/admin data. */
export async function createTaggedTestTable(
  ddb: DynamoDBClient,
  tagging: ResourceGroupsTaggingAPIClient
): Promise<DisposableTestTable> {
  const tableName = `crossbox-gym-backup-itest-${Date.now()}`;

  const { TableDescription } = await ddb.send(
    new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [{ AttributeName: 'PK', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
    })
  );

  const tableArn = TableDescription?.TableArn;
  if (!tableArn) throw new Error(`CreateTable for "${tableName}" did not return a TableArn`);

  await waitForTableActive(ddb, tableName);

  await tagging.send(
    new TagResourcesCommand({
      ResourceARNList: [tableArn],
      Tags: {
        'crossbox-gym-backup': 'true',
        'crossbox-gym-table': 'ItestTable',
        'crossbox-gym-project': 'crossbox-gym',
      },
    })
  );

  return { tableName, tableArn };
}

export async function waitForTableActive(ddb: DynamoDBClient, tableName: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await ddb.send(new DescribeTableCommand({ TableName: tableName }));
    if (res.Table?.TableStatus === 'ACTIVE') return;
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for table "${tableName}" to become ACTIVE`);
}

export async function seedItems(
  doc: DynamoDBDocumentClient,
  tableName: string,
  items: Record<string, unknown>[]
): Promise<void> {
  for (const item of items) {
    await doc.send(new PutCommand({ TableName: tableName, Item: item }));
  }
}

export async function scanAllItems(doc: DynamoDBDocumentClient, tableName: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey: exclusiveStartKey }));
    items.push(...(res.Items ?? []));
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

export async function deleteTableIfExists(ddb: DynamoDBClient, tableName: string): Promise<void> {
  try {
    await ddb.send(new DeleteTableCommand({ TableName: tableName }));
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
  }
}
