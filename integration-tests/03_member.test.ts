import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { getTestContext, createTestUserSession } from './lib/test-helpers.ts';
import { IntegrationTestContext, TestUserSession } from './lib/types.ts';

describe('Member PWA Test Suite', () => {
  let context: IntegrationTestContext;
  let memberSession: TestUserSession;

  before(async () => {
    context = await getTestContext();
    memberSession = await createTestUserSession(context, { role: 'member', withActiveSubscription: true });
  });

  test('GET /member/dashboard returns profile, active subscription, and gym locations', async () => {
    const res = await fetch(`${context.apiUrl}/member/dashboard`, {
      headers: { 'Authorization': `Bearer ${memberSession.idToken}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(data.user, 'Expected user profile');
    assert.ok(Array.isArray(data.locations), 'Expected locations array');
  });

  test('POST /member/consent records terms version and IP address', async () => {
    const res = await fetch(`${context.apiUrl}/member/consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${memberSession.idToken}`
      },
      body: JSON.stringify({ terms_version: 'v1.0' })
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(data.message.includes('Consent recorded'));
  });

  test('POST /member/qr generates valid signed HMAC QR code for active member', async () => {
    const res = await fetch(`${context.apiUrl}/member/qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${memberSession.idToken}`
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(data.qr_code, 'Expected qr_code payload');
    const qrObj = JSON.parse(data.qr_code);
    assert.ok(qrObj.hmac, 'Expected HMAC signature in QR payload');
  });

  test('POST /member/portal-session returns customer portal URL', async () => {
    const res = await fetch(`${context.apiUrl}/member/portal-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${memberSession.idToken}`
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(data.url, 'Expected portal URL');
  });

  test('GET /member/dashboard without auth header returns 401', async () => {
    const res = await fetch(`${context.apiUrl}/member/dashboard`);
    assert.equal(res.status, 401);
  });
});
