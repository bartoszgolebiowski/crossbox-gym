import { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand, 
  AdminSetUserPasswordCommand, 
  AdminAddUserToGroupCommand,
  AdminInitiateAuthCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createHmac, randomBytes } from 'crypto';
import { requireOutput } from './stack-outputs.ts';
import {
  IntegrationTestContext,
  TestUserSession,
  TestLocationInput,
  TestLocationRecord,
  TestDeviceInput,
  TestDeviceRecord
} from './types.ts';

let cachedContext: IntegrationTestContext | undefined;

export async function getTestContext(): Promise<IntegrationTestContext> {
  if (cachedContext) return cachedContext;

  const apiUrl = await requireOutput('ApiUrl');
  const userPoolId = await requireOutput('UserPoolId');
  const userPoolClientId = await requireOutput('UserPoolClientId');
  const mainTableName = await requireOutput('MainTableName');
  const entryLogsTableName = await requireOutput('EntryLogsTableName');
  const auditLogsTableName = await requireOutput('AuditLogsTableName');
  const unlockQueueUrl = await requireOutput('UnlockQueueUrl');
  const staticBucketName = await requireOutput('StaticBucketName');
  const region = process.env.AWS_REGION || 'eu-central-1';

  cachedContext = {
    apiUrl,
    userPoolId,
    userPoolClientId,
    mainTableName,
    entryLogsTableName,
    auditLogsTableName,
    unlockQueueUrl,
    staticBucketName,
    region
  };

  return cachedContext;
}

export async function createTestUserSession(
  context: IntegrationTestContext,
  options?: {
    email?: string;
    password?: string;
    role?: 'admin' | 'member';
    withActiveSubscription?: boolean;
  }
): Promise<TestUserSession> {
  const role = options?.role || 'member';
  const cognito = new CognitoIdentityProviderClient({ region: context.region });
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: context.region }));
  const now = new Date().toISOString();

  // For admin role without custom email, use seeded admin user
  if (role === 'admin' && !options?.email) {
    const email = 'admin@crossboxgym.com';
    const password = 'Admin123!';

    const authRes = await cognito.send(new AdminInitiateAuthCommand({
      UserPoolId: context.userPoolId,
      ClientId: context.userPoolClientId,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    }));

    const authResult = authRes.AuthenticationResult;
    if (!authResult || !authResult.IdToken || !authResult.AccessToken) {
      throw new Error(`Failed to authenticate seeded admin user ${email}`);
    }

    return {
      email,
      password,
      userId: 'seeded-admin',
      idToken: authResult.IdToken,
      accessToken: authResult.AccessToken,
      refreshToken: authResult.RefreshToken || '',
      role: 'admin'
    };
  }

  const email = options?.email || `test-user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.com`;
  const password = options?.password || 'TestPass123!';

  const createRes = await cognito.send(new AdminCreateUserCommand({
    UserPoolId: context.userPoolId,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' }
    ],
    MessageAction: 'SUPPRESS'
  }));

  const userId = createRes.User?.Attributes?.find(a => a.Name === 'sub')?.Value || '';

  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: context.userPoolId,
    Username: email,
    Password: password,
    Permanent: true
  }));

  if (role === 'admin') {
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: context.userPoolId,
      Username: email,
      GroupName: 'admins'
    }));
  }

  const authRes = await cognito.send(new AdminInitiateAuthCommand({
    UserPoolId: context.userPoolId,
    ClientId: context.userPoolClientId,
    AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password
    }
  }));

  const authResult = authRes.AuthenticationResult;
  if (!authResult || !authResult.IdToken || !authResult.AccessToken) {
    throw new Error(`Failed to authenticate test user ${email}`);
  }

  // Seed DynamoDB profile
  await ddb.send(new PutCommand({
    TableName: context.mainTableName,
    Item: {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      email,
      cognito_sub: userId,
      role,
      password_set: true,
      created_at: now,
      GSI1PK: 'USERS',
      GSI1SK: `USER#${userId}`
    }
  }));

  if (options?.withActiveSubscription ?? true) {
    const subId = `sub_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
    await ddb.send(new PutCommand({
      TableName: context.mainTableName,
      Item: {
        PK: `USER#${userId}`,
        SK: `SUB#${subId}`,
        stripe_subscription_id: subId,
        stripe_customer_id: `cus_${userId}`,
        status: 'ACTIVE',
        created_at: now,
        updated_at: now,
        GSI1PK: 'STATUS#ACTIVE',
        GSI1SK: `SUB#${subId}`
      }
    }));
  }

  return {
    email,
    password,
    userId,
    idToken: authResult.IdToken,
    accessToken: authResult.AccessToken,
    refreshToken: authResult.RefreshToken || '',
    role
  };
}

export async function createTestLocation(
  context: IntegrationTestContext,
  adminToken: string,
  input?: Partial<TestLocationInput>
): Promise<TestLocationRecord> {
  const name = input?.name || `Test Gym Location ${Date.now()}`;
  const address = input?.address || '123 Test Street, Fitness City';

  const res = await fetch(`${context.apiUrl}/admin/locations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ name, address })
  });

  if (res.status !== 201 && res.status !== 200) {
    const text = await res.text();
    throw new Error(`Failed to create test location (${res.status}): ${text}`);
  }

  return (await res.json()) as TestLocationRecord;
}

export async function createTestDevice(
  context: IntegrationTestContext,
  adminToken: string,
  locationId: string,
  input?: Partial<TestDeviceInput>
): Promise<{ device: TestDeviceRecord; rawApiKey: string }> {
  const rawApiKey = input?.api_key || `key_${Date.now()}_${randomBytes(8).toString('hex')}`;
  const name = input?.name || `Turnstile Scanner ${Date.now()}`;
  const type = input?.type || 'scanner';
  const connection_params = input?.connection_params || { ip: '192.168.1.100', port: 8080 };

  const res = await fetch(`${context.apiUrl}/admin/locations/${locationId}/devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name,
      type,
      connection_params,
      api_key: rawApiKey
    })
  });

  if (res.status !== 201 && res.status !== 200) {
    const text = await res.text();
    throw new Error(`Failed to create test device (${res.status}): ${text}`);
  }

  const device = (await res.json()) as TestDeviceRecord;
  return { device, rawApiKey };
}

export async function generateTestQRPayload(
  context: IntegrationTestContext,
  userId: string,
  options?: {
    timestampOffsetSeconds?: number;
    customHmacKey?: string;
  }
): Promise<string> {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: context.region }));

  let hmacKey = options?.customHmacKey;

  if (!hmacKey) {
    const keyRes = await ddb.send(new GetCommand({
      TableName: context.mainTableName,
      Key: { PK: 'CONFIG#HMAC_CURRENT_KEY', SK: 'CONFIG' }
    }));
    hmacKey = keyRes.Item?.value || 'default_key';
  }

  const timestamp = Math.floor(Date.now() / 1000) + (options?.timestampOffsetSeconds || 0);
  const dataToSign = `${userId}:${timestamp}`;
  const hmac = createHmac('sha256', hmacKey!).update(dataToSign).digest('hex');

  return JSON.stringify({
    user_id: userId,
    timestamp,
    hmac
  });
}

export async function fetchDynamoItem(
  context: IntegrationTestContext,
  tableName: string,
  pk: string,
  sk: string
): Promise<Record<string, any> | undefined> {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: context.region }));
  const res = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: { PK: pk, SK: sk }
  }));
  return res.Item;
}

export async function cleanupTestLocation(
  context: IntegrationTestContext,
  adminToken: string,
  locationId: string
): Promise<void> {
  await fetch(`${context.apiUrl}/admin/locations/${locationId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
}
