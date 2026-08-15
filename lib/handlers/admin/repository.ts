import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

export interface CreateLocationParams {
  locationId: string;
  name: string;
  address: string;
  createdAt: string;
}

export interface UpdateLocationParams {
  locationId: string;
  name: string;
  address: string;
}

export interface CreateDeviceParams {
  locationId: string;
  deviceId: string;
  name: string;
  type: string;
  connectionParams: Record<string, unknown>;
  status: string;
  createdAt: string;
}

export interface ActivityItem {
  result: string;
  timestamp: string;
  scanner_id?: string;
  locker_id?: string;
  device_id?: string;
  [key: string]: unknown;
}

export interface ActivityPaginationOptions {
  limit?: number;
  nextToken?: string;
}

export interface ActivityAggregation {
  location_id: string;
  total_count: number;
  success_count: number;
  denied_count: number;
  hourly_stats: Record<string, number>;
  daily_stats: Record<string, number>;
  weekly_stats: Record<string, number>;
  items: ActivityItem[];
  next_token?: string;
  has_more: boolean;
}

export interface MemberOverrideParams {
  userId: string;
  status: string;
  gracePeriodEnd: string | null;
  subscriptionSk: string;
}

export interface AdminRepository {
  listLocations(): Promise<Record<string, unknown>[]>;
  createLocation(params: CreateLocationParams): Promise<Record<string, unknown>>;
  updateLocation(params: UpdateLocationParams): Promise<void>;
  deleteLocation(locationId: string): Promise<void>;
  listDevices(locationId: string): Promise<Record<string, unknown>[]>;
  createDevice(params: CreateDeviceParams): Promise<Record<string, unknown>>;
  getActivity(
    locationId: string,
    scannerId?: string,
    lockerId?: string,
    options?: ActivityPaginationOptions
  ): Promise<ActivityAggregation>;
  listMembers(): Promise<Record<string, unknown>[]>;
  getMember(userId: string): Promise<Record<string, unknown>[]>;
  overrideMemberSubscription(params: MemberOverrideParams): Promise<void>;
  rotateHmacKey(currentKey: string, newKey: string): Promise<void>;
  getHmacCurrentKey(): Promise<string | undefined>;
  findMemberSubscription(userId: string): Promise<{ PK: string; SK: string } | undefined>;
  findAssignedLockerId(deviceId: string): Promise<string | undefined>;
}

export class DynamoDbAdminRepository implements AdminRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly mainTableName: string,
    private readonly entryLogsTableName: string
  ) {}

  async listLocations(): Promise<Record<string, unknown>[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.mainTableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': 'LOCATIONS' },
      })
    );
    return (result.Items || []) as Record<string, unknown>[];
  }

  async createLocation(params: CreateLocationParams): Promise<Record<string, unknown>> {
    const item = {
      PK: `LOC#${params.locationId}`,
      SK: 'METADATA',
      name: params.name,
      address: params.address,
      created_at: params.createdAt,
      GSI1PK: 'LOCATIONS',
      GSI1SK: `LOC#${params.locationId}`,
    };
    await this.client.send(new PutCommand({ TableName: this.mainTableName, Item: item }));
    return item;
  }

  async updateLocation(params: UpdateLocationParams): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.mainTableName,
        Key: { PK: `LOC#${params.locationId}`, SK: 'METADATA' },
        UpdateExpression: 'SET #name = :name, address = :address',
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: { ':name': params.name, ':address': params.address },
      })
    );
  }

  async deleteLocation(locationId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.mainTableName,
        Key: { PK: `LOC#${locationId}`, SK: 'METADATA' },
      })
    );
  }

  async listDevices(locationId: string): Promise<Record<string, unknown>[]> {
    const pk = `LOC#${locationId}`;
    const [deviceResult, scannerResult] = await Promise.all([
      this.client.send(
        new QueryCommand({
          TableName: this.mainTableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': pk, ':sk': 'DEV#' },
        })
      ),
      this.client.send(
        new QueryCommand({
          TableName: this.mainTableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': pk, ':sk': 'SCANNER#' },
        })
      ),
    ]);

    const devices = (deviceResult.Items || []) as Record<string, unknown>[];
    const scanners = (scannerResult.Items || []).map((item) => ({
      ...item,
      type: 'scanner',
      device_id: item.device_id || item.scanner_id,
    })) as Record<string, unknown>[];

    return [...devices, ...scanners];
  }

  async createDevice(params: CreateDeviceParams): Promise<Record<string, unknown>> {
    const item = {
      PK: `LOC#${params.locationId}`,
      SK: `DEV#${params.deviceId}`,
      device_id: params.deviceId,
      name: params.name,
      type: params.type,
      connection_params: params.connectionParams,
      status: params.status,
      created_at: params.createdAt,
    };
    await this.client.send(new PutCommand({ TableName: this.mainTableName, Item: item }));
    return item;
  }

  async getActivity(
    locationId: string,
    scannerId?: string,
    lockerId?: string,
    options?: ActivityPaginationOptions
  ): Promise<ActivityAggregation> {
    const pageLimit = Math.min(Math.max(options?.limit || 20, 1), 100);
    const maxEvaluated = 1000;

    let cursorSk: string | undefined;
    if (options?.nextToken) {
      try {
        const parsed = JSON.parse(Buffer.from(options.nextToken, 'base64').toString('utf8'));
        cursorSk = typeof parsed.sk === 'string' ? parsed.sk : undefined;
      } catch {
        cursorSk = undefined;
      }
    }

    const filterParts = ['(location_id = :locId OR location_id = :locPk)', 'begins_with(SK, :skPrefix)'];
    const expressionValues: Record<string, unknown> = {
      ':locId': locationId,
      ':locPk': `LOC#${locationId}`,
      ':skPrefix': 'ENTRY#',
    };

    if (cursorSk) {
      filterParts.push('SK < :cursorSk');
      expressionValues[':cursorSk'] = cursorSk;
    }

    if (scannerId && scannerId !== 'all') {
      filterParts.push('(scanner_id = :scannerId OR device_id = :scannerId)');
      expressionValues[':scannerId'] = scannerId;
    }

    if (lockerId && lockerId !== 'all') {
      filterParts.push('locker_id = :lockerId');
      expressionValues[':lockerId'] = lockerId;
    }

    const filterExpression = filterParts.join(' AND ');

    const matchedItems: ActivityItem[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    let evaluatedCount = 0;

    do {
      const batchLimit = Math.min(pageLimit * 5, maxEvaluated - evaluatedCount, 100);
      if (batchLimit <= 0) break;

      const scanResult = await this.client
        .send(
          new ScanCommand({
            TableName: this.entryLogsTableName,
            FilterExpression: filterExpression,
            ExpressionAttributeValues: expressionValues,
            Limit: batchLimit,
            ExclusiveStartKey: exclusiveStartKey,
          })
        )
        .catch(() => ({ Items: [], LastEvaluatedKey: undefined, ScannedCount: 0 }));

      const batchItems = (scanResult.Items || []) as ActivityItem[];
      evaluatedCount += scanResult.ScannedCount || 0;
      lastEvaluatedKey = scanResult.LastEvaluatedKey;
      matchedItems.push(...batchItems);

      if (matchedItems.length >= pageLimit) {
        break;
      }

      exclusiveStartKey = lastEvaluatedKey;
    } while (lastEvaluatedKey && evaluatedCount < maxEvaluated);

    matchedItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const items = matchedItems.slice(0, pageLimit);

    const hourly_stats: Record<string, number> = {};
    const daily_stats: Record<string, number> = {};
    const weekly_stats: Record<string, number> = {};
    let successCount = 0;
    let deniedCount = 0;

    for (const item of items) {
      if (item.result === 'success') successCount++;
      else deniedCount++;

      const date = new Date(item.timestamp);
      if (isNaN(date.getTime())) continue;

      const hourKey = `${date.toISOString().slice(0, 13)}:00`;
      const dayKey = date.toISOString().slice(0, 10);

      const jan1 = new Date(date.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((date.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      const weekKey = `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

      hourly_stats[hourKey] = (hourly_stats[hourKey] || 0) + 1;
      daily_stats[dayKey] = (daily_stats[dayKey] || 0) + 1;
      weekly_stats[weekKey] = (weekly_stats[weekKey] || 0) + 1;
    }

    const nextToken =
      items.length > 0
        ? Buffer.from(JSON.stringify({ sk: (items[items.length - 1].SK as string) || '' })).toString('base64')
        : undefined;

    return {
      location_id: locationId,
      total_count: items.length,
      success_count: successCount,
      denied_count: deniedCount,
      hourly_stats,
      daily_stats,
      weekly_stats,
      items,
      next_token: nextToken,
      has_more: matchedItems.length > pageLimit || (items.length === pageLimit && lastEvaluatedKey !== undefined),
    };
  }

  async listMembers(): Promise<Record<string, unknown>[]> {
    const result = await this.client.send(
      new ScanCommand({
        TableName: this.mainTableName,
        FilterExpression: 'begins_with(PK, :userPrefix) AND SK = :profile',
        ExpressionAttributeValues: { ':userPrefix': 'USER#', ':profile': 'PROFILE' },
      })
    );
    return (result.Items || []) as Record<string, unknown>[];
  }

  async getMember(userId: string): Promise<Record<string, unknown>[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.mainTableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}` },
      })
    );
    return (result.Items || []) as Record<string, unknown>[];
  }

  async findMemberSubscription(userId: string): Promise<{ PK: string; SK: string } | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.mainTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'SUB#' },
      })
    );
    const item = result.Items?.[0];
    return item ? { PK: item.PK as string, SK: item.SK as string } : undefined;
  }

  async overrideMemberSubscription(params: MemberOverrideParams): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.mainTableName,
        Key: {
          PK: params.userId.startsWith('USER#') ? params.userId : `USER#${params.userId}`,
          SK: params.subscriptionSk,
        },
        UpdateExpression: 'SET #st = :st, grace_period_end = :ge, GSI1PK = :gsi',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':st': params.status,
          ':ge': params.gracePeriodEnd,
          ':gsi': `STATUS#${params.status}`,
        },
      })
    );
  }

  async getHmacCurrentKey(): Promise<string | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.mainTableName,
        Key: { PK: 'CONFIG#HMAC_CURRENT_KEY', SK: 'CONFIG' },
      })
    );
    return result.Item?.value as string | undefined;
  }

  async rotateHmacKey(currentKey: string, newKey: string): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.mainTableName,
        Item: { PK: 'CONFIG#HMAC_PREVIOUS_KEY', SK: 'CONFIG', value: currentKey },
      })
    );
    await this.client.send(
      new PutCommand({
        TableName: this.mainTableName,
        Item: { PK: 'CONFIG#HMAC_CURRENT_KEY', SK: 'CONFIG', value: newKey },
      })
    );
  }

  async findAssignedLockerId(deviceId: string): Promise<string | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.mainTableName,
        IndexName: 'DeviceIdIndex',
        KeyConditionExpression: 'device_id = :deviceId',
        ExpressionAttributeValues: { ':deviceId': deviceId },
      })
    );
    const scanner = result.Items?.find((item) => String(item.SK).startsWith('SCANNER#'));
    return scanner?.assigned_locker_id as string | undefined;
  }
}

export interface DevicePresence {
  thingName: string;
  lastSeen: string; // ISO 8601
}

export interface DevicePresenceRepository {
  getPresence(thingName: string): Promise<DevicePresence | undefined>;
  updatePresence(thingName: string, timestamp: string): Promise<void>;
}

export class DynamoDbDevicePresenceRepository implements DevicePresenceRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly ttlSeconds: number = 86400
  ) {}

  async getPresence(thingName: string): Promise<DevicePresence | undefined> {
    const result = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { thingName } }));
    if (!result.Item) {
      return undefined;
    }
    return {
      thingName: String(result.Item.thingName),
      lastSeen: String(result.Item.lastSeen),
    };
  }

  async updatePresence(thingName: string, timestamp: string): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + this.ttlSeconds;
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          thingName,
          lastSeen: timestamp,
          ttl,
        },
      })
    );
  }
}
