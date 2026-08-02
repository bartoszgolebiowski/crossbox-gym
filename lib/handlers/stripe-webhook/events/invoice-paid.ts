import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../../shared/database';
import { SubscriptionItem } from '../../shared/types';
import { WebhookContext } from '../context';

/**
 * Handles the invoice.paid Stripe event.
 * Persists invoice metadata and tax details into DynamoDB for user history and tax reporting.
 */
export async function handleInvoicePaid(
  invoice: any,
  ctx: WebhookContext
): Promise<void> {
  const subscriptionId = invoice.subscription;

  if (!subscriptionId) {
    return;
  }

  // Query user subscription by stripe_subscription_id to find PK (USER#<userId>)
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

  // Persist invoice metadata & tax details into DynamoDB for user history & tax reporting
  await ddb.send(new PutCommand({
    TableName: ctx.mainTableName,
    Item: {
      PK: subItem.PK, // USER#<userId>
      SK: `INVOICE#${invoice.id}`,
      invoice_id: invoice.id,
      invoice_number: invoice.number || null,
      pdf_url: invoice.invoice_pdf || null,
      total: invoice.total,
      tax_amount: invoice.tax || invoice.amount_tax || 0,
      currency: invoice.currency,
      status: invoice.status,
      created_at: nowIso,
      paid_at: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : nowIso,
    }
  })).catch(() => {});
}
