import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { ddb } from '../shared/db';
import { SubscriptionItem } from '../shared/types';

const graceExpiryEnvironmentSchema = z.object({
  MAIN_TABLE_NAME: z.string().min(1, 'MAIN_TABLE_NAME is required'),
});

export const handler = async (): Promise<void> => {
  const nowIso = new Date().toISOString();
  const env = graceExpiryEnvironmentSchema.parse(process.env);
  const mainTable = env.MAIN_TABLE_NAME;

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
