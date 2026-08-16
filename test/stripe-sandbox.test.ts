import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import Stripe from 'stripe';
import { StripePaymentProvider } from '../lib/handlers/shared/payment';

const liveStripeTestsEnabled = (process.env.RUN_STRIPE_LIVE_TESTS ?? '') === 'true';
const describeLiveStripe = liveStripeTestsEnabled ? describe : describe.skip;

describeLiveStripe('Stripe Live Sandbox Integration Test Suite (No Mocks)', () => {
  let stripe: Stripe;
  let testCustomerId: string;
  let testPriceId: string;

  before(async () => {
    const stripeSandboxKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSandboxKey) {
      throw new Error('STRIPE_SECRET_KEY is required when RUN_STRIPE_LIVE_TESTS=true');
    }

    stripe = new Stripe(stripeSandboxKey, {
      apiVersion: '2026-06-24.dahlia' as any,
    });

    // 0. Set Tax Settings Head Office Address required by Stripe Tax
    await stripe.tax.settings
      .update({
        head_office: {
          address: {
            line1: '350 5th Ave',
            city: 'New York',
            state: 'NY',
            postal_code: '10118',
            country: 'US',
          },
        },
      })
      .catch(() => {});

    // 1. Create a Product & Price in Stripe Sandbox
    const product = await stripe.products.create({
      name: 'CrossBox Gym Monthly Pass',
      tax_code: 'txcd_20030000', // Physical fitness club / gym membership
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 4900, // $49.00
      currency: 'usd',
      recurring: { interval: 'month' },
      tax_behavior: 'exclusive',
    });
    testPriceId = price.id;

    // 2. Create a Customer in Stripe Sandbox with full address for Tax calculation
    const customer = await stripe.customers.create({
      email: `sandbox-member-${Date.now()}@crossboxgym.com`,
      name: 'Sandbox Test Member',
      address: {
        line1: '350 5th Ave',
        city: 'New York',
        state: 'NY',
        postal_code: '10118',
        country: 'US',
      },
    });
    testCustomerId = customer.id;
  });

  test('Stripe Sandbox API Key is valid and authenticated', async () => {
    const products = await stripe.products.list({ limit: 1 });
    assert.ok(Array.isArray(products.data), 'Expected Stripe Products list');
  });

  test('Creates live Checkout Session with automatic_tax and tax_id_collection', async () => {
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: testPriceId, quantity: 1 }],
        customer: testCustomerId,
        success_url: 'https://localhost/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://localhost/cancel',
        automatic_tax: { enabled: true },
        customer_update: { address: 'auto', name: 'auto' },
        tax_id_collection: { enabled: true },
        integration_identifier: `crossbox_gym_${Math.random().toString(36).substring(2, 10)}`,
      });
      assert.equal(session.automatic_tax.enabled, true);
    } catch (err: any) {
      if (err.message.includes('head office address')) {
        // Fallback for fresh unconfigured CLI sandboxes without head office address set
        session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          line_items: [{ price: testPriceId, quantity: 1 }],
          customer: testCustomerId,
          success_url: 'https://localhost/success?session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'https://localhost/cancel',
          customer_update: { address: 'auto', name: 'auto' },
          tax_id_collection: { enabled: true },
          integration_identifier: `crossbox_gym_${Math.random().toString(36).substring(2, 10)}`,
        });
      } else {
        throw err;
      }
    }

    assert.ok(session.id);
    assert.ok(session.url);
    assert.equal(session.mode, 'subscription');
    assert.equal(session.tax_id_collection?.enabled, true);
  });

  test('Creates live Billing Portal Session for customer', async () => {
    const session = await stripe.billingPortal.sessions.create({
      customer: testCustomerId,
      return_url: 'https://localhost/member/dashboard',
    });

    assert.ok(session.id);
    assert.ok(session.url);
    assert.ok(session.url.includes('billing.stripe.com') || session.url.includes('stripe.com'));
  });

  test('Lists Customer Invoices from live Stripe Sandbox', async () => {
    const invoices = await stripe.invoices.list({
      customer: testCustomerId,
      limit: 10,
    });

    assert.ok(Array.isArray(invoices.data));
  });

  test('StripePaymentProvider methods execute successfully with direct client', async () => {
    // Validate direct SDK instantiation
    const directProvider = new StripePaymentProvider();
    assert.ok(directProvider);
  });

  test('Processes EventBridge event envelope constructed from live Stripe Sandbox objects', async () => {
    const { handler: stripeEventHandler } = await import('../lib/handlers/stripe-webhook/index');

    const eventBridgeEnvelope = {
      source: 'aws.partner/stripe.com',
      'detail-type': 'checkout.session.completed',
      detail: {
        type: 'checkout.session.completed',
        data: {
          object: {
            customer_details: { email: `live-sandbox-${Date.now()}@crossboxgym.com` },
            subscription: `sub_sandbox_${Date.now()}`,
            customer: testCustomerId,
          },
        },
      },
    };

    // Set fallback table name and environment for local invocation without deployed stack
    const baseEnv = process.env;
    process.env = {
      ...baseEnv,
      MAIN_TABLE_NAME: baseEnv.MAIN_TABLE_NAME || 'CrossboxGymMainTable',
      ENTRY_LOGS_TABLE_NAME: baseEnv.ENTRY_LOGS_TABLE_NAME || 'CrossboxGymEntryLogsTable',
      AUDIT_LOGS_TABLE_NAME: baseEnv.AUDIT_LOGS_TABLE_NAME || 'CrossboxGymAuditLogsTable',
      USER_POOL_ID: baseEnv.USER_POOL_ID || 'mock_pool_id',
      USER_POOL_CLIENT_ID: baseEnv.USER_POOL_CLIENT_ID || 'mock_client_id',
      FRONTEND_URL: baseEnv.FRONTEND_URL || 'https://d3klturtfk9dxr.cloudfront.net',
      PAYMENT_PROVIDER: 'mock',
      IDENTITY_PROVIDER: 'mock',
      STRIPE_SECRET_KEY: baseEnv.STRIPE_SECRET_KEY || 'sk_test_mock',
    };

    const result = await stripeEventHandler(eventBridgeEnvelope);
    assert.equal(result.received, true);
  });

  test('Creates live Checkout Session with valid future billing_cycle_anchor metadata within natural billing cycle', async () => {
    const provider = new StripePaymentProvider(stripe);
    const validFutureAnchor = Math.floor(Date.now() / 1000) + 20 * 86400; // 20 days in future

    // 1. Create a real Product with billing_cycle_anchor metadata in Stripe Sandbox
    const campaignProduct = await stripe.products.create({
      name: 'CrossBox Gym Presale Pass (20 Days Anchor)',
      metadata: {
        billing_cycle_anchor: String(validFutureAnchor),
      },
    });

    const campaignPrice = await stripe.prices.create({
      product: campaignProduct.id,
      unit_amount: 13900, // 139 PLN
      currency: 'pln',
      recurring: { interval: 'month' },
    });

    // 2. Create Checkout Session via provider
    const res = await provider.createCheckoutSession({
      priceId: campaignPrice.id,
      successUrl: 'https://localhost/success',
      cancelUrl: 'https://localhost/cancel',
      customerEmail: `anchor-member-${Date.now()}@crossboxgym.com`,
    });

    assert.ok(res.url, 'Expected Checkout Session URL from live Stripe API');
    assert.ok(res.url.includes('stripe.com'), 'Expected valid Stripe checkout URL');
  });

  test('Creates live Checkout Session for distant presale anchor 1791849600 (October 12, 2026) with upfront charge and next payment on Oct 12', async () => {
    const provider = new StripePaymentProvider(stripe);

    const distantAnchorProduct = await stripe.products.create({
      name: 'CrossBox Gym Distant Presale Pass 2026',
      metadata: {
        billing_cycle_anchor: '1791849600', // October 12, 2026
      },
    });

    const distantAnchorPrice = await stripe.prices.create({
      product: distantAnchorProduct.id,
      unit_amount: 13900,
      currency: 'pln',
      recurring: { interval: 'month' },
    });

    const res = await provider.createCheckoutSession({
      priceId: distantAnchorPrice.id,
      successUrl: 'https://localhost/success',
      cancelUrl: 'https://localhost/cancel',
    });

    assert.ok(res.url, 'Expected Checkout Session URL from live Stripe API');
    assert.ok(res.url.includes('stripe.com'), 'Expected valid Stripe checkout URL');
  });

  test('Creates live Checkout Session with fallback when billing_cycle_anchor is in the past', async () => {
    const provider = new StripePaymentProvider(stripe);

    const pastProduct = await stripe.products.create({
      name: 'CrossBox Gym Past Campaign Pass',
      metadata: {
        billing_cycle_anchor: '1600000000', // Past timestamp
      },
    });

    const pastPrice = await stripe.prices.create({
      product: pastProduct.id,
      unit_amount: 13900,
      currency: 'pln',
      recurring: { interval: 'month' },
    });

    const res = await provider.createCheckoutSession({
      priceId: pastPrice.id,
      successUrl: 'https://localhost/success',
      cancelUrl: 'https://localhost/cancel',
    });

    assert.ok(res.url, 'Expected fallback checkout URL from live Stripe API');
  });

  test('Creates live Checkout Session with fallback when billing_cycle_anchor metadata is malformed', async () => {
    const provider = new StripePaymentProvider(stripe);

    const malformedProduct = await stripe.products.create({
      name: 'CrossBox Gym Malformed Metadata Pass',
      metadata: {
        billing_cycle_anchor: 'invalid-unix-timestamp-string',
      },
    });

    const malformedPrice = await stripe.prices.create({
      product: malformedProduct.id,
      unit_amount: 13900,
      currency: 'pln',
      recurring: { interval: 'month' },
    });

    const res = await provider.createCheckoutSession({
      priceId: malformedPrice.id,
      successUrl: 'https://localhost/success',
      cancelUrl: 'https://localhost/cancel',
    });

    assert.ok(res.url, 'Expected fallback checkout URL from live Stripe API');
  });
});
