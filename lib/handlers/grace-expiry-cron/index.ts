import { QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../shared/ddb-client';
import { createEmailProvider } from '../shared/providers';
import { SubscriptionItem, UserItem } from '../shared/types';

const MAIN_TABLE = process.env.MAIN_TABLE_NAME!;

export const handler = async (): Promise<void> => {
  const nowIso = new Date().toISOString();
  
  const result = await ddb.send(new QueryCommand({
    TableName: MAIN_TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: { ':pk': 'STATUS#PAST_DUE' }
  }));

  const items = (result.Items || []) as SubscriptionItem[];
  const emailProvider = createEmailProvider(process.env.EMAIL_PROVIDER || 'mock');
  let transitionedCount = 0;

  for (const item of items) {
    if (item.grace_period_end && item.grace_period_end < nowIso) {
      try {
        await ddb.send(new UpdateCommand({
          TableName: MAIN_TABLE,
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: 'SET #status = :newStatus, GSI1PK = :newGsi',
          ConditionExpression: '#status = :oldStatus',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':newStatus': 'SUSPENDED',
            ':newGsi': 'STATUS#SUSPENDED',
            ':oldStatus': 'PAST_DUE'
          }
        }));

        transitionedCount++;

        // Fetch user profile to send email
        const userResult = await ddb.send(new GetCommand({
          TableName: MAIN_TABLE,
          Key: { PK: item.PK, SK: 'PROFILE' }
        }));
        const user = userResult.Item as UserItem | undefined;

        if (user && user.email) {
          await emailProvider.sendEmail({
            to: user.email,
            from: process.env.SES_SENDER_EMAIL || 'no-reply@crossbox.com',
            subject: 'Account Suspended - CrossBox Gym',
            body: 'Your account has been suspended due to an overdue payment following your grace period.'
          });
        }
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
