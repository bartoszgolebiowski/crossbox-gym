import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  getTestContext,
  createTestUserSession,
  createTestLocation,
  createMockScanner,
  generateTestQRPayload,
  cleanupTestLocation,
  scanMockDevice,
} from './lib/test-helpers.ts';
import { IntegrationTestContext, TestUserSession, TestLocationRecord, TestScannerRecord } from './lib/types.ts';

describe('Turnstile Entry & Device Verification Test Suite', () => {
  let context: IntegrationTestContext;
  let adminSession: TestUserSession;
  let memberSession: TestUserSession;
  let testLocation: TestLocationRecord;
  let testScanner: TestScannerRecord;

  before(async () => {
    context = await getTestContext();
    adminSession = await createTestUserSession(context, { role: 'admin' });
    memberSession = await createTestUserSession(context, { role: 'member', withActiveSubscription: true });

    testLocation = await createTestLocation(context, adminSession.idToken);
    testScanner = await createMockScanner(context, adminSession.idToken, testLocation.locationId, {
      name: 'Turnstile Scanner',
      allowedQrProviders: ['basic-subscription', 'mock'],
    });
  });

  after(async () => {
    if (testLocation?.locationId) {
      await cleanupTestLocation(context, adminSession.idToken, testLocation.locationId);
    }
  });

  test('VerifyEntry Lambda with valid signed QR returns success and gate unlock signal', async () => {
    const qrPayload = await generateTestQRPayload(context, memberSession.userId);
    const data = await scanMockDevice(context, testScanner.scanner_api_key!, qrPayload, testScanner.scanner_id);

    assert.equal(data.result, 'success');
    assert.equal(data.action, 'open_gate');
  });

  test('VerifyEntry Lambda anti-passback denies second scan within 15 minutes', async () => {
    const qrPayload = await generateTestQRPayload(context, memberSession.userId);
    const data = await scanMockDevice(context, testScanner.scanner_api_key!, qrPayload, testScanner.scanner_id);

    assert.equal(data.result, 'denied');
    assert.equal(data.reason, 'anti_passback_cooldown');
  });

  test('VerifyEntry Lambda with invalid/missing client_id returns denied', async () => {
    const qrPayload = await generateTestQRPayload(context, memberSession.userId);
    const data = await scanMockDevice(context, testScanner.scanner_api_key!, qrPayload, '');

    assert.equal(data.result, 'denied');
    assert.equal(data.reason, 'missing_or_invalid_client_id');
  });

  test('VerifyEntry Lambda with expired QR (>60s) returns denied qr_expired', async () => {
    const expiredUser = await createTestUserSession(context, { role: 'member', withActiveSubscription: true });
    const qrPayload = await generateTestQRPayload(context, expiredUser.userId, { timestampOffsetSeconds: -120 });
    const data = await scanMockDevice(context, testScanner.scanner_api_key!, qrPayload, testScanner.scanner_id);

    assert.equal(data.result, 'denied');
    assert.equal(data.reason, 'qr_expired');
  });

  test('VerifyEntry Lambda with tampered HMAC returns denied invalid_hmac', async () => {
    const tamperedUser = await createTestUserSession(context, { role: 'member', withActiveSubscription: true });
    const qrPayload = await generateTestQRPayload(context, tamperedUser.userId, {
      customHmacKey: 'invalid_secret_key',
    });
    const data = await scanMockDevice(context, testScanner.scanner_api_key!, qrPayload, testScanner.scanner_id);

    assert.equal(data.result, 'denied');
    assert.equal(data.reason, 'invalid_hmac');
  });
});
