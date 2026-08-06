export interface PaymentProvider {
  createCheckoutSession(params: {
    priceId?: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
    enableTax?: boolean;
  }): Promise<{ url: string }>;

  createPortalSession(params: { customerId: string; returnUrl: string }): Promise<{ url: string }>;

  listInvoices(params: { customerId: string }): Promise<
    Array<{
      id: string;
      number: string | null;
      pdfUrl: string | null;
      total: number;
      tax: number;
      currency: string;
      status: string | null;
      createdAt: string;
    }>
  >;
}
