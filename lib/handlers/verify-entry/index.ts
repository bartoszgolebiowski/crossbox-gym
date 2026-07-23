import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ddb } from '../shared/ddb-client';
import { withHandler, parseJsonBody } from '../shared/http';
import { hashApiKey, signQrPayload } from '../shared/hash-helpers';
import { getDeviceByApiKey, getUserSubscription, getConfigItem } from '../shared/db-helpers';
import { EntryLogItem } from '../shared/types';

const sqs = new SQSClient({});

const MAIN_TABLE = process.env.MAIN_TABLE_NAME!;
const ENTRY_LOGS_TABLE = process.env.ENTRY_LOGS_TABLE_NAME!;
const UNLOCK_QUEUE_URL = process.env.UNLOCK_QUEUE_URL!;

interface QRPayload {
  user_id: string;
  timestamp: number;
  hmac: string;
}

export const handler = withHandler(async (event: APIGatewayProxyEventV2) => {
  const apiKey = event.headers['x-api-key'];
  if (!apiKey) {
    return { result: 'denied', reason: 'invalid_device' };
  }

  const apiKeyHash = hashApiKey(apiKey);
  const device = await getDeviceByApiKey(MAIN_TABLE, apiKeyHash);

  if (!device || device.status !== 'active') {
    return { result: 'denied', reason: 'invalid_device' };
  }

  const body = parseJsonBody(event);
  const qrCodeStr = body.qr_code as string;
  if (!qrCodeStr) {
    return { result: 'denied', reason: 'invalid_qr' };
  }

  let qrPayload: QRPayload;
  try {
    qrPayload = typeof qrCodeStr === 'object' ? qrCodeStr : JSON.parse(qrCodeStr);
  } catch {
    return { result: 'denied', reason: 'invalid_qr' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - qrPayload.timestamp) > 60) {
    return { result: 'denied', reason: 'qr_expired' };
  }

  // Read current and previous HMAC keys
  const [currentKey, prevKey] = await Promise.all([
    getConfigItem(MAIN_TABLE, 'HMAC_CURRENT_KEY'),
    getConfigItem(MAIN_TABLE, 'HMAC_PREVIOUS_KEY')
  ]);

  const activeCurrentKey = currentKey || 'default_key';
  const currentHmac = signQrPayload(qrPayload.user_id, qrPayload.timestamp, activeCurrentKey);
  const prevHmac = prevKey ? signQrPayload(qrPayload.user_id, qrPayload.timestamp, prevKey) : null;

  if (qrPayload.hmac !== currentHmac && qrPayload.hmac !== prevHmac) {
    return { result: 'denied', reason: 'invalid_qr_hmac' };
  }

  // Fetch user subscription
  const sub = await getUserSubscription(MAIN_TABLE, qrPayload.user_id);
  if (!sub) {
    return { result: 'denied', reason: 'subscription_inactive' };
  }

  const isValidSub = sub.status === 'ACTIVE' || (sub.status === 'PAST_DUE' && sub.grace_period_end && new Date(sub.grace_period_end).getTime() / 1000 > now);
  if (!isValidSub) {
    return { result: 'denied', reason: 'subscription_inactive' };
  }

  // Extract locationId from PK: LOC#<location_id>
  const locationId = device.PK.replace('LOC#', '');
  const antiPassbackPK = `USER#${qrPayload.user_id}#LOC#${locationId}`;

  const antiPassbackResult = await ddb.send(new QueryCommand({
    TableName: ENTRY_LOGS_TABLE,
    IndexName: 'AntiPassbackIndex',
    KeyConditionExpression: 'AntiPassbackPK = :pk',
    ExpressionAttributeValues: { ':pk': antiPassbackPK },
    ScanIndexForward: false,
    Limit: 1
  }));

  const lastEntry = antiPassbackResult.Items?.[0] as EntryLogItem | undefined;
  if (lastEntry) {
    const lastTime = new Date(lastEntry.timestamp).getTime() / 1000;
    if (now - lastTime < 15 * 60) {
      return { result: 'denied', reason: 'anti_passback_cooldown' };
    }
  }

  const isoTimestamp = new Date().toISOString();
  const entryId = `${now}_${Math.random().toString(36).substring(2, 9)}`;

  // Log Entry
  await ddb.send(new PutCommand({
    TableName: ENTRY_LOGS_TABLE,
    Item: {
      PK: `USER#${qrPayload.user_id}`,
      SK: `ENTRY#${isoTimestamp}#${entryId}`,
      entry_id: entryId,
      user_id: qrPayload.user_id,
      location_id: locationId,
      timestamp: isoTimestamp,
      result: 'success',
      device_id: device.device_id,
      ttl: now + 365 * 24 * 60 * 60,
      AntiPassbackPK: antiPassbackPK
    }
  }));

  // Enqueue unlock message
  await sqs.send(new SendMessageCommand({
    QueueUrl: UNLOCK_QUEUE_URL,
    MessageBody: JSON.stringify({
      location_id: locationId,
      device_id: device.device_id,
      user_id: qrPayload.user_id,
      timestamp: isoTimestamp
    })
  }));

  return { result: 'success', feedback: 'Welcome to CrossBox Gym!' };
});
