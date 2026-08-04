import { WebhookContext } from '../context';

const STATUS_MAP: Record<string, string> = {
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  unpaid: 'SUSPENDED',
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
  const status =
    eventType === 'customer.subscription.deleted' ? 'CANCELED' : STATUS_MAP[subscription.status] || 'EXPIRED';

  const subscriptionId = subscription.id;
  const subItem = await ctx.billingRepository.findSubscriptionByStripeId(subscriptionId);

  if (!subItem) {
    return;
  }

  const nowIso = new Date().toISOString();
  const gracePeriodEnd = status === 'PAST_DUE' ? new Date(Date.now() + 7 * 86400 * 1000).toISOString() : null;

  await ctx.billingRepository.updateSubscriptionStatus({
    pk: subItem.PK,
    sk: subItem.SK,
    status,
    gracePeriodEnd,
    updatedAt: nowIso,
  });
}
