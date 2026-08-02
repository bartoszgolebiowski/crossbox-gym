import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../../shared/database';
import { SubscriptionItem } from '../../shared/types';
import { WebhookContext } from '../context';

const STATUS_MAP: Record<string, string> = {
  'active': 'ACTIVE',
  'past_due': 'PAST_DUE',
  'canceled': 'CANCELED',
  'unpaid': 'SUSPENDED'
};

/**
 * Handles both customer.subscription.updated and customer.subscription.deleted Stripe events.
 * Updates the subscription status in DynamoDB and sets a grace period for PAST_DUE subscriptions.
 */
export async function handleSubscriptionUpdated(
  subscription: any,
  eventType: string,
  ctx: WebhookContext
): Promise<void> {
  const status = eventType === 'customer.subscription.deleted'
    ? 'CANCELED'
    : (STATUS_MAP[subscription.status] || 'EXPIRED');

  const subscriptionId = subscription.id;

  // Look up subscription using StripeSubIndex GSI
  const subQueryRes = await ddb.send(new QueryCommand({
    TableName: ctx.mainTableName,
    IndexName: 'StripeSubIndex',
    KeyConditionExpression: 'stripe_subscription_id = :subId',
    ExpressionAttributeValues: { ':subId': subscriptionId }
  }));

  if (!subQueryRes.Items || subQueryRes.Items.length === 0) {
    return;
  }

  const subItem = subQueryRes.Items[0] as SubscriptionItem;
  const nowIso = new Date().toISOString();

  let updateExpr = 'SET #status = :status, updated_at = :now, GSI1PK = :gsi';
  const exprAttrNames: Record<string, string> = { '#status': 'status' };
  const exprAttrValues: Record<string, any> = {
    ':status': status,
    ':now': nowIso,
    ':gsi': `STATUS#${status}`
  };

  if (status === 'PAST_DUE') {
    // Set 7-day grace period
    const graceEndIso = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
    updateExpr += ', grace_period_end = :graceEnd';
    exprAttrValues[':graceEnd'] = graceEndIso;
  }

  await ddb.send(new UpdateCommand({
    TableName: ctx.mainTableName,
    Key: { PK: subItem.PK, SK: subItem.SK },
    UpdateExpression: updateExpr,
    ExpressionAttributeNames: exprAttrNames,
    ExpressionAttributeValues: exprAttrValues
  }));
}
