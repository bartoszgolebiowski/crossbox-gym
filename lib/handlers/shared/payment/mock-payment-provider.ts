import { PaymentProvider, StripeProductPrice } from './types';

export class MockPaymentProvider implements PaymentProvider {
  async createCheckoutSession(_params: any): Promise<{ url: string }> {
    return { url: 'https://mock.stripe.com/checkout' };
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
