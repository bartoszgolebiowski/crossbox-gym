import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';
import { getEntryLogsTableName, getMainTableName } from '../config';
import { ddb, getScannerById } from '../database';
import { BasicSubscriptionProvider, DefaultProviderClassifier, MockProvider, TildeV130Provider } from './qr';
import { CommitResult, VerificationResult, VerifiedCredential } from './types';

export class AccessService {
  private classifier: DefaultProviderClassifier;

  constructor() {
    this.classifier = new DefaultProviderClassifier([
      new TildeV130Provider(),
      new BasicSubscriptionProvider(),
      new MockProvider(),
    ]);
  }

  async verifyRawData(rawData: string): Promise<VerificationResult> {
    const classification = await this.classifier.classify(rawData);

    if (classification.status !== 'recognized' || !classification.providerId) {
      return { success: false, reason: classification.reason || 'unrecognized_format' };
    }

    const provider = this.classifier.getProvider(classification.providerId);
    if (!provider) {
      return { success: false, reason: 'provider_not_found' };
    }

    return provider.verify(rawData);
  }

  async commitAccess(scannerId: string, credential: VerifiedCredential): Promise<CommitResult> {
    const mainTable = getMainTableName();
    const entryLogsTable = getEntryLogsTableName();

    const scanner = await getScannerById(mainTable, scannerId);
    const locationId = scanner ? scanner.location_id : 'LOC_DEFAULT';

    // Enforce scanner's allowed_qr_providers whitelist
    if (scanner?.allowed_qr_providers && scanner.allowed_qr_providers.length > 0) {
      if (!scanner.allowed_qr_providers.includes(credential.providerId as any)) {
        return { success: false, reason: 'unavailable' };
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const committedAt = new Date().toISOString();
    const entryId = randomBytes(12).toString('hex');
    const antiPassbackKey = `USER#${credential.subjectId}#LOC#${locationId}`;

    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: mainTable,
                Key: { PK: `ANTIPASS#${antiPassbackKey}`, SK: 'STATE' },
                UpdateExpression: 'SET last_entry_at = :now, #ttl = :ttl',
                ConditionExpression: 'attribute_not_exists(last_entry_at) OR last_entry_at <= :cooldown',
                ExpressionAttributeNames: { '#ttl': 'ttl' },
                ExpressionAttributeValues: {
                  ':now': now,
                  ':cooldown': now - 15 * 60,
                  ':ttl': now + 365 * 24 * 60 * 60,
                },
              },
            },
            {
              Put: {
                TableName: entryLogsTable,
                Item: {
                  PK: `USER#${credential.subjectId}`,
                  SK: `ENTRY#${committedAt}#${entryId}`,
                  entry_id: entryId,
                  user_id: credential.subjectId,
                  location_id: locationId,
                  timestamp: committedAt,
                  result: 'success',
                  device_id: scannerId,
                  scanner_id: scannerId,
                  qr_provider_id: credential.providerId,
                  AntiPassbackPK: antiPassbackKey,
                  ttl: now + 365 * 24 * 60 * 60,
                },
              },
            },
          ],
        })
      );
      return { success: true, entryId };
    } catch (error: any) {
      console.error('[AccessService] TransactWrite transaction failed:', error);
      if (
        error.name === 'TransactionCanceledException' &&
        error.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed'
      ) {
        return { success: false, reason: 'anti_passback_cooldown' };
      }
      return { success: false, reason: 'transaction_failed' };
    }
  }
}
