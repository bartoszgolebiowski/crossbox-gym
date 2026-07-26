import { PaymentProvider } from '../types';

export class MockPaymentProvider implements PaymentProvider {
  async createCheckoutSession(params: any): Promise<{ url: string }> {
    return { url: 'https://mock.stripe.com/checkout' };
  }
  
  async createPortalSession(params: any): Promise<{ url: string }> {
    return { url: 'https://mock.stripe.com/portal' };
  }

  async listInvoices(params: { customerId: string }): Promise<Array<any>> {
    return [
      {
        id: 'in_mock_123',
        number: 'INV-2026-001',
        pdfUrl: 'https://mock.stripe.com/invoice/INV-2026-001.pdf',
        total: 4900,
        tax: 916,
        currency: 'usd',
        status: 'paid',
        createdAt: new Date().toISOString()
      }
    ];
  }
  
  async constructWebhookEvent(payload: string, signature: string): Promise<any> {
    // Basic mock parser
    return JSON.parse(payload);
  }
}
