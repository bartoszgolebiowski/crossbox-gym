import { createHash, randomBytes } from 'crypto';
import { WebhookContext } from '../context';

/**
 * Handles the checkout.session.completed Stripe event.
 * Creates an identity user and provisions DynamoDB profile + subscription items.
 * If user is newly created, generates an invitation magic link for password setup.
 */
export async function handleCheckoutSessionCompleted(session: any, ctx: WebhookContext): Promise<void> {
  const customerEmail = session.customer_details?.email || session.customer_email;
  const subscriptionId = session.subscription;
  const customerId = session.customer;

  if (!customerEmail || !subscriptionId || !customerId) {
    return;
  }

  const ensureResult = await ctx.identityProvider.ensureUser(ctx.userPoolId, customerEmail);
  const cognitoSub = typeof ensureResult === 'string' ? ensureResult : ensureResult.sub;
  const isNewUser = typeof ensureResult === 'object' ? ensureResult.created : false;

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

  // When user is newly created, generate invitation link for password setup
  if (isNewUser && ctx.authRepository) {
    try {
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const nowSeconds = Math.floor(Date.now() / 1000);
      const ttl = nowSeconds + 24 * 3600; // 24 hours

      await ctx.authRepository.saveMagicLinkToken(tokenHash, customerEmail, ttl);

      const frontendUrl = ctx.frontendUrl.replace(/\/+$/, '');
      const invitationUrl = `${frontendUrl}/auth/magic-link/verify?token=${token}&email=${encodeURIComponent(
        customerEmail
      )}`;

      console.log(`[Checkout Completed] New user invitation link generated for ${customerEmail}: ${invitationUrl}`);

      if (ctx.emailService) {
        await ctx.emailService.sendWelcomeVerifyEmail(customerEmail, invitationUrl);
      }
    } catch (err) {
      console.error(`Failed to generate invitation link or send email for ${customerEmail}:`, err);
    }
  }
}
