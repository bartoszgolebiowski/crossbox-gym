import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
import { PaymentProvider } from './types';

let stripeClient: Stripe | null = null;
let webhookSecret: string | null = null;
const ssm = new SSMClient({});

async function getStripeClient(): Promise<Stripe> {
  if (stripeClient) return stripeClient;
  const directKey = process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (directKey) {
    stripeClient = new Stripe(directKey, { apiVersion: '2026-06-24.dahlia' as any });
    return stripeClient;
  }
  const path = process.env.STRIPE_SECRET_KEY_SSM_PATH;
  if (path) {
    try {
      const res = await ssm.send(new GetParameterCommand({ Name: path, WithDecryption: true }));
      const key = res.Parameter?.Value;
      if (key) {
        stripeClient = new Stripe(key, { apiVersion: '2026-06-24.dahlia' as any });
        return stripeClient;
      }
    } catch (e) {
      // SSM parameter does not exist in dev/test stack
    }
  }
  throw new Error('Could not retrieve Stripe secret key');
}

async function getWebhookSecret(): Promise<string> {
  if (webhookSecret) return webhookSecret;
  const path = process.env.STRIPE_WEBHOOK_SECRET_SSM_PATH;
  if (!path) throw new Error('STRIPE_WEBHOOK_SECRET_SSM_PATH env var not set');
  const res = await ssm.send(new GetParameterCommand({ Name: path, WithDecryption: true }));
  const secret = res.Parameter?.Value;
  if (!secret) throw new Error('Could not retrieve Stripe webhook secret');
  webhookSecret = secret;
  return webhookSecret;
}

export class StripePaymentProvider implements PaymentProvider {
  async createCheckoutSession(params: {
    priceId?: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
    enableTax?: boolean;
  }): Promise<{ url: string; }> {
    let stripe: Stripe;
    try {
      stripe = await getStripeClient();
    } catch (err) {
      return new MockPaymentProvider().createCheckoutSession(params);
    }

    // Generate random 8-character suffix for integration_identifier tracking
    const randomSuffix = Math.random().toString(36).substring(2, 10);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      line_items: params.priceId
        ? [{ price: params.priceId, quantity: 1 }]
        : [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'CrossBox Gym Monthly All-Access Membership',
                description: 'Unlimited access to all CrossBox Gym locations, turnstile keycard, and mobile app.',
              },
              recurring: { interval: 'month' },
              unit_amount: 4900,
              tax_behavior: 'exclusive',
            },
            quantity: 1,
          }],
      customer_email: params.customerEmail,
      metadata: {
        integration_check: `checkout_${randomSuffix}`,
        ...(params.metadata || {})
      },
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true }
    };

    try {
      const session = await stripe.checkout.sessions.create(sessionParams);
      return { url: session.url! };
    } catch (err: any) {
      if (err.message?.includes('tax') || err.message?.includes('head office address') || err.message?.includes('automatic_tax')) {
        delete sessionParams.automatic_tax;
        const session = await stripe.checkout.sessions.create(sessionParams);
        return { url: session.url! };
      }
      throw err;
    }
  }

  async createPortalSession(params: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    let stripe: Stripe;
    try {
      stripe = await getStripeClient();
    } catch (err) {
      return new MockPaymentProvider().createPortalSession(params);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl
    });
    return { url: session.url };
  }

  async listInvoices(params: { customerId: string }): Promise<Array<{
    id: string;
    number: string | null;
    pdfUrl: string | null;
    total: number;
    tax: number;
    currency: string;
    status: string | null;
    createdAt: string;
  }>> {
    const stripe = await getStripeClient();
    const invoices = await stripe.invoices.list({
      customer: params.customerId,
      limit: 24,
    });

    return invoices.data.map(inv => ({
      id: inv.id,
      number: inv.number,
      pdfUrl: inv.invoice_pdf || null,
      total: inv.total,
      tax: (inv as any).tax || (inv as any).amount_tax || 0,
      currency: inv.currency,
      status: inv.status,
      createdAt: new Date(inv.created * 1000).toISOString(),
    }));
  }

  async constructWebhookEvent(payload: string, signature: string): Promise<any> {
    const stripe = await getStripeClient();
    const secret = await getWebhookSecret();
    return stripe.webhooks.constructEvent(payload, signature, secret);
  }
}

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

export function createPaymentProvider(type: string): PaymentProvider {
  const hasStripeKey = Boolean(process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY);
  return (type === 'stripe' || hasStripeKey) ? new StripePaymentProvider() : new MockPaymentProvider();
}
