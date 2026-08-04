import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';

export interface AuditLogger {
  log(adminId: string, actionType: string, details: Record<string, unknown>): Promise<void>;
}

export class DynamoDbAuditLogger implements AuditLogger {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async log(adminId: string, actionType: string, details: Record<string, unknown>): Promise<void> {
    const timestamp = new Date().toISOString();
    const auditId = randomBytes(8).toString('hex');
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `AUDIT#${adminId}`,
            SK: `${timestamp}#${auditId}`,
            audit_id: auditId,
            admin_id: adminId,
            action_type: actionType,
            timestamp,
            ...details,
          },
        })
      );
    } catch (err) {
      console.error('AuditLog write failed:', err);
    }
  }
}

export class NoOpAuditLogger implements AuditLogger {
  async log(): Promise<void> {
    // no-op for tests
  }
}
