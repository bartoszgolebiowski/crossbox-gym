import assert from 'node:assert';
import { test } from 'node:test';
import {
  BasicSubscriptionProvider,
  DefaultProviderClassifier,
  MockProvider,
  TildeV130Provider,
} from '../lib/handlers/shared/providers/qr';
import { parseIotScanEvent } from '../lib/handlers/verify-entry';

test('1. TildeV130Provider classifies and verifies sample IoT Core payload', async () => {
  const provider = new TildeV130Provider();
  const rawData =
    '1.3.0~2608020462743830~2;~1=20240512001055|2=1|3=0|4=087082551159|5=0|6=20300802|8=0|9=365240423959|10=0|11=0|12=0|13=20240512001055|14=1|15=20260802141313|16=616|17=0|20=269|21=52799|~20260731185101;366;60157;;;1~20260722184759;366;60157;;;1~4A1B65BBE0089668C497E789775E957C31BD396D95E39E4ECE56AF5EA796E9F7';

  assert.strictEqual(provider.canHandle(rawData), true);

  const verification = await provider.verify(rawData);
  assert.strictEqual(verification.success, true);
  assert.strictEqual(verification.credential?.providerId, 'tilde-v1-3-0');
  assert.strictEqual(verification.credential?.subjectId, '087082551159');
  assert.strictEqual(verification.credential?.metadata?.serialNumber, '2608020462743830');
});

test('2. BasicSubscriptionProvider classifies and verifies JSON payload using key & subscription fetcher abstractions', async () => {
  const now = Math.floor(Date.now() / 1000);
  const crypto = await import('crypto');
  const hmac = crypto.createHmac('sha256', 'secret_key').update(`user_123:${now}`).digest('hex');

  const provider = new BasicSubscriptionProvider(
    async () => ({ currentKey: 'secret_key' }),
    async () => ({ status: 'ACTIVE' })
  );

  const rawData = JSON.stringify({
    user_id: 'user_123',
    timestamp: now,
    hmac,
  });

  assert.strictEqual(provider.canHandle(rawData), true);

  const verification = await provider.verify(rawData, { nowSeconds: now });
  assert.strictEqual(verification.success, true);
  assert.strictEqual(verification.credential?.subjectId, 'user_123');
});

test('3. MockProvider classifies and verifies mock string', async () => {
  const provider = new MockProvider();
  const rawData = 'mock:user_456';

  assert.strictEqual(provider.canHandle(rawData), true);

  const verification = await provider.verify(rawData);
  assert.strictEqual(verification.success, true);
  assert.strictEqual(verification.credential?.subjectId, 'user_456');
});

test('4. DefaultProviderClassifier selects provider accurately', async () => {
  const classifier = new DefaultProviderClassifier([
    new TildeV130Provider(),
    new BasicSubscriptionProvider(),
    new MockProvider(),
  ]);

  const tildeResult = await classifier.classify('1.3.0~2608020462743830~2;~1=20240512001055|4=087082551159|~sig');
  assert.strictEqual(tildeResult.status, 'recognized');
  assert.strictEqual(tildeResult.providerId, 'tilde-v1-3-0');

  const mockResult = await classifier.classify('mock:user_789');
  assert.strictEqual(mockResult.status, 'recognized');
  assert.strictEqual(mockResult.providerId, 'mock');

  const unknownResult = await classifier.classify('invalid_random_string');
  assert.strictEqual(unknownResult.status, 'unrecognized');
});

test('5. parseIotScanEvent strictly validates required IoT Core payload schema', async () => {
  const validEvent = {
    event_id: 'a7733be2-1ade-4d89-a7ec-5c15c36fd5c2',
    client_id: 'hd360-qr-scanner-01',
    timestamp: 1785672769,
    payload: {
      raw_data: '1.3.0~2608020462743830~2;~1=20240512001055|4=087082551159|~sig',
      encoding: 'utf-8',
    },
  };

  const parsed = parseIotScanEvent(validEvent);
  assert.strictEqual(parsed.valid, true);
  if (parsed.valid) {
    assert.strictEqual(parsed.scannerId, 'hd360-qr-scanner-01');
    assert.strictEqual(parsed.event.event_id, 'a7733be2-1ade-4d89-a7ec-5c15c36fd5c2');
    assert.strictEqual(parsed.event.client_id, 'hd360-qr-scanner-01');
    assert.strictEqual(parsed.event.timestamp, 1785672769);
    assert.strictEqual(parsed.event.payload.encoding, 'utf-8');
  }

  // Test missing event_id
  const invalidId = parseIotScanEvent({ ...validEvent, event_id: '' });
  assert.strictEqual(invalidId.valid, false);
  assert.strictEqual(invalidId.reason, 'missing_or_invalid_event_id');

  // Test missing client_id
  const invalidClient = parseIotScanEvent({ ...validEvent, client_id: '' });
  assert.strictEqual(invalidClient.valid, false);
  assert.strictEqual(invalidClient.reason, 'missing_or_invalid_client_id');

  // Test invalid timestamp
  const invalidTs = parseIotScanEvent({ ...validEvent, timestamp: 0 });
  assert.strictEqual(invalidTs.valid, false);
  assert.strictEqual(invalidTs.reason, 'missing_or_invalid_timestamp');

  // Test missing raw_data
  const invalidRawData = parseIotScanEvent({
    ...validEvent,
    payload: { raw_data: '', encoding: 'utf-8' },
  });
  assert.strictEqual(invalidRawData.valid, false);
  assert.strictEqual(invalidRawData.reason, 'missing_or_invalid_raw_data');

  // Test missing encoding
  const invalidEncoding = parseIotScanEvent({
    ...validEvent,
    payload: { raw_data: 'mock:123', encoding: '' },
  });
  assert.strictEqual(invalidEncoding.valid, false);
  assert.strictEqual(invalidEncoding.reason, 'missing_or_invalid_encoding');
});
