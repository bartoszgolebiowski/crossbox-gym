import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { StripePaymentProvider, MockPaymentProvider } from '../lib/handlers/shared/payment';

describe('Deferred Subscription Billing Anchor Tests', () => {
  test('MockPaymentProvider parses valid future billing_cycle_anchor from metadata', async () => {
    const provider = new MockPaymentProvider();
    const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days in future

    const result = await provider.createCheckoutSession({
      priceId: 'price_presale_139',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
      metadata: {
        billing_cycle_anchor: String(futureTimestamp),
      },
    });

    assert.equal(result.url, 'https://mock.stripe.com/checkout');
    assert.equal(result.billingCycleAnchor, futureTimestamp);
  });

  test('MockPaymentProvider parses explicit campaign anchor 1791849600 (October 12, 2026)', async () => {
    const provider = new MockPaymentProvider();
    const campaignTimestamp = 1791849600; // October 12, 2026 00:00:00 UTC

    const result = await provider.createCheckoutSession({
      priceId: 'price_presale_139',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
      metadata: {
        billing_cycle_anchor: String(campaignTimestamp),
      },
    });

    assert.equal(result.url, 'https://mock.stripe.com/checkout');
    assert.equal(result.billingCycleAnchor, campaignTimestamp);
  });

  test('MockPaymentProvider ignores past billing_cycle_anchor from metadata', async () => {
    const provider = new MockPaymentProvider();
    const pastTimestamp = Math.floor(Date.now() / 1000) - 86400 * 5; // 5 days in past

    const result = await provider.createCheckoutSession({
      priceId: 'price_presale_139',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
      metadata: {
        billing_cycle_anchor: String(pastTimestamp),
      },
    });

    assert.equal(result.url, 'https://mock.stripe.com/checkout');
    assert.equal(result.billingCycleAnchor, undefined);
  });

  test('StripePaymentProvider uses standard normal subscription flow when product has NO billing_cycle_anchor metadata', async () => {
    let capturedSessionParams: any = null;

    const mockStripe: any = {
      prices: {
        retrieve: async (_priceId: string, _opts: any) => ({
          id: 'price_standard_169',
          unit_amount: 16900,
          currency: 'pln',
          product: {
            id: 'prod_standard_169',
            name: 'Karnet Standardowy 24/7',
            metadata: {}, // NO billing_cycle_anchor metadata!
          },
        }),
      },
      checkout: {
        sessions: {
          create: async (params: any) => {
            capturedSessionParams = params;
            return { url: 'https://checkout.stripe.com/c/pay/cs_test_standard' };
          },
        },
      },
    };

    const provider = new StripePaymentProvider(mockStripe);
    const res = await provider.createCheckoutSession({
      priceId: 'price_standard_169',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    });

    assert.equal(res.url, 'https://checkout.stripe.com/c/pay/cs_test_standard');
    assert.ok(capturedSessionParams);
    assert.equal(capturedSessionParams.line_items.length, 1);
    assert.equal(capturedSessionParams.line_items[0].price, 'price_standard_169');
    assert.equal(capturedSessionParams.subscription_data, undefined); // Normal flow!
  });

  test('StripePaymentProvider sets subscription_data.billing_cycle_anchor when product metadata has valid future timestamp within natural cycle', async () => {
    const validFutureAnchor = Math.floor(Date.now() / 1000) + 20 * 86400; // 20 days in future
    let capturedSessionParams: any = null;

    const mockStripe: any = {
      prices: {
        retrieve: async (_priceId: string, _opts: any) => ({
          id: 'price_test_123',
          product: {
            id: 'prod_campaign_123',
            metadata: {
              billing_cycle_anchor: String(validFutureAnchor),
            },
          },
        }),
      },
      checkout: {
        sessions: {
          create: async (params: any) => {
            capturedSessionParams = params;
            return { url: 'https://checkout.stripe.com/c/pay/cs_test_123' };
          },
        },
      },
    };

    const provider = new StripePaymentProvider(mockStripe);
    const res = await provider.createCheckoutSession({
      priceId: 'price_test_123',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
      customerEmail: 'customer@example.com',
    });

    assert.equal(res.url, 'https://checkout.stripe.com/c/pay/cs_test_123');
    assert.ok(capturedSessionParams);
    assert.equal(capturedSessionParams.subscription_data?.billing_cycle_anchor, validFutureAnchor);
    assert.equal(capturedSessionParams.subscription_data?.proration_behavior, 'none');
  });

  test('StripePaymentProvider configures upfront charge and trial_end for distant presale anchor (1791849600 / October 12, 2026)', async () => {
    const campaignTimestamp = 1791849600; // October 12, 2026
    let capturedSessionParams: any = null;

    const mockStripe: any = {
      prices: {
        retrieve: async (_priceId: string, _opts: any) => ({
          id: 'price_test_123',
          unit_amount: 13900,
          currency: 'pln',
          product: {
            id: 'prod_campaign_123',
            name: 'Karnet Przedsprzedażowy',
            description: 'Karnet z premierą 12 października',
            metadata: {
              billing_cycle_anchor: String(campaignTimestamp),
            },
          },
        }),
      },
      checkout: {
        sessions: {
          create: async (params: any) => {
            capturedSessionParams = params;
            return { url: 'https://checkout.stripe.com/c/pay/cs_test_123' };
          },
        },
      },
    };

    const provider = new StripePaymentProvider(mockStripe);
    const res = await provider.createCheckoutSession({
      priceId: 'price_test_123',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    });

    assert.equal(res.url, 'https://checkout.stripe.com/c/pay/cs_test_123');
    assert.ok(capturedSessionParams);
    assert.equal(capturedSessionParams.line_items.length, 2);
    assert.equal(capturedSessionParams.line_items[0].price_data?.unit_amount, 13900); // Upfront payment today
    assert.equal(capturedSessionParams.subscription_data?.trial_end, campaignTimestamp); // Next charge on Oct 12, 2026
  });

  test('StripePaymentProvider falls back to standard billing when billing_cycle_anchor is in the past', async () => {
    const pastTimestamp = Math.floor(Date.now() / 1000) - 86400 * 10; // 10 days in past
    let capturedSessionParams: any = null;

    const mockStripe: any = {
      prices: {
        retrieve: async (_priceId: string, _opts: any) => ({
          id: 'price_test_123',
          product: {
            id: 'prod_campaign_123',
            metadata: {
              billing_cycle_anchor: String(pastTimestamp),
            },
          },
        }),
      },
      checkout: {
        sessions: {
          create: async (params: any) => {
            capturedSessionParams = params;
            return { url: 'https://checkout.stripe.com/c/pay/cs_test_123' };
          },
        },
      },
    };

    const provider = new StripePaymentProvider(mockStripe);
    const res = await provider.createCheckoutSession({
      priceId: 'price_test_123',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    });

    assert.equal(res.url, 'https://checkout.stripe.com/c/pay/cs_test_123');
    assert.ok(capturedSessionParams);
    assert.equal(capturedSessionParams.subscription_data, undefined);
  });

  test('StripePaymentProvider falls back to standard billing when billing_cycle_anchor is malformed', async () => {
    let capturedSessionParams: any = null;

    const mockStripe: any = {
      prices: {
        retrieve: async (_priceId: string, _opts: any) => ({
          id: 'price_test_123',
          product: {
            id: 'prod_campaign_123',
            metadata: {
              billing_cycle_anchor: 'invalid-date-string',
            },
          },
        }),
      },
      checkout: {
        sessions: {
          create: async (params: any) => {
            capturedSessionParams = params;
            return { url: 'https://checkout.stripe.com/c/pay/cs_test_123' };
          },
        },
      },
    };

    const provider = new StripePaymentProvider(mockStripe);
    const res = await provider.createCheckoutSession({
      priceId: 'price_test_123',
      successUrl: 'https://app.example.com/success',
      cancelUrl: 'https://app.example.com/cancel',
    });

    assert.equal(res.url, 'https://checkout.stripe.com/c/pay/cs_test_123');
    assert.ok(capturedSessionParams);
    assert.equal(capturedSessionParams.subscription_data, undefined);
  });
});
