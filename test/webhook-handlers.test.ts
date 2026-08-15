import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AuthRepository } from '../lib/handlers/auth/repository';
import { EnsureUserResult, IdentityProvider } from '../lib/handlers/shared/identity';
import { SubscriptionItem } from '../lib/handlers/shared/types';
import { WebhookContext } from '../lib/handlers/stripe-webhook/context';
import { handleCheckoutSessionCompleted } from '../lib/handlers/stripe-webhook/events/checkout-session-completed';
import { handleInvoicePaid } from '../lib/handlers/stripe-webhook/events/invoice-paid';
import { handleSubscriptionUpdated } from '../lib/handlers/stripe-webhook/events/subscription-updated';
import {
  BillingRepository,
  CreateSubscriptionParams,
  CreateUserProfileParams,
  StoreInvoiceParams,
  UpdateSubscriptionStatusParams,
} from '../lib/handlers/stripe-webhook/repository';

class FakeBillingRepository implements BillingRepository {
  userProfiles: CreateUserProfileParams[] = [];
  subscriptions: CreateSubscriptionParams[] = [];
  statusUpdates: UpdateSubscriptionStatusParams[] = [];
  invoices: StoreInvoiceParams[] = [];
  private subscriptionsByStripeId = new Map<string, SubscriptionItem>();

  async createUserProfile(params: CreateUserProfileParams): Promise<void> {
    this.userProfiles.push(params);
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<void> {
    this.subscriptions.push(params);
    this.subscriptionsByStripeId.set(params.stripeSubscriptionId, {
      PK: `USER#${params.userId}`,
      SK: `SUB#${params.stripeSubscriptionId}`,
      stripe_subscription_id: params.stripeSubscriptionId,
      stripe_customer_id: params.stripeCustomerId,
      status: params.status as any,
      created_at: params.createdAt,
      updated_at: params.createdAt,
    });
  }

  async findSubscriptionByStripeId(stripeSubscriptionId: string): Promise<SubscriptionItem | undefined> {
    return this.subscriptionsByStripeId.get(stripeSubscriptionId);
  }

  async updateSubscriptionStatus(params: UpdateSubscriptionStatusParams): Promise<void> {
    this.statusUpdates.push(params);
    const sub = this.subscriptionsByStripeId.get(params.sk.replace('SUB#', ''));
    if (sub) {
      sub.status = params.status as any;
      sub.updated_at = params.updatedAt;
    }
  }

  async storeInvoice(params: StoreInvoiceParams): Promise<void> {
    this.invoices.push(params);
  }
}

class FakeAuthRepository implements AuthRepository {
  public tokens = new Map<string, { tokenHash: string; email: string; ttl: number }>();

  async getMagicLinkToken(tokenHash: string) {
    const item = this.tokens.get(tokenHash);
    if (!item) return undefined;
    return { PK: `TOKEN#${tokenHash}`, SK: 'TOKEN', user_id: item.email, created_at: new Date().toISOString(), ttl: item.ttl };
  }

  async saveMagicLinkToken(tokenHash: string, email: string, ttl: number) {
    this.tokens.set(tokenHash, { tokenHash, email, ttl });
  }

  async getMagicLinkRateLimit() {
    return undefined;
  }

  async saveMagicLinkRateLimit() {}

  async updatePasswordSet() {}

  async createUserProfile() {}
}

class FakeIdentityProvider implements IdentityProvider {
  constructor(private readonly subByEmail = new Map<string, string>()) {}

  async ensureUser(_userPoolId: string, email: string): Promise<EnsureUserResult> {
    const existing = this.subByEmail.get(email);
    if (existing) return { sub: existing, created: false };
    const sub = `sub_${email}`;
    this.subByEmail.set(email, sub);
    return { sub, created: true };
  }
}

function createContext(
  overrides: { billingRepository?: BillingRepository; identityProvider?: IdentityProvider; authRepository?: AuthRepository } = {}
): WebhookContext {
  return {
    mainTableName: 'CrossboxGymMainTable',
    userPoolId: 'mock-pool',
    frontendUrl: 'https://app.example.test',
    identityProvider: overrides.identityProvider || new FakeIdentityProvider(),
    billingRepository: overrides.billingRepository || new FakeBillingRepository(),
    authRepository: overrides.authRepository || new FakeAuthRepository(),
  };
}

describe('Stripe Webhook Event Handlers', () => {
  test('checkout.session.completed creates user profile and subscription', async () => {
    const billingRepository = new FakeBillingRepository();
    const identityProvider = new FakeIdentityProvider();
    const ctx = createContext({ billingRepository, identityProvider });

    await handleCheckoutSessionCompleted(
      {
        customer_details: { email: 'member@example.test' },
        customer: 'cus_123',
        subscription: 'sub_123',
      },
      ctx
    );

    assert.equal(billingRepository.userProfiles.length, 1);
    assert.equal(billingRepository.userProfiles[0].email, 'member@example.test');
    assert.equal(billingRepository.subscriptions.length, 1);
    assert.equal(billingRepository.subscriptions[0].stripeSubscriptionId, 'sub_123');
    assert.equal(billingRepository.subscriptions[0].status, 'ACTIVE');
  });

  test('checkout.session.completed skips when required fields are missing', async () => {
    const billingRepository = new FakeBillingRepository();
    const ctx = createContext({ billingRepository });

    await handleCheckoutSessionCompleted({ customer_email: 'member@example.test' }, ctx);

    assert.equal(billingRepository.userProfiles.length, 0);
    assert.equal(billingRepository.subscriptions.length, 0);
  });

  test('customer.subscription.updated updates subscription status', async () => {
    const billingRepository = new FakeBillingRepository();
    const ctx = createContext({ billingRepository });

    await handleCheckoutSessionCompleted(
      {
        customer_details: { email: 'member@example.test' },
        customer: 'cus_123',
        subscription: 'sub_123',
      },
      ctx
    );

    await handleSubscriptionUpdated({ id: 'sub_123', status: 'past_due' }, 'customer.subscription.updated', ctx);

    assert.equal(billingRepository.statusUpdates.length, 1);
    assert.equal(billingRepository.statusUpdates[0].status, 'PAST_DUE');
    assert.ok(billingRepository.statusUpdates[0].gracePeriodEnd);
  });

  test('customer.subscription.deleted sets status to CANCELED', async () => {
    const billingRepository = new FakeBillingRepository();
    const ctx = createContext({ billingRepository });

    await handleCheckoutSessionCompleted(
      {
        customer_details: { email: 'member@example.test' },
        customer: 'cus_123',
        subscription: 'sub_123',
      },
      ctx
    );

    await handleSubscriptionUpdated({ id: 'sub_123' }, 'customer.subscription.deleted', ctx);

    assert.equal(billingRepository.statusUpdates[0].status, 'CANCELED');
  });

  test('invoice.paid stores invoice metadata', async () => {
    const billingRepository = new FakeBillingRepository();
    const ctx = createContext({ billingRepository });

    await handleCheckoutSessionCompleted(
      {
        customer_details: { email: 'member@example.test' },
        customer: 'cus_123',
        subscription: 'sub_123',
      },
      ctx
    );

    await handleInvoicePaid(
      {
        id: 'in_123',
        subscription: 'sub_123',
        number: 'INV-001',
        invoice_pdf: 'https://stripe.com/invoice.pdf',
        total: 4900,
        tax: 916,
        currency: 'pln',
        status: 'paid',
        status_transitions: { paid_at: 1704067200 },
      },
      ctx
    );

    assert.equal(billingRepository.invoices.length, 1);
    const invoice = billingRepository.invoices[0];
    assert.equal(invoice.invoiceId, 'in_123');
    assert.equal(invoice.total, 4900);
    assert.equal(invoice.taxAmount, 916);
    assert.equal(invoice.userId, 'sub_member@example.test');
  });

  test('checkout.session.completed generates invitation link only for new users', async () => {
    const billingRepository = new FakeBillingRepository();
    const authRepository = new FakeAuthRepository();
    const identityProvider = new FakeIdentityProvider();
    const ctx = createContext({ billingRepository, authRepository, identityProvider });

    // First checkout: new user
    await handleCheckoutSessionCompleted(
      {
        customer_details: { email: 'newuser@example.test' },
        customer: 'cus_new',
        subscription: 'sub_new',
      },
      ctx
    );
    assert.equal(authRepository.tokens.size, 1);

    // Second checkout: existing user
    await handleCheckoutSessionCompleted(
      {
        customer_details: { email: 'newuser@example.test' },
        customer: 'cus_new2',
        subscription: 'sub_new2',
      },
      ctx
    );
    // Tokens size should remain 1 (no new invitation generated for existing user)
    assert.equal(authRepository.tokens.size, 1);
  });
});
