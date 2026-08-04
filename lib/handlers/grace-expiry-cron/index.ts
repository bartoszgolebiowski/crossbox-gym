import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/database';
import { SubscriptionItem } from '../shared/types';
import { getMainTableName } from '../shared/config';

export const handler = async (): Promise<void> => {
  const nowIso = new Date().toISOString();
  const mainTable = getMainTableName();

  const result = await ddb.send(
    new QueryCommand({
      TableName: mainTable,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': 'STATUS#PAST_DUE' },
    })
  );

  const items = (result.Items || []) as SubscriptionItem[];
  let transitionedCount = 0;

  for (const item of items) {
    if (item.grace_period_end && item.grace_period_end < nowIso) {
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: mainTable,
            Key: { PK: item.PK, SK: item.SK },
            UpdateExpression: 'SET #status = :newStatus, GSI1PK = :newGsi',
            ConditionExpression: '#status = :oldStatus',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':newStatus': 'SUSPENDED',
              ':newGsi': 'STATUS#SUSPENDED',
              ':oldStatus': 'PAST_DUE',
            },
          })
        );

        transitionedCount++;
      } catch (err: any) {
        if (err.name === 'ConditionalCheckFailedException') {
          // Status changed concurrently, skip
          continue;
        }
        console.error(`GraceExpiryCron error processing ${item.PK}:`, err);
      }
    }
  }

  console.log(`GraceExpiryCron completed. Transitioned ${transitionedCount} subscriptions to SUSPENDED.`);
};
