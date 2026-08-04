import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { MagicLinkRateLimit, MagicLinkToken } from '../shared/types';

export interface AuthRepository {
  getMagicLinkToken(tokenHash: string): Promise<MagicLinkToken | undefined>;
  saveMagicLinkToken(tokenHash: string, email: string, ttl: number): Promise<void>;
  getMagicLinkRateLimit(email: string): Promise<MagicLinkRateLimit | undefined>;
  saveMagicLinkRateLimit(email: string, requestCount: number, windowStart: string, ttl: number): Promise<void>;
  updatePasswordSet(sub: string): Promise<void>;
  createUserProfile(sub: string, email: string, role: string): Promise<void>;
}

export class DynamoDbAuthRepository implements AuthRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async getMagicLinkToken(tokenHash: string): Promise<MagicLinkToken | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `TOKEN#${tokenHash}`, SK: 'TOKEN' },
      })
    );
    return result.Item as MagicLinkToken | undefined;
  }

  async saveMagicLinkToken(tokenHash: string, email: string, ttl: number): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `TOKEN#${tokenHash}`,
          SK: 'TOKEN',
          user_id: email,
          created_at: new Date().toISOString(),
          ttl,
        } as MagicLinkToken,
      })
    );
  }

  async getMagicLinkRateLimit(email: string): Promise<MagicLinkRateLimit | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `RATELIMIT#${email}`, SK: 'RATELIMIT' },
      })
    );
    return result.Item as MagicLinkRateLimit | undefined;
  }

  async saveMagicLinkRateLimit(email: string, requestCount: number, windowStart: string, ttl: number): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `RATELIMIT#${email}`,
          SK: 'RATELIMIT',
          request_count: requestCount,
          window_start: windowStart,
          ttl,
        } as MagicLinkRateLimit,
      })
    );
  }

  async updatePasswordSet(sub: string): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: `USER#${sub}`, SK: 'PROFILE' },
        UpdateExpression: 'SET password_set = :true',
        ExpressionAttributeValues: { ':true': true },
      })
    );
  }

  async createUserProfile(sub: string, email: string, role: string): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${sub}`,
          SK: 'PROFILE',
          email,
          role,
          password_set: true,
          created_at: new Date().toISOString(),
        },
      })
    );
  }
}
