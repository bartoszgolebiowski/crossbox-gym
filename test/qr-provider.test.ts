import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { signQrPayload } from '../lib/handlers/shared/hash-helpers';
import { BasicSubscriptionQrProvider, MockQrProvider, RegisteredQrClassifier } from '../lib/handlers/shared/providers/qr';

describe('QR provider registry', () => {
  test('recognizes a current signed basic-subscription credential', async () => {
    const timestamp = 1_800_000_000;
    const provider = new BasicSubscriptionQrProvider('test-key', undefined, () => timestamp);
    const payload = JSON.stringify({
      user_id: 'member-1',
      timestamp,
      hmac: signQrPayload('member-1', timestamp, 'test-key'),
    });

    const result = await provider.classify({ content: { kind: 'text', value: payload }, observed_at: new Date(timestamp * 1000).toISOString() });

    assert.deepEqual(result, { status: 'recognized', credential: { provider_id: 'basic-subscription', subject_id: 'member-1' } });
  });

  test('recognizes mock credentials only when mock is allowed by the scanner', async () => {
    const classifier = new RegisteredQrClassifier(new Map([['mock', new MockQrProvider()]]));
    const scan = { content: { kind: 'text' as const, value: 'mock:member-2' }, observed_at: new Date().toISOString() };

    assert.equal((await classifier.classify(scan, ['mock'])).status, 'recognized');
    assert.deepEqual(await classifier.classify(scan, ['integration-a']), { status: 'rejected', reason: 'unavailable' });
  });
});