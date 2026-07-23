import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { QueryCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomBytes } from 'crypto';
import { ddb } from '../shared/ddb-client';
import { withHandler, parseJsonBody, assertAdmin, NotFoundError } from '../shared/http';
import { hashApiKey } from '../shared/hash-helpers';
import { ConfigItem } from '../shared/types';

const s3 = new S3Client({});
const sqs = new SQSClient({});

const MAIN_TABLE = process.env.MAIN_TABLE_NAME!;
const AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE_NAME!;
const ASSETS_BUCKET = process.env.STATIC_ASSETS_BUCKET_NAME!;
const UNLOCK_QUEUE = process.env.UNLOCK_QUEUE_URL!;

const syncLocationsToS3 = async () => {
  const result = await ddb.send(new QueryCommand({
    TableName: MAIN_TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: { ':pk': 'LOCATIONS' }
  }));

  const locations = result.Items || [];
  await s3.send(new PutObjectCommand({
    Bucket: ASSETS_BUCKET,
    Key: 'public/locations.json',
    Body: JSON.stringify(locations),
    ContentType: 'application/json'
  }));
};

const logAudit = async (adminId: string, actionType: string, details: Record<string, any>) => {
  const timestamp = new Date().toISOString();
  const auditId = randomBytes(8).toString('hex');
  try {
    await ddb.send(new PutCommand({
      TableName: AUDIT_LOGS_TABLE,
      Item: {
        PK: `AUDIT#${adminId}`,
        SK: `${timestamp}#${auditId}`,
        audit_id: auditId,
        admin_id: adminId,
        action_type: actionType,
        timestamp,
        ...details
      }
    }));
  } catch (err) {
    console.error('AuditLog write failed:', err);
  }
};

export const handler = withHandler(async (event: APIGatewayProxyEventV2) => {
  const adminId = assertAdmin(event);
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  // GET /admin/locations
  if (method === 'GET' && path === '/admin/locations') {
    const result = await ddb.send(new QueryCommand({
      TableName: MAIN_TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': 'LOCATIONS' }
    }));
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
      GSI1SK: `LOC#${locationId}`
    };

    await ddb.send(new PutCommand({ TableName: MAIN_TABLE, Item: item }));
    await logAudit(adminId, 'create_location', { target_id: locationId });
    await syncLocationsToS3();
    return item;
  }

  // PUT /admin/locations/{id}
  if (method === 'PUT' && path.startsWith('/admin/locations/')) {
    const id = path.split('/')[3];
    const body = parseJsonBody(event);
    await ddb.send(new UpdateCommand({
      TableName: MAIN_TABLE,
      Key: { PK: `LOC#${id}`, SK: 'METADATA' },
      UpdateExpression: 'SET #name = :name, address = :address',
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: { ':name': body.name, ':address': body.address }
    }));
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

  // GET /admin/locations/{id}/devices
  if (method === 'GET' && path.includes('/devices')) {
    const locationId = path.split('/')[3];
    const result = await ddb.send(new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `LOC#${locationId}`, ':sk': 'DEV#' }
    }));
    return result.Items || [];
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
      created_at: new Date().toISOString()
    };

    await ddb.send(new PutCommand({ TableName: MAIN_TABLE, Item: item }));
    await logAudit(adminId, 'create_device', { target_id: deviceId, location_id: locationId });
    return item;
  }

  // POST /admin/devices/{id}/unlock
  if (method === 'POST' && path.endsWith('/unlock')) {
    const deviceId = path.split('/')[3];
    const body = parseJsonBody(event);

    await sqs.send(new SendMessageCommand({
      QueueUrl: UNLOCK_QUEUE,
      MessageBody: JSON.stringify({
        location_id: body.location_id,
        device_id: deviceId,
        user_id: adminId,
        timestamp: new Date().toISOString()
      })
    }));

    await logAudit(adminId, 'remote_unlock', { target_id: deviceId, reason: body.reason });
    return { message: 'Remote unlock triggered' };
  }

  // POST /admin/hmac/rotate
  if (method === 'POST' && path === '/admin/hmac/rotate') {
    const newKey = randomBytes(32).toString('hex');

    // Get current key using GetCommand
    const currentKeyRes = await ddb.send(new GetCommand({
      TableName: MAIN_TABLE,
      Key: { PK: 'CONFIG#HMAC_CURRENT_KEY', SK: 'CONFIG' }
    }));
    const currentKey = (currentKeyRes.Item as ConfigItem)?.value || 'default_key';

    // Move current to previous, set new as current
    await ddb.send(new PutCommand({ TableName: MAIN_TABLE, Item: { PK: 'CONFIG#HMAC_PREVIOUS_KEY', SK: 'CONFIG', value: currentKey } }));
    await ddb.send(new PutCommand({ TableName: MAIN_TABLE, Item: { PK: 'CONFIG#HMAC_CURRENT_KEY', SK: 'CONFIG', value: newKey } }));

    await logAudit(adminId, 'hmac_rotation', {});
    return { message: 'HMAC keys rotated successfully' };
  }

  // GET /admin/members
  if (method === 'GET' && path === '/admin/members') {
    const result = await ddb.send(new ScanCommand({
      TableName: MAIN_TABLE,
      FilterExpression: 'begins_with(PK, :userPrefix) AND SK = :profile',
      ExpressionAttributeValues: { ':userPrefix': 'USER#', ':profile': 'PROFILE' }
    }));
    return result.Items || [];
  }

  // GET /admin/members/{id}
  if (method === 'GET' && path.startsWith('/admin/members/')) {
    const userId = path.split('/')[3];
    const result = await ddb.send(new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `USER#${userId}` }
    }));
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

    const subs = await ddb.send(new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'SUB#' }
    }));

    if (subs.Items && subs.Items.length > 0) {
      const subSk = subs.Items[0].SK;
      await ddb.send(new UpdateCommand({
        TableName: MAIN_TABLE,
        Key: { PK: `USER#${userId}`, SK: subSk },
        UpdateExpression: 'SET #st = :st, grace_period_end = :ge, GSI1PK = :gsi',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':st': newStatus, ':ge': graceEnd, ':gsi': `STATUS#${newStatus}` }
      }));
    }

    await logAudit(adminId, action === 'suspend' ? 'suspend_account' : 'extend_grace', { target_id: userId, action });
    return { message: `Member override successful: ${action}` };
  }

  throw new NotFoundError('Admin route not found');
});
