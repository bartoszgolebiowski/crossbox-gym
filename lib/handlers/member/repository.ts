import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConsentRecord, LocationItem, SubscriptionItem, UserItem } from '../shared/types';

export interface StoredInvoice {
  id: string;
  number: string;
  total: number;
  tax: number;
  currency: string;
  status: string;
  pdfUrl: string | null;
  createdAt: string | null;
}

export interface MemberRepository {
  getUserProfile(userId: string): Promise<UserItem | undefined>;
  getUserSubscription(userId: string): Promise<SubscriptionItem | undefined>;
  listLocations(): Promise<LocationItem[]>;
  recordConsent(params: { userId: string; termsVersion: string; ipAddress: string; acceptedAt: string }): Promise<void>;
  getConfigValue(configKey: string): Promise<string | undefined>;
  listStoredInvoices(userId: string): Promise<StoredInvoice[]>;
}

export class DynamoDbMemberRepository implements MemberRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async getUserProfile(userId: string): Promise<UserItem | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
      })
    );
    return result.Item as UserItem | undefined;
  }

  async getUserSubscription(userId: string): Promise<SubscriptionItem | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'SUB#',
        },
      })
    );
    return result.Items?.[0] as SubscriptionItem | undefined;
  }

  async listLocations(): Promise<LocationItem[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': 'LOCATIONS' },
      })
    );
    return (result.Items || []) as LocationItem[];
  }

  async recordConsent(params: {
    userId: string;
    termsVersion: string;
    ipAddress: string;
    acceptedAt: string;
  }): Promise<void> {
    const consent: ConsentRecord = {
      PK: `USER#${params.userId}`,
      SK: `CONSENT#${params.acceptedAt}`,
      terms_version: params.termsVersion,
      ip_address: params.ipAddress,
    };

    await Promise.all([
      this.client.send(new PutCommand({ TableName: this.tableName, Item: consent })),
      this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: `USER#${params.userId}`, SK: 'PROFILE' },
          UpdateExpression: 'SET terms_accepted_at = :now, terms_version = :version, terms_ip = :ipAddress',
          ExpressionAttributeValues: {
            ':now': params.acceptedAt,
            ':version': params.termsVersion,
            ':ipAddress': params.ipAddress,
          },
        })
      ),
    ]);
  }

  async getConfigValue(configKey: string): Promise<string | undefined> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `CONFIG#${configKey}`, SK: 'CONFIG' },
      })
    );
    return result.Item?.value as string | undefined;
  }

  async listStoredInvoices(userId: string): Promise<StoredInvoice[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :invoicePrefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':invoicePrefix': 'INVOICE#',
        },
      })
    );

    return (result.Items || []).map((item) => ({
      id: item.invoice_id,
      number: item.invoice_number || item.invoice_id,
      total: item.total ?? 0,
      tax: item.tax_amount ?? item.tax ?? 0,
      currency: item.currency || '',
      status: item.status || '',
      pdfUrl: item.pdf_url || null,
      createdAt: item.created_at || item.paid_at || null,
    }));
  }
}
