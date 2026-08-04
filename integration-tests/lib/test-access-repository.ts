import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { IntegrationTestContext } from './types';

export interface AccessEntryRecord {
  entry_id: string;
  scanner_id: string;
  qr_provider_id: string;
  location_id: string;
  timestamp: string;
  result: 'success' | 'denied';
}

export interface AntiPassbackStateRecord {
  PK: string;
  SK: string;
  last_entry_at: number;
  ttl: number;
}

export class TestAccessRepository {
  private readonly ddb: DynamoDBDocumentClient;

  constructor(private readonly context: IntegrationTestContext) {
    this.ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: context.region }));
  }

  /** Queries entry log items for a specific user */
  async getUserEntryLogs(userId: string): Promise<AccessEntryRecord[]> {
    const res = await this.ddb.send(
      new QueryCommand({
        TableName: this.context.entryLogsTableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}` },
      })
    );
    return (res.Items || []) as AccessEntryRecord[];
  }

  /** Fetches anti-passback state for a user at a location */
  async getAntiPassbackState(userId: string, locationId: string): Promise<AntiPassbackStateRecord | undefined> {
    const res = await this.ddb.send(
      new GetCommand({
        TableName: this.context.mainTableName,
        Key: { PK: `ANTIPASS#USER#${userId}#LOC#${locationId}`, SK: 'STATE' },
      })
    );
    return res.Item as AntiPassbackStateRecord | undefined;
  }

  /** Seeds a custom subscription state for a test user */
  async seedUserSubscription(
    userId: string,
    subscriptionId: string,
    status: string,
    gracePeriodEnd?: string
  ): Promise<void> {
    await this.ddb.send(
      new PutCommand({
        TableName: this.context.mainTableName,
        Item: {
          PK: `USER#${userId}`,
          SK: `SUB#${subscriptionId}`,
          status,
          grace_period_end: gracePeriodEnd || null,
          created_at: new Date().toISOString(),
        },
      })
    );
  }

  /** Deletes an entire partition by PK from a table */
  async deletePartition(tableName: string, pk: string): Promise<void> {
    const records = await this.ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        ProjectionExpression: 'PK, SK',
      })
    );

    const requests = (records.Items || []).map((item) => ({ DeleteRequest: { Key: item } }));
    for (let offset = 0; offset < requests.length; offset += 25) {
      await this.ddb.send(
        new BatchWriteCommand({
          RequestItems: { [tableName]: requests.slice(offset, offset + 25) },
        })
      );
    }
  }

  /** Cleans up anti-passback state for a user at a location */
  async deleteAntiPassbackState(userId: string, locationId: string): Promise<void> {
    await this.ddb
      .send(
        new BatchWriteCommand({
          RequestItems: {
            [this.context.mainTableName]: [
              { DeleteRequest: { Key: { PK: `ANTIPASS#USER#${userId}#LOC#${locationId}`, SK: 'STATE' } } },
            ],
          },
        })
      )
      .catch(() => undefined);
  }
}
