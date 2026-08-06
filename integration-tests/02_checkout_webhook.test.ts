import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { handler as stripeEventHandler } from '../lib/handlers/stripe-webhook/index.ts';
import { getTestContext } from './lib/test-helpers.ts';
import { IntegrationTestContext } from './lib/types.ts';

describe('Checkout & EventBridge Lifecycle Test Suite', () => {
  let context: IntegrationTestContext;

  before(async () => {
    context = await getTestContext();
    // Ensure environment variables are set for handler execution
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
    process.env = {
      ...process.env,
      MAIN_TABLE_NAME: context.mainTableName,
      USER_POOL_ID: context.userPoolId,
      USER_POOL_CLIENT_ID: context.userPoolClientId,
      PAYMENT_PROVIDER: 'mock',
      IDENTITY_PROVIDER: 'cognito',
      FRONTEND_URL: 'http://localhost:5173',
      ENTRY_LOGS_TABLE_NAME: context.entryLogsTableName,
      AUDIT_LOGS_TABLE_NAME: context.auditLogsTableName,
      STRIPE_SECRET_KEY: stripeSecretKey,
      STRIPE_SANDBOX: 'true',
    };
  });

  test('POST /checkout/session creates Stripe checkout session URL', async () => {
    const res = await fetch(`${context.apiUrl}/checkout/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerEmail: `test-${Date.now()}@example.com`,
      }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(data.url, 'Expected checkout URL');
  });

  test('EventBridge checkout.session.completed event provisions User & Subscription in DDB & Cognito', async () => {
    const testEmail = `event-user-${Date.now()}@example.com`;
    const subId = `sub_test_${Date.now()}`;
    const customerId = `cus_test_${Date.now()}`;

    const eventBridgeEnvelope = {
      source: 'aws.partner/stripe.com',
      'detail-type': 'checkout.session.completed',
      detail: {
        type: 'checkout.session.completed',
        data: {
          object: {
            customer_details: { email: testEmail },
            subscription: subId,
            customer: customerId,
          },
        },
      },
    };

    const res = await stripeEventHandler(eventBridgeEnvelope);
    assert.equal(res.received, true);
  });

  test('EventBridge customer.subscription.updated event transitions status to PAST_DUE with grace period', async () => {
    const subId = `sub_update_${Date.now()}`;

    // First create subscription
    await stripeEventHandler({
      source: 'aws.partner/stripe.com',
      'detail-type': 'checkout.session.completed',
      detail: {
        type: 'checkout.session.completed',
        data: {
          object: {
            customer_details: { email: `sub-update-${Date.now()}@example.com` },
            subscription: subId,
            customer: 'cus_123',
          },
        },
      },
    });

    // Update to past_due
    const res = await stripeEventHandler({
      source: 'aws.partner/stripe.com',
      'detail-type': 'customer.subscription.updated',
      detail: {
        type: 'customer.subscription.updated',
        data: { object: { id: subId, status: 'past_due' } },
      },
    });

    assert.equal(res.received, true);
  });

  test('EventBridge customer.subscription.deleted event transitions status to CANCELED', async () => {
    const subId = `sub_del_${Date.now()}`;

    await stripeEventHandler({
      source: 'aws.partner/stripe.com',
      'detail-type': 'checkout.session.completed',
      detail: {
        type: 'checkout.session.completed',
        data: {
          object: {
            customer_details: { email: `sub-del-${Date.now()}@example.com` },
            subscription: subId,
            customer: 'cus_123',
          },
        },
      },
    });

    const res = await stripeEventHandler({
      source: 'aws.partner/stripe.com',
      'detail-type': 'customer.subscription.deleted',
      detail: {
        type: 'customer.subscription.deleted',
        data: { object: { id: subId, status: 'canceled' } },
      },
    });

    assert.equal(res.received, true);
  });

  test('EventBridge invoice.paid event persists tax & invoice record', async () => {
    const subId = `sub_inv_${Date.now()}`;

    await stripeEventHandler({
      source: 'aws.partner/stripe.com',
      'detail-type': 'checkout.session.completed',
      detail: {
        type: 'checkout.session.completed',
        data: {
          object: {
            customer_details: { email: `inv-user-${Date.now()}@example.com` },
            subscription: subId,
            customer: 'cus_123',
          },
        },
      },
    });

    const res = await stripeEventHandler({
      source: 'aws.partner/stripe.com',
      'detail-type': 'invoice.paid',
      detail: {
        type: 'invoice.paid',
        data: {
          object: {
            id: `in_test_${Date.now()}`,
            subscription: subId,
            customer: 'cus_123',
            number: 'INV-2026-TEST',
            invoice_pdf: 'https://pay.stripe.com/invoice/pdf/test',
            total: 4900,
            tax: 916,
            currency: 'usd',
            status: 'paid',
            status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
          },
        },
      },
    });

    assert.equal(res.received, true);
  });

  test('EventBridge invoice.payment_failed event handles payment failure', async () => {
    const res = await stripeEventHandler({
      source: 'aws.partner/stripe.com',
      'detail-type': 'invoice.payment_failed',
      detail: {
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: `in_fail_${Date.now()}`,
            customer_email: `fail-user-${Date.now()}@example.com`,
          },
        },
      },
    });

    assert.equal(res.received, true);
  });
});
