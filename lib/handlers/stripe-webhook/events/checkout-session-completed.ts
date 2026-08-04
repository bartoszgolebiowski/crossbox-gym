import { WebhookContext } from '../context';

/**
 * Handles the checkout.session.completed Stripe event.
 * Creates an identity user and provisions DynamoDB profile + subscription items.
 */
export async function handleCheckoutSessionCompleted(session: any, ctx: WebhookContext): Promise<void> {
  const customerEmail = session.customer_details?.email || session.customer_email;
  const subscriptionId = session.subscription;
  const customerId = session.customer;

  if (!customerEmail || !subscriptionId || !customerId) {
    return;
  }

  const cognitoSub = await ctx.identityProvider.ensureUser(ctx.userPoolId, customerEmail);
  if (!cognitoSub) {
    return;
  }

  const userId = cognitoSub;
  const now = new Date().toISOString();

  await ctx.billingRepository.createUserProfile({
    userId,
    email: customerEmail,
    cognitoSub,
    role: 'member',
    createdAt: now,
  });

  // Idempotent create: subscription (sets GSI1PK=STATUS#ACTIVE for GraceExpiryCron scan)
  await ctx.billingRepository.createSubscription({
    userId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    status: 'ACTIVE',
    createdAt: now,
  });
}
