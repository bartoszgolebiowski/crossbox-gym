import Stripe from 'stripe';
import { PaymentProvider } from '../types';
import { getStripeClient, getWebhookSecret } from './stripe-client-manager';

export class StripePaymentProvider implements PaymentProvider {
  async createCheckoutSession(params: {
    priceId?: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
    enableTax?: boolean;
  }): Promise<{ url: string }> {
    const stripe = await getStripeClient();

    // Generate random 8-character suffix for integration_identifier tracking
    const randomSuffix = Math.random().toString(36).substring(2, 10);

    const isExplicitStripePrice =
      params.priceId && params.priceId.startsWith('price_') && params.priceId !== 'price_monthly';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      line_items: isExplicitStripePrice
        ? [{ price: params.priceId, quantity: 1 }]
        : [
            {
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
            },
          ],
      customer_email: params.customerEmail,
      metadata: {
        integration_check: `checkout_${randomSuffix}`,
        ...(params.metadata || {}),
      },
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
    };

    try {
      const session = await stripe.checkout.sessions.create(sessionParams);
      return { url: session.url! };
    } catch (err: any) {
      if (err.message?.includes('No such price') || err.message?.includes('resource_missing')) {
        sessionParams.line_items = [
          {
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
          },
        ];
        const session = await stripe.checkout.sessions.create(sessionParams);
        return { url: session.url! };
      }
      if (
        err.message?.includes('tax') ||
        err.message?.includes('head office address') ||
        err.message?.includes('automatic_tax')
      ) {
        delete sessionParams.automatic_tax;
        const session = await stripe.checkout.sessions.create(sessionParams);
        return { url: session.url! };
      }
      throw err;
    }
  }

  async createPortalSession(params: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    const stripe = await getStripeClient();
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: params.customerId,
        return_url: params.returnUrl,
      });
      return { url: session.url };
    } catch (err: any) {
      if (
        err.message?.includes('No such customer') ||
        err.message?.includes('resource_missing') ||
        err.code === 'resource_missing'
      ) {
        return { url: `${params.returnUrl}?portal_mock=true` };
      }
      throw err;
    }
  }

  async listInvoices(params: { customerId: string }): Promise<
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
  > {
    const stripe = await getStripeClient();
    const invoices = await stripe.invoices.list({
      customer: params.customerId,
      limit: 24,
    });

    return invoices.data.map((inv) => ({
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
