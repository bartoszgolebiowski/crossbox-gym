import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomBytes } from 'crypto';
import { ScanContent, UnlockCommand, UnlockOutboxItem } from '../shared/access-types';
import { getConfigItem, getDeviceByApiKey, getLocker, getScannerByApiKey, getScannerById, getUserSubscription } from '../shared/db-helpers';
import { ddb } from '../shared/ddb-client';
import { hashApiKey, signQrPayload } from '../shared/hash-helpers';
import { parseJsonBody, withHandler } from '../shared/http';
import { createQrClassifier, createScannerReader } from '../shared/providers';
import { EntryLogItem } from '../shared/types';
import { getEntryLogsTableName, getMainTableName, getUnlockQueueUrl } from '../shared/env';

const sqs = new SQSClient({});

const MAIN_TABLE = getMainTableName();
const ENTRY_LOGS_TABLE = getEntryLogsTableName();
const UNLOCK_QUEUE_URL = getUnlockQueueUrl();

interface QRPayload {
  user_id: string;
  timestamp: number;
  hmac: string;
}

async function sendMqttFeedback(scannerId: string | undefined, payload: Record<string, any>) {
  if (!scannerId) return;
  const endpoint = process.env.IOT_ENDPOINT;
  try {
    const iotData = new IoTDataPlaneClient(endpoint ? { endpoint: `https://${endpoint}` } : {});
    await iotData.send(new PublishCommand({
      topic: `gym/scanners/${scannerId}/feedback`,
      qos: 1,
      payload: Buffer.from(JSON.stringify(payload)),
    }));
  } catch (err) {
    console.warn(`[VerifyEntry] Failed to send MQTT feedback to ${scannerId}:`, err);
  }
}

export const handler = withHandler(async (event: APIGatewayProxyEventV2) => {
  const rawEvent = event as any;
  const apiKey = event.headers?.['x-api-key'] || rawEvent.api_key || rawEvent.apiKey;
  const targetScannerId = rawEvent.scannerId || rawEvent.scanner_id;

  let scanner = apiKey ? await getScannerByApiKey(MAIN_TABLE, hashApiKey(apiKey)) : undefined;
  if (!scanner && targetScannerId) {
    scanner = await getScannerById(MAIN_TABLE, targetScannerId);
  }

  if (scanner) {
    if (!scanner.assigned_locker_id) {
      const resp = { result: 'denied', reason: 'assigned_locker_unavailable' };
      await sendMqttFeedback(scanner.scanner_id, resp);
      return resp;
    }

    const locker = await getLocker(MAIN_TABLE, scanner.location_id, scanner.assigned_locker_id);
    if (!locker || locker.assigned_scanner_id !== scanner.scanner_id) {
      const resp = { result: 'denied', reason: 'assigned_locker_unavailable' };
      await sendMqttFeedback(scanner.scanner_id, resp);
      return resp;
    }

    let body: Record<string, any> = {};
    if (event.body) {
      body = parseJsonBody(event);
    } else if (typeof rawEvent === 'object') {
      body = rawEvent;
    }

    const suppliedScan = body.scan as { content?: ScanContent; observed_at?: string } | undefined;
    const legacyQr = body.qr_code;
    const content = suppliedScan?.content || (legacyQr ? {
      kind: 'text' as const,
      value: typeof legacyQr === 'string' ? legacyQr : JSON.stringify(legacyQr),
    } : undefined);

    if (!content || typeof content.value !== 'string') {
      const resp = { result: 'denied', reason: 'invalid_qr' };
      await sendMqttFeedback(scanner.scanner_id, resp);
      return resp;
    }

    const [currentKey, previousKey] = await Promise.all([
      getConfigItem(MAIN_TABLE, 'HMAC_CURRENT_KEY'),
      getConfigItem(MAIN_TABLE, 'HMAC_PREVIOUS_KEY'),
    ]);
    const reader = createScannerReader(scanner.reader_adapter);
    const scan = await reader.read(content, suppliedScan?.observed_at || new Date().toISOString());
    const classification = await createQrClassifier(currentKey || 'default_key', previousKey).classify(scan, scanner.allowed_qr_providers);
    
    if (classification.status !== 'recognized') {
      const resp = { result: 'denied', reason: classification.status === 'rejected' ? classification.reason : 'invalid_qr' };
      await sendMqttFeedback(scanner.scanner_id, resp);
      return resp;
    }

    const now = Math.floor(Date.now() / 1000);
    if (classification.credential.provider_id === 'basic-subscription') {
      const subscription = await getUserSubscription(MAIN_TABLE, classification.credential.subject_id);
      const subscriptionActive = subscription?.status === 'ACTIVE' || (subscription?.status === 'PAST_DUE' && subscription.grace_period_end && new Date(subscription.grace_period_end).getTime() / 1000 > now);
      if (!subscriptionActive) {
        const resp = { result: 'denied', reason: 'subscription_inactive' };
        await sendMqttFeedback(scanner.scanner_id, resp);
        return resp;
      }
    }

    const committedAt = new Date().toISOString();
    const entryId = randomBytes(12).toString('hex');
    const command: UnlockCommand = {
      command_id: randomBytes(12).toString('hex'),
      entry_id: entryId,
      location_id: scanner.location_id,
      scanner_id: scanner.scanner_id,
      locker_id: locker.locker_id,
      user_id: classification.credential.subject_id,
      provider_id: classification.credential.provider_id,
      duration_seconds: locker.unlock_duration_seconds,
      requested_at: committedAt,
    };
    const outbox: UnlockOutboxItem = {
      PK: `OUTBOX#${command.command_id}`,
      SK: 'OUTBOX',
      command,
      status: 'pending',
      delivery_attempts: 0,
      created_at: committedAt,
      OutboxStatusPK: 'OUTBOX#PENDING',
      OutboxStatusSK: `${committedAt}#${command.command_id}`,
    };
    const antiPassbackKey = `USER#${command.user_id}#LOC#${command.location_id}`;

    try {
      await ddb.send(new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: MAIN_TABLE,
              Key: { PK: `ANTIPASS#${antiPassbackKey}`, SK: 'STATE' },
              UpdateExpression: 'SET last_entry_at = :now, #ttl = :ttl',
              ConditionExpression: 'attribute_not_exists(last_entry_at) OR last_entry_at <= :cooldown',
              ExpressionAttributeNames: { '#ttl': 'ttl' },
              ExpressionAttributeValues: { ':now': now, ':cooldown': now - 15 * 60, ':ttl': now + 365 * 24 * 60 * 60 },
            },
          },
          {
            Put: {
              TableName: ENTRY_LOGS_TABLE,
              Item: {
                PK: `USER#${command.user_id}`, SK: `ENTRY#${committedAt}#${entryId}`, entry_id: entryId, user_id: command.user_id,
                location_id: command.location_id, timestamp: committedAt, result: 'success', device_id: scanner.scanner_id,
                scanner_id: scanner.scanner_id, locker_id: locker.locker_id, qr_provider_id: command.provider_id,
                unlock_command_id: command.command_id, AntiPassbackPK: antiPassbackKey, ttl: now + 365 * 24 * 60 * 60,
              },
            },
          },
          { Put: { TableName: MAIN_TABLE, Item: outbox } },
        ],
      }));
    } catch (error) {
      console.error('Access entry commitment failed', error);
      const transactionError = error as { name?: string; CancellationReasons?: Array<{ Code?: string }> };
      if (transactionError.name === 'TransactionCanceledException' && transactionError.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed') {
        const resp = { result: 'denied', reason: 'anti_passback_cooldown' };
        await sendMqttFeedback(scanner.scanner_id, resp);
        return resp;
      }
      throw error;
    }

    const successResp = { result: 'success', entry_id: entryId, feedback: 'Welcome to CrossBox Gym!' };
    await sendMqttFeedback(scanner.scanner_id, successResp);
    return successResp;
  }

  // Fallback to legacy device API Key lookup
  if (!apiKey) {
    return { result: 'denied', reason: 'invalid_device' };
  }

  const apiKeyHash = hashApiKey(apiKey);
  const device = await getDeviceByApiKey(MAIN_TABLE, apiKeyHash);

  if (!device || device.status !== 'active') {
    return { result: 'denied', reason: 'invalid_device' };
  }

  let body: Record<string, any> = {};
  if (event.body) {
    body = parseJsonBody(event);
  } else if (typeof rawEvent === 'object') {
    body = rawEvent;
  }

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

  const sub = await getUserSubscription(MAIN_TABLE, qrPayload.user_id);
  if (!sub) {
    return { result: 'denied', reason: 'subscription_inactive' };
  }

  const isValidSub = sub.status === 'ACTIVE' || (sub.status === 'PAST_DUE' && sub.grace_period_end && new Date(sub.grace_period_end).getTime() / 1000 > now);
  if (!isValidSub) {
    return { result: 'denied', reason: 'subscription_inactive' };
  }

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
