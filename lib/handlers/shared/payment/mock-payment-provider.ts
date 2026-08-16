import { PaymentProvider, StripeProductPrice } from './types';

export class MockPaymentProvider implements PaymentProvider {
  public lastCheckoutSessionParams?: any;

  async createCheckoutSession(params: any): Promise<{ url: string; billingCycleAnchor?: number }> {
    this.lastCheckoutSessionParams = params;

    let billingCycleAnchor: number | undefined;
    const products = await this.listProducts();
    const targetProduct = products.find((p) => p.id === params.priceId);
    const rawAnchor = targetProduct?.metadata?.billing_cycle_anchor || params.metadata?.billing_cycle_anchor;

    if (rawAnchor) {
      const trimmedAnchor = String(rawAnchor).trim();
      const parsedAnchor = parseInt(trimmedAnchor, 10);
      const nowInSeconds = Math.floor(Date.now() / 1000);

      if (!isNaN(parsedAnchor) && /^\d+$/.test(trimmedAnchor) && parsedAnchor > nowInSeconds) {
        billingCycleAnchor = parsedAnchor;
      }
    }

    return {
      url: 'https://mock.stripe.com/checkout',
      ...(billingCycleAnchor ? { billingCycleAnchor } : {}),
    };
  }

  async createPortalSession(_params: any): Promise<{ url: string }> {
    return { url: 'https://mock.stripe.com/portal' };
  }

  async listInvoices(_params: { customerId: string }): Promise<Array<any>> {
    return [
      {
        id: 'in_mock_123',
        number: 'INV-2026-001',
        pdfUrl: 'https://mock.stripe.com/invoice/INV-2026-001.pdf',
        total: 4900,
        tax: 916,
        currency: 'usd',
        status: 'paid',
        createdAt: new Date().toISOString(),
      },
    ];
  }

  async listProducts(): Promise<StripeProductPrice[]> {
    return [
      {
        id: 'price_presale_139',
        productId: 'prod_presale',
        name: 'Karnet Przedsprzedażowy 24/7',
        description: 'Całodobowy dostęp w gwarantowanej promocyjnej cenie 139 zł/miesiąc.',
        unitAmount: 13900,
        currency: 'pln',
        interval: 'month',
        metadata: { badge: 'Przedsprzedaż' },
      },
      {
        id: 'price_standard_169',
        productId: 'prod_standard',
        name: 'Karnet Standardowy 24/7',
        description: 'Standardowa subskrypcja z nielimitowanym dostępem 24/7.',
        unitAmount: 16900,
        currency: 'pln',
        interval: 'month',
        metadata: { badge: 'Standard' },
      },
    ];
  }
}
