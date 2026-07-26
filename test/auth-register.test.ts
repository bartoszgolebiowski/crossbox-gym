import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { handler as authHandler } from '../lib/handlers/auth';

describe('Auth Registration & Password Reset Unit Tests', () => {
  test('POST /auth/register throws ValidationError when password is missing', async () => {
    process.env.MAIN_TABLE_NAME = 'CrossboxGymMainTable';
    process.env.USER_POOL_ID = 'mock_pool_id';
    process.env.USER_POOL_CLIENT_ID = 'mock_client_id';
    process.env.FRONTEND_URL = 'https://localhost';

    const event: any = {
      requestContext: {
        http: {
          method: 'POST',
          path: '/auth/register'
        }
      },
      body: JSON.stringify({ email: 'test@example.com' }),
      isBase64Encoded: false
    };

    const response = await authHandler(event);
    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.equal(body.message, 'Email and password are required');
  });

  test('POST /auth/forgot-password throws ValidationError when email is missing', async () => {
    process.env.MAIN_TABLE_NAME = 'CrossboxGymMainTable';
    process.env.USER_POOL_ID = 'mock_pool_id';
    process.env.USER_POOL_CLIENT_ID = 'mock_client_id';
    process.env.FRONTEND_URL = 'https://localhost';

    const event: any = {
      requestContext: {
        http: {
          method: 'POST',
          path: '/auth/forgot-password'
        }
      },
      body: JSON.stringify({}),
      isBase64Encoded: false
    };

    const response = await authHandler(event);
    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.equal(body.message, 'Email is required');
  });

  test('POST /auth/confirm-forgot-password throws ValidationError when missing parameters', async () => {
    process.env.MAIN_TABLE_NAME = 'CrossboxGymMainTable';
    process.env.USER_POOL_ID = 'mock_pool_id';
    process.env.USER_POOL_CLIENT_ID = 'mock_client_id';
    process.env.FRONTEND_URL = 'https://localhost';

    const event: any = {
      requestContext: {
        http: {
          method: 'POST',
          path: '/auth/confirm-forgot-password'
        }
      },
      body: JSON.stringify({ email: 'test@example.com' }),
      isBase64Encoded: false
    };

    const response = await authHandler(event);
    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.equal(body.message, 'Email, confirmation code, and newPassword are required');
  });
});
