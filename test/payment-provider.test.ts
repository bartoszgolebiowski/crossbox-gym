import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MockPaymentProvider, StripePaymentProvider, createPaymentProvider } from '../lib/handlers/shared/payment';

describe('Stripe Payment Service & Provider Unit Tests (No Deployment Required)', () => {
  test('createPaymentProvider creates MockPaymentProvider when type is "mock"', () => {
    const provider = createPaymentProvider('mock');
    assert.ok(provider instanceof MockPaymentProvider);
  });

  test('createPaymentProvider creates StripePaymentProvider when type is "stripe"', () => {
    const provider = createPaymentProvider('stripe');
    assert.ok(provider instanceof StripePaymentProvider);
  });

  test('MockPaymentProvider.createCheckoutSession returns session URL', async () => {
    const provider = createPaymentProvider('mock');
    const res = await provider.createCheckoutSession({
      priceId: 'price_test_123',
      successUrl: 'https://localhost/success',
      cancelUrl: 'https://localhost/cancel',
      customerEmail: 'member@example.com',
      enableTax: true,
    });

    assert.ok(res.url);
    assert.equal(typeof res.url, 'string');
  });

  test('MockPaymentProvider.createPortalSession returns portal URL', async () => {
    const provider = createPaymentProvider('mock');
    const res = await provider.createPortalSession({
      customerId: 'cus_mock_123',
      returnUrl: 'https://localhost/dashboard',
    });

    assert.ok(res.url);
  });

  test('MockPaymentProvider.listInvoices returns structured tax & invoice details', async () => {
    const provider = createPaymentProvider('mock');
    const invoices = await provider.listInvoices({ customerId: 'cus_mock_123' });

    assert.ok(Array.isArray(invoices));
    assert.ok(invoices.length > 0);

    const firstInv = invoices[0];
    assert.ok(firstInv.id);
    assert.ok(firstInv.number);
    assert.ok(firstInv.pdfUrl);
    assert.equal(typeof firstInv.total, 'number');
    assert.equal(typeof firstInv.tax, 'number');
    assert.equal(firstInv.status, 'paid');
  });
});
