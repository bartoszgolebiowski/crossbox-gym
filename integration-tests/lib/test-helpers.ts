import { CloudFormationClient, ListStackResourcesCommand } from '@aws-sdk/client-cloudformation';
import {
    AdminAddUserToGroupCommand,
    AdminCreateUserCommand,
    AdminDeleteUserCommand,
    AdminGetUserCommand,
    AdminInitiateAuthCommand,
    AdminSetUserPasswordCommand,
    CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { BatchWriteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createHmac, randomBytes } from 'crypto';
import { requireOutput } from './stack-outputs.ts';
import {
    IntegrationTestContext,
    TestDeviceInput,
    TestDeviceRecord,
    TestLocationInput,
    TestLocationRecord,
    TestScannerRecord,
    TestUserSession,
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
  const unlockQueueUrl = await requireOutput('UnlockQueueUrl').catch(() => undefined);
  const staticBucketName = await requireOutput('StaticBucketName')
    .catch(() => requireOutput('AdminBucketName'))
    .catch(() => requireOutput('AppBucketName'))
    .catch(() => '');
  const stripeEventBusName = await requireOutput('StripeEventBusName').catch(() => undefined);
  const unlockOutboxDispatcherFunctionName = await requireOutput('UnlockOutboxDispatcherFunctionName').catch(
    () => undefined
  );
  const verifyEntryFunctionName = await requireOutput('VerifyEntryFunctionName').catch(() => undefined);
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
    stripeEventBusName,
    unlockOutboxDispatcherFunctionName,
    verifyEntryFunctionName,
    region,
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

    const authRes = await cognito.send(
      new AdminInitiateAuthCommand({
        UserPoolId: context.userPoolId,
        ClientId: context.userPoolClientId,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      })
    );

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
      role: 'admin',
    };
  }

  const email = options?.email || `test-user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.com`;
  const password = options?.password || 'TestPass123!';

  const createRes = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: context.userPoolId,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS',
    })
  );

  const userId = createRes.User?.Attributes?.find((a) => a.Name === 'sub')?.Value || '';

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: context.userPoolId,
      Username: email,
      Password: password,
      Permanent: true,
    })
  );

  if (role === 'admin') {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: context.userPoolId,
        Username: email,
        GroupName: 'admins',
      })
    );
  }

  const authRes = await cognito.send(
    new AdminInitiateAuthCommand({
      UserPoolId: context.userPoolId,
      ClientId: context.userPoolClientId,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    })
  );

  const authResult = authRes.AuthenticationResult;
  if (!authResult || !authResult.IdToken || !authResult.AccessToken) {
    throw new Error(`Failed to authenticate test user ${email}`);
  }

  // Seed DynamoDB profile
  await ddb.send(
    new PutCommand({
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
        GSI1SK: `USER#${userId}`,
      },
    })
  );

  if (options?.withActiveSubscription ?? true) {
    const subId = `sub_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
    await ddb.send(
      new PutCommand({
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
          GSI1SK: `SUB#${subId}`,
        },
      })
    );
  }

  return {
    email,
    password,
    userId,
    idToken: authResult.IdToken,
    accessToken: authResult.AccessToken,
    refreshToken: authResult.RefreshToken || '',
    role,
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
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ name, address }),
  });

  if (res.status !== 201 && res.status !== 200) {
    const text = await res.text();
    throw new Error(`Failed to create test location (${res.status}): ${text}`);
  }

  const location = (await res.json()) as Omit<TestLocationRecord, 'locationId'> & { locationId?: string };
  const locationId = location.locationId || location.PK?.replace(/^LOC#/, '');

  if (!locationId) {
    throw new Error('Created test location response does not contain a location identifier');
  }

  return { ...location, locationId };
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
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      name,
      type,
      connection_params,
      api_key: rawApiKey,
    }),
  });

  if (res.status !== 201 && res.status !== 200) {
    const text = await res.text();
    throw new Error(`Failed to create test device (${res.status}): ${text}`);
  }

  const device = (await res.json()) as TestDeviceRecord;
  return { device, rawApiKey };
}

export async function createMockScanner(
  context: IntegrationTestContext,
  adminToken: string,
  locationId: string,
  options?: { name?: string; allowedQrProviders?: string[]; assignedLockerId?: string }
): Promise<TestScannerRecord> {
  const response = await fetch(`${context.apiUrl}/admin/locations/${locationId}/scanners`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: options?.name || `Mock Scanner ${Date.now()}`,
      reader_adapter: 'mock',
      allowed_qr_providers: options?.allowedQrProviders || ['mock'],
      assigned_locker_id: options?.assignedLockerId || 'crossbox-locker-relay-01',
    }),
  });
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Failed to create mock scanner (${response.status}): ${await response.text()}`);
  }
  const scanner = (await response.json()) as TestScannerRecord;
  if (!scanner.scanner_id || !scanner.scanner_api_key) {
    throw new Error('Mock scanner creation did not return a scanner ID and one-time scanner API key');
  }
  return scanner;
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
    const keyRes = await ddb.send(
      new GetCommand({
        TableName: context.mainTableName,
        Key: { PK: 'CONFIG#HMAC_CURRENT_KEY', SK: 'CONFIG' },
      })
    );
    hmacKey = keyRes.Item?.value || 'default_key';
  }

  const timestamp = Math.floor(Date.now() / 1000) + (options?.timestampOffsetSeconds || 0);
  const dataToSign = `${userId}:${timestamp}`;
  const hmac = createHmac('sha256', hmacKey!).update(dataToSign).digest('hex');

  return JSON.stringify({
    user_id: userId,
    timestamp,
    hmac,
  });
}

export async function fetchDynamoItem(
  context: IntegrationTestContext,
  tableName: string,
  pk: string,
  sk: string
): Promise<Record<string, any> | undefined> {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: context.region }));
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: pk, SK: sk },
    })
  );
  return res.Item;
}

export async function cleanupTestLocation(
  context: IntegrationTestContext,
  adminToken: string,
  locationId: string
): Promise<void> {
  await fetch(`${context.apiUrl}/admin/locations/${locationId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}

export async function cleanupTestUser(context: IntegrationTestContext, user: TestUserSession): Promise<void> {
  await cleanupTestUserByEmail(context, user.email);
}

export async function cleanupTestUserByEmail(context: IntegrationTestContext, email: string): Promise<void> {
  const cognito = new CognitoIdentityProviderClient({ region: context.region });
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: context.region }));
  const userResponse = await cognito
    .send(
      new AdminGetUserCommand({
        UserPoolId: context.userPoolId,
        Username: email,
      })
    )
    .catch(() => undefined);
  const userId = userResponse?.UserAttributes?.find((attribute) => attribute.Name === 'sub')?.Value;

  if (!userId) {
    return;
  }

  const records = await ddb.send(
    new QueryCommand({
      TableName: context.mainTableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `USER#${userId}` },
      ProjectionExpression: 'PK, SK',
    })
  );

  const deleteRequests = (records.Items ?? []).map((item) => ({
    DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
  }));

  for (let index = 0; index < deleteRequests.length; index += 25) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [context.mainTableName]: deleteRequests.slice(index, index + 25),
        },
      })
    );
  }

  await cognito.send(
    new AdminDeleteUserCommand({
      UserPoolId: context.userPoolId,
      Username: email,
    })
  );
}

export async function deleteDynamoPartition(
  context: IntegrationTestContext,
  tableName: string,
  pk: string
): Promise<void> {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: context.region }));
  const records = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ProjectionExpression: 'PK, SK',
    })
  );

  const requests = (records.Items || []).map((item) => ({ DeleteRequest: { Key: item } }));
  for (let offset = 0; offset < requests.length; offset += 25) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: { [tableName]: requests.slice(offset, offset + 25) },
      })
    );
  }
}

export async function dispatchUnlockOutbox(context: IntegrationTestContext): Promise<void> {
  let dispatcherFunctionName = context.unlockOutboxDispatcherFunctionName;

  if (!dispatcherFunctionName) {
    const stackArgumentIndex = process.argv.indexOf('--stack');
    const stackName =
      (stackArgumentIndex >= 0 ? process.argv[stackArgumentIndex + 1] : undefined) ||
      process.env.STACK_NAME ||
      'CrossboxGymDev';
    const apiStackName = `${stackName.replace(/Stack$/, '')}ApiStack`;
    const cloudFormation = new CloudFormationClient({ region: context.region });
    let nextToken: string | undefined;
    let dispatcherResource: { PhysicalResourceId?: string } | undefined;

    do {
      const resources = await cloudFormation.send(
        new ListStackResourcesCommand({ StackName: apiStackName, NextToken: nextToken })
      );
      dispatcherResource = resources.StackResourceSummaries?.find((resource) =>
        resource.LogicalResourceId?.startsWith('UnlockOutboxDispatcher')
      );
      nextToken = resources.NextToken;
    } while (!dispatcherResource && nextToken);

    dispatcherFunctionName = dispatcherResource?.PhysicalResourceId;
  }

  if (!dispatcherFunctionName) {
    throw new Error('UnlockOutboxDispatcher Lambda function was not found');
  }

  const lambda = new LambdaClient({ region: context.region });
  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: dispatcherFunctionName,
      InvocationType: 'RequestResponse',
    })
  );

  if (response.FunctionError) {
    const payload = response.Payload ? Buffer.from(response.Payload).toString('utf-8') : '';
    throw new Error(`UnlockOutboxDispatcher failed (${response.FunctionError}): ${payload}`);
  }
}

export async function scanMockDevice(
  context: IntegrationTestContext,
  scannerApiKey: string,
  mockScanValue: string,
  scannerId: string = 'hd360-qr-scanner-01'
): Promise<{ result: string; reason?: string; entry_id?: string; feedback?: string }> {
  if (!context.verifyEntryFunctionName) {
    throw new Error('VerifyEntryFunctionName is not defined in integration test context');
  }

  const lambda = new LambdaClient({ region: context.region });
  const payload = {
    event_id: `test-event-${Date.now()}`,
    client_id: scannerId,
    timestamp: Math.floor(Date.now() / 1000),
    payload: {
      raw_data: mockScanValue,
      encoding: 'utf-8',
    },
  };

  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: context.verifyEntryFunctionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    })
  );

  if (!response.Payload) {
    throw new Error('Lambda returned empty response payload');
  }

  const resultStr = Buffer.from(response.Payload).toString('utf-8');
  return JSON.parse(resultStr);
}
