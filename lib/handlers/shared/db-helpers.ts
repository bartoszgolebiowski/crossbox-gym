import { GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { LockerItem, ScannerItem } from './access-types';
import { ddb } from './ddb-client';
import { ConfigItem, DeviceItem, SubscriptionItem, UserItem } from './types';

/** Helper to fetch user profile by user_id */
export async function getUserProfile(tableName: string, userId: string): Promise<UserItem | undefined> {
  const result = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' }
  }));
  return result.Item as UserItem | undefined;
}

/** Helper to fetch user's primary subscription */
export async function getUserSubscription(tableName: string, userId: string): Promise<SubscriptionItem | undefined> {
  const result = await ddb.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'SUB#'
    }
  }));
  return result.Items?.[0] as SubscriptionItem | undefined;
}

/** Helper to look up active device by API key hash */
export async function getDeviceByApiKey(tableName: string, apiKeyHash: string): Promise<DeviceItem | undefined> {
  const result = await ddb.send(new QueryCommand({
    TableName: tableName,
    IndexName: 'ApiKeyIndex',
    KeyConditionExpression: 'api_key_hash = :hash',
    ExpressionAttributeValues: { ':hash': apiKeyHash }
  }));
  return result.Items?.[0] as DeviceItem | undefined;
}

/** Helper to look up a registered scanner through the existing API-key index. */
export async function getScannerByApiKey(tableName: string, apiKeyHash: string): Promise<ScannerItem | undefined> {
  const result = await ddb.send(new QueryCommand({
    TableName: tableName,
    IndexName: 'ApiKeyIndex',
    KeyConditionExpression: 'api_key_hash = :hash',
    ExpressionAttributeValues: { ':hash': apiKeyHash },
  }));
  const scanner = result.Items?.find((item) => String(item.SK).startsWith('SCANNER#')) as ScannerItem | undefined;
  return scanner?.status === 'active' ? scanner : undefined;
}

/** Helper to look up a registered scanner by scanner_id. */
export async function getScannerById(tableName: string, scannerId: string): Promise<ScannerItem | undefined> {
  const result = await ddb.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: 'scanner_id = :sid AND #status = :status',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':sid': scannerId, ':status': 'active' },
    Limit: 1,
  }));
  return result.Items?.[0] as ScannerItem | undefined;
}

/** Helper to retrieve a locker only from the authenticated scanner's location. */
export async function getLocker(tableName: string, locationId: string, lockerId: string): Promise<LockerItem | undefined> {
  const result = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: { PK: `LOC#${locationId}`, SK: `LOCKER#${lockerId}` },
  }));
  const locker = result.Item as LockerItem | undefined;
  return locker?.status === 'active' ? locker : undefined;
}

/** Helper to get config item by key */
export async function getConfigItem(tableName: string, configKey: string): Promise<string | undefined> {
  const result = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: { PK: `CONFIG#${configKey}`, SK: 'CONFIG' }
  }));
  return (result.Item as ConfigItem | undefined)?.value;
}
