import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { getTestContext, createTestUserSession } from './lib/test-helpers.ts';
import { IntegrationTestContext, TestUserSession } from './lib/types.ts';

describe('Member PWA Test Suite', () => {
  let context: IntegrationTestContext;
  let memberSession: TestUserSession;

  before(async () => {
    // TODO: Initialize context & create member session with active subscription
  });

  test('GET /member/dashboard returns profile, active subscription, and gym locations', async () => {
    // TODO: Invoke GET /member/dashboard with member IdToken, assert profile, subscription, locations array
  });

  test('POST /member/consent records terms version and IP address', async () => {
    // TODO: Invoke POST /member/consent with terms_version="v1.0", assert message and check DDB
  });

  test('POST /member/qr generates valid signed HMAC QR code for active member', async () => {
    // TODO: Invoke POST /member/qr, verify qr_code payload contains user_id, timestamp, hmac
  });

  test('POST /member/portal-session returns customer portal URL', async () => {
    // TODO: Invoke POST /member/portal-session, assert 200 and portal url
  });

  test('GET /member/dashboard without auth header returns 401', async () => {
    // TODO: Invoke GET /member/dashboard without Authorization header, assert status 401
  });
});
