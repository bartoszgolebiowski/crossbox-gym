import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { UnlockOutboxItem } from '../shared/access-types';
import { ddb } from '../shared/ddb-client';
import { getMainTableName, getUnlockQueueUrl } from '../shared/env';

const sqs = new SQSClient({});

export const handler = async (): Promise<{ dispatched: number; failed: number }> => {
  const tableName = getMainTableName();
  const queueUrl = getUnlockQueueUrl();

  const pending = await ddb.send(new QueryCommand({
    TableName: tableName,
    IndexName: 'OutboxStatusIndex',
    KeyConditionExpression: 'OutboxStatusPK = :status',
    ExpressionAttributeValues: { ':status': 'OUTBOX#PENDING' },
    Limit: 25,
  }));

  const items = (pending.Items || []) as UnlockOutboxItem[];
  let dispatchedCount = 0;
  let failedCount = 0;

  for (const item of items) {
    const now = new Date().toISOString();
    const attempts = (item.delivery_attempts || 0) + 1;

    try {
      await sqs.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(item.command),
      }));

      await ddb.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: 'SET #status = :dispatched, dispatched_at = :now, OutboxStatusPK = :statusPk, delivery_attempts = :attempts',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':dispatched': 'dispatched',
          ':now': now,
          ':statusPk': 'OUTBOX#DISPATCHED',
          ':attempts': attempts,
        },
      }));

      dispatchedCount++;
      console.log(JSON.stringify({
        level: 'info',
        message: 'Unlock outbox item dispatched successfully',
        command_id: item.command?.command_id,
        attempts,
      }));
    } catch (error) {
      failedCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({
        level: 'error',
        message: 'Unlock outbox dispatch failed',
        command_id: item.command?.command_id,
        error: errorMessage,
        attempts,
      }));

      await ddb.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: item.PK, SK: item.SK },
        UpdateExpression: 'SET #status = :retryable, last_error = :error, last_attempt_at = :now, OutboxStatusPK = :statusPk, delivery_attempts = :attempts',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':retryable': 'retryable-failure',
          ':error': errorMessage,
          ':now': now,
          ':statusPk': 'OUTBOX#PENDING',
          ':attempts': attempts,
        },
      }));
    }
  }

  return { dispatched: dispatchedCount, failed: failedCount };
};