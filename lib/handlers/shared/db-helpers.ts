import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './ddb-client';
import { UserItem, SubscriptionItem, DeviceItem, ConfigItem } from './types';

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

/** Helper to get config item by key */
export async function getConfigItem(tableName: string, configKey: string): Promise<string | undefined> {
  const result = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: { PK: `CONFIG#${configKey}`, SK: 'CONFIG' }
  }));
  return (result.Item as ConfigItem | undefined)?.value;
}
