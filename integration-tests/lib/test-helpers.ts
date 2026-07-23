import { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand, 
  AdminSetUserPasswordCommand, 
  AdminAddUserToGroupCommand,
  AdminInitiateAuthCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { createHmac } from 'crypto';
import { requireOutput } from './stack-outputs.ts';
import {
  IntegrationTestContext,
  TestUserSession,
  TestLocationInput,
  TestLocationRecord,
  TestDeviceInput,
  TestDeviceRecord
} from './types.ts';

export async function getTestContext(): Promise<IntegrationTestContext> {
  // TODO: Fetch CfnOutputs and populate IntegrationTestContext object
  throw new Error('Not implemented');
}

export async function createTestUserSession(
  context: IntegrationTestContext,
  options?: {
    email?: string;
    password?: string;
    role?: 'admin' | 'member';
  }
): Promise<TestUserSession> {
  // TODO: Implement Cognito AdminCreateUser, AdminSetUserPassword, AdminAddUserToGroup, AdminInitiateAuth
  throw new Error('Not implemented');
}

export async function createTestLocation(
  context: IntegrationTestContext,
  adminToken: string,
  input?: Partial<TestLocationInput>
): Promise<TestLocationRecord> {
  // TODO: Call POST /admin/locations with adminToken and return created location record
  throw new Error('Not implemented');
}

export async function createTestDevice(
  context: IntegrationTestContext,
  adminToken: string,
  locationId: string,
  input?: Partial<TestDeviceInput>
): Promise<{ device: TestDeviceRecord; rawApiKey: string }> {
  // TODO: Call POST /admin/locations/{id}/devices with adminToken and return device + rawApiKey
  throw new Error('Not implemented');
}

export async function generateTestQRPayload(
  context: IntegrationTestContext,
  userId: string,
  options?: {
    timestampOffsetSeconds?: number;
    customHmacKey?: string;
  }
): Promise<string> {
  // TODO: Read CONFIG#HMAC_CURRENT_KEY from DynamoDB, compute HMAC signature, return JSON string
  throw new Error('Not implemented');
}

export async function fetchDynamoItem(
  context: IntegrationTestContext,
  tableName: string,
  pk: string,
  sk: string
): Promise<Record<string, any> | undefined> {
  // TODO: Send GetCommand to DynamoDB DocumentClient and return Item
  throw new Error('Not implemented');
}

export async function cleanupTestLocation(
  context: IntegrationTestContext,
  adminToken: string,
  locationId: string
): Promise<void> {
  // TODO: Call DELETE /admin/locations/{id} with adminToken
  throw new Error('Not implemented');
}
