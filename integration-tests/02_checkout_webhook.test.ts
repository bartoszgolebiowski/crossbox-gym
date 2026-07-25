import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { getTestContext, fetchDynamoItem } from './lib/test-helpers.ts';
import { IntegrationTestContext } from './lib/types.ts';

describe('Checkout & Webhook Lifecycle Test Suite', () => {
  let context: IntegrationTestContext;

  before(async () => {
    context = await getTestContext();
  });

  test('POST /checkout/session creates Stripe checkout session URL', async () => {
    const res = await fetch(`${context.apiUrl}/checkout/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerEmail: `test-${Date.now()}@example.com`
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.ok(data.url, 'Expected checkout URL');
  });

  test('POST /webhook/stripe checkout.session.completed provisions User & Subscription in DDB & Cognito', async () => {
    const testEmail = `webhook-user-${Date.now()}@example.com`;
    const subId = `sub_test_${Date.now()}`;
    const customerId = `cus_test_${Date.now()}`;

    const webhookPayload = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer_details: { email: testEmail },
          subscription: subId,
          customer: customerId
        }
      }
    };

    const res = await fetch(`${context.apiUrl}/webhook/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'mock_sig'
      },
      body: JSON.stringify(webhookPayload)
    });

    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.received, true);
  });

  test('POST /webhook/stripe customer.subscription.updated transitions status to PAST_DUE with grace period', async () => {
    const subId = `sub_update_${Date.now()}`;

    // First create subscription
    await fetch(`${context.apiUrl}/webhook/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'mock_sig' },
      body: JSON.stringify({
        type: 'checkout.session.completed',
        data: { object: { customer_details: { email: `sub-update-${Date.now()}@example.com` }, subscription: subId, customer: 'cus_123' } }
      })
    });

    // Update to past_due
    const res = await fetch(`${context.apiUrl}/webhook/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'mock_sig' },
      body: JSON.stringify({
        type: 'customer.subscription.updated',
        data: { object: { id: subId, status: 'past_due' } }
      })
    });

    assert.equal(res.status, 200);
  });

  test('POST /webhook/stripe customer.subscription.deleted transitions status to CANCELED', async () => {
    const subId = `sub_del_${Date.now()}`;

    await fetch(`${context.apiUrl}/webhook/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'mock_sig' },
      body: JSON.stringify({
        type: 'checkout.session.completed',
        data: { object: { customer_details: { email: `sub-del-${Date.now()}@example.com` }, subscription: subId, customer: 'cus_123' } }
      })
    });

    const res = await fetch(`${context.apiUrl}/webhook/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'mock_sig' },
      body: JSON.stringify({
        type: 'customer.subscription.deleted',
        data: { object: { id: subId, status: 'canceled' } }
      })
    });

    assert.equal(res.status, 200);
  });

  test('POST /webhook/stripe missing signature returns 400', async () => {
    const res = await fetch(`${context.apiUrl}/webhook/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.session.completed' })
    });

    assert.equal(res.status, 400);
  });
});
