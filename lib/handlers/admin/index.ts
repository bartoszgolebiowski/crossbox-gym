import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomBytes } from 'crypto';
import { getAuditLogsTableName, getEntryLogsTableName, getMainTableName } from '../shared/config';
import { hashApiKey } from '../shared/crypto';
import { ddb } from '../shared/database';
import { assertAdmin, NotFoundError, parseJsonBody, ValidationError, withHandler } from '../shared/http';
import { createMqttPublisher } from '../shared/providers/feedback';
import { ConfigItem } from '../shared/types';

const s3 = new S3Client({});

const MAIN_TABLE = getMainTableName();
const AUDIT_LOGS_TABLE = getAuditLogsTableName();

const syncLocationsToS3 = async () => {
  const assetsBucket = process.env.STATIC_ASSETS_BUCKET_NAME;
  if (!assetsBucket) return;

  const result = await ddb.send(
    new QueryCommand({
      TableName: MAIN_TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': 'LOCATIONS' },
    })
  );

  const locations = result.Items || [];
  await s3.send(
    new PutObjectCommand({
      Bucket: assetsBucket,
      Key: 'public/locations.json',
      Body: JSON.stringify(locations),
      ContentType: 'application/json',
    })
  );
};

const logAudit = async (adminId: string, actionType: string, details: Record<string, any>) => {
  const timestamp = new Date().toISOString();
  const auditId = randomBytes(8).toString('hex');
  try {
    await ddb.send(
      new PutCommand({
        TableName: AUDIT_LOGS_TABLE,
        Item: {
          PK: `AUDIT#${adminId}`,
          SK: `${timestamp}#${auditId}`,
          audit_id: auditId,
          admin_id: adminId,
          action_type: actionType,
          timestamp,
          ...details,
        },
      })
    );
  } catch (err) {
    console.error('AuditLog write failed:', err);
  }
};

export const handler = withHandler(async (event: APIGatewayProxyEventV2) => {
  const adminId = assertAdmin(event);
  const method = event.requestContext.http.method;
  const rawPath = event.requestContext.http.path || event.rawPath || '';
  const path = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;

  // GET /admin/locations
  if (method === 'GET' && path === '/admin/locations') {
    const result = await ddb.send(
      new QueryCommand({
        TableName: MAIN_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': 'LOCATIONS' },
      })
    );
    return result.Items || [];
  }

  // POST /admin/locations
  if (method === 'POST' && path === '/admin/locations') {
    const body = parseJsonBody(event);
    const locationId = randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    const item = {
      PK: `LOC#${locationId}`,
      SK: 'METADATA',
      name: body.name,
      address: body.address,
      created_at: now,
      GSI1PK: 'LOCATIONS',
      GSI1SK: `LOC#${locationId}`,
    };

    await ddb.send(new PutCommand({ TableName: MAIN_TABLE, Item: item }));
    await logAudit(adminId, 'create_location', { target_id: locationId });
    await syncLocationsToS3();
    return item;
  }

  // PUT /admin/locations/{id}
  if (method === 'PUT' && /^\/admin\/locations\/[^/]+$/.test(path)) {
    const id = path.split('/')[3];
    const body = parseJsonBody(event);
    await ddb.send(
      new UpdateCommand({
        TableName: MAIN_TABLE,
        Key: { PK: `LOC#${id}`, SK: 'METADATA' },
        UpdateExpression: 'SET #name = :name, address = :address',
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: { ':name': body.name, ':address': body.address },
      })
    );
    await logAudit(adminId, 'update_location', { target_id: id });
    await syncLocationsToS3();
    return { message: 'Location updated' };
  }

  // DELETE /admin/locations/{id}
  if (method === 'DELETE' && path.startsWith('/admin/locations/')) {
    const id = path.split('/')[3];
    await ddb.send(new DeleteCommand({ TableName: MAIN_TABLE, Key: { PK: `LOC#${id}`, SK: 'METADATA' } }));
    await logAudit(adminId, 'delete_location', { target_id: id });
    await syncLocationsToS3();
    return { message: 'Location deleted' };
  }

  if (method === 'GET' && /^\/admin\/locations\/[^/]+\/scanners$/.test(path)) {
    const locationId = path.split('/')[3];
    const result = await ddb.send(
      new QueryCommand({
        TableName: MAIN_TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `LOC#${locationId}`, ':sk': 'SCANNER#' },
      })
    );
    return result.Items || [];
  }

  if (method === 'POST' && /^\/admin\/locations\/[^/]+\/scanners$/.test(path)) {
    const locationId = path.split('/')[3];
    const body = parseJsonBody(event);
    const scannerId = randomBytes(8).toString('hex');
    const scannerApiKey = randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    const assignedLockerId = typeof body.assigned_locker_id === 'string' ? body.assigned_locker_id.trim() : '';
    if (!assignedLockerId) {
      throw new ValidationError('assigned_locker_id is required when registering a scanner');
    }
    const item = {
      PK: `LOC#${locationId}`,
      SK: `SCANNER#${scannerId}`,
      scanner_id: scannerId,
      device_id: scannerId,
      location_id: locationId,
      name: body.name || `Scanner ${scannerId}`,
      status: 'active',
      reader_adapter: body.reader_adapter || 'mock',
      allowed_qr_providers: body.allowed_qr_providers || ['basic-subscription', 'mock'],
      assigned_locker_id: assignedLockerId,
      api_key_hash: hashApiKey(scannerApiKey),
      api_key_last_rotated_at: now,
      hardware_metadata: body.hardware_metadata,
      created_at: now,
      updated_at: now,
    };
    await ddb.send(new PutCommand({ TableName: MAIN_TABLE, Item: item }));
    await logAudit(adminId, 'create_scanner', { target_id: scannerId, location_id: locationId });
    return { ...item, scanner_api_key: scannerApiKey };
  }

  // GET /admin/locations/{id}/activity
  if (method === 'GET' && /^\/admin\/locations\/[^/]+\/activity$/.test(path)) {
    const locationId = path.split('/')[3];
    const queryParams = event.queryStringParameters || {};
    const scannerId = queryParams.scanner_id;
    const entryLogsTable = getEntryLogsTableName();

    const scanResult = await ddb
      .send(
        new ScanCommand({
          TableName: entryLogsTable,
          FilterExpression: 'location_id = :locId OR location_id = :locPk',
          ExpressionAttributeValues: { ':locId': locationId, ':locPk': `LOC#${locationId}` },
        })
      )
      .catch(() => ({ Items: [] }));

    let items = (scanResult.Items || []) as Array<Record<string, any>>;

    if (scannerId && scannerId !== 'all') {
      items = items.filter((item) => item.scanner_id === scannerId || item.device_id === scannerId);
    }

    // Sort timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Aggregations
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

  // GET /admin/locations/{id}/devices
  if (method === 'GET' && path.includes('/devices')) {
    const locationId = path.split('/')[3];
    const result = await ddb.send(
      new QueryCommand({
        TableName: MAIN_TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `LOC#${locationId}`, ':sk': 'DEV#' },
      })
    );
    return result.Items || [];
  }

  // POST /admin/devices/{id}/unlock
  if (method === 'POST' && path.endsWith('/unlock')) {
    const deviceId = path.split('/')[3];
    const body = parseJsonBody(event);

    const mqttPublisher = createMqttPublisher();
    await mqttPublisher.sendGateUnlockSignal(deviceId, `remote_${Date.now()}`);

    await logAudit(adminId, 'remote_unlock', { target_id: deviceId, reason: body.reason });
    return { message: 'Remote unlock triggered' };
  }

  // POST /admin/locations/{id}/devices
  if (method === 'POST' && path.includes('/devices')) {
    const locationId = path.split('/')[3];
    const body = parseJsonBody(event);
    const deviceId = randomBytes(8).toString('hex');
    const apiKeyHash = hashApiKey(body.api_key || 'secret');

    const item = {
      PK: `LOC#${locationId}`,
      SK: `DEV#${deviceId}`,
      device_id: deviceId,
      name: body.name,
      type: body.type,
      connection_params: body.connection_params,
      api_key_hash: apiKeyHash,
      status: 'active',
      created_at: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({ TableName: MAIN_TABLE, Item: item }));
    await logAudit(adminId, 'create_device', { target_id: deviceId, location_id: locationId });
    return item;
  }

  // POST /admin/hmac/rotate
  if (method === 'POST' && path === '/admin/hmac/rotate') {
    const newKey = randomBytes(32).toString('hex');

    // Get current key using GetCommand
    const currentKeyRes = await ddb.send(
      new GetCommand({
        TableName: MAIN_TABLE,
        Key: { PK: 'CONFIG#HMAC_CURRENT_KEY', SK: 'CONFIG' },
      })
    );
    const currentKey = (currentKeyRes.Item as ConfigItem)?.value || 'default_key';

    // Move current to previous, set new as current
    await ddb.send(
      new PutCommand({
        TableName: MAIN_TABLE,
        Item: { PK: 'CONFIG#HMAC_PREVIOUS_KEY', SK: 'CONFIG', value: currentKey },
      })
    );
    await ddb.send(
      new PutCommand({ TableName: MAIN_TABLE, Item: { PK: 'CONFIG#HMAC_CURRENT_KEY', SK: 'CONFIG', value: newKey } })
    );

    await logAudit(adminId, 'hmac_rotation', {});
    return { message: 'HMAC keys rotated successfully' };
  }

  // GET /admin/members
  if (method === 'GET' && path === '/admin/members') {
    const result = await ddb.send(
      new ScanCommand({
        TableName: MAIN_TABLE,
        FilterExpression: 'begins_with(PK, :userPrefix) AND SK = :profile',
        ExpressionAttributeValues: { ':userPrefix': 'USER#', ':profile': 'PROFILE' },
      })
    );
    return result.Items || [];
  }

  // GET /admin/members/{id}
  if (method === 'GET' && path.startsWith('/admin/members/')) {
    const userId = path.split('/')[3];
    const result = await ddb.send(
      new QueryCommand({
        TableName: MAIN_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}` },
      })
    );
    return result.Items || [];
  }

  // POST /admin/members/{id}/override
  if (method === 'POST' && path.includes('/override')) {
    const userId = path.split('/')[3];
    const body = parseJsonBody(event);
    const { action, grace_days } = body;

    let newStatus = 'ACTIVE';
    let graceEnd = null;

    if (action === 'suspend') {
      newStatus = 'SUSPENDED';
    } else if (action === 'extend_grace') {
      newStatus = 'PAST_DUE';
      const days = grace_days || 7;
      graceEnd = new Date(Date.now() + days * 86400000).toISOString();
    }

    const subs = await ddb.send(
      new QueryCommand({
        TableName: MAIN_TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'SUB#' },
      })
    );

    if (subs.Items && subs.Items.length > 0) {
      const subSk = subs.Items[0].SK;
      await ddb.send(
        new UpdateCommand({
          TableName: MAIN_TABLE,
          Key: { PK: `USER#${userId}`, SK: subSk },
          UpdateExpression: 'SET #st = :st, grace_period_end = :ge, GSI1PK = :gsi',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':st': newStatus, ':ge': graceEnd, ':gsi': `STATUS#${newStatus}` },
        })
      );
    }

    await logAudit(adminId, action === 'suspend' ? 'suspend_account' : 'extend_grace', { target_id: userId, action });
    return { message: `Member override successful: ${action}` };
  }

  throw new NotFoundError('Admin route not found');
});
