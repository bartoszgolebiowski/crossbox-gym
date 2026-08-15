import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { handler as authHandler } from '../lib/handlers/auth';

const mockEnv = {
  MAIN_TABLE_NAME: 'CrossboxGymMainTable',
  USER_POOL_ID: 'mock_pool_id',
  USER_POOL_CLIENT_ID: 'mock_client_id',
  FRONTEND_URL: 'https://localhost',
  ENTRY_LOGS_TABLE_NAME: 'CrossboxGymEntryLogsTable',
  AUDIT_LOGS_TABLE_NAME: 'CrossboxGymAuditLogsTable',
  STRIPE_SECRET_KEY: 'sk_test_mock',
};

describe('Auth Registration & Password Reset Unit Tests', () => {
  test('POST /auth/register throws ValidationError when password is missing', async () => {
    process.env = { ...process.env, ...mockEnv };

    const event: any = {
      requestContext: {
        http: {
          method: 'POST',
          path: '/auth/register',
        },
      },
      body: JSON.stringify({ email: 'test@example.com' }),
      isBase64Encoded: false,
    };

    const response: any = await authHandler(event);
    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.equal(body.error || body.message, 'Email and password are required');
  });

  test('POST /auth/forgot-password throws ValidationError when email is missing', async () => {
    process.env = { ...process.env, ...mockEnv };

    const event: any = {
      requestContext: {
        http: {
          method: 'POST',
          path: '/auth/forgot-password',
        },
      },
      body: JSON.stringify({}),
      isBase64Encoded: false,
    };

    const response: any = await authHandler(event);
    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.equal(body.error || body.message, 'Email is required');
  });

  test('POST /auth/confirm-forgot-password throws ValidationError when missing parameters', async () => {
    process.env = { ...process.env, ...mockEnv };

    const event: any = {
      requestContext: {
        http: {
          method: 'POST',
          path: '/auth/confirm-forgot-password',
        },
      },
      body: JSON.stringify({ email: 'test@example.com' }),
      isBase64Encoded: false,
    };

    const response: any = await authHandler(event);
    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.equal(body.error || body.message, 'Email, confirmation code, and newPassword are required');
  });
});
