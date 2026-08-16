import assert from 'node:assert/strict';
import test from 'node:test';
import { CheckoutService } from '../lib/handlers/checkout/service';
import { PaymentProvider } from '../lib/handlers/shared/payment';

class FakePaymentProvider implements PaymentProvider {
  checkoutRequest?: Parameters<PaymentProvider['createCheckoutSession']>[0];

  async createCheckoutSession(
    params: Parameters<PaymentProvider['createCheckoutSession']>[0]
  ): Promise<{ url: string }> {
    this.checkoutRequest = params;
    return { url: 'https://payments.example.test/checkout' };
  }

  async createPortalSession(): Promise<{ url: string }> {
    return { url: 'https://payments.example.test/portal' };
  }

  async listInvoices() {
    return [];
  }

  async listProducts() {
    return [
      {
        id: 'price_test_1',
        productId: 'prod_test_1',
        name: 'Test Membership',
        description: 'Test Description',
        unitAmount: 10000,
        currency: 'pln',
        interval: 'month',
        metadata: {},
      },
    ];
  }
}

test('CheckoutService resolves return routes from configured frontend URL', async () => {
  const paymentProvider = new FakePaymentProvider();
  const service = new CheckoutService(paymentProvider, 'https://app.example.test/');

  const session = await service.createSession({ customerEmail: 'member@example.test', priceId: 'price_123' });

  assert.equal(session.url, 'https://payments.example.test/checkout');
  assert.deepEqual(paymentProvider.checkoutRequest, {
    customerEmail: 'member@example.test',
    priceId: 'price_123',
    successUrl: 'https://app.example.test/checkout/success',
    cancelUrl: 'https://app.example.test/checkout/cancel',
  });
});

test('CheckoutService derives checkout routes from an explicit redirect URL', async () => {
  const paymentProvider = new FakePaymentProvider();
  const service = new CheckoutService(paymentProvider, 'https://app.example.test');

  await service.createSession({ redirectUrl: 'https://partner.example.test/return/' });

  assert.equal(paymentProvider.checkoutRequest?.successUrl, 'https://partner.example.test/return/checkout/success');
  assert.equal(paymentProvider.checkoutRequest?.cancelUrl, 'https://partner.example.test/return/checkout/cancel');
});

test('CheckoutService.getProducts returns products from payment provider', async () => {
  const paymentProvider = new FakePaymentProvider();
  const service = new CheckoutService(paymentProvider, 'https://app.example.test');

  const products = await service.getProducts();
  assert.equal(products.length, 1);
  assert.equal(products[0].id, 'price_test_1');
  assert.equal(products[0].name, 'Test Membership');
});
