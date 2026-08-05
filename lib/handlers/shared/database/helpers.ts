import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ScannerItem } from '../access/types';
import { ConfigItem, SubscriptionItem, UserItem } from '../types';
import { ddb } from './client';

/** Helper to fetch user profile by user_id */
export async function getUserProfile(tableName: string, userId: string): Promise<UserItem | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
    })
  );
  return result.Item as UserItem | undefined;
}

/** Helper to fetch user's primary subscription */
export async function getUserSubscription(tableName: string, userId: string): Promise<SubscriptionItem | undefined> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'SUB#',
      },
    })
  );
  return result.Items?.[0] as SubscriptionItem | undefined;
}

/** Helper to look up a registered scanner by scanner_id. */
export async function getScannerById(tableName: string, scannerId: string): Promise<ScannerItem | undefined> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'DeviceIdIndex',
      KeyConditionExpression: 'device_id = :deviceId',
      ExpressionAttributeValues: { ':deviceId': scannerId },
    })
  );
  const scanner = result.Items?.find((item) => String(item.SK).startsWith('SCANNER#')) as ScannerItem | undefined;
  return scanner?.status === 'active' ? scanner : undefined;
}

/** Helper to get config item by key */
export async function getConfigItem(tableName: string, configKey: string): Promise<string | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `CONFIG#${configKey}`, SK: 'CONFIG' },
    })
  );
  return (result.Item as ConfigItem | undefined)?.value;
}
