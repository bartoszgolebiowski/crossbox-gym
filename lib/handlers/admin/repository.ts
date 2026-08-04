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

export interface CreateScannerParams {
  locationId: string;
  scannerId: string;
  name: string;
  status: string;
  assignedLockerId: string;
  apiKeyHash: string;
  readerAdapter?: string;
  allowedQrProviders?: string[];
  hardwareMetadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CreateDeviceParams {
  locationId: string;
  deviceId: string;
  name: string;
  type: string;
  connectionParams: Record<string, unknown>;
  apiKeyHash: string;
  status: string;
  createdAt: string;
}

export interface ActivityItem {
  result: string;
  timestamp: string;
  scanner_id?: string;
  device_id?: string;
  [key: string]: unknown;
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
  listScanners(locationId: string): Promise<Record<string, unknown>[]>;
  createScanner(params: CreateScannerParams): Promise<Record<string, unknown>>;
  listDevices(locationId: string): Promise<Record<string, unknown>[]>;
  createDevice(params: CreateDeviceParams): Promise<Record<string, unknown>>;
  getActivity(locationId: string, scannerId?: string): Promise<ActivityAggregation>;
  listMembers(): Promise<Record<string, unknown>[]>;
  getMember(userId: string): Promise<Record<string, unknown>[]>;
  overrideMemberSubscription(params: MemberOverrideParams): Promise<void>;
  rotateHmacKey(currentKey: string, newKey: string): Promise<void>;
  getHmacCurrentKey(): Promise<string | undefined>;
  findMemberSubscription(userId: string): Promise<{ PK: string; SK: string } | undefined>;
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

  async listScanners(locationId: string): Promise<Record<string, unknown>[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.mainTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `LOC#${locationId}`, ':sk': 'SCANNER#' },
      })
    );
    return (result.Items || []) as Record<string, unknown>[];
  }

  async createScanner(params: CreateScannerParams): Promise<Record<string, unknown>> {
    const item = {
      PK: `LOC#${params.locationId}`,
      SK: `SCANNER#${params.scannerId}`,
      scanner_id: params.scannerId,
      device_id: params.scannerId,
      location_id: params.locationId,
      name: params.name,
      status: params.status,
      reader_adapter: params.readerAdapter || 'mock',
      allowed_qr_providers: params.allowedQrProviders || ['basic-subscription', 'mock'],
      assigned_locker_id: params.assignedLockerId,
      api_key_hash: params.apiKeyHash,
      api_key_last_rotated_at: params.createdAt,
      hardware_metadata: params.hardwareMetadata,
      created_at: params.createdAt,
      updated_at: params.createdAt,
    };
    await this.client.send(new PutCommand({ TableName: this.mainTableName, Item: item }));
    return item;
  }

  async listDevices(locationId: string): Promise<Record<string, unknown>[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.mainTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `LOC#${locationId}`, ':sk': 'DEV#' },
      })
    );
    return (result.Items || []) as Record<string, unknown>[];
  }

  async createDevice(params: CreateDeviceParams): Promise<Record<string, unknown>> {
    const item = {
      PK: `LOC#${params.locationId}`,
      SK: `DEV#${params.deviceId}`,
      device_id: params.deviceId,
      name: params.name,
      type: params.type,
      connection_params: params.connectionParams,
      api_key_hash: params.apiKeyHash,
      status: params.status,
      created_at: params.createdAt,
    };
    await this.client.send(new PutCommand({ TableName: this.mainTableName, Item: item }));
    return item;
  }

  async getActivity(locationId: string, scannerId?: string): Promise<ActivityAggregation> {
    const scanResult = await this.client
      .send(
        new ScanCommand({
          TableName: this.entryLogsTableName,
          FilterExpression: 'location_id = :locId OR location_id = :locPk',
          ExpressionAttributeValues: { ':locId': locationId, ':locPk': `LOC#${locationId}` },
        })
      )
      .catch(() => ({ Items: [] }));

    let items = (scanResult.Items || []) as ActivityItem[];

    if (scannerId && scannerId !== 'all') {
      items = items.filter((item) => item.scanner_id === scannerId || item.device_id === scannerId);
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

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

    return {
      location_id: locationId,
      total_count: items.length,
      success_count: successCount,
      denied_count: deniedCount,
      hourly_stats,
      daily_stats,
      weekly_stats,
      items,
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
}
