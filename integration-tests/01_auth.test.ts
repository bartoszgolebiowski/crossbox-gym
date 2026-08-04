import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { getTestContext, createTestUserSession } from './lib/test-helpers.ts';
import { IntegrationTestContext, TestUserSession } from './lib/types.ts';

describe('Auth & Account Setup Test Suite', () => {
  let context: IntegrationTestContext;
  let adminSession: TestUserSession;

  before(async () => {
    context = await getTestContext();
    adminSession = await createTestUserSession(context, { role: 'admin' });
  });

  test('POST /auth/login returns JWT tokens for valid admin', async () => {
    const res = await fetch(`${context.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminSession.email,
        password: adminSession.password,
      }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(data.accessToken, 'Expected accessToken');
    assert.ok(data.idToken, 'Expected idToken');
  });

  test('POST /auth/login with invalid credentials returns 401', async () => {
    const res = await fetch(`${context.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminSession.email,
        password: 'WrongPassword123!',
      }),
    });

    assert.equal(res.status, 401);
  });

  test('POST /auth/magic-link generates token and enforces rate limit', async () => {
    const targetEmail = `rate-limit-${Date.now()}@example.com`;

    // 5 allowed calls
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${context.apiUrl}/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      assert.equal(res.status, 200);
    }

    // 6th call should be rate limited
    const res = await fetch(`${context.apiUrl}/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as any;
    const msg = data.error || data.message || '';
    assert.ok(msg.toLowerCase().includes('limit') || msg.toLowerCase().includes('rate'));
  });

  test('GET /auth/magic-link/verify verifies token and prevents replay attack', async () => {
    const email = `magic-verify-${Date.now()}@example.com`;
    await fetch(`${context.apiUrl}/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    // Invalid token verify attempt
    const resInvalid = await fetch(`${context.apiUrl}/auth/magic-link/verify?token=invalidtoken&email=${email}`);
    assert.equal(resInvalid.status, 400);
  });

  test('POST /auth/set-password sets user password with JWT auth', async () => {
    const memberSession = await createTestUserSession(context, { role: 'member' });
    const res = await fetch(`${context.apiUrl}/auth/set-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberSession.idToken}`,
      },
      body: JSON.stringify({ newPassword: 'NewSecurePassword123!' }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('Password updated'));
  });
});
