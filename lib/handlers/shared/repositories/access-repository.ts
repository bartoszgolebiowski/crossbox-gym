import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';
import { ScannerItem } from '../access/types';
import { VerifiedCredential } from '../providers/types';

export interface AccessCommitParams {
  scanner: ScannerItem;
  credential: VerifiedCredential;
  scannerId: string;
  committedAt: string;
  committedAtEpochSeconds: number;
}

export type AccessCommitOutcome = 'committed' | 'anti_passback_cooldown' | 'failed';

export interface AccessRepository {
  findActiveScanner(scannerId: string): Promise<ScannerItem | undefined>;
  getQrSigningKeys(): Promise<{ currentKey?: string; previousKey?: string }>;
  getUserSubscription(userId: string): Promise<{ status: string; grace_period_end?: string } | undefined>;
  commitAccess(params: AccessCommitParams): Promise<{ outcome: AccessCommitOutcome; entryId?: string }>;
}

export class DynamoDbAccessRepository implements AccessRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly mainTableName: string,
    private readonly entryLogsTableName: string
  ) {}

  async findActiveScanner(scannerId: string): Promise<ScannerItem | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.mainTableName,
        IndexName: 'DeviceIdIndex',
        KeyConditionExpression: 'device_id = :deviceId',
        ExpressionAttributeValues: { ':deviceId': scannerId },
      })
    );
    const scanner = result.Items?.find((item) => String(item.SK).startsWith('SCANNER#')) as ScannerItem | undefined;
    return scanner?.status === 'active' ? scanner : undefined;
  }

  async getQrSigningKeys(): Promise<{ currentKey?: string; previousKey?: string }> {
    const [current, previous] = await Promise.all([
      this.client.send(
        new GetCommand({
          TableName: this.mainTableName,
          Key: { PK: 'CONFIG#HMAC_CURRENT_KEY', SK: 'CONFIG' },
        })
      ),
      this.client.send(
        new GetCommand({
          TableName: this.mainTableName,
          Key: { PK: 'CONFIG#HMAC_PREVIOUS_KEY', SK: 'CONFIG' },
        })
      ),
    ]);
    return {
      currentKey: current.Item?.value as string | undefined,
      previousKey: previous.Item?.value as string | undefined,
    };
  }

  async getUserSubscription(userId: string): Promise<{ status: string; grace_period_end?: string } | undefined> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.mainTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'SUB#',
        },
      })
    );
    return result.Items?.[0] as { status: string; grace_period_end?: string } | undefined;
  }

  async commitAccess(params: AccessCommitParams): Promise<{ outcome: AccessCommitOutcome; entryId?: string }> {
    const entryId = randomBytes(12).toString('hex');
    const antiPassbackKey = `USER#${params.credential.subjectId}#LOC#${params.scanner.location_id}`;

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.mainTableName,
                Key: { PK: `ANTIPASS#${antiPassbackKey}`, SK: 'STATE' },
                UpdateExpression: 'SET last_entry_at = :now, #ttl = :ttl',
                ConditionExpression: 'attribute_not_exists(last_entry_at) OR last_entry_at <= :cooldown',
                ExpressionAttributeNames: { '#ttl': 'ttl' },
                ExpressionAttributeValues: {
                  ':now': params.committedAtEpochSeconds,
                  ':cooldown': params.committedAtEpochSeconds - 15 * 60,
                  ':ttl': params.committedAtEpochSeconds + 365 * 24 * 60 * 60,
                },
              },
            },
            {
              Put: {
                TableName: this.entryLogsTableName,
                Item: {
                  PK: `USER#${params.credential.subjectId}`,
                  SK: `ENTRY#${params.committedAt}#${entryId}`,
                  entry_id: entryId,
                  user_id: params.credential.subjectId,
                  location_id: params.scanner.location_id,
                  timestamp: params.committedAt,
                  result: 'success',
                  device_id: params.scannerId,
                  scanner_id: params.scannerId,
                  qr_provider_id: params.credential.providerId,
                  AntiPassbackPK: antiPassbackKey,
                  ttl: params.committedAtEpochSeconds + 365 * 24 * 60 * 60,
                },
              },
            },
          ],
        })
      );
      return { outcome: 'committed', entryId };
    } catch (error) {
      console.error('[DynamoDbAccessRepository] Access transaction failed:', error);
      if (
        error instanceof Error &&
        error.name === 'TransactionCanceledException' &&
        (error as Error & { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons?.[0]?.Code ===
          'ConditionalCheckFailed'
      ) {
        return { outcome: 'anti_passback_cooldown' };
      }
      return { outcome: 'failed' };
    }
  }
}
