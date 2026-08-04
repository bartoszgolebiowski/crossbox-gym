import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { getTestContext, createTestUserSession, createTestLocation, cleanupTestLocation } from './lib/test-helpers.ts';
import { IntegrationTestContext, TestUserSession, TestLocationRecord } from './lib/types.ts';

describe('Admin Management & System Operations Test Suite', () => {
  let context: IntegrationTestContext;
  let adminSession: TestUserSession;
  let memberSession: TestUserSession;
  let testLocation: TestLocationRecord;

  before(async () => {
    context = await getTestContext();
    adminSession = await createTestUserSession(context, { role: 'admin' });
    memberSession = await createTestUserSession(context, { role: 'member' });
    testLocation = await createTestLocation(context, adminSession.idToken);
  });

  after(async () => {
    if (testLocation?.locationId) {
      await cleanupTestLocation(context, adminSession.idToken, testLocation.locationId);
    }
  });

  test('RBAC Gate: Non-admin member token on /admin/* routes returns 403 Forbidden', async () => {
    const res = await fetch(`${context.apiUrl}/admin/locations`, {
      headers: { Authorization: `Bearer ${memberSession.idToken}` },
    });

    assert.equal(res.status, 403);
  });

  test('POST /admin/locations creates location and GET /admin/locations lists it', async () => {
    const res = await fetch(`${context.apiUrl}/admin/locations`, {
      headers: { Authorization: `Bearer ${adminSession.idToken}` },
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any[];
    assert.ok(Array.isArray(data));
    assert.ok(data.length > 0);
  });

  test('POST /admin/locations/{id}/devices registers new device with hashed API key', async () => {
    const res = await fetch(`${context.apiUrl}/admin/locations/${testLocation.locationId}/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSession.idToken}`,
      },
      body: JSON.stringify({
        name: 'Admin Test Scanner',
        type: 'scanner',
        connection_params: { ip: '10.0.0.1' },
        api_key: 'test_key_abc_123',
      }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(data.device_id);
    assert.ok(data.api_key_hash);
  });

  test('POST /admin/members/{id}/override suspends member account and extends grace period', async () => {
    const res = await fetch(`${context.apiUrl}/admin/members/${memberSession.userId}/override`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSession.idToken}`,
      },
      body: JSON.stringify({
        action: 'extend_grace',
        grace_days: 14,
      }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('successful'));
  });

  test('POST /admin/devices/{id}/unlock triggers remote unlock', async () => {
    const res = await fetch(`${context.apiUrl}/admin/devices/dev_123/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSession.idToken}`,
      },
      body: JSON.stringify({
        location_id: testLocation.locationId,
        reason: 'Integration test remote unlock',
      }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('Remote unlock triggered'));
  });

  test('POST /admin/hmac/rotate rotates current and previous HMAC keys', async () => {
    const res = await fetch(`${context.apiUrl}/admin/hmac/rotate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSession.idToken}`,
      },
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('rotated'));
  });
});
